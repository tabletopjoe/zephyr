// =====================================================================
// Enemies: what each one is and how it looks. Shared by the game and the
// enemy index. Needs pixels.js loaded first.
//
// Each entry in ENEMIES has its metadata (name, family, which slash it's
// weak to, a description), its usual size and size range, and draw(),
// which paints it into a pixel target — { buf, w, h }, where buf is a
// Uint32Array of w × h pixels — standing centered on x with its bottom at
// `bottom`, `unitPx` screen pixels per size unit, hazed by distance
// (`haze` 0 … 1) and dithered in by `fadeIn` (0 … 1).
//
// So far there's one family, squids — enchanted alien squids, more
// tentacle than body, with clusters of eyes like a spider's — in two
// kinds: tall, narrow lancers (cut them across with a horizontal slash)
// and short, wide sprawlers (chop them with a vertical one), each in a
// few forms and colorways. Each form's shape is worked out once, large,
// into a sprite of materials, which draw() scales down, outlines, and
// paints in its colorway (with the sprite helpers in pixels.js).
// =====================================================================

// Materials: the body, darker at the sides and lighter down the middle,
// with darker freckles; clusters of glowing eyes, spider-like, each
// dark-rimmed with a round pupil and a glint; and pale suckers down the
// inside of every arm.
const SQ_BODY = 1, SQ_SHADE = 2, SQ_LIGHT = 3, SQ_FIN = 4, SQ_EYE = 5, SQ_PUPIL = 6, SQ_SPOT = 7, SQ_SUCKER = 8, SQ_RIM = 9, SQ_GLINT = 10;
const SQUID_MATERIALS = ["outline", "body", "shade", "light", "fin", "eye", "pupil", "freckle", "sucker", "arm edge", "glint"];
// Their colorways — any squid can come in any of them — each a color per
// material ([0] is the outline).
const SQUID_COLORWAYS = [
  { name: "Coral", colors: ["#2a1630", "#c2503f", "#8a3040", "#e3826a", "#a8404a", "#ffd65a", "#1a0f1f", "#7a2638", "#f0b49a", "#4a1a30", "#fff6d8"] }, // coral-red, yellow eyes
  { name: "Bone", colors: ["#2a1a2e", "#e4d8cf", "#ad9ca4", "#fbf5ec", "#c9b9b8", "#e8283c", "#2a0a14", "#c2aead", "#f2c4c0", "#76637a", "#ffe2e2"] }, // whiteish, red eyes
  { name: "Coal", colors: ["#050308", "#26212c", "#16121a", "#3f3848", "#1d1924", "#ff78b6", "#1a0612", "#110e15", "#5c4b60", "#0b090f", "#ffe6f3"] }, // coal-black, pink eyes
  { name: "Violet", colors: ["#1e1030", "#7a4aa8", "#4e2c78", "#a679cc", "#653c90", "#ffbe8c", "#2a0f24", "#5d3488", "#d8b2e6", "#2e1a4a", "#fff2dc"] }, // purple, yellow-pink eyes
];
// Far off they fade toward the haze over the water, like the waves do.
const SQUID_HAZE = "#6f6496", SQUID_HAZE_MAX = 0.75, HAZE_LEVELS = 12;
for (const way of SQUID_COLORWAYS) way.palettes = hazePalettes(way.colors, SQUID_HAZE, SQUID_HAZE_MAX, HAZE_LEVELS);

// A tentacle: a tapering tube that writhes — its heading swinging back
// and forth along its length — and spirals tight at the tip, as points
// (x, y, radius, how far along) with a bounding box. It sets off from
// (x0, y0) heading `a0` (0 is straight down, π/2 right, π up), `len`
// long, `r0` thick at the root and `r1` at the tip; `amp` and `freq` are
// how far and how often it swings, `phase` where in the swing it starts,
// and `curl` how far it winds round from `curlFrom` of the way along to
// the tip (positive turns toward up on the right) — wound tight, it
// curls back in toward the body.
//
// Arms move: poseArm works out where an arm's points are at a moment —
// writhing (its swing travelling along it), and, as `motion` says,
// lashing (straightening and striking out toward `aim`, an angle in the
// same sense as a0) or flinching (coiling up tight). At time 0, still,
// it's the resting shape the kinds are designed in.
const ARM_N = 48;          // segments along each arm
const WRITHE_PACE = 1.6;   // how fast the swing travels along the arms (radians of phase a second)
const LASH_REACH = 0.7;    // the least length an arm stretches to when lashing (size units)
const STILL = { lash: 0, aim: 0, flinch: 0 };
function writhe(x0, y0, a0, len, r0, r1, amp, freq, phase, curl, curlFrom = 0.35) {
  const arm = {
    x0, y0, a0, len, r0, r1, amp, freq, phase, curl, curlFrom,
    suckers: Math.round(len * 30),
    pace: 0.7 + 0.6 * hash(Math.round(phase * 100) + 7, Math.round(len * 1000)), // each writhes at its own speed
    pts: new Float32Array((ARM_N + 1) * 4),  // x, y, radius and how far along (0 … 1), per point
    box: { x0: 0, y0: 0, x1: 0, y1: 0 },
  };
  poseArm(arm, 0, STILL);
  arm.restBox = { ...arm.box };
  const tip = ARM_N * 4;
  arm.reach = Math.atan2(arm.pts[tip] - x0, arm.pts[tip + 1] - y0); // which way its tip lies from its root, at rest
  return arm;
}
// `n` is how many segments to work out — fewer for small, distant squids
// (it's how many segments rasterArm then stamps, too).
function poseArm(arm, t, motion, n = ARM_N) {
  const { pts, box } = arm;
  arm.n = n;
  const L = motion.lash, F = motion.flinch;
  // Lashing turns it toward the aim (the short way round), uncurls and
  // stretches it, and steadies its swing; flinching curls it in.
  const turn = Math.atan2(Math.sin(motion.aim - arm.a0), Math.cos(motion.aim - arm.a0));
  const a0 = arm.a0 + turn * L;
  const curl = arm.curl * (1 - 0.85 * L) * (1 + 0.6 * F);
  const len = arm.len * (1 - 0.2 * F) + L * Math.max(0.45 * arm.len, LASH_REACH - arm.len); // even a short arm reaches LASH_REACH
  const amp = arm.amp * (1 - 0.6 * L);
  const phase = arm.phase + t * WRITHE_PACE * arm.pace;
  const step = len / n, cf = arm.curlFrom, w = 2 * Math.PI * arm.freq;
  // The swing's average over the points, taken off so the arm keeps to
  // its heading overall (the sum of a run of evenly stepped sines).
  const d = w / n;
  const mean = Math.abs(Math.sin(d / 2)) < 1e-9 ? Math.sin(phase)
    : (Math.sin(n * d / 2) / Math.sin(d / 2)) * Math.sin(phase + (n - 1) * d / 2) / n;
  // The swing at each point, stepped along by turning (sin, cos) through
  // d each time rather than worked out afresh.
  let sw = Math.sin(phase), cw = Math.cos(phase);
  const sd = Math.sin(d), cd = Math.cos(d);
  let x = arm.x0, y = arm.y0;
  box.x0 = box.y0 = Infinity; box.x1 = box.y1 = -Infinity;
  for (let i = 0; i <= n; i++) {
    const f = i / n, r = arm.r1 + (arm.r0 - arm.r1) * (1 - f);
    pts[i * 4] = x; pts[i * 4 + 1] = y; pts[i * 4 + 2] = r; pts[i * 4 + 3] = f;
    if (x - r < box.x0) box.x0 = x - r;
    if (x + r > box.x1) box.x1 = x + r;
    if (y - r < box.y0) box.y0 = y - r;
    if (y + r > box.y1) box.y1 = y + r;
    const wind = Math.max(0, (f - cf) / (1 - cf));
    const a = a0 + amp * (sw - mean) + curl * wind * wind; // the curl winds up toward the tip
    x += Math.sin(a) * step;
    y += Math.cos(a) * step;
    const s2 = sw * cd + cw * sd;
    cw = cw * cd - sw * sd;
    sw = s2;
  }
}

// A tentacle's material, at `s` across it (-1 … 1, signed, so suckers run
// down one side) and `f` along it: dark at its edges (so tangled arms
// stay apart), a lit stripe down its back, and suckers down its inside —
// big near the root, shrinking toward the tip.
function armSkin(s, f, suckers) {
  const a = Math.abs(s);
  if (a > 0.8) return SQ_RIM;
  if (s > 0.05 && f > 0.06) {
    const n = suckers * (1 - 0.45 * f);  // suckers get closer together toward the tip
    const along = (f * n) % 1;
    if (along > 0.15 && along < 0.75 && s < 0.7) return s > 0.55 || along > 0.65 ? SQ_SHADE : SQ_SUCKER;
  }
  if (s < -0.2 && s > -0.5) return SQ_LIGHT;
  return a > 0.55 ? SQ_SHADE : SQ_BODY;
}

// The body's material at a point across a part `hw` wide (half-width):
// shaded toward the sides, lighter down the middle, freckled.
function squidSkin(x, y, hw, light) {
  const ax = Math.abs(x);
  if (ax > 0.7 * hw) return SQ_SHADE;
  if (hash(Math.floor(x * 70) + 500, Math.floor(y * 70) + 500) < 0.1) return SQ_SPOT;
  if (light && ax < 0.25 * hw) return SQ_LIGHT;
  return SQ_BODY;
}

// A cluster of eyes, like a spider's: [x, y, radius] each, mirrored left
// and right. Each glows yellow inside a dark rim, with a round pupil and
// a glint at its upper left.
function squidEyes(eyes, x, y) {
  for (const [ex, ey, r] of eyes) {
    const dx = x - (x < 0 ? -ex : ex), dy = y - ey, d = Math.hypot(dx, dy); // from this eye's center
    if (d >= r) continue;
    if (d > 0.78 * r) return SQ_RIM;
    if (Math.hypot(dx + 0.3 * r, dy + 0.3 * r) < 0.22 * r) return SQ_GLINT;
    return d < 0.42 * r ? SQ_PUPIL : SQ_EYE;
  }
  return 0;
}

// Each squid kind's shape: its size in size units (w across, h down —
// worked out from its parts, see fitSquid), and the material at a point
// (x across from its middle, y down from its top). Small bodies, a nest
// of long, writhing tentacles: more arm than squid.
const SQUID_SHAPES = {
  // Lancer: a small pointed mantle with a diamond of fins, a narrow head
  // crowded with eyes, and a tall tangle of tentacles — most hanging and
  // writhing down to the water, two flung out to the sides, and two
  // reaching up past its head, their tips curled.
  lancer: {
    eyes: [[0.03, 0.34, 0.024], [0.064, 0.328, 0.016], [0.018, 0.304, 0.012], [0.05, 0.3, 0.011], [0.072, 0.358, 0.009], [0, 0.372, 0.01]],
    arms: [
      // Hanging: close together, swinging gently, then curling back up
      // in under the body.
      ...Array.from({ length: 6 }, (_, i) => {
        const s = (i / 5) * 2 - 1;
        const inward = s === 0 ? (i % 2 ? 1 : -1) : -Math.sign(s); // which way is back toward the body
        return writhe(0.045 * s, 0.39, 0.12 * s, 0.75 + 0.12 * hash(i, 41), 0.05, 0.012, 0.25, 1.1 + 0.4 * hash(i, 43), i * 1.9, inward * (5.5 + 1.5 * hash(i, 45)), 0.3);
      }),
      // Out to the sides, then curling back in.
      ...[-1, 1].map((side) => writhe(side * 0.07, 0.37, side * 0.8, 0.7, 0.05, 0.012, 0.3, 0.9, side + 2, -side * 7, 0.25)),
      // Up past its head, then curling back over it.
      ...[-1, 1].map((side) => writhe(side * 0.075, 0.36, side * 2.5, 0.5, 0.045, 0.011, 0.25, 0.8, side * 0.7, side * 6, 0.3)),
    ],
    // In front of the arms: eyes, head and mantle.
    frontBox: { x0: -0.1, y0: 0, x1: 0.1, y1: 0.42 },
    front(x, y) {
      const ax = Math.abs(x);
      const eye = squidEyes(this.eyes, x, y);
      if (eye) return eye;
      if (y >= 0.28 && y < 0.41) {
        const hw = 0.088 - (y - 0.28) * 0.15;
        if (ax < hw) return squidSkin(x, y, hw, false);
      }
      if (y > 0 && y < 0.3) {
        const hw = 0.075 * Math.min(1, y / 0.12) ** 0.55;
        if (ax < hw) return squidSkin(x, y, hw, y > 0.06);
      }
      return 0;
    },
    // Behind them: the fins.
    backBox: { x0: -0.15, y0: 0, x1: 0.15, y1: 0.21 },
    back(x, y) {
      const ax = Math.abs(x);
      if (y > 0.01 && y < 0.2) {
        const fin = 0.14 * (y < 0.07 ? y / 0.07 : 1 - (y - 0.07) / 0.13);
        if (ax < fin) return ax > 0.75 * fin ? SQ_SHADE : SQ_FIN;
      }
      return 0;
    },
  },
  sprawler: sprawlerShape(0),
  sprawlerLeft: sprawlerShape(1),
  sprawlerRight: sprawlerShape(-1),
};

// Sprawler: a small rounded mantle with side flaps, a broad head ringed
// with eyes, and a dozen thick tentacles writhing out wide to either
// side, their tips curling up, with two more arching up behind. `reach`
// 0 sits the body in the middle; 1 sends most of the arms, longer, out
// to the right, so the body sits off to the left (and -1 the mirror).
function sprawlerShape(reach) {
  // Worked out reaching right, then flipped for -1, so the two are
  // mirror images (but for the light, which stays at the upper left).
  const flip = reach < 0 ? -1 : 1;
  const arm = (x0, y0, a0, len, r0, r1, amp, freq, phase, curl) => writhe(flip * x0, y0, flip * a0, len, r0, r1, flip * amp, freq, phase, flip * curl, 0.3);
  // A fan of `n` arms out to one side (1 right, -1 left), flattest last;
  // `seed(k)` numbers each so it writhes its own way, `scale` stretches
  // them and `wind` is how tight their tips curl.
  const fan = (side, n, scale, wind, seed) => Array.from({ length: n }, (_, k) => {
    const m = (2 * k + 1) / (2 * n - 1), i = seed(k); // m: 0 hanging … 1 straight out
    return arm(0.1 * side * m, 0.35, side * (0.35 + 1.3 * m), (0.38 + 0.3 * m) * scale, 0.068, 0.014, 0.4, 1 + 0.4 * hash(i, 47), i * 2.1, side * wind * (6.5 + 1.5 * hash(i, 49)));
  });
  const lopsided = reach !== 0;
  return {
    eyes: [[0.036, 0.3, 0.028], [0.078, 0.29, 0.019], [0.02, 0.263, 0.013], [0.056, 0.258, 0.012], [0.1, 0.315, 0.011], [0, 0.338, 0.012], [0.09, 0.262, 0.008]],
    arms: [
      ...(lopsided
        ? fan(1, 8, 1.75, 0.6, (k) => 6 + k).concat(fan(-1, 4, 0.55, 1, (k) => 5 - k)) // most out the far side, long and loosely curled
        : fan(1, 6, 1, 1, (k) => 6 + k).concat(fan(-1, 6, 1, 1, (k) => 5 - k))
      ).sort((a, b) => a.box.x1 - a.box.x0 - (b.box.x1 - b.box.x0)), // the shorter, nearer arms in front
      arm(0.1, 0.3, 2.3, lopsided ? 0.6 : 0.4, 0.055, 0.012, 0.35, 0.8, 1.3, 6.5),
      arm(-0.1, 0.3, -2.3, lopsided ? 0.28 : 0.4, 0.055, 0.012, 0.35, 0.8, -1.3, -6.5),
    ],
    // In front of the arms: eyes, head and mantle.
    frontBox: { x0: -0.14, y0: 0.04, x1: 0.14, y1: 0.37 },
    front(x, y) {
      const ax = Math.abs(x);
      const eye = squidEyes(this.eyes, x, y);
      if (eye) return eye;
      if (y >= 0.24 && y < 0.37) {
        const hw = 0.135 - (y - 0.24) * 0.15;
        if (ax < hw) return squidSkin(x, y, hw, false);
      }
      if (y > 0.04 && y < 0.26) {
        const hw = 0.13 * Math.min(1, (y - 0.04) / 0.09) ** 0.5;
        if (ax < hw) return squidSkin(x, y, hw, y > 0.08);
      }
      return 0;
    },
    // Behind them: the side flaps.
    backBox: { x0: -0.2, y0: 0.07, x1: 0.2, y1: 0.2 },
    back(x, y) {
      const ax = Math.abs(x);
      if (y > 0.07 && y < 0.2) {
        const flap = 0.19 * Math.sin(Math.PI * (y - 0.07) / 0.13);
        if (ax < flap) return ax > 0.8 * flap ? SQ_SHADE : SQ_FIN;
      }
      return 0;
    },
  };
}

// Sizes each shape to fit all its parts at rest, from its leftmost reach
// to its rightmost and its highest point (arm or body) to its lowest:
// its frame, which it's drawn standing in (centered, bottom on the
// water). Shapes are designed with x across from the body's middle and y
// down from its top, so a lopsided squid's body sits off to one side of
// the frame's middle (`mid`).
function fitSquid(shape) {
  let top = 0, bottom = 0.45, left = -0.2, right = 0.2;  // the body's own extent
  for (const { restBox: box } of shape.arms) {
    top = Math.min(top, box.y0); bottom = Math.max(bottom, box.y1);
    left = Math.min(left, box.x0); right = Math.max(right, box.x1);
  }
  shape.left = left - 0.01;
  shape.top = top;
  shape.w = right - left + 0.02;
  shape.h = bottom - top + 0.01;
  shape.mid = (left + right) / 2;
  return shape;
}
for (const name in SQUID_SHAPES) fitSquid(SQUID_SHAPES[name]);

// ---------------------------------------------------------------------
// Drawing, live: squids move, so each frame every one in view is worked
// out afresh into a sprite of materials at about the size it's drawn
// (body parts point by point, arms stamped segment by segment, back to
// front) and drawn with drawSprite. Close up, the sprite is worked out at
// most RASTER_MAX pixels per size unit and scaled up, to keep it quick.
// The sprite covers the resting frame plus room round it (PAD_*) for
// arms lashing out; anything beyond is cut off.
// ---------------------------------------------------------------------
const RASTER_MAX = 110;
const PAD_X = 0.45, PAD_TOP = 0.3, PAD_BOTTOM = 0.45;
let matBuf = new Uint8Array(1 << 16), halfBuf = new Uint8Array(1 << 16);
let bestBuf = new Float32Array(1 << 14), sideBuf = new Float32Array(1 << 14), alongBuf = new Float32Array(1 << 14);

// The shape, with its arms as they're posed now, as a sprite at
// `perUnit` pixels per size unit. (The sprite's data is shared scratch,
// good until the next call.)
function rasterSquid(shape, perUnit) {
  const w = Math.max(1, Math.ceil((shape.w + 2 * PAD_X) * perUnit));
  const h = Math.max(1, Math.ceil((shape.h + PAD_TOP + PAD_BOTTOM) * perUnit));
  if (matBuf.length < w * h) matBuf = new Uint8Array(w * h * 2);
  const data = matBuf.subarray(0, w * h);
  const X0 = shape.mid - shape.w / 2 - PAD_X, Y0 = shape.top - PAD_TOP; // shape point at the sprite's top-left corner
  // Only the part with anything in it this frame (the arms as posed and
  // the body, with a clear pixel round them) is cleared and drawn.
  let bx0 = Math.min(shape.backBox.x0, shape.frontBox.x0), bx1 = Math.max(shape.backBox.x1, shape.frontBox.x1);
  let by0 = Math.min(shape.backBox.y0, shape.frontBox.y0), by1 = Math.max(shape.backBox.y1, shape.frontBox.y1);
  for (const { box } of shape.arms) {
    if (box.x0 < bx0) bx0 = box.x0;
    if (box.x1 > bx1) bx1 = box.x1;
    if (box.y0 < by0) by0 = box.y0;
    if (box.y1 > by1) by1 = box.y1;
  }
  const box = {
    x0: Math.max(0, Math.floor((bx0 - X0) * perUnit) - 1), x1: Math.min(w, Math.ceil((bx1 - X0) * perUnit) + 1),
    y0: Math.max(0, Math.floor((by0 - Y0) * perUnit) - 1), y1: Math.min(h, Math.ceil((by1 - Y0) * perUnit) + 1),
  };
  // (Cleared a pixel further, as drawing looks one beyond for outlines.)
  const cx0 = Math.max(0, box.x0 - 1), cx1 = Math.min(w, box.x1 + 1);
  for (let py = Math.max(0, box.y0 - 1); py < Math.min(h, box.y1 + 1); py++) data.fill(0, py * w + cx0, py * w + cx1);
  const body = bodyPixels(shape, perUnit, w, h, X0, Y0);
  const fill = ({ at, mat }) => { for (let i = 0; i < at.length; i++) data[at[i]] = mat[i]; };
  fill(body.back);
  for (let a = shape.arms.length - 1; a >= 0; a--) rasterArm(shape.arms[a], data, w, h, X0, Y0, perUnit); // earlier arms lie in front
  fill(body.front);
  return { w, h, data, perUnit, box };
}

// The body's pixels (behind and in front of the arms) at `perUnit`:
// where they fall in the sprite, and their materials. The body doesn't
// move, so these are worked out point by point once per size and kept
// (the last few sizes, per shape).
function bodyPixels(shape, perUnit, w, h, X0, Y0) {
  const cache = shape.bodyCache || (shape.bodyCache = new Map());
  let entry = cache.get(perUnit);
  if (entry) return entry;
  const part = (fn, box) => {
    const at = [], mat = [];
    const px0 = Math.max(0, Math.floor((box.x0 - X0) * perUnit)), px1 = Math.min(w, Math.ceil((box.x1 - X0) * perUnit));
    const py0 = Math.max(0, Math.floor((box.y0 - Y0) * perUnit)), py1 = Math.min(h, Math.ceil((box.y1 - Y0) * perUnit));
    for (let py = py0; py < py1; py++) {
      const y = Y0 + (py + 0.5) / perUnit;
      for (let px = px0; px < px1; px++) {
        const m = fn.call(shape, X0 + (px + 0.5) / perUnit, y);
        if (m) { at.push(py * w + px); mat.push(m); }
      }
    }
    return { at: Int32Array.from(at), mat: Uint8Array.from(mat) };
  };
  entry = { back: part(shape.back, shape.backBox), front: part(shape.front, shape.frontBox) };
  if (cache.size >= 8) cache.delete(cache.keys().next().value);
  cache.set(perUnit, entry);
  return entry;
}

// Stamps an arm into `data`: each pixel it covers takes the material of
// its nearest stretch of arm (relative to the arm's thickness there).
function rasterArm(arm, data, w, h, X0, Y0, perUnit) {
  const { pts, box } = arm;
  const ax0 = Math.max(0, Math.floor((box.x0 - X0) * perUnit)), ax1 = Math.min(w, Math.ceil((box.x1 - X0) * perUnit));
  const ay0 = Math.max(0, Math.floor((box.y0 - Y0) * perUnit)), ay1 = Math.min(h, Math.ceil((box.y1 - Y0) * perUnit));
  const bw = ax1 - ax0, bh = ay1 - ay0;
  if (bw <= 0 || bh <= 0) return;
  if (bestBuf.length < bw * bh) {
    bestBuf = new Float32Array(bw * bh * 2); sideBuf = new Float32Array(bw * bh * 2); alongBuf = new Float32Array(bw * bh * 2);
  }
  bestBuf.fill(2, 0, bw * bh);
  // Points in pixels (pixel centers at whole numbers + 0.5).
  const P = (i) => (pts[i] - X0) * perUnit, Q = (i) => (pts[i] - Y0) * perUnit;
  // Stamped in stretches about as long as the arm is wide there (but at
  // least a pixel and a half), skipping points in between: far fewer
  // stamps where it's thick, every point where it's thin and curled.
  const segPx = Math.hypot(pts[4] - pts[0], pts[5] - pts[1]) * perUnit || 1;
  const n = arm.n;
  for (let i = 0, next; i < n; i = next) {
    next = Math.min(n, i + Math.max(1, Math.floor(Math.max(1.5, 1.5 * pts[i * 4 + 2] * perUnit) / segPx)));
    const a = i * 4, b = next * 4;
    const x1 = P(a), y1 = Q(a + 1), r1 = pts[a + 2] * perUnit, x2 = P(b), y2 = Q(b + 1), r2 = pts[b + 2] * perUnit;
    const dx = x2 - x1, dy = y2 - y1, dd = dx * dx + dy * dy || 1;
    const R = Math.max(r1, r2);
    const sx0 = Math.max(ax0, Math.floor(Math.min(x1, x2) - R)), sx1 = Math.min(ax1, Math.ceil(Math.max(x1, x2) + R));
    const sy0 = Math.max(ay0, Math.floor(Math.min(y1, y2) - R)), sy1 = Math.min(ay1, Math.ceil(Math.max(y1, y2) + R));
    for (let py = sy0; py < sy1; py++) {
      const cy = py + 0.5 - y1;
      for (let px = sx0; px < sx1; px++) {
        const cx = px + 0.5 - x1;
        let k = (cx * dx + cy * dy) / dd;
        k = k < 0 ? 0 : k > 1 ? 1 : k;
        const ex = cx - k * dx, ey = cy - k * dy, r = r1 + (r2 - r1) * k;
        const d2 = ex * ex + ey * ey;
        if (d2 >= r * r) continue;
        const v = Math.sqrt(d2) / r, j = (py - ay0) * bw + (px - ax0);
        if (v < bestBuf[j]) {
          bestBuf[j] = v;
          sideBuf[j] = dx * ey - dy * ex > 0 ? v : -v;
          alongBuf[j] = pts[a + 3] + (pts[b + 3] - pts[a + 3]) * k;
        }
      }
    }
  }
  for (let py = ay0; py < ay1; py++) {
    for (let px = ax0; px < ax1; px++) {
      const j = (py - ay0) * bw + (px - ax0);
      if (bestBuf[j] < 1) data[py * w + px] = armSkin(sideBuf[j], alongBuf[j], arm.suckers);
    }
  }
}

// How squids move, besides writhing: they bob in the water; near her
// they lash at her — every so often (LASH_RATE strikes a second) the arms
// whose tips already point her way snap out at her and draw back; a
// flinch coils every arm up and shakes the body; and once cut, the two
// halves part along a glowing cut, spraying glowing drops, and fall away
// into the sea, the arms coiling in their death throes.
const LASH_RATE = 0.7;      // strikes a second, close up
const LASH_ARMS = 2;        // how many arms strike at once
const CUT_DROPS = 14;       // glowing drops sprayed from the cut
const ease = (u) => u * u * (3 - 2 * u);
// One strike, u (0 … 1) of the way through a strike cycle: out fast,
// back slower, then a rest.
const strike = (u) => (u < 0.12 ? ease(u / 0.12) : u < 0.45 ? 1 - ease((u - 0.12) / 0.33) : 0);

// Draws a squid into `target` in a colorway, standing centered on x with
// its bottom at `bottom`, `spu` pixels per size unit, posed as `look`
// says (see ENEMIES).
function drawSquid(target, shape, colorway, x, bottom, spu, haze, fadeIn, look) {
  const t = look.t || 0, seed = look.seed || 0;
  const palette = colorway.palettes[Math.round(Math.max(0, Math.min(1, haze)) * (HAZE_LEVELS - 1))];
  const flinch = look.flinch || 0, cut = look.cut;
  // Bobbing, and the flinch's shake.
  bottom -= Math.sin(t * 1.3 + seed * 20) * 0.02 * spu;
  x += Math.sin(t * 70) * flinch * 0.02 * spu;
  // Lashing: the arms nearest the aim strike, one just after the other.
  const near = cut ? 0 : look.lash || 0;
  let aim = 0, strikers = [];
  if (near > 0) {
    const rootX = x - shape.mid * spu, rootY = bottom - (shape.top + shape.h - 0.35) * spu; // where the arms join the body, on screen
    aim = Math.atan2(look.aimX - rootX, look.aimY - rootY);
    const off = (arm) => Math.abs(Math.atan2(Math.sin(arm.reach - aim), Math.cos(arm.reach - aim)));
    strikers = shape.arms.slice().sort((a, b) => off(a) - off(b)).slice(0, LASH_ARMS);
  }
  const cycle = t * LASH_RATE + seed * 7;
  const motion = { lash: 0, aim, flinch: cut ? 0.4 + 0.6 * Math.min(1, cut.age * 3) : flinch };
  for (const arm of shape.arms) {
    const rank = strikers.indexOf(arm);
    motion.lash = rank < 0 ? 0 : near * strike((((cycle - rank * 0.06) % 1) + 1) % 1);
    poseArm(arm, t, motion, spu < 30 ? 12 : spu < 60 ? 24 : ARM_N); // fewer segments when small
  }
  const perUnit = Math.max(4, Math.min(RASTER_MAX, Math.round(spu))); // whole pixels, so worked-out bodies can be kept and reused
  const sprite = rasterSquid(shape, perUnit);
  const k = spu / perUnit, base = bottom + PAD_BOTTOM * spu;
  if (!cut) { drawSprite(target, sprite, palette, x, base, k, fadeIn); return; }

  // Cut in two. The cut runs across the head for a horizontal slash
  // (tilted the way the slash's mark is), or down the middle of the body
  // for a vertical one; `n` is square to it, pointing to half B (the
  // lower or right one).
  const e = cut.age, { w, h, data } = sprite;
  const X0 = shape.mid - shape.w / 2 - PAD_X, Y0 = shape.top - PAD_TOP;
  const across = cut.by === "horizontal";
  const cx = (0 - X0) * perUnit, cy = ((across ? 0.33 : 0.25) - Y0) * perUnit;
  let nx = across ? 0.14 : 1, ny = across ? 1 : 0.08;
  const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
  const glow = Math.max(1, perUnit * 0.014); // how deep the glowing cut shows on each half
  const fade = fadeIn * (e < 0.6 ? 1 : 1 - (e - 0.6) / 0.4);
  const dir = cut.reverse ? 1 : -1; // which way the slash went across (its first way is right to left)
  if (halfBuf.length < w * h) halfBuf = new Uint8Array(w * h * 2);
  const half = { w, h, perUnit, data: halfBuf.subarray(0, w * h), box: sprite.box };
  const { box } = sprite;
  for (const side of [-1, 1]) {
    half.data.fill(0);
    for (let py = box.y0; py < box.y1; py++) {
      for (let px = box.x0; px < box.x1; px++) {
        const i = py * w + px, m = data[i];
        const d = ((px + 0.5 - cx) * nx + (py + 0.5 - cy) * ny) * side;
        half.data[i] = m && d > 0 ? (d < glow ? SQ_EYE : m) : 0;
      }
    }
    // How this half moves (in size units): across, the top half pops up
    // and flies off the way the slash went, then falls, while the arms
    // drop; down the middle, the halves fall apart to either side.
    let ox, oy;
    if (across) {
      ox = side < 0 ? dir * 0.35 * e : -dir * 0.05 * e;
      oy = side < 0 ? -1 * e + 2.2 * e * e : 0.7 * e * e;
    } else {
      ox = side * 0.28 * e;
      oy = 0.8 * e * e - 0.1 * e;
    }
    drawSprite(target, half, palette, x + ox * spu, base + oy * spu, k, fade);
  }
  // The drops: flung from along the cut, arcing up and out and falling.
  const sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
  const left = Math.round(x - sw / 2), top = Math.round(base - sh);
  const dot = Math.max(1, Math.round(spu * 0.012));
  const color = palette[SQ_EYE];
  for (let j = 0; j < CUT_DROPS; j++) {
    const life = 0.5 + 0.5 * hash(j, 3);
    if (e > life) continue;
    const u = (hash(j, 5) - 0.5) * (across ? 0.3 : 0.25);                // along the cut, from its middle (size units)
    const vx = (hash(j, 7) - 0.5) * 1.2 + (across ? dir * 0.3 : 0), vy = -0.4 - 0.8 * hash(j, 11);
    const sx = left + (cx - ny * u * perUnit) * k + (vx * e) * spu;
    const sy = top + (cy + nx * u * perUnit) * k + (vy * e + 1.6 * e * e) * spu;
    if (fadeIn < 1 && hash(j, 13) > fadeIn) continue;
    for (let oy = 0; oy < dot; oy++) for (let ox = 0; ox < dot; ox++) {
      const px = Math.round(sx) + ox, py = Math.round(sy) + oy;
      if (px >= 0 && py >= 0 && px < target.w && py < target.h) target.buf[py * target.w + px] = color;
    }
  }
}

// Picks one of `list` by a 0 … 1 roll.
const pickBy = (list, roll) => list[Math.min(list.length - 1, Math.floor((roll || 0) * list.length))];

// Size units are wave lengths in the game (see rowLook's scale there): at
// her usual distance she's about 0.6 of one tall.
//
// Each comes in a few forms (shapes) and colorways, for variety, and is
// cut apart by one kind of slash (`cutBy`). draw() takes `look`:
//   form, colorway  0 … 1 rolls picking one of each (the first if left out)
//   seed            0 … 1, so each moves in its own time
//   t               seconds, for its writhing and bobbing
//   lash            0 … 1, how near she is: it lashes at her when near…
//   aimX, aimY      …toward this spot on the target (hers)
//   flinch          0 … 1, just hit by the wrong slash (easing back to 0)
//   cut             { by, reverse, age }: cut apart by that slash (`reverse`
//                   if it went its second way), age 0 … 1 through falling away
const ENEMIES = {
  lancer: {
    name: "Lancer",
    family: "Squid",
    weakness: "horizontal slash",
    cutBy: "horizontal",
    description: "Tall and narrow: a small pointed mantle and a head crowded with spider-like eyes, above a tall tangle of writhing, sucker-lined tentacles — two reaching up past its head.",
    unit: 0.75,              // size units per shape unit (a lancer is about one shape unit tall)
    sizes: [0.85, 1.45],     // smallest and largest, relative to its usual size
    sink: 0.3,               // how far (size units, at its usual size) it sits down in the water — its arms trail in the waves
    forms: [{ name: "Upright", shape: SQUID_SHAPES.lancer }],
  },
  sprawler: {
    name: "Sprawler",
    family: "Squid",
    weakness: "vertical slash",
    cutBy: "vertical",
    description: "Short and wide: a small rounded mantle and a head ringed with spider-like eyes, with a dozen thick tentacles writhing out to either side, tips curling up, and two arching behind. Some are lopsided, the body off to one side and most of the arms, longer, reaching out the other way.",
    unit: 0.75,
    sizes: [0.85, 1.15],
    sink: 0.03,
    forms: [
      { name: "Centered", shape: SQUID_SHAPES.sprawler },
      { name: "Body left", shape: SQUID_SHAPES.sprawlerLeft },
      { name: "Body right", shape: SQUID_SHAPES.sprawlerRight },
    ],
  },
};
for (const id in ENEMIES) {
  Object.assign(ENEMIES[id], {
    colorways: SQUID_COLORWAYS, materials: SQUID_MATERIALS,
    draw(target, x, bottom, unitPx, haze, fadeIn = 1, look = {}) {
      drawSquid(target, pickBy(this.forms, look.form).shape, pickBy(this.colorways, look.colorway), x, bottom, unitPx * this.unit, haze, fadeIn, look);
    },
  });
}
