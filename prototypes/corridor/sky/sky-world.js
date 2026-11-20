/* 宙 — the words in the sky: data, text atlases, the drifting field, the camera, and the hand.
 * Loaded after sky.js; sky.js calls BunkiSkyWorld(api, options) once the graphics context exists.
 * The constellation (a word opened into its characters) lives in sky-web.js and hooks in through W.web. */
(function () {
  'use strict';
  const T = window.BunkiSky.tools, clamp = T.clamp, lerp = T.lerp, smooth = T.smooth, spring = T.spring;

  /* depth by level: front = the learner's own words, then common words near, rare words deep */
  const ZR = { f: [330, 520], 5: [640, 860], 4: [900, 1120], 3: [1180, 1520], 2: [1640, 2100], 1: [2250, 3000], 0: [1640, 3000] };
  const RE = 2546;                  // radius of the circle the eye travels, inside the ring of words (= one turn of the data's order)
  const YS = 1.7;                   // the ring is taller than the old sheet: more above and below to look at
  const WS = 12.85;                 // a word's letter height in world units
  const BASE_PX = 18;               // far words: one sheet of every deep word at this size (device pixels)
  const BUCKETS = [26, 34, 44, 58, 76, 100, 132, 176];
  const FONT_W = (px) => `800 ${px}px "Shippori Mincho B1", "Noto Serif JP", serif`;
  const FONT_K = (px) => `400 ${px}px "Yuji Syuku", "Shippori Mincho B1", "Noto Serif JP", serif`;
  const FONT_E = (px) => `italic 400 ${px}px "Noto Serif", "Shippori Mincho B1", serif`;
  /* a radical written in its side form is the same radical: 氵 is 水 */
  const VARIANT = { '灬': '火', '氵': '水', '氺': '水', '忄': '心', '⺗': '心', '扌': '手', '亻': '人', '刂': '刀', '犭': '犬', '礻': '示', '衤': '衣', '飠': '食', '艹': '艸', '辶': '辵', '罒': '网', '⺮': '竹', '糹': '糸', '訁': '言', '釒': '金', '牜': '牛' };

  window.BunkiSkyWorld = function (api, opt) {
    const { S, gl, P, wrap, canvas } = api;
    const W = api.W = { ready: false, D: null, n: 0, nk: 0, opt };

    const wrapX = (dx, L) => { dx %= L; if (dx > L / 2) dx -= L; else if (dx < -L / 2) dx += L; return dx; };

    /* ------------------------------------------------------------ text atlases */
    const scratch = document.createElement('canvas'); scratch.width = 4096; scratch.height = 320;
    const sx2 = scratch.getContext('2d', { willReadFrequently: true });
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const BASE_N = maxTex >= 4096 ? 4096 : 2048;
    const tBase = api.mkTex(BASE_N, BASE_N, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 3);
    const tGhost = api.mkTex(2048, 2048, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.LINEAR_MIPMAP_LINEAR);
    const NEAR_N = 2048;
    const near = [0, 1].map(() => ({ tex: api.mkTex(NEAR_N, NEAR_N, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR_MIPMAP_LINEAR), gen: 1, shelves: [], y: 0, dirty: false }));
    for (const pg of near) { gl.bindTexture(gl.TEXTURE_2D, pg.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 4); gl.generateMipmap(gl.TEXTURE_2D); }
    let cur = 0;
    const sprites = new Map();       // key -> { page, gen, x, y, w, h, px, used }
    const wanted = [];               // sprite requests for this frame: [priority, key, text, fontKind, px, marks]

    function alloc(w, h) {
      for (let pass = 0; pass < 2; pass += 1) {
        const pg = near[cur];
        for (const sh of pg.shelves) if (sh.h === h && sh.x + w <= NEAR_N) { const x = sh.x; sh.x += w; return { page: cur, gen: pg.gen, x, y: sh.y }; }
        if (pg.y + h <= NEAR_N) { const sh = { y: pg.y, h, x: w }; pg.shelves.push(sh); pg.y += h; return { page: cur, gen: pg.gen, x: 0, y: sh.y }; }
        cur = 1 - cur; const fresh = near[cur]; fresh.gen += 1; fresh.shelves = []; fresh.y = 0;   // the other sheet starts again; this one stays readable
      }
      return null;
    }
    /** Draw one label into the near atlas. marks: indices of characters drawn into the green channel. */
    function makeSprite(key, text, kind, px, marks) {
      const pad = 12, font = kind === 'k' ? FONT_K(px) : kind === 'e' ? FONT_E(px) : FONT_W(px);
      sx2.font = font; sx2.textBaseline = 'alphabetic';
      const tw = Math.ceil(sx2.measureText(text).width);
      const w = Math.min(scratch.width, tw + pad * 2), h = Math.min(scratch.height, Math.ceil(px * 1.30) + pad * 2);
      const slot = alloc(w, h); if (!slot) return null;
      sx2.globalCompositeOperation = 'source-over'; sx2.fillStyle = '#000'; sx2.fillRect(0, 0, w, h);
      sx2.globalCompositeOperation = 'lighter'; sx2.font = font;
      const by = pad + px * 1.02;
      if (marks && marks.length) { let x = pad; const chars = Array.from(text); for (let i = 0; i < chars.length; i += 1) { sx2.fillStyle = marks.includes(i) ? '#00ff00' : '#ff0000'; sx2.fillText(chars[i], x, by); x += sx2.measureText(chars[i]).width; } }
      else { sx2.fillStyle = '#ff0000'; sx2.fillText(text, pad, by); }
      const img = sx2.getImageData(0, 0, w, h);
      gl.bindTexture(gl.TEXTURE_2D, near[slot.page].tex); gl.texSubImage2D(gl.TEXTURE_2D, 0, slot.x, slot.y, gl.RGBA, gl.UNSIGNED_BYTE, img);
      near[slot.page].dirty = true;
      const sp = { page: slot.page, gen: slot.gen, x: slot.x, y: slot.y, w, h, px, tw, used: S.frame };
      sprites.set(key, sp); return sp;
    }
    const alive = (sp) => sp && near[sp.page].gen === sp.gen;
    const bucketFor = (devPx) => { for (const b of BUCKETS) if (b >= devPx * 0.97) return b; return BUCKETS[BUCKETS.length - 1]; };
    /** The sprite for a label at this size, or the best one that exists; asks for the right one if it is missing.
     * exact: cut at exactly this size (for the few labels that stand still and must be perfectly sharp). */
    const latest = new Map();
    function spriteFor(id, text, kind, devPx, marks, prio, exact) {
      const b = exact ? Math.max(8, Math.round(devPx)) : bucketFor(devPx), mk = marks && marks.length ? marks.join('.') : '';
      const key = kind + id + ':' + (exact ? 'e' : '') + b + ':' + mk; const sp = sprites.get(key);
      if (alive(sp)) { sp.used = S.frame; latest.set(kind + id + ':' + mk, sp); return sp; }
      wanted.push([prio || devPx, key, text, kind, b, marks]);
      const alt = latest.get(kind + id + ':' + mk) || latest.get(kind + id + ':'); return alive(alt) ? alt : null;
    }
    function serveSprites() {
      if (!wanted.length || !W.fonts) { wanted.length = 0; return; }
      wanted.sort((a, b) => b[0] - a[0]); const t0 = performance.now(); const done = new Set();
      for (const [, key, text, kind, px, marks] of wanted) { if (done.has(key)) continue; done.add(key); if (alive(sprites.get(key))) continue; const made = makeSprite(key, text, kind, px, marks); if (made) { const mk2 = marks && marks.length ? marks.join('.') : ''; const idKey = key.slice(0, key.indexOf(':')) + ':' + mk2; if (!alive(latest.get(idKey)) || latest.get(idKey).px < made.px) latest.set(idKey, made); } if (performance.now() - t0 > 3.2) break; }
      wanted.length = 0;
      for (const pg of near) if (pg.dirty) { gl.bindTexture(gl.TEXTURE_2D, pg.tex); gl.generateMipmap(gl.TEXTURE_2D); pg.dirty = false; }
    }

    /* the base sheet: every deep word once, small; built a few rows per frame after the fonts are in */
    const base = { rects: null, rows: [], row: 0, done: false, alpha: { x: 0, v: 0 } };
    function planBase() {
      const D = W.D, n = W.n; base.rects = new Float32Array(n * 4);
      sx2.font = FONT_W(BASE_PX); const pad = 5, rh = Math.ceil(BASE_PX * 1.28) + pad * 2; let x = 0, y = 0, row = [];
      for (let i = 0; i < n; i += 1) { if (W.lvl[i] > 3) continue; const w = Math.ceil(sx2.measureText(D.words[i][0]).width) + pad * 2;
        if (x + w > BASE_N) { base.rows.push({ y, items: row }); row = []; x = 0; y += rh; if (y + rh > BASE_N) break; }
        row.push([i, x, w]); base.rects[i * 4] = x; base.rects[i * 4 + 1] = y; base.rects[i * 4 + 2] = w; base.rects[i * 4 + 3] = rh; x += w; }
      if (row.length) base.rows.push({ y, items: row }); base.rh = rh; base.pad = pad;
    }
    function buildBaseStep() {
      if (base.done || !base.rects) return; const t0 = performance.now(); const D = W.D;
      while (base.row < base.rows.length && performance.now() - t0 < 7) {
        const take = base.rows.slice(base.row, base.row + 4), h = take.length * base.rh, y0 = take[0].y;
        sx2.globalCompositeOperation = 'source-over'; sx2.fillStyle = '#000'; sx2.fillRect(0, 0, BASE_N, h); sx2.fillStyle = '#fff'; sx2.font = FONT_W(BASE_PX); sx2.textBaseline = 'alphabetic';
        for (const r of take) for (const [i, x] of r.items) sx2.fillText(D.words[i][0], x + base.pad, r.y - y0 + base.pad + BASE_PX * 1.02);
        const img = sx2.getImageData(0, 0, BASE_N, h).data, out = new Uint8Array(BASE_N * h); for (let k = 0, j = 0; k < out.length; k += 1, j += 4) out[k] = img[j];
        gl.bindTexture(gl.TEXTURE_2D, tBase); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, BASE_N, h, gl.RED, gl.UNSIGNED_BYTE, out); base.row += take.length;
      }
      if (base.row >= base.rows.length) { gl.bindTexture(gl.TEXTURE_2D, tBase); gl.generateMipmap(gl.TEXTURE_2D); base.done = true; }
    }
    /* giant tone-on-tone characters behind everything: the 64 characters with the largest families */
    const ghost = { list: [], done: false };
    function buildGhosts() {
      const D = W.D, top = D.kanji.map((k, i) => [k[9] || 0, i]).sort((a, b) => b[0] - a[0]).slice(0, 40), cell = 256, KANA = Array.from('あかさたなはまやらわ'); ghost.kana = []; ghost.rad = [];
      const realms = meanOrder().realms.filter((rm) => rm.span > 0.16).slice(0, 14);
      for (let r = 0; r < 8; r += 1) {
        sx2.globalCompositeOperation = 'source-over'; sx2.fillStyle = '#000'; sx2.fillRect(0, 0, 2048, cell); sx2.fillStyle = '#fff'; sx2.font = FONT_K(208); sx2.textBaseline = 'alphabetic'; sx2.textAlign = 'center';
        for (let c = 0; c < 8; c += 1) { const q = r * 8 + c, it = top[q]; if (it) { sx2.fillText(D.kanji[it[1]][0], c * cell + cell / 2, 200); ghost.list.push({ k: it[1], u: c * cell, v: r * cell }); } else if (q - 40 >= 0 && q - 40 < KANA.length) { sx2.fillText(KANA[q - 40], c * cell + cell / 2, 200); ghost.kana.push({ k: -1 - (q - 40), ch: KANA[q - 40], u: c * cell, v: r * cell }); }
          else if (q - 50 >= 0 && realms[q - 50]) { const rm = realms[q - 50]; sx2.fillText(rm.ch, c * cell + cell / 2, 200); const R2 = RE + 5200; ghost.rad.push({ k: -100 - (q - 50), ch: rm.ch, nm: opt.lang === 'ja' ? rm.nameJa : rm.gloss, u: c * cell, v: r * cell, x: R2 * Math.sin(rm.mid), y: ((q - 50) % 2 ? 250 : -130) + 40, z: R2 * Math.cos(rm.mid) }); } }
        sx2.textAlign = 'start';
        const img = sx2.getImageData(0, 0, 2048, cell).data, out = new Uint8Array(2048 * cell); for (let k = 0, j = 0; k < out.length; k += 1, j += 4) out[k] = img[j];
        gl.bindTexture(gl.TEXTURE_2D, tGhost); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r * cell, 2048, cell, gl.RED, gl.UNSIGNED_BYTE, out);
      }
      gl.bindTexture(gl.TEXTURE_2D, tGhost); gl.generateMipmap(gl.TEXTURE_2D);
      /* keep only giants that stand clear of each other: largest families first, at least 1,150 units apart */
      const kx = (k) => D.pos.k[k * 3], kept = []; for (const g of ghost.list) { if (kept.every((o) => Math.abs(wrapX(W.thOf(kx(g.k)) - W.thOf(kx(o.k)), Math.PI * 2)) >= 0.40)) { const th = W.thOf(kx(g.k)), R = RE + 5200; g.x = R * Math.sin(th); g.y = (kept.length % 2 ? 250 : -130) + 40; g.z = R * Math.cos(th); kept.push(g); } } ghost.list = kept; placeKana(); ghost.done = true;
    }

    /* ------------------------------------------------------------ label and line buffers */
    const MAXL = 11000, LSTR = 20; const lab = new Float32Array(MAXL * LSTR); let nLab = 0;
    const vaoLab = gl.createVertexArray(); gl.bindVertexArray(vaoLab);
    const bQuad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bQuad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    { const l = gl.getAttribLocation(P.lab.p, 'aQ'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); }
    const bLab = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bLab); gl.bufferData(gl.ARRAY_BUFFER, lab.byteLength, gl.DYNAMIC_DRAW);
    ['aRect', 'aUv', 'aCol', 'aMark', 'aMisc'].forEach((name, i) => { const l = gl.getAttribLocation(P.lab.p, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, LSTR * 4, i * 16); gl.vertexAttribDivisor(l, 1); });
    gl.bindVertexArray(null);
    const MAXV = 60000, VSTR = 10; const lin = new Float32Array(MAXV * VSTR); let nLin = 0;
    const vaoLin = gl.createVertexArray(); gl.bindVertexArray(vaoLin);
    const bLin = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bLin); gl.bufferData(gl.ARRAY_BUFFER, lin.byteLength, gl.DYNAMIC_DRAW);
    [['aP', 4, 0], ['aCol', 4, 16], ['aTp', 2, 32]].forEach(([name, size, off]) => { const l = gl.getAttribLocation(P.line.p, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, VSTR * 4, off); });
    gl.bindVertexArray(null);

    /** Queue one label. x, y = centre in CSS px; size = letter height in CSS px; sp = sprite or null for the base sheet. */
    function pushLabel(x, y, size, sp, baseIdx, col, a, mark, markA, blur, ghostCell, snap) {
      if (nLab >= MAXL) return null; const d = S.dpr, o = nLab * LSTR; let w, h, u0, v0, u1, v1, tex, texN, srcPx;
      if (ghostCell && ghostCell.k == null) { srcPx = size * d; w = size * 2; h = w; u0 = 0; v0 = 0; u1 = 1; v1 = 1; tex = 4; texN = 1; }   // a point of light
      else if (ghostCell) { srcPx = 208; w = size / 208 * 256; h = w; u0 = ghostCell.u; v0 = ghostCell.v; u1 = u0 + 256; v1 = v0 + 256; tex = 3; texN = 2048; }
      else if (sp) { srcPx = sp.px; const k = size / sp.px; w = sp.w * k; h = sp.h * k; u0 = sp.x; v0 = sp.y; u1 = sp.x + sp.w; v1 = sp.y + sp.h; tex = 1 + sp.page; texN = NEAR_N; }
      else { const r = base.rects; srcPx = BASE_PX; const k = size / BASE_PX; w = r[baseIdx * 4 + 2] * k; h = r[baseIdx * 4 + 3] * k; u0 = r[baseIdx * 4]; v0 = r[baseIdx * 4 + 1]; u1 = u0 + r[baseIdx * 4 + 2]; v1 = v0 + r[baseIdx * 4 + 3]; tex = 0; texN = BASE_N; }
      const lod = Math.max(0, Math.log2(srcPx / (size * d)) - 0.55) + (blur || 0);
      let X = x * d, Y = y * d; const wd = w * d, hd = h * d; if (snap) { X = Math.round(X - wd / 2) + wd / 2; Y = Math.round(Y - hd / 2) + hd / 2; }
      lab[o] = X; lab[o + 1] = Y; lab[o + 2] = wd; lab[o + 3] = hd;
      lab[o + 4] = u0 / texN; lab[o + 5] = v0 / texN; lab[o + 6] = u1 / texN; lab[o + 7] = v1 / texN;
      lab[o + 8] = col[0]; lab[o + 9] = col[1]; lab[o + 10] = col[2]; lab[o + 11] = a;
      lab[o + 12] = mark[0]; lab[o + 13] = mark[1]; lab[o + 14] = mark[2]; lab[o + 15] = markA;
      lab[o + 16] = lod; lab[o + 17] = tex; lab[o + 18] = 1 / texN; lab[o + 19] = 1 / texN;
      nLab += 1; return { w, h };
    }
    /** Queue one thread from (x0,y0) to (x1,y1) in CSS px, bowed by `bow` px; prog 0..1 draws it on from its start. */
    function pushLine(x0, y0, x1, y1, bow, width, col, a, prog) {
      const d = S.dpr, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 2 || a <= 0.004) return;
      const nx = -dy / len, ny = dx / len, cx = (x0 + x1) / 2 + nx * bow, cy = (y0 + y1) / 2 + ny * bow, seg = clamp(Math.ceil(len / 22), 4, 28), hw = Math.max(0.9, width) * 0.5 + 0.7;
      let px = 0, py = 0, pnx = 0, pny = 0;
      for (let i = 0; i <= seg; i += 1) { const t = i / seg, mt = 1 - t; const X = mt * mt * x0 + 2 * mt * t * cx + t * t * x1, Y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
        const tx = 2 * mt * (cx - x0) + 2 * t * (x1 - cx), ty = 2 * mt * (cy - y0) + 2 * t * (y1 - cy); const tl = Math.hypot(tx, ty) || 1; const NX = -ty / tl, NY = tx / tl;
        if (i > 0) { if (nLin + 6 > MAXV) return; const t0 = (i - 1) / seg;
          const v = (X2, Y2, side, tt) => { const o = nLin * VSTR; lin[o] = X2 * d; lin[o + 1] = Y2 * d; lin[o + 2] = side; lin[o + 3] = 0; lin[o + 4] = col[0]; lin[o + 5] = col[1]; lin[o + 6] = col[2]; lin[o + 7] = a; lin[o + 8] = tt; lin[o + 9] = prog * 1.07; nLin += 1; };
          const ax = px + pnx * hw, ay = py + pny * hw, ex = px - pnx * hw, ey = py - pny * hw, cx2 = X + NX * hw, cy2 = Y + NY * hw, dx2 = X - NX * hw, dy2 = Y - NY * hw;
          v(ax, ay, 1, t0); v(ex, ey, -1, t0); v(cx2, cy2, 1, t); v(ex, ey, -1, t0); v(dx2, dy2, -1, t); v(cx2, cy2, 1, t); }
        px = X; py = Y; pnx = NX; pny = NY; }
    }
    W.pushLabel = pushLabel; W.pushLine = pushLine; W.spriteFor = spriteFor; W.FONT_W = FONT_W; W.FONT_K = FONT_K; W.hasBase = (i) => base.done && W.lvl[i] <= 3 && base.rects[i * 4 + 2] > 0;

    /* ------------------------------------------------------------ data: a ring of words
     * The words stand in a great ring round an empty middle. Round the ring runs the order of the lens (form:
     * families of characters); out from the middle runs depth by level; up and down runs height. The eye travels
     * a circle inside the ring, looking outward, so the ring passes from right to left and nearer words pass faster. */
    const TAU = Math.PI * 2;
    const cam = { a: 0, aTo: null, yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, offY: { x: 0, v: 0 }, offZ: { x: 0, v: 0 }, ov: { x: 0, v: 0 }, phi: { x: 0.60, v: 0 } };
    function setData(D) {
      W.D = D; const n = W.n = D.words.length, nk = W.nk = D.kanji.length; W.L = D.world.L;
      W.P = new Float32Array(n * 3); W.Pa = new Float32Array(n * 3); W.Pb = new Float32Array(n * 3); W.stg = new Float32Array(n);
      W.lvl = new Uint8Array(n); W.front = new Uint8Array(n);
      W.vis = new Float32Array(n * 5); W.visAt = new Int32Array(n).fill(-9);     // screen x, y, size, alpha, width — as drawn in the latest frame
      const rndS = T.mulberry(4242); for (let i = 0; i < n; i += 1) { W.lvl[i] = D.words[i][3] | 0; W.stg[i] = rndS(); }
      W.len = new Uint8Array(n); for (let i = 0; i < n; i += 1) W.len[i] = Array.from(D.words[i][0]).length;
      W.byWord = new Map(D.words.map((w, i) => [w[0], i])); W.byKanji = new Map(D.kanji.map((k, i) => [k[0], i]));
      W.fam = Array.from({ length: nk }, () => []); for (let i = 0; i < n; i += 1) for (const k of D.words[i][4]) W.fam[k].push(i);
      const rank = (i) => (W.lvl[i] === 0 ? 9 : 6 - W.lvl[i]) * 100 + Array.from(D.words[i][0]).length * 10;
      for (const f of W.fam) f.sort((a, b) => rank(a) - rank(b) || a - b);
      const kana = (ch) => { const c = ch.charCodeAt(0); return c >= 0x30a1 && c <= 0x30f6 ? String.fromCharCode(c - 0x60) : ch; }, isKana = (ch) => /[ぁ-ゖァ-ヶ]/.test(ch);
      W.rd = D.words.map((w) => { const last = w[0][w[0].length - 1], r = w[1] || ''; return isKana(last) && r && kana(r[r.length - 1]) !== kana(last) ? '' : r; });
      W.byReading = new Map(); for (let i = 0; i < n; i += 1) { const r = W.rd[i]; if (!r) continue; const a = W.byReading.get(r); if (a) a.push(i); else W.byReading.set(r, [i]); }
      W.sem = new Map(); for (const [a, b, rel, note] of D.sem) { for (const [x, y] of [[a, b], [b, a]]) { const arr = W.sem.get(x) || []; if (!arr.some((e) => e.w === y)) arr.push({ w: y, rel, note, head: x === a }); W.sem.set(x, arr); } }
      W.soundOf = new Map(); D.sound.forEach((row, si) => { for (const k of row[2]) if (!W.soundOf.has(k)) W.soundOf.set(k, si); });
      { const pairs = [], seenPair = new Set(), L = D.world.L;
        for (let k = 0; k < nk; k += 1) { const f = W.fam[k]; if (f.length < 2 || f.length > 90) continue;
          for (const a of f) { let best = -1, bd = 300 * 300; for (const b of f) { if (b === a || W.lvl[b] !== W.lvl[a]) continue; const dx = wrapX(D.pos.w[a * 3] - D.pos.w[b * 3], L), dy = D.pos.w[a * 3 + 1] - D.pos.w[b * 3 + 1], d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = b; } }
            if (best >= 0) { const key = a < best ? a * 8192 + best : best * 8192 + a; if (!seenPair.has(key)) { seenPair.add(key); pairs.push(a, best); } } } }
        W.pairs = Int32Array.from(pairs); }
      /* the data's order round the ring is kept, but its crowding is evened out (three parts even, one part as stored),
       * so no side of the ring is nearly empty and the busiest families still read as the bright arm of the wheel */
      { const xs = Float32Array.from({ length: n }, (_, i) => D.pos.w[i * 3]).sort(), L = D.world.L;
        W.thOf = (x) => { let lo = 0, hi = n; while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid + 1; else hi = mid; } return (0.75 * lo / n + 0.25 * x / L) * TAU; }; }
      W.frontList = []; W.lens = 'form'; W.prevLens = 'form'; W.layout = { form: layoutForm, sound: layoutSound, mean: layoutMean }; if (W.lensReady) { W.lensReady('sound'); W.lensReady('mean'); }
      setFront(opt.front || []);
      W.ready = true; planBase(); if (W.web && W.web.onData) W.web.onData();
    }
    const depthOf = (i) => { const D = W.D, l = W.lvl[i], r = D.world.zOf[l] || D.world.zOf[0], t = clamp((D.pos.w[i * 3 + 2] - r[0]) / Math.max(1, r[1] - r[0]), 0, 1), zr = ZR[l] || ZR[0]; return lerp(zr[0], zr[1], t); };
    /** Form: round the ring by families of characters (the data's own order), height as stored. */
    function layoutForm(out) {
      const D = W.D; for (let i = 0; i < W.n; i += 1) { if (W.front[i]) continue; const th = W.thOf(D.pos.w[i * 3]), r = RE + depthOf(i); out[i * 3] = r * Math.sin(th); out[i * 3 + 1] = D.pos.w[i * 3 + 1] * YS; out[i * 3 + 2] = r * Math.cos(th); }
    }
    /** Sound: round the ring in the order of the kana (あ … ん), a great dictionary; words that sound the same stand together. */
    const ROWS = { 'あ': 'あいうえおぁぃぅぇぉゔ', 'か': 'かきくけこがぎぐげご', 'さ': 'さしすせそざじずぜぞ', 'た': 'たちつてとだぢづでどっ', 'な': 'なにぬねの', 'は': 'はひふへほばびぶべぼぱぴぷぺぽ', 'ま': 'まみむめも', 'や': 'やゆよゃゅょ', 'ら': 'らりるれろ', 'わ': 'わをんゎ' };
    const hira = (str) => Array.from(str || '').map((ch) => { const c = ch.charCodeAt(0); return c >= 0x30a1 && c <= 0x30f6 ? String.fromCharCode(c - 0x60) : ch; }).join('');
    function soundOrder() {
      if (W.sOrder) return W.sOrder; const D = W.D, n = W.n, key = D.words.map((w) => hira(w[1])), coll = new Intl.Collator('ja'), idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => coll.compare(key[a], key[b]) || a - b);
      const rank = new Int32Array(n); idx.forEach((i, r) => { rank[i] = r; }); const rowAt = {}; idx.forEach((i, r) => { const c0 = key[i][0]; for (const head of Object.keys(ROWS)) if (rowAt[head] == null && ROWS[head].includes(c0)) rowAt[head] = r; });
      const pairs = []; for (let r = 1; r < n; r += 1) if (key[idx[r]] && key[idx[r]] === key[idx[r - 1]] && W.rd[idx[r]] && W.rd[idx[r - 1]]) pairs.push(idx[r - 1], idx[r]);
      W.sOrder = { rank, rowAt, pairs: Int32Array.from(pairs) }; return W.sOrder;
    }
    function layoutSound(out) {
      const so = soundOrder(), n = W.n; for (let i = 0; i < n; i += 1) { if (W.front[i]) continue; const r = so.rank[i], th = (r + 0.5) / n * TAU, rad = RE + depthOf(i); out[i * 3] = rad * Math.sin(th); out[i * 3 + 1] = (((r * 0.6180339887) % 1) - 0.5) * 1640; out[i * 3 + 2] = rad * Math.cos(th); }
    }
    function placeKana() { const so = soundOrder(), R = RE + 5200; ghost.kana.forEach((g, q) => { const th = ((so.rowAt[g.ch] || 0) + 0.5) / W.n * TAU + 0.012; g.x = R * Math.sin(th); g.y = (q % 2 ? 250 : -130) + 40; g.z = R * Math.cos(th); }); }
    /** Read: round the ring by the articles of the app, easiest first; each word stands with the article where it is most
     * its own; words no article holds yet stand together in the last part of the ring, in the order of form. */
    function readOrder() {
      if (W.rOrder) return W.rOrder; const C = W.ctx, n = W.n, home = new Int32Array(n).fill(-1), rk = new Int32Array(n).fill(1e6), LV = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };
      C.articleWords.forEach((list, a) => list.forEach((wi, q) => { if (q < rk[wi]) { rk[wi] = q; home[wi] = a; } }));
      const arts = C.articles.map((r, a) => a).filter((a) => C.articleWords[a] && C.articleWords[a].some((wi) => home[wi] === a)).sort((a, b) => (LV[C.articles[a][3]] ?? 5) - (LV[C.articles[b][3]] ?? 5) || a - b);
      const members = new Map(arts.map((a) => [a, []])); let rest = []; for (let i = 0; i < n; i += 1) { if (home[i] >= 0 && members.has(home[i])) members.get(home[i]).push(i); else rest.push(i); }
      rest.sort((x, y) => W.thOf(W.D.pos.w[x * 3]) - W.thOf(W.D.pos.w[y * 3]));
      const th = new Float32Array(n), yv = new Float32Array(n), total = n + arts.length * 6, signs = [], pairs = []; let at = 0, ai = 0;
      /* an article is a group: its words hang together at the article's own height, tied by threads, under its title */
      for (const a of arts) { const m = members.get(a); m.sort((x, y) => rk[x] - rk[y]); const cnt = m.length, span = (cnt + 6) / total * TAU, yA = (((ai * 0.6180339887) % 1) - 0.5) * 880, rF = clamp(56 + 30 * Math.sqrt(cnt), 80, 320); ai += 1;
        m.forEach((wi, q) => { th[wi] = at + (q + 3.5) / (cnt + 6) * span; yv[wi] = yA + (((0.5 + q * 0.7548776662466927) % 1) - 0.5) * 2 * rF; });
        const byY = m.slice().sort((x, y) => yv[x] - yv[y]); for (let j = 1; j < cnt; j += 1) pairs.push(byY[j - 1], byY[j]);
        signs.push({ a, th: at + span / 2, th0: at, n: cnt, y: yA + rF + 80 }); at += span; }
      const restStart = at; rest.forEach((wi, q) => { th[wi] = at + (q + 0.5) / rest.length * (TAU - at); yv[wi] = (((wi * 0.6180339887) % 1) - 0.5) * 1560; });
      if (rest.length) for (let t = restStart + 0.16; t < TAU - 0.1; t += 0.42) signs.push({ a: -1, th: t, th0: t, n: 0 });   // the words no article holds yet carry a heading too, all along their part of the ring
      W.rOrder = { th, yv, home, signs, pairs: Int32Array.from(pairs), restStart, rest: rest.length }; return W.rOrder;
    }
    function layoutRead(out) {
      const ro = readOrder(), n = W.n; for (let i = 0; i < n; i += 1) { if (W.front[i]) continue; const t = ro.th[i], rad = RE + depthOf(i); out[i * 3] = rad * Math.sin(t); out[i * 3 + 1] = ro.yv[i]; out[i * 3 + 2] = rad * Math.cos(t); }
    }
    /** Meaning: round the ring by the radical of each word's first character, the largest realm first (person, water,
     * mouth, hand, tree ...). A radical is the part a dictionary files a character under, and it usually says what the
     * character is about; it is stored for every character. Inside a realm the families of one character stay whole. */
    function meanOrder() {
      if (W.mOrder) return W.mOrder; const D = W.D, n = W.n, groups = new Map();
      for (let i = 0; i < n; i += 1) { const k0 = D.words[i][4][0], p = k0 != null ? D.kanji[k0][8] : -1, ch = p >= 0 ? D.parts[p][0] : '', key = VARIANT[ch] || ch; let g = groups.get(key); if (!g) { g = { key, words: [], forms: new Map() }; groups.set(key, g); } g.words.push(i); g.forms.set(p, (g.forms.get(p) || 0) + 1); }
      const realms = [...groups.values()].sort((a, b) => b.words.length - a.words.length || (a.key < b.key ? -1 : 1)), GAP = 8, total = n + realms.length * GAP;
      const th = new Float32Array(n), rank = new Int32Array(n), realmOf = new Int32Array(n), yv = new Float32Array(n), pairs = []; let at = 0, rk = 0, fi = 0;
      realms.forEach((g, gi) => { const byK = new Map(); for (const i of g.words) { const k = D.words[i][4][0]; const a = byK.get(k); if (a) a.push(i); else byK.set(k, [i]); }
        const fams = [...byK.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]), span = (g.words.length + GAP) / total * TAU; let q = 0;
        for (const [, ws] of fams) { ws.sort((x, y) => (W.lvl[y] || 0) - (W.lvl[x] || 0) || x - y); const m = ws.length, yF = (((fi * 0.6180339887) % 1) - 0.5) * 1240, rF = m < 2 ? 0 : clamp(70 + 38 * Math.sqrt(m), 90, 400); fi += 1;   // one character's family hangs together at its own height
          ws.forEach((wi, j) => { th[wi] = at + (q + GAP / 2 + 0.5) / (g.words.length + GAP) * span; yv[wi] = yF + (((0.5 + j * 0.7548776662466927) % 1) - 0.5) * 2 * rF; rank[wi] = rk; realmOf[wi] = gi; rk += 1; q += 1; });
          const byY = ws.slice().sort((x, y) => yv[x] - yv[y]); for (let j = 1; j < m; j += 1) pairs.push(byY[j - 1], byY[j]); }
        let best = -1, bn = -1; for (const [p, c] of g.forms) if (c > bn) { bn = c; best = p; }
        g.th0 = at; g.mid = at + span / 2; g.span = span; g.ch = best >= 0 ? D.parts[best][0] : g.key; g.nameJa = best >= 0 ? D.parts[best][1] || '' : ''; g.gloss = best >= 0 ? D.parts[best][2] || '' : ''; at += span; });
      const signs = []; realms.forEach((g, q) => { if (g.span >= 0.05 && !(g.span > 0.16 && q < 14)) signs.push({ a: -2, key: 'm' + q, th: g.mid, th0: g.th0, title: g.ch + '　' + (opt.lang === 'ja' ? g.nameJa : g.gloss) }); });   // a realm with no giant of its own carries its name on a sign, as an article carries its title
      W.mOrder = { th, rank, realmOf, yv, realms, signs, pairs: Int32Array.from(pairs) }; return W.mOrder;
    }
    function layoutMean(out) {
      const mo = meanOrder(), n = W.n; for (let i = 0; i < n; i += 1) { if (W.front[i]) continue; const t = mo.th[i], rad = RE + depthOf(i); out[i * 3] = rad * Math.sin(t); out[i * 3 + 1] = mo.yv[i]; out[i * 3 + 2] = rad * Math.cos(t); }
    }
    /** What stands where round the ring in the present order: the names a chart of this sky carries on its rim.
     * th = where the name stands; th0 = where its part of the ring begins (a tick is drawn there); w = its weight. */
    function sectors() {
      const D = W.D, key = W.lens; if (W.secCache && W.secCache.key === key) return W.secCache.list; const list = [], ja = opt.lang === 'ja';
      if (key === 'form') { const SL = 18, best = new Array(SL).fill(-1); for (let k = 0; k < W.nk; k += 1) { const m = W.fam[k].length; if (m < 6) continue; const sl = Math.min(SL - 1, Math.floor(W.thOf(D.pos.k[k * 3]) / TAU * SL)); if (best[sl] < 0 || m > W.fam[best[sl]].length) best[sl] = k; }   // the largest family in each eighteenth of the ring
        for (const ki of best) { if (ki < 0) continue; const k = D.kanji[ki]; list.push({ th: W.thOf(D.pos.k[ki * 3]), name: k[0], sub: ja ? (k[2][0] || k[3][0] || '') : k[1] || '', subFont: ja ? 'w' : 'e', w: W.fam[ki].length }); } }
      else if (key === 'sound') { const so = soundOrder(), heads = Object.keys(ROWS); heads.forEach((h, q) => { const a0 = (so.rowAt[h] || 0) / W.n * TAU, a1 = (q + 1 < heads.length ? so.rowAt[heads[q + 1]] : W.n) / W.n * TAU; list.push({ th: (a0 + a1) / 2, th0: a0, name: h, sub: '', w: 100 }); }); }
      else if (key === 'read') { if (!W.rOrder) return list; const C = W.ctx, sg = W.rOrder.signs.filter((s) => s.a >= 0); let cur = null; sg.forEach((s) => { const lv = C.articles[s.a][3] || ''; if (!cur || cur.lv !== lv) { if (cur) cur.th1 = s.th0; cur = { lv, th0: s.th0, th1: W.rOrder.restStart, n: 0 }; list.push(cur); } cur.n += 1; });
        for (const c of list) { c.th = (c.th0 + c.th1) / 2; c.name = c.lv || '?'; c.sub = ja ? c.n + ' 記事' : c.n + ' articles'; c.subFont = ja ? 'w' : 'e'; c.nameFont = 'w'; c.w = 100; }
        if (W.rOrder.rest) list.push({ th: (W.rOrder.restStart + TAU) / 2, th0: W.rOrder.restStart, name: '…', nameFont: 'w', sub: ja ? 'まだ記事にない言葉' : 'not yet in an article', subFont: ja ? 'w' : 'e', w: 90 }); }
      else if (key === 'mean') { let tail = -1; meanOrder().realms.forEach((g, q) => { if (g.span < 0.05) { if (tail < 0) tail = g.th0; return; } list.push({ th: g.mid, th0: g.th0, name: g.ch, sub: ja ? g.nameJa : g.gloss, subFont: ja ? 'w' : 'e', w: 1000 - q }); });
        if (tail >= 0) list.push({ th: (tail + TAU) / 2, th0: tail, name: '…', nameFont: 'w', sub: ja ? 'そのほかの部首' : 'the smaller radicals', subFont: ja ? 'w' : 'e', w: 1 }); }
      W.secCache = { key, list }; return list;
    }
    W.sectors = sectors;
    /** The titles of the articles stand beyond their words like signs along a road, in three rows so neighbours do not touch. */
    let dtSign = 0.016;
    function drawSigns() {
      const signs = W.lens === 'read' && W.rOrder ? W.rOrder.signs : W.lens === 'mean' && W.mOrder ? W.mOrder.signs : null;   // reading: the titles of articles; meaning: the names of the realms that have no giant of their own
      W.sHits = W.sHits || []; W.sHits.length = 0;
      if (!signs || !W.fonts) return; const late = W.morphAt != null ? smooth(1.4, 2.0, S.t - W.morphAt) : 1, a0 = base.alpha.x * late * (1 - Math.min(1, 1.3 * S.dim.x)) * (1 - view.over); if (a0 < 0.03) return;   // (while a word is open the titles leave altogether: nothing stands behind its notes)   // after a re-forming the titles come last, when every word has landed
      const C = W.ctx, E = view.eye, f = view.fwd, r = view.right, u = view.up, R = RE + 2900, isRead = W.lens === 'read', maxC = S.small ? 13 : 22, maxS = S.small ? 16 : 22;
      /* only signs with room: the ones nearest the middle of the view first; the others wait, fading, until there is room */
      const cand = []; signs.forEach((sg, q) => { const dx = R * Math.sin(sg.th) - E[0], dy = (sg.y != null ? sg.y : [-250, 60, 370][q % 3]) - E[1], dz = R * Math.cos(sg.th) - E[2], z2 = dx * f[0] + dy * f[1] + dz * f[2]; if (z2 < 300 || z2 > 5200) return;
        const sc = S.F / z2, x = S.px + (dx * r[0] + dy * r[1] + dz * r[2]) * sc; if (x < -260 || x > S.W + 260) return; const y = S.py - (dx * u[0] + dy * u[1] + dz * u[2]) * sc; if (y < 20 || y > S.H * 0.74) return;
        const row = sg.a >= 0 && C ? C.articles[sg.a] : null, chars = Array.from(sg.title != null ? sg.title : row ? row[1] || '' : (opt.lang === 'ja' ? 'まだ記事にない言葉' : 'not yet in an article')), title = chars.length > maxC ? chars.slice(0, maxC - 1).join('') + '…' : chars.join(''), size = clamp(20 * 3000 / z2, 13, maxS);
        cand.push({ sg, x, y, z2, title, size, hw: Math.min(maxC, chars.length) * size * (row ? 0.53 : 0.34) + 14, hh: size * 0.8 + 8 }); });
      const near = (c) => Math.abs(c.x - S.px) - (c.sg.fade && c.sg.fade.x > 0.5 ? 150 : 0);   // a title that is showing keeps its place until another is clearly nearer the middle
      cand.sort((p1, p2) => near(p1) - near(p2)); const shown = [], most = S.small ? 3 : 6, turn = (a, b) => Math.abs(((a - b + 9.42477796) % 6.2831853) - 3.14159265);
      const fr = W.frontList, fv = W.vis, fa = W.visAt, fnow = S.frame;
      const tie = (c, box, al) => { const list = C && C.articleWords ? C.articleWords[c.sg.a] : null; if (!list) return; const home = W.rOrder.home, uy = c.y + c.size * 0.76, best = [];   // a hairline from a title to the five nearest of its own words: whose words these are is drawn, not guessed
        for (const wi of list) { if (home[wi] !== c.sg.a || fa[wi] < fnow - 2) continue; const o = wi * 5, wx = fv[o], wy = fv[o + 1]; if (fv[o + 3] < 0.2 || Math.abs(wy - c.y) < c.hh + 8) continue; const d = Math.hypot(wx - c.x, (wy - uy) * 1.3); if (d < 470) best.push([d, wx, wy, fv[o + 2]]); }
        best.sort((p1, p2) => p1[0] - p2[0]); for (const b of best.slice(0, 5)) { const below = b[2] > uy, x0 = clamp(b[1], c.x - box.w / 2 + 12, c.x + box.w / 2 - 12); pushLine(x0, below ? uy + 3 : c.y - c.size * 0.62, b[1], b[2] + (below ? -1 : 1) * b[3] * 0.64, 0, 0.7, S.pal.mark, 0.32 * al, 1); } };
      for (const c of cand) { if (c.sg.seen !== S.frame - 1 && c.sg.fade) { c.sg.fade.x = 0; c.sg.fade.v = 0; } c.sg.seen = S.frame;
        let free = shown.length < most && c.z2 < 4500 && c.x - c.hw > 16 && c.x + c.hw < S.W - (S.small ? 56 : 72) && !shown.some((o) => (Math.abs(c.x - o.x) < c.hw + o.hw + 12 && Math.abs(c.y - o.y) < c.hh + o.hh + 6) || (isRead && turn(c.sg.th, o.sg.th) < 0.52));   // a title shows only where the whole of it fits, and in the reading order one to every twelfth of the ring
        if (free) for (const wi of fr) { if (fa[wi] < fnow - 2) continue; const o = wi * 5; if (Math.abs(c.x - fv[o]) < c.hw + fv[o + 4] / 2 + 34 && Math.abs(c.y - fv[o + 1]) < c.hh + fv[o + 2] * 0.62 + 14) { free = false; break; } }   // a sign steps aside before one of his own words reaches it
        if (free) shown.push(c); const st = c.sg.fade || (c.sg.fade = { x: 0, v: 0 }); spring(st, free ? 1 : 0, 9, dtSign);
        if (st.x < 0.03) continue; const sp = spriteFor('sign' + (c.sg.key || c.sg.a), c.title, c.sg.a >= 0 || c.sg.title != null || opt.lang === 'ja' ? 'w' : 'e', c.size * S.dpr, null, 500, false);
        if (sp) { const al = (c.sg.a >= 0 || c.sg.title != null ? 0.92 : 0.72) * a0 * st.x, box = pushLabel(c.x, c.y, c.size, sp, 0, S.pal.mark, al, S.pal.mark, 0, 0); if (box) { pushLine(c.x - box.w / 2 + 10, c.y + c.size * 0.76, c.x + box.w / 2 - 10, c.y + c.size * 0.76, 0, 0.8, S.pal.mark, 0.5 * al, 1); W.sHits.push({ a: c.sg.a, x: c.x, y: c.y, w: box.w, s: c.size }); if (isRead && c.sg.a >= 0 && st.x > 0.4) tie(c, box, al); } } }
    }
    /** The learner's own words do not belong to one place on the ring: they keep him company. They stand in a small
     * ring of their own round the eye's place on its circle and turn slowly, so they too pass from right to left,
     * nearest and fastest, and a dozen are always in view whichever way he looks. */
    const mine = { turn: 0, ang: null, dist: null, y: null };
    function placeFront(out) {
      const rnd = T.mulberry(77), m = W.frontList.length; mine.ang = new Float32Array(m); mine.dist = new Float32Array(m); mine.y = new Float32Array(m);
      const placed = [];
      W.frontList.forEach((i, j) => { const dist = lerp(ZR.f[0], ZR.f[1], rnd()), a0 = ((0.5 + j * 0.7548776662466927) % 1) * TAU, y0 = lerp(-62, 118, (0.5 + j * 0.5698402909980532) % 1), hw = (W.len[i] * 0.52 * WS + 15) / dist + 0.012, hh = (0.62 * WS + 8) / dist;
        /* its own place if that is free; else the nearest free place round the ring, trying the other heights too */
        let ang = a0, y = y0, ok = false; const clash = (a2, y2) => placed.some((o) => Math.abs(wrapA(a2 - o.a)) < hw + o.hw && Math.abs(y2 / dist - o.y / o.d) < hh + o.hh);
        for (let t = 0; t < 90 && !ok; t += 1) { const da = (t === 0 ? 0 : Math.ceil(t / 2) * 0.05 * (t % 2 ? 1 : -1)); for (const yy of (t === 0 ? [y0] : [y0, -30, 30, 90, -62, 118])) { if (!clash(a0 + da, yy)) { ang = a0 + da; y = yy; ok = true; break; } } }
        placed.push({ a: ang, y, d: dist, hw, hh }); mine.ang[j] = ang; mine.dist[j] = dist; mine.y[j] = y; });
      moveFront(out);
    }
    function moveFront(out) {
      const ax = Math.sin(cam.a) * RE, az = Math.cos(cam.a) * RE; W.frontList.forEach((i, j) => { const b = mine.ang[j] - mine.turn; out[i * 3] = ax + mine.dist[j] * Math.sin(b); out[i * 3 + 1] = mine.y[j]; out[i * 3 + 2] = az + mine.dist[j] * Math.cos(b); });
    }
    function setFront(list) {
      if (!W.D) { opt.front = list; return; }
      const idx = []; for (const it of list) { const w = Array.isArray(it) ? it[0] : it; const i = W.byWord.get(w); if (i != null && !idx.includes(i)) idx.push(i); }
      W.front.fill(0); W.frontList = idx; for (const i of idx) W.front[i] = 1;
      W.layout[W.lens](W.P); placeFront(W.P); W.Pb.set(W.P); W.morph = { x: 1, v: 0 };
    }
    api.setFront = setFront;
    /** Re-form the whole sky by another order: every word flies to its new place, a few at a time. */
    function setLens(name) {
      if (!W.ready || !W.layout[name] || name === W.lens) return; W.prevLens = W.lens; W.lens = name; W.secCache = null; W.Pa.set(W.P); W.layout[name](W.Pb); placeFront(W.Pb); W.morph = { x: S.reduced ? 1 : 0, v: 0 }; W.morphAt = S.reduced ? S.t - 9 : S.t; if (S.reduced) W.P.set(W.Pb);
      /* choosing the order of reading turns the eye to the nearest article, so what he sees first is a group with its title */
      if (name === 'read' && W.rOrder) { const a = ((cam.a % TAU) + TAU) % TAU, rs = W.rOrder.restStart; if (rs > 1 && (a > rs - 0.5 || a < 0.5)) cam.aTo = a - rs < TAU - a && a > rs - 0.5 ? rs - 0.6 : 0.6; }
      if (W.onLens) W.onLens(name);
    }
    api.setLens = setLens; W.setLens = setLens;

    /* ------------------------------------------------------------ the eye
     * a = where the eye stands on its circle; yaw and pitch = where it looks, from straight outward; offY, offZ =
     * how far it has risen and flown outward; ov = 0 inside the ring, 1 high above it looking down on the whole. */
    const tgt = { yaw: 0, pitch: 0, offY: 0, offZ: 0, ov: 0, phi: 0.60 }, vel = { a: 0, yaw: 0, pitch: 0 };
    const arrive = { x: S.reduced ? 0 : 1, v: 0 };   // the first seconds: the eye comes down and forward into the ring, once
    const awake = new Map();    // word index -> spring, for words that have been touched
    let hover = -1, hoverKind = '', grabbed = false, pullBack = 0; const openK = { x: 0, v: 0 };
    const pinch = { ids: new Map(), d0: 0 };
    const view = S.view = { eye: [0, 0, RE], fwd: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], over: 0 };
    W.cam = cam; W.tgt = tgt;
    const wrapA = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
    S.update = (dt) => {
      const web = W.web, isOpen = !!(web && web.isOpen()), over = tgt.ov > 0.5;
      if (S.reduced) { S.driftK.x = 0; S.driftK.v = 0; } else spring(S.driftK, isOpen || grabbed || over || W.kbFocus ? 0 : hover >= 0 ? 0.12 : 1, 3.2, dt);
      if (W.fonts && arrive.x > 0.0005) spring(arrive, 0, 1.55, dt);
      spring(S.dim, isOpen ? 1 : 0, 4.2, dt); spring(openK, isOpen ? 1 : 0, 4.0, dt);
      if (!grabbed) { cam.a += vel.a * dt; tgt.yaw += vel.yaw * dt; tgt.pitch += vel.pitch * dt; const f = Math.exp(-dt * 2.6); vel.a *= f; vel.yaw *= f; vel.pitch *= f; }
      cam.a += (S.drift / RE) * S.driftK.x * dt; mine.turn += (S.drift / 420) * S.driftK.x * dt;
      if (cam.aTo != null) { const da = wrapA(cam.aTo - cam.a); cam.a += da * Math.min(1, dt * 3.4); if (Math.abs(da) < 0.002) cam.aTo = null; }
      tgt.pitch = clamp(tgt.pitch, -1.15, 0.95); tgt.offZ = clamp(tgt.offZ, -240, 2300); tgt.offY = clamp(tgt.offY, -240, 520);
      spring(cam.yaw, tgt.yaw, 9, dt); spring(cam.pitch, tgt.pitch, 9, dt); spring(cam.offY, tgt.offY, 6, dt); spring(cam.offZ, tgt.offZ, 5, dt); if (S.reduced) { cam.ov.x = tgt.ov; cam.ov.v = 0; } else spring(cam.ov, tgt.ov, 2.4, dt);
      const e = cam.ov.x <= 0 ? 0 : cam.ov.x >= 1 ? 1 : cam.ov.x * cam.ov.x * (3 - 2 * cam.ov.x), sa = Math.sin(cam.a), ca = Math.cos(cam.a);
      const rIn = RE + cam.offZ.x + openK.x * 90 - arrive.x * 230, px = S.parS.x.x, py = S.parS.y.x;
      const ex = sa * rIn + ca * px, ey = cam.offY.x + py + arrive.x * 170, ez = ca * rIn - sa * px;            // inside: on the circle, looking out
      spring(cam.phi, tgt.phi, 7, dt);
      const ok = Math.max(1, (5900 / (S.W / (2 * S.F))) / 12580) * (1 + 1.25 * S.foot / Math.max(1, S.H)), ph = cam.phi.x, tk = smooth(0.60, 1.30, ph), Dv = 12397 * ok * lerp(1, 1.70, tk), back = lerp(-222, 1040, tk) - Dv * Math.cos(ph), ox = sa * back, oy = Dv * Math.sin(ph), oz = ca * back;   // above: the eye circles the hub at the tilt the hand gave it; straighter down it stands farther off, so the whole wheel and its names still fit
      view.eye[0] = lerp(ex, ox, e); view.eye[1] = lerp(ey, oy, e); view.eye[2] = lerp(ez, oz, e); view.over = e;
      const yaw = cam.a + cam.yaw.x * (1 - e), pitch = lerp(cam.pitch.x - arrive.x * 0.055, -cam.phi.x, e), sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
      view.fwd[0] = sy * cp; view.fwd[1] = sp; view.fwd[2] = cy * cp; view.right[0] = cy; view.right[1] = 0; view.right[2] = -sy; view.up[0] = -sy * sp; view.up[1] = cp; view.up[2] = -cy * sp;
      if (W.morph && W.morph.x < 1) { spring(W.morph, 1.02, 1.9, dt); const m = Math.min(1, W.morph.x), P = W.P, A = W.Pa, B = W.Pb, st = W.stg; for (let i = 0; i < W.n; i += 1) { let k = clamp(m * 1.7 - st[i] * 0.7, 0, 1); k = k * k * (3 - 2 * k); const o = i * 3; P[o] = A[o] + (B[o] - A[o]) * k; P[o + 1] = A[o + 1] + (B[o + 1] - A[o + 1]) * k; P[o + 2] = A[o + 2] + (B[o + 2] - A[o + 2]) * k; } if (m >= 1) { W.P.set(W.Pb); W.morph.x = 1; } if (mine.ang) moveFront(W.P); }
      if (mine.ang && !(W.morph && W.morph.x < 1)) moveFront(W.P);
      for (const [i, s] of awake) { spring(s, i === hover && hoverKind === 'w' ? 1 : 0, 9, dt); if (s.x < 0.004 && i !== hover) awake.delete(i); }
      if (web) web.update(dt);
    };
    /** Fly along the line of sight: forward is wherever the eye is looking. */
    function fly(dist) {
      const yaw = cam.yaw.x, pitch = cam.pitch.x, cp = Math.cos(pitch), r = Math.max(400, RE + cam.offZ.x);
      cam.a += Math.sin(yaw) * cp * dist / r; tgt.offY += Math.sin(pitch) * dist; tgt.offZ += Math.cos(yaw) * cp * dist;
    }
    function resetView() { tgt.yaw = 0; tgt.pitch = 0; tgt.offY = 0; tgt.offZ = 0; tgt.ov = 0; vel.a = vel.yaw = vel.pitch = 0; }
    function setOver(on) { tgt.ov = on ? 1 : 0; tgt.yaw = 0; tgt.pitch = 0; tgt.offY = 0; tgt.offZ = 0; if (on) { tgt.phi = 0.60; cam.phi.x = 0.60; cam.phi.v = 0; } vel.a = vel.yaw = vel.pitch = 0; if (on && W.web && W.web.isOpen()) W.web.close(); pullBack = 0; if (W.onOver) W.onOver(!!on); }
    api.overview = setOver; api.resetView = resetView; W.setOver = setOver; W.resetView = resetView;
    W.lookUp = () => { if (tgt.ov > 0.5) setOver(false); if (W.web && W.web.isOpen()) W.web.close(); tgt.pitch = tgt.pitch > 0.45 ? 0 : 0.66; vel.pitch = 0; };

    /** Where word i is on screen right now (CSS px), or null if it is behind the eye. */
    function project(i) {
      const E = view.eye, o = i * 3, dx = W.P[o] - E[0], dy = W.P[o + 1] - E[1], dz = W.P[o + 2] - E[2], f = view.fwd, r = view.right, u = view.up;
      const z2 = dx * f[0] + dy * f[1] + dz * f[2]; if (z2 < 40) return null; const sc = S.F / z2;
      return { x: S.px + (dx * r[0] + dy * r[1] + dz * r[2]) * sc, y: S.py - (dx * u[0] + dy * u[1] + dz * u[2]) * sc, sc, z2, size: WS * sc };
    }
    W.project = project; W.WS = WS; W.awake = awake; W.wrapX = wrapX; W.fieldAlpha = () => base.alpha.x;

    /* ------------------------------------------------------------ the field */
    const hits = []; W.hits = hits;
    /* tidy sky: a word that would sit on top of a nearer word steps back, so no two words print over each other */
    const CW = 18, CH = 11; let occ = new Uint8Array(1), oc = 0, orw = 0;
    let cI = new Int32Array(1), cX = new Float32Array(1), cY = new Float32Array(1), cS = new Float32Array(1), cZ = new Float32Array(1), cD = new Float32Array(1), cR = new Float32Array(1), ord = [];
    const DOT = { u: 0, v: 0 }, ptc = [0, 0, 0], hubc = [0, 0, 0];
    /* a far word is a point of light: by level, index 0 = no level, 5 = N5. Common words bright, large and warm; rare ones small and cool */
    const PT_A = [0.26, 0.32, 0.38, 0.48, 0.60, 0.72], PT_S = [2.0, 2.1, 2.4, 2.8, 3.3, 3.8], PT_C = [1, 1, 0.85, 0.62, 0.34, 0.10];
    function maskAt(x, y) { let m = smooth(0, 28, x) * smooth(0, S.small ? 18 : 28, S.W - x); const list = S.mask; if (list) for (const b of list) { const qx = Math.abs(x - b[0]) - b[2], qy = Math.abs(y - b[1]) - b[3], d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0); m *= 1 - b[5] * (1 - smooth(0, b[4], d)); } return m; }
    function drawField(dt) {
      const D = W.D, pal = S.pal, n = W.n, F = S.F, Wd = S.W, Hd = S.H, dpr = S.dpr, P = W.P;
      const E = view.eye, f = view.fwd, r = view.right, u = view.up, over = view.over, dim = S.dim.x, web = W.web;
      const fieldA = base.alpha.x, tc = pal.text, tf = pal.textFar, mk = pal.mark, tNow = S.t, E0 = E[0], E1 = E[1], E2 = E[2];
      hits.length = 0;
      const cols = Math.ceil(Wd / CW) + 2, rows = Math.ceil(Hd / CH) + 2; if (oc !== cols || orw !== rows) { oc = cols; orw = rows; occ = new Uint8Array(cols * rows); } else occ.fill(0);
      for (const h of W.gHits) { const c0 = Math.max(0, ((h.x - h.w / 2 - 6) / CW) | 0), c1 = Math.min(cols - 1, ((h.x + h.w / 2 + 6) / CW) | 0), r0 = Math.max(0, ((h.y - h.s * 0.8) / CH) | 0), r1 = Math.min(rows - 1, ((h.y + h.s * 0.8) / CH) | 0); for (let rr = r0; rr <= r1; rr += 1) for (let cc = c0; cc <= c1; cc += 1) occ[rr * cols + cc] = 2; }   // a pattern of grammar keeps its room too
      /* a touched word keeps room for its reading above and its meaning below: its neighbours step back while it is touched */
      for (const [wi, sw] of awake) { if (sw.x < 0.3 || W.visAt[wi] < S.frame - 2) continue; const o = wi * 5, hw = W.vis[o + 4] / 2 + 16, hh = W.vis[o + 2] * 0.62 + 26, c0 = Math.max(0, ((W.vis[o] - hw) / CW) | 0), c1 = Math.min(cols - 1, ((W.vis[o] + hw) / CW) | 0), r0 = Math.max(0, ((W.vis[o + 1] - hh) / CH) | 0), r1 = Math.min(rows - 1, ((W.vis[o + 1] + hh) / CH) | 0); for (let rr = r0; rr <= r1; rr += 1) for (let cc = c0; cc <= c1; cc += 1) occ[rr * cols + cc] = 3; }
      if ((W.lens === 'read' || W.lens === 'mean') && W.sHits) for (const h of W.sHits) { const c0 = Math.max(0, ((h.x - h.w / 2 - 10) / CW) | 0), c1 = Math.min(cols - 1, ((h.x + h.w / 2 + 10) / CW) | 0), r0 = Math.max(0, ((h.y - h.s * 0.7 - 10) / CH) | 0), r1 = Math.min(rows - 1, ((h.y + h.s * 1.0 + 10) / CH) | 0); for (let rr = r0; rr <= r1; rr += 1) for (let cc = c0; cc <= c1; cc += 1) occ[rr * cols + cc] = 2; }   // a title keeps its room: far words step back from it
      if (cI.length < n) { cI = new Int32Array(n); cX = new Float32Array(n); cY = new Float32Array(n); cS = new Float32Array(n); cZ = new Float32Array(n); cD = new Float32Array(n); cR = new Float32Array(n); W.clr = new Float32Array(n).fill(1); W.hid = new Uint8Array(n); }
      const clr = W.clr, hid = W.hid, ease = Math.min(1, dt * 10);
      /* giant characters, far beyond the ring: tone on tone */
      const mph = W.morph ? Math.min(1, W.morph.x) : 1, giantsOf = (lens) => (lens === 'form' ? ghost.list : lens === 'sound' ? ghost.kana : lens === 'mean' ? ghost.rad : []);
      if (ghost.done) for (const g of giantsOf(mph > 0.5 ? W.lens : W.prevLens)) { const gw = Math.abs(mph - 0.5) * 2; const dx = g.x - E0, dy = g.y - E1, dz = g.z - E2, z2 = dx * f[0] + dy * f[1] + dz * f[2]; if (z2 < 400) continue; const sc = F / z2, x = S.px + (dx * r[0] + dy * r[1] + dz * r[2]) * sc; if (x < -500 || x > Wd + 500) continue;
        const y = S.py - (dx * u[0] + dy * u[1] + dz * u[2]) * sc, size = 880 * sc, dep = -dy / Math.hypot(dx, dy, dz);
        const fade = (1 - smooth(0.17, 0.27, dep)) * (1 - smooth(0, 0.6, over)) * fieldA; if (fade < 0.01 || y < -size || y > Hd + size) continue; const ga = (W.lens === 'form' && mph > 0.5 ? 0.32 : 0.44) * fade * gw * (1 - dim); pushLabel(x, y, size, null, 0, pal.ghost, ga, mk, 0, 0.3, g);   // (while a word is open the landmarks withdraw altogether)   // from above the rim of the chart names them instead
        if (W.fonts && ga > 0.12 && size > 60) { const nm = g.nm != null ? g.nm : g.k >= 0 ? (opt.lang === 'ja' ? (D.kanji[g.k][2][0] || D.kanji[g.k][3][0] || '') : D.kanji[g.k][1] || '') : ''; if (nm) { const sp = spriteFor('gn' + nm, nm, opt.lang === 'ja' ? 'w' : 'e', 14 * dpr, null, 620, true); if (sp) pushLabel(x, y + size * 0.47 + 12, 14, sp, 0, mk, Math.min(0.85, ga * 1.9), mk, 0, 0, null, true); } } }
      const taken = web ? web.taken : null, kinSet = W.kin, kinK = W.kinK || 0;
      /* pass 0: where is each word; far ones are points of light, near ones are candidates for print */
      let nc = 0;
      for (let i = 0; i < n; i += 1) {
        if (taken && taken.has(i)) continue;
        const o = i * 3, dx = P[o] - E0, dy = P[o + 1] - E1, dz = P[o + 2] - E2, z2 = dx * f[0] + dy * f[1] + dz * f[2]; if (z2 < 70) continue;
        const sc = F / z2, x = S.px + (dx * r[0] + dy * r[1] + dz * r[2]) * sc; if (x < -160 || x > Wd + 160) continue;
        let y = S.py - (dx * u[0] + dy * u[1] + dz * u[2]) * sc; if (y < -40 || y > Hd + 40) continue;
        const size = WS * sc, dep = -dy / Math.sqrt(dx * dx + dy * dy + dz * dz), deck = (1 - smooth(0.245, 0.315, dep)) * (1 - over) + over; if (deck < 0.02) continue;
        if (size < 7) {   // a point of light; it turns into writing as it comes near
          const l = W.lvl[i], isF = W.front[i] === 1, k = 1 - smooth(5.2, 7, size), a = Math.min(0.80, (isF ? 0.95 : PT_A[l]) * lerp(1, 0.5, smooth(4000, 16000, z2)) * (1 + 0.55 * over)) * k * deck * fieldA * (1 - 0.8 * dim);
          if (a > 0.02) { const w2 = PT_C[l]; ptc[0] = tc[0] + (tf[0] - tc[0]) * w2; ptc[1] = tc[1] + (tf[1] - tc[1]) * w2; ptc[2] = tc[2] + (tf[2] - tc[2]) * w2; pushLabel(x, y, (isF ? 3.6 : PT_S[l]) * lerp(1, 0.72, smooth(4000, 16000, z2)) * (1 + 0.30 * over) * lerp(1, W.overScale || 1, over), null, 0, isF ? mk : ptc, a, mk, 0, 0, DOT); }
          if (size < 5.2) continue;
        }
        if (!S.reduced) y += Math.sin(tNow * (0.55 + (i % 7) * 0.045) + i * 1.7) * size * 0.055;   // each word floats a little on its own
        cI[nc] = i; cX[nc] = x; cY[nc] = y; cS[nc] = size; cZ[nc] = z2; cD[nc] = deck; cR[nc] = Math.sqrt(dx * dx + dy * dy + dz * dz); nc += 1;
      }
      ord.length = nc; for (let q = 0; q < nc; q += 1) ord[q] = q; ord.sort((a, b) => cZ[a] - cZ[b]);
      /* pass 1, near to far: claim room */
      for (let q = 0; q < nc; q += 1) {
        const c = ord[q], i = cI[c], x = cX[c], y = cY[c], size = cS[c], isF = W.front[i] === 1, len = W.len[i], nearK = cZ[c] < 350 ? 0.22 * size : 0, hw = len * size * 0.52 + (isF ? 10 : 3) + nearK, hh = size * 0.62 + (isF ? 6 : 2) + nearK * 0.5;
        const c0 = Math.max(0, ((x - hw) / CW) | 0), c1 = Math.min(cols - 1, ((x + hw) / CW) | 0), r0 = Math.max(0, ((y - hh) / CH) | 0), r1 = Math.min(rows - 1, ((y + hh) / CH) | 0);
        let hit = 0, tot = 0, h4 = 0; for (let rr = r0; rr <= r1; rr += 1) { const ro = rr * cols; for (let cc = c0; cc <= c1; cc += 1) { tot += 1; const v = occ[ro + cc]; if (v === 4) h4 += 1; if (v === 1 || v === 3 || v === 4 || (v === 2 && !isF)) hit += 1; } }
        const ratio = tot === 0 ? 0 : hit / tot, free = h4 < 2 && (awake.has(i) || (hid[i] ? ratio < 0.03 : ratio < 0.20)); hid[i] = free ? 0 : 1;
        if (free) for (let rr = r0; rr <= r1; rr += 1) { const ro = rr * cols; for (let cc = c0; cc <= c1; cc += 1) if (occ[ro + cc] !== 4) occ[ro + cc] = 1; }
        clr[i] += ((free ? 1 : 0) - clr[i]) * ease;
      }
      const tr = W.morphAt != null ? 1 - smooth(1.9, 2.5, S.t - W.morphAt) : 0;   // 1 while the sky is re-forming: nothing passes blurred, and a word that would pass very large steps back instead
      /* pass 2, far to near: print */
      for (let q = nc - 1; q >= 0; q -= 1) {
        const c = ord[q], i = cI[c]; if (clr[i] < 0.02) continue; const x = cX[c], y = cY[c], size = cS[c], z2 = cZ[c], isF = W.front[i] === 1;
        const rd = cR[c]; let a = (isF ? 1 : lerp(0.82, 0.27, smooth(700, 2900, z2)) * lerp(1, 0.5, smooth(3200, 8000, z2))) * smooth(90, 250, rd) * smooth(70, 150, z2) * cD[c] * smooth(-30, 26, y) * clr[i] * smooth(5.2, 7, size);
        const far = smooth(700, 2600, z2); let blur = (1 - tr) * (2.6 * (1 - smooth(110, 290, rd)) + (isF ? 0 : 0.30 * far));   // (a word on its way to a new place is never blurred)
        a *= 1 - tr * smooth(40, 58, size);   // (the sides and the buttons are a mask in the shader now: a word slides under it, see FS_LAB)
        const aw = awake.get(i), wk = aw ? aw.x : 0, kin = kinSet && kinSet.has(i) ? kinK : 0, lit = Math.max(wk, kin);
        a *= fieldA * (1 - 0.88 * dim * (1 - wk)); blur += 2.3 * dim; if (a < 0.02) continue;
        const devPx = Math.max(size, kin > 0.01 ? 14 : 0) * dpr; let sp = null;
        if (devPx > BASE_PX * 1.14 || W.lvl[i] > 3 || !base.done) { sp = spriteFor(i, D.words[i][0], 'w', devPx, null, devPx + (isF ? 400 : 0)); if (!sp && (W.lvl[i] > 3 || !base.done)) continue; }
        const ownK = isF ? 0.52 : 0, r0 = lerp(lerp(tc[0], tf[0], far), mk[0], ownK), g0 = lerp(lerp(tc[1], tf[1], far), mk[1], ownK), b0 = lerp(lerp(tc[2], tf[2], far), mk[2], ownK);
        const col = lit > 0.01 ? [lerp(r0, lerp(tc[0], mk[0], kin), lit), lerp(g0, lerp(tc[1], mk[1], kin), lit), lerp(b0, lerp(tc[2], mk[2], kin), lit)] : [r0, g0, b0];
        const s2 = lerp(size * (1 + 0.07 * wk), Math.max(size, 14), kin);
        if (s2 >= 15 && sp) pushLabel(x, y + s2 * 0.015, s2 * 1.035, sp, i, pal.c[0], 0.66 * a * smooth(15, 24, s2), mk, 0, blur + 3.0);   // a soft ground of the sky's own ink directly under the letters (no offset shadow: this is a print)
        const box = pushLabel(x, y, s2, sp, i, col, Math.min(1, a + 0.6 * lit), mk, 0, blur * (1 - lit));
        if (box) { const o = i * 5; W.vis[o] = x; W.vis[o + 1] = y; W.vis[o + 2] = s2; W.vis[o + 3] = a; W.vis[o + 4] = box.w; W.visAt[i] = S.frame; if (size >= 8.5 && a > 0.12 && maskAt(x, y) > 0.45) hits.push(i); }
      }
    }
    const RINGS = [ZR.f[0] - 60, ZR[5][0] - 40, ZR[4][0] - 20, ZR[3][0] - 30, ZR[2][0] - 60, ZR[1][0] - 75, ZR[1][1] + 60];
    const R_OUT = RE + RINGS[RINGS.length - 1], R_IN = RE + RINGS[0];
    /** From above the sky is a chart: the rings of the levels, a rim that carries a tick and a name wherever a part of
     * the present order begins, the place the eye stood and the wedge it was looking at, the sign of the order at the
     * hub, and under the pointer the place he would come down. Every mark counts something; nothing is ornament. */
    function drawRings() {
      const over = view.over; W.overHot = -1; if (over < 0.03) return; const E = view.eye, f = view.fwd, r = view.right, u = view.up, col = S.pal.line, a0 = over * base.alpha.x, N = 144;
      const prj = (X, Z) => { const dx = X - E[0], dy = -E[1], dz = Z - E[2], z2 = dx * f[0] + dy * f[1] + dz * f[2]; if (z2 < 200) return null; const sc = S.F / z2; return [S.px + (dx * r[0] + dy * r[1] + dz * r[2]) * sc, S.py - (dx * u[0] + dy * u[1] + dz * u[2]) * sc]; };
      const circle = (R, w, a, c) => { let p0 = null; for (let q = 0; q <= N; q += 1) { const th = q / N * TAU, p1 = prj(R * Math.sin(th), R * Math.cos(th)); if (p1 && p0) pushLine(p0[0], p0[1], p1[0], p1[1], 0, w, c || col, a, 1); p0 = p1; } };
      const radial = (th, R0, R1, w, a, c) => { const p0 = prj(R0 * Math.sin(th), R0 * Math.cos(th)), p1 = prj(R1 * Math.sin(th), R1 * Math.cos(th)); if (p0 && p1) pushLine(p0[0], p0[1], p1[0], p1[1], 0, w, c || col, a, 1); };
      RINGS.forEach((dz, q) => { const edge = q === 0 || q === RINGS.length - 1; circle(RE + dz, edge ? 1.1 : 0.7, (edge ? 0.50 : 0.22) * a0); });
      circle(R_OUT + 95, 0.7, 0.30 * a0);   // the rim is a double line, as on an instrument
      /* where the pointer rests on the ring: the place he would come down */
      const pt = S.pointer; let hot = null; if (pt.inside && !pt.down && over > 0.6) { const d0 = f[0] * S.F + r[0] * (pt.x - S.px) + u[0] * (S.py - pt.y), d1 = f[1] * S.F + r[1] * (pt.x - S.px) + u[1] * (S.py - pt.y), d2 = f[2] * S.F + r[2] * (pt.x - S.px) + u[2] * (S.py - pt.y);
        if (d1 < -1e-3) { const t = -E[1] / d1, hx = E[0] + d0 * t, hz = E[2] + d2 * t, rr = Math.hypot(hx, hz); if (rr > 1500 && rr < 7600) hot = { x: hx, z: hz, th: Math.atan2(hx, hz) }; } }
      wrap.classList.toggle('on-ring', !!hot);
      /* the rim: a tick where a part of the order begins (or where a family stands), a faint line across the ring, and its name */
      const secs = sectors(), mph = W.morph ? Math.min(1, W.morph.x) : 1, sa = a0 * smooth(0.55, 1, mph);
      let hotI = -1; if (hot && secs.length) { let bd = 9; secs.forEach((sc2, q) => { let inside; if (sc2.th0 != null) { const nx = secs[q + 1] && secs[q + 1].th0 != null ? secs[q + 1].th0 : TAU; const t = ((hot.th % TAU) + TAU) % TAU; inside = t >= sc2.th0 && t < nx ? 0 : 9; } else inside = Math.abs(wrapA(hot.th - sc2.th)); if (inside < bd && inside < 0.22) { bd = inside; hotI = q; } }); }
      W.overHot = hotI;
      for (const sc2 of secs) { if (sc2.th0 != null) { radial(sc2.th0, R_OUT, R_OUT + 230, 0.9, 0.55 * sa); radial(sc2.th0, R_IN, R_OUT, 0.6, 0.11 * sa); } else { radial(sc2.th, R_OUT, R_OUT + 150, 0.8, 0.45 * sa); radial(sc2.th, R_IN, R_OUT, 0.6, 0.08 * sa); } }
      { const pl = prj(R_IN * Math.sin(cam.a + Math.PI / 2), R_IN * Math.cos(cam.a + Math.PI / 2)), pr2 = prj(R_IN * Math.sin(cam.a - Math.PI / 2), R_IN * Math.cos(cam.a - Math.PI / 2)); W.overScale = clamp((pl && pr2 ? Math.abs(pl[0] - pr2[0]) : 600) / 620, 0.42, 1); }
      if (over > 0.5 && W.fonts) { const an = (over - 0.5) * 2 * smooth(0.55, 1, mph), shown = [], order = secs.map((sc2, q) => q).sort((x, y) => (y === hotI) - (x === hotI) || secs[y].w - secs[x].w);
        for (const q of order) { const sc2 = secs[q], pa = prj((R_OUT + 95) * Math.sin(sc2.th), (R_OUT + 95) * Math.cos(sc2.th)), pb = prj((R_OUT + 900) * Math.sin(sc2.th), (R_OUT + 900) * Math.cos(sc2.th)); if (!pa || !pb) continue; const isHot = q === hotI, size = isHot ? 25 : 21, subW = sc2.sub ? Array.from(sc2.sub).length * 6.2 : 0, hw = Math.max(size * 0.62, subW / 2) + 7, hh = size * 0.6 + (sc2.sub ? 17 : 4);
          let ux = pb[0] - pa[0], uy = pb[1] - pa[1]; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul; const off = 16 + Math.abs(ux) * hw + Math.abs(uy) * hh, p1 = [pa[0] + ux * off, pa[1] + uy * off - (sc2.sub ? 6 : 0)];   // clear of the rim by 16 px on the screen, whichever way the rim runs there
          if (p1[0] < hw + 6 || p1[0] > S.W - hw - 56 || p1[1] < 58 || p1[1] > S.H - hh - S.foot - 4) continue; if (shown.some((o) => Math.abs(p1[0] - o[0]) < hw + o[2] && Math.abs(p1[1] - o[1]) < hh + o[3])) continue; shown.push([p1[0], p1[1], hw, hh]);
          const sp = spriteFor('sec' + sc2.name, sc2.name, sc2.nameFont || 'k', size * S.dpr, null, 950, true); if (sp) pushLabel(p1[0], p1[1], size, sp, 0, S.pal.mark, (isHot ? 1 : 0.9) * an * a0, S.pal.mark, 0, 0, null, true);
          if (sc2.sub) { const sp2 = spriteFor('secs' + sc2.sub, sc2.sub, sc2.subFont || 'w', 11.5 * S.dpr, null, 940, true); if (sp2) pushLabel(p1[0], p1[1] + size * 0.6 + 9, 11.5, sp2, 0, S.pal.text, (isHot ? 0.95 : 0.66) * an * a0, S.pal.mark, 0, 0, null, true); } } }
      if (hot) { let p0 = null; for (let q = 0; q <= 28; q += 1) { const t = q / 28 * TAU, p1 = prj(hot.x + 170 * Math.sin(t), hot.z + 170 * Math.cos(t)); if (p1 && p0) pushLine(p0[0], p0[1], p1[0], p1[1], 0, 1.1, S.pal.mark, 0.9 * a0, 1); p0 = p1; } }
      /* here the eye stood, and this is the wedge of the ring it was looking at */
      { const a = cam.a, ex = RE * Math.sin(a), ez = RE * Math.cos(a), p0 = prj(ex, ez); if (p0) { pushLabel(p0[0], p0[1], 4.6, null, 0, S.pal.cord, Math.min(1, 1.1 * a0), S.pal.cord, 0, 0, DOT);
          const half = Math.atan(S.W / (2 * S.F)); for (const sg of [-1, 1]) { const dir = a + sg * half, dx = Math.sin(dir), dz = Math.cos(dir), bq = ex * dx + ez * dz, t = -bq + Math.sqrt(Math.max(0, bq * bq - (RE * RE - R_OUT * R_OUT))), p1 = prj(ex + dx * t, ez + dz * t); if (p1) pushLine(p0[0], p0[1], p1[0], p1[1], 0, 0.9, S.pal.cord, 0.46 * a0, 1); } } }
      const innerW0 = () => { const pl = prj(R_IN * Math.sin(cam.a + Math.PI / 2), R_IN * Math.cos(cam.a + Math.PI / 2)), pr2 = prj(R_IN * Math.sin(cam.a - Math.PI / 2), R_IN * Math.cos(cam.a - Math.PI / 2)); return pl && pr2 ? Math.abs(pl[0] - pr2[0]) : 600; };
      /* the rings named, along the radius nearest the eye, like the scale of an instrument */
      if (over > 0.5 && W.fonts) { const names = [opt.lang === 'ja' ? 'あなたの言葉' : 'your words', 'N5', 'N4', 'N3', 'N2', 'N1'], th = cam.a + Math.PI, a = (over - 0.5) * 2;
        let lastY = -99; if (innerW0() > 300) names.forEach((name, q) => { const R = q === 0 ? RE - 560 : RE + (RINGS[q] + RINGS[q + 1]) / 2, tq = q === 0 ? cam.a : th, p1 = prj(R * Math.sin(tq), R * Math.cos(tq)); if (!p1) return; if (q > 0) { if (Math.abs(p1[1] - lastY) < 21) return; lastY = p1[1]; }   // a level's name is left out where the rings stand too close to carry it
          const size = q === 0 ? 12 : 13, sp = spriteFor('ring' + q, name, 'w', size * S.dpr, null, 900, true); if (sp) pushLabel(p1[0], p1[1], size, sp, 0, q === 0 ? S.pal.mark : S.pal.text, 0.86 * a, S.pal.mark, 0, 0, null, true); });
        /* the hub is not a hole: the sign of the present order stands there, with one line that says what the order is */
        const pc = prj(0, 0), pl = prj(R_IN * Math.sin(cam.a + Math.PI / 2), R_IN * Math.cos(cam.a + Math.PI / 2)), pr2 = prj(R_IN * Math.sin(cam.a - Math.PI / 2), R_IN * Math.cos(cam.a - Math.PI / 2)), innerW = pl && pr2 ? Math.abs(pl[0] - pr2[0]) : 600;
        if (pc) { const g = { form: '形', sound: '音', read: '読', mean: '意' }[W.lens], size = clamp(innerW * 0.17, 22, 112), sp = spriteFor('hub' + g, g, 'k', size * S.dpr, null, 960, true); if (sp) { const gh = S.pal.ghost, tf2 = S.pal.textFar; hubc[0] = gh[0] + (tf2[0] - gh[0]) * 0.34; hubc[1] = gh[1] + (tf2[1] - gh[1]) * 0.34; hubc[2] = gh[2] + (tf2[2] - gh[2]) * 0.34; pushLabel(pc[0], pc[1] - size * 0.16, size, sp, 0, hubc, 0.85 * a * a0 * smooth(0.5, 1, mph), S.pal.mark, 0, 0, null, true); }   // the look's own tone, lifted a third toward its far text so it reads in the darkest looks
          const cap = W.lensCaption && innerW > 460 ? W.lensCaption(W.lens) : ''; if (cap) { const sp2 = spriteFor('hubcap' + W.lens, cap, 'w', 12.5 * S.dpr, null, 955, true); if (sp2) pushLabel(pc[0], pc[1] + size * 0.5 + 6, 12.5, sp2, 0, S.pal.mark, 0.86 * a * a0 * smooth(0.5, 1, mph), S.pal.mark, 0, 0, null, true); } } }
    }
    /** The third file: sentences from the app's own articles, and its grammar patterns. Grammar stands overhead as
     * fixed stars on the dome, one constellation per level; it turns with the sky and never comes nearer. */
    function setContext(C) {
      const wrapA = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
      W.ctx = C; if (C.articleWords && C.articles) { W.layout.read = layoutRead; if (W.lensReady) W.lensReady('read'); }
      const LV = { N5: 5, N4: 4, N3: 3, N2: 2, N1: 1 }, tw = C.grammarTwin || [], g = (C.grammar || []).map((r, i) => ({ i, id: r[0], p: r[1], lv: LV[r[2]] || 0, lvName: r[2] || '', mEn: r[3] || '', mJa: r[4] || '', form: r[5] || '', ex: r[6] || [], words: r[7] || [] })).filter((x) => !(tw[x.i] >= 0));   // a pattern stored twice is shown once
      g.sort((a, b) => b.lv - a.lv || (a.id < b.id ? -1 : 1));
      /* three belts overhead, the easiest lowest: N5 to N3, then N2, then N1 nearest the top of the sky; inside a belt the
       * patterns are scattered evenly (no two close), so a look upward shows a sky of grammar that can be read */
      const belts = [[(x) => x.lv >= 3, 0.44, 0.60], [(x) => x.lv === 2, 0.62, 0.95], [(x) => x.lv <= 1, 0.97, 1.30]];
      for (const [pick, e0, e1] of belts) { const list = g.filter(pick), m = list.length, s0 = Math.sin(e0), s1 = Math.sin(e1);
        const placed = [];
        list.forEach((x, q) => { x.sz = x.lv >= 3 ? 19 : x.lv === 2 ? 17 : 16; const hw = (Array.from(x.p).length * x.sz * 0.56 + 20) / 1438, hh = (x.sz * 0.8 + 9) / 1438; let az = 0, el = 0;
          for (let t = 0; t < 140; t += 1) { const k = q + t * m; az = ((0.5 + k * 0.7548776662466927) % 1) * TAU; el = Math.asin(s0 + (s1 - s0) * ((0.5 + k * 0.5698402909980532) % 1)); const ce = Math.cos(el);
            if (!placed.some((o) => Math.abs(wrapA(az - o.az)) * ce < hw + o.hw && Math.abs(el - o.el) < hh + o.hh)) break; }   // take the first free place: no two patterns print over each other
          placed.push({ az, el, hw, hh }); x.dir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]; x.q = q; }); }
      W.gram = g; W.gramById = new Map(g.map((x) => [x.i, x])); if (W.onContext) W.onContext(C);
    }
    api.setContext = setContext; W.gHits = [];
    function drawGrammar() {
      const g = W.gram; W.gHits.length = 0; if (!g || !g.length || !W.fonts) return; const f = view.fwd, r = view.right, u = view.up, a0 = base.alpha.x * (1 - view.over) * (1 - 0.85 * S.dim.x); if (a0 < 0.02) return;
      const taken = W.web && W.web.takenG; let prev = null;
      if (f[1] > 0.12) { const k0 = smooth(0.12, 0.34, f[1]), yawC = Math.atan2(f[0], f[2]), BANDS = [[0.425, 'N5 · N4 · N3'], [0.612, 'N2'], [0.962, 'N1']];
        const dirOf = (az, el) => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)], scr = (d) => { const z2 = d[0] * f[0] + d[1] * f[1] + d[2] * f[2]; return z2 < 0.2 ? null : [S.px + S.F * (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / z2, S.py - S.F * (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / z2]; };
        for (const [el, name] of BANDS) { let p0 = null; for (let q = -28; q <= 28; q += 1) { const p1 = scr(dirOf(yawC + q * 0.05, el)); if (p1 && p0 && p1[1] < S.H * 0.76 && p0[1] < S.H * 0.76) pushLine(p0[0], p0[1], p1[0], p1[1], 0, 0.7, S.pal.line, 0.20 * a0 * k0, 1); p0 = p1; }
          for (let q = Math.floor((yawC - 1.3) / 0.7); q <= Math.ceil((yawC + 1.3) / 0.7); q += 1) { const p1 = scr(dirOf(q * 0.7 + 0.35, el + 0.030)); if (!p1 || p1[0] < 40 || p1[0] > S.W - 80 || p1[1] < 50 || p1[1] > S.H * 0.72) continue; const sp = spriteFor('band' + name, name, 'w', 12.5 * S.dpr, null, 610, true); if (sp) { const bx = pushLabel(p1[0], p1[1], 12.5, sp, 0, S.pal.text, 0.80 * a0 * k0, S.pal.mark, 0, 0, null, true); if (bx) W.gHits.push({ i: -1, x: p1[0], y: p1[1], w: bx.w + 16, s: 14 }); } } } }   // each band's name stands inside the band it names, just above its line
      for (const x of g) { const d = x.dir, z2 = d[0] * f[0] + d[1] * f[1] + d[2] * f[2]; if (z2 < 0.25) continue;
        const X = S.px + S.F * (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / z2, Y = S.py - S.F * (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / z2, on = X > -200 && X < S.W + 200 && Y > -60 && Y < S.H * 0.74;
        const cur = on ? { x: X, y: Y, lv: x.lv, w: 0, s: x.sz } : null;
        if (cur && !(taken && taken.has(x.i))) { const size = x.sz, sp = spriteFor('gram' + x.i, x.p, 'w', size * S.dpr, null, 600, false), fade = smooth(S.H * 0.74, S.H * 0.60, Y) * smooth(-40, 30, Y);
          if (sp) { const box = pushLabel(X, Y, size, sp, 0, S.pal.mark, (x.lv >= 3 ? 0.94 : x.lv === 2 ? 0.76 : 0.62) * a0 * fade, S.pal.mark, 0, 2.6 * S.dim.x); if (box) { cur.w = box.w; W.gHits.push({ i: x.i, x: X, y: Y, w: box.w, s: size }); } } }   // the lowest band reads first, the highest last; behind an opened pattern the others go soft
        prev = cur; }
    }
    function drawThreads() {
      const pr = W.lens === 'sound' ? soundOrder().pairs : W.lens === 'mean' ? meanOrder().pairs : W.lens === 'read' ? (W.rOrder ? W.rOrder.pairs : null) : W.pairs, f = S.frame, vis = W.vis, at = W.visAt, col = S.pal.line, dim = S.dim.x; if (!pr || dim > 0.97 || (W.morph && W.morph.x < 1)) return; let n = 0;
      for (let q = 0; q < pr.length && n < 220; q += 2) { const a = pr[q], b = pr[q + 1]; if (at[a] !== f || at[b] !== f || W.front[a] || W.front[b]) continue;
        const oa = a * 5, ob = b * 5, ax = vis[oa], ay = vis[oa + 1], bx = vis[ob], by = vis[ob + 1], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy); if (len < 24 || len > (W.lens === 'mean' || W.lens === 'read' ? 260 : 400)) continue;
        const al = Math.min(vis[oa + 3], vis[ob + 3]); if (al < 0.16) continue;
        const k0 = 1 / Math.max(Math.abs(dx) / (vis[oa + 4] / 2 + 3), Math.abs(dy) / (vis[oa + 2] * 0.6 + 3), 1e-6), k1 = 1 / Math.max(Math.abs(dx) / (vis[ob + 4] / 2 + 3), Math.abs(dy) / (vis[ob + 2] * 0.6 + 3), 1e-6); if (k0 + k1 >= 0.92) continue;
        pushLine(ax + dx * k0, ay + dy * k0, bx - dx * k1, by - dy * k1, 0, 0.8, col, 0.22 * al * (1 - dim) * base.alpha.x, 1); n += 1; }
    }
    S.drawWorld = (dt) => {
      if (!W.ready) return;
      if (W.fonts) { if (!ghost.done) buildGhosts(); else buildBaseStep(); }
      spring(base.alpha, W.fonts ? 1 : 0, 1.6, dt);
      nLab = 0; nLin = 0;
      { const tb = S.toolsBox, away = !tb || !S.toolsEl || S.toolsEl.classList.contains('away'), k0 = W.toolsK == null ? (away ? 0 : 1) : W.toolsK; W.toolsK = k0 + ((away ? 0 : 1) - k0) * Math.min(1, dt * 7);   // the seals' room goes with the seals
        const list = (S.maskBoxes || []).slice(); if (tb && W.toolsK > 0.01) list.push([tb[0], tb[1], tb[2], tb[3], tb[4], W.toolsK]); S.mask = list; }
      dtSign = dt; drawRings(); drawGrammar(); drawSigns(); drawField(dt); const fieldCount = nLab; drawThreads();
      if (W.drawPath) W.drawPath();
      if (W.drawWake) W.drawWake(dt);
      if (W.web) W.web.draw(dt);
      serveSprites();
      const rw = canvas.width, rh = canvas.height;
      if (nLin) { gl.useProgram(P.line.p); gl.uniform2f(P.line.u.uRes, rw, rh); gl.bindVertexArray(vaoLin); gl.bindBuffer(gl.ARRAY_BUFFER, bLin); gl.bufferSubData(gl.ARRAY_BUFFER, 0, lin.subarray(0, nLin * VSTR)); gl.drawArrays(gl.TRIANGLES, 0, nLin); }
      if (nLab) { const uu = P.lab.u; gl.useProgram(P.lab.p); gl.uniform2f(uu.uRes, rw, rh);
        gl.uniform3fv(uu.uMoon, S.moon.dir); gl.uniform1f(uu.uMoonR, S.moon.r); gl.uniform3fv(uu.uInk, S.pal.moonInk || S.pal.ink); gl.uniform3fv(uu.uFwd, view.fwd); gl.uniform3fv(uu.uRight, view.right); gl.uniform3fv(uu.uUp, view.up);
        gl.uniform2f(uu.uPP, S.px * S.dpr, S.py * S.dpr); gl.uniform1f(uu.uF, S.F * S.dpr); gl.uniform1f(uu.uResH, rh); gl.uniform1f(uu.uMoonOn, (1 - view.over) * (1 - S.dim.x));
        { const d = S.dpr, bx = W.mBx || (W.mBx = new Float32Array(24)), br = W.mBr || (W.mBr = new Float32Array(6)), bk = W.mBk || (W.mBk = new Float32Array(6)), list = S.mask || []; bx.fill(0); br.fill(0); bk.fill(0);
          for (let q = 0; q < Math.min(6, list.length); q += 1) { const b = list[q]; bx[q * 4] = b[0] * d; bx[q * 4 + 1] = b[1] * d; bx[q * 4 + 2] = b[2] * d; bx[q * 4 + 3] = b[3] * d; br[q] = b[4] * d; bk[q] = b[5]; }
          gl.uniform4fv(uu.uBx, bx); gl.uniform1fv(uu.uBr, br); gl.uniform1fv(uu.uBk, bk); gl.uniform2f(uu.uEdgeM, 28 * d, (S.small ? 18 : 28) * d); gl.uniform1f(uu.uResW, rw); }
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tBase); gl.uniform1i(uu.uBase, 0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, near[0].tex); gl.uniform1i(uu.uNearA, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, near[1].tex); gl.uniform1i(uu.uNearB, 2); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tGhost); gl.uniform1i(uu.uGhost, 3);
        gl.bindVertexArray(vaoLab); gl.bindBuffer(gl.ARRAY_BUFFER, bLab); gl.bufferSubData(gl.ARRAY_BUFFER, 0, lab.subarray(0, nLab * LSTR)); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nLab); gl.activeTexture(gl.TEXTURE0); }
      W.stats = { labels: nLab, field: fieldCount, lines: (nLin / 6) | 0, sprites: sprites.size };
    };

    /* ------------------------------------------------------------ the hand
     * drag: turn the eye (the sky follows the finger), with a little sideways travel so near words still pass faster;
     * scroll: fly along the line of sight; sideways scroll: travel round the ring; pinch or pulling far back: rise above. */
    function pick(px, py, slop) {
      if (W.web) { const h = W.web.pick(px, py, slop); if (h) return h; if (W.web.isOpen()) return null; }
      if (view.over > 0.3) return null;
      for (const h of W.gHits) if (h.i >= 0 && Math.abs(px - h.x) <= h.w / 2 + slop && Math.abs(py - h.y) <= h.s * 0.7 + slop) return { t: 'g', i: h.i };
      let best = -1, bz = 1e9; for (const i of hits) { const o = i * 5, hw = W.vis[o + 4] / 2 + slop, hh = W.vis[o + 2] * 0.62 + slop; if (Math.abs(px - W.vis[o]) <= hw && Math.abs(py - W.vis[o + 1]) <= hh) { const z = -W.vis[o + 2]; if (z < bz) { bz = z; best = i; } } }
      return best >= 0 ? { t: 'w', i: best } : null;
    }
    const local = (e) => { const r = wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const pt = S.pointer;
    function setHover(h) { const i = h && h.t === 'w' ? h.i : -1; hoverKind = h ? h.t : ''; const key = h ? h.t + ':' + (h.i != null ? h.i : h.id) : ''; if (key !== W.hoverKey) { W.hoverKey = key; hover = i; if (i >= 0 && !awake.has(i)) awake.set(i, { x: 0, v: 0 }); if (W.onHover) W.onHover(h); } wrap.classList.toggle('on-word', !!h); }
    const onMove = (e) => {
      const [x, y] = local(e); pt.x = x; pt.y = y; pt.inside = true;
      if (e.target !== canvas && !pt.down) { pt.inside = false; setHover(null); return; }   // over a seal or a caption the pointer belongs to that control, not to the word behind it
      if (pinch.ids.has(e.pointerId)) { pinch.ids.set(e.pointerId, [x, y]); if (pinch.ids.size === 2) { const [a, b] = [...pinch.ids.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (tgt.ov > 0.5) { if (d > pinch.d0 * 1.25) setOver(false); } else if (!(W.web && W.web.isOpen())) { const z = pinch.z0 + (d - pinch.d0) * 4.2; if (z < -420) { setOver(true); pinch.d0 = d; } else tgt.offZ = z; } return; } }
      if (pt.down && e.pointerId === pt.id) {
        const ddx = x - pt.lx, ddy = y - pt.ly; pt.moved += Math.abs(ddx) + Math.abs(ddy);
        if (pt.moved > 6) { const now = performance.now(), dtm = Math.max(8, now - pt.lt) / 1000; grabbed = true; wrap.classList.add('grabbing');
          if (W.web && W.web.isOpen()) { if (W.web.turn) W.web.turn(ddx, ddy); }
          else if (tgt.ov > 0.5) { const k = 0.0042; cam.a -= ddx * k; vel.a = lerp(vel.a, -ddx * k / dtm, 0.35); tgt.phi = clamp(tgt.phi + ddy * 0.0036, 0.44, 1.32); }   // sideways turns the wheel, up and down tilts it
          else { const k = 1 / S.F, ks = 0.35 * (900 / S.F) / Math.max(400, RE + cam.offZ.x); tgt.yaw -= ddx * k; tgt.pitch += ddy * k; cam.a -= ddx * ks;
            vel.yaw = lerp(vel.yaw, -ddx * k / dtm, 0.35); vel.pitch = lerp(vel.pitch, ddy * k / dtm, 0.35); vel.a = lerp(vel.a, -ddx * ks / dtm, 0.35); }
          vel.yaw = clamp(vel.yaw, -2.2, 2.2); vel.pitch = clamp(vel.pitch, -1.4, 1.4); vel.a = clamp(vel.a, tgt.ov > 0.5 ? -1.6 : -0.12, tgt.ov > 0.5 ? 1.6 : 0.12);   // a flick carries on a little, never spins away
          pt.lt = now; if (W.onTouch) W.onTouch('turn'); }
        pt.lx = x; pt.ly = y; return;
      }
      if (e.pointerType !== 'touch') { S.par.x = clamp(x / S.W * 2 - 1, -1, 1); S.par.y = clamp(y / S.H * 2 - 1, -1, 1); }
    };
    const onDown = (e) => { if (e.button > 0 || e.target !== canvas) return; const [x, y] = local(e); pinch.ids.set(e.pointerId, [x, y]); if (pinch.ids.size === 2) { const [a, b] = [...pinch.ids.values()]; pinch.d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); pinch.z0 = tgt.offZ; pt.down = false; grabbed = false; return; }
      pt.down = true; pt.id = e.pointerId; pt.moved = 0; pt.sx = pt.lx = x; pt.sy = pt.ly = y; pt.lt = performance.now(); vel.a = vel.yaw = vel.pitch = 0; try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } };
    const onUp = (e) => { pinch.ids.delete(e.pointerId); if (!pt.down || e.pointerId !== pt.id) return; pt.down = false; wrap.classList.remove('grabbing'); const was = grabbed; grabbed = false;
      if (was) { if (performance.now() - pt.lt > 90) vel.a = vel.yaw = vel.pitch = 0; if (Math.abs(vel.yaw) < 0.012) vel.yaw = 0; if (Math.abs(vel.pitch) < 0.012) vel.pitch = 0; if (Math.abs(vel.a) < 0.0006) vel.a = 0; if (W.web && W.web.turnEnd) W.web.turnEnd(); return; }
      vel.a = vel.yaw = vel.pitch = 0; const [x, y] = local(e);
      if (tgt.ov > 0.5 && view.over > 0.6) {   // above the ring: a touch on the ring is where to come down
        const d = [view.fwd[0] * S.F + view.right[0] * (x - S.px) + view.up[0] * (S.py - y), view.fwd[1] * S.F + view.right[1] * (x - S.px) + view.up[1] * (S.py - y), view.fwd[2] * S.F + view.right[2] * (x - S.px) + view.up[2] * (S.py - y)];
        if (d[1] < -1e-3) { const t = -view.eye[1] / d[1], hx = view.eye[0] + d[0] * t, hz = view.eye[2] + d[2] * t, rr = Math.hypot(hx, hz); if (rr > 1500 && rr < 7600) cam.aTo = Math.atan2(hx, hz); } setOver(false); return; }
      const h = pick(x, y, e.pointerType === 'touch' ? 14 : 5);
      if (W.web) W.web.tap(h, e); };
    const onLeave = () => { pt.inside = false; S.par.x = 0; S.par.y = 0; setHover(null); };
    const onWheel = (e) => { e.preventDefault(); if (W.web && W.web.isOpen()) return; const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      if (e.ctrlKey) { pullBack += dy; if (pullBack > 40 && tgt.ov < 0.5) setOver(true); else if (pullBack < -40 && tgt.ov > 0.5) setOver(false); return; }
      if (tgt.ov > 0.5) { pullBack += dy; if (pullBack > 160) setOver(false); return; }
      if (Math.abs(e.deltaX) > Math.abs(dy) * 1.2) cam.a += e.deltaX * 0.9 / Math.max(400, RE + cam.offZ.x);
      else { if (dy < 0 && tgt.offZ <= -239 && Math.abs(cam.yaw.x) < 0.5) { pullBack -= dy; if (pullBack > 420) setOver(true); } else pullBack = 0; fly(dy * 1.15); }
      if (W.onTouch) W.onTouch('fly'); };
    const onKey = (e) => {
      if (S.paused || wrap.getClientRects().length === 0 || e.metaKey || e.ctrlKey || e.altKey) return; const ae = document.activeElement; if (ae && ae !== document.body && ae !== document.documentElement && !(wrap.getRootNode().host && ae === wrap.getRootNode().host)) return;   // keys belong to whatever holds the focus
      if (e.key === 'Escape') { if (W.web && W.web.isOpen()) { W.web.close(); e.stopPropagation(); } else if (tgt.ov > 0.5) { setOver(false); e.stopPropagation(); } return; }
      if (W.web && W.web.isOpen()) return; const step = e.shiftKey ? 3 : 1, L = !!opt.standalone; let used = true;   // letters only on the stand-alone page: the app keeps its own letter keys
      if (e.key === 'ArrowLeft' || (L && e.key === 'a')) vel.a -= 0.022 * step; else if (e.key === 'ArrowRight' || (L && e.key === 'd')) vel.a += 0.022 * step;
      else if (e.key === 'ArrowUp' || (L && e.key === 'w')) fly(170 * step); else if (e.key === 'ArrowDown' || (L && e.key === 's')) fly(-170 * step);
      else if (L && e.key === 'q') vel.yaw -= 0.5 * step; else if (L && e.key === 'e') vel.yaw += 0.5 * step;
      else if (e.key === 'PageUp' || (L && e.key === 'r')) tgt.offY += 90 * step; else if (e.key === 'PageDown' || (L && e.key === 'f')) tgt.offY -= 90 * step;
      else if (L && e.key === 'o') setOver(tgt.ov < 0.5); else if (e.key === 'Home' || (L && e.key === '0')) resetView(); else used = false;
      if (used) { e.preventDefault(); if (W.onTouch) W.onTouch('key'); } };
    wrap.addEventListener('pointermove', onMove); wrap.addEventListener('pointerdown', onDown); wrap.addEventListener('pointerup', onUp); wrap.addEventListener('pointercancel', onUp); wrap.addEventListener('pointerleave', onLeave); wrap.addEventListener('wheel', onWheel, { passive: false }); window.addEventListener('keydown', onKey, true);
    S.unbind = () => { window.removeEventListener('keydown', onKey, true); };
    S.afterFrame = () => { if (!W.ready || pt.down) return; if (pt.inside) setHover(pick(pt.x, pt.y, 4)); if (W.web && W.web.after) W.web.after(); };

    /* ------------------------------------------------------------ start */
    fetch(opt.dataUrl || 'sky-data.json').then((r) => r.json()).then((D) => {
      setData(D);
      const chars = new Set(); for (const w of D.words) for (const ch of w[0]) chars.add(ch); for (const k of D.kanji) chars.add(k[0]); for (const p of D.parts) chars.add(p[0]);
      const all = [...chars].join(''), jobs = []; if (document.fonts && document.fonts.load) for (let i = 0; i < all.length; i += 180) { const part = all.slice(i, i + 180); jobs.push(document.fonts.load(FONT_W(20), part).catch(() => null)); jobs.push(document.fonts.load(FONT_K(20), part).catch(() => null)); }
      if (document.fonts && document.fonts.load) jobs.push(document.fonts.load(FONT_E(14), 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ').catch(() => null));
      return Promise.race([Promise.all(jobs), new Promise((res) => setTimeout(res, 7000))]);
    }).then(() => { W.fonts = true; if (opt.contextUrl) fetch(opt.contextUrl).then((r) => (r.ok ? r.json() : null)).then((C) => { if (C && C.grammar) setContext(C); }).catch(() => { /* the sky stands without it */ }); }).catch((err) => { console.error('SKY data', err); if (opt.onFail) opt.onFail(err); });

    if (window.BunkiSkyWeb) window.BunkiSkyWeb(api, opt);
  };
})();
