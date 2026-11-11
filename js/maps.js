// =====================================================================
// Maps: each place she can explore, with what's fixed about it. Shared by
// the game and the map index. Needs pixels.js (for hash) loaded first.
//
// Positions are in metres, x running east and y running south (so north
// is up). Bearings are compass bearings in radians: 0 north, π/2 east,
// π south, 3π/2 west.
//
// Terrain and enemies are scattered random but repeatable: the map is
// split into squares `cell` metres across (bigger ones for terrain), and
// each square may hold one thing, its spot, kind and size all decided by
// hash() — so everything is always in the same place, and nothing has to
// be stored (see terrainInCell and enemyInCell). Enemies keep clear of
// terrain, and terrain keeps clear of where she starts.
// =====================================================================
const MAPS = {
  openSea: {
    name: "Open sea",
    description: "A sunset sea, wrapping round at the edges, scattered with karst towers and rocky islets. Squids rise from the waves.",
    size: 4000,                     // metres each way
    wraps: true,                    // off one edge and back in at the opposite one
    start: { x: 2000, y: 2000 },    // mid-sea
    sunBearing: 1.5 * Math.PI,      // the sun sets due west
    moonBearing: 0.75 * Math.PI,    // the moon hangs southeast
    windBearing: 0,                 // the wind blows north
    terrain: {
      cell: 250,                    // metres per square (the size must divide evenly)
      chance: 0.35,                 // the chance a square has something
      kinds: { karst: 0.45, islet: 0.55 }, // which TERRAIN, and how likely each is
      clearance: 20,                // metres round each that enemies keep clear of
      clearStart: 120,              // metres round the start kept clear
    },
    enemies: {
      cell: 50,                     // metres per square (the size must divide evenly)
      chance: 0.55,                 // the chance a square has an enemy
      kinds: ["lancer", "sprawler"], // which ENEMIES, equally likely
    },
  },
};

// The distance between two spots, the short way round if the map wraps.
function mapDistance(map, ax, ay, bx, by) {
  let dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  if (map.wraps) { dx = Math.min(dx, map.size - dx); dy = Math.min(dy, map.size - dy); }
  return Math.hypot(dx, dy);
}

// The terrain in square (i, j) of a map, or null: which kind, how big
// (0 … 1, smallest to largest of its kind's range), and where in the
// square (fx, fy, each 0 … 1 across it) and on the map (x, y, metres).
function terrainInCell(map, i, j) {
  const t = map.terrain;
  if (!t || hash(i * 5 + 17, j * 3 + 29) >= t.chance) return null;
  const fx = 0.15 + 0.7 * hash(i + 211, j + 19), fy = 0.15 + 0.7 * hash(i + 23, j + 409);
  const x = (i + fx) * t.cell, y = (j + fy) * t.cell;
  if (mapDistance(map, x, y, map.start.x, map.start.y) < t.clearStart) return null;
  let pick = hash(i + 83, j + 61), kind = null;
  for (const k in t.kinds) { kind = k; if ((pick -= t.kinds[k]) < 0) break; }
  return { kind, size: hash(i + 7, j + 523), fx, fy, x, y };
}

// The terrain within `within` metres of a spot on the map, or null.
function terrainNear(map, x, y, within) {
  const t = map.terrain;
  if (!t) return null;
  const N = map.size / t.cell, ci = Math.floor(x / t.cell), cj = Math.floor(y / t.cell);
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      if (!map.wraps && (i < 0 || j < 0 || i >= N || j >= N)) continue;
      const found = terrainInCell(map, ((i % N) + N) % N, ((j % N) + N) % N);
      if (found && mapDistance(map, x, y, found.x, found.y) < within) return found;
    }
  }
  return null;
}

// The enemy in square (i, j) of a map, or null: which kind, how big
// (relative to its kind's usual size), which of its kind's forms and
// colorways (as 0 … 1 rolls; see ENEMIES), and where in the square (fx,
// fy, each 0 … 1 across it).
function enemyInCell(map, i, j) {
  const e = map.enemies;
  if (hash(i * 3 + 11, j * 7 + 5) >= e.chance) return null;
  const fx = 0.1 + 0.8 * hash(i + 101, j + 7), fy = 0.1 + 0.8 * hash(i + 13, j + 203);
  if (map.terrain && terrainNear(map, (i + fx) * e.cell, (j + fy) * e.cell, map.terrain.clearance)) return null; // no squids inside a mountain
  return {
    kind: e.kinds[Math.min(e.kinds.length - 1, Math.floor(hash(i + 57, j + 91) * e.kinds.length))],
    size: hash(i + 5, j + 311), // 0 … 1, smallest to largest of its kind's range
    form: hash(i + 223, j + 17),
    colorway: hash(i + 71, j + 409),
    fx, fy,
  };
}
