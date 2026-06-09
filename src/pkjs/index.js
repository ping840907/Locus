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

// Number of palette colours for the re-encoded image. 16 colours => a 4-bit
// indexed PNG: small to transfer and cheap for the watch to decode, while
// still plenty for a monochrome dark map.
var NUM_COLORS = 16;

// Geoapify burns an attribution band onto the bottom of the static map. We
// request the image this many extra pixels taller on each side and let the
// watch centre-crop it, so the bottom band is clipped off-screen while the
// location stays centred. (Enough to cover a two-line attribution.)
var ATTR_CROP = 40;

// Gamma < 1 brightens dark tones so dark-matter's dim grey roads become
// clearly visible against the black background (and survive quantisation).
var GAMMA = 0.5;
var GAMMA_LUT = (function () {
  var lut = new Uint8Array(256);
  for (var i = 0; i < 256; i++) {
    lut[i] = Math.round(255 * Math.pow(i / 255, GAMMA));
  }
  return lut;
})();

// Clay's getSettings() writes a clean, name-keyed, flattened copy of the
// settings here (e.g. { API_KEY: "...", ZOOM: 15 }). The dict it *returns* is
// keyed by numeric message-key IDs for sendAppMessage, so we must read our
// own settings from this localStorage entry, not from that dict.
var CLAY_SETTINGS_KEY = 'clay-settings';
var LAST_FETCH_KEY = 'mapface-lastfetch';
var CHUNK_SIZE = 1000; // bytes of image data per AppMessage

var sending = false; // guard against overlapping transfers

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
    MAP_STYLE: 'dark-matter'
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

function getPlatformSize() {
  var platform = 'basalt';
  try {
    var info = Pebble.getActiveWatchInfo && Pebble.getActiveWatchInfo();
    if (info && info.platform) { platform = info.platform; }
  } catch (e) { /* not available; use default */ }
  var s = PLATFORM_SIZES[platform] || { w: 144, h: 168 };
  // Request extra height so the watch can centre-crop off the attribution band.
  return { w: s.w, h: s.h + 2 * ATTR_CROP };
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

// Fallback label layers (used if the style JSON can't be fetched). Layer ids
// vary by style, so we prefer the dynamic discovery below.
var HIDE_LABELS_FALLBACK =
  'road_label_primary:none|road_label_secondary:none|road_label_tertiary:none|' +
  'place_label_city:none|place_label_town:none|place_label_village:none|' +
  'place_label_other:none|water_label:none|poi_label:none';

// Resolve the styleCustomization string that hides every text (symbol) layer
// for the chosen style. The actual layer ids differ per style, so we fetch the
// style's JSON once (cached) and disable all of its symbol layers.
function resolveLabelCustomization(settings, cb) {
  if (settings.SHOW_LABELS) { cb(''); return; }

  var cacheKey = 'nolabels:' + settings.MAP_STYLE;
  var cached = localStorage.getItem(cacheKey);
  if (cached !== null) { cb(cached); return; }

  var styleUrl = 'https://maps.geoapify.com/v1/styles/' +
    encodeURIComponent(settings.MAP_STYLE) + '/style.json?apiKey=' +
    encodeURIComponent(settings.API_KEY);

  var xhr = new XMLHttpRequest();
  xhr.open('GET', styleUrl, true);
  xhr.onload = function () {
    var custom = HIDE_LABELS_FALLBACK;
    try {
      var style = JSON.parse(xhr.responseText);
      var ids = [];
      (style.layers || []).forEach(function (layer) {
        if (layer.type === 'symbol' && layer.id) { ids.push(layer.id + ':none'); }
      });
      if (ids.length) { custom = ids.join('|'); }
    } catch (e) {
      console.log('style.json parse failed: ' + e);
    }
    try { localStorage.setItem(cacheKey, custom); } catch (e) {}
    cb(custom);
  };
  xhr.onerror = function () {
    console.log('style.json fetch failed; using fallback label list');
    cb(HIDE_LABELS_FALLBACK);
  };
  xhr.send();
}

function buildMapUrl(settings, loc, size, labelCustomization) {
  var url = 'https://maps.geoapify.com/v1/staticmap' +
    '?style=' + encodeURIComponent(settings.MAP_STYLE || 'dark-matter') +
    '&width=' + size.w +
    '&height=' + size.h +
    '&center=lonlat:' + loc.lon + ',' + loc.lat +
    '&zoom=' + (settings.ZOOM || 15) +
    '&format=png' +
    '&scaleFactor=1';

  // When names are disabled, hide the label layers via styleCustomization.
  if (!settings.SHOW_LABELS && labelCustomization) {
    url += '&styleCustomization=' + encodeURIComponent(labelCustomization);
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
// PNG conversion (truecolor -> indexed, so the watch can decode it)
// ---------------------------------------------------------------------------

function toIndexedPng(arrayBuffer) {
  var decoded = UPNG.decode(arrayBuffer);          // parse the Geoapify PNG
  var rgba = UPNG.toRGBA8(decoded)[0];             // first frame as RGBA bytes

  // Brighten dark tones (in place) so roads stand out before quantisation.
  var px = new Uint8Array(rgba);
  for (var i = 0; i < px.length; i += 4) {
    px[i] = GAMMA_LUT[px[i]];
    px[i + 1] = GAMMA_LUT[px[i + 1]];
    px[i + 2] = GAMMA_LUT[px[i + 2]];
  }

  // Re-encode with a small palette -> low-bit-depth indexed PNG.
  var out = UPNG.encode([rgba], decoded.width, decoded.height, NUM_COLORS);
  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// Image download + streaming
// ---------------------------------------------------------------------------

function downloadAndSend(settings, loc, size, labelCustomization) {
  var url = buildMapUrl(settings, loc, size, labelCustomization);
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
      sending = false;
      return;
    }
    if (len <= 0) {
      // 200 but no binary body: arraybuffer not honoured by this JS runtime.
      sendStatus('Empty body n=' + len);
      sending = false;
      return;
    }

    // Geoapify returns a truecolor PNG; convert it to an indexed PNG that the
    // watch can actually decode.
    var bytes;
    try {
      bytes = toIndexedPng(xhr.response);
    } catch (convErr) {
      console.log('PNG conversion failed: ' + convErr);
      sendStatus('Convert fail');
      sending = false;
      return;
    }
    console.log('Indexed PNG: ' + bytes.length + ' bytes');
    // The watch shows "Loading map..." on IMG_SIZE and clears it on a
    // successful decode, so no status is sent here.
    streamImage(bytes, function (ok) {
      sending = false;
      if (ok) {
        rememberFetch(settings, loc, size);
      } else {
        sendStatus('Transfer failed');
      }
    });
  };
  xhr.onerror = function () {
    console.log('Map request network error (status ' + xhr.status + ')');
    sendStatus('Net err s=' + xhr.status);
    sending = false;
  };
  xhr.ontimeout = function () {
    console.log('Map request timed out');
    sendStatus('Map timeout');
    sending = false;
  };

  try {
    xhr.send();
  } catch (e) {
    console.log('xhr.send threw: ' + e);
    sendStatus('Send threw');
    sending = false;
  }
}

function streamImage(bytes, done) {
  var size = bytes.length;

  Pebble.sendAppMessage({ 'IMG_SIZE': size }, function () {
    sendChunk(0);
  }, function () {
    console.log('Failed to start image transfer');
    done(false);
  });

  function sendChunk(offset) {
    if (offset >= size) {
      Pebble.sendAppMessage({ 'IMG_COMPLETE': 1 }, function () {
        console.log('Image transfer complete');
        done(true);
      }, function () { done(false); });
      return;
    }
    var end = Math.min(offset + CHUNK_SIZE, size);
    var chunk = Array.prototype.slice.call(bytes.subarray(offset, end));
    Pebble.sendAppMessage(
      { 'IMG_OFFSET': offset, 'IMG_DATA': chunk },
      function () { sendChunk(end); },
      function () {
        // One retry on failure before giving up.
        Pebble.sendAppMessage(
          { 'IMG_OFFSET': offset, 'IMG_DATA': chunk },
          function () { sendChunk(end); },
          function () { console.log('Chunk failed at ' + offset); done(false); }
        );
      }
    );
  }
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

  var size = getPlatformSize();
  sendStatus('Locating...');
  resolveLocation(settings, function (err, loc) {
    if (err) { sendStatus('No location'); return; }
    if (!shouldFetch(settings, loc, size, force)) {
      sendStatus('Map up to date');
      return;
    }
    sending = true;
    resolveLabelCustomization(settings, function (labelCustomization) {
      downloadAndSend(settings, loc, size, labelCustomization);
    });
  });
}

// Push a short status/debug line to the watch face. Only called at idle
// moments (never interleaved with the image chunk stream) so it cannot
// disrupt the ACK-driven transfer.
function sendStatus(text) {
  console.log('Status: ' + text);
  Pebble.sendAppMessage({ 'STATUS': text });
}

function sendConfigToWatch(dict) {
  Pebble.sendAppMessage(dict, function () {
    console.log('Config sent to watch');
  }, function () {
    console.log('Failed to send config to watch');
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

  sendConfigToWatch(dict);

  // Read our own settings (API key, mode, etc.) from the clean copy.
  var settings = loadSettings();
  var keyLen = settings.API_KEY ? String(settings.API_KEY).length : 0;
  if (!keyLen) {
    // The form returned but the API key field came back empty.
    sendStatus('Cfg: key empty');
    return;
  }

  // Config (key / style / zoom / location) may have changed: force a refresh.
  performUpdate(true);
});

Pebble.addEventListener('appmessage', function (e) {
  if (e.payload && e.payload.REQUEST_UPDATE !== undefined) {
    performUpdate(false);
  }
});
