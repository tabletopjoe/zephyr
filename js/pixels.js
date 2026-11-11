// =====================================================================
// Pixel helpers shared by every page: colors in the 32-bit pixel format,
// ordered dithering, and repeatable noise. Plain script (not a module), so
// pages still work opened straight from disk.
// =====================================================================

// "#rrggbb" → the 32-bit pixel format ImageData uses (bytes are A,B,G,R).
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
}

// Blend two "#rrggbb" colors; t = 0 gives a, t = 1 gives b (as a pixel).
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return rgb("#" + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0"));
}

// A 4×4 Bayer matrix: per-pixel thresholds that turn a smooth blend
// between two colors into a checkerboard-ish pattern — the classic
// pixel-art way to fake gradients with few colors.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// Same inputs → same "random" number in [0, 1), for sparkle and texture.
function hash(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth repeatable noise in [0, 1): hash() values at whole numbers,
// eased between them — in one dimension, and in two.
function smoothNoise(t, seed) {
  const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - s) + hash(i + 1, seed) * s;
}
function smoothNoise2(x, y, seed) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const at = (a, b) => hash(a + seed * 1013, b - seed * 571);
  const top = at(i, j) * (1 - sx) + at(i + 1, j) * sx, bottom = at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

// ---------------------------------------------------------------------
// Sprites: a shape worked out once, large, into a grid of materials
// (0 is empty), then each frame scaled nearest-neighbour to the size
// wanted, outlined, and painted from a palette (palette[0] is the
// outline, palette[m] material m's color).
// ---------------------------------------------------------------------

// Works a shape — { w, h }, its size in size units, and at(x, y), the
// material at x across from its middle and y down from its top — into a
// sprite of `perUnit` sprite pixels per size unit.
function buildSprite(shape, perUnit) {
  const w = Math.ceil(shape.w * perUnit), h = Math.ceil(shape.h * perUnit);
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data[y * w + x] = shape.at((x + 0.5) / perUnit - shape.w / 2, (y + 0.5) / perUnit);
  }
  return { w, h, data, perUnit };
}

// Palettes fading `colors` toward a haze color, in `levels` steps from
// none to `max` — for things far off over the water.
function hazePalettes(colors, haze, max, levels) {
  return Array.from({ length: levels }, (_, l) => colors.map((c) => mix(c, haze, (l / (levels - 1)) * max)));
}

// Draws a sprite into `target` — { buf, w, h }, buf a Uint32Array of
// w × h pixels — at `k` target pixels per sprite pixel, standing centered
// on x with its bottom at `bottom`, outlined, and dithered in by `fadeIn`
// (0 … 1). Only the part on the target is worked out, so it can be any
// size. A sprite may have a `box` ({ x0, y0, x1, y1 }, sprite pixels)
// that everything in it lies within (with a clear pixel round it): then
// only that part is looked at.
function drawSprite(target, sprite, palette, x, bottom, k, fadeIn = 1) {
  const { buf, w: TW, h: TH } = target;
  const w = Math.max(1, Math.round(sprite.w * k)), h = Math.max(1, Math.round(sprite.h * k));
  const x0 = Math.round(x - w / 2), y0 = Math.round(bottom - h);
  if (x0 + w <= 0 || x0 >= TW || y0 + h <= 0 || y0 >= TH) return;
  let gx0 = Math.max(0, -x0), gx1 = Math.min(w, TW - x0), gy0 = Math.max(0, -y0), gy1 = Math.min(h, TH - y0);
  const box = sprite.box;
  if (box) {
    gx0 = Math.max(gx0, Math.floor(box.x0 * k)); gx1 = Math.min(gx1, Math.ceil(box.x1 * k));
    gy0 = Math.max(gy0, Math.floor(box.y0 * k)); gy1 = Math.min(gy1, Math.ceil(box.y1 * k));
    if (gx0 >= gx1 || gy0 >= gy1) return;
  }
  // The sprite column (and row, times the sprite's width) each target
  // pixel samples, one beyond the drawn part each way for the outline
  // test; -1 is outside the sprite.
  const cols = new Int32Array(gx1 - gx0 + 2), rows = new Int32Array(gy1 - gy0 + 2);
  for (let gx = gx0 - 1; gx <= gx1; gx++) cols[gx - gx0 + 1] = gx < 0 || gx >= w ? -1 : Math.min(sprite.w - 1, Math.floor((gx + 0.5) / k));
  for (let gy = gy0 - 1; gy <= gy1; gy++) rows[gy - gy0 + 1] = gy < 0 || gy >= h ? -1 : Math.min(sprite.h - 1, Math.floor((gy + 0.5) / k)) * sprite.w;
  const data = sprite.data;
  const empty = (c, r) => c < 0 || r < 0 || !data[r + c];
  for (let gy = gy0; gy < gy1; gy++) {
    const ri = gy - gy0 + 1, r = rows[ri], sy = y0 + gy, line = sy * TW;
    for (let gx = gx0; gx < gx1; gx++) {
      const ci = gx - gx0 + 1, c = cols[ci], m = data[r + c];
      if (!m) continue;
      const sx = x0 + gx;
      if (fadeIn < 1 && bayer(sx, sy) >= fadeIn) continue;
      const edge = empty(cols[ci - 1], r) || empty(cols[ci + 1], r) || empty(c, rows[ri - 1]) || empty(c, rows[ri + 1]);
      buf[line + sx] = palette[edge ? 0 : m];
    }
  }
}
