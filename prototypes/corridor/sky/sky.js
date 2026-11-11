/* 宙 — the sky of the language. First screen of Bunki, drawn on the graphics card.
 *
 * One file, no dependencies. BunkiSky.mount(host, options) fills `host` with the sky and returns a controller.
 * The sky is a real space: every word has a place (x wraps round, y is height, z is depth by level), the
 * camera drifts so words pass from right to left, nearer words faster. A word opens into its own characters,
 * each character gathers only the words that carry it, and every line says why it is there.
 *
 * Layers, back to front: printed sky (ramp, pigment clouds, river of heaven) and far mist at half
 * resolution; stars; giant tone-on-tone characters; threads; words (text from two atlases); front mist; paper.
 */
(function () {
  'use strict';
  if (window.BunkiSky) return;

  /* ------------------------------------------------------------------ looks
   * Each look is the app's own pigments at night depth: c0..c3 = the sky from the top band down to the glow above
   * the mist; mistA/mistB = far and near mist; paper = the horizon the tabs sit on. text/textFar = a word near and
   * far; mark = the shared character; cord = the red thread of the path; line = family threads. */
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  const LOOKS = {
    hokusai: { c: ['#040a1b', '#081737', '#0e2c5c', '#2560a1'], mistA: '#7fb2e0', mistM: '#d3e3ee', mistB: '#f3ecd9', glow: '#fbf3df', star: '#f4efe0', text: '#fbf6e8', textFar: '#9fbfe0', mark: '#f2cf7a', cord: '#f0563f', line: '#e9c873', ghost: '#3f78b8', ink: '#0e2238', paper: '#f6efdc' },
    sumi: { c: ['#050506', '#101113', '#22252a', '#5a5f68'], mistA: '#9a9ea6', mistM: '#cfd0d2', mistB: '#f1ece0', glow: '#faf6ea', star: '#f2eee4', text: '#faf6ea', textFar: '#b3b6bd', mark: '#e7c98a', cord: '#d8503c', line: '#d9d3c3', ghost: '#6a6f78', ink: '#14171d', paper: '#f4efe2' },
    shu: { c: ['#1c0503', '#3d0906', '#74110b', '#c24a30'], mistA: '#e09a78', mistM: '#f6c9a8', mistB: '#fbf5e9', glow: '#fff3dc', star: '#fff1dc', text: '#fff7ea', textFar: '#f0b59c', mark: '#ffd98a', cord: '#ffd98a', line: '#f6cf8a', ghost: '#b8402a', ink: '#2b2620', paper: '#faf6ec' },
    akafuji: { c: ['#06101f', '#0e2340', '#1c3d6b', '#5a86ae'], mistA: '#d99b7c', mistM: '#f0c6a6', mistB: '#f6e8d4', glow: '#ffe9cf', star: '#fff2df', text: '#fff6e6', textFar: '#a9c3dc', mark: '#f4c77a', cord: '#f0674a', line: '#eebf80', ghost: '#3d6a99', ink: '#2a1a12', paper: '#f6e8d4' },
    iwa: { c: ['#120903', '#27150a', '#3f2412', '#8b5a2e'], mistA: '#c99561', mistM: '#dcae80', mistB: '#e6bd92', glow: '#f3d6ae', star: '#fbeed8', text: '#fbeed8', textFar: '#cfa77c', mark: '#f6d58c', cord: '#f08a5c', line: '#e9c07a', ghost: '#7a4d28', ink: '#24140a', paper: '#e6bd92' },
    keyblock: { c: ['#050505', '#0b0b0b', '#151413', '#2c2a27'], mistA: '#8d8a84', mistM: '#cfcabd', mistB: '#f4efe2', glow: '#faf6ea', star: '#f6f1e4', text: '#faf6ea', textFar: '#a9a59c', mark: '#faf6ea', cord: '#e0503c', line: '#cfc9ba', ghost: '#3a3835', ink: '#1c1b1a', paper: '#faf6ea' },
    rokusho: { c: ['#070504', '#120e0a', '#251e16', '#3f5247'], mistA: '#6f8f7c', mistM: '#a9b8a0', mistB: '#d9cfb8', glow: '#efe8d8', star: '#f6f1e4', text: '#f6f1e4', textFar: '#a9b8a6', mark: '#9fd8b4', cord: '#e0796b', line: '#b9d9c2', ghost: '#3d5a4a', ink: '#1a1512', paper: '#efe8d8' },
    yoru: { c: ['#04060f', '#0a1024', '#141d3f', '#2a3a6e'], mistA: '#6c6a86', mistM: '#8f86a0', mistB: '#ab966a', glow: '#d9c08a', star: '#f0d27a', text: '#f4ecd9', textFar: '#a8a9c4', mark: '#f0d27a', cord: '#ef8079', line: '#e3c36f', ghost: '#33457f', ink: '#121c36', paper: '#ab966a' },
    nami: { c: ['#030b14', '#0a1c2e', '#1a3450', '#3f7098'], mistA: '#8fb3d1', mistM: '#c3d6e2', mistB: '#e7dcc2', glow: '#f4f1e6', star: '#f4f1e6', text: '#f4f1e6', textFar: '#a3bfd6', mark: '#bfe0f6', cord: '#e4967d', line: '#cfe0ee', ghost: '#3a6f99', ink: '#10263c', paper: '#e7dcc2' },
    hakuu: { c: ['#090705', '#17120c', '#30271b', '#5c4a30'], mistA: '#8f8063', mistM: '#b9a985', mistB: '#e3d6ba', glow: '#f0e2c2', star: '#ecbf5a', text: '#efe5cf', textFar: '#b3a588', mark: '#ecbf5a', cord: '#e48072', line: '#d9a93f', ghost: '#5a4a30', ink: '#231a10', paper: '#e3d6ba' },
    kaku: { c: ['#02070a', '#061016', '#0d1921', '#17443f'], mistA: '#2f7d70', mistM: '#17443f', mistB: '#0d1921', glow: '#37e8b0', star: '#d8efe9', text: '#d8efe9', textFar: '#7fa9a0', mark: '#37e8b0', cord: '#ff6b4a', line: '#37e8b0', ghost: '#17443f', ink: '#d8efe9', paper: '#0d1921' },
  };

  /* ------------------------------------------------------------------ small tools */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mulberry = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  /** A critically damped spring: value and velocity move toward `to` without overshoot. */
  function spring(s, to, omega, dt) { const f = 1 + 2 * dt * omega, oo = omega * omega, hoo = dt * oo, hhoo = dt * hoo, det = 1 / (f + hhoo); const x = (f * s.x + dt * s.v + hhoo * to) * det; s.v = (s.v + hoo * (to - s.x)) * det; s.x = x; }

  /* ------------------------------------------------------------------ shaders */
  const VS_FULL = `#version 300 es
  in vec2 aP; out vec2 vUv; void main(){ vUv = aP*0.5+0.5; gl_Position = vec4(aP,0.,1.); }`;

  const NOISE = `
  float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
  vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h12(i),h12(i+vec2(1,0)),f.x), mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec2(17.1,9.2); a*=.5; } return s; }`;

  /* The printed sky and the mist, at one sample per CSS pixel. uMode 0: sky with every mist layer. uMode 1: only
   * the three nearest mist layers with their own alpha, laid over the words afterwards so words sink into them. */
  const FS_SKY = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform vec2 uRes; uniform float uT, uCamX, uCamY, uFH, uHor, uMode, uDim;
  uniform vec3 uC0, uC1, uC2, uC3, uMistA, uMistM, uMistB, uGlow;
  ${NOISE}
  const float BY[8] = float[8](-0.300, -0.210, -0.130, -0.066, -0.014, 0.040, 0.095, 0.160);
  const float BT[8] = float[8](0.0065, 0.0085, 0.011, 0.014, 0.018, 0.024, 0.031, 0.042);
  const float BA[8] = float[8](0.15, 0.21, 0.29, 0.40, 0.58, 0.74, 0.87, 0.95);
  vec3 ramp(float k){ return k < 0.5 ? mix(uMistA, uMistM, k*2.) : mix(uMistM, uMistB, k*2.-1.); }
  /* one floating band of mist: firmer above, long and graded below, tapering to rounded ends, never a full stripe */
  vec4 band(vec2 uv, float asp, int i){
    float fi = float(i), z = mix(9500., 1300., fi/7.);
    float x = (uv.x*asp + uCamX*uFH/z)*(1.05+0.22*fi) + uT*(0.0011+0.0007*fi) + fi*7.31;
    float n = vn(vec2(x*1.15, fi*3.1))*0.66 + vn(vec2(x*2.9, fi*5.3+2.))*0.24 + vn(vec2(x*6.3, fi*2.2+7.))*0.10;
    float body = clamp((n-0.44)/0.34, 0., 1.); body = sqrt(body);
    float th = BT[i]*mix(0.30, 1., body);
    float yc = uHor + BY[i] - uCamY*uFH/z*0.8 + 0.026*(vn(vec2(x*0.55, fi+9.))-.5) + 0.006*(vn(vec2(x*2.2, fi+3.))-.5);
    float dd = (uv.y - yc)/th;
    float a = (dd < 0. ? exp(-dd*dd*2.8) : exp(-dd*dd*0.50))*smoothstep(0., 0.30, body);
    a *= 0.80 + 0.20*vn(vec2(x*0.35 + fi*2., uv.y*760.));   // the brush leaves fine streaks in the mist
    vec3 col = mix(ramp(0.20 + 0.80*fi/7.), uGlow, 0.45*exp(-dd*dd*1.5));
    return vec4(col, a*BA[i]);
  }
  void main(){
    vec2 uv = vec2(vUv.x, 1.-vUv.y); float asp = uRes.x/uRes.y;
    float wob = 0.020*(vn(vec2(uv.x*asp*1.6 + uCamX*0.00002, 3.7))-.5);
    float g = smoothstep(uHor-0.035, uHor+0.19, uv.y + wob*0.6);
    float ga = smoothstep(uHor-0.035, uHor+0.085, uv.y + wob*0.6);
    if (uMode > 0.5) {
      float fa = smoothstep(uHor+0.005, uHor+0.10, uv.y + wob*0.6);
      vec3 c = ramp(pow(g, 0.85))*fa; float al = fa;
      for (int i=4;i<8;i++){ vec4 m = band(uv, asp, i); c = c*(1.-m.a) + m.rgb*m.a; al = al*(1.-m.a) + m.a; }
      o = vec4(c, al); return;
    }
    float y = uv.y + wob;
    vec3 c = mix(uC0, uC1, smoothstep(0.0, 0.15, y));
    c = mix(c, uC2, smoothstep(0.08, 0.47, y));
    c = mix(c, uC3, smoothstep(0.36, uHor+0.02, y));
    vec2 q = vec2(uv.x*asp + uCamX*uFH/26000., uv.y - uCamY*uFH/26000.)*1.2 + vec2(uT*0.0011, 0.);
    float w = fbm(q*1.1 + vec2(0., uT*0.003));
    float cl = fbm(q*1.75 + 1.7*vec2(w, -w));
    float river = exp(-pow((uv.y - (0.25 + 0.10*sin(q.x*0.95 + 0.6)))/0.125, 2.));
    float up = 1. - 0.75*smoothstep(uHor-0.16, uHor+0.01, uv.y);
    c += uC3*(0.74*smoothstep(0.38, 0.86, cl)*river + 0.22*smoothstep(0.52, 0.92, cl))*up + uMistA*0.07*river*smoothstep(0.3, 0.8, w)*up;
    c *= 1. - 0.34*smoothstep(0.56, 0.22, cl)*(1.-river)*smoothstep(0.92, 0.25, uv.y);
    float st = vn(vec2(uv.x*asp*2.2 + 11., uv.y*92.)) - .5;
    c *= 1. + 0.085*st*smoothstep(0.78, 0.08, uv.y);
    c = mix(c, c*0.42, uDim*smoothstep(uHor+0.02, uHor-0.25, uv.y));
    c += uGlow*0.10*smoothstep(uHor-0.22, uHor, uv.y)*(1.-ga);
    for (int i=0;i<4;i++){ vec4 m = band(uv, asp, i); c = mix(c, m.rgb, m.a*(1.-0.5*uDim)); }
    c = mix(c, ramp(pow(g, 0.85)), ga);
    for (int i=4;i<8;i++){ vec4 m = band(uv, asp, i); c = mix(c, m.rgb, m.a); }
    o = vec4(c, 1.);
  }`;

  /* Full resolution: the half-resolution sky, then stars as spatter of white pigment at three depths. */
  const FS_COMP = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uSky; uniform vec2 uRes; uniform float uT, uCamX, uCamY, uF, uHor, uDim, uDpr; uniform vec3 uStar; uniform vec2 uTilt;
  ${NOISE}
  float stars(vec2 P, float cell, float seed, float dens, float t){
    vec2 g = floor(P/cell), f = fract(P/cell);
    float has = step(1.-dens, h12(g*1.7+seed+3.1));
    vec2 c = 0.18 + 0.64*h22(g+seed);
    float big = pow(h12(g+seed+9.2), 7.);
    float r = mix(0.60, 2.5, big);
    float d = length((f-c)*cell);
    float tw = 0.72 + 0.28*sin(t*(0.25+h12(g+seed+5.)*0.8) + 6.283*h12(g+seed+7.) + dot(uTilt, g)*0.9);
    return has*smoothstep(r, r*0.30, d)*tw*(0.30+0.70*h12(g+seed+11.));
  }
  void main(){
    vec2 uv = vec2(vUv.x, 1.-vUv.y);
    vec3 c = texture(uSky, vUv).rgb;
    vec2 P = vec2(uv.x*uRes.x, uv.y*uRes.y)/uDpr;
    float asp = uRes.x/uRes.y;
    float river = exp(-pow((uv.y - (0.25 + 0.10*sin((uv.x*asp + uCamX*(uF/(uRes.y/uDpr))/26000.)*1.2*0.95 + 0.6)))/0.125, 2.));
    float fade = 1. - smoothstep(uHor-0.13, uHor-0.015, uv.y);
    vec2 s1 = vec2(uCamX, -uCamY)*uF/60000., s2 = vec2(uCamX, -uCamY)*uF/21000., s3 = vec2(uCamX, -uCamY)*uF/9000.;
    float s = stars(P+s1, 21., 1., 0.55, uT)*0.50 + stars(P+s2, 39., 2., 0.58, uT)*0.82 + stars(P+s3, 91., 3., 0.66, uT)*1.15;
    s += stars(P+s1*1.2, 11., 4., 0.70, uT)*0.46*river + stars(P+s2*1.1, 27., 5., 0.6, uT)*0.62*river + stars(P+s1*0.8, 7., 6., 0.5, uT)*0.22*river;
    c += uStar*s*fade*(1.-0.55*uDim);
    o = vec4(c, 1.);
  }`;

  /* A textured rectangle laid over the frame (front mist: premultiplied alpha; paper: multiply). */
  const FS_TEX = `#version 300 es
  precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uScale; uniform float uVig;
  void main(){ vec4 t = texture(uTex, vUv*uScale);
    if (uVig > 0.) { vec2 d = vUv-0.5; float v = 1. - uVig*smoothstep(0.35, 0.95, length(d*vec2(1.05,1.25)))*smoothstep(0.10, 0.50, vUv.y); o = vec4(vec3((0.925+0.15*t.r)*v), 1.); }
    else o = t; }`;

  /* Words: one rectangle per label; text coverage lives in the red channel, the marked character in green. */
  const VS_LAB = `#version 300 es
  in vec2 aQ; in vec4 aRect; in vec4 aUv; in vec4 aCol; in vec4 aMark; in vec4 aMisc;
  uniform vec2 uRes; out vec2 vUv; out vec4 vCol; out vec4 vMark; out vec4 vMisc; out vec4 vBox;
  void main(){ vec2 p = aRect.xy + (aQ-0.5)*aRect.zw; vUv = mix(aUv.xy, aUv.zw, aQ); vCol = aCol; vMark = aMark; vMisc = aMisc; vBox = aUv;
    gl_Position = vec4(p.x/uRes.x*2.-1., 1.-p.y/uRes.y*2., 0., 1.); }`;
  const FS_LAB = `#version 300 es
  precision highp float;
  in vec2 vUv; in vec4 vCol; in vec4 vMark; in vec4 vMisc; in vec4 vBox; out vec4 o;
  uniform sampler2D uBase, uNearA, uNearB, uGhost;
  vec2 samp(vec2 uv, float lod){
    if (vMisc.y < 0.5) return vec2(textureLod(uBase, uv, lod).r, 0.);
    if (vMisc.y < 1.5) return textureLod(uNearA, uv, lod).rg;
    if (vMisc.y < 2.5) return textureLod(uNearB, uv, lod).rg;
    return vec2(textureLod(uGhost, uv, lod).r, 0.);
  }
  void main(){
    float lod = max(vMisc.x, 0.);
    vec2 px = vMisc.zw*exp2(lod);
    vec2 lo = min(vBox.xy, vBox.zw) + px*0.5, hi = max(vBox.xy, vBox.zw) - px*0.5;
    vec2 uv = clamp(vUv, lo, hi);
    vec2 s = samp(uv, lod);
    if (lod > 0.8) { vec2 r = px*0.9; s = s*0.36 + 0.16*(samp(clamp(uv+r, lo, hi), lod) + samp(clamp(uv-r, lo, hi), lod) + samp(clamp(uv+vec2(r.x,-r.y), lo, hi), lod) + samp(clamp(uv+vec2(-r.x,r.y), lo, hi), lod)); }
    float a = s.r*vCol.a, m = s.g*vMark.a;
    o = vec4(vCol.rgb*a*(1.-m) + vMark.rgb*m, a + m - a*m);
  }`;

  /* Threads: screen-space ribbons with soft edges; aT runs 0..1 along the line, uniform-free so one draw call. */
  const VS_LINE = `#version 300 es
  in vec4 aP; in vec4 aCol; in vec2 aTp; uniform vec2 uRes; out vec4 vCol; out vec3 vS;
  void main(){ vCol = aCol; vS = vec3(aP.z, aTp); gl_Position = vec4(aP.x/uRes.x*2.-1., 1.-aP.y/uRes.y*2., 0., 1.); }`;
  const FS_LINE = `#version 300 es
  precision highp float; in vec4 vCol; in vec3 vS; out vec4 o;
  void main(){ float e = 1. - smoothstep(0.45, 1., abs(vS.x)); float tip = 1. - smoothstep(vS.z-0.06, vS.z, vS.y); float a = vCol.a*e*tip; o = vec4(vCol.rgb*a, a); }`;

  function program(gl, vs, fs) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('sky shader: ' + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('sky program: ' + gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i += 1) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  /* ------------------------------------------------------------------ mount */
  function mount(host, opt) {
    opt = opt || {};
    const root = host.attachShadow ? (host.shadowRoot || host.attachShadow({ mode: 'open' })) : host;
    root.innerHTML = '';
    const style = document.createElement('style'); style.textContent = SKY_CSS + (window.BunkiSky._css || ''); root.appendChild(style);
    const wrap = document.createElement('div'); wrap.className = 'sky'; root.appendChild(wrap);
    const canvas = document.createElement('canvas'); canvas.className = 'gl'; wrap.appendChild(canvas);
    const ui = document.createElement('div'); ui.className = 'ui'; wrap.appendChild(ui);
    // failIfMajorPerformanceCaveat: where the browser can only draw in software (no graphics card), no context is given,
    // so the old first screen stays instead of a sky at one frame a second
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true });
    if (!gl) { root.innerHTML = ''; if (opt.onFail) setTimeout(() => opt.onFail(new Error('no webgl2')), 0); return { destroy() { root.innerHTML = ''; }, ok: false }; }

    const S = {
      look: LOOKS[opt.look] ? opt.look : 'hokusai', pal: null,
      W: 0, H: 0, dpr: 1, F: 1000, px: 0, py: 0, hor: 0.835,
      t: 0, last: 0, frame: 0, running: true, reduced: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      cam: { x: 0, xTotal: 0, y: 0, z: 0 }, camTo: { x: 0, y: 0, z: 0 }, sx: { x: 0, v: 0 }, sy: { x: 0, v: 0 }, sz: { x: 0, v: 0 },
      par: { x: 0, y: 0 }, parS: { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } }, panV: { x: 0, y: 0 },
      drift: 5.4, driftK: { x: 1, v: 0 }, dim: { x: 0, v: 0 },
      pointer: { x: -1, y: -1, down: false, moved: 0, id: -1, sx: 0, sy: 0, lx: 0, ly: 0, lt: 0, inside: false },
    };
    const setLook = (name) => { S.look = LOOKS[name] ? name : 'hokusai'; const L = LOOKS[S.look]; S.pal = { c: L.c.map(hex), mistA: hex(L.mistA), mistM: hex(L.mistM), mistB: hex(L.mistB), glow: hex(L.glow), star: hex(L.star), text: hex(L.text), textFar: hex(L.textFar), mark: hex(L.mark), cord: hex(L.cord), line: hex(L.line), ghost: hex(L.ghost), ink: hex(L.ink), paper: hex(L.paper) }; wrap.dataset.look = S.look; if (opt.paper) { const pc = opt.paper(); if (pc) S.pal.mistB = pc; }
      for (const k of ['text', 'textFar', 'mark', 'cord', 'line', 'ink', 'paper', 'glow']) wrap.style.setProperty('--sky-' + k, L[k]); wrap.style.setProperty('--sky-deep', L.c[1]); wrap.style.setProperty('--sky-mid', L.c[2]); };
    setLook(S.look);

    /* programs and static geometry */
    const P = { sky: program(gl, VS_FULL, FS_SKY), comp: program(gl, VS_FULL, FS_COMP), tex: program(gl, VS_FULL, FS_TEX), lab: program(gl, VS_LAB, FS_LAB), line: program(gl, VS_LINE, FS_LINE) };
    const vaoFull = gl.createVertexArray(); gl.bindVertexArray(vaoFull);
    const bFull = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bFull); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    for (const pr of [P.sky, P.comp, P.tex]) { const loc = gl.getAttribLocation(pr.p, 'aP'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); }
    gl.bindVertexArray(null);

    const mkTex = (w, h, internal, format, type, filter, wrapMode) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode || gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode || gl.CLAMP_TO_EDGE); return t; };
    const fbo = { sky: null, mist: null, tSky: null, tMist: null, w: 0, h: 0 };
    function sizeTargets(w, h) {
      if (fbo.w === w && fbo.h === h) return; fbo.w = w; fbo.h = h;
      for (const k of ['tSky', 'tMist']) if (fbo[k]) gl.deleteTexture(fbo[k]);
      for (const k of ['sky', 'mist']) if (fbo[k]) gl.deleteFramebuffer(fbo[k]);
      fbo.tSky = mkTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR); fbo.tMist = mkTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
      fbo.sky = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.sky); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbo.tSky, 0);
      fbo.mist = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.mist); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbo.tMist, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /* paper: a seamless tile of fibre, multiplied over the finished frame so sky, words and mist share one sheet */
    const tPaper = (() => {
      const n = 512, c = document.createElement('canvas'); c.width = n; c.height = n; const x = c.getContext('2d'); const rnd = mulberry(20261111);
      x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);
      const img = x.getImageData(0, 0, n, n); for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (rnd() - 0.5) * 34; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; } x.putImageData(img, 0, 0);
      x.lineCap = 'round';
      for (let i = 0; i < 1500; i += 1) { const px = rnd() * n, py = rnd() * n, a = (rnd() - 0.5) * 0.9 + (rnd() < 0.2 ? 1.5 : 0), len = 8 + rnd() * rnd() * 70, light = rnd() < 0.62; x.strokeStyle = light ? 'rgba(255,255,255,' + (0.05 + rnd() * 0.12) + ')' : 'rgba(0,0,0,' + (0.04 + rnd() * 0.08) + ')'; x.lineWidth = 0.5 + rnd() * 0.9;
        for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { x.beginPath(); x.moveTo(px + ox, py + oy); x.quadraticCurveTo(px + ox + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 6, py + oy + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * 6, px + ox + Math.cos(a) * len, py + oy + Math.sin(a) * len); x.stroke(); } }
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); return t;
    })();

    function resize() {
      const r = wrap.getBoundingClientRect(); const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height)); const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (W === S.W && H === S.H && dpr === S.dpr) return;
      S.W = W; S.H = H; S.dpr = dpr; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      S.F = Math.max(W / 1.2, H * 0.95); S.px = W / 2; S.py = H * 0.43; S.small = W < 700;
      sizeTargets(W, H); if (S.onResize) S.onResize();
    }

    /* ---------------------------------------------------------------- frame */
    function drawSky(mode, target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target); gl.viewport(0, 0, fbo.w, fbo.h); gl.disable(gl.BLEND);
      const { p, u } = P.sky; gl.useProgram(p); const c = S.pal.c;
      gl.uniform2f(u.uRes, fbo.w, fbo.h); gl.uniform1f(u.uT, S.t); gl.uniform1f(u.uCamX, S.cam.xTotal + S.parS.x.x); gl.uniform1f(u.uCamY, S.cam.y + S.parS.y.x); gl.uniform1f(u.uFH, S.F / S.H); gl.uniform1f(u.uHor, S.hor); gl.uniform1f(u.uMode, mode); gl.uniform1f(u.uDim, S.dim.x);
      gl.uniform3fv(u.uC0, c[0]); gl.uniform3fv(u.uC1, c[1]); gl.uniform3fv(u.uC2, c[2]); gl.uniform3fv(u.uC3, c[3]); gl.uniform3fv(u.uMistA, S.pal.mistA); gl.uniform3fv(u.uMistM, S.pal.mistM); gl.uniform3fv(u.uMistB, S.pal.mistB); gl.uniform3fv(u.uGlow, S.pal.glow);
      gl.bindVertexArray(vaoFull); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function frame(now) {
      S.raf = requestAnimationFrame(frame);
      try { step(now); S.errs = 0; } catch (err) { S.errs = (S.errs || 0) + 1; if (S.errs === 1) console.error('SKY frame', err); if (S.errs > 4) { cancelAnimationFrame(S.raf); S.running = false; if (opt.onFail) opt.onFail(err); } }
    }
    function step(now) {
      S.tick = (S.tick || 0) + 1; if (opt.paused && S.tick % 8 === 1) S.paused = !!opt.paused();
      if (!S.running || S.paused || !wrap.isConnected || wrap.getClientRects().length === 0) { S.last = now; return; }
      resize();
      const dt = Math.min(0.05, Math.max(0.001, (now - S.last) / 1000)); S.last = now; S.t += dt; S.frame += 1;
      if (S.update) S.update(dt);
      else { S.cam.xTotal += S.drift * dt; S.cam.x = S.cam.xTotal; }
      spring(S.parS.x, S.par.x * 16, 5.5, dt); spring(S.parS.y, S.par.y * 9, 5.5, dt);

      drawSky(0, fbo.sky); drawSky(1, fbo.mist);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.disable(gl.BLEND);
      { const { p, u } = P.comp; gl.useProgram(p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fbo.tSky); gl.uniform1i(u.uSky, 0);
        gl.uniform2f(u.uRes, canvas.width, canvas.height); gl.uniform1f(u.uT, S.t); gl.uniform1f(u.uCamX, S.cam.xTotal + S.parS.x.x); gl.uniform1f(u.uCamY, S.cam.y + S.parS.y.x); gl.uniform1f(u.uF, S.F); gl.uniform1f(u.uHor, S.hor); gl.uniform1f(u.uDim, S.dim.x); gl.uniform1f(u.uDpr, S.dpr); gl.uniform3fv(u.uStar, S.pal.star); gl.uniform2f(u.uTilt, S.parS.x.x * 0.08, S.parS.y.x * 0.08);
        gl.bindVertexArray(vaoFull); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (S.drawWorld) S.drawWorld(dt);
      { const { p, u } = P.tex; gl.useProgram(p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fbo.tMist); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uScale, 1, 1); gl.uniform1f(u.uVig, 0); gl.bindVertexArray(vaoFull); gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.blendFunc(gl.DST_COLOR, gl.ZERO); gl.bindTexture(gl.TEXTURE_2D, tPaper); gl.uniform2f(u.uScale, canvas.width / 512, canvas.height / 512); gl.uniform1f(u.uVig, 0.30); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      if (S.afterFrame) S.afterFrame(dt);
    }

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); S.running = false; if (opt.onFail) opt.onFail(new Error('graphics context lost')); });
    const api = { ok: true, S, gl, P, wrap, ui, canvas, setLook, mkTex, opt, destroy() { cancelAnimationFrame(S.raf); if (S.unbind) S.unbind(); root.innerHTML = ''; } };
    if (window.BunkiSkyWorld) window.BunkiSkyWorld(api, opt);
    resize(); S.last = performance.now(); S.raf = requestAnimationFrame(frame);
    return api;
  }

  const SKY_CSS = `
  :host { display: block; position: absolute; inset: 0; }
  .sky { position: absolute; inset: 0; overflow: hidden; background: #081737; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; font-family: 'Shippori Mincho B1', 'Noto Serif JP', serif; color: var(--sky-text); }
  .sky.grabbing { cursor: grabbing; }
  .sky.on-word { cursor: pointer; }
  canvas.gl { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .ui { position: absolute; inset: 0; pointer-events: none; }
  `;

  window.BunkiSky = { mount, LOOKS, tools: { clamp, lerp, smooth, mulberry, spring, hex }, css: (s) => { window.BunkiSky._css = (window.BunkiSky._css || '') + s; } };
})();
