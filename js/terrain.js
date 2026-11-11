// =====================================================================
// Terrain: the fixed things standing out of the water — mountains and
// rocks, and (later) whatever else a map has. Shared by the game and the
// map index. Needs pixels.js loaded first.
//
// Each entry in TERRAIN has its metadata (name, kind of thing, a
// description), its usual size and size range, and draw(), which paints
// it into a pixel target just as an enemy's does (see enemies.js):
// standing centered on x with its bottom at `bottom`, `unitPx` screen
// pixels per size unit, hazed by distance and dithered in by `fadeIn`.
//
// So far there are two: a tall, narrow karst tower like those off the
// coast of Vietnam, and a short, jagged rocky islet. They're obstacles —
// she'll have to fly round them — but for now they're only drawn. Each
// shape is worked out once, large, into a sprite of materials.
// =====================================================================
const TERRAIN_SPRITE = 100; // sprite pixels per size unit

// Far off they fade toward the haze over the water, like everything else.
const TERRAIN_HAZE = "#6f6496", TERRAIN_HAZE_MAX = 0.8, TERRAIN_HAZE_LEVELS = 12;

const smoothstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Karst tower: grey-violet limestone, warm where the low sun catches its
// left side and dark on its right, streaked by dark drip stains and
// lined with bedding cracks, pocked with little caves, capped and
// ledged with jungle, and undercut into a dark notch where the sea has
// worn it away at the waterline.
const KA_ROCK = 1, KA_SHADE = 2, KA_LIGHT = 3, KA_STREAK = 4, KA_GREEN = 5, KA_LEAF = 6, KA_NOTCH = 7;
const KARST_COLORS = ["#1c1530", "#6e5f7a", "#463a5c", "#b38a88", "#3a2f4f", "#2f4a40", "#557552", "#211a33"]; // [0] is the outline
const KARST_MATERIALS = ["outline", "rock", "shade", "sunlit rock", "stain", "jungle", "sunlit leaves", "notch and caves"];

const KARST_SHAPE = {
  w: 1.5, h: 4.2,
  at(x, y) {
    const u = y / this.h;                                  // 0 at the crown, 1 at the water
    const lean = 0.07 * Math.sin(u * 2.6 + 0.4);
    // Half its width: bulging here and there, a rounded crown, and the
    // undercut notch just above the water.
    let hw = 0.56 * (1 + 0.1 * Math.sin(u * 6.5 + 1));
    if (u < 0.09) hw *= Math.sqrt(1 - ((0.09 - u) / 0.09) ** 2);
    hw *= 1 - 0.24 * smoothstep(0.86, 0.96, u);
    const rough = (seed) => 0.2 * (smoothNoise(y * 2.5, seed) - 0.5) + 0.09 * (smoothNoise(y * 7, seed + 1) - 0.5) + 0.04 * (smoothNoise(y * 20, seed + 2) - 0.5);
    const left = lean - hw - rough(1) * Math.min(1, u * 8);
    const right = lean + hw + rough(4) * Math.min(1, u * 8);
    if (x < left || x > right) return 0;
    const across = (x - left) / (right - left);            // 0 on the sunlit left, 1 on the shaded right

    // Jungle: a ragged canopy over the crown, and tufts along a few ledges.
    const canopy = 0.32 + 0.16 * smoothNoise(x * 7, 5) + 0.12 * smoothNoise(x * 19, 6);
    const ledge = smoothNoise(y * 2.2, 7) > 0.74 && smoothNoise2(x * 9, y * 9, 8) > 0.42;
    if (y < canopy || ledge) {
      const leaves = smoothNoise2(x * 16, y * 16, 9);
      if (leaves < 0.18) return KA_SHADE;
      return across < 0.45 && leaves > 0.5 ? KA_LEAF : KA_GREEN;
    }
    if (u > 0.955) return KA_NOTCH;                         // in the undercut's shadow
    if (smoothNoise2(x * 6, y * 5, 10) > 0.86) return KA_NOTCH; // a cave mouth
    // Drip stains: dark vertical streaks, broken here and there.
    if (smoothNoise(x * 16 + 2 * smoothNoise(y * 1.5, 11), 12) > 0.74 && smoothNoise(y * 2 + x * 3, 13) > 0.3) return KA_STREAK;
    // Bedding cracks: thin, wavering, roughly level.
    if ((y * 5 + 0.6 * smoothNoise(x * 3, 14)) % 1 < 0.035 && smoothNoise(x * 5 + y, 15) > 0.45) return KA_STREAK;
    const light = 0.2 + 0.1 * (smoothNoise(y * 6, 16) - 0.5);  // the sunlit band wavers with the rock
    if (across < light) return KA_LIGHT;
    if (across > 0.68 + 0.1 * (smoothNoise(y * 6, 17) - 0.5)) return KA_SHADE;
    return KA_ROCK;
  },
};

// Rocky islet: a low heap of jagged, faceted peaks — lit on their left
// faces and shaded on their right — split by cracks, with moss low down,
// dark wet rock along the water, and a fringe of foam.
const IS_ROCK = 1, IS_SHADE = 2, IS_LIGHT = 3, IS_CRACK = 4, IS_MOSS = 5, IS_WET = 6, IS_FOAM = 7;
const ISLET_COLORS = ["#1c1530", "#5d5470", "#3b3350", "#9c8090", "#2a2340", "#44584a", "#2e2944", "#d8cfe8"]; // [0] is the outline
const ISLET_MATERIALS = ["outline", "rock", "shade", "sunlit rock", "crack", "moss", "wet rock", "foam"];

const ISLET_SHAPE = {
  w: 2.5, h: 1.3,
  // Its peaks: [across, height, steepness].
  peaks: [[-0.3, 1.24, 1.7], [0.42, 0.86, 1.5], [-0.92, 0.4, 1.5], [0.88, 0.4, 1.4], [0.12, 0.7, 2.2]],
  at(x, y) {
    const up = this.h - y;                                 // height above the water
    let top = -1, peak = 0;
    this.peaks.forEach((p, i) => { const t = p[1] - Math.abs(x - p[0]) * p[2]; if (t > top) { top = t; peak = i; } });
    // Jagged ridges: rolling lumps, and blocky steps where slabs have broken off.
    top += 0.12 * (smoothNoise(x * 6, 21) - 0.5) + 0.07 * (hash(Math.floor(x * 14), 22) - 0.5) + 0.03 * (smoothNoise(x * 30, 20) - 0.5);
    if (top <= 0 || up > top) return 0;
    if (up < 0.045) return smoothNoise2(x * 40, y * 60, 23) > 0.5 ? IS_FOAM : IS_WET;
    if (up < 0.13 + 0.05 * smoothNoise(x * 7, 24)) return IS_WET;
    // Cracks: short broken runs, only here and there.
    if (smoothNoise2(x * 6, y * 6, 30) > 0.6 && (smoothNoise(x * 13 + y * 5, 28) > 0.86 || smoothNoise(x * 11 - y * 7, 29) > 0.88)) return IS_CRACK;
    if (up < 0.45 && smoothNoise2(x * 7, y * 7, 25) * 0.6 + smoothNoise2(x * 24, y * 24, 27) * 0.4 > 0.6) return IS_MOSS;
    // Facets: bands following the slope down from the ridge, each lit or
    // shaded by which side of its peak it's on.
    const below = top - up;
    const band = Math.floor(below * 9 + 2 * smoothNoise(x * 4, 26));
    const sunny = x < this.peaks[peak][0];
    if (below < 0.03) return sunny ? IS_LIGHT : IS_ROCK;    // the ridge line itself
    const h = hash(band + 37, peak * 13 + (sunny ? 1 : 2));
    if (sunny) return h < 0.6 ? IS_LIGHT : IS_ROCK;
    return h < 0.7 ? IS_SHADE : IS_ROCK;
  },
};

const TERRAIN_SPRITES = { karst: buildSprite(KARST_SHAPE, TERRAIN_SPRITE), islet: buildSprite(ISLET_SHAPE, TERRAIN_SPRITE) };

function makeTerrainDraw(colors) {
  const palettes = hazePalettes(colors, TERRAIN_HAZE, TERRAIN_HAZE_MAX, TERRAIN_HAZE_LEVELS);
  return function (target, x, bottom, unitPx, haze, fadeIn = 1) {
    const palette = palettes[Math.round(Math.max(0, Math.min(1, haze)) * (TERRAIN_HAZE_LEVELS - 1))];
    drawSprite(target, this.sprite, palette, x, bottom, (unitPx * this.unit) / TERRAIN_SPRITE, fadeIn);
  };
}

// Size units are wave lengths in the game, as for enemies: she's about
// 0.6 of one tall, a lancer squid about 0.75.
const TERRAIN = {
  karst: {
    name: "Karst tower",
    family: "Mountain",
    description: "A tall, narrow limestone tower, like those off Vietnam's coast: sheer streaked sides, a cap of jungle, and a notch worn in at the waterline.",
    unit: 1,                 // size units per sprite unit
    sizes: [0.8, 1.25],      // smallest and largest, relative to its usual size
    sprite: TERRAIN_SPRITES.karst,
    shape: KARST_SHAPE,
    colors: KARST_COLORS, materials: KARST_MATERIALS,
    draw: makeTerrainDraw(KARST_COLORS),
  },
  islet: {
    name: "Rocky islet",
    family: "Rock",
    description: "A small, low mountain of jagged, faceted rock, cracked and mossy, with wet stone and foam round its foot.",
    unit: 1,
    sizes: [0.75, 1.3],
    sprite: TERRAIN_SPRITES.islet,
    shape: ISLET_SHAPE,
    colors: ISLET_COLORS, materials: ISLET_MATERIALS,
    draw: makeTerrainDraw(ISLET_COLORS),
  },
};
