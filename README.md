# Map Face

A Pebble watchface that uses the **Geoapify** Static Maps API to show a live,
monochrome map of your surroundings (black background, grey road network) as
the watchface background, with the **time and date** rendered on top in a
clean, designed overlay.

* Hourly location updates that **prioritise fast WiFi / cell-tower
  positioning** (falling back to Geoapify IP geolocation).
* The map is only re-downloaded when you move farther than a configurable
  distance from the current map's centre — saving battery and data.
* Fully configurable via [`@rebble/clay`](https://www.npmjs.com/package/@rebble/clay)
  `^1.0.10`: API key, refresh distance, follow-current vs. fixed location,
  zoom, map style, watchface colours, and whether place / road names are shown.
* UI is in **English**; map labels follow the map's own **local language**
  (as provided by Geoapify).

Supported platforms: **aplite, basalt, chalk, diorite, emery, flint, gabbro**.

---

## How it works

Pebble cannot fetch or process map imagery itself, so the work is split:

```
  ┌─────────────── Phone (PebbleKit JS) ───────────────┐      ┌──── Watch (C) ────┐
  │ 1. Resolve location (WiFi/cell → IP fallback)      │      │                   │
  │ 2. If moved > refresh distance → download PNG map  │ ───▶ │ Reassemble PNG    │
  │    from Geoapify Static Maps API                   │ AppMessage│ Decode + draw │
  │ 3. Stream the PNG to the watch in ~1 KB chunks     │ chunks │ map + time/date  │
  └─────────────────────────────────────────────────────┘      └───────────────────┘
```

* **Location** — `navigator.geolocation.getCurrentPosition` with
  `enableHighAccuracy: false`, which uses the phone's network (WiFi / cell)
  positioning rather than GPS. If that fails, it falls back to the Geoapify
  `ipinfo` endpoint.
* **Map** — `https://maps.geoapify.com/v1/staticmap` with the `dark-matter`
  style (black background, grey roads) by default, centred on your location and
  sized to your watch's screen. Labels are hidden with `styleCustomization`
  when "Show place / road names" is off.
* **Conversion** — Geoapify returns a 24-bit truecolor PNG, which Pebble's
  `gbitmap_create_from_png_data` cannot decode (it only supports palettized /
  greyscale PNG). The phone decodes it, reduces every pixel to one of four
  brightness levels, paints each level with the user's **Map colours**, and
  re-encodes a 2-bit (4-colour) **indexed PNG** (`upng-js` + `pako`, pure JS —
  no canvas needed) before sending it.
* **Transfer** — every outbound AppMessage (status, config, image chunks) goes
  through one serialised queue so nothing overlaps; the indexed PNG is streamed
  ~1 KB at a time, reassembled, signature-checked, and decoded with
  `gbitmap_create_from_png_data` (with a bounded auto-retry on corruption).
* **Refresh cadence** — the watch asks the phone for an update on a configurable
  interval (and on launch / whenever settings are saved). The phone only
  re-downloads the map if you have moved beyond the configured distance.

### On-watch status line

A small status line at the bottom of the face surfaces what the pipeline is
doing, so you can diagnose problems without a computer:

| Status | Meaning |
| --- | --- |
| `Set API key` | No Geoapify API key configured. |
| `Locating...` | Resolving location (WiFi/cell, then IP fallback). |
| `No location` | Location could not be resolved. |
| `Map up to date` | Within refresh distance; existing map kept. |
| `Map HTTP <code>` | Geoapify returned an error (e.g. 401 = bad key). |
| `Network error` | The map download failed at the network level. |
| `Loading map...` | Receiving the image stream from the phone. |
| `Img buffer fail` | Not enough memory to buffer the incoming PNG. |
| `Decode failed` | PNG could not be decoded (often low memory). |
| _(blank)_ | Map decoded and shown successfully. |

### The overlay

Time (large `LECO` numerals) and date are drawn over the map with a 1 px drop
shadow so they stay legible over any map content, separated by a short accent
divider. Time, date, and background colours, the date, and the centre location
dot are all configurable.

---

## Project layout

```
mapwatchface/
├── package.json        # Pebble manifest + @rebble/clay dependency + messageKeys
├── wscript             # Pebble build script
├── src/
│   ├── c/
│   │   └── main.c      # Watch app: drawing, config, PNG reassembly/decode
│   └── pkjs/
│       ├── index.js    # PebbleKit JS: location, refresh logic, PNG streaming
│       └── config.js   # Clay configuration page
└── README.md
```

---

## Building & installing

You need the Pebble SDK (via the Rebble tooling). This repo cannot be built in
environments without the SDK.

```bash
# Install JS dependencies (@rebble/clay, upng-js, pako)
npm install

# Build
pebble build

# Install to an emulator…
pebble install --emulator basalt

# …or to a physical watch over the phone
pebble install --phone <PHONE_IP>
```

On first run, open the watchface **Settings** in the Pebble app and paste your
free Geoapify API key (get one at <https://www.geoapify.com/>, 3,000
requests/day on the free tier). The map appears once a location is resolved.

---

## Configuration options (Clay)

| Setting | Description |
| --- | --- |
| **API Key** | Your Geoapify API key. |
| **Location source** | Follow current location, or use a fixed lat/lon. The fixed lat/lon fields and the check interval show/hide based on this. |
| **Fixed latitude / longitude** | Shown only in fixed-location mode. Fixed mode never auto-refreshes. |
| **Location check interval** | Follow mode only: how often the watch checks your location, 15–360 min (default 60). |
| **Refresh distance (m)** | Re-download the map only after moving this far (50–5000 m). |
| **Zoom level** | Map zoom (10–18). |
| **Show place / road names** | Toggle map labels (local-language). |
| **Map colours** | Recolour the map's 4 layers: Land / Water / Roads / Labels. |
| **Time / Date / Background colour** | Watchface overlay colours. |
| **Show date** | Toggle the date line. |
| **Show location dot** | Toggle the centre marker. |
| **Show status messages** | Toggle the bottom status line (Locating / Loading…). |

---

## Notes & limitations

* **Colours & memory.** The phone reduces the map to four brightness levels and
  paints them with the user's **Map colours**, producing a 2-bit (4-colour)
  indexed PNG. This is tiny to transfer and decodes into a small palettized
  bitmap, so it fits comfortably even on emery's large screen (and changing a
  colour just re-fetches and re-bakes — no watch-side palette code). The old
  bitmap is freed before the new one is decoded to avoid holding two at once.
* **Layer recolouring.** The phone fetches the style's JSON (cached), and from
  its layer list builds a `styleCustomization` that paints each group as one of
  four canonical greys — land `#000000`, water `#555555`, roads `#AAAAAA`,
  labels `#FFFFFF` (every road casing *and* inner line is coloured so roads are
  solid, not hollow). This is sent as a **POST** request (the customization is
  too large for a URL). The phone then snaps each pixel to the nearest of the
  four greys and paints the user's palette. Hiding labels sets the symbol
  layers to `none`.
* **Attribution.** Geoapify burns an attribution band onto the bottom of the
  static image. The app requests the map taller and centre-crops it on the
  watch so the band is off-screen while the location stays centred. Note that
  the Geoapify free tier expects attribution to remain visible — keep this in
  mind for any public distribution.
* **Road visibility.** A gamma curve lifts dark tones before the map is bucketed
  into brightness levels, so dim roads land in a visible level instead of the
  background. Adjust the level thresholds (`LEVEL_THRESHOLDS`) in `index.js` to
  taste.
* **Launch cache.** The last map PNG is saved in persistent storage (chunked
  across keys, within the 4 KB quota) and shown immediately on launch, so the
  previous map appears instead of a black screen while a fresh one loads. Maps
  too large to fit are simply not cached.
* Screen sizes per platform are set in `PLATFORM_SIZES` in `index.js`
  (`gabbro` is 260×260 round; `flint` defaults to 144×168 — adjust if its
  actual resolution differs).
* Geoapify free-tier usage: hourly checks + distance-gated downloads keep
  requests well within 3,000/day.
