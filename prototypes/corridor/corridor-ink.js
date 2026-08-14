/* 墨 corridor-ink — the living fluid-ink engine, in the app.
 *
 * This module is the CANONICAL home of the D2Q9 lattice-Boltzmann ink engine
 * born in design/stroke-art-v5.html and palette-parameterized in
 * design/stroke-art-iro.html (both stay frozen as design artifacts). The
 * physics, WGSL, writer's hand, sprite rasterizer and WebGL2 fallback are
 * lifted from stroke-art-iro's ENGINE-CORE; the one structural change is
 * that the glyph is a PARAMETER — the gallery hard-coded 永, the corridor
 * writes any kanji the reader opens.
 *
 * The app data is KanjiVG: stroke CENTERLINES in a 109×109 box, no brush
 * outlines. strokesFromKanjiVG() adapts them — centerlines are scaled to the
 * engine's 1024 glyph space and a brush outline is SYNTHESIZED around each
 * (entry press, body, and a tail that tapers on sweeps, sits on stops,
 * rounds on dots) so the bristle rasterizer has a body to work inside.
 *
 * War-scars honored: ONE shared GPUDevice (a second requestDevice can poison
 * the first); a claimed canvas context type is claimed forever, so fallback
 * needs a FRESH canvas (the caller owns that); RGBA16F half-float state in
 * the GL2 path (filterable on iOS where 32F is not); snapshot BEFORE stop.
 */

/* ===================================================================== *
 *  ENGINE-CORE — lifted from design/stroke-art-iro.html (lines 39–462). *
 *  Do not edit the physics or WGSL here without re-proving them in the  *
 *  Deno/lavapipe harness. The writer is generalized to take strokes.    *
 * ===================================================================== */

export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function medianLen(pts) {
  let L = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cum.push(L);
  }
  return { L, cum };
}
function norm(v) {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}
export function pointAt(pts, cum, t) {
  const target = t * cum[cum.length - 1];
  let i = 1;
  while (i < cum.length && cum[i] < target) i++;
  if (i >= cum.length) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    return { p: b, dir: norm([b[0] - a[0], b[1] - a[1]]) };
  }
  const f = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return {
    p: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f],
    dir: norm([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]),
  };
}
function easeFor(type) {
  if (type === 'sweep') return (k) => Math.pow(k, 0.72);
  if (type === 'dot') return (k) => 1 - Math.pow(1 - k, 2.2);
  return (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
}

/** The hand — iro's makeWriter with the glyph as a parameter. */
export function makeWriterFor(strokes) {
  let i = -1, t0 = 0, prevT = 0, settleUntil = 0, after = 0, done = true;
  return {
    start(now) { i = 0; t0 = now + 600; prevT = 0; settleUntil = 0; after = 0; done = false; },
    get done() { return done; },
    advance(now) {
      const out = { splats: [], beginStroke: null, finished: false };
      if (done || i < 0) return out;
      const s = strokes[i];
      const raw = (now - t0) / s.dur;
      if (raw >= 0 && prevT < 1) {
        // a slow frame must slow the hand, never tear the stroke: cap the
        // advance so one frame's splats always fit the engine's buffer
        const tCap = prevT + (115 * 5) / s.L;
        const t = Math.min(1, raw, tCap);
        const n = Math.max(1, Math.ceil(((t - prevT) * s.L) / 5));
        const ease = easeFor(s.type);
        for (let k = 1; k <= n; k++) {
          const tt = prevT + ((t - prevT) * k) / n;
          const { p } = pointAt(s.medPts, s.cum, tt);
          const dt = 0.012;
          const v = (ease(Math.min(1, tt + dt)) - ease(Math.max(0, tt - dt))) / (2 * dt);
          const slow = 1 - Math.min(1, v * 0.85);
          const press = tt < 0.12 ? (0.12 - tt) * 6 : s.type === 'stop' && tt > 0.86 ? (tt - 0.86) * 6 : 0;
          out.splats.push({
            x: p[0], y: p[1],
            rCore: 62 * (1 + 0.35 * Math.max(slow, press)),
            rWater: 80 * (1 + 0.9 * Math.max(slow, press)),
            wet: 0.0006 + 0.06 * Math.max(slow * 0.5, Math.min(1, press)),
            dry: 0.105,
            press: Math.min(1, press) * 0.6,
          });
        }
        prevT = t;
        if (t >= 1) settleUntil = now + (s.type === 'stop' ? 460 : 260);
      }
      if (prevT >= 1 && now >= settleUntil) {
        if (i + 1 < strokes.length) { i += 1; prevT = 0; t0 = now + 120; out.beginStroke = i; }
        else if (!after) after = now + 4200;
      }
      if (after && now >= after) { done = true; out.finished = true; }
      return out;
    },
  };
}

export const WGSL_COMMON = `
struct Params {
  N: u32, mode: u32, nSplats: u32, seed: u32,
  tau: f32, evap: f32, absorb: f32, capEvap: f32,
  drag: f32, lift: f32, inkScale: f32, metal: f32,
  inkLow: vec4f, inkHigh: vec4f, sheenC: vec4f, sparkC: vec4f,
};
const C = array<vec2i, 9>(
  vec2i(0,0), vec2i(1,0), vec2i(0,1), vec2i(-1,0), vec2i(0,-1),
  vec2i(1,1), vec2i(-1,1), vec2i(-1,-1), vec2i(1,-1));
const W = array<f32, 9>(
  0.4444444444, 0.1111111111, 0.1111111111, 0.1111111111, 0.1111111111,
  0.0277777778, 0.0277777778, 0.0277777778, 0.0277777778);
fn cellIndex(N: u32, x: u32, y: u32) -> u32 { return y * N + x; }
fn hash2(p: vec2u, seed: u32) -> f32 {
  var h = p.x * 1664525u + p.y * 1013904223u + seed * 2246822519u;
  h ^= h >> 16u; h *= 2246822519u; h ^= h >> 13u; h *= 3266489917u; h ^= h >> 16u;
  return f32(h & 0xFFFFFFu) / 16777216.0;
}
fn vnoise(x: f32, y: f32, seed: u32) -> f32 {
  let xi = floor(x); let yi = floor(y);
  let xf = smoothstep(0.0, 1.0, x - xi); let yf = smoothstep(0.0, 1.0, y - yi);
  let p = vec2u(u32(i32(xi) & 0xFFFF), u32(i32(yi) & 0xFFFF));
  let a = hash2(p, seed); let b = hash2(p + vec2u(1u, 0u), seed);
  let c = hash2(p + vec2u(0u, 1u), seed); let d = hash2(p + vec2u(1u, 1u), seed);
  return mix(mix(a, b, xf), mix(c, d, xf), yf);
}
fn fiberAt(x: f32, y: f32, seed: u32) -> f32 {
  var n = 0.55 * vnoise(x * 0.055, y * 0.055, seed)
        + 0.30 * vnoise(x * 0.14,  y * 0.14,  seed + 7u)
        + 0.15 * vnoise(x * 0.4,   y * 0.4,   seed + 13u);
  n = 0.62 * n + 0.22 * vnoise(x * 0.012, y * 0.35, seed + 29u)
              + 0.16 * vnoise(x * 0.3,   y * 0.014, seed + 41u);
  return clamp(n, 0.0, 1.0);
}
`;

export const WGSL_INIT = WGSL_COMMON + `
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> f: array<f32>;
@group(0) @binding(2) var<storage, read_write> pig: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> aux: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> fiber: array<f32>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= P.N || g.y >= P.N) { return; }
  let i = cellIndex(P.N, g.x, g.y);
  let NN = P.N * P.N;
  for (var q = 0u; q < 9u; q++) { f[q * NN + i] = W[q]; }
  pig[i] = vec2f(0.0);
  aux[i] = vec4f(1.0, 0.0, 0.0, 0.0);
  let s = f32(P.N) / 1024.0;
  fiber[i] = fiberAt(f32(g.x) / s, f32(g.y) / s, P.seed);
}`;

export const WGSL_BRUSH = WGSL_COMMON + `
struct Splat { a: vec4f, b: vec4f };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> splats: array<Splat>;
@group(0) @binding(2) var<storage, read_write> f: array<f32>;
@group(0) @binding(3) var<storage, read_write> pig: array<vec2f>;
@group(0) @binding(4) var sprite: texture_2d<f32>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= P.N || g.y >= P.N) { return; }
  let i = cellIndex(P.N, g.x, g.y);
  let NN = P.N * P.N;
  let cell = vec2f(f32(g.x) + 0.5, f32(g.y) + 0.5);
  let body = textureLoad(sprite, vec2i(i32(g.x), i32(g.y)), 0).a;
  var addRho = 0.0;
  var addPig = 0.0;
  var push = vec2f(0.0);
  for (var s = 0u; s < P.nSplats; s++) {
    let sp = splats[s];
    let d = distance(cell, sp.a.xy);
    let core = 1.0 - smoothstep(sp.a.z * 0.85, sp.a.z, d);
    addPig += body * core * sp.b.y;
    let w = (1.0 - smoothstep(sp.a.w * 0.35, sp.a.w, d)) * (0.35 + 0.65 * body) * sp.b.x;
    addRho += w;
    if (d > 1.0 && w > 0.0) { push += normalize(cell - sp.a.xy) * w * sp.b.z; }
  }
  if (addRho > 0.0 || addPig > 0.0) {
    addRho = min(addRho, 0.30);
    for (var q = 0u; q < 9u; q++) {
      f[q * NN + i] += W[q] * addRho * (1.0 + 3.0 * dot(vec2f(C[q]), push));
    }
    let pg = pig[i];
    pig[i] = vec2f(pg.x + addPig, pg.y);
  }
}`;

export const WGSL_LBM = WGSL_COMMON + `
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> fOld: array<f32>;
@group(0) @binding(2) var<storage, read_write> fNew: array<f32>;
@group(0) @binding(3) var<storage, read> fiber: array<f32>;
@group(0) @binding(4) var<storage, read_write> aux: array<vec4f>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= P.N || g.y >= P.N) { return; }
  let N = i32(P.N);
  let i = cellIndex(P.N, g.x, g.y);
  let NN = P.N * P.N;
  var fq: array<f32, 9>;
  var rho = 0.0;
  var mom = vec2f(0.0);
  for (var q = 0u; q < 9u; q++) {
    let src = vec2i(clamp(i32(g.x) - C[q].x, 0, N - 1), clamp(i32(g.y) - C[q].y, 0, N - 1));
    let v = fOld[q * NN + cellIndex(P.N, u32(src.x), u32(src.y))];
    fq[q] = v;
    rho += v;
    mom += vec2f(C[q]) * v;
  }
  rho = max(rho, 1e-4);
  var u = mom / rho;
  let perm = 0.35 + 1.3 * fiber[i];
  u *= P.drag * (0.90 + 0.10 * clamp(perm / 1.65, 0.0, 1.0));
  let sp = length(u);
  if (sp > 0.18) { u *= 0.18 / sp; }
  let u2 = dot(u, u);
  for (var q = 0u; q < 9u; q++) {
    let cu = dot(vec2f(C[q]), u);
    let feq = W[q] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * u2);
    fq[q] = fq[q] - (fq[q] - feq) / P.tau;
  }
  let water = rho - 1.0;
  var evapAmt = 0.0;
  var absorbAmt = 0.0;
  if (water > 0.0005) {
    evapAmt = water * P.evap;
    absorbAmt = water * P.absorb * perm;
  }
  let sub = evapAmt + absorbAmt;
  for (var q = 0u; q < 9u; q++) { fNew[q * NN + i] = fq[q] - W[q] * sub; }
  let cap = aux[i].w * P.capEvap + absorbAmt;
  aux[i] = vec4f(rho - sub, u.x, u.y, cap);
}`;

export const WGSL_PIG = WGSL_COMMON + `
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> aux: array<vec4f>;
@group(0) @binding(2) var<storage, read> pigOld: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> pigNew: array<vec2f>;
@group(0) @binding(4) var<storage, read> fiber: array<f32>;
fn susAt(N: u32, x: i32, y: i32) -> f32 {
  let cx = clamp(x, 0, i32(N) - 1); let cy = clamp(y, 0, i32(N) - 1);
  return max(pigOld[cellIndex(N, u32(cx), u32(cy))].x, 0.0);
}
fn waterAt(N: u32, x: i32, y: i32) -> f32 {
  let cx = clamp(x, 0, i32(N) - 1); let cy = clamp(y, 0, i32(N) - 1);
  let a = aux[cellIndex(N, u32(cx), u32(cy))];
  return max(a.x - 1.0, 0.0);
}
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= P.N || g.y >= P.N) { return; }
  let i = cellIndex(P.N, g.x, g.y);
  let a = aux[i];
  let water = max(a.x - 1.0, 0.0);
  let capw = a.w;
  let wet = smoothstep(0.002, 0.05, water + capw * 0.4);
  let back = vec2f(f32(g.x) + 0.5, f32(g.y) + 0.5) - a.yz * 1.6;
  let bx = i32(floor(back.x - 0.5)); let by = i32(floor(back.y - 0.5));
  let fx = clamp(back.x - 0.5 - f32(bx), 0.0, 1.0); let fy = clamp(back.y - 0.5 - f32(by), 0.0, 1.0);
  let sBack = mix(
    mix(susAt(P.N, bx, by), susAt(P.N, bx + 1, by), fx),
    mix(susAt(P.N, bx, by + 1), susAt(P.N, bx + 1, by + 1), fx), fy);
  var s = mix(max(pigOld[i].x, 0.0), sBack, 0.85 * wet);
  let gw = vec2f(
    waterAt(P.N, i32(g.x) + 1, i32(g.y)) - waterAt(P.N, i32(g.x) - 1, i32(g.y)),
    waterAt(P.N, i32(g.x), i32(g.y) + 1) - waterAt(P.N, i32(g.x), i32(g.y) - 1)) * 0.5;
  let dry = 1.0 - smoothstep(0.002, 0.04, water);
  let gx3 = (g.x * 3u) % P.N; let gy3 = (g.y * 3u) % P.N;
  let gran = 0.55 + 1.3 * fiber[cellIndex(P.N, gx3, gy3)];
  var dep = s * (mix(0.004, 0.25, dry) * gran + length(gw) * 2.5 * dry);
  dep = min(dep, s);
  var settled = max(pigOld[i].y, 0.0);
  let lift = settled * P.lift * smoothstep(0.15, 0.6, water);
  pigNew[i] = vec2f(s - dep + lift, settled + dep - lift);
}`;

export const WGSL_RENDER = WGSL_COMMON + `
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> aux: array<vec4f>;
@group(0) @binding(2) var<storage, read> pig: array<vec2f>;
@group(0) @binding(3) var<storage, read> fiber: array<f32>;
@group(0) @binding(4) var ground: texture_2d<f32>;
@group(0) @binding(5) var gsamp: sampler;
@group(0) @binding(6) var frame: texture_storage_2d<rgba8unorm, write>;
fn settledAt(N: u32, x: i32, y: i32) -> f32 {
  let cx = clamp(x, 0, i32(N) - 1); let cy = clamp(y, 0, i32(N) - 1);
  return max(pig[cellIndex(N, u32(cx), u32(cy))].y, 0.0);
}
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= P.N || g.y >= P.N) { return; }
  let i = cellIndex(P.N, g.x, g.y);
  let a = aux[i];
  let water = max(a.x - 1.0, 0.0);
  let pg = pig[i];
  var ink = max(pg.y, 0.0) + max(pg.x, 0.0) * 0.92;
  let blur = 0.25 * (settledAt(P.N, i32(g.x) + 1, i32(g.y)) + settledAt(P.N, i32(g.x) - 1, i32(g.y))
                   + settledAt(P.N, i32(g.x), i32(g.y) + 1) + settledAt(P.N, i32(g.x), i32(g.y) - 1));
  ink = max(ink + 0.95 * (max(pg.y, 0.0) - blur), 0.0) * P.inkScale;
  let gx3 = (g.x * 3u) % P.N; let gy3 = (g.y * 3u) % P.N;
  let fib = fiber[cellIndex(P.N, gx3, gy3)];
  let uv = (vec2f(f32(g.x), f32(g.y)) + 0.5) / f32(P.N);
  let paper = textureSampleLevel(ground, gsamp, uv, 0.0).rgb;
  var col: vec3f;
  if (P.mode == 0u) {
    var alpha = 1.0 - exp(-ink * 1.8);
    alpha *= 0.92 + 0.08 * fib;
    let tint = mix(P.inkLow.rgb, P.inkHigh.rgb, clamp(ink * 0.55, 0.0, 1.0));
    col = min(paper * mix(vec3f(1.0), tint, alpha), paper);
    col += P.sheenC.rgb * smoothstep(0.01, 0.3, water);
  } else {
    let alpha = 1.0 - exp(-ink * 1.5);
    let spark = smoothstep(0.55, 1.0, fib) * alpha * P.metal;
    let metalC = mix(P.inkLow.rgb, P.inkHigh.rgb, clamp(ink * 0.5, 0.0, 1.0));
    col = paper + metalC * alpha * 0.95 + P.sparkC.rgb * spark * 0.35;
    col += P.sheenC.rgb * smoothstep(0.01, 0.3, water);
  }
  textureStore(frame, vec2i(i32(g.x), i32(g.y)), vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0));
}`;

export const WGSL_BLIT = `
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var out: VOut;
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  out.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  out.uv = vec2f(p.x, 1.0 - p.y);
  return out;
}
@group(0) @binding(0) var frame: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@fragment
fn fs(in: VOut) -> @location(0) vec4f { return textureSample(frame, samp, in.uv); }
`;

export const MAX_SPLATS = 128;
export function createLBM(device, N, pal) {
  const NN = N * N;
  const mk = (code, label) => device.createShaderModule({ code, label });
  const buf = (size, usage, label) => device.createBuffer({ size, usage, label });
  const ST = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;
  const f = [buf(9 * NN * 4, ST, 'fA'), buf(9 * NN * 4, ST, 'fB')];
  const pig = [buf(NN * 8, ST, 'pigA'), buf(NN * 8, ST, 'pigB')];
  const aux = buf(NN * 16, ST, 'aux');
  const fiber = buf(NN * 4, ST, 'fiber');
  const params = buf(112, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'params');
  const splats = buf(MAX_SPLATS * 32, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'splats');
  const frame = device.createTexture({ size: [N, N], format: 'rgba8unorm',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC, label: 'frame' });
  const ground = device.createTexture({ size: [N, N], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT, label: 'ground' });
  const sprite = device.createTexture({ size: [N, N], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT, label: 'sprite' });
  const samp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const pipe = (code, label) => device.createComputePipeline({
    layout: 'auto', compute: { module: mk(code, label), entryPoint: 'main' }, label });
  const pInit = pipe(WGSL_INIT, 'init');
  const pBrush = pipe(WGSL_BRUSH, 'brush');
  const pLbm = pipe(WGSL_LBM, 'lbm');
  const pPig = pipe(WGSL_PIG, 'pig');
  const pRender = pipe(WGSL_RENDER, 'render');

  const bg = (p, entries, label) => device.createBindGroup({
    layout: p.getBindGroupLayout(0),
    entries: entries.map((resource, binding) => ({ binding, resource })), label });
  const B = (buffer) => ({ buffer });
  const bgInit = bg(pInit, [B(params), B(f[0]), B(pig[0]), B(aux), B(fiber)], 'init');
  const bgBrush = [0, 1].map((c) => bg(pBrush, [B(params), B(splats), B(f[c]), B(pig[c]), sprite.createView()], 'brush' + c));
  const bgLbm = [0, 1].map((c) => bg(pLbm, [B(params), B(f[c]), B(f[1 - c]), B(fiber), B(aux)], 'lbm' + c));
  const bgPig = [0, 1].map((c) => bg(pPig, [B(params), B(aux), B(pig[c]), B(pig[1 - c]), B(fiber)], 'pig' + c));
  const bgRender = [0, 1].map((c) => bg(pRender,
    [B(params), B(aux), B(pig[c]), B(fiber), ground.createView(), samp, frame.createView()], 'render' + c));

  const WGN = Math.ceil(N / 16);
  let cur = 0;
  let palette = pal;
  const paramData = new ArrayBuffer(112);
  const pu = new Uint32Array(paramData);
  const pf = new Float32Array(paramData);
  const splatData = new Float32Array(MAX_SPLATS * 8);

  function writeParams(nSplats, seed) {
    pu[0] = N; pu[1] = palette.mode; pu[2] = nSplats; pu[3] = seed;
    pf[4] = 0.58; pf[5] = 0.006; pf[6] = 0.012; pf[7] = 0.9990;
    pf[8] = 0.97; pf[9] = 0.0022; pf[10] = 1.0; pf[11] = palette.metal || 0;
    pf.set(palette.low, 12); pf[15] = 1;
    pf.set(palette.high, 16); pf[19] = 1;
    pf.set(palette.sheen, 20); pf[23] = 1;
    pf.set(palette.spark || [1, 1, 1], 24); pf[27] = 1;
    device.queue.writeBuffer(params, 0, paramData);
  }

  return {
    N, frame, ground, sprite, params,
    get cur() { return cur; },
    setPalette(p) { palette = p; },
    reset(seed) {
      cur = 0;
      writeParams(0, seed >>> 0);
      const e = device.createCommandEncoder({ label: 'reset' });
      const p = e.beginComputePass();
      p.setPipeline(pInit); p.setBindGroup(0, bgInit); p.dispatchWorkgroups(WGN, WGN);
      p.end();
      device.queue.submit([e.finish()]);
    },
    frameStep(splatList, seed) {
      const n = Math.min(splatList.length, MAX_SPLATS);
      for (let k = 0; k < n; k++) {
        const s = splatList[k], o = k * 8;
        const g = N / 1024;
        splatData[o] = s.x * g; splatData[o + 1] = s.y * g;
        splatData[o + 2] = s.rCore * g; splatData[o + 3] = s.rWater * g;
        splatData[o + 4] = s.wet; splatData[o + 5] = s.dry; splatData[o + 6] = s.press; splatData[o + 7] = 0;
      }
      writeParams(n, seed >>> 0);
      if (n) device.queue.writeBuffer(splats, 0, splatData, 0, n * 8);
      const e = device.createCommandEncoder({ label: 'frame' });
      const p = e.beginComputePass();
      if (n) { p.setPipeline(pBrush); p.setBindGroup(0, bgBrush[cur]); p.dispatchWorkgroups(WGN, WGN); }
      for (let step = 0; step < 2; step++) {
        p.setPipeline(pLbm); p.setBindGroup(0, bgLbm[cur]); p.dispatchWorkgroups(WGN, WGN);
        p.setPipeline(pPig); p.setBindGroup(0, bgPig[cur]); p.dispatchWorkgroups(WGN, WGN);
        cur = 1 - cur;
      }
      p.setPipeline(pRender); p.setBindGroup(0, bgRender[cur]); p.dispatchWorkgroups(WGN, WGN);
      p.end();
      device.queue.submit([e.finish()]);
    },
    readBuffers() { return { aux, pig: pig[cur], fiber }; },
    destroy() {
      for (const b of [f[0], f[1], pig[0], pig[1], aux, fiber, params, splats]) b.destroy();
      for (const t of [frame, ground, sprite]) t.destroy();
    },
  };
}
/* ============================== end ENGINE-CORE ============================== */

/* ------------------------------------------------ KanjiVG → the writer's hand
 * KanjiVG carries each stroke as a CENTERLINE path in a 109×109 box. The
 * engine wants medians (for the hand) and a brush OUTLINE (for the bristle
 * sprite). The medians are the flattened centerline scaled ×(1024/109); the
 * outline is synthesized: a width profile with an entry press, a steady
 * body, and a tail the stroke's own type decides — sweeps thin to a point,
 * stops sit and round off, dots are one pressed teardrop. */

const KVG_SCALE = 1024 / 109;

/** Flatten one SVG path (KanjiVG subset: M/m C/c S/s L/l plus close) into
 * points in 1024-space. Cubics are sampled finely; KanjiVG has no arcs. */
export function flattenKanjiVGPath(d) {
  const nums = [];
  const cmds = [];
  const re = /([MmCcSsLlHhVvQqTtZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
  let m;
  while ((m = re.exec(d))) {
    if (m[1]) cmds.push({ c: m[1], args: (nums.push([]), nums[nums.length - 1]) });
    else if (cmds.length) nums[nums.length - 1].push(Number(m[2]));
  }
  const pts = [];
  let x = 0, y = 0, sx = 0, sy = 0, pcx = null, pcy = null, lastCmd = '';
  const emit = (px, py) => {
    const gx = px * KVG_SCALE, gy = py * KVG_SCALE;
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(gx - last[0], gy - last[1]) > 0.5) pts.push([gx, gy]);
  };
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      emit(
        u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      );
    }
    pcx = x2; pcy = y2; x = x3; y = y3;
  };
  const quad = (x1, y1, x2, y2) => {
    const steps = 18;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      emit(u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2);
    }
    pcx = x1; pcy = y1; x = x2; y = y2;
  };
  for (const { c, args } of cmds) {
    const rel = c === c.toLowerCase();
    const C0 = c.toUpperCase();
    let i = 0;
    while (i < args.length || (C0 === 'Z' && i === 0)) {
      if (C0 === 'M') {
        x = rel ? x + args[i] : args[i];
        y = rel ? y + args[i + 1] : args[i + 1];
        sx = x; sy = y;
        if (pts.length === 0) emit(x, y);
        i += 2;
      } else if (C0 === 'L') {
        x = rel ? x + args[i] : args[i];
        y = rel ? y + args[i + 1] : args[i + 1];
        emit(x, y);
        i += 2;
      } else if (C0 === 'H') { x = rel ? x + args[i] : args[i]; emit(x, y); i += 1; }
      else if (C0 === 'V') { y = rel ? y + args[i] : args[i]; emit(x, y); i += 1; }
      else if (C0 === 'C') {
        const a = rel ? [x + args[i], y + args[i + 1], x + args[i + 2], y + args[i + 3], x + args[i + 4], y + args[i + 5]]
                      : args.slice(i, i + 6);
        cubic(...a);
        i += 6;
      } else if (C0 === 'S') {
        const rx = 'CS'.includes(lastCmd) && pcx !== null ? 2 * x - pcx : x;
        const ry = 'CS'.includes(lastCmd) && pcy !== null ? 2 * y - pcy : y;
        const a = rel ? [rx, ry, x + args[i], y + args[i + 1], x + args[i + 2], y + args[i + 3]]
                      : [rx, ry, args[i], args[i + 1], args[i + 2], args[i + 3]];
        cubic(...a);
        i += 4;
      } else if (C0 === 'Q') {
        const a = rel ? [x + args[i], y + args[i + 1], x + args[i + 2], y + args[i + 3]] : args.slice(i, i + 4);
        quad(...a);
        i += 4;
      } else if (C0 === 'T') {
        const rx = 'QT'.includes(lastCmd) && pcx !== null ? 2 * x - pcx : x;
        const ry = 'QT'.includes(lastCmd) && pcy !== null ? 2 * y - pcy : y;
        const a = rel ? [rx, ry, x + args[i], y + args[i + 1]] : [rx, ry, args[i], args[i + 1]];
        quad(...a);
        i += 2;
      } else if (C0 === 'Z') { x = sx; y = sy; emit(x, y); break; }
      else break;
      lastCmd = C0;
    }
    lastCmd = C0;
  }
  return pts;
}

/** Synthesize a brush outline (SVG path string, 1024-space) around a
 * centerline. Width profile: press at entry, steady body, tail by type. */
function synthesizeOutline(medPts, cum, L, type) {
  const W0 = Math.min(72, Math.max(40, L * 0.11)); // short strokes write thinner
  const width = (t) => {
    let w = 1;
    if (type === 'dot') {
      w = 0.55 + 0.65 * Math.sin(Math.min(1, t) * Math.PI) + 0.15 * t;
    } else {
      if (t < 0.12) w = 0.62 + 0.46 * (t / 0.12); // 起筆 — the press in
      if (type === 'sweep' && t > 0.62) w *= Math.max(0.06, 1 - Math.pow((t - 0.62) / 0.38, 1.25)); // 払い
      if (type === 'stop' && t > 0.88) w *= 1 + 0.18 * ((t - 0.88) / 0.12); // 留め sits
    }
    return Math.max(3, W0 * w);
  };
  const nSteps = Math.max(14, Math.min(64, Math.round(L / 18)));
  const leftPts = [], rightPts = [];
  for (let i = 0; i <= nSteps; i++) {
    const t = i / nSteps;
    const { p, dir } = pointAt(medPts, cum, t);
    const w = width(t) / 2;
    leftPts.push([p[0] - dir[1] * w, p[1] + dir[0] * w]);
    rightPts.push([p[0] + dir[1] * w, p[1] - dir[0] * w]);
  }
  // round the entry cap; the tail cap follows the final width
  const cap = (center, from, to, segments) => {
    const out = [];
    const a0 = Math.atan2(from[1] - center[1], from[0] - center[0]);
    let a1 = Math.atan2(to[1] - center[1], to[0] - center[0]);
    const r = Math.hypot(from[0] - center[0], from[1] - center[1]);
    while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
    while (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
    for (let i = 1; i < segments; i++) {
      const a = a0 + ((a1 - a0) * i) / segments;
      out.push([center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r]);
    }
    return out;
  };
  const head = pointAt(medPts, cum, 0).p;
  const tail = pointAt(medPts, cum, 1).p;
  const poly = [
    ...leftPts,
    ...cap(tail, leftPts[leftPts.length - 1], rightPts[rightPts.length - 1], 6),
    ...rightPts.reverse(),
    ...cap(head, rightPts[rightPts.length - 1], leftPts[0], 6),
  ];
  return 'M' + poly.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join('L') + 'Z';
}

/** AnimCJK glyph data (TRUE brush outlines + medians, 1024-space — the same
 * format the design gallery's 永 carried) → engine stroke objects. This is
 * the gallery-quality path; the derivation is iro's STROKES map verbatim. */
export function deriveStrokes(outlines, medians) {
  const parseMedian = (d) => {
    if (Array.isArray(d)) return d; // AnimCJK shards carry point arrays
    const n = d.match(/-?[\d.]+/g).map(Number);
    const p = [];
    for (let i = 0; i < n.length; i += 2) p.push([n[i], n[i + 1]]);
    return p;
  };
  return outlines.map((o, i) => {
    const medPts = parseMedian(medians[i]);
    const { L, cum } = medianLen(medPts);
    const last = Math.hypot(
      medPts[medPts.length - 1][0] - medPts[medPts.length - 2][0],
      medPts[medPts.length - 1][1] - medPts[medPts.length - 2][1],
    );
    const type = last / L > 0.3 ? 'sweep' : L < 220 ? 'dot' : 'stop';
    return { outline: o, medPts, cum, L, type, dur: 420 + Math.pow(L, 0.88) * 3.0 };
  });
}

/** KanjiVG stroke paths (109-space centerlines) → engine stroke objects. */
export function strokesFromKanjiVG(paths) {
  return paths.map((d) => {
    let medPts = flattenKanjiVGPath(d);
    if (medPts.length < 2) medPts = [...medPts, [medPts[0]?.[0] ?? 512, (medPts[0]?.[1] ?? 512) + 1]];
    const { L, cum } = medianLen(medPts);
    const last = Math.hypot(
      medPts[medPts.length - 1][0] - medPts[medPts.length - 2][0],
      medPts[medPts.length - 1][1] - medPts[medPts.length - 2][1],
    );
    const type = last / L > 0.3 ? 'sweep' : L < 220 ? 'dot' : 'stop';
    return { outline: synthesizeOutline(medPts, cum, L, type), medPts, cum, L, type, dur: 420 + Math.pow(L, 0.88) * 3.0 };
  });
}

/* --------------------------------------------- sprites (verbatim from iro) */
export function buildSpriteCanvas(stroke, seed, size) {
  const K = size / 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = rng(seed);
  const path = new Path2D(stroke.outline);
  g.save();
  g.scale(K, K);
  g.clip(path);
  g.globalAlpha = 0.5;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 1024, 1024);
  const nB = 40;
  for (let b = 0; b < nB; b++) {
    const off = (b / (nB - 1) - 0.5) * 150 * (0.85 + r() * 0.3);
    const load = 0.75 + r() * 0.45;
    const deplete = 1.0 * (0.7 + r() * 0.7);
    g.beginPath();
    let started = false;
    const steps = Math.max(26, Math.floor(stroke.L / 14));
    for (let sIx = 0; sIx <= steps; sIx++) {
      const t = sIx / steps;
      const { p, dir } = pointAt(stroke.medPts, stroke.cum, t);
      const px = p[0] - dir[1] * off + (r() - 0.5) * 7;
      const py = p[1] + dir[0] * off + (r() - 0.5) * 7;
      if (!started) { g.moveTo(px, py); started = true; } else g.lineTo(px, py);
    }
    const edge = Math.abs(off) / 75;
    const alpha = Math.max(0, load - edge * 0.5) * 0.5;
    g.strokeStyle = '#fff';
    g.lineWidth = 4 + r() * 13;
    g.lineCap = 'round';
    const segs = 5;
    for (let sg = 0; sg < segs; sg++) {
      const a = alpha * (1 - deplete * (sg / segs)) * (0.65 + r() * 0.35);
      if ((sg > segs - 3 && r() < 0.4 * deplete * (sg / segs) * 3) || r() < 0.05) continue;
      g.globalAlpha = Math.max(0, a);
      g.setLineDash([stroke.L / segs, (stroke.L * (segs - 1)) / segs]);
      g.lineDashOffset = (-stroke.L * sg) / segs;
      g.stroke();
    }
    g.setLineDash([]);
  }
  g.restore();
  return c;
}

export function buildFiberBytes(seed, size) {
  const r = rng(seed);
  const G = 65, grid = new Float32Array(G * G);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const sm = (x) => x * x * (3 - 2 * x);
  const noise = (x, y) => {
    const xi = Math.floor(x) % (G - 1), yi = Math.floor(y) % (G - 1);
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const a = grid[yi * G + xi], b = grid[yi * G + xi + 1], c2 = grid[(yi + 1) * G + xi], d = grid[(yi + 1) * G + xi + 1];
    return a + (b - a) * sm(xf) + (c2 - a) * sm(yf) + (a - b - c2 + d) * sm(xf) * sm(yf);
  };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let n = 0.55 * noise(x * 0.055, y * 0.055) + 0.3 * noise(x * 0.14, y * 0.14) + 0.15 * noise(x * 0.4, y * 0.4);
      n = 0.62 * n + 0.22 * noise(x * 0.012, y * 0.35) + 0.16 * noise(x * 0.3, y * 0.014);
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, n * 255));
      data[i + 3] = 255;
    }
  return data;
}

/* --------------------------------------------------- still ink (instant boot) */
export function paintStillFor(canvas, spec) {
  const sim = spec.gl2Sim;
  canvas.width = canvas.height = sim;
  const g = canvas.getContext('2d');
  const r = rng((Math.random() * 1e9) >>> 0);
  g.drawImage(spec.ground(r, sim), 0, 0);
  const scale = 1;
  for (let i = 0; i < spec.strokes.length; i++) {
    const sp = buildSpriteCanvas(spec.strokes[i], 7 + i * 977, sim);
    const t = document.createElement('canvas');
    t.width = t.height = sim;
    const tg = t.getContext('2d');
    tg.drawImage(sp, 0, 0);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = spec.still;
    tg.fillRect(0, 0, sim, sim);
    g.save();
    g.scale(scale, scale);
    g.globalAlpha = 0.94;
    g.drawImage(t, 0, 0);
    g.restore();
  }
}

/* ------------------------------------------------------- live engines
 * Handle contract (both backends): { kind, ondead, rewrite(), stop() },
 * GPU adds .ready (a promise that rejects on validation failure). */
function startGPU(canvas, spec, device) {
  let alive = true, dead = false, done = false, seed = 0;
  const N = spec.gpuN;
  device.pushErrorScope('validation');
  const engine = createLBM(device, N, spec.pal);
  // 1:1 presentation — the canvas backing IS the lattice, so the browser
  // downsamples once to display size and every kasure streak stays sharp
  // (the old disp-sized backing UPSCALED 1024 -> ~1150 and softened it all)
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });
  const blitMod = device.createShaderModule({ code: WGSL_BLIT, label: 'blit' });
  const blitPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: blitMod, entryPoint: 'vs' },
    fragment: { module: blitMod, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' }, label: 'blit' });
  const blitSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const blitBG = device.createBindGroup({
    layout: blitPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: engine.frame.createView() }, { binding: 1, resource: blitSamp }] });
  const initCheck = device.popErrorScope().then((e) => { if (e) throw new Error('webgpu validation: ' + e.message); });
  const writer = makeWriterFor(spec.strokes);
  // writing → drying → idle. The sheet only counts as finished after the
  // drying tail — the water dies and the pigment deposits crisp; that dried
  // state IS the design stills' quality. No auto-rewrite: the design law is
  // 触れて、もう一度 — the hand writes again on touch, never on a timer.
  //
  // PACE LAW (quality bug found live): the simulation density is FIXED —
  // every write advances the hand ~16.7 write-ms per lattice frameStep, the
  // exact rhythm the gallery renders were made at. Wall-clock speed comes
  // from `iterations` (sim frames per rAF, physics identical), and the
  // learner's ゆっくり from `speed` (< 1 = MORE simulation per stroke —
  // richer ink, never poorer). Never trade sim steps for wall time.
  let mode = 'idle', writeSpeed = 1, iterations = 1, writeClock = 0, dryLeft = 0;
  const DRY_STEPS = 240;
  function begin(opts) {
    try {
      writeSpeed = (opts && opts.speed) || 1;
      iterations = (opts && opts.iterations) || 1;
      seed = (Math.random() * 1e9) >>> 0;
      const r = rng(seed);
      engine.reset(seed);
      device.queue.copyExternalImageToTexture({ source: spec.ground(r, N) }, { texture: engine.ground }, [N, N]);
      uploadSprite(0);
      writer.start(0);
      writeClock = 0;
      mode = 'writing';
      spec.onPhase && spec.onPhase('writing', { hidden: !!(opts && opts.hidden) });
      spec.onStroke && spec.onStroke(0);
    } catch (e) { console.error('ink gpu begin failed:', e); dead = true; }
  }
  function uploadSprite(ix) {
    device.queue.copyExternalImageToTexture(
      { source: buildSpriteCanvas(spec.strokes[ix], seed + ix * 977, N) }, { texture: engine.sprite }, [N, N]);
  }
  function blit() {
    const e = device.createCommandEncoder({ label: 'blit' });
    const rp = e.beginRenderPass({ colorAttachments: [{
      view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store',
      clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    rp.setPipeline(blitPipe); rp.setBindGroup(0, blitBG); rp.draw(3);
    rp.end();
    device.queue.submit([e.finish()]);
  }
  function frame(now) {
    if (!alive) return;
    if (dead) { handle.ondead && handle.ondead(); return; }
    requestAnimationFrame(frame);
    try {
      if (mode === 'writing') {
        for (let k = 0; k < iterations && mode === 'writing'; k++) {
          writeClock += 16.7 * writeSpeed;
          const step = writer.advance(writeClock);
          if (step.beginStroke !== null) {
            uploadSprite(step.beginStroke);
            spec.onStroke && spec.onStroke(step.beginStroke);
          }
          engine.frameStep(step.splats, seed);
          if (step.finished) { mode = 'drying'; dryLeft = DRY_STEPS; }
        }
        blit();
      } else if (mode === 'drying') {
        const per = Math.max(4, iterations * 4);
        for (let i = 0; i < per && dryLeft > 0; i++, dryLeft--) engine.frameStep([], seed);
        blit();
        if (!dryLeft) { mode = 'idle'; spec.onPhase && spec.onPhase('done'); }
      } else {
        blit();
      }
    } catch (e) { console.error('ink gpu frame failed:', e); dead = true; }
  }
  const handle = {
    kind: 'gpu',
    ondead: null,
    rewrite(opts) { if (alive && !dead) begin(opts); },
    stop() { alive = false; try { engine.destroy(); } catch { /* already gone */ } },
    ready: initCheck,
  };
  begin(spec.first);
  requestAnimationFrame(frame);
  return handle;
}

const GL2_VS = `#version 300 es
layout(location=0) in vec2 aP; out vec2 vUv;
void main(){ vUv = aP*0.5+0.5; gl_Position = vec4(aP,0.,1.); }`;
const GL2_STEP = `#version 300 es
precision highp float;
uniform sampler2D uState, uFiber;
uniform float uPx;
in vec2 vUv; out vec4 o;
void main(){
  vec4 c = texture(uState, vUv);
  float w = c.r, p = max(c.g, 0.), s = c.b;
  float fibp = texture(uFiber, vUv).r;
  float perm = 0.25 + 2.0 * pow(fibp, 1.6);
  vec4 nN = texture(uState, vUv + vec2(0., uPx));
  vec4 nS = texture(uState, vUv - vec2(0., uPx));
  vec4 nE = texture(uState, vUv + vec2(uPx, 0.));
  vec4 nW = texture(uState, vUv - vec2(uPx, 0.));
  float lapW = nN.r + nS.r + nE.r + nW.r - 4.*w;
  float wn = w + 0.10 * perm * lapW;
  wn *= 0.994;
  wn = clamp(wn, 0., 1.2);
  if (wn < 0.0004) wn = 0.;
  vec2 grad = vec2(nE.r - nW.r, nN.r - nS.r) * 0.5;
  float wet = smoothstep(0.004, 0.09, w);
  vec2 vel = -grad * 5. * perm * wet;
  vel = clamp(vel, vec2(-2.), vec2(2.));
  float pAdv = max(texture(uState, vUv - vel * uPx).g, 0.);
  float pn = mix(p, pAdv, 0.7 * wet);
  float lapP = max(nN.g,0.) + max(nS.g,0.) + max(nE.g,0.) + max(nW.g,0.) - 4.*p;
  pn += 0.07 * perm * wet * lapP;
  pn = max(pn, 0.);
  float dry = 1. - smoothstep(0.002, 0.05, wn);
  float gran = 0.55 + 1.3 * texture(uFiber, vUv * 3.1).r;
  float dep = pn * gran * mix(0.006, 0.30, dry);
  dep += pn * length(grad) * 3.0 * dry;
  dep = min(dep, pn);
  o = vec4(wn, pn - dep, s + dep, 1.);
}`;
const GL2_SPLAT = `#version 300 es
precision highp float;
uniform sampler2D uSprite;
uniform vec2 uC;
uniform float uRCore, uRWater, uWet, uDry, uSim;
in vec2 vUv; out vec4 o;
void main(){
  vec2 px = vUv * uSim;
  float d = distance(px, uC);
  float core = 1. - smoothstep(uRCore*0.85, uRCore, d);
  float body = texture(uSprite, vUv).a;
  float pig = body * core * uDry;
  float water = (1. - smoothstep(uRWater*0.35, uRWater, d)) * uWet;
  water *= 0.35 + 0.65*body;
  o = vec4(water, pig, 0., 0.);
}`;
const GL2_RENDER = `#version 300 es
precision highp float;
uniform sampler2D uState, uGround, uFiber;
uniform int uMode;
uniform float uPx, uMetal;
uniform vec3 uLow, uHigh, uSheen, uSpark;
in vec2 vUv; out vec4 o;
void main(){
  vec2 suv = vec2(vUv.x, 1.-vUv.y);
  vec4 st = texture(uState, suv);
  float fib = texture(uFiber, suv * 3.1).r;
  float ink = max(st.b + st.g * 0.92, 0.);
  float blur = 0.25 * (
    max(texture(uState, suv + vec2(uPx, 0.)).b, 0.) + max(texture(uState, suv - vec2(uPx, 0.)).b, 0.) +
    max(texture(uState, suv + vec2(0., uPx)).b, 0.) + max(texture(uState, suv - vec2(0., uPx)).b, 0.));
  ink = max(ink + 0.95 * (max(st.b, 0.) - blur), 0.);
  vec3 paper = texture(uGround, vUv).rgb;
  if (uMode == 0) {
    float a = 1. - exp(-ink * 1.8);
    a *= 0.92 + 0.08*fib;
    a = smoothstep(0.12, 0.6, a);
    vec3 tint = mix(uLow, uHigh, clamp(ink*0.55, 0., 1.));
    vec3 col = paper * mix(vec3(1.), tint, a);
    col = min(col, paper);
    col += uSheen * smoothstep(0.01, 0.3, st.r);
    o = vec4(col, 1.);
  } else {
    float a = 1. - exp(-ink * 1.5);
    a = smoothstep(0.08, 0.68, a);
    float spark = smoothstep(0.55, 1.0, fib) * a * uMetal;
    vec3 metalC = mix(uLow, uHigh, clamp(ink*0.5, 0., 1.));
    vec3 col = paper + metalC * a * 0.95 + uSpark * spark * 0.35;
    col += uSheen * smoothstep(0.01, 0.3, st.r);
    o = vec4(col, 1.);
  }
}`;

function startGL2(canvas, spec) {
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('no webgl2 float');
  gl.getExtension('OES_texture_float_linear');
  let alive = true, done = false, seed = 0;
  const SIM = spec.gl2Sim;
  // 1:1 presentation (see the GPU path) — backing = simulation resolution
  canvas.width = canvas.height = SIM;
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  function prog(fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, GL2_VS], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  }
  function tex(w, h, internal, format, type, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const pStep = prog(GL2_STEP), pSplat = prog(GL2_SPLAT), pRender = prog(GL2_RENDER);
  const state = [0, 1].map(() => tex(SIM, SIM, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR));
  const fbs = state.map((t) => {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return f;
  });
  const fiberT = tex(SIM, SIM, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  const groundT = tex(SIM, SIM, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  const spriteT = tex(SIM, SIM, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  let cur = 0;
  const writer = makeWriterFor(spec.strokes);
  const U = (p, n) => gl.getUniformLocation(p, n);
  // same lifecycle and PACE LAW as the GPU path: fixed simulation density,
  // wall speed via iterations, ゆっくり via speed < 1 (more sim, richer ink)
  let mode = 'idle', writeSpeed = 1, iterations = 1, writeClock = 0, dryLeft = 0;
  const DRY_STEPS = 480; // gl2 counts single lattice steps (the gpu path counts frameSteps of two)
  function draw() {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function begin(opts) {
    writeSpeed = (opts && opts.speed) || 1;
    iterations = (opts && opts.iterations) || 1;
    seed = (Math.random() * 1e9) >>> 0;
    const r = rng(seed);
    gl.bindTexture(gl.TEXTURE_2D, fiberT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SIM, SIM, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildFiberBytes(seed + 3, SIM));
    gl.bindTexture(gl.TEXTURE_2D, groundT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, spec.ground(r, SIM));
    for (const f of fbs) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.viewport(0, 0, SIM, SIM);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    uploadSprite(0);
    writer.start(0);
    writeClock = 0;
    mode = 'writing';
    spec.onPhase && spec.onPhase('writing', { hidden: !!(opts && opts.hidden) });
    spec.onStroke && spec.onStroke(0);
  }
  function uploadSprite(ix) {
    gl.bindTexture(gl.TEXTURE_2D, spriteT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, buildSpriteCanvas(spec.strokes[ix], seed + ix * 977, SIM));
  }
  function splat(list) {
    const g = SIM / 1024;
    gl.useProgram(pSplat);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[cur]);
    gl.viewport(0, 0, SIM, SIM);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, spriteT);
    gl.uniform1i(U(pSplat, 'uSprite'), 0);
    gl.uniform1f(U(pSplat, 'uSim'), SIM);
    for (const s of list) {
      gl.uniform2f(U(pSplat, 'uC'), s.x * g, s.y * g);
      gl.uniform1f(U(pSplat, 'uRCore'), s.rCore * g);
      gl.uniform1f(U(pSplat, 'uRWater'), s.rWater * g);
      gl.uniform1f(U(pSplat, 'uWet'), s.wet * (spec.wetScale ?? 1));
      gl.uniform1f(U(pSplat, 'uDry'), s.dry);
      draw();
    }
    gl.disable(gl.BLEND);
  }
  function step() {
    gl.useProgram(pStep);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[1 - cur]);
    gl.viewport(0, 0, SIM, SIM);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state[cur]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fiberT);
    gl.uniform1i(U(pStep, 'uState'), 0);
    gl.uniform1i(U(pStep, 'uFiber'), 1);
    gl.uniform1f(U(pStep, 'uPx'), 1 / SIM);
    draw();
    cur = 1 - cur;
  }
  function render() {
    gl.useProgram(pRender);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, SIM, SIM);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state[cur]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, groundT);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fiberT);
    gl.uniform1i(U(pRender, 'uState'), 0);
    gl.uniform1i(U(pRender, 'uGround'), 1);
    gl.uniform1i(U(pRender, 'uFiber'), 2);
    gl.uniform1i(U(pRender, 'uMode'), spec.pal.mode);
    gl.uniform1f(U(pRender, 'uPx'), 1 / SIM);
    gl.uniform1f(U(pRender, 'uMetal'), spec.pal.metal || 0);
    gl.uniform3fv(U(pRender, 'uLow'), spec.pal.low);
    gl.uniform3fv(U(pRender, 'uHigh'), spec.pal.high);
    gl.uniform3fv(U(pRender, 'uSheen'), spec.pal.sheen);
    gl.uniform3fv(U(pRender, 'uSpark'), spec.pal.spark || [1, 1, 1]);
    draw();
  }
  function frame(now) {
    if (!alive) return;
    requestAnimationFrame(frame);
    if (mode === 'writing') {
      for (let k = 0; k < iterations && mode === 'writing'; k++) {
        writeClock += 16.7 * writeSpeed;
        const out = writer.advance(writeClock);
        if (out.beginStroke !== null) {
          uploadSprite(out.beginStroke);
          spec.onStroke && spec.onStroke(out.beginStroke);
        }
        if (out.splats.length) splat(out.splats);
        step();
        step();
        if (out.finished) { mode = 'drying'; dryLeft = DRY_STEPS; }
      }
      render();
    } else if (mode === 'drying') {
      const per = Math.max(8, iterations * 8);
      for (let i = 0; i < per && dryLeft > 0; i++, dryLeft--) step();
      render();
      if (!dryLeft) { mode = 'idle'; spec.onPhase && spec.onPhase('done'); }
    } else {
      render();
    }
  }
  const handle = {
    kind: 'gl2',
    ondead: null,
    rewrite(opts) { if (alive) begin(opts); },
    stop() {
      alive = false;
      try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* gone */ }
    },
  };
  begin(spec.first);
  requestAnimationFrame(frame);
  return handle;
}

/* -------------------------------------------------- device & entry point */
let sharedDevicePromise = null;
/** ONE GPUDevice for the whole app — a second requestDevice can poison the
 * first (war-scar). Resolves null where WebGPU is absent. */
export function acquireDevice() {
  if (sharedDevicePromise) return sharedDevicePromise;
  sharedDevicePromise = (async () => {
    try {
      if (!navigator.gpu) return null;
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      device.lost.then(() => { sharedDevicePromise = null; });
      return device;
    } catch {
      return null;
    }
  })();
  return sharedDevicePromise;
}

/** Start a living-ink sheet on a FRESH canvas. Tries WebGPU (shared device),
 * falls back to WebGL2 on a replacement canvas the caller provides via
 * spec.freshCanvas(); throws only if both fail. */
export async function startInk(canvas, spec) {
  const device = await acquireDevice();
  if (device) {
    try {
      const h = startGPU(canvas, spec, device);
      await h.ready;
      return h;
    } catch (e) {
      console.warn('ink: webgpu path failed, falling back to webgl2 —', e.message);
      canvas = spec.freshCanvas ? spec.freshCanvas() : canvas;
    }
  }
  return startGL2(canvas, spec);
}
