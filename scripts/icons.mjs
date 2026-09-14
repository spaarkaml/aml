// Draws AML's app icons and writes every file the bundler needs (2026-09-14).
//
//   node scripts/icons.mjs      (pnpm icons)
//
// The monogram is three polygons — the stencil A, M and L — traced once from Bryce's artwork on
// a 1000-unit square, with every corner rounded. Rounding cuts each corner back along its own
// edges, so it only ever removes material: the cuts between the letters never close up.
//
// Two treatments, one per platform, sharing one blue:
//   macOS   "Porcelain"     a white squircle on Apple's 824-in-1024 grid, the monogram in light blue
//   Windows "Fluent glyph"  no plate, the monogram itself in a light-blue gradient (Windows 11 style)
//
// At 32px and below the cuts between the letters are thinner than a pixel, so the small sizes
// are drawn with them widened, a deeper blue so the letters hold against the plate or the
// taskbar, and on macOS a larger monogram: the M is traced in the mask, which takes a sliver off the A and
// the L where they meet it and leaves every stroke its own width.
//
// Rendering is Playwright's Chromium (already a dev dependency) with a transparent background;
// `iconutil` builds the .icns on macOS, and the .ico is written here — it is only a directory
// of PNGs. The SVG masters are written beside the PNGs so the drawing can be read without this.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const OUT = "src-tauri/icons";
const SOURCE = join(OUT, "source");

/** Corner radius on the 1000-unit drawing — "Round", chosen 2026-09-14. A stroke is ~85 wide. */
const RADIUS = 28;
/** How much wider the cuts are drawn at 32px and below, in the same units. */
const SMALL_CUT = 46;

const LETTERS = {
  A: "242,108 325,108 404,305 318,305 284,212 218,397 254,397 254,469 190,469 137,617 47,617",
  M: "277,328 416,328 515,575 629,328 709,328 531,708 479,708 359,470 359,710 277,710",
  L: "737,328 737,812 969,812 969,891 651,891 651,513",
};

const points = (s) => s.split(" ").map((p) => p.split(",").map(Number));
const f = (n) => n.toFixed(1);

/** A polygon's path with every corner cut back along its edges and bridged with a curve. */
function rounded(pts, r) {
  const corners = pts.map((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[(i + 1) % pts.length];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]);
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const u = [(a[0] - p[0]) / la, (a[1] - p[1]) / la];
    const v = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb];
    const theta = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
    // The distance along each edge that a circle of radius r touches it, never more than
    // nearly half the edge, so two neighbouring corners cannot overlap on a short edge.
    const d = Math.min(theta > 1e-3 ? r / Math.tan(theta / 2) : 0, la * 0.45, lb * 0.45);
    return {
      from: [p[0] + u[0] * d, p[1] + u[1] * d],
      at: p,
      to: [p[0] + v[0] * d, p[1] + v[1] * d],
    };
  });
  let d = `M${f(corners[0].to[0])},${f(corners[0].to[1])}`;
  for (let i = 1; i <= corners.length; i++) {
    const c = corners[i % corners.length];
    d += ` L${f(c.from[0])},${f(c.from[1])} Q${f(c.at[0])},${f(c.at[1])} ${f(c.to[0])},${f(c.to[1])}`;
  }
  return `${d}Z`;
}

const PATHS = Object.fromEntries(
  Object.entries(LETTERS).map(([k, v]) => [k, rounded(points(v), RADIUS)]),
);

/** The monogram centred on a 1024 canvas at `scale`, filled with `fill`. */
function monogram(scale, fill, { small = false, filter = "" } = {}) {
  const place = `translate(512 512) scale(${scale}) translate(-508 -500)`;
  const letters = `<path d="${PATHS.A}"/><path d="${PATHS.M}"/><path d="${PATHS.L}"/>`;
  if (!small) {
    return `<g transform="${place}" fill="${fill}"${filter}>${letters}</g>`;
  }
  // Widen the cuts: the M's outline, stroked, is taken out of the mask, then the M itself is
  // put back — so only the A and the L lose anything, and only where they meet the M.
  return `<mask id="cuts" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <g transform="${place}">
        <g fill="#fff">${letters}</g>
        <path d="${PATHS.M}" fill="none" stroke="#000" stroke-width="${SMALL_CUT}" stroke-linejoin="round"/>
        <path d="${PATHS.M}" fill="#fff"/>
      </g>
    </mask>
    <g mask="url(#cuts)"><g transform="${place}" fill="${fill}">${letters}</g></g>`;
}

/** Apple's continuous-corner squircle, as a superellipse. */
function squircle(x, y, size, n = 5) {
  const pts = [];
  for (let deg = 0; deg < 360; deg += 2) {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const px = Math.sign(c) * Math.abs(c) ** (2 / n);
    const py = Math.sign(s) * Math.abs(s) ** (2 / n);
    pts.push(`${f(x + size / 2 + (px * size) / 2)},${f(y + size / 2 + (py * size) / 2)}`);
  }
  return `M${pts.join(" L")}Z`;
}

const SQUIRCLE = squircle(100, 100, 824);

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>\n`;

function macos({ small }) {
  // No drop shadow when small: at 16px a blurred shadow is a grey smudge under the plate.
  return svg(`<defs>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4EFF8"/></linearGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#86CFFA"/><stop offset="1" stop-color="#2C86D6"/></linearGradient>
    <linearGradient id="inkSmall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4FA9EC"/><stop offset="1" stop-color="#1F74C2"/></linearGradient>
    <filter id="plateShadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0B2A45" flood-opacity=".28"/></filter>
    <filter id="glyphShadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#0B3A66" flood-opacity=".22"/></filter>
  </defs>
  <path d="${SQUIRCLE}" fill="url(#plate)"${small ? "" : ' filter="url(#plateShadow)"'}/>
  <path d="${SQUIRCLE}" fill="none" stroke="#9FB8CC" stroke-opacity="${small ? ".7" : ".35"}" stroke-width="${small ? 12 : 3}"/>
  ${monogram(small ? 0.7 : 0.6, small ? "url(#inkSmall)" : "url(#ink)", { small, filter: small ? "" : ' filter="url(#glyphShadow)"' })}`);
}

function windows({ small }) {
  return svg(`<defs>
    <linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${small ? "#6CBDF3" : "#9BDAFF"}"/><stop offset="1" stop-color="${small ? "#2379CA" : "#2A83D4"}"/></linearGradient>
    <filter id="glyphShadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#0B3A66" flood-opacity=".30"/></filter>
  </defs>
  ${monogram(0.98, "url(#ink)", { small, filter: small ? "" : ' filter="url(#glyphShadow)"' })}`);
}

const MASTERS = {
  "macos.svg": macos({ small: false }),
  "macos-small.svg": macos({ small: true }),
  "windows.svg": windows({ small: false }),
  "windows-small.svg": windows({ small: true }),
};

mkdirSync(SOURCE, { recursive: true });
for (const [name, text] of Object.entries(MASTERS)) writeFileSync(join(SOURCE, name), text);

const browser = await chromium.launch();
const page = await browser.newPage();

/** One master rendered at `size` px, as PNG bytes with a transparent background. */
async function render(master, size) {
  const small = size <= 32;
  const text = MASTERS[`${master}${small ? "-small" : ""}.svg`];
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${text}`,
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

// Windows, and anything that asks for a plain PNG: the glyph.
const pngs = {
  "32x32.png": 32,
  "128x128.png": 128,
  "128x128@2x.png": 256,
  "icon.png": 512,
  "Square30x30Logo.png": 30,
  "Square44x44Logo.png": 44,
  "Square71x71Logo.png": 71,
  "Square89x89Logo.png": 89,
  "Square107x107Logo.png": 107,
  "Square142x142Logo.png": 142,
  "Square150x150Logo.png": 150,
  "Square284x284Logo.png": 284,
  "Square310x310Logo.png": 310,
  "StoreLogo.png": 50,
};
for (const [name, size] of Object.entries(pngs)) {
  writeFileSync(join(OUT, name), await render("windows", size));
}

// icon.ico: a directory of PNG images (PNG entries are valid in ICO since Windows Vista).
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const images = [];
for (const size of icoSizes) images.push(await render("windows", size));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((png, i) => {
  const size = icoSizes[i];
  const at = 6 + 16 * i;
  header.writeUInt8(size >= 256 ? 0 : size, at);
  header.writeUInt8(size >= 256 ? 0 : size, at + 1);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(png.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += png.length;
});
writeFileSync(join(OUT, "icon.ico"), Buffer.concat([header, ...images]));

// icon.icns: the Porcelain squircle, through Apple's own tool.
if (process.platform === "darwin") {
  const set = join(tmpdir(), `aml-${process.pid}.iconset`);
  rmSync(set, { recursive: true, force: true });
  mkdirSync(set);
  for (const base of [16, 32, 128, 256, 512]) {
    writeFileSync(join(set, `icon_${base}x${base}.png`), await render("macos", base));
    writeFileSync(join(set, `icon_${base}x${base}@2x.png`), await render("macos", base * 2));
  }
  execFileSync("iconutil", ["-c", "icns", set, "-o", join(OUT, "icon.icns")]);
  rmSync(set, { recursive: true, force: true });
} else {
  console.warn("icon.icns not rebuilt: iconutil is macOS only");
}

await browser.close();
console.log(`icons written to ${OUT}`);
