// Clay configuration page for Locus.
// Written in English by default. Map labels themselves follow the map's own
// local language (provided by Geoapify), independent of this UI language.

module.exports = [
  {
    "type": "heading",
    "defaultValue": "Locus"
  },
  {
    "type": "text",
    "defaultValue": "A live map of your surroundings as your watchface background. Enter your free Geoapify API key to begin."
  },

  // -------------------------------------------------------------------------
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Geoapify"
      },
      {
        "type": "input",
        "messageKey": "API_KEY",
        "label": "API Key",
        "defaultValue": "",
        "attributes": {
          "placeholder": "your-geoapify-api-key",
          "limit": 64
        }
      },
      {
        "type": "text",
        "defaultValue": "Get a free key at geoapify.com (3,000 requests/day free)."
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Location"
      },
      {
        "type": "select",
        "messageKey": "LOCATION_MODE",
        "label": "Location source",
        "defaultValue": "0",
        "options": [
          { "label": "Follow my current location", "value": "0" },
          { "label": "Use a fixed location", "value": "1" }
        ]
      },
      {
        "type": "input",
        "messageKey": "FIXED_LAT",
        "label": "Fixed latitude",
        "defaultValue": "",
        "attributes": {
          "placeholder": "e.g. 25.0330",
          "type": "number",
          "step": "any"
        }
      },
      {
        "type": "input",
        "messageKey": "FIXED_LON",
        "label": "Fixed longitude",
        "defaultValue": "",
        "attributes": {
          "placeholder": "e.g. 121.5654",
          "type": "number",
          "step": "any"
        }
      },
      {
        "type": "text",
        "defaultValue": "Fixed location is only used when 'Use a fixed location' is selected. Current location prioritises fast WiFi / cell-tower positioning."
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Map updates"
      },
      {
        "type": "slider",
        "messageKey": "UPDATE_INTERVAL",
        "label": "Location check interval (minutes)",
        "defaultValue": 60,
        "min": 15,
        "max": 360,
        "step": 15
      },
      {
        "type": "slider",
        "messageKey": "UPDATE_DISTANCE",
        "label": "Refresh distance (metres)",
        "defaultValue": 500,
        "min": 50,
        "max": 5000,
        "step": 50
      },
      {
        "type": "text",
        "defaultValue": "The watch checks your location every interval above. The map is only re-downloaded when you have moved farther than this distance from the current map's centre (and always on launch / after changing settings)."
      },
      {
        "type": "slider",
        "messageKey": "ZOOM",
        "label": "Zoom level",
        "defaultValue": 15,
        "min": 10,
        "max": 18,
        "step": 1
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Map appearance"
      },
      {
        "type": "toggle",
        "messageKey": "SHOW_LABELS",
        "label": "Show place / road names",
        "defaultValue": true
      },
      {
        "type": "text",
        "defaultValue": "The map is split into land, water, roads and labels and recoloured with the palette below. Names are shown in the map's own local language."
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Map colours"
      },
      {
        "type": "text",
        "defaultValue": "Colour each map layer. The map is rendered as land, water, roads and labels and recoloured to these."
      },
      {
        "type": "color",
        "messageKey": "MAP_COLOR_BG",
        "label": "Land / background",
        "defaultValue": "000000",
        "sunlight": true,
        "capabilities": ["COLOR"]
      },
      {
        "type": "color",
        "messageKey": "MAP_COLOR_1",
        "label": "Water",
        "defaultValue": "555555",
        "sunlight": true,
        "capabilities": ["COLOR"]
      },
      {
        "type": "color",
        "messageKey": "MAP_COLOR_2",
        "label": "Roads",
        "defaultValue": "AAAAAA",
        "sunlight": true,
        "capabilities": ["COLOR"]
      },
      {
        "type": "color",
        "messageKey": "MAP_COLOR_3",
        "label": "Labels",
        "defaultValue": "FFFFFF",
        "sunlight": true,
        "capabilities": ["COLOR"]
      },
      {
        "type": "select",
        "messageKey": "MAP_TONE_BG",
        "label": "Land / background",
        "defaultValue": "0",
        "capabilities": ["BW"],
        "options": [
          { "label": "Black", "value": "0" },
          { "label": "White", "value": "1" },
          { "label": "Grey (dither)", "value": "2" },
          { "label": "Diagonal lines", "value": "3" }
        ]
      },
      {
        "type": "select",
        "messageKey": "MAP_TONE_1",
        "label": "Water",
        "defaultValue": "3",
        "capabilities": ["BW"],
        "options": [
          { "label": "Black", "value": "0" },
          { "label": "White", "value": "1" },
          { "label": "Grey (dither)", "value": "2" },
          { "label": "Diagonal lines", "value": "3" }
        ]
      },
      {
        "type": "select",
        "messageKey": "MAP_TONE_2",
        "label": "Roads",
        "defaultValue": "2",
        "capabilities": ["BW"],
        "options": [
          { "label": "Black", "value": "0" },
          { "label": "White", "value": "1" },
          { "label": "Grey (dither)", "value": "2" },
          { "label": "Diagonal lines", "value": "3" }
        ]
      },
      {
        "type": "select",
        "messageKey": "MAP_TONE_3",
        "label": "Labels",
        "defaultValue": "1",
        "capabilities": ["BW"],
        "options": [
          { "label": "Black", "value": "0" },
          { "label": "White", "value": "1" },
          { "label": "Grey (dither)", "value": "2" },
          { "label": "Diagonal lines", "value": "3" }
        ]
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Watchface colours"
      },
      {
        "type": "color",
        "messageKey": "TIME_COLOR",
        "label": "Time colour",
        "defaultValue": "FFFFFF",
        "sunlight": true
      },
      {
        "type": "color",
        "messageKey": "DATE_COLOR",
        "label": "Date colour",
        "defaultValue": "AAAAAA",
        "sunlight": true
      },
      {
        "type": "toggle",
        "messageKey": "SHOW_DATE",
        "label": "Show date",
        "defaultValue": true
      },
      {
        "type": "toggle",
        "messageKey": "SHOW_CENTER_DOT",
        "label": "Show location dot",
        "defaultValue": false
      },
      {
        "type": "toggle",
        "messageKey": "SHOW_STATUS",
        "label": "Show status messages",
        "defaultValue": true
      },
      {
        "type": "text",
        "defaultValue": "Status messages appear at the bottom (e.g. Locating, Loading map). Turn off for a clean face."
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Watchface fonts"
      },
      {
        "type": "text",
        "defaultValue": "Preview all available fonts at developer.repebble.com/guides/app-resources/system-fonts/ — open this URL manually in a browser. Note: Bitcount, Jersey 25, and Norican are custom fonts, so they are not listed in the official font documentation."
      },

      // Time font — aplite / basalt / chalk / diorite / flint
      {
        "type": "select",
        "messageKey": "TIME_FONT",
        "label": "Time font",
        "defaultValue": "0",
        "capabilities": ["NOT_PLATFORM_EMERY", "NOT_PLATFORM_GABBRO"],
        "options": [
          { "label": "── Bitcount ──",        "value": "" },
          { "label": "Bitcount Regular · 42", "value": "10" },
          { "label": "Bitcount Bold · 42",    "value": "11" },
          { "label": "── Bitham ──",          "value": "" },
          { "label": "Bitham 34 · Medium",    "value": "7" },
          { "label": "Bitham 42 · Light",     "value": "1" },
          { "label": "Bitham 42 · Medium",    "value": "2" },
          { "label": "Bitham 42 · Bold",      "value": "3" },
          { "label": "── Jersey 25 ──",       "value": "" },
          { "label": "Jersey 25 · 60",        "value": "12" },
          { "label": "── LECO ──",            "value": "" },
          { "label": "LECO 36 · Bold",        "value": "8" },
          { "label": "LECO 38 · Bold",        "value": "9" },
          { "label": "LECO 42",               "value": "0" },
          { "label": "── Norican ──",         "value": "" },
          { "label": "Norican Regular · 40",  "value": "16" },
          { "label": "── Roboto ──",          "value": "" },
          { "label": "Roboto 49 · Bold",      "value": "4" }
        ]
      },

      // Time font — Emery (Pebble Time 2, 200×228)
      {
        "type": "select",
        "messageKey": "TIME_FONT",
        "label": "Time font",
        "defaultValue": "5",
        "capabilities": ["PLATFORM_EMERY"],
        "options": [
          { "label": "── Bitcount ──",        "value": "" },
          { "label": "Bitcount Regular · 42", "value": "10" },
          { "label": "Bitcount Bold · 42",    "value": "11" },
          { "label": "Bitcount Regular · 60", "value": "13" },
          { "label": "Bitcount Bold · 60",    "value": "14" },
          { "label": "── Bitham ──",          "value": "" },
          { "label": "Bitham 34 · Medium",    "value": "7" },
          { "label": "Bitham 42 · Light",     "value": "1" },
          { "label": "Bitham 42 · Medium",    "value": "2" },
          { "label": "Bitham 42 · Bold",      "value": "3" },
          { "label": "── Jersey 25 ──",       "value": "" },
          { "label": "Jersey 25 · 60",        "value": "12" },
          { "label": "Jersey 25 · 78",        "value": "15" },
          { "label": "── LECO ──",            "value": "" },
          { "label": "LECO 36 · Bold",        "value": "8" },
          { "label": "LECO 38 · Bold",        "value": "9" },
          { "label": "LECO 42",               "value": "0" },
          { "label": "LECO 60",               "value": "5" },
          { "label": "LECO 60 · Bold",        "value": "6" },
          { "label": "── Norican ──",         "value": "" },
          { "label": "Norican Regular · 40",  "value": "16" },
          { "label": "Norican Regular · 58",  "value": "17" },
          { "label": "── Roboto ──",          "value": "" },
          { "label": "Roboto 49 · Bold",      "value": "4" }
        ]
      },

      // Time font — Gabbro (Pebble Round 2, 260×260)
      {
        "type": "select",
        "messageKey": "TIME_FONT",
        "label": "Time font",
        "defaultValue": "5",
        "capabilities": ["PLATFORM_GABBRO"],
        "options": [
          { "label": "── Bitcount ──",        "value": "" },
          { "label": "Bitcount Regular · 42", "value": "10" },
          { "label": "Bitcount Bold · 42",    "value": "11" },
          { "label": "Bitcount Regular · 60", "value": "13" },
          { "label": "Bitcount Bold · 60",    "value": "14" },
          { "label": "── Bitham ──",          "value": "" },
          { "label": "Bitham 34 · Medium",    "value": "7" },
          { "label": "Bitham 42 · Light",     "value": "1" },
          { "label": "Bitham 42 · Medium",    "value": "2" },
          { "label": "Bitham 42 · Bold",      "value": "3" },
          { "label": "── Jersey 25 ──",       "value": "" },
          { "label": "Jersey 25 · 60",        "value": "12" },
          { "label": "Jersey 25 · 78",        "value": "15" },
          { "label": "── LECO ──",            "value": "" },
          { "label": "LECO 36 · Bold",        "value": "8" },
          { "label": "LECO 38 · Bold",        "value": "9" },
          { "label": "LECO 42",               "value": "0" },
          { "label": "LECO 60",               "value": "5" },
          { "label": "LECO 60 · Bold",        "value": "6" },
          { "label": "── Norican ──",         "value": "" },
          { "label": "Norican Regular · 40",  "value": "16" },
          { "label": "Norican Regular · 58",  "value": "17" },
          { "label": "── Roboto ──",          "value": "" },
          { "label": "Roboto 49 · Bold",      "value": "4" }
        ]
      },

      // Date font — aplite / basalt / chalk / diorite / flint
      {
        "type": "select",
        "messageKey": "DATE_FONT",
        "label": "Date font",
        "defaultValue": "3",
        "capabilities": ["NOT_PLATFORM_EMERY", "NOT_PLATFORM_GABBRO"],
        "options": [
          { "label": "── Bitcount ──",        "value": "" },
          { "label": "Bitcount Regular · 21", "value": "11" },
          { "label": "── Bitham ──",          "value": "" },
          { "label": "Bitham 30 Black",       "value": "10" },
          { "label": "── Droid Serif ──",     "value": "" },
          { "label": "Droid Serif 28 Bold",   "value": "9" },
          { "label": "── Gothic ──",          "value": "" },
          { "label": "Gothic 14",             "value": "0" },
          { "label": "Gothic 14 Bold",        "value": "1" },
          { "label": "Gothic 18",             "value": "2" },
          { "label": "Gothic 18 Bold",        "value": "3" },
          { "label": "Gothic 24",             "value": "5" },
          { "label": "Gothic 24 Bold",        "value": "6" },
          { "label": "Gothic 28",             "value": "7" },
          { "label": "Gothic 28 Bold",        "value": "8" },
          { "label": "── Jersey 25 ──",       "value": "" },
          { "label": "Jersey 25 · 21",        "value": "12" },
          { "label": "── Norican ──",         "value": "" },
          { "label": "Norican Regular · 16",  "value": "15" },
          { "label": "── Roboto ──",          "value": "" },
          { "label": "Roboto Condensed 21",   "value": "4" }
        ]
      },

      // Date font — Emery (Pebble Time 2, 200×228)
      {
        "type": "select",
        "messageKey": "DATE_FONT",
        "label": "Date font",
        "defaultValue": "8",
        "capabilities": ["PLATFORM_EMERY"],
        "options": [
          { "label": "── Bitcount ──",        "value": "" },
          { "label": "Bitcount Regular · 21", "value": "11" },
          { "label": "Bitcount Regular · 28", "value": "13" },
          { "label": "── Bitham ──",          "value": "" },
          { "label": "Bitham 30 Black",       "value": "10" },
          { "label": "── Droid Serif ──",     "value": "" },
          { "label": "Droid Serif 28 Bold",   "value": "9" },
          { "label": "── Gothic ──",          "value": "" },
          { "label": "Gothic 14",             "value": "0" },
          { "label": "Gothic 14 Bold",        "value": "1" },
          { "label": "Gothic 18",             "value": "2" },
          { "label": "Gothic 18 Bold",        "value": "3" },
          { "label": "Gothic 24",             "value": "5" },
          { "label": "Gothic 24 Bold",        "value": "6" },
          { "label": "Gothic 28",             "value": "7" },
          { "label": "Gothic 28 Bold",        "value": "8" },
          { "label": "── Jersey 25 ──",       "value": "" },
          { "label": "Jersey 25 · 21",        "value": "12" },
          { "label": "Jersey 25 · 28",        "value": "14" },
          { "label": "── Norican ──",         "value": "" },
          { "label": "Norican Regular · 16",  "value": "15" },
          { "label": "Norican Regular · 22",  "value": "16" },
          { "label": "── Roboto ──",          "value": "" },
          { "label": "Roboto Condensed 21",   "value": "4" }
        ]
      },

      // Date font — Gabbro (Pebble Round 2, 260×260)
      {
        "type": "select",
        "messageKey": "DATE_FONT",
        "label": "Date font",
        "defaultValue": "8",
        "capabilities": ["PLATFORM_GABBRO"],
        "options": [
          { "label": "── Bitcount ──",        "value": "" },
          { "label": "Bitcount Regular · 21", "value": "11" },
          { "label": "Bitcount Regular · 28", "value": "13" },
          { "label": "── Bitham ──",          "value": "" },
          { "label": "Bitham 30 Black",       "value": "10" },
          { "label": "── Droid Serif ──",     "value": "" },
          { "label": "Droid Serif 28 Bold",   "value": "9" },
          { "label": "── Gothic ──",          "value": "" },
          { "label": "Gothic 14",             "value": "0" },
          { "label": "Gothic 14 Bold",        "value": "1" },
          { "label": "Gothic 18",             "value": "2" },
          { "label": "Gothic 18 Bold",        "value": "3" },
          { "label": "Gothic 24",             "value": "5" },
          { "label": "Gothic 24 Bold",        "value": "6" },
          { "label": "Gothic 28",             "value": "7" },
          { "label": "Gothic 28 Bold",        "value": "8" },
          { "label": "── Jersey 25 ──",       "value": "" },
          { "label": "Jersey 25 · 21",        "value": "12" },
          { "label": "Jersey 25 · 28",        "value": "14" },
          { "label": "── Norican ──",         "value": "" },
          { "label": "Norican Regular · 16",  "value": "15" },
          { "label": "Norican Regular · 22",  "value": "16" },
          { "label": "── Roboto ──",          "value": "" },
          { "label": "Roboto Condensed 21",   "value": "4" }
        ]
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    "type": "section",
    "items": [
      { "type": "heading", "defaultValue": "Attribution" },
      { "type": "text", "defaultValue": "Powered by <a href=\"https://www.geoapify.com/\">Geoapify</a> — map data © OpenMapTiles © OpenStreetMap contributors." }
    ]
  },

  {
    "type": "submit",
    "defaultValue": "Save settings"
  }
];
