// PebbleKit JS for Map Face.
//
// Responsibilities:
//   * Host the Clay configuration page.
//   * Resolve the user's location (prioritising fast WiFi / cell-tower
//     positioning, with a Geoapify IP fallback).
//   * Decide hourly whether the map needs to be re-downloaded (only when the
//     user has moved farther than the configured refresh distance).
//   * Download the Geoapify monochrome static map (PNG) and stream it to the
//     watch in chunks over AppMessage.

var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

// UPNG (with pako) lets us decode Geoapify's 24-bit truecolor PNG and
// re-encode it as a palettized indexed PNG, which is the only kind Pebble's
// gbitmap_create_from_png_data() can decode.
var UPNG = require('upng-js');

// The Geoapify map is reduced to 4 brightness levels and recoloured with the
// user's palette, producing a 2-bit (4-colour) indexed PNG: tiny to transfer
// and very cheap for the watch to decode.

// Geoapify burns a (two-line) attribution band onto the bottom of the static
// map. We request the image this many extra pixels taller on each side; the
// watch shifts the image up by the same amount so the band is pushed off the
// bottom edge while the location stays centred. Must exceed the band height.
var ATTR_CROP = 60;

// Geoapify is asked to render the map in 4 well-separated greys
// (0 / 85 / 170 / 255), so a pixel's level is just the nearest of those. The
// thresholds are the midpoints; anti-aliased edge pixels snap to the closest.
// 0 = land/background, 1 = water, 2 = roads, 3 = labels/highlights.
var LEVEL_THRESHOLDS = [43, 128, 213];

// Default map palette (a monochrome ramp matching the classic dark look).
var DEFAULT_MAP_COLORS = [0x000000, 0x555555, 0xAAAAAA, 0xFFFFFF];

// Clay's getSettings() writes a clean, name-keyed, flattened copy of the
// settings here (e.g. { API_KEY: "...", ZOOM: 15 }). The dict it *returns* is
// keyed by numeric message-key IDs for sendAppMessage, so we must read our
// own settings from this localStorage entry, not from that dict.
var CLAY_SETTINGS_KEY = 'clay-settings';
var LAST_FETCH_KEY = 'mapface-lastfetch';
var CHUNK_SIZE = 1000; // bytes of image data per AppMessage

var sending = false;        // a map transfer is in progress
var pendingUpdate = false;  // an update was requested while sending
var pendingForce = false;

// ---------------------------------------------------------------------------
// Serialised AppMessage sender.
//
// PebbleKit JS / AppMessage only handles one outbound message at a time;
// overlapping sends collide and corrupt the data (seen as a flipped byte in
// the streamed PNG). Every outbound message - status, config and image chunks
// alike - goes through this single queue so only one is ever in flight.
// ---------------------------------------------------------------------------
var outQueue = [];
var outBusy = false;

function enqueueSend(dict, onAck, onNack) {
  outQueue.push({ dict: dict, onAck: onAck, onNack: onNack });
  pumpQueue();
}

function pumpQueue() {
  if (outBusy || outQueue.length === 0) { return; }
  outBusy = true;
  var item = outQueue.shift();
  Pebble.sendAppMessage(item.dict, function () {
    outBusy = false;
    if (item.onAck) { item.onAck(); }
    pumpQueue();
  }, function (e) {
    outBusy = false;
    if (item.onNack) { item.onNack(e); }
    pumpQueue();
  });
}

// Mark the current transfer finished and run any update that was requested
// while it was in progress.
function finishSending() {
  sending = false;
  if (pendingUpdate) {
    pendingUpdate = false;
    var f = pendingForce;
    pendingForce = false;
    performUpdate(f);
  }
}

// Per-platform target image size. Unknown/new platforms fall back to the most
// common Pebble screen size.
var PLATFORM_SIZES = {
  aplite:  { w: 144, h: 168 },
  basalt:  { w: 144, h: 168 },
  diorite: { w: 144, h: 168 },
  chalk:   { w: 180, h: 180 },
  emery:   { w: 200, h: 228 },
  flint:   { w: 144, h: 168 },
  gabbro:  { w: 260, h: 260 } // round screen
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function defaultSettings() {
  return {
    API_KEY: '',
    LOCATION_MODE: '0',
    FIXED_LAT: '',
    FIXED_LON: '',
    UPDATE_DISTANCE: 500,
    ZOOM: 15,
    SHOW_LABELS: 1,
    MAP_STYLE: 'dark-matter',
    MAP_COLOR_BG: DEFAULT_MAP_COLORS[0],
    MAP_COLOR_1: DEFAULT_MAP_COLORS[1],
    MAP_COLOR_2: DEFAULT_MAP_COLORS[2],
    MAP_COLOR_3: DEFAULT_MAP_COLORS[3]
  };
}

function loadSettings() {
  var base = defaultSettings();
  try {
    var raw = localStorage.getItem(CLAY_SETTINGS_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      for (var k in parsed) {
        if (parsed.hasOwnProperty(k) && parsed[k] !== null &&
            parsed[k] !== undefined) {
          base[k] = parsed[k];
        }
      }
    }
  } catch (e) {
    console.log('Failed to load settings: ' + e);
  }
  return base;
}

function getPlatform() {
  try {
    var info = Pebble.getActiveWatchInfo && Pebble.getActiveWatchInfo();
    if (info && info.platform) { return info.platform; }
  } catch (e) { /* not available */ }
  return 'basalt';
}

function getPlatformSize(platform) {
  var s = PLATFORM_SIZES[platform] || { w: 144, h: 168 };
  // Request extra height so the watch can centre-crop off the attribution band.
  return { w: s.w, h: s.h + 2 * ATTR_CROP };
}

// Build the 4-entry [r,g,b] palette from the user's map colour settings.
function getMapPalette(settings) {
  var keys = ['MAP_COLOR_BG', 'MAP_COLOR_1', 'MAP_COLOR_2', 'MAP_COLOR_3'];
  return keys.map(function (k, i) {
    var v = settings[k];
    if (typeof v !== 'number') { v = DEFAULT_MAP_COLORS[i]; }
    return { r: (v >> 16) & 0xFF, g: (v >> 8) & 0xFF, b: v & 0xFF };
  });
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

// Resolve the location to use. In "follow" mode we prioritise the phone's
// network (WiFi / cell-tower) positioning by disabling high accuracy, which
// is fast and battery friendly; if that fails we fall back to Geoapify's IP
// geolocation.
function resolveLocation(settings, cb) {
  if (String(settings.LOCATION_MODE) === '1') {
    var lat = parseFloat(settings.FIXED_LAT);
    var lon = parseFloat(settings.FIXED_LON);
    if (isFinite(lat) && isFinite(lon)) {
      cb(null, { lat: lat, lon: lon });
    } else {
      cb('Invalid fixed location', null);
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (pos) {
      cb(null, { lat: pos.coords.latitude, lon: pos.coords.longitude });
    },
    function (err) {
      console.log('geolocation failed (' + err.code + '): ' + err.message +
                  ' - falling back to Geoapify IP geolocation');
      ipFallback(settings, cb);
    },
    {
      enableHighAccuracy: false,   // prefer WiFi / cell-tower positioning
      timeout: 15000,
      maximumAge: 30 * 60 * 1000   // accept a position up to 30 min old
    }
  );
}

function ipFallback(settings, cb) {
  if (!settings.API_KEY) { cb('No API key for IP fallback', null); return; }
  var url = 'https://api.geoapify.com/v1/ipinfo?apiKey=' +
            encodeURIComponent(settings.API_KEY);
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function () {
    if (xhr.status !== 200) { cb('IP geolocation HTTP ' + xhr.status, null); return; }
    try {
      var data = JSON.parse(xhr.responseText);
      var loc = data.location || {};
      var lat = loc.latitude !== undefined ? loc.latitude : (data.latitude);
      var lon = loc.longitude !== undefined ? loc.longitude : (data.longitude);
      if (isFinite(lat) && isFinite(lon)) {
        cb(null, { lat: lat, lon: lon });
      } else {
        cb('IP geolocation returned no coordinates', null);
      }
    } catch (e) {
      cb('IP geolocation parse error: ' + e, null);
    }
  };
  xhr.onerror = function () { cb('IP geolocation network error', null); };
  xhr.send();
}

// Great-circle distance in metres.
function haversine(lat1, lon1, lat2, lon2) {
  var R = 6371000;
  var toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad;
  var dLon = (lon2 - lon1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Map URL
// ---------------------------------------------------------------------------

// Canonical greys we force Geoapify to render each semantic layer group as, so
// the phone can bucket pixels into 4 levels deterministically (by nearest of
// 0/85/170/255). These are NOT the final colours - the watch shows the user's
// palette; these are just well-separated markers per layer group.
var GREY_LAND  = '#000000'; // level 0
var GREY_WATER = '#555555'; // level 1
var GREY_ROAD  = '#aaaaaa'; // level 2
var GREY_LABEL = '#ffffff'; // level 3

// Fallback recolour for common OpenMapTiles layer ids if the style JSON can't
// be fetched.
var STYLE_CUSTOM_FALLBACK =
  'water:' + GREY_WATER + '|' +
  'road_motorway:' + GREY_ROAD + '|road_trunk_primary:' + GREY_ROAD + '|' +
  'road_secondary_tertiary:' + GREY_ROAD + '|road_minor:' + GREY_ROAD + '|' +
  'road_service_track:' + GREY_ROAD + '|road_path:' + GREY_ROAD;

// Build a styleCustomization string that paints each layer group as one of the
// four canonical greys (and hides labels when names are off). Driven by the
// style's own layer list so it works regardless of style-specific layer ids.
function buildStyleCustomization(layers, showLabels) {
  var parts = [];
  (layers || []).forEach(function (layer) {
    var id = layer.id;
    if (!id) { return; }
    var type = layer.type;
    var sl = (layer['source-layer'] || '') + ' ' + id;
    var isWater = /water|ocean|river|waterway|lake|sea|bay|strait/i.test(sl);
    var isBoundary = /boundary|admin|border/i.test(sl);

    if (type === 'symbol') {
      parts.push(id + ':' + (showLabels ? GREY_LABEL : 'none'));
    } else if (type === 'background') {
      parts.push(id + ':' + GREY_LAND);
    } else if (isWater) {
      parts.push(id + ':' + GREY_WATER);
    } else if (type === 'line') {
      // A road is drawn as a wide "casing" line plus a narrower "fill" line on
      // top. Colour BOTH (every non-water line) the same road grey so they
      // merge into a solid road surface instead of two thin casing edges.
      parts.push(id + ':' + (isBoundary ? GREY_LAND : GREY_ROAD));
    }
    // Non-water fills (land, landuse, buildings) keep the dark style default,
    // which reads as the darkest level (background).
  });
  return parts.join('|');
}

// Resolve the full styleCustomization (recolour + label visibility) for the
// chosen style. The style JSON is fetched once and cached per style+labels.
function resolveStyleCustomization(settings, cb) {
  var showLabels = !!settings.SHOW_LABELS;
  // The "v" version invalidates caches when the customization logic changes.
  var cacheKey = 'stylecust:v2:' + settings.MAP_STYLE + ':' + (showLabels ? 1 : 0);
  var cached = localStorage.getItem(cacheKey);
  if (cached !== null) { cb(cached); return; }

  var styleUrl = 'https://maps.geoapify.com/v1/styles/' +
    encodeURIComponent(settings.MAP_STYLE) + '/style.json?apiKey=' +
    encodeURIComponent(settings.API_KEY);

  var done = false;
  var finish = function (custom) {
    if (done) { return; }
    done = true;
    try { localStorage.setItem(cacheKey, custom); } catch (e) {}
    cb(custom);
  };

  var xhr = new XMLHttpRequest();
  xhr.open('GET', styleUrl, true);
  xhr.timeout = 15000;
  xhr.onload = function () {
    var custom = STYLE_CUSTOM_FALLBACK;
    try {
      var style = JSON.parse(xhr.responseText);
      var built = buildStyleCustomization(style.layers, showLabels);
      if (built) { custom = built; }
    } catch (e) {
      console.log('style.json parse failed: ' + e);
    }
    finish(custom);
  };
  xhr.onerror = function () {
    console.log('style.json fetch failed; using fallback customization');
    finish(STYLE_CUSTOM_FALLBACK);
  };
  xhr.ontimeout = function () {
    console.log('style.json fetch timed out; using fallback customization');
    finish(STYLE_CUSTOM_FALLBACK);
  };
  xhr.send();
}

function buildMapUrl(settings, loc, size, styleCustomization) {
  var url = 'https://maps.geoapify.com/v1/staticmap' +
    '?style=' + encodeURIComponent(settings.MAP_STYLE || 'dark-matter') +
    '&width=' + size.w +
    '&height=' + size.h +
    '&center=lonlat:' + loc.lon + ',' + loc.lat +
    '&zoom=' + (settings.ZOOM || 15) +
    '&format=png' +
    '&scaleFactor=1';

  if (styleCustomization) {
    url += '&styleCustomization=' + encodeURIComponent(styleCustomization);
  }

  url += '&apiKey=' + encodeURIComponent(settings.API_KEY);
  return url;
}

// ---------------------------------------------------------------------------
// Decide whether a refresh is needed
// ---------------------------------------------------------------------------

function fetchSignature(settings, size) {
  return [settings.LOCATION_MODE, settings.MAP_STYLE, settings.ZOOM,
          settings.SHOW_LABELS ? 1 : 0, size.w, size.h].join('|');
}

function shouldFetch(settings, loc, size, force) {
  var last = null;
  try { last = JSON.parse(localStorage.getItem(LAST_FETCH_KEY)); } catch (e) {}

  if (force || !last) { return true; }
  if (last.sig !== fetchSignature(settings, size)) { return true; }

  if (String(settings.LOCATION_MODE) === '1') {
    // Fixed location: refresh only if the coordinates themselves changed.
    return last.lat !== loc.lat || last.lon !== loc.lon;
  }

  // Follow mode: refresh only when moved beyond the configured distance.
  var moved = haversine(last.lat, last.lon, loc.lat, loc.lon);
  return moved > (settings.UPDATE_DISTANCE || 500);
}

function rememberFetch(settings, loc, size) {
  try {
    localStorage.setItem(LAST_FETCH_KEY, JSON.stringify({
      lat: loc.lat, lon: loc.lon, sig: fetchSignature(settings, size)
    }));
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// PNG conversion: reduce the Geoapify map to 4 brightness levels and paint
// each level with the user's palette colour, producing a 2-bit indexed PNG
// the watch can decode cheaply.
// ---------------------------------------------------------------------------

function recolorToPalette(arrayBuffer, palette) {
  var decoded = UPNG.decode(arrayBuffer);          // parse the Geoapify PNG
  var w = decoded.width, h = decoded.height;
  console.log('Geoapify returned ' + w + 'x' + h);
  var px = new Uint8Array(UPNG.toRGBA8(decoded)[0]); // first frame, RGBA bytes

  for (var i = 0; i < px.length; i += 4) {
    // Geoapify rendered each layer group as one of 4 greys; snap to the
    // nearest level by perceptual luminance.
    var lum = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8; // 0..255
    var level = 0;
    if (lum >= LEVEL_THRESHOLDS[2]) { level = 3; }
    else if (lum >= LEVEL_THRESHOLDS[1]) { level = 2; }
    else if (lum >= LEVEL_THRESHOLDS[0]) { level = 1; }
    var c = palette[level];
    px[i] = c.r; px[i + 1] = c.g; px[i + 2] = c.b; px[i + 3] = 255;
  }

  // The image now contains at most 4 distinct colours. Encode losslessly
  // (cnum 0) so UPNG keeps that exact palette - a colour-count quantiser can
  // merge a sparse level (e.g. labels) and lose its colour.
  var out = UPNG.encode([px.buffer], w, h, 0);
  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// Image download + streaming
// ---------------------------------------------------------------------------

function downloadAndSend(settings, loc, size, styleCustomization, palette) {
  var url = buildMapUrl(settings, loc, size, styleCustomization);
  // Log the full URL so it can be tested directly in a browser / curl.
  console.log('Requesting map: ' + url);

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';
  xhr.timeout = 30000;

  xhr.onload = function () {
    var len = 0;
    try { len = xhr.response ? new Uint8Array(xhr.response).byteLength : 0; }
    catch (e) { len = -1; }
    console.log('Map response: HTTP ' + xhr.status + ', ' + len + ' bytes');

    if (xhr.status !== 200) {
      sendStatus('HTTP ' + xhr.status);
      finishSending();
      return;
    }
    if (len <= 0) {
      // 200 but no binary body: arraybuffer not honoured by this JS runtime.
      sendStatus('Empty body n=' + len);
      finishSending();
      return;
    }

    // Reduce to 4 brightness levels and recolour with the user's palette,
    // producing a small 2-bit indexed PNG the watch can decode.
    var bytes;
    try {
      bytes = recolorToPalette(xhr.response, palette);
    } catch (convErr) {
      console.log('PNG conversion failed: ' + convErr);
      sendStatus('Convert fail');
      finishSending();
      return;
    }
    console.log('Indexed PNG: ' + bytes.length + ' bytes');
    // The watch shows "Loading map..." on IMG_SIZE and clears it on a
    // successful decode, so no status is sent here.
    streamImage(bytes, function (ok) {
      if (ok) {
        rememberFetch(settings, loc, size);
      } else {
        sendStatus('Transfer failed');
      }
      finishSending();
    });
  };
  xhr.onerror = function () {
    console.log('Map request network error (status ' + xhr.status + ')');
    sendStatus('Net err s=' + xhr.status);
    finishSending();
  };
  xhr.ontimeout = function () {
    console.log('Map request timed out');
    sendStatus('Map timeout');
    finishSending();
  };

  try {
    xhr.send();
  } catch (e) {
    console.log('xhr.send threw: ' + e);
    sendStatus('Send threw');
    finishSending();
  }
}

function streamImage(bytes, done) {
  var size = bytes.length;

  // Enqueue the whole transfer; the serialised queue sends one message at a
  // time, in order, so chunks never overlap each other or other traffic.
  enqueueSend({ 'IMG_SIZE': size });
  for (var offset = 0; offset < size; offset += CHUNK_SIZE) {
    var end = Math.min(offset + CHUNK_SIZE, size);
    var chunk = Array.prototype.slice.call(bytes.subarray(offset, end));
    enqueueSend({ 'IMG_OFFSET': offset, 'IMG_DATA': chunk });
  }
  enqueueSend({ 'IMG_COMPLETE': 1 }, function () {
    console.log('Image transfer complete');
    done(true);
  }, function () {
    console.log('Image transfer failed to complete');
    done(false);
  });
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function performUpdate(force) {
  if (sending) { return; }
  var settings = loadSettings();

  if (!settings.API_KEY) {
    sendStatus('Set API key');
    return;
  }

  // Claim the transfer slot up-front (not inside the async callback) so a
  // second trigger can't start an overlapping transfer.
  sending = true;

  var platform = getPlatform();
  var size = getPlatformSize(platform);
  var palette = getMapPalette(settings);
  console.log('Platform ' + platform + ', map ' + size.w + 'x' + size.h);
  sendStatus('Locating...');
  resolveLocation(settings, function (err, loc) {
    if (err) { sendStatus('No location'); finishSending(); return; }
    if (!shouldFetch(settings, loc, size, force)) {
      sendStatus('Map up to date');
      finishSending();
      return;
    }
    resolveStyleCustomization(settings, function (styleCustomization) {
      downloadAndSend(settings, loc, size, styleCustomization, palette);
    });
  });
}

// Push a short status/debug line to the watch face (via the serialised queue).
function sendStatus(text) {
  console.log('Status: ' + text);
  enqueueSend({ 'STATUS': text });
}

function sendConfigToWatch(dict, onDone) {
  enqueueSend(dict, function () {
    console.log('Config sent to watch');
    if (onDone) { onDone(); }
  }, function () {
    console.log('Failed to send config to watch');
    if (onDone) { onDone(); } // proceed regardless
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

Pebble.addEventListener('ready', function () {
  console.log('Map Face JS ready');
  // Force on launch: the watch does not persist the decoded map, so it needs
  // a fresh image every time the watchface starts.
  performUpdate(true);
});

Pebble.addEventListener('showConfiguration', function () {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (!e || !e.response) {
    // Config page closed without submitting (e.g. cancelled / back).
    sendStatus('Cfg: no response');
    return;
  }

  var dict;
  try {
    // getSettings also writes the clean, name-keyed copy to clay-settings.
    dict = clay.getSettings(e.response); // numeric-keyed dict for AppMessage
  } catch (err) {
    console.log('getSettings error: ' + err);
    sendStatus('Cfg parse err');
    return;
  }

  // Read our own settings (API key, mode, etc.) from the clean copy.
  var settings = loadSettings();
  var keyLen = settings.API_KEY ? String(settings.API_KEY).length : 0;

  // Send the config first, and only start the image transfer once it has been
  // acked. Sending config and streaming the image concurrently makes the two
  // AppMessage flows collide and corrupts the image (a single flipped byte in
  // the PNG, seen as "Load failed"/decode failure on the watch).
  sendConfigToWatch(dict, function () {
    if (!keyLen) {
      sendStatus('Cfg: key empty');
      return;
    }
    // Config (key / style / zoom / location) may have changed: force a refresh.
    performUpdate(true);
  });
});

Pebble.addEventListener('appmessage', function (e) {
  if (e.payload && e.payload.REQUEST_UPDATE !== undefined) {
    // mode 2 = the watch asking for a forced re-download (e.g. after a
    // corrupt transfer); mode 1 = the hourly refresh.
    var force = e.payload.REQUEST_UPDATE === 2;
    if (sending) {
      // A transfer is finishing; remember the request so it isn't lost to the
      // brief window before `sending` clears (which left the watch stuck on
      // "Retrying").
      pendingUpdate = true;
      pendingForce = pendingForce || force;
    } else {
      performUpdate(force);
    }
  }
});
