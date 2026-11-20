// prototypes/corridor/modules/orbit-field.mjs — the corridor's own copy of the ORBITING WORD FIELD MECHANICS.
//
// Extracted 2026-11-06 for G2 (assertion [5]) from Meguri's standalone prototype, claude/meguri-20261016 @ aa567e27,
// prototypes/meguri/index.html (the inline script: RING_DEF l.211, layoutRings l.245, ringPoint l.246, station seeding
// l.251, passes/depthK l.252–253, syncDepth/placeStations l.254–255, the crossing mechanic of tick l.393–397 and the pass
// record of fire l.399). Spec: S9-R11 / C12 — one opening field; Meguri's orbit mechanics join Drift as a mode only after the
// Creative Bar; S9-AC6 — no separate Meguri entry. The standalone Meguri UI (canvas ink, posters and their faces, fonts,
// sound, speech, pad, page, storage) is NOT here; L5.3 archives it from aa567e27. This module is pure: no DOM, no audio,
// no storage, no timers — a caller supplies the clock (seconds), the size and the words, and reads positions back.
//
// Mechanics, as in the source:
//   five rings, one per group, each a tilted ellipse normalised to the field (centre c, radii r, tilt, period in seconds
//   at 72 bpm); a station (word) sits on its group's ring at a seeded angle; a playhead runs round each ring at
//   TAU / (period / speed) rad·s⁻¹ with speed = bpm / 72 and fires a station when it crosses the station's angle (a pass);
//   every pass pulls the station toward the centre — depth k = 1 − .45·min(1, passes / 8), eased 6 % per step; drift turns
//   the stations themselves at ±.012 rad·s⁻¹ by ring parity; a master clock turns once per 240 / bpm seconds; a station
//   fires at most once per 400 ms, and a manual tap fires it without counting as a pass (the source's fire(s, manual)).

export const TAU = Math.PI * 2;
export const GROUPS = ['history', 'ai', 'india', 'language', 'mind'];
// geometry and timing only; the source's `oct` (pluck octave) and `dash` (ring stroke) are audio/render and stay out
export const RING_DEF = [
  { g: 'history',  c: [.50, .40], r: [.44, .26], tilt: -.12, period: 17 },
  { g: 'ai',       c: [.48, .52], r: [.36, .33], tilt: .35,  period: 13 },
  { g: 'india',    c: [.54, .46], r: [.28, .40], tilt: -.55, period: 21 },
  { g: 'language', c: [.46, .58], r: [.40, .18], tilt: .10,  period: 10 },
  { g: 'mind',     c: [.52, .49], r: [.47, .41], tilt: 0,    period: 26 },
];
export const SEED = 1016;          // the source's station seed
export const DEPTH_PULL = .45;     // how far eight passes pull a station toward the centre
export const DEPTH_FULL = 8;       // passes at which the pull is complete
export const EASE = .06;           // depth easing per step
export const DRIFT = .012;         // rad·s⁻¹
export const DT_MAX = .05;         // the clock never jumps more than this per step
export const DEBOUNCE_MS = 400;    // a station fires at most once per 400 ms (the source's fire)
// Startup mapping: the source initialised station.last = 0 and compared it with performance.now(), which is far above
// 400 ms by the first fire, so the first fire was always allowed; the field's clock starts at 0, so last = -Infinity keeps
// exactly that semantics (first fire allowed, then the 400 ms window).

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function layoutRings(width, height, previous = null) {
  return RING_DEF.map((d, i) => ({
    ...d, i, cx: d.c[0] * width, cy: d.c[1] * height, rx: d.r[0] * width, ry: d.r[1] * height,
    phi: previous && previous[i] ? previous[i].phi : (i * 1.37) % TAU,
  }));
}

export function ringPoint(ring, t, k = 1) {
  const ct = Math.cos(ring.tilt), st = Math.sin(ring.tilt);
  const x = ring.rx * k * Math.cos(t), y = ring.ry * k * Math.sin(t);
  return { x: ring.cx + x * ct - y * st, y: ring.cy + x * st + y * ct };
}

export function depthK(passes) {
  return 1 - DEPTH_PULL * Math.min(1, passes / DEPTH_FULL);
}

export const normalise = (t) => ((t % TAU) + TAU) % TAU;

/** words: [{ w: string, g: group }] — the word's text and its ring (group). */
export function createOrbitField({ words, width = 360, height = 600, seed = SEED, passes = {} }) {
  const rings = layoutRings(width, height);
  const stations = words.map((w, i) => ({ i, w, g: w.g, ring: GROUPS.indexOf(w.g), t: 0, k: 1, kT: 1, x: 0, y: 0, last: -Infinity }));
  const rnd = mulberry32(seed);
  RING_DEF.forEach((r, ri) => {
    const ss = stations.filter((s) => s.g === r.g);
    ss.forEach((s, j) => { s.t = ((j + .5) / ss.length) * TAU + ri * .37 + (rnd() - .5) * .22; });
  });
  const field = { width, height, rings, stations, master: 0, timeMs: 0, passes: { ...passes } };
  syncDepth(field);
  for (const s of stations) s.k = s.kT;
  placeStations(field);
  return field;
}

export const passesOf = (field, station) => field.passes[station.w.w] || 0;

export function syncDepth(field) {
  for (const s of field.stations) s.kT = depthK(passesOf(field, s));
}

export function placeStations(field) {
  for (const s of field.stations) {
    s.k += (s.kT - s.k) * EASE;
    const p = ringPoint(field.rings[s.ring], s.t, s.k);
    s.x = p.x; s.y = p.y;
  }
}

export function resizeOrbitField(field, width, height) {
  field.width = width; field.height = height;
  field.rings = layoutRings(width, height, field.rings);
  placeStations(field);
}

/** Record one pass: passes + 1 and the depth pull (the source's fire() in grow mode). */
export function recordPass(field, station) {
  const p = passesOf(field, station) + 1;
  field.passes[station.w.w] = p;
  station.kT = depthK(p);
  return p;
}

/**
 * Fire a station as the source's fire(s, manual) does: at most once per 400 ms on the field's clock; a playhead crossing
 * (manual false) with grow on records a pass; a manual tap never grows. Returns { fired, grew }.
 */
export function fireStation(field, station, { manual = false, grow = true } = {}) {
  if (field.timeMs - station.last < DEBOUNCE_MS) return { fired: false, grew: false };
  station.last = field.timeMs;
  const grew = grow && !manual;
  if (grew) recordPass(field, station);
  return { fired: true, grew };
}

/**
 * Advance the field by dt seconds. Returns the stations the playheads crossed in this step (in ring order, then station
 * order), exactly as the source's tick decided them; each crossing goes through fireStation (400 ms debounce; `grow`
 * records it as a pass). The field's own clock advances by dt, so the debounce needs no wall clock.
 */
export function advanceOrbitField(field, dt, { playing = true, bpm = 72, drift = false, grow = true } = {}) {
  // Two clocks, as in the source: the fire debounce ran on performance.now() (uncapped wall time) while tick capped the
  // physics step at .05 s. So the field's clock takes the RAW non-negative dt, and only the physics dt is clamped.
  const raw = Math.max(0, Number.isFinite(dt) ? dt : 0);
  field.timeMs += raw * 1000;
  dt = Math.min(DT_MAX, raw);
  const fired = [];
  if (playing) {
    const speed = bpm / 72;
    field.master = (field.master + dt * TAU / (240 / bpm)) % TAU;
    for (const r of field.rings) {
      const prev = r.phi, cur = prev + dt * TAU / (r.period / speed);
      for (const s of field.stations) {
        if (s.ring !== r.i) continue;
        let a = s.t;
        while (a <= prev) a += TAU;
        while (a > prev + TAU) a -= TAU;
        if (a <= cur) fired.push(s);
      }
      r.phi = cur % TAU;
    }
  }
  if (drift) for (const s of field.stations) { s.t = normalise(s.t + dt * DRIFT * (s.ring % 2 ? 1 : -1)); }
  const out = fired.filter((s) => fireStation(field, s, { manual: false, grow }).fired);
  placeStations(field);
  return out;
}
