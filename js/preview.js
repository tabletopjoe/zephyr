// =====================================================================
// The development pages' preview stage: a canvas at the game's
// resolution with a dusk sky over dark water, to draw enemies and terrain
// on, plus how the game sizes things by distance. Needs pixels.js.
// =====================================================================
const STAGE_W = 960, STAGE_H = 540;
const WATERLINE = 400;           // the stage's horizon line

// How the game sizes things at a depth of sea (its rowLook's scale, at
// 3× pixel density): pixels per size unit. Depth 0 is the horizon, and
// she flies at about 0.69. Kept in step with the game by hand.
const scaleAt = (depth) => (7 + 45 * depth) * 3;
const SEE_AHEAD = 100;           // metres to the horizon in the game
const aheadAt = (depth) => SEE_AHEAD * (1 - Math.sqrt(depth / 1.25));
const hazeAt = (depth) => (1 - Math.min(1, depth)) ** 2;
const HER_HEIGHT = 0.59;         // her height, in size units

function makeStage(canvas) {
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(STAGE_W, STAGE_H);
  const target = { buf: new Uint32Array(image.data.buffer), w: STAGE_W, h: STAGE_H };
  const SKY = ["#2b2453", "#4a2f6b", "#7a3b73", "#b2486e", "#e0625f", "#f59a5c"].map(rgb);
  const SEA = ["#424a80", "#2a3466", "#1a2552", "#0d1a40"].map(rgb);
  const MARK = rgb("#ffd27a");
  const captions = [];
  let backdrop = null; // worked out once, then copied back (for pages that redraw every frame)
  return {
    target,
    // A fresh backdrop, dithered like the game's.
    clear() {
      captions.length = 0;
      if (backdrop) { target.buf.set(backdrop); return; }
      const ramp = (colors, x, y, v) => {
        const p = v * (colors.length - 1), i = Math.floor(p);
        return i + 1 < colors.length && p - i > bayer(x, y) ? colors[i + 1] : colors[i];
      };
      for (let y = 0; y < STAGE_H; y++) {
        for (let x = 0; x < STAGE_W; x++) {
          target.buf[y * STAGE_W + x] = y < WATERLINE ? ramp(SKY, x, y, y / WATERLINE) : ramp(SEA, x, y, (y - WATERLINE) / (STAGE_H - WATERLINE));
        }
      }
      target.buf.fill(rgb("#d98a7f"), WATERLINE * STAGE_W, (WATERLINE + 1) * STAGE_W); // the horizon line, as in the game
      backdrop = target.buf.slice();
    },
    // A bar `x` across showing her height at `unitPx` pixels per size unit.
    herHeight(x, unitPx) {
      const top = Math.round(WATERLINE - HER_HEIGHT * unitPx);
      for (let y = top; y <= WATERLINE; y++) for (let i = x; i < x + 3; i++) target.buf[y * STAGE_W + i] = MARK;
      for (let i = x - 6; i < x + 9; i++) { target.buf[top * STAGE_W + i] = MARK; target.buf[WATERLINE * STAGE_W + i] = MARK; }
      captions.push(["her height", x + 12, top - 1, "left"]);
    },
    // A caption, drawn over the pixels once they're in.
    label(text, x, y, align = "center") { captions.push([text, x, y, align]); },
    // Puts the pixels, then the captions, on the canvas.
    show() {
      ctx.putImageData(image, 0, 0);
      ctx.font = "15px ui-monospace, Consolas, monospace";
      ctx.textBaseline = "top";
      for (const [text, x, y, align] of captions) {
        ctx.textAlign = align;
        const w = ctx.measureText(text).width;
        const left = align === "center" ? x - w / 2 : x;
        ctx.fillStyle = "rgba(14, 12, 26, 0.6)";
        ctx.fillRect(left - 4, y - 2, w + 8, 20);
        ctx.fillStyle = "#fff6d8";
        ctx.fillText(text, x, y);
      }
    },
  };
}
