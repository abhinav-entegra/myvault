"use strict";

/**
 * Procedural squircle + “M” icon (optional). Run: `node scripts/generate-app-icon.cjs`
 * If you use a custom PNG instead, replace app/icon.png + renderer/public/app-icon.png
 * + renderer/public/logo-mark.png (square, ≥256×256); do not run this script unless you
 * want to restore the generated look.
 */

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

/** Windows / electron-builder: PNG icons must be ≥256×256; 512 avoids edge‑case tooling quirks. */
const W = 512;
const png = new PNG({ width: W, height: W, filterType: 4 });

const CORNER_R = 0.23;
/** Stroke half-width for “M” in normalized coords (bold, matches heavy 900 weight). */
const M_STROKE = 0.092;

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function inLetterM(nx, ny) {
  if (distToSeg(nx, ny, 0.22, 0.2, 0.22, 0.82) < M_STROKE) return true;
  if (distToSeg(nx, ny, 0.78, 0.2, 0.78, 0.82) < M_STROKE) return true;
  if (distToSeg(nx, ny, 0.22, 0.2, 0.5, 0.55) < M_STROKE) return true;
  if (distToSeg(nx, ny, 0.5, 0.55, 0.78, 0.2) < M_STROKE) return true;
  return false;
}

/** Rounded-square mask (~iOS squircle look), nx/ny normalized 0..1 */
function insideRoundRect(nx, ny, r) {
  if (nx < r && ny < r) {
    return Math.hypot(nx - r, ny - r) <= r;

  }

  if (nx > 1 - r && ny < r) {
    return Math.hypot(nx - (1 - r), ny - r) <= r;

  }

  if (nx < r && ny > 1 - r) {
    return Math.hypot(nx - r, ny - (1 - r)) <= r;

  }

  if (nx > 1 - r && ny > 1 - r) {
    return Math.hypot(nx - (1 - r), ny - (1 - r)) <= r;

  }

  return true;

}

function logoMarkGradientRgb(nx, ny) {
  const t = Math.min(1, Math.max(0, nx * 0.5 + ny * 0.5));
  const gBlue = { r: 66, g: 133, b: 244 };
  const applePurple = { r: 175, g: 82, b: 222 };
  const gYellow = { r: 251, g: 188, b: 5 };
  let r;
  let g;
  let b;
  if (t < 0.5) {
    const u = t * 2;
    r = Math.round(gBlue.r + (applePurple.r - gBlue.r) * u);
    g = Math.round(gBlue.g + (applePurple.g - gBlue.g) * u);
    b = Math.round(gBlue.b + (applePurple.b - gBlue.b) * u);
  } else {
    const u = (t - 0.5) * 2;
    r = Math.round(applePurple.r + (gYellow.r - applePurple.r) * u);
    g = Math.round(applePurple.g + (gYellow.g - applePurple.g) * u);
    b = Math.round(applePurple.b + (gYellow.b - applePurple.b) * u);

  }



  return [r, g, b];

}

for (let y = 0; y < W; y++) {
  for (let x = 0; x < W; x++) {
    const idx = (W * y + x) << 2;
    const nx = x / (W - 1);
    const ny = y / (W - 1);
    if (!insideRoundRect(nx, ny, CORNER_R)) {
      png.data[idx] = 0;
      png.data[idx + 1] = 0;
      png.data[idx + 2] = 0;
      png.data[idx + 3] = 0;
      continue;
    }
    const bg = logoMarkGradientRgb(nx, ny);
    let rr = bg[0];
    let gg = bg[1];
    let bb = bg[2];
    if (inLetterM(nx, ny)) {
      rr = 255;
      gg = 255;
      bb = 255;
    }
    png.data[idx] = rr;
    png.data[idx + 1] = gg;
    png.data[idx + 2] = bb;
    png.data[idx + 3] = 255;

  }


}

const appDir = path.join(__dirname, "..", "app");
const pubDir = path.join(__dirname, "..", "renderer", "public");
fs.mkdirSync(appDir, { recursive: true });
fs.mkdirSync(pubDir, { recursive: true });
const appPath = path.join(appDir, "icon.png");
const pubPath = path.join(pubDir, "app-icon.png");
const stream = png.pack();
const bufs = [];
stream.on("data", (d) => bufs.push(d));
stream.on("end", () => {
  const buf = Buffer.concat(bufs);
  fs.writeFileSync(appPath, buf);
  fs.writeFileSync(pubPath, buf);
  console.log(`Wrote ${appPath}`);
  console.log(`Wrote ${pubPath}`);
});
