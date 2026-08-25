#!/usr/bin/env node
/**
 * Build the AnimCJK equivalence manifest — the checked list that lets the
 * gallery-quality brush corpus paint again (operator escalation, 2026-08-24:
 * 「もう、美しくない！」 after the fail-closed KanjiVG ruling of issue #79).
 *
 * The law stands: KanjiVG is the canonical Japanese glyph and stroke-order
 * authority. AnimCJK regains the brush ONLY where this tool proves, stroke by
 * stroke, that its geometry is the same Japanese character written in the
 * same order — equal stroke count, every stroke's median tracing the same
 * path within tolerance, starting where the canonical stroke starts. A glyph
 * that fails on any stroke is rejected whole (経's 經 body, 衷's ten-stroke
 * hand) and the living renderer keeps the KanjiVG-synthesized brush there.
 *
 * Deterministic: same inputs → byte-identical manifest. No timestamps.
 *
 * Usage:  node prototypes/corridor/tools/build-animcjk-equivalence.mjs [--report]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const DATA = resolve(CORRIDOR, 'data/share_alike');
const OUT = resolve(DATA, 'animcjk/equivalence.json');

const { flattenKanjiVGPath } = await import(resolve(CORRIDOR, 'corridor-ink.js'));

/* Tolerances, in 1024-glyph-space units (the em is 1024). Calibrated against
 * the corridor's own corpus: stylistic font-vs-KanjiVG drift sits well under
 * these; a substituted component (巠 for 圣) or a reordered hand blows
 * through them. --report prints the distribution to re-check a re-pin. */
const MEAN_TOLERANCE = 110; // mean point distance of one stroke's median
const START_TOLERANCE = 170; // where the stroke BEGINS — order and direction
const RESAMPLE = 24;

function resample(pts, n) {
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[cum.length - 1] || 1;
  const out = [];
  let seg = 0;
  for (let k = 0; k < n; k += 1) {
    const target = (total * k) / (n - 1);
    while (seg < pts.length - 2 && cum[seg + 1] < target) seg += 1;
    const span = cum[seg + 1] - cum[seg] || 1;
    const t = Math.min(1, Math.max(0, (target - cum[seg]) / span));
    out.push([
      pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * t,
      pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * t,
    ]);
  }
  return out;
}

function strokeDistance(a, b) {
  const ra = resample(a, RESAMPLE);
  const rb = resample(b, RESAMPLE);
  let sum = 0;
  for (let i = 0; i < RESAMPLE; i += 1) {
    sum += Math.hypot(ra[i][0] - rb[i][0], ra[i][1] - rb[i][1]);
  }
  return { mean: sum / RESAMPLE, start: Math.hypot(ra[0][0] - rb[0][0], ra[0][1] - rb[0][1]) };
}

const kvg = JSON.parse(readFileSync(resolve(DATA, 'strokes.json'), 'utf8')).strokes;
const shards = new Map();
for (let s = 0; s < 16; s += 1) {
  const sid = s.toString(16).padStart(2, '0');
  shards.set(sid, JSON.parse(readFileSync(resolve(DATA, `animcjk/${sid}.json`), 'utf8')).entries);
}

const parseMedian = (d) => {
  if (Array.isArray(d)) return d;
  const n = d.match(/-?[\d.]+/g).map(Number);
  const p = [];
  for (let i = 0; i < n.length; i += 2) p.push([n[i], n[i + 1]]);
  return p;
};

const approved = [];
const rejected = {};
const stats = [];
const report = process.argv.includes('--report');

const chars = Object.keys(kvg).sort();
for (const ch of chars) {
  const paths = kvg[ch];
  if (!Array.isArray(paths) || !paths.length) continue;
  const sid = (ch.codePointAt(0) % 16).toString(16).padStart(2, '0');
  const glyph = shards.get(sid)?.[ch];
  if (!glyph || !Array.isArray(glyph.medians)) continue;
  if (glyph.medians.length !== paths.length) {
    rejected[ch] = `count ${glyph.medians.length}≠${paths.length}`;
    continue;
  }
  let worstMean = 0;
  let worstStart = 0;
  let ok = true;
  for (let i = 0; i < paths.length && ok; i += 1) {
    const canonical = flattenKanjiVGPath(paths[i]);
    const brush = parseMedian(glyph.medians[i]);
    if (canonical.length < 2 || brush.length < 2) {
      ok = false;
      rejected[ch] = `stroke ${i + 1} unreadable`;
      break;
    }
    const { mean, start } = strokeDistance(canonical, brush);
    worstMean = Math.max(worstMean, mean);
    worstStart = Math.max(worstStart, start);
    if (mean > MEAN_TOLERANCE || start > START_TOLERANCE) {
      ok = false;
      rejected[ch] = `stroke ${i + 1} diverges (mean ${Math.round(mean)}, start ${Math.round(start)})`;
    }
  }
  if (ok) {
    approved.push(ch);
    stats.push(worstMean);
  }
}

if (report) {
  stats.sort((a, b) => a - b);
  const pct = (p) => Math.round(stats[Math.min(stats.length - 1, Math.floor((stats.length * p) / 100))]);
  console.log(`approved worst-stroke mean distance percentiles: p50=${pct(50)} p90=${pct(90)} p99=${pct(99)} max=${pct(100)}`);
  for (const probe of ['経', '衷', '永', '滅', '書']) {
    console.log(`  ${probe}: ${approved.includes(probe) ? 'APPROVED' : `rejected — ${rejected[probe] || 'not in both corpora'}`}`);
  }
}

const manifest = {
  what: 'AnimCJK↔KanjiVG equivalence manifest — the checked list under the orthographic-authority ruling (issue #79). The living renderer may take AnimCJK brush outlines ONLY for characters listed in approved; everything else keeps the canonical KanjiVG hand.',
  law: 'KanjiVG is the canonical Japanese glyph and stroke-order authority; AnimCJK paints only where proven equivalent, stroke by stroke.',
  method: {
    strokeCount: 'must be equal',
    perStroke: `medians resampled to ${RESAMPLE} points; mean point distance ≤ ${MEAN_TOLERANCE} and start-point distance ≤ ${START_TOLERANCE} (1024-glyph-space units)`,
    generator: 'tools/build-animcjk-equivalence.mjs',
  },
  counts: {
    checked: chars.filter((ch) => shards.get((ch.codePointAt(0) % 16).toString(16).padStart(2, '0'))?.[ch]).length,
    approved: approved.length,
    rejected: Object.keys(rejected).length,
  },
  approved,
  rejected,
};

writeFileSync(OUT, `${JSON.stringify(manifest)}\n`);
console.log(
  `equivalence manifest → ${OUT}: ${manifest.counts.approved} approved, ${manifest.counts.rejected} rejected of ${manifest.counts.checked} checked`,
);
