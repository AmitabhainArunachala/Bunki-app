/* 宙 — the words in the sky: data, text atlases, the drifting field, the camera, and the hand.
 * Loaded after sky.js; sky.js calls BunkiSkyWorld(api, options) once the graphics context exists.
 * The constellation (a word opened into its characters) lives in sky-web.js and hooks in through W.web. */
(function () {
  'use strict';
  const T = window.BunkiSky.tools, clamp = T.clamp, lerp = T.lerp, smooth = T.smooth, spring = T.spring;

  /* depth by level: front = the learner's own words, then common words near, rare words deep */
  const ZR = { f: [330, 520], 5: [640, 860], 4: [900, 1120], 3: [1180, 1520], 2: [1640, 2100], 1: [2250, 3000], 0: [1640, 3000] };
  const WS = 12.85;                 // a word's letter height in world units
  const BASE_PX = 18;               // far words: one sheet of every deep word at this size (device pixels)
  const BUCKETS = [26, 34, 44, 58, 76, 100, 132, 176];
  const FONT_W = (px) => `800 ${px}px "Shippori Mincho B1", "Noto Serif JP", serif`;
  const FONT_K = (px) => `400 ${px}px "Yuji Syuku", "Shippori Mincho B1", "Noto Serif JP", serif`;

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
      const pad = 12, font = kind === 'k' ? FONT_K(px) : FONT_W(px);
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
      const D = W.D, top = D.kanji.map((k, i) => [k[9] || 0, i]).sort((a, b) => b[0] - a[0]).slice(0, 64), cell = 256;
      for (let r = 0; r < 8; r += 1) {
        sx2.globalCompositeOperation = 'source-over'; sx2.fillStyle = '#000'; sx2.fillRect(0, 0, 2048, cell); sx2.fillStyle = '#fff'; sx2.font = FONT_K(208); sx2.textBaseline = 'alphabetic'; sx2.textAlign = 'center';
        for (let c = 0; c < 8; c += 1) { const it = top[r * 8 + c]; if (!it) break; sx2.fillText(D.kanji[it[1]][0], c * cell + cell / 2, 200); ghost.list.push({ k: it[1], u: c * cell, v: r * cell }); }
        sx2.textAlign = 'start';
        const img = sx2.getImageData(0, 0, 2048, cell).data, out = new Uint8Array(2048 * cell); for (let k = 0, j = 0; k < out.length; k += 1, j += 4) out[k] = img[j];
        gl.bindTexture(gl.TEXTURE_2D, tGhost); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r * cell, 2048, cell, gl.RED, gl.UNSIGNED_BYTE, out);
      }
      gl.bindTexture(gl.TEXTURE_2D, tGhost); gl.generateMipmap(gl.TEXTURE_2D);
      /* keep only giants that stand clear of each other: largest families first, at least 1,150 units apart */
      const kept = []; for (const g of ghost.list) { if (kept.every((o) => Math.abs(wrapX(W.kx[g.k] - W.kx[o.k], W.L)) >= 1150)) { g.row = kept.length % 2; kept.push(g); } } ghost.list = kept; ghost.done = true;
    }

    /* ------------------------------------------------------------ label and line buffers */
    const MAXL = 2600, LSTR = 20; const lab = new Float32Array(MAXL * LSTR); let nLab = 0;
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
      if (ghostCell) { srcPx = 208; w = size / 208 * 256; h = w; u0 = ghostCell.u; v0 = ghostCell.v; u1 = u0 + 256; v1 = v0 + 256; tex = 3; texN = 2048; }
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

    /* ------------------------------------------------------------ data */
    function setData(D) {
      W.D = D; const n = W.n = D.words.length, nk = W.nk = D.kanji.length; W.L = D.world.L;
      W.hx = new Float32Array(n); W.hy = new Float32Array(n); W.hz = new Float32Array(n); W.lvl = new Uint8Array(n); W.front = new Uint8Array(n); W.frontX = new Float32Array(n);
      W.vis = new Float32Array(n * 5); W.visAt = new Int32Array(n).fill(-9);     // screen x, y, size, alpha, width — as drawn in the latest frame
      for (let i = 0; i < n; i += 1) { W.hx[i] = D.pos.w[i * 3]; W.lvl[i] = D.words[i][3] | 0; }
      W.kx = new Float32Array(nk); W.ky = new Float32Array(nk); for (let k = 0; k < nk; k += 1) { W.kx[k] = D.pos.k[k * 3]; W.ky[k] = D.pos.k[k * 3 + 1]; }
      W.len = new Uint8Array(n); for (let i = 0; i < n; i += 1) W.len[i] = Array.from(D.words[i][0]).length;
      W.byWord = new Map(D.words.map((w, i) => [w[0], i])); W.byKanji = new Map(D.kanji.map((k, i) => [k[0], i]));
      W.fam = Array.from({ length: nk }, () => []); for (let i = 0; i < n; i += 1) for (const k of D.words[i][4]) W.fam[k].push(i);
      const rank = (i) => (W.lvl[i] === 0 ? 9 : 6 - W.lvl[i]) * 100 + Array.from(D.words[i][0]).length * 10;
      for (const f of W.fam) f.sort((a, b) => rank(a) - rank(b) || a - b);
      const kana = (ch) => { const c = ch.charCodeAt(0); return c >= 0x30a1 && c <= 0x30f6 ? String.fromCharCode(c - 0x60) : ch; }, isKana = (ch) => /[\u3041-\u3096\u30a1-\u30f6]/.test(ch);
      W.rd = D.words.map((w) => { const last = w[0][w[0].length - 1], r = w[1] || ''; return isKana(last) && r && kana(r[r.length - 1]) !== kana(last) ? '' : r; });
      W.byReading = new Map(); for (let i = 0; i < n; i += 1) { const r = W.rd[i]; if (!r) continue; const a = W.byReading.get(r); if (a) a.push(i); else W.byReading.set(r, [i]); }
      W.sem = new Map(); for (const [a, b, rel, note] of D.sem) { for (const [x, y] of [[a, b], [b, a]]) { const arr = W.sem.get(x) || []; if (!arr.some((e) => e.w === y)) arr.push({ w: y, rel, note, head: x === a }); W.sem.set(x, arr); } }
      W.soundOf = new Map(); D.sound.forEach((row, si) => { for (const k of row[2]) if (!W.soundOf.has(k)) W.soundOf.set(k, si); });
      { const pairs = [], seenPair = new Set(), L = D.world.L;
        for (let k = 0; k < nk; k += 1) { const f = W.fam[k]; if (f.length < 2 || f.length > 90) continue;
          for (const a of f) { let best = -1, bd = 300 * 300; for (const b of f) { if (b === a || W.lvl[b] !== W.lvl[a]) continue; const dx = wrapX(D.pos.w[a * 3] - D.pos.w[b * 3], L), dy = D.pos.w[a * 3 + 1] - D.pos.w[b * 3 + 1], d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = b; } }
            if (best >= 0) { const key = a < best ? a * 8192 + best : best * 8192 + a; if (!seenPair.has(key)) { seenPair.add(key); pairs.push(a, best); } } } }
        W.pairs = Int32Array.from(pairs); }
      setFront(opt.front || []);
      W.ready = true; planBase(); if (W.web && W.web.onData) W.web.onData();
    }
    /** The learner's own words come to the front, on their own short ring, so a dozen are always in view. */
    function setFront(list) {
      if (!W.D) { opt.front = list; return; }
      const D = W.D, zOf = D.world.zOf, idx = [];
      for (const it of list) { const w = Array.isArray(it) ? it[0] : it; const i = W.byWord.get(w); if (i != null && !idx.includes(i)) idx.push(i); }
      for (let i = 0; i < W.n; i += 1) { const l = W.lvl[i], r = zOf[l] || zOf[0], t = clamp((D.pos.w[i * 3 + 2] - r[0]) / Math.max(1, r[1] - r[0]), 0, 1), zr = ZR[l] || ZR[0]; W.hz[i] = lerp(zr[0], zr[1], t); W.hy[i] = D.pos.w[i * 3 + 1]; }
      W.front.fill(0); W.frontList = idx; W.P0 = Math.max(2300, idx.length * 44); const rnd = T.mulberry(77);
      idx.forEach((i, j) => { W.front[i] = 1; W.frontX[i] = ((0.5 + j * 0.7548776662466927) % 1) * W.P0; W.hy[i] = lerp(-62, 118, ((0.5 + j * 0.5698402909980532) % 1)); W.hz[i] = lerp(ZR.f[0], ZR.f[1], rnd()); });
      W.order = Array.from({ length: W.n }, (_, i) => i).sort((a, b) => W.hz[b] - W.hz[a]);
    }
    api.setFront = setFront;

    /* ------------------------------------------------------------ camera and hand */
    const cam = S.cam; S.camTo.z = 0; const awake = new Map();    // word index -> spring, for words that have been touched
    let hover = -1, hoverKind = '', grabbed = false; const openK = { x: 0, v: 0 };
    const pinch = { ids: new Map(), d0: 0, z0: 0 };
    S.update = (dt) => {
      const web = W.web, isOpen = !!(web && web.isOpen());
      spring(S.driftK, isOpen || grabbed || S.reduced ? 0 : hover >= 0 ? 0.12 : 1, 3.2, dt);
      spring(S.dim, isOpen ? 1 : 0, 4.2, dt); spring(openK, isOpen ? 1 : 0, 4.0, dt);
      if (!grabbed) { cam.xTotal += S.panV.x * dt; S.camTo.y += S.panV.y * dt; const f = Math.exp(-dt * 2.6); S.panV.x *= f; S.panV.y *= f; }
      cam.xTotal += S.drift * S.driftK.x * dt; cam.x = cam.xTotal;
      S.camTo.y = clamp(S.camTo.y, -380, 380); S.camTo.z = clamp(S.camTo.z, -240, 2300);
      spring(S.sy, S.camTo.y, 7, dt); spring(S.sz, S.camTo.z + openK.x * 90, 5, dt); cam.y = S.sy.x; cam.z = S.sz.x;
      for (const [i, s] of awake) { spring(s, i === hover && hoverKind === 'w' ? 1 : 0, 9, dt); if (s.x < 0.004 && i !== hover) awake.delete(i); }
      if (web) web.update(dt);
    };

    /** Where word i is on screen right now (CSS px), or null if it is behind the camera. */
    function project(i) {
      const cx = cam.x + S.parS.x.x, cy = cam.y + S.parS.y.x; const z2 = W.hz[i] - cam.z; if (z2 < 40) return null; const sc = S.F / z2;
      const dx = W.front[i] ? wrapX(W.frontX[i] - cx, W.P0) : wrapX(W.hx[i] - cx, W.L);
      return { x: S.px + dx * sc, y: S.py - (W.hy[i] - cy) * sc, sc, z2, size: WS * sc };
    }
    W.project = project; W.WS = WS; W.awake = awake; W.wrapX = wrapX;

    /* ------------------------------------------------------------ the field */
    const hits = []; W.hits = hits;
    /* tidy sky: a word that would sit on top of a nearer word steps back, so no two words print over each other */
    const CW = 18, CH = 11; let occ = new Uint8Array(1), oc = 0, orw = 0; let seen = new Int32Array(1), nSeen = 0;
    function drawField(dt) {
      const D = W.D, pal = S.pal, n = W.n, F = S.F, Wd = S.W, Hd = S.H, dpr = S.dpr;
      const cx = cam.x + S.parS.x.x, cy = cam.y + S.parS.y.x, cz = cam.z, horY = (S.hor - 0.035) * Hd, dim = S.dim.x, web = W.web;
      const fieldA = base.alpha.x, tc = pal.text, tf = pal.textFar, mk = pal.mark, tNow = S.t;
      hits.length = 0;
      const cols = Math.ceil(Wd / CW) + 2, rows = Math.ceil(Hd / CH) + 2; if (oc !== cols || orw !== rows) { oc = cols; orw = rows; occ = new Uint8Array(cols * rows); } else occ.fill(0);
      if (seen.length < n) { seen = new Int32Array(n); W.clr = new Float32Array(n).fill(1); W.sxy = new Float32Array(n * 4); }
      const clr = W.clr, sxy = W.sxy, ease = Math.min(1, dt * 5.5);
      /* giant characters, far behind: tone on tone */
      if (ghost.done) for (const g of ghost.list) { const z2 = 5200 - cz * 0.5; const sc = F / z2; const dx = wrapX(W.kx[g.k] - cx, W.L); const x = S.px + dx * sc; if (x < -400 || x > Wd + 400) continue; const y = S.py - ((g.row ? 250 : -130) + 40 - cy) * sc; const size = 880 * sc;
        const fade = (1 - smooth(horY - size * 0.55, horY - size * 0.1, y)) * fieldA; if (fade < 0.01) continue; pushLabel(x, y, size, null, 0, pal.ghost, 0.24 * fade * (1 - 0.55 * dim), mk, 0, 0.3, g); }
      const taken = web ? web.taken : null, kinSet = W.kin, kinK = W.kinK || 0;
      /* pass 1, near to far: place, and claim room */
      nSeen = 0;
      for (let q = n - 1; q >= 0; q -= 1) {
        const i = W.order[q]; if (taken && taken.has(i)) continue;
        const z2 = W.hz[i] - cz; if (z2 < 70 || z2 > 3600) continue; const sc = F / z2;
        const isF = W.front[i] === 1; const dx = isF ? wrapX(W.frontX[i] - cx, W.P0) : wrapX(W.hx[i] - cx, W.L);
        const x = S.px + dx * sc; if (x < -160 || x > Wd + 160) continue;
        const size = WS * sc; let y = S.py - (W.hy[i] - cy) * sc; if (y < -40 || y > horY + 30) continue;
        if (!S.reduced) y += Math.sin(tNow * (0.55 + (i % 7) * 0.045) + i * 1.7) * size * 0.055;   // each word floats a little on its own
        const len = W.len[i], hw = len * size * 0.52 + (isF ? 10 : 3), hh = size * 0.62 + (isF ? 6 : 2);
        const c0 = Math.max(0, ((x - hw) / CW) | 0), c1 = Math.min(cols - 1, ((x + hw) / CW) | 0), r0 = Math.max(0, ((y - hh) / CH) | 0), r1 = Math.min(rows - 1, ((y + hh) / CH) | 0);
        let hit = 0, tot = 0; for (let r = r0; r <= r1; r += 1) { const ro = r * cols; for (let c = c0; c <= c1; c += 1) { tot += 1; hit += occ[ro + c]; } }
        const free = tot === 0 || hit / tot < 0.16 || awake.has(i);
        if (free) for (let r = r0; r <= r1; r += 1) { const ro = r * cols; for (let c = c0; c <= c1; c += 1) occ[ro + c] = 1; }
        clr[i] += ((free ? 1 : 0) - clr[i]) * ease;
        if (clr[i] < 0.02) continue;
        const o = nSeen * 4; sxy[o] = x; sxy[o + 1] = y; sxy[o + 2] = size; sxy[o + 3] = z2; seen[nSeen] = i; nSeen += 1;
      }
      /* pass 2, far to near: print */
      for (let q = nSeen - 1; q >= 0; q -= 1) {
        const i = seen[q], o4 = q * 4, x = sxy[o4], y = sxy[o4 + 1], size = sxy[o4 + 2], z2 = sxy[o4 + 3], isF = W.front[i] === 1;
        let a = (isF ? 1 : lerp(0.82, 0.27, smooth(700, 2900, z2))) * smooth(70, 210, z2) * (1 - smooth(horY - 46, horY + 8, y)) * smooth(-30, 26, y) * clr[i];
        const far = smooth(700, 2600, z2); let blur = 2.4 * (1 - smooth(110, 330, z2)) + (isF ? 0 : 0.30 * far);
        const aw = awake.get(i), wk = aw ? aw.x : 0, kin = kinSet && kinSet.has(i) ? kinK : 0, lit = Math.max(wk, kin);
        a *= fieldA * (1 - 0.88 * dim * (1 - wk)); blur += 2.3 * dim; if (a < 0.02) continue;
        const devPx = size * dpr; let sp = null;
        if (devPx > BASE_PX * 1.14 || W.lvl[i] > 3 || !base.done) { sp = spriteFor(i, D.words[i][0], 'w', devPx, null, devPx + (isF ? 400 : 0)); if (!sp && (W.lvl[i] > 3 || !base.done)) continue; }
        const r0 = lerp(tc[0], tf[0], far), g0 = lerp(tc[1], tf[1], far), b0 = lerp(tc[2], tf[2], far);
        const col = lit > 0.01 ? [lerp(r0, lerp(tc[0], mk[0], kin), lit), lerp(g0, lerp(tc[1], mk[1], kin), lit), lerp(b0, lerp(tc[2], mk[2], kin), lit)] : [r0, g0, b0];
        const s2 = size * (1 + 0.07 * wk);
        if (s2 >= 19 && sp) pushLabel(x + s2 * 0.045, y + s2 * 0.085, s2, sp, i, pal.c[0], 0.5 * a * smooth(19, 30, s2), mk, 0, blur + 1.7);   // a soft shadow lifts near words off the sky
        const box = pushLabel(x, y, s2, sp, i, col, Math.min(1, a + 0.6 * lit), mk, 0, blur * (1 - lit));
        if (box) { const o = i * 5; W.vis[o] = x; W.vis[o + 1] = y; W.vis[o + 2] = s2; W.vis[o + 3] = a; W.vis[o + 4] = box.w; W.visAt[i] = S.frame; if (size >= 8.5 && a > 0.12) hits.push(i); }
      }
    }
    function drawThreads() {
      const pr = W.pairs, f = S.frame, vis = W.vis, at = W.visAt, col = S.pal.line, dim = S.dim.x; if (!pr || dim > 0.97) return; let n = 0;
      for (let q = 0; q < pr.length && n < 220; q += 2) { const a = pr[q], b = pr[q + 1]; if (at[a] !== f || at[b] !== f || W.front[a] || W.front[b]) continue;
        const oa = a * 5, ob = b * 5, ax = vis[oa], ay = vis[oa + 1], bx = vis[ob], by = vis[ob + 1], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy); if (len < 24 || len > 400) continue;
        const al = Math.min(vis[oa + 3], vis[ob + 3]); if (al < 0.16) continue;
        const k0 = 1 / Math.max(Math.abs(dx) / (vis[oa + 4] / 2 + 3), Math.abs(dy) / (vis[oa + 2] * 0.6 + 3), 1e-6), k1 = 1 / Math.max(Math.abs(dx) / (vis[ob + 4] / 2 + 3), Math.abs(dy) / (vis[ob + 2] * 0.6 + 3), 1e-6); if (k0 + k1 >= 0.92) continue;
        pushLine(ax + dx * k0, ay + dy * k0, bx - dx * k1, by - dy * k1, 0, 0.8, col, 0.22 * al * (1 - dim) * base.alpha.x, 1); n += 1; }
    }
    S.drawWorld = (dt) => {
      if (!W.ready) return;
      if (W.fonts) { if (!ghost.done) buildGhosts(); else buildBaseStep(); }
      spring(base.alpha, W.fonts ? 1 : 0, 1.6, dt);
      nLab = 0; nLin = 0;
      drawField(dt); const fieldCount = nLab; drawThreads();
      if (W.drawWake) W.drawWake(dt);
      if (W.web) W.web.draw(dt);
      serveSprites();
      const rw = canvas.width, rh = canvas.height;
      if (nLin) { gl.useProgram(P.line.p); gl.uniform2f(P.line.u.uRes, rw, rh); gl.bindVertexArray(vaoLin); gl.bindBuffer(gl.ARRAY_BUFFER, bLin); gl.bufferSubData(gl.ARRAY_BUFFER, 0, lin.subarray(0, nLin * VSTR)); gl.drawArrays(gl.TRIANGLES, 0, nLin); }
      if (nLab) { const u = P.lab.u; gl.useProgram(P.lab.p); gl.uniform2f(u.uRes, rw, rh);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tBase); gl.uniform1i(u.uBase, 0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, near[0].tex); gl.uniform1i(u.uNearA, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, near[1].tex); gl.uniform1i(u.uNearB, 2); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tGhost); gl.uniform1i(u.uGhost, 3);
        gl.bindVertexArray(vaoLab); gl.bindBuffer(gl.ARRAY_BUFFER, bLab); gl.bufferSubData(gl.ARRAY_BUFFER, 0, lab.subarray(0, nLab * LSTR)); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nLab); gl.activeTexture(gl.TEXTURE0); }
      W.stats = { labels: nLab, field: fieldCount, lines: (nLin / 6) | 0, sprites: sprites.size };
    };

    /* ------------------------------------------------------------ the hand */
    function pick(px, py, slop) {
      if (W.web) { const h = W.web.pick(px, py, slop); if (h) return h; if (W.web.isOpen()) return null; }
      let best = -1, bz = 1e9; for (const i of hits) { const o = i * 5, hw = W.vis[o + 4] / 2 + slop, hh = W.vis[o + 2] * 0.62 + slop; if (Math.abs(px - W.vis[o]) <= hw && Math.abs(py - W.vis[o + 1]) <= hh) { const z = W.hz[i]; if (z < bz) { bz = z; best = i; } } }
      return best >= 0 ? { t: 'w', i: best } : null;
    }
    const local = (e) => { const r = wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const pt = S.pointer;
    function setHover(h) { const i = h && h.t === 'w' ? h.i : -1; hoverKind = h ? h.t : ''; const key = h ? h.t + ':' + (h.i != null ? h.i : h.id) : ''; if (key !== W.hoverKey) { W.hoverKey = key; hover = i; if (i >= 0 && !awake.has(i)) awake.set(i, { x: 0, v: 0 }); if (W.onHover) W.onHover(h); } wrap.classList.toggle('on-word', !!h); }
    const onMove = (e) => {
      const [x, y] = local(e); pt.x = x; pt.y = y; pt.inside = true;
      if (pinch.ids.has(e.pointerId)) { pinch.ids.set(e.pointerId, [x, y]); if (pinch.ids.size === 2) { const [a, b] = [...pinch.ids.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); S.camTo.z = pinch.z0 + (d - pinch.d0) * 3.2; return; } }
      if (pt.down && e.pointerId === pt.id) {
        const ddx = x - pt.lx, ddy = y - pt.ly; pt.moved += Math.abs(ddx) + Math.abs(ddy);
        if (pt.moved > 6 && !(W.web && W.web.isOpen())) { grabbed = true; wrap.classList.add('grabbing'); const k = 900 / S.F, now = performance.now(), dtm = Math.max(1, now - pt.lt) / 1000;
          cam.xTotal -= ddx * k; S.camTo.y += ddy * k; S.panV.x = lerp(S.panV.x, -ddx * k / dtm, 0.35); S.panV.y = lerp(S.panV.y, ddy * k / dtm, 0.35); pt.lt = now; if (W.onTouch) W.onTouch('pan'); }
        pt.lx = x; pt.ly = y; return;
      }
      if (e.pointerType !== 'touch') { S.par.x = clamp(x / S.W * 2 - 1, -1, 1); S.par.y = clamp(y / S.H * 2 - 1, -1, 1); }
    };
    const onDown = (e) => { if (e.button > 0 || e.target !== canvas) return; const [x, y] = local(e); pinch.ids.set(e.pointerId, [x, y]); if (pinch.ids.size === 2) { const [a, b] = [...pinch.ids.values()]; pinch.d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); pinch.z0 = S.camTo.z; pt.down = false; grabbed = false; return; }
      pt.down = true; pt.id = e.pointerId; pt.moved = 0; pt.sx = pt.lx = x; pt.sy = pt.ly = y; pt.lt = performance.now(); S.panV.x = 0; S.panV.y = 0; try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } };
    const onUp = (e) => { pinch.ids.delete(e.pointerId); if (!pt.down || e.pointerId !== pt.id) return; pt.down = false; wrap.classList.remove('grabbing'); const was = grabbed; grabbed = false;
      if (was) { if (Math.abs(S.panV.x) < 12) S.panV.x = 0; return; } S.panV.x = 0; S.panV.y = 0;
      const [x, y] = local(e); const h = pick(x, y, e.pointerType === 'touch' ? 14 : 5);
      if (W.web) W.web.tap(h, e); };
    const onLeave = () => { pt.inside = false; S.par.x = 0; S.par.y = 0; setHover(null); };
    const onWheel = (e) => { e.preventDefault(); if (W.web && W.web.isOpen()) return; const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY; if (Math.abs(e.deltaX) > Math.abs(dy) * 1.2) cam.xTotal += e.deltaX * 0.9; else S.camTo.z += dy * (e.ctrlKey ? 5 : 1.15); if (W.onTouch) W.onTouch('fly'); };
    const onKey = (e) => { if (e.key === 'Escape' && !S.paused && W.web && W.web.isOpen() && wrap.getClientRects().length > 0) { W.web.close(); e.stopPropagation(); } };
    wrap.addEventListener('pointermove', onMove); wrap.addEventListener('pointerdown', onDown); wrap.addEventListener('pointerup', onUp); wrap.addEventListener('pointercancel', onUp); wrap.addEventListener('pointerleave', onLeave); wrap.addEventListener('wheel', onWheel, { passive: false }); window.addEventListener('keydown', onKey, true);
    S.unbind = () => { window.removeEventListener('keydown', onKey, true); };
    S.afterFrame = () => { if (!W.ready || pt.down) return; if (pt.inside) setHover(pick(pt.x, pt.y, 4)); if (W.web && W.web.after) W.web.after(); };

    /* ------------------------------------------------------------ start */
    fetch(opt.dataUrl || 'sky-data.json').then((r) => r.json()).then((D) => {
      setData(D);
      const chars = new Set(); for (const w of D.words) for (const ch of w[0]) chars.add(ch); for (const k of D.kanji) chars.add(k[0]); for (const p of D.parts) chars.add(p[0]);
      const all = [...chars].join(''), jobs = []; if (document.fonts && document.fonts.load) for (let i = 0; i < all.length; i += 180) { const part = all.slice(i, i + 180); jobs.push(document.fonts.load(FONT_W(20), part).catch(() => null)); jobs.push(document.fonts.load(FONT_K(20), part).catch(() => null)); }
      return Promise.race([Promise.all(jobs), new Promise((res) => setTimeout(res, 7000))]);
    }).then(() => { W.fonts = true; }).catch((err) => { console.error('SKY data', err); if (opt.onFail) opt.onFail(err); });

    if (window.BunkiSkyWeb) window.BunkiSkyWeb(api, opt);
  };
})();
