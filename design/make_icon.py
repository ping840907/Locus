#!/usr/bin/env python3
"""Generate the 25x25 pixel icon for Map Face (Pebble watchface).

Palette mirrors the app's canonical 4-grey map buckets plus the
location-dot red:
  K = #000000 land / background
  W = #555555 water
  R = #AAAAAA roads
  T = #FFFFFF time digits / dot ring (labels bucket)
  D = #FF0000 location dot core
"""
import struct, zlib

SIZE = 25
K, W, R, T, D = '#000000', '#555555', '#AAAAAA', '#FFFFFF', '#FF0000'

grid = [[K] * SIZE for _ in range(SIZE)]

def px(x, y, c):
    if 0 <= x < SIZE and 0 <= y < SIZE:
        grid[y][x] = c

# --- water: a lake with a diagonal coastline, bottom-left ---
for y in range(17, 25):
    for x in range(0, (y - 17) + 2):
        px(x, y, W)

# --- road network (1px grey streets) ---
for x in range(SIZE):          # horizontal streets
    px(x, 2, R)
    px(x, 12, R)
for x in range(6, SIZE):
    px(x, 21, R)
for y in range(0, 20):         # vertical street ending at the lake shore
    px(4, y, R)
for y in range(SIZE):          # vertical street, right side
    px(20, y, R)
# diagonal avenue, bottom-right
for i in range(11):
    px(24 - i, 14 + i, R)

# --- time "10:08" in a 3x5 face, white over a 1px black halo ---
FONT = {
    '1': [".#.", "##.", ".#.", ".#.", "###"],
    '0': ["###", "#.#", "#.#", "#.#", "###"],
    '8': ["###", "#.#", "###", "#.#", "###"],
    ':': [".", "#", ".", "#", "."],
}
TEXT_Y = 5
glyph_x = 4
# halo: clear roads around the digits (the app's drop-shadow legibility)
for y in range(TEXT_Y - 1, TEXT_Y + 6):
    for x in range(3, 22):
        px(x, y, K)
for ch in "10:08":
    rows = FONT[ch]
    for gy, row in enumerate(rows):
        for gx, cell in enumerate(row):
            if cell == '#':
                px(glyph_x + gx, TEXT_Y + gy, T)
    glyph_x += len(rows[0]) + 1

# --- centre location dot: white ring, red core (as drawn in main.c) ---
for y in range(15, 19):
    for x in range(11, 15):
        px(x, y, T)
for x, y in ((11, 15), (14, 15), (11, 18), (14, 18)):  # round the corners
    px(x, y, K)
for y in (16, 17):
    for x in (12, 13):
        px(x, y, D)

# --- write PNG (no deps) ---
def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

def write_png(path, pixels, scale=1):
    w = h = SIZE * scale
    raw = b''
    for y in range(h):
        raw += b'\x00'
        for x in range(w):
            c = pixels[y // scale][x // scale]
            raw += bytes(int(c[i:i+2], 16) for i in (1, 3, 5))
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(chunk(b'IEND', b''))

write_png('/home/user/mapwatchface/design/icon-25.png', grid)
write_png('/home/user/mapwatchface/design/icon-25@16x.png', grid, scale=16)

# ASCII dump for the doc
CHARS = {K: '.', W: '~', R: '#', T: '@', D: 'O'}
for row in grid:
    print(''.join(CHARS[c] for c in row))
