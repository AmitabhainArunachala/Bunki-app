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
    kaku: { c: ['#02070a', '#061016', '#0d1921', '#17443f'], mistA: '#2f7d70', mistM: '#17443f', mistB: '#0d1921', glow: '#37e8b0', star: '#d8efe9', text: '#d8efe9', textFar: '#7fa9a0', mark: '#37e8b0', cord: '#ff6b4a', line: '#37e8b0', ghost: '#17443f', ink: '#d8efe9', paper: '#0d1921', moon: '#cfe9e2' },
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

  const NOISE3 = `
  float h13(vec3 p){ p = fract(p*.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
  float vn3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x), mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x), f.y),
               mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x), mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x), f.y), f.z); }
  float fbm3(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vn3(p); p=p*2.03+vec3(17.1,9.2,5.3); a*=.5; } return s; }
  /* value noise that repeats every per cells in x: for angles round the ring */
  float vnp(vec2 p, float per){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); float x0=mod(i.x,per), x1=mod(i.x+1.,per);
    return mix(mix(h12(vec2(x0,i.y)),h12(vec2(x1,i.y)),f.x), mix(h12(vec2(x0,i.y+1.)),h12(vec2(x1,i.y+1.)),f.x), f.y); }`;

  /* The printed sky as a real dome, and the cloud sea as real layers lying under the ring of words, at one sample
   * per CSS pixel. Every pixel is a ray from the eye. uMode 0: the whole sky. uMode 1: only the haze and the three
   * nearest cloud layers with their own alpha, laid over the words afterwards so words sink into them. */
  const FS_SKY = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform vec2 uRes, uPP; uniform float uT, uF, uMode, uDim, uOver;
  uniform vec3 uFwd, uRight, uUp, uEye;
  uniform vec3 uC0, uC1, uC2, uC3, uMistA, uMistM, uMistB, uGlow;
  uniform vec3 uMoon, uMoonCol; uniform float uMoonR;
  ${NOISE}
  ${NOISE3}
  const float LY[6] = float[6](-300., -400., -510., -640., -790., -960.);
  const float LA[6] = float[6](0.30, 0.40, 0.52, 0.66, 0.80, 0.90);
  vec3 ramp(float k){ return k < 0.5 ? mix(uMistA, uMistM, k*2.) : mix(uMistM, uMistB, k*2.-1.); }
  /* one layer of the cloud sea: long islands that follow the ring, drifting */
  vec4 layer(vec3 d, int i){
    float fi = float(i); if (d.y > -0.015) return vec4(0.);
    float t = (LY[i] - uEye.y)/d.y; if (t <= 0.) return vec4(0.);
    vec2 h = uEye.xz + d.xz*t; float r = length(h), a = atan(h.x, h.y);
    float per = 72. + 12.*fi;
    float u = (a/6.2831853 + 0.5)*per + uT*(0.010 + 0.006*fi) + fi*3.7;
    float v = r/(150. + 22.*fi) + fi*9.1;
    float ov = smoothstep(0., 0.5, uOver);   // from above the sea is calm: only its largest shapes, no grain
    float n = vnp(vec2(u, v), per)*0.64 + mix(vnp(vec2(u*2., v*2.3 + 5.), per*2.)*0.26 + vnp(vec2(u*4., v*5.1 + 2.), per*4.)*0.10, 0.19, ov);
    float cov = smoothstep(0.47, 0.70, n)*mix(0.80 + 0.20*vnp(vec2(u*0.5, v*31.), per*0.5), 1., ov);
    cov *= smoothstep(1100., 2700., r)*(1. - smoothstep(6600., 9800., r));   // the sea lies under the ring only: a dark hub, a dark beyond
    float graze = mix(smoothstep(0.205, 0.335, -d.y), (i == 0 || i == 2 || i == 4) ? 0.20 : 0., ov);   // far cloud dissolves into the glow of the horizon; from above three thin sheets are left
    float lit = pow(max(dot(normalize(d.xz), normalize(uMoon.xz)), 0.), 10.);   // the sea under the moon catches its light
    vec3 col = mix(ramp(0.25 + 0.75*fi/5.), uGlow, min(1., 0.35*cov + 0.34*lit*cov));
    col = mix(col, mix(uC3, uMistA, 0.35), 0.62*ov);   // seen from above the sheets take the sky's own blue, like water under a chart
    return vec4(col, cov*LA[i]*graze*mix(0.30, 1., exp(-t/5200.)));
  }
  void main(){
    vec2 px = vec2(vUv.x*uRes.x, (1.-vUv.y)*uRes.y);
    vec3 d = normalize(uFwd*uF + uRight*(px.x-uPP.x) + uUp*(uPP.y-px.y));
    float e = d.y, near = (1. - smoothstep(0., 0.42, uOver))*(1. - 0.72*smoothstep(-0.10, -0.55, uFwd.y));   // looking down, the haze thins and the sea shows its depth; rising, it is gone before the eye is high
    float hz = smoothstep(-0.279, -0.369, e)*near;
    vec3 hzc = ramp(pow(smoothstep(-0.279, -0.449, e), 0.85));
    if (uMode > 0.5) {
      float fa = smoothstep(-0.305, -0.385, e)*near;
      vec3 c = hzc*fa; float al = fa;
      for (int i=3;i<6;i++){ vec4 m = layer(d, i); m.a *= 1.-smoothstep(0., 0.35, uOver); c = c*(1.-m.a) + m.rgb*m.a; al = al*(1.-m.a) + m.a; }
      o = vec4(c*(1. - 0.55*uDim), al); return;
    }
    float s = e + 0.020*(vn3(d*2.3 + 3.7) - .5);
    vec3 c = mix(uC1, uC0, smoothstep(0.10, 0.34, s));
    c = mix(uC2, c, smoothstep(-0.10, 0.12, s));
    c = mix(uC3, c, smoothstep(-0.32, -0.06, s));
    c = mix(c, uC0*0.72, smoothstep(0.50, 0.98, s));
    vec3 q = vec3(d.x, d.y*1.5, d.z)*1.6 + vec3(uT*0.0011, 0., 0.);
    float w = fbm3(q*1.1 + vec3(0., uT*0.003, 0.));
    float cl = fbm3(q*1.75 + 1.7*vec3(w, -w, w*0.6));
    float az = atan(d.x, d.z);
    float river = exp(-pow((e - (0.135 + 0.075*sin(2.*az + 0.6)))/0.094, 2.));
    float up = 1. - 0.75*smoothstep(-0.185, -0.31, e);
    c += uC3*(0.74*smoothstep(0.38, 0.86, cl)*river + 0.22*smoothstep(0.52, 0.92, cl))*up + uMistA*0.07*river*smoothstep(0.3, 0.8, w)*up;
    c *= 1. - 0.34*smoothstep(0.56, 0.22, cl)*(1.-river)*smoothstep(-0.37, 0.13, e);
    float st = vn3(vec3(d.x*3.5, e*130., d.z*3.5)) - .5;
    c *= 1. + 0.085*st*smoothstep(-0.26, 0.26, e);
    /* the moon: its light is a graded halo printed into the sky (the disc itself is cut at full resolution, with the stars) */
    float md = length(d - uMoon);
    float mo = max(md - uMoonR, 0.)/uMoonR;
    c += (uMoonCol*0.26*exp(-pow(mo/0.85, 1.25)) + mix(uMoonCol, uC3*1.35, 0.78)*(0.17*exp(-pow(mo/3.1, 1.15)) + 0.045*exp(-md*md/0.22)))*up*(1.-uOver);   // bokashi: cream close to the disc, then the sky's own lighter blue
    c = mix(c, c*0.42, uDim*smoothstep(-0.32, -0.117, e));
    c += uGlow*0.10*smoothstep(-0.13, -0.30, e)*(1.-hz);
    c = mix(c, mix(uC1, uC0, 0.35 + 0.35*uOver), smoothstep(mix(-0.40, -0.16, uOver), mix(-0.92, -0.50, uOver), e)*mix(0.55, 0.97, uOver));   // under the ring the deep sky goes on
    for (int i=0;i<3;i++){ vec4 m = layer(d, i); c = mix(c, m.rgb, m.a*(1.-0.5*uDim)); }
    c = mix(c, hzc, hz);
    for (int i=3;i<6;i++){ vec4 m = layer(d, i); c = mix(c, m.rgb, m.a); }
    c *= 1. - 0.55*uDim*smoothstep(-0.06, -0.26, e);   // while a word is open the sea steps back with the sky
    o = vec4(c, 1.);
  }`;

  /* Full resolution: the half-resolution sky, then stars as spatter of white pigment, fixed on the dome
   * (cube-face cells, so no seam and no pinched pole; each star is round and the same size everywhere). */
  const FS_COMP = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uSky; uniform vec2 uRes, uPP; uniform float uT, uF, uDim, uDpr, uOver; uniform vec3 uStar, uFwd, uRight, uUp, uMoon, uMoonCol, uBand; uniform float uMoonR; uniform vec2 uTilt; uniform float uN[6];
  ${NOISE}
  vec3 faceDir(int f, vec2 uv){ return f==0 ? vec3(1., uv.y, -uv.x) : f==1 ? vec3(-1., uv.y, uv.x) : f==2 ? vec3(uv.x, 1., -uv.y) : f==3 ? vec3(uv.x, -1., uv.y) : f==4 ? vec3(uv.x, uv.y, 1.) : vec3(-uv.x, uv.y, -1.); }
  float stars(vec3 d, float N, float seed, float dens, float t){
    vec3 a = abs(d); int f; vec2 uv;
    if (a.x >= a.y && a.x >= a.z) { f = d.x > 0. ? 0 : 1; uv = (d.x > 0. ? vec2(-d.z, d.y) : vec2(d.z, d.y))/a.x; }
    else if (a.y >= a.z) { f = d.y > 0. ? 2 : 3; uv = (d.y > 0. ? vec2(d.x, -d.z) : vec2(d.x, d.z))/a.y; }
    else { f = d.z > 0. ? 4 : 5; uv = (d.z > 0. ? vec2(d.x, d.y) : vec2(-d.x, d.y))/a.z; }
    vec2 g = min(floor((uv*0.5+0.5)*N), N-1.), sd = g + float(f)*131.7 + seed;
    float has = step(1.-dens, h12(sd*1.7+3.1));
    vec2 c = (g + 0.18 + 0.64*h22(sd))/N*2.-1.;
    vec3 s = normalize(faceDir(f, c));
    float big = pow(h12(sd+9.2), 7.), r = mix(0.60, 2.5, big)*uDpr;
    float dist = length(d - s)*uF;
    float tw = 0.72 + 0.28*sin(t*(0.25+h12(sd+5.)*0.8) + 6.283*h12(sd+7.) + dot(uTilt, g)*0.9);
    return has*smoothstep(r, r*0.30, dist)*tw*(0.30+0.70*h12(sd+11.));
  }
  void main(){
    vec3 c = texture(uSky, vUv).rgb;
    vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
    vec3 d = normalize(uFwd*uF + uRight*(px.x-uPP.x) + uUp*(uPP.y-px.y));
    float e = d.y, az = atan(d.x, d.z);
    float river = exp(-pow((e - (0.135 + 0.075*sin(2.*az + 0.6)))/0.094, 2.));
    float fade = 1. - smoothstep(-0.207, -0.294, e);
    float s = stars(d, uN[0], 1., 0.55, uT)*0.50 + stars(d, uN[1], 2., 0.58, uT)*0.82 + stars(d, uN[2], 3., 0.66, uT)*1.15;
    s += (stars(d, uN[3], 4., 0.70, uT)*0.46 + stars(d, uN[4], 5., 0.6, uT)*0.62 + stars(d, uN[5], 6., 0.5, uT)*0.22)*river;
    /* the moon: a disc of the paper's own light, cut clean like a block, with faint seas and a strip of mist across it */
    float md = length(d - uMoon), aa = 1.5/uF, disc = (1. - smoothstep(uMoonR - aa, uMoonR + aa, md))*(1.-uOver);
    c += uStar*s*fade*(1.-0.55*uDim)*(1.-disc);
    if (disc > 0.) {
      vec3 mr = normalize(cross(vec3(0.,1.,0.), uMoon)), mu = cross(uMoon, mr);
      vec2 ml = vec2(dot(d, mr), dot(d, mu))/uMoonR;
      vec3 mc = uMoonCol*(0.905 + 0.095*smoothstep(0.30, 0.70, fbm(ml*1.7 + 4.3)));
      mc *= 1. - 0.09*smoothstep(0.45, 1.05, length(ml - vec2(-0.30, 0.26)));
      /* two long strips of mist lie across the lower half of the disc, flat and soft-edged, as mist is cut in a print; they drift */
      float wob = 0.05*sin(ml.x*3.1 + uT*0.05) + 0.10*(vn(vec2(ml.x*2.3 + uT*0.011, 3.7)) - .5);
      float b1 = (1. - smoothstep(0.055, 0.135, abs(ml.y + 0.20 - wob)))*smoothstep(-1.15, -0.55, ml.x - 0.5*vn(vec2(uT*0.008, 1.3)))*(1. - smoothstep(0.30, 0.95, ml.x));
      float b2 = (1. - smoothstep(0.035, 0.105, abs(ml.y + 0.47 + wob*0.7)))*smoothstep(-0.45, 0.10, ml.x)*(1. - smoothstep(0.75, 1.20, ml.x + 0.3*vn(vec2(uT*0.006, 8.1))));
      float strip = max(b1, b2);
      c = mix(c, mix(mc, uBand, 0.80*strip), disc*(1. - 0.80*uDim));   // while a word is open the moon steps back: one thing at a time
    }
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
  uniform vec3 uMoon, uInk, uFwd, uRight, uUp; uniform vec2 uPP; uniform float uMoonR, uF, uResH, uMoonOn;
  vec2 samp(vec2 uv, float lod){
    if (vMisc.y < 0.5) return vec2(textureLod(uBase, uv, lod).r, 0.);
    if (vMisc.y < 1.5) return textureLod(uNearA, uv, lod).rg;
    if (vMisc.y < 2.5) return textureLod(uNearB, uv, lod).rg;
    return vec2(textureLod(uGhost, uv, lod).r, 0.);
  }
  void main(){
    vec2 fp = vec2(gl_FragCoord.x, uResH - gl_FragCoord.y);
    vec3 dd = normalize(uFwd*uF + uRight*(fp.x - uPP.x) + uUp*(uPP.y - fp.y));
    float onMoon = (1. - smoothstep(uMoonR - 2./uF, uMoonR + 2./uF, length(dd - uMoon)))*uMoonOn;   // over the moon, light writing turns to ink and dark shade steps aside
    float isLight = step(0.30, dot(vCol.rgb, vec3(0.299, 0.587, 0.114)));
    vec3 colr = mix(vCol.rgb, uInk, onMoon*isLight); float keep = 1. - onMoon*(1. - isLight);
    if (vMisc.y > 3.5) { float q = length(vUv - 0.5)*2.; float a = ((1. - smoothstep(0.16, 0.46, q)) + 0.38*pow(1. - min(q, 1.), 2.2))*vCol.a*keep; a = min(a, 1.); o = vec4(colr*a, a); return; }
    float lod = max(vMisc.x, 0.);
    vec2 px = vMisc.zw*exp2(lod);
    vec2 lo = min(vBox.xy, vBox.zw) + px*0.5, hi = max(vBox.xy, vBox.zw) - px*0.5;
    vec2 uv = clamp(vUv, lo, hi);
    vec2 s = samp(uv, lod);
    if (lod > 0.8) { vec2 r = px*0.9; s = s*0.36 + 0.16*(samp(clamp(uv+r, lo, hi), lod) + samp(clamp(uv-r, lo, hi), lod) + samp(clamp(uv+vec2(r.x,-r.y), lo, hi), lod) + samp(clamp(uv+vec2(-r.x,r.y), lo, hi), lod)); }
    float a = s.r*vCol.a*keep, m = s.g*vMark.a;
    o = vec4(colr*a*(1.-m) + mix(vMark.rgb, uInk, onMoon)*m, a + m - a*m);
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
      W: 0, H: 0, dpr: 1, F: 1000, px: 0, py: 0, hor: 0.835, view: null, foot: 0,
      t: 0, last: 0, frame: 0, running: true, reduced: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      cam: { x: 0, xTotal: 0, y: 0, z: 0 }, camTo: { x: 0, y: 0, z: 0 }, sx: { x: 0, v: 0 }, sy: { x: 0, v: 0 }, sz: { x: 0, v: 0 },
      par: { x: 0, y: 0 }, parS: { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } }, panV: { x: 0, y: 0 },
      drift: 5.4, driftK: { x: 1, v: 0 }, dim: { x: 0, v: 0 },
      pointer: { x: -1, y: -1, down: false, moved: 0, id: -1, sx: 0, sy: 0, lx: 0, ly: 0, lt: 0, inside: false },
    };
    const setLook = (name) => { S.look = LOOKS[name] ? name : 'hokusai'; const L = LOOKS[S.look]; S.pal = { c: L.c.map(hex), mistA: hex(L.mistA), mistM: hex(L.mistM), mistB: hex(L.mistB), glow: hex(L.glow), star: hex(L.star), text: hex(L.text), textFar: hex(L.textFar), mark: hex(L.mark), cord: hex(L.cord), line: hex(L.line), ghost: hex(L.ghost), ink: hex(L.ink), paper: hex(L.paper), moon: hex(L.moon || L.glow) }; { const k = S.pal.ink; S.pal.moonInk = 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2] > 0.5 ? S.pal.c[1] : k; }   // what is written across the moon must be dark: a look whose ink is light (dark paper) writes there in its deep sky
      wrap.dataset.look = S.look; if (opt.paper) { const pc = opt.paper(); if (pc) S.pal.mistB = pc; }
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
      S.F = Math.max(W / 1.2, H * 0.95); S.px = W / 2; S.py = H * (W < 720 ? 0.56 : 0.43); S.small = W < 720;   // held upright, the sea of clouds sits lower and there is more sky
      placeMoon(); sizeTargets(W, H); if (S.onResize) S.onResize();
    }

    /* the moon stands still in the heavens, in the river of heaven, a little right of where the eye first looks:
     * the lamp of this world, and the one fixed thing to steer by as the ring turns */
    const MOON = S.moon = { dir: [0, 0, 1], r: 0.052 };
    const placeMoon = () => { const az = S.small ? 0.105 : 0.335, el = S.small ? 0.285 : 0.192; MOON.dir[0] = Math.sin(az) * Math.cos(el); MOON.dir[1] = Math.sin(el); MOON.dir[2] = Math.cos(az) * Math.cos(el); MOON.r = S.small ? 0.046 : 0.052; };
    placeMoon();

    /* ---------------------------------------------------------------- frame */
    const IDENT = { eye: [0, 0, 0], fwd: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], over: 0 };
    function drawSky(mode, target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target); gl.viewport(0, 0, fbo.w, fbo.h); gl.disable(gl.BLEND);
      const { p, u } = P.sky; gl.useProgram(p); const c = S.pal.c, v = S.view || IDENT;
      gl.uniform2f(u.uRes, fbo.w, fbo.h); gl.uniform2f(u.uPP, S.px, S.py); gl.uniform1f(u.uF, S.F); gl.uniform1f(u.uT, S.t); gl.uniform1f(u.uMode, mode); gl.uniform1f(u.uDim, S.dim.x); gl.uniform1f(u.uOver, v.over);
      gl.uniform3fv(u.uFwd, v.fwd); gl.uniform3fv(u.uRight, v.right); gl.uniform3fv(u.uUp, v.up); gl.uniform3fv(u.uEye, v.eye);
      gl.uniform3fv(u.uC0, c[0]); gl.uniform3fv(u.uC1, c[1]); gl.uniform3fv(u.uC2, c[2]); gl.uniform3fv(u.uC3, c[3]); gl.uniform3fv(u.uMistA, S.pal.mistA); gl.uniform3fv(u.uMistM, S.pal.mistM); gl.uniform3fv(u.uMistB, S.pal.mistB); gl.uniform3fv(u.uGlow, S.pal.glow);
      gl.uniform3fv(u.uMoon, MOON.dir); gl.uniform1f(u.uMoonR, MOON.r); gl.uniform3fv(u.uMoonCol, S.pal.moon);
      gl.bindVertexArray(vaoFull); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function frame(now) {
      S.raf = requestAnimationFrame(frame);
      try { step(now); S.errs = 0; } catch (err) { S.errs = (S.errs || 0) + 1; if (S.errs === 1) console.error('SKY frame', err); if (S.errs > 4) { cancelAnimationFrame(S.raf); S.running = false; if (opt.onFail) opt.onFail(err); } }
    }
    function step(now) {
      S.tick = (S.tick || 0) + 1; if (opt.paused && S.tick % 8 === 1) S.paused = !!opt.paused();
      if (S.tick % 32 === 1) { const ft = opt.foot ? Math.max(0, Math.round(opt.foot() || 0)) : 0; if (ft !== S.foot) { S.foot = ft; wrap.style.setProperty('--sky-foot', ft + 'px'); } }   // how much of the bottom the app's own bar covers
      if (!S.running || S.paused || !wrap.isConnected || wrap.getClientRects().length === 0) { S.last = now; return; }
      resize();
      const dt = Math.min(0.05, Math.max(0.001, (now - S.last) / 1000)); S.last = now; S.t += dt; S.frame += 1;
      if (S.update) S.update(dt);
      spring(S.parS.x, S.par.x * 16, 5.5, dt); spring(S.parS.y, S.par.y * 9, 5.5, dt);

      drawSky(0, fbo.sky); drawSky(1, fbo.mist);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.disable(gl.BLEND);
      { const { p, u } = P.comp; gl.useProgram(p); const v = S.view || IDENT, d = S.dpr; gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fbo.tSky); gl.uniform1i(u.uSky, 0);
        gl.uniform2f(u.uRes, canvas.width, canvas.height); gl.uniform2f(u.uPP, S.px * d, S.py * d); gl.uniform1f(u.uF, S.F * d); gl.uniform1f(u.uT, S.t); gl.uniform1f(u.uDim, S.dim.x); gl.uniform1f(u.uDpr, d); gl.uniform1f(u.uOver, v.over); gl.uniform3fv(u.uStar, S.pal.star); gl.uniform2f(u.uTilt, S.parS.x.x * 0.08, S.parS.y.x * 0.08);
        gl.uniform3fv(u.uFwd, v.fwd); gl.uniform3fv(u.uRight, v.right); gl.uniform3fv(u.uUp, v.up);
        gl.uniform3fv(u.uMoon, MOON.dir); gl.uniform1f(u.uMoonR, MOON.r); gl.uniform3fv(u.uMoonCol, S.pal.moon); { const c2 = S.pal.c[2], c3 = S.pal.c[3]; const m = S.pal.moon; gl.uniform3f(u.uBand, m[0] * 0.44 + c3[0] * 0.50 + c2[0] * 0.12, m[1] * 0.44 + c3[1] * 0.50 + c2[1] * 0.12, m[2] * 0.44 + c3[2] * 0.50 + c2[2] * 0.12); }
        gl.uniform1fv(u.uN, [21, 39, 91, 11, 27, 7].map((cell) => Math.max(4, Math.round(2 * S.F / cell))));
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
  .sky.on-word, .sky.on-ring { cursor: pointer; }
  canvas.gl { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .ui { position: absolute; inset: 0; pointer-events: none; }
  `;

  window.BunkiSky = { mount, LOOKS, tools: { clamp, lerp, smooth, mulberry, spring, hex }, css: (s) => { window.BunkiSky._css = (window.BunkiSky._css || '') + s; } };
})();
