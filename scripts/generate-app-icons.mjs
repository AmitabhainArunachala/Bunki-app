/**
 * Generates the app icon set in `apps/app/assets/images/` (WP-01).
 *
 * Why this script exists rather than five checked-in binaries of unknown
 * origin: the Expo template ships Expo's *own* brand artwork, and shipping it
 * as Bunki's product mark would (a) claim someone else's identity and (b)
 * pre-empt the operator's pending identity/license decision (OD-09) exactly the
 * way committing the template's LICENSE file would have. Controller §4 forbids
 * adding anything whose license constrains that choice.
 *
 * So the icons are generated from geometry defined here, in this repository,
 * with no third-party asset input. The PNGs in `apps/app/assets/images/` are
 * this script's output and carry no upstream license. Re-generate with:
 *
 *     node scripts/generate-app-icons.mjs
 *
 * The mark is a placeholder, not a finished identity: a stem that forks into
 * two terminating nodes — 分岐 (bunki), "branching / divergence", the one idea
 * the product name states outright. WP-13 (or the operator) may replace it;
 * nothing depends on its appearance.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'apps',
  'app',
  'assets',
  'images',
);

// Neutral slate palette. Deliberately not a brand: no gradient, no wordmark.
const INK = [15, 23, 42]; // #0F172A — background / monochrome-safe dark
const PAPER = [248, 250, 252]; // #F8FAFC — the mark on dark backgrounds

/**
 * The mark, in normalised canvas coordinates (0..1, origin top-left).
 * A stem rising from the base that forks into two diverging arms, each
 * terminating in a node. Distinct from a bare chevron by construction: it has
 * a stem and explicit endpoints.
 */
const STROKE_WIDTH = 0.086;
const NODE_RADIUS = 0.063;
const FORK = [0.5, 0.53];
const SEGMENTS = [
  [[0.5, 0.87], FORK], // stem
  [FORK, [0.25, 0.19]], // left arm
  [FORK, [0.75, 0.19]], // right arm
];
const NODES = [FORK, [0.25, 0.19], [0.75, 0.19]];

const SUPERSAMPLE = 4;

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** True when the normalised point falls inside the mark. */
function insideMark(px, py, scale) {
  // `scale` shrinks the mark about the canvas centre so adaptive-icon content
  // stays inside Android's safe zone.
  const x = (px - 0.5) / scale + 0.5;
  const y = (py - 0.5) / scale + 0.5;

  for (const node of NODES) {
    if (Math.hypot(x - node[0], y - node[1]) <= NODE_RADIUS) return true;
  }
  for (const [a, b] of SEGMENTS) {
    if (distanceToSegment(x, y, a, b) <= STROKE_WIDTH / 2) return true;
  }
  return false;
}

/** Fraction of a pixel covered by the mark, by supersampling. */
function coverage(px, py, size, scale) {
  let hits = 0;
  for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
    const y = (py + (sy + 0.5) / SUPERSAMPLE) / size;
    for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
      const x = (px + (sx + 0.5) / SUPERSAMPLE) / size;
      if (insideMark(x, y, scale)) hits += 1;
    }
  }
  return hits / (SUPERSAMPLE * SUPERSAMPLE);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/** Encodes RGBA pixel data as a PNG. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // bytes 10..12 stay 0: deflate, adaptive filtering, no interlace.

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Renders one icon.
 *
 * @param {object} options
 * @param {number} options.size        square edge in pixels
 * @param {number[]|null} options.background  opaque RGB fill, or null for transparency
 * @param {number[]} options.mark      RGB of the mark
 * @param {number} options.scale       mark scale about the centre (safe zone)
 * @param {boolean} [options.markOnly] draw only the background, no mark
 */
function render({ size, background, mark, scale, markOnly = false }) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const alpha = markOnly ? 0 : coverage(x, y, size, scale);
      const i = (y * size + x) * 4;
      if (background) {
        // Composite the mark over an opaque background.
        for (let c = 0; c < 3; c += 1) {
          rgba[i + c] = Math.round(background[c] * (1 - alpha) + mark[c] * alpha);
        }
        rgba[i + 3] = 255;
      } else {
        // Straight alpha: the mark floats on transparency.
        for (let c = 0; c < 3; c += 1) rgba[i + c] = mark[c];
        rgba[i + 3] = Math.round(alpha * 255);
      }
    }
  }
  return encodePng(size, size, rgba);
}

const OUTPUTS = [
  // Store / launcher icon: opaque, mark inset from the edge.
  ['icon.png', { size: 1024, background: INK, mark: PAPER, scale: 0.66 }],
  // Android adaptive icon: foreground floats on the background layer, and both
  // are 1024² with content confined to the centre safe zone.
  ['android-icon-foreground.png', { size: 1024, background: null, mark: PAPER, scale: 0.46 }],
  [
    'android-icon-background.png',
    { size: 1024, background: INK, mark: INK, scale: 1, markOnly: true },
  ],
  // Monochrome layer is tinted by the OS: solid shape on transparency.
  [
    'android-icon-monochrome.png',
    { size: 1024, background: null, mark: [255, 255, 255], scale: 0.46 },
  ],
  // Web favicon.
  ['favicon.png', { size: 48, background: INK, mark: PAPER, scale: 0.7 }],
];

for (const [name, options] of OUTPUTS) {
  const png = render(options);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name}: ${options.size}x${options.size}, ${png.length} bytes`);
}
