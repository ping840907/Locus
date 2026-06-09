// Clay configuration page for Map Face.
// Written in English by default. Map labels themselves follow the map's own
// local language (provided by Geoapify), independent of this UI language.

module.exports = [
  {
    "type": "heading",
    "defaultValue": "Map Face"
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
        "type": "select",
        "messageKey": "MAP_STYLE",
        "label": "Map style",
        "defaultValue": "dark-matter",
        "options": [
          { "label": "Dark (black bg, grey roads)", "value": "dark-matter" },
          { "label": "Dark – brown roads", "value": "dark-matter-brown" },
          { "label": "Dark – dark grey", "value": "dark-matter-dark-grey" },
          { "label": "Dark – purple roads", "value": "dark-matter-purple-roads" },
          { "label": "Dark – yellow roads", "value": "dark-matter-yellow-roads" },
          { "label": "Light – Positron", "value": "positron" },
          { "label": "Light – grey", "value": "osm-bright-grey" },
          { "label": "Toner (grey)", "value": "toner-grey" }
        ]
      },
      {
        "type": "toggle",
        "messageKey": "SHOW_LABELS",
        "label": "Show place / road names",
        "defaultValue": true
      },
      {
        "type": "text",
        "defaultValue": "Map names are shown in the map's own local language."
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
        "type": "color",
        "messageKey": "BG_COLOR",
        "label": "Background colour",
        "defaultValue": "000000",
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
        "defaultValue": true
      }
    ]
  },

  {
    "type": "submit",
    "defaultValue": "Save settings"
  }
];
