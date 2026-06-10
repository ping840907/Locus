# Locus — appstore listing

## Short description
A live, monochrome map of wherever you are — with the time on top.

## Description

Locus turns your wrist into a living map. It shows a clean, monochrome map
of your surroundings — a black background with a glowing road network — and
lays a crisp, designed time and date over the top. As you move through the
world, the map quietly follows.

It's inspired by **"Places"** from *Looks*, ustwo's beautiful Wear OS watch
face collection — reimagined for Pebble:
https://ustwo.com/work/android/wear/

**Features**
- A live map of your location as the watchface background, updated as you move.
- Recolour every layer — land, water, roads and labels — to make the map your
  own. Black & white watches get black/white plus two dither and diagonal-line
  tones.
- Large, legible time with a date line and a centre marker for your position.
- Tune the zoom, how often it checks your location, and whether place/road
  names are shown (names appear in the map's own local language).
- Battery- and data-friendly: it only re-downloads the map when you actually
  move, and reuses a cached map for launches and colour tweaks.
- Runs across the Pebble lineup: aplite, basalt, chalk, diorite, emery, and the
  new flint and gabbro.

**Getting started — free API key**

Locus draws its maps with Geoapify, so you'll need a free API key:

1. Go to https://www.geoapify.com/ and create a free account.
2. Create a project and copy its **API key** (the free tier includes 3,000
   requests/day — far more than this watchface needs).
3. Open **Locus → Settings** in the Pebble app and paste the key in.

Your map appears as soon as your location is found.

**Privacy**

Don't want to share your live location? In Settings choose **"Use a fixed
location"** and enter any latitude/longitude. The watchface will only ever show
that spot, and no positioning is used at all.

---

Map data © [Geoapify](https://www.geoapify.com/), © OpenMapTiles,
© OpenStreetMap contributors. Released under the MIT License.
