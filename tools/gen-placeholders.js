#!/usr/bin/env node
// Generate placeholder map PNG files for each Pebble platform resolution.
// Output: resources/images/map-placeholder-{size}.png
// Run: node tools/gen-placeholders.js

'use strict';
var fs   = require('fs');
var path = require('path');
var UPNG = require('../node_modules/upng-js');

// Must match index.js / map-preview.html
var LEVEL_THRESHOLDS = [43, 128, 213];
var DEFAULT_TONES    = [0, 3, 2, 1];  // land=black, water=diag-lines, road=checker, label=white
// Grey values sent to Geoapify for each level (0/85/170/255)
var LEVEL_GREYS = [0, 85, 170, 255];

function toneValue(code, x, y) {
  switch (code) {
    case 1: return 255;
    case 2: return ((x + y) & 1) ? 255 : 0;
    case 3: return (((x + y) & 3) < 2) ? 255 : 0;
    default: return 0;
  }
}

// Draw a city-grid map pattern into RGBA Uint8Array (w x h).
// bw: if true, apply dithering; otherwise use plain greyscale ramp.
function drawMap(w, h, bw) {
  var px = new Uint8Array(w * h * 4);

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      // --- assign map level ------------------------------------------------
      // Level 1 (water / diagonal-lines): a band at the top ~25% of the image
      var level = 0; // default: land

      var inWater = (y < Math.floor(h * 0.28));
      if (inWater) {
        level = 1;
      } else {
        // Streets: a regular grid.
        // Major roads every 24 px (3 px wide), minor every 12 px (1 px wide).
        var onMajorH = (y % 24 < 3);
        var onMajorV = (x % 24 < 3);
        var onMinorH = !onMajorH && (y % 12 === 0);
        var onMinorV = !onMajorV && (x % 12 === 0);
        if (onMajorH || onMajorV || onMinorH || onMinorV) {
          level = 2;
        }
        // A few label-bright highlights (block centres of bigger intersections)
        var bx = x % 24, by = y % 24;
        if (!inWater && bx >= 10 && bx <= 13 && by >= 10 && by <= 13) {
          level = 3;
        }
      }
      // --- convert level to pixel value ------------------------------------
      var v;
      if (bw) {
        v = toneValue(DEFAULT_TONES[level], x, y);
      } else {
        v = LEVEL_GREYS[level];
      }
      var i = (y * w + x) * 4;
      px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 255;
    }
  }
  return px;
}

var PLATFORMS = [
  { name: '144x168-bw', w: 144, h: 168, bw: true  },
  { name: '144x168',    w: 144, h: 168, bw: false  },
  { name: '180x180',    w: 180, h: 180, bw: false  },
  { name: '200x228',    w: 200, h: 228, bw: false  },
  { name: '260x260',    w: 260, h: 260, bw: false  },
];

var outDir = path.resolve(__dirname, '../resources/images');
fs.mkdirSync(outDir, { recursive: true });

PLATFORMS.forEach(function (p) {
  var px  = drawMap(p.w, p.h, p.bw);
  var png = UPNG.encode([px.buffer], p.w, p.h, 0); // lossless indexed PNG
  var out = path.join(outDir, 'map-placeholder-' + p.name + '.png');
  fs.writeFileSync(out, Buffer.from(png));
  console.log('wrote ' + out + ' (' + png.byteLength + ' bytes)');
});
