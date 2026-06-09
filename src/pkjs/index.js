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

var SETTINGS_KEY = 'mapface-settings';
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
  try {
    var raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      var base = defaultSettings();
      for (var k in parsed) {
        if (parsed.hasOwnProperty(k)) { base[k] = parsed[k]; }
      }
      return base;
    }
  } catch (e) {
    console.log('Failed to load settings: ' + e);
  }
  return defaultSettings();
}

function saveSettings(dict) {
  var s = {
    API_KEY: dict.API_KEY,
    LOCATION_MODE: dict.LOCATION_MODE,
    FIXED_LAT: dict.FIXED_LAT,
    FIXED_LON: dict.FIXED_LON,
    UPDATE_DISTANCE: dict.UPDATE_DISTANCE,
    ZOOM: dict.ZOOM,
    SHOW_LABELS: dict.SHOW_LABELS,
    MAP_STYLE: dict.MAP_STYLE
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (e) {
    console.log('Failed to save settings: ' + e);
  }
}

function getPlatformSize() {
  var platform = 'basalt';
  try {
    var info = Pebble.getActiveWatchInfo && Pebble.getActiveWatchInfo();
    if (info && info.platform) { platform = info.platform; }
  } catch (e) { /* not available; use default */ }
  return PLATFORM_SIZES[platform] || { w: 144, h: 168 };
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

var HIDE_LABELS =
  'road_label_primary:none|road_label_secondary:none|road_label_tertiary:none|' +
  'place_label_city:none|place_label_town:none|place_label_village:none|' +
  'place_label_other:none|water_label:none|poi_label:none';

function buildMapUrl(settings, loc, size) {
  var url = 'https://maps.geoapify.com/v1/staticmap' +
    '?style=' + encodeURIComponent(settings.MAP_STYLE || 'dark-matter') +
    '&width=' + size.w +
    '&height=' + size.h +
    '&center=lonlat:' + loc.lon + ',' + loc.lat +
    '&zoom=' + (settings.ZOOM || 15) +
    '&format=png' +
    '&scaleFactor=1';

  // When names are disabled, hide the label layers via styleCustomization.
  if (!settings.SHOW_LABELS) {
    url += '&styleCustomization=' + encodeURIComponent(HIDE_LABELS);
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
// Image download + streaming
// ---------------------------------------------------------------------------

function downloadAndSend(settings, loc, size) {
  var url = buildMapUrl(settings, loc, size);
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';
  xhr.onload = function () {
    if (xhr.status !== 200) {
      sendStatus('Map HTTP ' + xhr.status);
      sending = false;
      return;
    }
    var bytes = new Uint8Array(xhr.response);
    console.log('Map downloaded: ' + bytes.length + ' bytes');
    // The watch shows "Loading map..." on IMG_SIZE and clears it on a
    // successful decode, so we do not send a status during the stream itself.
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
    sendStatus('Network error');
    sending = false;
  };
  xhr.send();
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
    downloadAndSend(settings, loc, size);
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
    dict = clay.getSettings(e.response); // converted, ready for AppMessage
  } catch (err) {
    console.log('getSettings error: ' + err);
    sendStatus('Cfg parse err');
    return;
  }

  console.log('Config dict: ' + JSON.stringify(dict));
  var keyLen = (dict && dict.API_KEY) ? String(dict.API_KEY).length : 0;

  saveSettings(dict);
  sendConfigToWatch(dict);

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
