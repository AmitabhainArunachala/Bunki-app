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

  /* ------------------------------------------------------------------ the radicals, in the order of the ring (部)
   * A radical is the part a dictionary files a character under; it usually hints at what the character is about.
   * In the 部 order the ring runs realm by realm in the order written here, and inside a realm from left to right,
   * so neighbours belong together. Each radical is written in its full form, as the data stores it; its side forms
   * (VARIANT above: 氵 is 水) stand with it and carry one name. `|` only groups a line for the reader.
   * A radical the data uses that is missing here goes to the end of the last realm (W.mOrder.unlisted names it). */
  const REALMS = [
    { mark: '人', en: 'people and the body', ja: '人と体', rads: '人 儿 女 子 父 毋 老 士 臣 氏 己 自 | 身 尸 肉 骨 血 歹 疒 | 足 止 走 立 尢 癶 夂 夊 舛 | 頁 首 面 目 見 耳 鼻 髟 齒 舌' },
    { mark: '言', en: 'speech, heart and mind', ja: '言葉と心', rads: '口 欠 言 曰 音 文 | 心 | 示 鬼 卜' },
    { mark: '手', en: 'the hand and what it does', ja: '手とその働き', rads: '手 又 寸 廾 爪 勹 支 攵 聿 力' },
    { mark: '水', en: 'water, fire, earth, sky and colours', ja: '水・火・土・空・色', rads: '水 冫 巛 雨 气 風 | 火 | 土 田 山 石 厂 阜 谷 穴 金 玉 | 日 月 夕 | 白 赤 靑 黃 黑 玄 色' },
    { mark: '木', en: 'plants and animals', ja: '草木と生き物', rads: '生 木 片 竹 艸 | 牛 羊 馬 犬 豕 鹿 虍 鼠 | 鳥 隹 飛 羽 | 魚 貝 虫 | 角 彐 毛 皮' },
    { mark: '糸', en: 'thread, cloth and food', ja: '糸・布・食べ物', rads: '革 糸 幺 麻 巾 衣 疋 | 禾 米 麥 豆 食 酉 甘 辛 香 鹵 鬯' },
    { mark: '宀', en: 'houses, tools, weapons and roads', ja: '家・道具・武器・道', rads: '皿 缶 瓦 臼 斗 匕 | 工 用 耒 网 鼓 卩 | 斤 刀 弓 矢 弋 戈 矛 殳 | 宀 冖 襾 亠 广 戶 門 囗 冂 匸 凵 几 | 車 舟 | 行 彳 辵 廴 方 邑 里' },
    { mark: '一', en: 'numbers, strokes, sizes and other marks', ja: '数・線・大きさ・しるし', rads: '一 二 八 十 | 丨 丶 丿 乙 亅 厶 彡 | 小 大 長 高 | 比 齊 非 无 而 釆 | 入 至 干 辰 艮' },
  ];
  /* What a sign says where the stored words fall short. also: the side form the characters carry when the data files
   * them under the full form only (狭 carries 犭, filed under 犬); full: the characters of the group that are written
   * with the full form all the same. en: a plain meaning where the data has none or a misleading one. jn: the Japanese
   * name of the radical where the stored one misleads (夕 is stored as た, the name of 田). ja: a plain hint for a
   * radical whose Japanese name does not say what it is about. */
  const RAD_SAY = {
    '毋': { en: 'mother, do not' }, '老': { also: '耂', full: '老', en: 'old' }, '士': { en: 'samurai, scholar' }, '身': { en: 'body' }, '尸': { en: 'body lying down (corpse)', jn: 'しかばね' }, '肉': { also: '月', full: '肉腐', en: 'flesh', jn: 'にくづき', ja: '体' }, '骨': { en: 'bone' }, '疒': { ja: '病気' },
    '足': { en: 'foot, leg' }, '立': { en: 'stand' }, '尢': { en: 'bent leg' }, '夊': { en: 'go slowly' }, '舛': { en: 'feet turned apart' }, '儿': { ja: '人の足' },
    '頁': { ja: '頭' }, '首': { en: 'head, neck' }, '面': { en: 'face' }, '髟': { en: 'long hair' }, '欠': { en: 'yawn, lack' }, '言': { en: 'speech', jn: 'ごんべん' }, '文': { en: 'writing, pattern' },
    '又': { en: 'right hand, again' }, '寸': { en: 'thumb, inch' }, '爪': { en: 'claw, grasping hand' }, '攵': { ja: '打つ' },
    '冫': { ja: '氷' }, '气': { en: 'air, steam' }, '土': { en: 'earth' }, '阜': { also: '阝', en: 'hill (阝 on the left)', jn: 'こざとへん', ja: '丘 · 左の阝' }, '穴': { en: 'hole, cave' }, '玉': { also: '王', full: '玉' },
    '日': { en: 'sun, day' }, '月': { en: 'moon' }, '夕': { jn: 'ゆうべ' }, '靑': { en: 'blue, green' }, '黃': { en: 'yellow' }, '玄': { en: 'dark, mysterious' },
    '片': { en: 'slice of wood' }, '竹': { also: '⺮', full: '竹' }, '艸': { ja: '草' }, '犬': { also: '犭', full: '犬状献獣', en: 'dog, beast' }, '隹': { en: 'small bird', ja: '鳥' },
    '貝': { en: 'shell, money', ja: 'お金' }, '角': { en: 'horn, angle' }, '毛': { en: 'hair, fur' }, '皮': { en: 'skin' },
    '巾': { en: 'cloth', ja: '布' }, '疋': { en: 'roll of cloth' }, '禾': { ja: '穀物' }, '麥': { en: 'wheat' }, '食': { en: 'food, eat' }, '酉': { ja: '酒' }, '甘': { jn: 'あまい' }, '香': { en: 'fragrance' },
    '缶': { en: 'jar' }, '斗': { en: 'ladle, measure' }, '匕': { en: 'spoon (a person turned round)', jn: 'さじのひ' }, '工': { en: 'work, craft', jn: 'たくみ' }, '用': { en: 'use' }, '卩': { en: 'seal, stamp' }, '矢': { en: 'arrow' }, '戈': { jn: 'ほこづくり' }, '矛': { en: 'spear', jn: 'ほこへん' }, '弋': { en: 'arrow on a cord' },
    '宀': { ja: '屋根' }, '襾': { en: 'cover, west' }, '广': { ja: '建物' }, '戶': { en: 'door' }, '囗': { ja: '囲い' }, '冂': { en: 'frame' }, '匸': { en: 'hiding place' },
    '車': { en: 'cart, car' }, '行': { en: 'go, crossroads' }, '彳': { ja: '道を行く' }, '辵': { en: 'walk, road', ja: '道を行く' }, '邑': { also: '阝', en: 'town (阝 on the right)', ja: '村・町 · 右の阝' }, '里': { en: 'village' },
    '乙': { en: 'second, bent' }, '彡': { en: 'hair strokes, pattern' }, '小': { also: '⺌', full: '小少尖営厳' }, '非': { en: 'not' }, '齊': { en: 'even, alike' }, '至': { en: 'arrive' }, '干': { en: 'dry, shield' }, '艮': { en: 'stop, northeast' },
  };
  /* THE RADICAL CORRECTIONS. The data files these 32 characters under a radical that neither the Kangxi tradition nor
   * Kanjipedia gives them (it follows Nelson's dictionary or the old form). Until the data is corrected at its source,
   * the sky files each under the radical written here: the form the character carries, as the data names that part.
   * (冒 単 巣: Kanjipedia gives 曰 ⺍ ⺍; the Kangxi radical is taken, because ⺍ is not a radical of this table.) */
  const RAD_FIX = { '酒': '酉', '鳴': '鳥', '順': '頁', '頼': '頁', '頃': '頁', '疑': '疋', '改': '攵', '攻': '攵', '帰': '巾', '邪': '邑', '州': '巛', '再': '冂', '歪': '止', '兎': '儿', '及': '又', '眉': '目', '嘗': '口', '煎': '灬', '匙': '匕', '粥': '米', '斡': '斗', '壮': '士', '壬': '士', '壷': '士', '蛋': '虫', '蜜': '虫', '処': '几', '為': '灬', '争': '亅', '冒': '冂', '単': '十', '巣': '巛' };

  window.BunkiSkyWorld = function (api, opt) {
    const { S, gl, P, wrap, canvas } = api;
    let OPEN_IN = 'star';   // the order the sky opens in: 星, the stars (lead, 2026-11-12 18:23); 形 where the file of the stars is missing. 'mean' is the key of the radical groups 部
    const W = api.W = { ready: false, D: null, n: 0, nk: 0, opt, lens: OPEN_IN };

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
    const tRad = api.mkTex(2048, 2048, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.LINEAR_MIPMAP_LINEAR), RAD_CELL = 128;   // every radical group's own glyph, small: the sky writes it in light behind its family (see lightFamilies and FS_SKY)
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
     * exact: cut at exactly this size (for the few labels that stand still and must be perfectly sharp); exact = 2: and cut
     * at once if it is missing (the name of the family the eye faces: when the sheet of labels starts again, it does not miss a frame). */
    const latest = new Map();
    function spriteFor(id, text, kind, devPx, marks, prio, exact) {
      const b = exact ? Math.max(8, Math.round(devPx)) : bucketFor(devPx), mk = marks && marks.length ? marks.join('.') : '';
      const key = kind + id + ':' + (exact ? 'e' : '') + b + ':' + mk; const sp = sprites.get(key);
      if (alive(sp)) { sp.used = S.frame; latest.set(kind + id + ':' + mk, sp); return sp; }
      if (exact === 2 && W.fonts) { const made = makeSprite(key, text, kind, b, marks); if (made) { latest.set(kind + id + ':' + mk, made); return made; } }
      wanted.push([prio || devPx, key, text, kind, b, marks]);
      const alt = latest.get(kind + id + ':' + mk) || latest.get(kind + id + ':'); return alive(alt) ? alt : null;
    }
    function serveSprites() {
      if (!wanted.length || !W.fonts) { wanted.length = 0; for (const pg of near) if (pg.dirty) { gl.bindTexture(gl.TEXTURE_2D, pg.tex); gl.generateMipmap(gl.TEXTURE_2D); pg.dirty = false; } return; }
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
      const D = W.D, top = D.kanji.map((k, i) => [k[9] || 0, i]).sort((a, b) => b[0] - a[0]).slice(0, 40), cell = 256, KANA = Array.from('あかさたなはまやらわ'); ghost.kana = [];
      for (let r = 0; r < 8; r += 1) {
        sx2.globalCompositeOperation = 'source-over'; sx2.fillStyle = '#000'; sx2.fillRect(0, 0, 2048, cell); sx2.fillStyle = '#fff'; sx2.font = FONT_K(208); sx2.textBaseline = 'alphabetic'; sx2.textAlign = 'center';
        for (let c = 0; c < 8; c += 1) { const q = r * 8 + c, it = top[q]; if (it) { sx2.fillText(D.kanji[it[1]][0], c * cell + cell / 2, 200); ghost.list.push({ k: it[1], u: c * cell, v: r * cell }); } else if (q - 40 >= 0 && q - 40 < KANA.length) { sx2.fillText(KANA[q - 40], c * cell + cell / 2, 200); ghost.kana.push({ k: -1 - (q - 40), ch: KANA[q - 40], u: c * cell, v: r * cell }); } }
        sx2.textAlign = 'start';
        const img = sx2.getImageData(0, 0, 2048, cell).data, out = new Uint8Array(2048 * cell); for (let k = 0, j = 0; k < out.length; k += 1, j += 4) out[k] = img[j];
        gl.bindTexture(gl.TEXTURE_2D, tGhost); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r * cell, 2048, cell, gl.RED, gl.UNSIGNED_BYTE, out);
      }
      gl.bindTexture(gl.TEXTURE_2D, tGhost); gl.generateMipmap(gl.TEXTURE_2D);
      /* the radical of every group that holds a word, in the brush hand, sixteen to a row: read blurred by the sky, never as a sharp sign */
      { const live = radicalOrder().groups.filter((g) => g.words.length && !g.none), per = 2048 / RAD_CELL;
        for (let row = 0; row * per < live.length && row < per; row += 1) { sx2.globalCompositeOperation = 'source-over'; sx2.fillStyle = '#000'; sx2.fillRect(0, 0, 2048, RAD_CELL); sx2.fillStyle = '#fff'; sx2.font = FONT_K(96); sx2.textBaseline = 'alphabetic'; sx2.textAlign = 'center';
          for (let c = 0; c < per; c += 1) { const g = live[row * per + c]; if (g) { sx2.fillText(g.ch, c * RAD_CELL + RAD_CELL / 2, 99); g.cell = [c * RAD_CELL / 2048, row * RAD_CELL / 2048]; } }
          sx2.textAlign = 'start'; const img = sx2.getImageData(0, 0, 2048, RAD_CELL).data, out = new Uint8Array(2048 * RAD_CELL); for (let k = 0, j = 0; k < out.length; k += 1, j += 4) out[k] = img[j];
          gl.bindTexture(gl.TEXTURE_2D, tRad); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row * RAD_CELL, 2048, RAD_CELL, gl.RED, gl.UNSIGNED_BYTE, out); }
        gl.bindTexture(gl.TEXTURE_2D, tRad); gl.generateMipmap(gl.TEXTURE_2D); S.radTex = tRad; }
      /* keep only giants that stand clear of each other: largest families first, at least 1,150 units apart */
      const kx = (k) => D.pos.k[k * 3], kept = []; for (const g of ghost.list) { if (kept.every((o) => Math.abs(wrapX(W.thOf(kx(g.k)) - W.thOf(kx(o.k)), Math.PI * 2)) >= 0.40)) { const th = W.thOf(kx(g.k)), R = RE + 5200; g.x = R * Math.sin(th); g.y = (kept.length % 2 ? 250 : -130) + 40; g.z = R * Math.cos(th); kept.push(g); } } ghost.list = kept; placeKana(); ghost.done = true;
    }

    /* ------------------------------------------------------------ label and line buffers */
    const MAXL = 11000, LSTR = 20; const lab = new Float32Array(MAXL * LSTR); let nLab = 0;
    const MAXK = 1800, kno = new Float32Array(MAXK * LSTR); let nKno = 0;   // the margins of sky round what is written among the stars (see pushKno): drawn after the lines, before the labels
    const vaoLab = gl.createVertexArray(); gl.bindVertexArray(vaoLab);
    const bQuad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bQuad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    { const l = gl.getAttribLocation(P.lab.p, 'aQ'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); }
    const bLab = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bLab); gl.bufferData(gl.ARRAY_BUFFER, lab.byteLength, gl.DYNAMIC_DRAW);
    ['aRect', 'aUv', 'aCol', 'aMark', 'aMisc'].forEach((name, i) => { const l = gl.getAttribLocation(P.lab.p, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, LSTR * 4, i * 16); gl.vertexAttribDivisor(l, 1); });
    gl.bindVertexArray(null);
    /* (a straight line is one piece, see pushLine: the sheet holds 16,000 pieces and the fullest frame uses a small part of it) */
    const MAXV = 96000, VSTR = 10; const lin = new Float32Array(MAXV * VSTR); let nLin = 0;
    const vaoLin = gl.createVertexArray(); gl.bindVertexArray(vaoLin);
    const bLin = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bLin); gl.bufferData(gl.ARRAY_BUFFER, lin.byteLength, gl.DYNAMIC_DRAW);
    [['aP', 4, 0], ['aCol', 4, 16], ['aTp', 2, 32]].forEach(([name, size, off]) => { const l = gl.getAttribLocation(P.line.p, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, VSTR * 4, off); });
    gl.bindVertexArray(null);
    /* the dust of the stars' order: round points of light, all in one draw (see pushPt; VS_PT in sky.js) */
    const MAXP = 24000, PSTR = 8, pts = new Float32Array(MAXP * PSTR); let nPts = 0, glowFrom = -1;   // (glowFrom: from here on the points are wide glows, drawn after the margins of sky and before the writing)
    const vaoPt = gl.createVertexArray(); gl.bindVertexArray(vaoPt);
    const bPt = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bPt); gl.bufferData(gl.ARRAY_BUFFER, pts.byteLength, gl.DYNAMIC_DRAW);
    [['aP', 0], ['aCol', 16]].forEach(([name, off]) => { const l = gl.getAttribLocation(P.pt.p, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, PSTR * 4, off); });
    gl.bindVertexArray(null);
    /** Queue one point of light. x, y = centre in CSS px; size = as a DOT label's size (the point is twice as wide); glint: 0, or his own word's fine glint. */
    function pushPt(x, y, size, col, a, glint) {
      if (nPts >= MAXP || a < 0.012) return; const d = S.dpr, o = nPts * PSTR; pts[o] = x * d; pts[o + 1] = y * d; pts[o + 2] = Math.max(1.5, size * 2 * d); pts[o + 3] = glint || 0; pts[o + 4] = col[0]; pts[o + 5] = col[1]; pts[o + 6] = col[2]; pts[o + 7] = Math.min(1, a); nPts += 1;
    }

    /** Queue one label. x, y = centre in CSS px; size = letter height in CSS px; sp = sprite or null for the base sheet. */
    function pushLabel(x, y, size, sp, baseIdx, col, a, mark, markA, blur, ghostCell, snap) {
      if (nLab >= MAXL) { W.labCut += 1; return null; } const d = S.dpr, o = nLab * LSTR; let w, h, u0, v0, u1, v1, tex, texN, srcPx;
      if (ghostCell && ghostCell.st) { srcPx = SA.px; w = size / SA.px * SA.cell; h = w; u0 = ghostCell.u; v0 = ghostCell.v; u1 = u0 + SA.cell; v1 = v0 + SA.cell; tex = 5; texN = SA.N; }   // a star's character, from the sheet of the stars
      else if (ghostCell && ghostCell.k == null) { srcPx = size * d; w = size * 2; h = w; u0 = 0; v0 = 0; u1 = 1; v1 = 1; tex = 4; texN = 1; }   // a point of light
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
      const nx = -dy / len, ny = dx / len, cx = (x0 + x1) / 2 + nx * bow, cy = (y0 + y1) / 2 + ny * bow, seg = bow ? clamp(Math.ceil(len / 22), 4, 28) : 1, hw = Math.max(0.9, width) * 0.5 + 0.7;
      let px = 0, py = 0, pnx = 0, pny = 0;
      for (let i = 0; i <= seg; i += 1) { const t = i / seg, mt = 1 - t; const X = mt * mt * x0 + 2 * mt * t * cx + t * t * x1, Y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
        const tx = 2 * mt * (cx - x0) + 2 * t * (x1 - cx), ty = 2 * mt * (cy - y0) + 2 * t * (y1 - cy); const tl = Math.hypot(tx, ty) || 1; const NX = -ty / tl, NY = tx / tl;
        if (i > 0) { if (nLin + 6 > MAXV) { W.lineCut += 1; return; } const t0 = (i - 1) / seg;   // (counted, so a check can tell when the sheet of lines is full)
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
    function setData(D, J) {
      W.D = D; const n = W.n = D.words.length, nk = W.nk = D.kanji.length; W.L = D.world.L; if (!(J && J.stars && J.constellations)) OPEN_IN = 'form';
      W.P = new Float32Array(n * 3); W.Pa = new Float32Array(n * 3); W.Pb = new Float32Array(n * 3); W.stg = new Float32Array(n);
      W.lvl = new Uint8Array(n); W.front = new Uint8Array(n);
      W.vis = new Float32Array(n * 5); W.visAt = new Int32Array(n).fill(-9);     // screen x, y, size, alpha, width — as drawn in the latest frame
      const rndS = T.mulberry(4242); for (let i = 0; i < n; i += 1) { W.lvl[i] = D.words[i][3] | 0; W.stg[i] = rndS(); }
      W.len = new Uint8Array(n); for (let i = 0; i < n; i += 1) W.len[i] = Array.from(D.words[i][0]).length;
      W.byWord = new Map(D.words.map((w, i) => [w[0], i])); W.byKanji = new Map(D.kanji.map((k, i) => [k[0], i]));
      /* the radical of every character: the stored one, or the corrected one (RAD_FIX); -1 where the data names none */
      W.byPart = new Map(); D.parts.forEach((p, i) => { if (!W.byPart.has(p[0])) W.byPart.set(p[0], i); });
      W.radPart = new Int32Array(nk); for (let k = 0; k < nk; k += 1) { const fix = RAD_FIX[D.kanji[k][0]], p = fix != null && W.byPart.has(fix) ? W.byPart.get(fix) : D.kanji[k][8]; W.radPart[k] = p != null && p >= 0 && D.parts[p] ? p : -1; }
      W.candAt = new Int32Array(n).fill(-9); W.candX = new Float32Array(n); W.candY = new Float32Array(n); W.candS = new Float32Array(n);   // where each word that is near enough to be printed stood in the latest frame, whether or not it had room
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
      W.frontList = []; W.lens = OPEN_IN; W.prevLens = OPEN_IN; W.layout = { form: layoutForm, sound: layoutSound, mean: layoutMean }; if (OPEN_IN === 'star') { setStars(J); W.layout.star = layoutStar; } if (W.lensReady) { W.lensReady('sound'); W.lensReady('mean'); if (star.ok) W.lensReady('star'); } if (W.onLens) W.onLens(W.lens);
      if (W.lens === 'mean') { const g0 = radicalOrder().groups.find((g) => g.words.length); if (g0) cam.a = g0.mid; }   // the eye opens facing the first group
      setFront(opt.front || []);
      if (W.lens === 'star') { star.k.x = 1; star.kk = 1; starHome(); }
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
    /** 部, the radical groups: the order the sky opens in. Round the ring every radical group is one unbroken arc, and
     * the arcs run in the order of the table REALMS: by what the radical is about, so neighbours belong together. A
     * group's arc is as wide as its words are many (with a floor, so a small group can still be found); a lane of empty
     * sky stands before each group, a wide one before a group of ten characters or more and before each realm. A group
     * is also a band of its own in height, and neighbouring groups stand at different heights, so each is an island
     * with open sky round it. Height here is height in the view: a word twice as far stands twice as high, so near
     * and far words of one group share one patch of the sky as the eye sees it (depth is still the word's level). Inside a group the full form stands before its side forms; characters that share a sound
     * part stand side by side (a cluster where its commonest member would stand, and the clusters common first); the
     * words of one character hang together at that character's own height, under the character itself (its head). */
    /** The home rule, in one place: the character whose radical group a word stands in. Now: its first character.
     * -1 = the word has no character (it then stands in a last arc of its own). */
    function radicalHomeOf(wi) { const ks = W.D.words[wi][4]; return ks && ks.length ? ks[0] : -1; }
    const FACE0 = 0.2;                                          // the first group begins this far left of where the eye first looks
    /* what the two numbers on a group's name count: its characters, and the words that stand in its arc (those whose first character is one of them) */
    const radCount = (c, w) => (opt.lang === 'ja' ? c + '字 · ここに立つ言葉 ' + w + '語' : c + (c === 1 ? ' character · ' : ' characters · ') + w + (w === 1 ? ' word begins here' : ' words begin here'));
    /* A family is a place you face. Seen from the eye's circle a word twice as near stands twice as far to the side,
     * so an arc of the ring would fan out about five times wider among its near words than among its far ones, and
     * what filled the view would be the neighbours. So a word's angle is drawn in toward the middle of its own group
     * by its depth: fanK(depth, fan) = 1 at the rim (3,000 deep), fan for the nearest words (640 deep), evenly between.
     * A fan of 0.37 would make a group a column of exactly one width from N5 to N1. Each group keeps a fan of its own
     * (g.fan, see radicalOrder), as a road is wider where one stands on it: a large group so little that, faced, it
     * still lies within the middle of the view; a small group as much as the lanes beside it allow (never into a
     * neighbour's arc, at any depth), so its few near words have room to be read. */
    const RIM_D = 3000, K0 = RIM_D / (RE + RIM_D), NEAR_M = (RE + 640) / 640;
    const fanK = (dp, fan) => 1 + ((W.fan != null ? W.fan : fan) - 1) * clamp((RIM_D - dp) / 2360, 0, 1);
    function radicalOrder() {
      if (W.mOrder) return W.mOrder; const D = W.D, n = W.n, nk = W.nk, ja = opt.lang === 'ja';
      /* the groups: every character is filed under its stored radical; side forms join their full form */
      const byKey = new Map(), groupOfK = new Int32Array(nk);
      for (let k = 0; k < nk; k += 1) { const p = W.radPart[k], ch = p >= 0 ? D.parts[p][0] : '', key = VARIANT[ch] || ch; let g = byKey.get(key); if (!g) { g = { key, forms: new Map(), chars: [], words: [], carry: 0 }; byKey.set(key, g); } g.chars.push(k); if (p >= 0) g.forms.set(p, (g.forms.get(p) || 0) + 1); }
      const groups = [], unlisted = [], lost = byKey.get('') || null;   // (lost: characters the data gives no radical; they share the last arc with the words that have no character)
      REALMS.forEach((rm, ri) => { for (const key of rm.rads.split(/[\s|]+/)) { const g = byKey.get(key); if (g && g.realm == null) { g.realm = ri; groups.push(g); } } });
      for (const g of byKey.values()) if (g.realm == null && g !== lost) { g.realm = REALMS.length - 1; groups.push(g); unlisted.push(g.key); }
      if (lost) { lost.none = true; lost.realm = REALMS.length - 1; groups.push(lost); }
      groups.forEach((g, gi) => { g.i = gi; for (const k of g.chars) groupOfK[k] = gi; });
      /* a character's level: the easiest level among the words that carry it (N5 = 5 ... N1 = 1; 0 = none of its words has a level) */
      const kLvl = new Uint8Array(nk); for (let k = 0; k < nk; k += 1) { let m = 0; for (const wi of W.fam[k]) if (W.lvl[wi] > m) m = W.lvl[wi]; kLvl[k] = m; }
      const common = (a, b) => kLvl[b] - kLvl[a] || W.fam[b].length - W.fam[a].length || a - b;
      /* each word goes home; and each group counts the words that carry any of its characters */
      const homeK = new Int32Array(n), none = [];
      for (let i = 0; i < n; i += 1) { const hk = radicalHomeOf(i); homeK[i] = hk; if (hk < 0) none.push(i); else groups[groupOfK[hk]].words.push(i); const met = []; for (const k of D.words[i][4]) { const gi = groupOfK[k]; if (!met.includes(gi)) { met.push(gi); groups[gi].carry += 1; } } }
      if (none.length) { if (lost) { for (const i of none) lost.words.push(i); lost.carry += none.length; } else groups.push({ key: '', i: groups.length, none: true, realm: REALMS.length - 1, forms: new Map(), chars: [], words: none, carry: none.length }); }
      for (const g of groups) { const say = RAD_SAY[g.key] || {}; let best = -1, bn = -1; for (const [p, c] of g.forms) if (c > bn) { bn = c; best = p; }
        g.formIds = [...g.forms.keys()].sort((a, b) => (D.parts[b][0] === g.key) - (D.parts[a][0] === g.key) || g.forms.get(b) - g.forms.get(a));   // the full form first, then its side forms
        if (g.none) g.chars.sort(common); else { const mates = (x, y) => (D.kanji[x][7] < D.kanji[y][7] ? -1 : D.kanji[x][7] > D.kanji[y][7] ? 1 : 0) || common(x, y);   // (kanji field 6: the stored sound part, -1 = none stored and the character stands alone; field 7: the reading it gives)
          const runs = g.formIds.map((p) => { const cl = new Map(); for (const k of g.chars.filter((x) => W.radPart[x] === p).sort(common)) { const sp = D.kanji[k][6], key = sp >= 0 ? 's' + sp : 'k' + k, a = cl.get(key); if (a) a.push(k); else cl.set(key, [k]); } for (const a of cl.values()) a.sort(mates); return cl; });
          /* a sound part shared across two forms of one radical (忘 under 心, 忙 under 忄): its characters meet where the two runs meet */
          for (let q = 0; q + 1 < runs.length; q += 1) for (const key of [...runs[q].keys()]) { if (key[0] !== 's' || !runs[q + 1].has(key)) continue; const here = runs[q].get(key), next = runs[q + 1].get(key), rest = [...runs[q + 1].entries()].filter((e) => e[0] !== key); runs[q].delete(key); runs[q].set(key, here); runs[q + 1].clear(); runs[q + 1].set(key, next); for (const [k2, v2] of rest) runs[q + 1].set(k2, v2); }
          g.chars = runs.flatMap((cl) => [...cl.values()].flat()); }
        g.ch = g.none ? '…' : D.parts[best][0]; g.label = g.none ? '…' : g.formIds.map((p) => D.parts[p][0]).concat(say.also ? [say.also] : []).join(' ');
        g.nameJa = g.none ? (g.chars.length ? '部首のない字' : '字のない言葉') : say.jn || D.parts[best][1] || ''; g.gloss = g.none ? (g.chars.length ? 'characters with no radical' : 'words with no character') : say.en || D.parts[best][2] || ''; g.hintJa = say.ja || ''; g.also = say.also || ''; g.full = say.full || '';
        g.name = ja ? g.nameJa + (g.hintJa ? '（' + g.hintJa + '）' : '') : g.gloss; g.big = g.chars.length >= 10; g.count = g.none && !g.chars.length ? '' : radCount(g.chars.length, g.words.length); }
      /* the arcs: FLOOR = the least width of a group, in words; LANE, SLIT, REALM_GAP = the empty sky before a group of ten characters or more, a smaller group, a realm.
       * the bands: a group of n characters is BAND0 + BAND1 * sqrt(n) high, and BAND_AT says how high in the sky one group after another stands (1 = the top, -1 = the foot) */
      const FLOOR = 12, LANE = 60, SLIT = 10, REALM_GAP = 70, BAND0 = 90, BAND1 = 30, BAND_AT = [0.85, -0.2, 0.3, -0.55], BAND_HALF = 410, BAND_MID = 60; let total = 0, prev = -1;   // (heights are written for a word 1,500 deep: see coneOf)
      for (const g of groups) { if (!g.words.length) { g.lead = 0; g.wt = 0; continue; } g.lead = g.realm !== prev ? REALM_GAP : g.big ? LANE : SLIT; prev = g.realm; g.wt = Math.max(g.words.length, FLOOR); total += g.lead + g.wt; }
      const unit = TAU / total, th = new Float32Array(n), yv = new Float32Array(n), realmOf = new Int32Array(n), pairs = [], heads = []; let at = 0, begun = false, isle = 0;
      for (const g of groups) { if (!g.words.length) { g.th0 = at * unit - FACE0; g.span = 0; g.mid = g.th0; continue; } if (!begun) { begun = true; at = -g.lead; }   // the first group begins a little left of where the eye first looks (its own gap closes the ring behind it)
        at += g.lead; g.th0 = at * unit - FACE0; g.span = g.wt * unit; g.mid = g.th0 + g.span / 2; const stretch = g.wt / g.words.length, byK = new Map(); let q = 0;
        for (const i of g.words) { const a = byK.get(homeK[i]); if (a) a.push(i); else byK.set(homeK[i], [i]); }
        const fams = g.none ? [...byK.entries()] : g.chars.filter((k) => byK.has(k)).map((k) => [k, byK.get(k)]);
        const high = Math.min(2 * BAND_HALF, BAND0 + BAND1 * Math.sqrt(fams.length)), yC = BAND_MID + BAND_AT[isle % BAND_AT.length] * (BAND_HALF - high / 2) * clamp(1.3 - fams.length / 60, 0.3, 1), tight = Math.sqrt(high / 1240); isle += 1; g.yC = yC; g.high = high; { const dps = g.words.map(depthOf).sort((x, y) => x - y); g.d5 = dps[Math.min(dps.length - 1, 4)]; }   // (a large group is wide enough to be a place by its width alone: it stands near the middle height)
        fams.forEach(([k, ws], fi) => { ws.sort((x, y) => (W.lvl[y] || 0) - (W.lvl[x] || 0) || x - y); const m = ws.length, yF = yC + (((fi * 0.6180339887) % 1) - 0.5) * high, rF = m < 2 ? 0 : clamp(70 + 38 * Math.sqrt(m), 90, 400) * tight, q0 = q; let near = 1e9;   // one character's family hangs together at its own height
          ws.forEach((wi, j) => { th[wi] = (at + (q + 0.5) * stretch) * unit - FACE0; yv[wi] = yF + (((0.5 + j * 0.7548776662466927) % 1) - 0.5) * 2 * rF; realmOf[wi] = g.i; q += 1; const dp = depthOf(wi); if (dp < near) near = dp; });
          const byY = ws.slice().sort((x, y) => yv[x] - yv[y]); for (let j = 1; j < m; j += 1) pairs.push(byY[j - 1], byY[j]);   // a thread ties two words that share their home character
          /* the head: the character itself, just over its commonest word (which stands at the family's own height: the 24 is the room a head and a word need so that neither covers the other) and a little nearer than it (a character with one word needs none: that word is its head) */
          /* (where one of those words is the bare character itself, that word is the head: no second glyph is drawn over it, see drawHeads) */
          if (m > 1 && k >= 0) { const t = (at + (q0 + m / 2) * stretch) * unit - FACE0, ch = D.kanji[k][0], bare = ws.find((wi) => D.words[wi][0] === ch); heads.push({ k, gi: g.i, t, dp: near - 30, x: 0, y: yF * coneOf(near - 30) + 24, z: 0, words: ws, bare: bare == null ? -1 : bare, a: 0, seen: -9 }); } });
        at += g.wt; }
      /* each group's fan (see fanK): its nearest words may spread as far as half the narrower lane beside it (they never reach a neighbour), and no wider than three tenths of a radian either side of the eye's line */
      { const lv = groups.filter((g) => g.words.length); lv.forEach((g, q) => { const lane = Math.min(g.lead, lv[(q + 1) % lv.length].lead) * unit; g.fan = clamp(Math.min(1 + lane / g.span, 0.30 / (g.span / 2 * NEAR_M)), 1 / (NEAR_M * K0), 3); }); }
      /* the realms, as stretches of the ring: each begins in the middle of the gap before its first group */
      const realms = REALMS.map((rm, ri) => ({ i: ri, mark: rm.mark, name: ja ? rm.ja : rm.en, th0: null, span: 0, words: 0, groups: 0 }));
      for (const g of groups) { if (!g.words.length) continue; const rm = realms[g.realm]; if (rm.th0 == null) rm.th0 = g.th0 - g.lead * unit / 2; rm.span = g.th0 + g.span - rm.th0; rm.words += g.words.length; rm.groups += 1; }
      for (const rm of realms) rm.mid = rm.th0 == null ? 0 : rm.th0 + rm.span / 2;
      W.mOrder = { th, realmOf, yv, groups, litG: new Float32Array(groups.length), live: groups.filter((g) => g.words.length), realms, heads, groupOfK, kLvl, homeK, common, unlisted, unit, pairs: Int32Array.from(pairs) }; return W.mOrder;
    }
    W.radicalOrder = radicalOrder; W.radicalHomeOf = radicalHomeOf; W.depthOf = depthOf; W.fanK = fanK;
    /** The radical form a character carries: 月 for the flesh characters (all but 肉 and 腐), 阝 犭 ⺮ 王 耂 ⺌ where the
     * data files the character under the full form only. One radical, one glyph, wherever it is drawn. */
    W.radForm = (k) => { const p = W.radPart[k]; if (p < 0) return ''; const stored = W.D.parts[p][0], key = VARIANT[stored] || stored, say = RAD_SAY[key], ch = W.D.kanji[k][0]; return say && say.also && stored === key && ch !== key && !(say.full || '').includes(ch) ? say.also : stored; };
    const coneOf = (dp) => clamp(dp / 1500, 0.45, 1.9);   // height in the view: what stands at height y for a word 1,500 deep stands at y * coneOf(depth) for a nearer or a farther one
    function layoutMean(out) {
      const mo = radicalOrder(), n = W.n, gs = mo.groups; for (let i = 0; i < n; i += 1) { if (W.front[i]) continue; const g = gs[mo.realmOf[i]], dp = depthOf(i), t = g.mid + (mo.th[i] - g.mid) * fanK(dp, g.fan), rad = RE + dp; out[i * 3] = rad * Math.sin(t); out[i * 3 + 1] = mo.yv[i] * coneOf(dp); out[i * 3 + 2] = rad * Math.cos(t); }
      for (const h of mo.heads) { const g = gs[h.gi], t = g.mid + (h.t - g.mid) * fanK(h.dp, g.fan), rr = RE + h.dp; h.x = rr * Math.sin(t); h.z = rr * Math.cos(t); }   // a head stands with its words
    }
    /** Turn the eye to face a group: the middle of its arc. Its words then stand in the middle of the view at every depth. */
    function faceGroup(g) { const a = g.mid; if (S.reduced) { cam.a = a; cam.aTo = null; } else cam.aTo = a; }
    /** Go to a radical group's place in the sky: the 部 order, the eye inside the ring at its resting height, facing the group. A family of common
     * characters is read from the eye's own circle; toward a family of rarer ones the eye goes in a little (by what its fifth-nearest word lies
     * deeper than the common ones, at most 360: never so far that the nearest words of its neighbours pass the eye large and blurred). */
    W.goRadical = (gi) => { const g = radicalOrder().groups[gi]; if (!g || !g.words.length) return false; if (W.lens !== 'mean') setLens('mean'); if (tgt.ov > 0.5) setOver(false); tgt.yaw = 0; tgt.pitch = clamp(g.yC / 1500 * 0.45, -0.055, 0.045); tgt.offY = 0; tgt.offZ = clamp(g.d5 - 760, 0, 360); vel.a = vel.yaw = vel.pitch = 0; faceGroup(g); return true; };   // (the eye also looks a little toward the height the family stands at)
    /** What stands where round the ring in the present order: the names a chart of this sky carries on its rim.
     * th = where the name stands; th0 = where its part of the ring begins (a tick is drawn there); w = its weight. */
    function sectors() {
      const D = W.D, key = W.lens; if (W.secCache && W.secCache.key === key) return W.secCache.list; const list = [], ja = opt.lang === 'ja';
      if (key === 'form') { const SL = 18, best = new Array(SL).fill(-1); for (let k = 0; k < W.nk; k += 1) { const m = W.fam[k].length; if (m < 6) continue; const sl = Math.min(SL - 1, Math.floor(W.thOf(D.pos.k[k * 3]) / TAU * SL)); if (best[sl] < 0 || m > W.fam[best[sl]].length) best[sl] = k; }   // the largest family in each eighteenth of the ring
        for (const ki of best) { if (ki < 0) continue; const k = D.kanji[ki]; list.push({ ki, th: W.thOf(D.pos.k[ki * 3]), name: k[0], sub: ja ? (k[2][0] || k[3][0] || '') : k[1] || '', subFont: ja ? 'w' : 'e', w: W.fam[ki].length }); } }
      else if (key === 'sound') { const so = soundOrder(), heads = Object.keys(ROWS); heads.forEach((h, q) => { const a0 = (so.rowAt[h] || 0) / W.n * TAU, a1 = (q + 1 < heads.length ? so.rowAt[heads[q + 1]] : W.n) / W.n * TAU; list.push({ th: (a0 + a1) / 2, th0: a0, name: h, sub: '', w: 100 }); }); }
      else if (key === 'read') { if (!W.rOrder) return list; const C = W.ctx, sg = W.rOrder.signs.filter((s) => s.a >= 0); let cur = null; sg.forEach((s) => { const lv = C.articles[s.a][3] || ''; if (!cur || cur.lv !== lv) { if (cur) cur.th1 = s.th0; cur = { lv, th0: s.th0, th1: W.rOrder.restStart, n: 0 }; list.push(cur); } cur.n += 1; });
        for (const c of list) { c.th = (c.th0 + c.th1) / 2; c.name = c.lv || '?'; c.sub = ja ? c.n + ' 記事' : c.n + ' articles'; c.subFont = ja ? 'w' : 'e'; c.nameFont = 'w'; c.w = 100; }
        if (W.rOrder.rest) list.push({ th: (W.rOrder.restStart + TAU) / 2, th0: W.rOrder.restStart, name: '…', nameFont: 'w', sub: ja ? 'まだ記事にない言葉' : 'not yet in an article', subFont: ja ? 'w' : 'e', w: 90 }); }
      else if (key === 'mean') { let tier = 0; for (const g of radicalOrder().groups) { if (!g.words.length) continue;   // every group that holds a word carries its name on the rim: no word lies in a stretch without one
          list.push({ th: g.mid, th0: g.th0, span: g.span, name: g.ch, nameFont: g.none ? 'w' : 'k', sub: g.name, subFont: ja ? 'w' : 'e', w: g.words.length, gi: g.i, g, small: !g.big, tier: g.big ? 0 : (tier += 1) % 3 }); } }
      W.secCache = { key, list }; return list;
    }
    W.sectors = sectors;
    /** The titles of the articles stand beyond their words like signs along a road, in three rows so neighbours do not touch. */
    let dtSign = 0.016;
    function drawSigns() {
      const isRad = W.lens === 'mean' && !!W.mOrder, signs = W.lens === 'read' && W.rOrder ? W.rOrder.signs : null;   // reading: the titles of articles; the radical groups: their scale (below)
      W.sHits = W.sHits || []; W.sHits.length = 0; W.hHits = W.hHits || []; W.hHits.length = 0; S.poolK.fill(0); S.glyphs.fill(0); W.faceG = -1; if (W.mOrder) W.mOrder.litG.fill(0);
      if (!(signs || isRad) || !W.fonts) return; const late = W.morphAt != null ? smooth(1.4, 2.0, S.t - W.morphAt) : 1, a0 = base.alpha.x * late * (1 - Math.min(1, 1.3 * S.dim.x)) * (1 - view.over); if (a0 < 0.03) return;   // (while a word is open the titles leave altogether: nothing stands behind its notes)   // after a re-forming the titles come last, when every word has landed
      if (isRad) { drawHorizon(a0 * (S.small ? 1 - (W.famK || 0) : 1)); lightFamilies(a0); drawHeads(a0 * (1 - (W.famK || 0))); return; }   // (a whole family opened: its characters take the heads' place; on a narrow screen they need the horizon's room too, and the family's name stands over them)
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
    /** The horizon of the radical groups: the rim of the wheel seen edge-on, engraved like the scale of an instrument.
     * The rim is the far edge of the ring of words (3,000 deep). It is drawn as one hairline just above the sea of
     * clouds, at one height under eye level whatever the eye's depth or height, and it stays in view when the eye
     * looks up or down (it then rests along the lower or the upper edge of the view). On it: a stronger stretch
     * where each group's arc lies and a tick where it begins (189); a taller tick and the realm's name where a realm
     * begins (8); under each stretch the group's radical, with its name where the stretch is long enough; and the
     * full name and counts of the family the eye faces, under the middle of the part of its stretch that is in view.
     * A family's far words stand straight above its stretch; when it is faced, all of its words do. Every name is a
     * door to the whole family. Nothing here steps aside or fades by itself: the faced family is always named. */
    const BAND_E = 0.215, RIM = RE + RIM_D, band = { hold: -1, at: -9, a0: 0, yaw0: 0, z0: 0, y: 1e9 }, bandC = [0, 0, 0];
    const wideOf = (str, sz, lat) => { let w = 0; for (const ch of str) w += ch === ' ' ? sz * 0.3 : ch.charCodeAt(0) > 0x2e7f ? sz : sz * lat; return w; };   // how wide a line will print, near enough to keep its room
    function drawHorizon(a0) {
      const mo = W.mOrder, live = mo.live, E = view.eye, f = view.fwd, r = view.right, u = view.up, d = S.dpr, ja = opt.lang === 'ja', sm = S.small, mkc = S.pal.mark, txc = S.pal.text, lnc = S.pal.line, fnow = S.frame;
      const s1 = sm ? 16 : 19, s2 = sm ? 12.5 : 15, s3 = 12, g1 = sm ? 13 : 15, n1 = sm ? 11 : 12, g0 = sm ? 11.5 : 12.5, right = S.W - (sm ? 50 : 66), left = sm ? 10 : 20, ce = Math.sqrt(1 - BAND_E * BAND_E);
      /* where the rim at ring angle th is seen: the direction from the eye to that point of the rim, lowered to the band's own height under eye level */
      const raw = (th) => { const dx = RIM * Math.sin(th) - E[0], dz = RIM * Math.cos(th) - E[2], h = Math.hypot(dx, dz) || 1, X = dx / h * ce, Z = dz / h * ce, z2 = X * f[0] - BAND_E * f[1] + Z * f[2]; if (z2 < 0.1) return null; return [S.px + S.F * (X * r[0] - BAND_E * r[1] + Z * r[2]) / z2, S.py - S.F * (X * u[0] - BAND_E * u[1] + Z * u[2]) / z2]; };
      /* the ring angle that stands at a place across the screen: found by halving, from the angle straight ahead */
      const fh = Math.hypot(f[0], f[2]) || 1, ux = f[0] / fh, uz = f[2] / fh, bq = E[0] * ux + E[2] * uz, tt = -bq + Math.sqrt(Math.max(0, bq * bq - (E[0] * E[0] + E[2] * E[2] - RIM * RIM))), thF = Math.atan2(E[0] + ux * tt, E[2] + uz * tt);
      const ringAt = (x) => { let lo = thF - 1.5, hi = thF + 1.5; for (let q = 0; q < 18; q += 1) { const mid = (lo + hi) / 2, p = raw(mid); if (p ? p[0] < x : mid < thF) lo = mid; else hi = mid; } return (lo + hi) / 2; };
      const thL = ringAt(-40), thC = ringAt(S.px), thR = ringAt(S.W + 40), pc = raw(thC); if (!pc || !(thR > thL)) return;
      const yb = clamp(pc[1], sm ? 86 : 72, S.H - S.foot - (sm ? 64 : 60)), at = (th) => { const p = raw(th); return p ? [p[0], yb + clamp(p[1] - pc[1], -10, 46)] : null; };
      const un = (th) => thC + wrapA(th - thC);   // an angle of the ring, as the one nearest the middle of the view
      band.y = yb;
      const run = (t0, t1, w, col, a) => { const n = Math.max(1, Math.ceil((t1 - t0) / (thR - thL) * 28)); let p0 = at(t0); for (let q = 1; q <= n; q += 1) { const p1 = at(t0 + (t1 - t0) * q / n); if (p0 && p1) pushLine(p0[0], p0[1], p1[0], p1[1], 0, w, col, a, 1); p0 = p1; } };
      run(thL, thR, 0.7, lnc, 0.30 * a0);   // the rim itself: one continuous hairline
      /* the family the eye faces: the group whose stretch holds the middle of the view (in a lane: the nearer of its neighbours).
       * While the sky only drifts, the faced family keeps its name until its stretch is 150 px from the middle; any move of the hand names the middle again at once */
      let pick = null, pd = 9; const inView = [];
      for (const g of live) { const t0 = un(g.th0), t1 = t0 + g.span, dd = thC < t0 ? t0 - thC : thC > t1 ? thC - t1 : 0; if (dd < pd) { pd = dd; pick = g; } if (t1 >= thL && t0 <= thR) inView.push([g, t0, t1]); }
      const moving = grabbed || cam.aTo != null || band.at !== fnow - 1 || Math.abs(wrapA(cam.a - band.a0) - (W.driftStep || 0)) > 1e-6 || Math.abs(cam.yaw.x - band.yaw0) > 1e-5 || Math.abs(cam.offZ.x - band.z0) > 0.02; band.a0 = cam.a; band.yaw0 = cam.yaw.x; band.z0 = cam.offZ.x;   // (moved by anything but the sky's own drift)
      let hold = band.hold >= 0 && !moving ? mo.groups[band.hold] : null; if (hold) { const t0 = un(hold.th0), pa = at(clamp(thC, t0, t0 + hold.span)); if (!pa || Math.abs(pa[0] - S.px) > 150) hold = null; }
      const face = hold || pick; band.hold = face ? face.i : -1; band.at = fnow; W.faceG = band.hold;
      const hotI = W.hoverKey && W.hoverKey.slice(0, 2) === 'r:' ? +W.hoverKey.slice(2) : W.signFocus != null && W.signFocus >= 0 ? W.signFocus : -1;
      const fr = W.frontList;
      const st = (g, k, to) => { const m = g.sg || (g.sg = {}), s = m[k] || (m[k] = { x: 0, v: 0 }); if (g.sgSeen !== fnow - 1 && g.sgSeen !== fnow) { s.x = k === 'lit' ? 0 : to; s.v = 0; } spring(s, to, k === 'lit' ? 7 : 10, dtSign); if (Math.abs(s.x - to) < 0.02 && Math.abs(s.v) < 0.3) { s.x = to; s.v = 0; } return s.x; };   // (a group that comes into view at the edge carries its sign already; only the light of the faced family is eased)
      const fullW = (g) => Math.max(wideOf(g.label, s1, 0.5) + (g.name ? 9 + wideOf(g.name, s2, 0.5) : 0), wideOf(g.count, s3, 0.52));
      const rows = [], boxes = [];
      for (const [g, t0, t1] of inView) { const pa = at(Math.max(t0, thL)), pb = at(Math.min(t1, thR)); if (!pa || !pb) continue; const xa = Math.max(pa[0], left), xb = Math.min(pb[0], right), c = { g, t0, t1, pa, pb, xm: (xa + xb) / 2, room: xb - xa, full: g === face || g.i === hotI }; rows.push(c);
        if (c.full) { const wA = fullW(g); c.cx = clamp(c.xm, left + wA / 2 + 6, Math.max(left + wA / 2 + 6, right - wA / 2 - 6)); boxes.push({ g, x0: c.cx - wA / 2, x1: c.cx + wA / 2 }); } }
      for (const c of rows) { const g = c.g, lit = mo.litG[g.i] = st(g, 'lit', g === face ? 1 : 0), kF = st(g, 'full', c.full ? 1 : 0), hot = g.i === hotI;
        /* its stretch of the rim and the tick where it begins; the faced family's stretch is drawn stronger and closed at both ends */
        bandC[0] = lerp(lnc[0], mkc[0], lit); bandC[1] = lerp(lnc[1], mkc[1], lit); bandC[2] = lerp(lnc[2], mkc[2], lit);
        run(Math.max(c.t0, thL), Math.min(c.t1, thR), lerp(0.9, 1.5, lit), bandC, lerp(g.big ? 0.62 : 0.5, 1, lit) * a0);
        if (c.t0 >= thL) { const p = at(c.t0); if (p) pushLine(p[0], p[1] - lerp(g.big ? 7 : 4.5, 10, lit), p[0], p[1] + 0.5, 0, 0.9, bandC, lerp(0.62, 1, lit) * a0, 1); }
        if (lit > 0.02 && c.t1 <= thR) { const p = at(c.t1); if (p) pushLine(p[0], p[1] - 10 * lit, p[0], p[1] + 0.5, 0, 0.9, bandC, lit * a0, 1); }
        /* the small sign: the radical under its own stretch, with its name where the stretch is long enough. It gives way to a full sign and to one of his own words */
        const w0 = g.big ? wideOf(g.label, g1, 0.5) : g0, wn = wideOf(g.name, n1, 0.5), form = !g.big ? (c.room >= g0 + 1 ? 1 : 0) : c.room >= w0 + 8 + wn + 12 ? 3 : c.room >= w0 + 6 ? 2 : c.room >= g1 + 1 ? 1 : 0;
        const wS = form === 3 ? w0 + 8 + wn : form === 2 ? w0 : form === 1 ? (g.big ? g1 : g0) : 0, yl = c.pa[1] + (c.pb[1] - c.pa[1]) * (c.pb[0] > c.pa[0] + 1 ? clamp((c.xm - c.pa[0]) / (c.pb[0] - c.pa[0]), 0, 1) : 0), ys = yl + (g.big ? 16 : 13.5);
        let free = form > 0 && !c.full && !boxes.some((b) => b.g !== g && c.xm + wS / 2 + 10 > b.x0 && c.xm - wS / 2 - 10 < b.x1);
        if (free) for (const wi of fr) { if (W.candAt[wi] < fnow - 1) continue; const fx = W.candX[wi], fy = W.candY[wi], hw = W.len[wi] * W.candS[wi] * 0.52 + (g.sg && g.sg.on && g.sg.on.x > 0.5 ? 14 : 18), hh = W.candS[wi] * 0.62 + 4; if (fx + hw > c.xm - wS / 2 && fx - hw < c.xm + wS / 2 && fy + hh > ys - 9 && fy - hh < ys + 9) { free = false; break; } }   // (where his word stands, not where its float has carried it; a sign that shows keeps showing until it is clearly covered)
        const kS = st(g, 'on', free ? 1 : 0), kN = st(g, 'name', free && form === 3 ? 1 : 0);
        if (kS > 0.03 && form > 0) { const sz = g.big ? g1 : g0, sa = spriteFor('bd' + (form >= 2 ? 'L' : 'c') + (g.big ? 'B' : 'S') + g.i, form >= 2 ? g.label : g.ch, g.none ? 'w' : 'k', sz * d, null, 500, true);
          if (sa) { const wa = sa.w * sz / sa.px, pa2 = 12 * sz / sa.px, x0 = c.xm - wS / 2; pushLabel(x0 - pa2 + wa / 2, ys, sz, sa, 0, txc, (g.big ? 0.86 : 0.66) * a0 * kS, mkc, 0, 0);
            if (kN > 0.03) { const sb = spriteFor('bdN' + g.i, g.name, ja ? 'w' : 'e', n1 * d, null, 495, true); if (sb) { const wb = sb.w * n1 / sb.px, pb2 = 12 * n1 / sb.px; pushLabel(x0 + w0 + 8 - pb2 + wb / 2, ys + (sz - n1) * 0.3, n1, sb, 0, txc, 0.7 * a0 * kS * kN, mkc, 0, 0); } }
            W.sHits.push({ a: -2, gi: g.i, x: c.xm, y: ys, w: wS + 8, s: sz, b: 0, on: kS > 0.5, big: form === 3, nd: !!g.none }); } }
        /* the full sign of the faced family (and of one under the pointer or reached by the keyboard): radical, name, and what its two numbers count */
        if (kF > 0.03) { const wA = fullW(g), cx = c.cx != null ? c.cx : c.xm, pl = at(ringAt(cx)), y1 = (pl ? pl[1] : yl) + 19, al = a0 * kF, wl = wideOf(g.label, s1, 0.5), xs = cx - (wl + (g.name ? 9 + wideOf(g.name, s2, 0.5) : 0)) / 2;
          const sa = spriteFor('bdF' + g.i, g.label, g.none ? 'w' : 'k', s1 * d, null, 520, 2);
          if (sa) { const wa = sa.w * s1 / sa.px, pa2 = 12 * s1 / sa.px; pushLabel(xs - pa2 + wa / 2, y1, s1, sa, 0, txc, (hot ? 1 : 0.96) * al, mkc, 0, 0);
            if (g.name) { const sb = spriteFor('bdG' + g.i, g.name, ja ? 'w' : 'e', s2 * d, null, 515, 2); if (sb) { const wb = sb.w * s2 / sb.px, pb2 = 12 * s2 / sb.px; pushLabel(xs + wl + 9 - pb2 + wb / 2, y1 + (s1 - s2) * 0.37, s2, sb, 0, txc, 0.92 * al, mkc, 0, 0); } }
            if (g.count) { const sc2 = spriteFor('bdC' + g.i, g.count, 'w', s3 * d, null, 510, 2); if (sc2) pushLabel(cx, y1 + s1 * 0.62 + 5 + s3 * 0.6, s3, sc2, 0, txc, 0.76 * al, mkc, 0, 0); }
            if (hot) pushLine(cx - wA / 2, y1 + s1 * 0.62 + 1, cx + wA / 2, y1 + s1 * 0.62 + 1, 0, 1.0, mkc, 0.8 * al, 1);   // under the pointer: underlined, as every door is
            W.sHits.push({ a: -2, gi: g.i, x: cx, y: y1, w: wA + 12, s: s1, b: g.count ? s3 * 1.5 + 6 : 0, on: kF > 0.5, big: true, nd: !!g.none }); } }
        g.sgSeen = fnow; }
      /* where a realm begins: a taller tick, and the realm's name beside it above the rim */
      for (const rm of mo.realms) { if (rm.th0 == null) continue; const t = un(rm.th0); if (t < thL || t > thR) continue; const p = at(t); if (!p || p[0] < left || p[0] > right) continue; pushLine(p[0], p[1] - 21, p[0], p[1] + 0.5, 0, 1.1, lnc, 0.9 * a0, 1);
        const sz = sm ? 11 : 11.5, w = wideOf(rm.name, sz, 0.5); if (p[0] + 8 + w > right) continue; const sp = spriteFor('bdR' + rm.i, rm.name, ja ? 'w' : 'e', sz * d, null, 490, true);
        if (sp) { const wb = sp.w * sz / sp.px, pb2 = 12 * sz / sp.px; pushLabel(p[0] + 7 - pb2 + wb / 2, p[1] - 21, sz, sp, 0, txc, 0.6 * a0, mkc, 0, 0); W.sHits.push({ a: -2, gi: null, x: p[0] + 7 + w / 2, y: p[1] - 21, w: w + 6, s: sz, b: 0, on: false, big: false, nd: true }); } }   // (the name stands at the head of the tall tick, above the ticks of the groups)
    }
    /** Light and mist carry the families. Each group that holds words has a soft pool of light in the sky where its
     * words stand (FS_SKY adds it to the clouds and to the river of heaven), brighter for a larger group and a step
     * brighter for the family the eye faces; the lanes between groups stay dark. In the widest pools, and always in
     * the faced one, the group's radical is written in the same light, large and soft: mist, not a sign. Both belong
     * to the sky's own depth: they stand where the group's middle words stand (1,500 deep) and pass with them. */
    const lightC = [];
    function lightFamilies(a0) {
      const mo = W.mOrder, E = view.eye, f = view.fwd, r = view.right, u = view.up, fnow = S.frame, DREF = 1500, cand = lightC; cand.length = 0;
      const prj = (th, y) => { const R = RE + DREF, dx = R * Math.sin(th) - E[0], dy = y - E[1], dz = R * Math.cos(th) - E[2], z2 = dx * f[0] + dy * f[1] + dz * f[2]; if (z2 < 240) return null; const sc = S.F / z2; return [S.px + (dx * r[0] + dy * r[1] + dz * r[2]) * sc, S.py - (dx * u[0] + dy * u[1] + dz * u[2]) * sc]; };
      for (const g of mo.live) { if (Math.abs(wrapA(g.mid - cam.a)) > 1.0) continue; const lit = g.sgSeen === fnow && g.sg && g.sg.lit ? g.sg.lit.x : 0, c = prj(g.mid, g.yC); let x, y, rx, ry, wide = 0;
        if (c) { const e = prj(g.mid + g.span * fanK(DREF, g.fan) / 2, g.yC), t = prj(g.mid, g.yC + g.high / 2 + 60); x = c[0]; y = c[1]; wide = e ? Math.abs(e[0] - x) : 60; rx = Math.max(46, wide * 1.2 + 30); ry = Math.max(46, (t ? Math.abs(t[1] - y) : 60) * 1.05 + 24); }
        else if (lit > 0.3) { x = S.px; y = S.py; rx = S.W * 0.42; ry = S.H * 0.36; }   // flown in past its middle depth: the family's light is all round the eye
        else continue;
        if (x + 2.4 * rx < 0 || x - 2.4 * rx > S.W || y + 2.4 * ry < 0 || y - 2.4 * ry > S.H) continue;
        cand.push({ g, x, y, rx, ry, lit, k: a0 * (0.14 + 0.26 * Math.sqrt(Math.min(1, g.words.length / 420))) * (1 + 0.85 * lit), ga: c && g.cell ? a0 * (0.11 * smooth(50, 130, wide) + 0.25 * lit) * smooth(S.W * 0.62, S.W * 0.30, Math.abs(x - S.px)) : 0 }); }
      cand.sort((p, q) => q.lit - p.lit || q.k * q.rx * q.ry - p.k * p.rx * p.ry);
      const pl = S.pools, pk = S.poolK, n = Math.min(pk.length, cand.length); for (let q = 0; q < n; q += 1) { const c = cand[q]; pl[q * 4] = c.x; pl[q * 4 + 1] = c.y; pl[q * 4 + 2] = c.rx; pl[q * 4 + 3] = c.ry; pk[q] = c.k; }
      cand.sort((p, q) => q.ga - p.ga); const gl2 = S.glyphs, gc = S.glyphC;
      for (let m = 0; m < 4 && m < cand.length; m += 1) { const c = cand[m]; if (c.ga < 0.004) break; gl2[m * 4] = c.x; gl2[m * 4 + 1] = c.y; gl2[m * 4 + 2] = clamp(Math.min(1.9 * c.ry, 2.6 * c.rx), 90, S.H * 0.56); gl2[m * 4 + 3] = c.ga; gc[m * 4] = c.g.cell[0]; gc[m * 4 + 1] = c.g.cell[1]; gc[m * 4 + 2] = RAD_CELL / 2048; gc[m * 4 + 3] = 2.7; }   // (read from the third level of the sheet: strokes as soft as brushed mist)
    }
    /** The heads. In the radical order every character that begins two words or more stands over its own words, in the
     * brush hand and the colour of the shared character, a little nearer than the nearest of them: the visible head
     * of its family, tied by a hairline to the nearest of its words in print. Characters that share a sound part are
     * neighbours on the ring, so their heads are neighbours too. A head is a door to its character. Far heads are
     * left out: out there their words are points of light. A head stands only while one of its own words is in print
     * beside it, and steps aside for a nearer head, for a name on the horizon and for one of his own words. Gold is
     * his own words and nothing else: a head is written in the look's ink; only its hairline is in the accent. */
    function drawHeads(a0) {
      const D = W.D, E = view.eye, f = view.fwd, r = view.right, u = view.up, F = S.F, d = S.dpr, mk = S.pal.mark, fr = W.frontList, fv = W.vis, fa = W.visAt, fnow = S.frame, ease = Math.min(1, dtSign * 9), top = S.H * 0.74, cand = headC; cand.length = 0;
      const gs = W.mOrder.groups, cAt = W.candAt, cX = W.candX, cY = W.candY, cS = W.candS, tx = S.pal.text; headCol[0] = lerp(tx[0], mk[0], 0.2); headCol[1] = lerp(tx[1], mk[1], 0.2); headCol[2] = lerp(tx[2], mk[2], 0.2);   // one hue, one meaning: gold is his own words; a head is the look's ink in the brush hand, warmed a fifth of the way, and only its hairline is in the accent
      for (const h of W.mOrder.heads) { if (h.bare >= 0 && !W.front[h.bare]) continue; const dx = h.x - E[0], dy = h.y - E[1], dz = h.z - E[2], z2 = dx * f[0] + dy * f[1] + dz * f[2]; if (z2 < 150 || z2 > 2400) continue;
        const g = gs[h.gi], lit = g.sgSeen === fnow && g.sg && g.sg.lit ? g.sg.lit.x : 0, sc = F / z2, size = Math.min(40, WS * 1.2 * sc) * (0.74 + 0.26 * lit) /* full size in the family the eye faces, three quarters elsewhere */; if (size < 11) continue; h.lit = lit; const x = S.px + (dx * r[0] + dy * r[1] + dz * r[2]) * sc; if (x < -30 || x > S.W + 30) continue; const y = S.py - (dx * u[0] + dy * u[1] + dz * u[2]) * sc; if (y < 34 || y > top) continue;
        const deck = 1 - smooth(0.245, 0.315, -dy / Math.sqrt(dx * dx + dy * dy + dz * dz)); if (deck < 0.05) continue; h.px = x; h.py = y; h.ps = size; h.pz = z2; h.pd = deck; cand.push(h); }
      cand.sort((p, q) => p.pz - q.pz);   // the nearest first: a head that would stand on a nearer head, on a sign or on one of his own words steps aside
      const put = [];
      for (const h of cand) { const x = h.px, y = h.py, size = h.ps, z2 = h.pz;
        const hy = h.a > 0.5 ? 5 : 0;   // a head that stands keeps standing until it is clearly covered: none comes and goes on the small float of a word
        let free = maskAt(x, y) > 0.45 && !put.some((o) => Math.abs(x - o.px) < (size + o.ps) * 0.56 + 4 - hy && Math.abs(y - o.py) < (size + o.ps) * 0.6 + 3 - hy) && !W.sHits.some((g) => Math.abs(x - g.x) < g.w / 2 + size * 0.6 + 5 - hy && y > g.y - g.s * 0.8 - size * 0.62 - 4 + hy && y < g.y + g.s * 0.8 + g.b + size * 0.62 + 4 - hy);
        if (free) for (const wi of fr) { if (cAt[wi] < fnow - 1) continue; if (Math.abs(x - cX[wi]) < size * 0.6 + W.len[wi] * cS[wi] * 0.52 + 22 - hy && Math.abs(y - cY[wi]) < size * 0.62 + cS[wi] * 0.62 + 6 - hy) { free = false; break; } }   // (one of his own words, where it stands: its float never decides a head)
        /* a head stands only where one of its own words stands clear of it, near enough to be printed. This is decided from where the words are (a frame ago), never from
         * how strongly one is printed just now: a head's own room must not be what hides the word it stands for (and such a word does not step back from its head: see drawField) */
        let stand = false; if (free) for (const wi of h.words) { if (cAt[wi] < fnow - 1 || W.front[wi] || cS[wi] < 7) continue; const ax = Math.abs(cX[wi] - x), ay = Math.abs(cY[wi] - y); if ((ax > size * 0.6 + W.len[wi] * cS[wi] * 0.52 + 3 - hy || ay > size * 0.6 + cS[wi] * 0.62 + 2 - hy) && ax * ax + ay * ay < (236 + 2 * hy) * (236 + 2 * hy)) { stand = true; break; } }
        if (!stand) free = false;
        /* the tie: to its nearest own word that is in print (where it was a frame ago) */
        let best = -1, bd = 240; if (free) for (const wi of h.words) { if (fa[wi] < fnow - 1 || W.front[wi]) continue; const o = wi * 5; if (fv[o + 3] < 0.3 || fv[o + 1] > band.y - 8) continue; const dd = Math.hypot(fv[o] - x, fv[o + 1] - y); if (dd < bd && dd > size * 0.7) { bd = dd; best = wi; } }   // (never to a word that is sinking into the mist)
        if (free) put.push(h); if (h.seen !== fnow - 1) h.a = 0; h.seen = fnow; h.a += ((free ? 1 : 0) - h.a) * ease; if (h.a < 0.03) continue;
        const hot = W.hoverKey === 'h:' + h.k, al = a0 * h.a * h.pd * (hot ? 1 : lerp(0.92, 0.5, smooth(800, 2300, z2)) * (0.78 + 0.22 * h.lit)) * smooth(11, 13.5, size), sp = spriteFor('hd' + h.k, D.kanji[h.k][0], 'k', size * d, null, 470 + size); if (!sp) continue;
        pushLabel(x, y + size * 0.015, size * 1.035, sp, 0, S.pal.c[0], 0.6 * al, mk, 0, 3.0); pushLabel(x, y, size, sp, 0, hot ? tx : headCol, al, mk, 0, 0);
        if (best >= 0) { const o = best * 5, wx = fv[o], wy = fv[o + 1], ddx = wx - x, ddy = wy - y, k0 = 1 / Math.max(Math.abs(ddx) / (size * 0.56 + 3), Math.abs(ddy) / (size * 0.62 + 3), 1e-6), k1 = 1 / Math.max(Math.abs(ddx) / (fv[o + 4] / 2 + 3), Math.abs(ddy) / (fv[o + 2] * 0.6 + 3), 1e-6); if (k0 + k1 < 0.92) pushLine(x + ddx * k0, y + ddy * k0, wx - ddx * k1, wy - ddy * k1, 0, 0.8, mk, 0.34 * al, 1); }
        W.hHits.push({ k: h.k, x, y, s: size, on: h.a > 0.5 }); }
    }
    const headC = [], headCol = [0, 0, 0];
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
      if (!W.ready || !W.layout[name] || name === W.lens) return;
      if (name === 'star') { if (tgt.ov > 0.5) setOver(false); if (!star.home) starHome(); cam.aTo = null; }
      else if (W.lens === 'star') { star.fly = null; cam.a += cam.yaw.x; tgt.yaw = 0; cam.yaw.x = 0; cam.yaw.v = 0; tgt.pitch = 0; vel.a = vel.yaw = vel.pitch = 0; if (star.far) { star.far = false; if (W.onOver) W.onOver(false); } }   // leaving the stars: the eye goes back to its circle, facing the way it faced
      W.prevLens = W.lens; W.lens = name; W.secCache = null; W.Pa.set(W.P); W.layout[name](W.Pb); placeFront(W.Pb); W.morph = { x: S.reduced ? 1 : 0, v: 0 }; W.morphAt = S.reduced ? S.t - 9 : S.t; if (S.reduced) W.P.set(W.Pb);
      /* choosing the order of reading turns the eye to the nearest article, so what he sees first is a group with its title */
      if (name === 'read' && W.rOrder) { const a = ((cam.a % TAU) + TAU) % TAU, rs = W.rOrder.restStart; if (rs > 1 && (a > rs - 0.5 || a < 0.5)) cam.aTo = a - rs < TAU - a && a > rs - 0.5 ? rs - 0.6 : 0.6; }
      /* choosing the radical groups turns the eye to the nearest large group: what he sees first is one whole family in the middle of the view, with its name under it */
      if (name === 'mean') { let best = null, bd = 9; for (const g of radicalOrder().groups) { if (g.span < 0.09) continue; const d = Math.abs(wrapA(g.mid - cam.a)); if (d < bd) { bd = d; best = g; } } if (best) faceGroup(best); }
      if (W.onLens) W.onLens(name);
    }
    api.setLens = setLens; W.setLens = setLens;

    /* ------------------------------------------------------------ the eye
     * a = where the eye stands on its circle; yaw and pitch = where it looks, from straight outward; offY, offZ =
     * how far it has risen and flown outward; ov = 0 inside the ring, 1 high above it looking down on the whole. */
    const tgt = { yaw: 0, pitch: 0, offY: 0, offZ: 0, ov: 0, phi: 0.60 }, vel = { a: 0, yaw: 0, pitch: 0 };
    const arrive = { x: S.reduced ? 0 : 1, v: 0 };   // the first seconds: the eye comes down and forward into the ring, once
    const awake = new Map();    // word index -> spring, for words that have been touched
    let hover = -1, hoverKind = '', grabbed = false, pullBack = 0; const openK = { x: 0, v: 0 }, famS = { x: 0, v: 0 };
    const pinch = { ids: new Map(), d0: 0 };
    const view = S.view = { eye: [0, 0, RE], fwd: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], over: 0 };
    W.cam = cam; W.tgt = tgt;
    W.famLift = () => (S.small ? 0.15 : 0.105);   // a whole family opened: the eye looks up this much, so the family stands in the sky above the horizon and the sea of clouds, not in them
    const wrapA = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
    S.update = (dt) => {
      const web = W.web, isOpen = !!(web && web.isOpen()), over = tgt.ov > 0.5, inStar = W.lens === 'star' && star.ok;
      if (S.reduced) { S.driftK.x = 0; S.driftK.v = 0; } else spring(S.driftK, isOpen || grabbed || over || W.kbFocus || inStar ? 0 : hover >= 0 ? 0.12 : 1, 3.2, dt);   // (the stars stand still until his hand moves them)
      if (W.fonts && arrive.x > 0.0005) spring(arrive, 0, 1.55, dt);
      /* a word or a character opened: the sky steps back (dim). A whole family opened: the sky stays as it is, lit, and the words fall back to points of light (famK) */
      const fam = isOpen && !!(web.famOpen && web.famOpen()); spring(S.dim, isOpen && !fam ? 1 : 0, 4.2, dt); spring(famS, fam ? 1 : 0, 4.2, dt); W.famK = famS.x < 0.004 ? 0 : famS.x; spring(openK, isOpen && !fam ? 1 : 0, 4.0, dt);
      if (!grabbed) { if (inStar) starOrbit(vel.a * dt); else cam.a += vel.a * dt; tgt.yaw += vel.yaw * dt; tgt.pitch += vel.pitch * dt; const f = Math.exp(-dt * (inStar ? 9 : 2.6)); vel.a *= f; vel.yaw *= f; vel.pitch *= f; if (inStar) { if (Math.abs(vel.a) < 2e-4) vel.a = 0; if (Math.abs(vel.pitch) < 2e-4) vel.pitch = 0; } }   // (among the stars a push glides on and comes to rest in under half a second)
      W.driftStep = (S.drift / RE) * S.driftK.x * dt; cam.a += W.driftStep; mine.turn += (S.drift / 420) * S.driftK.x * dt;
      if (cam.aTo != null) { const da = wrapA(cam.aTo - cam.a); cam.a += da * Math.min(1, dt * 3.4); if (Math.abs(da) < 0.002) cam.aTo = null; }
      tgt.pitch = inStar ? clamp(tgt.pitch, -0.5, 1.15) : clamp(tgt.pitch, -1.15, 0.95); tgt.offZ = clamp(tgt.offZ, -240, 2300); tgt.offY = clamp(tgt.offY, -240, 520);
      starStep(dt, inStar);
      spring(cam.yaw, tgt.yaw, 9, dt); spring(cam.pitch, tgt.pitch, inStar ? 30 : 9, dt); spring(cam.offY, tgt.offY, 6, dt); spring(cam.offZ, tgt.offZ, 5, dt); if (S.reduced) { cam.ov.x = tgt.ov; cam.ov.v = 0; } else spring(cam.ov, tgt.ov, 2.4, dt);
      const e = cam.ov.x <= 0 ? 0 : cam.ov.x >= 1 ? 1 : cam.ov.x * cam.ov.x * (3 - 2 * cam.ov.x), sa = Math.sin(cam.a), ca = Math.cos(cam.a);
      const rIn = RE + cam.offZ.x + openK.x * 90 - arrive.x * 230, px = S.parS.x.x, py = S.parS.y.x;
      const ex = sa * rIn + ca * px, ey = cam.offY.x + py + arrive.x * 170, ez = ca * rIn - sa * px;            // inside: on the circle, looking out
      spring(cam.phi, tgt.phi, 7, dt);
      const ok = Math.max(1, (5900 / (S.W / (2 * S.F))) / 12580) * (1 + 1.25 * S.foot / Math.max(1, S.H)), ph = cam.phi.x, tk = smooth(0.60, 1.30, ph), Dv = 12397 * ok * lerp(1, 1.70, tk), back = lerp(-222, 1040, tk) - Dv * Math.cos(ph), ox = sa * back, oy = Dv * Math.sin(ph), oz = ca * back;   // above: the eye circles the hub at the tilt the hand gave it; straighter down it stands farther off, so the whole wheel and its names still fit
      view.eye[0] = lerp(ex, ox, e); view.eye[1] = lerp(ey, oy, e); view.eye[2] = lerp(ez, oz, e); view.over = e;
      const yaw = cam.a + cam.yaw.x * (1 - e), pitch = lerp(lerp(cam.pitch.x - arrive.x * 0.055 * (1 - star.kk) + famS.x * W.famLift(), -cam.phi.x, e), Math.PI / 2, star.fzS * star.kk), sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
      view.fwd[0] = sy * cp; view.fwd[1] = sp; view.fwd[2] = cy * cp; view.right[0] = cy; view.right[1] = 0; view.right[2] = -sy; view.up[0] = -sy * sp; view.up[1] = cp; view.up[2] = -cy * sp;
      if (star.kk > 0) { const k = star.kk, sE = star.E;   // among the stars the eye stands where his hand has carried it (the pointer still shifts it a little: the near layer of stars passes the deeper one)
        const pk = clamp((STAR_R - (sE[0].x * sy + sE[2].x * cy)) / 2720, 0.06, 2.6) * lerp(2.2, 1, clamp(star.selS.x, 0, 1)), qx = px * pk, qy = py * pk; W.sway = [qx, qy];   // (2.2: the pointer carries the eye far enough for the layers of the sky to part plainly, see LENS; with a star touched it carries it as little as before, so the touched star stays in the middle)   // (in proportion to how far off the wall of stars is: the wall shifts by the same few px at every distance, and what the pointer rests on stays under it while the eye comes nearer)
        const zk = 1 - star.fzS;   // (the farthest view: the eye stands at the hub and looks straight up, and the whole ring of constellations lies round the zenith)
        view.eye[0] = lerp(view.eye[0], sE[0].x * zk + view.right[0] * qx + view.up[0] * qy, k); view.eye[1] = lerp(view.eye[1], lerp(12 * star.u, sE[1].x, zk) + view.up[1] * qy, k); view.eye[2] = lerp(view.eye[2], sE[2].x * zk + view.right[2] * qx + view.up[2] * qy, k); }
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
    function resetView() { if (W.lens === 'star' && star.ok) { W.starLetGo(); const a = cam.a + cam.yaw.x, re = STAR_R - star.u * S.F / HOME_U; starFlyTo([re * Math.sin(a), 12 * star.u, re * Math.cos(a)], a, 0.02, Math.log(S.F)); return; }   // among the stars: back to the resting distance, level, facing the way he faces
      tgt.yaw = 0; tgt.pitch = 0; tgt.offY = 0; tgt.offZ = 0; tgt.ov = 0; vel.a = vel.yaw = vel.pitch = 0; }
    function setOver(on) { if (W.lens === 'star' && star.ok && tgt.ov < 0.5) { starFar(!!on); return; }   // among the stars the far view is the whole ring of constellations
      tgt.ov = on ? 1 : 0; tgt.yaw = 0; tgt.pitch = 0; tgt.offY = 0; tgt.offZ = 0; if (on) { tgt.phi = 0.60; cam.phi.x = 0.60; cam.phi.v = 0; } vel.a = vel.yaw = vel.pitch = 0; if (on && W.web && W.web.isOpen()) W.web.close(); pullBack = 0; if (W.onOver) W.onOver(!!on); }
    api.overview = setOver; api.resetView = resetView; W.setOver = setOver; W.resetView = resetView;
    W.lookUp = () => { if (tgt.ov > 0.5) setOver(false); if (W.web && W.web.isOpen()) W.web.close(); tgt.pitch = tgt.pitch > 0.45 ? 0 : 0.66; vel.pitch = 0; };

    /** Where word i is on screen right now (CSS px), or null if it is behind the eye. */
    function project(i) {
      const E = view.eye, o = i * 3, dx = W.P[o] - E[0], dy = W.P[o + 1] - E[1], dz = W.P[o + 2] - E[2], f = view.fwd, r = view.right, u = view.up;
      if (star.kk > 0.5) { let k0 = -1; for (const k of W.D.words[i][4]) if (star.con[k] >= 0) { k0 = k; break; } if (k0 < 0 || !sproj(star.P, k0 * 3, sp3)) return null; { const c = star.cons[star.con[k0]]; if (c.ok) lpt(c, sp3, layOf(k0)); } return { x: sp3[0], y: sp3[1], sc: sp3[2], z2: S.Fz / sp3[2], size: WS * sp3[2] }; }   // among the stars a word is at its first star
      const z2 = dx * f[0] + dy * f[1] + dz * f[2]; if (z2 < 40) return null; const sc = S.F / z2;
      return { x: S.px + (dx * r[0] + dy * r[1] + dz * r[2]) * sc, y: S.py - (dx * u[0] + dy * u[1] + dz * u[2]) * sc, sc, z2, size: WS * sc };
    }
    W.project = project; W.WS = WS; W.awake = awake; W.wrapX = wrapX; W.fieldAlpha = () => base.alpha.x;

    /* ------------------------------------------------------------ the field */
    const hits = []; W.hits = hits;
    /* tidy sky: a word that would sit on top of a nearer word steps back, so no two words print over each other */
    const CW = 18, CH = 11; let occ = new Uint8Array(1), oc = 0, orw = 0, occH = new Int16Array(1), hOf = new Int16Array(1);
    let cI = new Int32Array(1), cX = new Float32Array(1), cY = new Float32Array(1), cS = new Float32Array(1), cZ = new Float32Array(1), cD = new Float32Array(1), cR = new Float32Array(1), cP = new Float32Array(1), ord = [];
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
      if ((W.lens === 'read' || W.lens === 'mean') && W.sHits) for (const h of W.sHits) { const c0 = Math.max(0, ((h.x - h.w / 2 - 10) / CW) | 0), c1 = Math.min(cols - 1, ((h.x + h.w / 2 + 10) / CW) | 0), r0 = Math.max(0, ((h.y - h.s * 0.7 - 10) / CH) | 0), r1 = Math.min(rows - 1, ((h.y + h.s * 1.0 + 10 + (h.b || 0)) / CH) | 0); for (let rr = r0; rr <= r1; rr += 1) for (let cc = c0; cc <= c1; cc += 1) occ[rr * cols + cc] = 2; }   // a title keeps its room: far words step back from it
      const isMean = W.lens === 'mean' && !!W.mOrder && !!W.hHits, homeK = isMean ? W.mOrder.homeK : null, rOf = isMean ? W.mOrder.realmOf : null, litG = isMean ? W.mOrder.litG : null, famK = W.famK || 0, famG = isMean && W.famG != null ? W.famG : -1;
      const kb = W.ovBoxes || [], inKeep = (x, y) => { for (let q = 0; q < kb.length; q += 1) if (Math.abs(x - kb[q][0]) < kb[q][2] && Math.abs(y - kb[q][1]) < kb[q][3]) return true; return false; };   // from above, in the radical order: the names of the levels, which no point of light may cover
      if (isMean) { if (occH.length !== occ.length) occH = new Int16Array(occ.length); else occH.fill(0); if (hOf.length < W.nk) hOf = new Int16Array(W.nk);   // a head keeps its room too; its cells remember whose they are, so a word of its own that stands clear of its glyph need not step back from it
        W.hHits.forEach((h, q) => { hOf[h.k] = q + 1; const c0 = Math.max(0, ((h.x - h.s * 0.6 - 3) / CW) | 0), c1 = Math.min(cols - 1, ((h.x + h.s * 0.6 + 3) / CW) | 0), r0 = Math.max(0, ((h.y - h.s * 0.6) / CH) | 0), r1 = Math.min(rows - 1, ((h.y + h.s * 0.6) / CH) | 0); for (let rr = r0; rr <= r1; rr += 1) for (let cc = c0; cc <= c1; cc += 1) { const o2 = rr * cols + cc; if (occ[o2] === 0) { occ[o2] = 2; occH[o2] = q + 1; } } }); }
      if (cI.length < n) { cI = new Int32Array(n); cX = new Float32Array(n); cY = new Float32Array(n); cS = new Float32Array(n); cZ = new Float32Array(n); cD = new Float32Array(n); cR = new Float32Array(n); cP = new Float32Array(n); W.clr = new Float32Array(n).fill(1); W.hid = new Uint8Array(n); }
      const clr = W.clr, hid = W.hid, ease = Math.min(1, dt * 10);
      /* giant characters, far beyond the ring: tone on tone */
      const mph = W.morph ? Math.min(1, W.morph.x) : 1, giantsOf = (lens) => (lens === 'form' ? ghost.list : lens === 'sound' ? ghost.kana : [])   /* (the radical order has no giants of this kind: there the sky itself writes each family's radical in light, see lightFamilies) */;
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
          const l = W.lvl[i], isF = W.front[i] === 1, k = 1 - smooth(5.2, 7, size), a = Math.min(0.80, (isF ? 0.95 : PT_A[l]) * lerp(1, 0.5, smooth(4000, 16000, z2)) * (1 + 0.55 * over)) * k * deck * fieldA * (1 - 0.8 * dim) * (famK > 0 && !isF && !(famG >= 0 && rOf[i] === famG) ? 1 - 0.45 * famK : 1);   // (a whole family opened: the points of other families step back a little)
          if (a > 0.02 && !(kb.length && inKeep(x, y))) { const w2 = PT_C[l]; ptc[0] = tc[0] + (tf[0] - tc[0]) * w2; ptc[1] = tc[1] + (tf[1] - tc[1]) * w2; ptc[2] = tc[2] + (tf[2] - tc[2]) * w2; pushLabel(x, y, (isF ? 3.6 : PT_S[l]) * lerp(1, 0.72, smooth(4000, 16000, z2)) * (1 + 0.30 * over) * lerp(1, W.overScale || 1, over), null, 0, isF ? mk : ptc, a, mk, 0, 0, DOT); }
          if (size < 5.2) continue;
        }
        W.candAt[i] = S.frame; W.candX[i] = x; W.candY[i] = y; W.candS[i] = size;   // near enough to be printed: where it stands, for the heads (before its float, so that a head's standing never rides on it)
        if (famK > 0.01 && size >= 7) {   // a whole family opened: every word falls back to a point of light, the family's own a little brighter, his own in their gold
          const l = W.lvl[i], isF = W.front[i] === 1, own = famG >= 0 && rOf[i] === famG, a = Math.min(0.9, isF ? 0.95 : PT_A[l] * (own ? 1.3 : 0.62)) * famK * deck * fieldA;
          if (a > 0.02) { const w2 = PT_C[l]; ptc[0] = tc[0] + (tf[0] - tc[0]) * w2; ptc[1] = tc[1] + (tf[1] - tc[1]) * w2; ptc[2] = tc[2] + (tf[2] - tc[2]) * w2; pushLabel(x, y, (isF ? 3.6 : PT_S[l]) * (own ? 1.2 : 1), null, 0, isF ? mk : ptc, a, mk, 0, 0, DOT); }
          if (famK > 0.985) continue; }
        if (!S.reduced) y += Math.sin(tNow * (0.55 + (i % 7) * 0.045) + i * 1.7) * size * 0.055;   // each word floats a little on its own
        cI[nc] = i; cX[nc] = x; cY[nc] = y; cS[nc] = size; cZ[nc] = z2; cD[nc] = deck; cR[nc] = Math.sqrt(dx * dx + dy * dy + dz * dz); cP[nc] = isMean && W.front[i] !== 1 ? z2 * (1 - 0.42 * litG[rOf[i]]) : z2; nc += 1;   // (cP: the order in which words claim their room: nearest first; in the radical order the words of the family the eye faces come before nearer words of its neighbours)
      }
      ord.length = nc; for (let q = 0; q < nc; q += 1) ord[q] = q; ord.sort((a, b) => cP[a] - cP[b]);
      /* pass 1, near to far: claim room */
      for (let q = 0; q < nc; q += 1) {
        const c = ord[q], i = cI[c], x = cX[c], y = isMean ? W.candY[i] : cY[c] /* (the radical order: room is claimed where a word stands, not where its small float has carried it, so no word yields and returns by itself) */, size = cS[c], isF = W.front[i] === 1, len = W.len[i], nearK = cZ[c] < 350 ? 0.22 * size : 0, hw = len * size * 0.52 + (isF ? 10 : 3) + nearK, hh = size * 0.62 + (isF ? 6 : 2) + nearK * 0.5;
        const c0 = Math.max(0, ((x - hw) / CW) | 0), c1 = Math.min(cols - 1, ((x + hw) / CW) | 0), r0 = Math.max(0, ((y - hh) / CH) | 0), r1 = Math.min(rows - 1, ((y + hh) / CH) | 0);
        let hq = 0; if (isMean && !isF) { const q2 = hOf[homeK[i]]; if (q2) { const H = W.hHits[q2 - 1], m = hid[i] ? 2 : -3; if (Math.abs(x - H.x) > H.s * 0.6 + hw + m || Math.abs(y - H.y) > H.s * 0.6 + hh + m) hq = q2; } }   // a word that stands clear of its own head's glyph does not count that head's room (the coarse cells would otherwise hide the very word the head stands for)
        let hit = 0, tot = 0, h4 = 0; for (let rr = r0; rr <= r1; rr += 1) { const ro = rr * cols; for (let cc = c0; cc <= c1; cc += 1) { tot += 1; const v = occ[ro + cc]; if (v === 4) h4 += 1; if (v === 1 || v === 3 || v === 4 || (v === 2 && !isF && !(hq && occH[ro + cc] === hq))) hit += 1; } }
        const ratio = tot === 0 ? 0 : hit / tot, free = h4 < 2 && (awake.has(i) || (hid[i] ? ratio < 0.03 : ratio < 0.20)); hid[i] = free ? 0 : 1;
        if (free) for (let rr = r0; rr <= r1; rr += 1) { const ro = rr * cols; for (let cc = c0; cc <= c1; cc += 1) if (occ[ro + cc] !== 4) occ[ro + cc] = 1; }
        clr[i] += ((free ? 1 : 0) - clr[i]) * ease;
        /* the radical groups: a word that has no room is a point of light where it stands, not a gap: the family's far words are its stars, and resolve into writing as the eye flies in */
        if (isMean && !isF && clr[i] < 0.96 && size >= 7 && famK < 0.5 && occ[Math.min(rows - 1, Math.max(0, (y / CH) | 0)) * cols + Math.min(cols - 1, Math.max(0, (x / CW) | 0))] === 0) { const l = W.lvl[i], a = (1 - clr[i]) * PT_A[l] * cD[c] * fieldA * (1 - 0.8 * dim) * (1 - famK);
          if (a > 0.02) { const w2 = PT_C[l]; ptc[0] = tc[0] + (tf[0] - tc[0]) * w2; ptc[1] = tc[1] + (tf[1] - tc[1]) * w2; ptc[2] = tc[2] + (tf[2] - tc[2]) * w2; pushLabel(x, y, PT_S[l], null, 0, ptc, a, mk, 0, 0, DOT); } }
      }
      if (isMean) for (const h of W.hHits) hOf[h.k] = 0;
      const tr = W.morphAt != null ? 1 - smooth(1.9, 2.5, S.t - W.morphAt) : 0;   // 1 while the sky is re-forming: nothing passes blurred, and a word that would pass very large steps back instead
      /* pass 2, far to near: print */
      for (let q = nc - 1; q >= 0; q -= 1) {
        const c = ord[q], i = cI[c]; if (clr[i] < 0.02) continue; const x = cX[c], y = cY[c], size = cS[c], z2 = cZ[c], isF = W.front[i] === 1;
        const rd = cR[c]; let a = (isF ? 1 : lerp(0.82, 0.27, smooth(700, 2900, z2)) * lerp(1, 0.5, smooth(3200, 8000, z2))) * smooth(90, 250, rd) * smooth(70, 150, z2) * cD[c] * smooth(-30, 26, y) * clr[i] * smooth(5.2, 7, size);
        if (isMean && !isF) a = Math.min(1, a * (0.84 + 0.40 * litG[rOf[i]]));   // light carries the families: the words of the family the eye faces are the brightest in the sky
        const far = smooth(700, 2600, z2); let blur = (1 - tr) * (2.6 * (1 - smooth(110, 290, rd)) + (isF ? 0 : 0.30 * far));   // (a word on its way to a new place is never blurred)
        a *= 1 - tr * smooth(40, 58, size);   // (the sides and the buttons are a mask in the shader now: a word slides under it, see FS_LAB)
        const aw = awake.get(i), wk = aw ? aw.x : 0, kin = kinSet && kinSet.has(i) ? kinK : 0, lit = Math.max(wk, kin);
        a *= fieldA * (1 - 0.88 * dim * (1 - wk)) * (1 - famK); blur += 2.3 * dim; if (a < 0.02) continue;
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
      const over = view.over; W.overHot = -1; W.ovBoxes = W.ovBoxes || []; W.ovBoxes.length = 0; if (over < 0.03) return; const E = view.eye, f = view.fwd, r = view.right, u = view.up, col = S.pal.line, a0 = over * base.alpha.x, N = 144;
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
      let hotI = -1; if (hot && secs.length) { let bd = 9; secs.forEach((sc2, q) => { let inside; if (sc2.span != null) inside = (((hot.th - sc2.th0) % TAU) + TAU) % TAU < sc2.span + 0.003 ? 0 : 9; else if (sc2.th0 != null) { const nx = secs[q + 1] && secs[q + 1].th0 != null ? secs[q + 1].th0 : TAU; const t = ((hot.th % TAU) + TAU) % TAU; inside = t >= sc2.th0 && t < nx ? 0 : 9; } else inside = Math.abs(wrapA(hot.th - sc2.th)); if (inside < bd && inside < 0.22) { bd = inside; hotI = q; } }); }
      W.overHot = hotI;
      for (const sc2 of secs) { if (sc2.small) radial(sc2.th0, R_OUT, R_OUT + 95, 0.7, 0.42 * sa);   // a small group: a short tick on the rim where it begins
        else if (sc2.th0 != null) { radial(sc2.th0, R_OUT, R_OUT + 230, 0.9, 0.55 * sa); radial(sc2.th0, R_IN, R_OUT, 0.6, 0.11 * sa); } else { radial(sc2.th, R_OUT, R_OUT + 150, 0.8, 0.45 * sa); radial(sc2.th, R_IN, R_OUT, 0.6, 0.08 * sa); } }
      const realms = W.lens === 'mean' && W.mOrder ? W.mOrder.realms.filter((rm) => rm.th0 != null) : null;
      if (realms) for (const rm of realms) radial(rm.th0, R_IN - 330, R_OUT + 95, 1.1, 0.46 * sa);   // a realm begins: one stronger line from inside the hub to the rim
      { const pl = prj(R_IN * Math.sin(cam.a + Math.PI / 2), R_IN * Math.cos(cam.a + Math.PI / 2)), pr2 = prj(R_IN * Math.sin(cam.a - Math.PI / 2), R_IN * Math.cos(cam.a - Math.PI / 2)); W.overScale = clamp((pl && pr2 ? Math.abs(pl[0] - pr2[0]) : 600) / 620, 0.42, 1); }
      W.rimHits = W.rimHits || []; W.rimHits.length = 0;
      if (over > 0.5 && W.fonts) { const an = (over - 0.5) * 2 * smooth(0.55, 1, mph), shown = [], focI = W.overFocus != null && W.overFocus >= 0 ? secs.findIndex((s) => s.gi === W.overFocus) : -1, eyeI = realms ? secs.findIndex((s) => (((cam.a - s.th0) % TAU) + TAU) % TAU < s.span + 0.003) : -1, first = (q) => (q === hotI || q === focI ? 2 : q === eyeI ? 1 : 0), /* (the radical groups: the group the eye stands at is always named, so turning the wheel names every group in its turn) */ order = secs.map((sc2, q) => q).sort((x, y) => first(y) - first(x) || secs[y].w - secs[x].w);
        for (const q of order) { const sc2 = secs[q], pa = prj((R_OUT + 95) * Math.sin(sc2.th), (R_OUT + 95) * Math.cos(sc2.th)), pb = prj((R_OUT + 900) * Math.sin(sc2.th), (R_OUT + 900) * Math.cos(sc2.th)); if (!pa || !pb) continue; const isHot = q === hotI || q === focI, sm = !!sc2.small && !isHot, size = sm ? 13.5 : isHot ? 25 : 21, sub = sm ? '' : sc2.sub, subW = sub ? Array.from(sub).length * 6.2 : 0, hw = Math.max(size * 0.62, subW / 2) + (sm ? 3 : 7), hh = size * 0.6 + (sub ? 17 : sm ? 2 : 4);   // a small group: its radical alone, small; touched or reached by the keyboard it is named in full like the others
          let ux = pb[0] - pa[0], uy = pb[1] - pa[1]; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul; const off = (sm ? 9 + sc2.tier * 17 : 16) + Math.abs(ux) * hw + Math.abs(uy) * hh, p1 = [pa[0] + ux * off, pa[1] + uy * off - (sub ? 6 : 0)];   // clear of the rim by 16 px on the screen, whichever way the rim runs there (small names stand in three rows, so neighbours do not touch)
          if (p1[0] < hw + 6 || p1[0] > S.W - hw - 56 || p1[1] < 58 || p1[1] > S.H - hh - S.foot - 4) continue; if (shown.some((o) => Math.abs(p1[0] - o[0]) < hw + o[2] && Math.abs(p1[1] - o[1]) < hh + o[3])) continue; shown.push([p1[0], p1[1], hw, hh]);
          const sp = spriteFor('sec' + sc2.name, sc2.name, sc2.nameFont || 'k', size * S.dpr, null, 950, true); if (sp) pushLabel(p1[0], p1[1], size, sp, 0, S.pal.mark, (isHot ? 1 : sm ? 0.8 : 0.9) * an * a0, S.pal.mark, 0, 0, null, true);
          if (sub) { const sp2 = spriteFor('secs' + sub, sub, sc2.subFont || 'w', 11.5 * S.dpr, null, 940, true); if (sp2) pushLabel(p1[0], p1[1] + size * 0.6 + 9, 11.5, sp2, 0, S.pal.text, (isHot ? 0.95 : 0.66) * an * a0, S.pal.mark, 0, 0, null, true); }
          if (sc2.g && an > 0.5) { const bx = { gi: sc2.gi, x: p1[0], y: p1[1] + (sub ? 8 : 0), w: 2 * hw, h: 2 * hh + (sub ? 4 : 6), f: S.frame }; sc2.g.box = bx; if (!sc2.g.none) W.rimHits.push(bx); }   // the name of a radical group on the rim is a door to its whole family
          else if (sc2.ki != null && an > 0.5 && star.ok && star.con[sc2.ki] >= 0) W.rimHits.push({ ki: sc2.ki, x: p1[0], y: p1[1] + (sub ? 8 : 0), w: 2 * hw, h: 2 * hh + (sub ? 4 : 6), f: S.frame }); } }   // a character on the rim is a door to its star: the touch arrives at that character, in the order of the stars
      const onName = pt.inside && !pt.down ? W.rimHits.find((b) => Math.abs(pt.x - b.x) <= b.w / 2 + 4 && Math.abs(pt.y - b.y) <= b.h / 2 + 4) : null; W.rimHot = onName && onName.gi != null ? onName.gi : -1;
      if (onName) pushLine(onName.x - onName.w / 2 + 3, onName.y + onName.h / 2 + 1, onName.x + onName.w / 2 - 3, onName.y + onName.h / 2 + 1, 0, 1.2, S.pal.mark, 0.9 * a0, 1);   // the pointer on a group's name: the name is underlined, a touch opens its whole family (the ring itself is where to come down)
      else if (hot) { let p0 = null; for (let q = 0; q <= 28; q += 1) { const t = q / 28 * TAU, p1 = prj(hot.x + 170 * Math.sin(t), hot.z + 170 * Math.cos(t)); if (p1 && p0) pushLine(p0[0], p0[1], p1[0], p1[1], 0, 1.1, S.pal.mark, 0.9 * a0, 1); p0 = p1; } }
      /* here the eye stood, and this is the wedge of the ring it was looking at */
      { const a = cam.a, ex = RE * Math.sin(a), ez = RE * Math.cos(a), p0 = prj(ex, ez); if (p0) { pushLabel(p0[0], p0[1], 4.6, null, 0, S.pal.cord, Math.min(1, 1.1 * a0), S.pal.cord, 0, 0, DOT);
          const half = Math.atan(S.W / (2 * S.F)); for (const sg of [-1, 1]) { const dir = a + sg * half, dx = Math.sin(dir), dz = Math.cos(dir), bq = ex * dx + ez * dz, t = -bq + Math.sqrt(Math.max(0, bq * bq - (RE * RE - R_OUT * R_OUT))), p1 = prj(ex + dx * t, ez + dz * t); if (p1) pushLine(p0[0], p0[1], p1[0], p1[1], 0, 0.9, S.pal.cord, 0.46 * a0, 1); } } }
      const innerW0 = () => { const pl = prj(R_IN * Math.sin(cam.a + Math.PI / 2), R_IN * Math.cos(cam.a + Math.PI / 2)), pr2 = prj(R_IN * Math.sin(cam.a - Math.PI / 2), R_IN * Math.cos(cam.a - Math.PI / 2)); return pl && pr2 ? Math.abs(pl[0] - pr2[0]) : 600; };
      /* the rings named, along the radius nearest the eye, like the scale of an instrument */
      if (over > 0.5 && W.fonts) { const names = [opt.lang === 'ja' ? 'あなたの言葉' : 'your words', 'N5', 'N4', 'N3', 'N2', 'N1'], th = cam.a + Math.PI, a = (over - 0.5) * 2;
        let lastY = -99; if (innerW0() > 300) names.forEach((name, q) => { const R = q === 0 ? RE - 560 : RE + (RINGS[q] + RINGS[q + 1]) / 2, tq = q === 0 ? cam.a : th, p1 = prj(R * Math.sin(tq), R * Math.cos(tq)); if (!p1) return; if (q > 0) { if (Math.abs(p1[1] - lastY) < 21) return; lastY = p1[1]; }   // a level's name is left out where the rings stand too close to carry it
          const size = q === 0 ? 12 : 13, sp = spriteFor('ring' + q, name, 'w', size * S.dpr, null, 900, true); if (sp) { pushLabel(p1[0], p1[1], size, sp, 0, q === 0 ? S.pal.mark : S.pal.text, 0.86 * a, S.pal.mark, 0, 0, null, true); if (q > 0 && W.lens === 'mean') W.ovBoxes.push([p1[0], p1[1], 21, 10]); } });   // (the radical order: the points of light keep clear of a level's name, see drawField)
        /* the hub is not a hole: the sign of the present order stands there, with one line that says what the order is */
        const pc = prj(0, 0), pl = prj(R_IN * Math.sin(cam.a + Math.PI / 2), R_IN * Math.cos(cam.a + Math.PI / 2)), pr2 = prj(R_IN * Math.sin(cam.a - Math.PI / 2), R_IN * Math.cos(cam.a - Math.PI / 2)), innerW = pl && pr2 ? Math.abs(pl[0] - pr2[0]) : 600;
        if (pc) { const g = { form: '形', sound: '音', read: '読', mean: '部' }[W.lens], size = clamp(innerW * 0.17, 22, 112), sp = spriteFor('hub' + g, g, 'k', size * S.dpr, null, 960, true); if (sp) { const gh = S.pal.ghost, tf2 = S.pal.textFar; hubc[0] = gh[0] + (tf2[0] - gh[0]) * 0.34; hubc[1] = gh[1] + (tf2[1] - gh[1]) * 0.34; hubc[2] = gh[2] + (tf2[2] - gh[2]) * 0.34; pushLabel(pc[0], pc[1] - size * 0.16, size, sp, 0, hubc, 0.85 * a * a0 * smooth(0.5, 1, mph), S.pal.mark, 0, 0, null, true); }   // the look's own tone, lifted a third toward its far text so it reads in the darkest looks
          const cap = W.lensCaption && innerW > 460 ? W.lensCaption(W.lens) : '', caps = cap ? (realms && W.hubLines ? W.hubLines(W.lens) : null) || [cap] : [];   // (the radical groups: two short lines, so the names of the realms have room beside them)
          caps.forEach((line, q) => { const sp2 = spriteFor('hubcap' + W.lens + q, line, 'w', 12.5 * S.dpr, null, 955, true); if (sp2) pushLabel(pc[0], pc[1] + size * 0.5 + 6 + q * 18, 12.5, sp2, 0, S.pal.mark, 0.86 * a * a0 * smooth(0.5, 1, mph), S.pal.mark, 0, 0, null, true); });
          /* the radical groups: the eight realms are named inside the ring, each beside its own stretch, so all eight can be read at once
           * however the wheel is turned. A name keeps clear of the sign at the hub, of the line under it and of the place the eye stood. */
          if (realms) { const ja = opt.lang === 'ja', named = innerW > 520, al = a * a0 * smooth(0.5, 1, mph), taken = [[pc[0], pc[1] - size * 0.16, size * 0.52, size * 0.56]];
            caps.forEach((line, q) => taken.push([pc[0], pc[1] + size * 0.5 + 6 + q * 18, wideOf(line, 12.5, 0.52) / 2 + 6, 8]));
            const hard = taken.slice(); hard[0] = [pc[0], pc[1] - size * 0.16, size * 0.46, size * 0.46]; { const pe = prj(RE * Math.sin(cam.a), RE * Math.cos(cam.a)), pw = prj((RE - 560) * Math.sin(cam.a), (RE - 560) * Math.cos(cam.a)), k = W.overScale || 1; if (pe) { taken.push([pe[0], pe[1], 66 * k, 30 * k]); hard.push([pe[0], pe[1], named ? 8 : 3, named ? 8 : 3]); } if (pw && innerW > 300) { taken.push([pw[0], pw[1], 52, 10]); hard.push([pw[0], pw[1], 52, 8]); } }   // (hard: what even a lone sign must keep clear of; the points of his own words round the place he stood are not among them)
            /* a name must also lie wholly inside the ring: each corner of its room, carried back to the ground, is nearer the hub than the innermost ring */
            const inside = (x, y) => { const d0 = f[0] * S.F + r[0] * (x - S.px) + u[0] * (S.py - y), d1 = f[1] * S.F + r[1] * (x - S.px) + u[1] * (S.py - y), d2 = f[2] * S.F + r[2] * (x - S.px) + u[2] * (S.py - y); if (d1 > -1e-3) return false; const t = -E[1] / d1; return Math.hypot(E[0] + d0 * t, E[2] + d2 * t) < R_IN - 90; };
            for (const rm of realms) { const nameW = named ? Array.from(rm.name).reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e7f ? 11.5 : 5.9), 0) : 0, lim = Math.max(0, rm.span / 2 - 0.03), tries = rm.at ? [rm.at] : [];
              for (const R of [R_IN - 600, R_IN - 900, R_IN - 1230]) for (let s = 0; s <= 10; s += 1) for (const sg of s ? [1, -1] : [1]) { const off = sg * s * 0.06; if (Math.abs(off) <= lim) tries.push([R, off]); }
              const seek = (hw, hh, list) => { for (const t of tries) { const p1 = prj(t[0] * Math.sin(rm.mid + t[1]), t[0] * Math.cos(rm.mid + t[1])); if (!p1) continue; if (!(inside(p1[0] - hw, p1[1] - hh) && inside(p1[0] + hw, p1[1] - hh) && inside(p1[0] - hw, p1[1] + hh) && inside(p1[0] + hw, p1[1] + hh))) continue; if (!list.some((o) => Math.abs(p1[0] - o[0]) < hw + o[2] + 6 && Math.abs(p1[1] - o[1]) < hh + o[3] + 6)) return [p1, t]; } return null; };
              /* its sign and its name. Where the name finds no room (a small chart; or the realm the eye stands in, when it is a narrow one),
               * its sign alone, set just inside the innermost ring beside its own stretch: that needs so little room that it is always found */
              const lh = named ? 8 : 7, lone = () => { for (let q = 0; q <= 2 * Math.floor(rm.span / 2 / 0.03); q += 1) { const th = rm.mid + (q % 2 ? 1 : -1) * Math.ceil(q / 2) * 0.03, pr = prj(R_IN * Math.sin(th), R_IN * Math.cos(th)); if (!pr) continue; const dx = pc[0] - pr[0], dy = pc[1] - pr[1], dl = Math.hypot(dx, dy) || 1, p1 = [pr[0] + dx / dl * (lh + (named ? 6 : 2)), pr[1] + dy / dl * (lh + (named ? 6 : 2))]; if (!hard.some((o) => Math.abs(p1[0] - o[0]) < lh + 1 + o[2] + 2 && Math.abs(p1[1] - o[1]) < lh + o[3] + 1)) return [p1, null]; } return null; };
              let got = named ? seek(Math.max(13, nameW / 2) + 5, 19, taken) : null; const whole = !!got; if (!got && !named) got = lone();   // (where the other realms carry their names, a realm whose name finds no room this turn of the wheel shows nothing rather than a bare sign: turning the wheel names it)
              rm.box = null; rm.at = whole ? got[1] : null; if (!got) continue; const put = got[0], hw = whole ? Math.max(13, nameW / 2) + 5 : lh + 1, hh = whole ? 19 : lh, ms = whole ? 19 : named ? 14 : 12.5; taken.push([put[0], put[1], hw, hh]); hard.push([put[0], put[1], hw, hh]);   // (a name stays where it stood last frame for as long as that place is free: it does not hop while the wheel turns)
              const sp3 = spriteFor('realm' + rm.mark, rm.mark, 'k', ms * S.dpr, null, 952, true); if (sp3) pushLabel(put[0], put[1] - (whole ? 8 : 0), ms, sp3, 0, S.pal.mark, 0.96 * al, S.pal.mark, 0, 0, null, true);
              if (whole) { const sp4 = spriteFor('realmN' + rm.i, rm.name, ja ? 'w' : 'e', 11.5 * S.dpr, null, 951, true); if (sp4) pushLabel(put[0], put[1] + 12, 11.5, sp4, 0, S.pal.text, 0.84 * al, S.pal.mark, 0, 0, null, true); }
              rm.box = { x: put[0], y: put[1], w: 2 * hw, h: 2 * hh, f: S.frame }; } } } }
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
      const g = W.gram; W.gHits.length = 0; if (!g || !g.length || !W.fonts) return; const f = view.fwd, r = view.right, u = view.up, a0 = base.alpha.x * (1 - view.over) * (1 - 0.85 * S.dim.x) * (1 - (W.famK || 0)); if (a0 < 0.02) return;   // (a whole family opened: the eye looks up a little, and the grammar overhead steps back for the family)
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
    const thrC = new Float32Array(5 * 4000);   // the ties found in one frame of the radical order: alpha, x0, y0, x1, y1
    function drawThreads() {
      const pr = W.lens === 'sound' ? soundOrder().pairs : W.lens === 'mean' ? radicalOrder().pairs : W.lens === 'read' ? (W.rOrder ? W.rOrder.pairs : null) : W.pairs, f = S.frame, vis = W.vis, at = W.visAt, col = S.pal.line, dim = S.dim.x; W.thr = null; if (!pr || dim > 0.97 || (W.morph && W.morph.x < 1)) return; let n = 0;
      if (W.lens === 'mean') {   // the radical groups: every tie that can be drawn is found first; if there are more than a frame may carry, the faintest (the farthest words) are left out, never the ties of whichever group comes last in the list
        const CAP = 420, c = thrC; let m = 0;
        for (let q = 0; q < pr.length; q += 2) { const a = pr[q], b = pr[q + 1]; if (at[a] !== f || at[b] !== f || W.front[a] || W.front[b]) continue;
          const oa = a * 5, ob = b * 5, ax = vis[oa], ay = vis[oa + 1], bx = vis[ob], by = vis[ob + 1], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy); if (len < 24 || len > 260) continue;
          const al = Math.min(vis[oa + 3], vis[ob + 3]); if (al < 0.16) continue;
          const k0 = 1 / Math.max(Math.abs(dx) / (vis[oa + 4] / 2 + 3), Math.abs(dy) / (vis[oa + 2] * 0.6 + 3), 1e-6), k1 = 1 / Math.max(Math.abs(dx) / (vis[ob + 4] / 2 + 3), Math.abs(dy) / (vis[ob + 2] * 0.6 + 3), 1e-6); if (k0 + k1 >= 0.92) continue;
          if (m + 5 > c.length) break; c[m] = al; c[m + 1] = ax + dx * k0; c[m + 2] = ay + dy * k0; c[m + 3] = bx - dx * k1; c[m + 4] = by - dy * k1; m += 5; }
        let floor = 0; if (m / 5 > CAP) { const als = []; for (let q = 0; q < m; q += 5) als.push(c[q]); als.sort((x, y) => y - x); floor = als[CAP - 1]; }
        for (let q = 0; q < m && n < CAP; q += 5) { if (c[q] < floor) continue; pushLine(c[q + 1], c[q + 2], c[q + 3], c[q + 4], 0, 0.8, col, 0.22 * c[q] * (1 - dim) * base.alpha.x, 1); n += 1; }
        W.thr = { want: m / 5, drawn: n, cap: CAP }; return; }
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
      nLab = 0; nLin = 0; nKno = 0; nPts = 0; glowFrom = -1; W.lineCut = 0; W.labCut = 0;
      { const tb = S.toolsBox, away = !tb || !S.toolsEl || S.toolsEl.classList.contains('away'), k0 = W.toolsK == null ? (away ? 0 : 1) : W.toolsK; W.toolsK = k0 + ((away ? 0 : 1) - k0) * Math.min(1, dt * 7);   // the seals' room goes with the seals
        const list = (S.maskBoxes || []).slice(); if (tb && W.toolsK > 0.01) list.push([tb[0], tb[1], tb[2], tb[3], tb[4], W.toolsK]); S.mask = list; }
      let fieldCount = 0; const sk = star.kk;
      if (sk < 0.995) { const keep = base.alpha.x; base.alpha.x = keep * (1 - sk); dtSign = dt; drawRings(); drawGrammar(); drawSigns(); drawField(dt); fieldCount = nLab; drawThreads(); base.alpha.x = keep; }
      else { hits.length = 0; W.gHits.length = 0; if (W.sHits) W.sHits.length = 0; if (W.hHits) W.hHits.length = 0; if (W.rimHits) W.rimHits.length = 0; S.poolK.fill(0); S.glyphs.fill(0); W.faceG = -1; }   // among the stars the other orders are not drawn at all
      if (sk > 0.005) { buildStarStep(); drawStars(dt, sk * base.alpha.x); } else S.moonH = 0;
      if (W.drawPath) W.drawPath();
      if (W.drawWake) W.drawWake(dt);
      if (W.web) W.web.draw(dt);
      serveSprites();
      const rw = canvas.width, rh = canvas.height;
      if (nLin) { gl.useProgram(P.line.p); gl.uniform2f(P.line.u.uRes, rw, rh); gl.bindVertexArray(vaoLin); gl.bindBuffer(gl.ARRAY_BUFFER, bLin); gl.bufferSubData(gl.ARRAY_BUFFER, 0, lin.subarray(0, nLin * VSTR)); gl.drawArrays(gl.TRIANGLES, 0, nLin); }
      const nGlow = glowFrom >= 0 ? nPts - glowFrom : 0, nDust = nPts - nGlow;
      if (nPts) { gl.useProgram(P.pt.p); gl.uniform2f(P.pt.u.uRes, rw, rh); gl.bindVertexArray(vaoPt); gl.bindBuffer(gl.ARRAY_BUFFER, bPt); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pts.subarray(0, nPts * PSTR)); if (nDust) gl.drawArrays(gl.POINTS, 0, nDust); if (nGlow && !nKno) gl.drawArrays(gl.POINTS, nDust, nGlow); }   // the dust of the stars' order: over the lines, under every margin and everything written
      if (nLab || nKno) { const uu = P.lab.u; gl.useProgram(P.lab.p); gl.uniform2f(uu.uRes, rw, rh);
        gl.uniform3fv(uu.uMoon, S.moon.dir); gl.uniform1f(uu.uMoonR, S.moon.r); gl.uniform3fv(uu.uInk, S.pal.moonInk || S.pal.ink); gl.uniform3fv(uu.uFwd, view.fwd); gl.uniform3fv(uu.uRight, view.right); gl.uniform3fv(uu.uUp, view.up);
        gl.uniform2f(uu.uPP, S.px * S.dpr, S.py * S.dpr); gl.uniform1f(uu.uF, S.F * S.dpr); gl.uniform1f(uu.uResH, rh); gl.uniform1f(uu.uMoonOn, (1 - view.over) * (1 - S.dim.x) * (1 - (S.moonH || 0)) * (1 - star.kk));   // (among the stars nothing is written on the moon: the moon hides what is behind it, see moonK)
        { const d = S.dpr, bx = W.mBx || (W.mBx = new Float32Array(24)), br = W.mBr || (W.mBr = new Float32Array(6)), bk = W.mBk || (W.mBk = new Float32Array(6)), list = S.mask || []; bx.fill(0); br.fill(0); bk.fill(0);
          for (let q = 0; q < Math.min(6, list.length); q += 1) { const b = list[q]; bx[q * 4] = b[0] * d; bx[q * 4 + 1] = b[1] * d; bx[q * 4 + 2] = b[2] * d; bx[q * 4 + 3] = b[3] * d; br[q] = b[4] * d; bk[q] = b[5]; }
          gl.uniform4fv(uu.uBx, bx); gl.uniform1fv(uu.uBr, br); gl.uniform1fv(uu.uBk, bk); gl.uniform2f(uu.uEdgeM, 28 * d, (S.small ? 18 : 28) * d); gl.uniform1f(uu.uResW, rw); }
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tBase); gl.uniform1i(uu.uBase, 0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, near[0].tex); gl.uniform1i(uu.uNearA, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, near[1].tex); gl.uniform1i(uu.uNearB, 2); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tGhost); gl.uniform1i(uu.uGhost, 3);
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, tStar); gl.uniform1i(uu.uStarT, 4); gl.uniform1f(uu.uStereo, S.stereo); gl.uniform1f(uu.uFs, S.Fz * S.dpr);
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, S.skyTex || tStar); gl.uniform1i(uu.uSkyT, 5);
        gl.bindVertexArray(vaoLab); gl.bindBuffer(gl.ARRAY_BUFFER, bLab);
        if (nKno) { gl.bufferSubData(gl.ARRAY_BUFFER, 0, kno.subarray(0, nKno * LSTR)); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nKno);
          if (nGlow) { gl.useProgram(P.pt.p); gl.bindVertexArray(vaoPt); gl.drawArrays(gl.POINTS, nDust, nGlow); gl.useProgram(P.lab.p); gl.bindVertexArray(vaoLab); gl.bindBuffer(gl.ARRAY_BUFFER, bLab); } }   // (the river's milk lies over the margins of sky and under the writing)
        if (nLab) { gl.bufferSubData(gl.ARRAY_BUFFER, 0, lab.subarray(0, nLab * LSTR)); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nLab); } gl.activeTexture(gl.TEXTURE0); }
      W.stats = { labels: nLab, points: nPts, field: fieldCount, lines: (nLin / 6) | 0, sprites: sprites.size, lineCut: W.lineCut, labCut: W.labCut, threads: W.thr || null };
    };

    /* ------------------------------------------------------------ 星, the order of the stars
     * Stars are kanji, all of them. A constellation is a radical family: its figure is its radical, drawn through its
     * commonest kanji in writing order; the rarer kanji are field stars round it, deeper. Words are the lines between
     * stars. Every place, figure and list of words is read from sky-stars.json: this engine invents none of them.
     *   The band of the file is wrapped round the ring: x runs round it, y is height above the horizon, one unit is
     * the same length both ways. Figure stars stand on the wall of the ring (STAR_R from the hub); field stars stand
     * deeper, each by its own depth, so the two layers pass each other whenever the eye moves.
     *   The eye is free inside the ring: star.E (where it stands), the yaw and pitch of every order (where it looks)
     * and a wide-angle focal length (star.lf). Coming nearer is real travel toward what is under the pointer; only
     * past the far limit does the view widen instead. Nothing here appears or leaves by itself. */
    const HOME_U = 34;   // the resting distance: where one unit of the band is this many px (near enough that the words under the figure stars can be read at the first glance)
    const STAR_R = RE + 1500, STAR_DR = 620;   // (the field stars stand up to about 430 beyond the wall: enough for the two layers to pass each other when the eye moves, not so much that a family's field leaves its figure when the eye is near)
    const star = { ok: false, home: false, k: { x: 0, v: 0 }, kk: 0, orb: 0, lb: 0, U: 1, u: 1, P: null, mag: null, dep: null, con: null, role: null, pm: null, cons: [], words: null, order: [], realms: [],
      E: [{ x: 0, v: 0 }, { x: 700, v: 0 }, { x: 0, v: 0 }], Eto: [0, 700, 0], lf: { x: 7, v: 0 }, lfTo: 7, sel: -1, selA: 0, prev: null, lay: null, why: -1, glide: null, bandCi: -1, conOrder: [], fHits: [], word: -1, wordS: { x: 0, v: 0 }, moonS: { x: 0, v: 0 }, fz: { x: 0, v: 0 }, fzTo: 0, fzS: 0, stepA: 0.06, selS: { x: 0, v: 0 }, trail: [], face: -1, con1: -1, far: false,
      sx: null, sy: null, ss: null, cs: null, hits: [], nHits: [], wHits: [], oHits: [], fly: null, unit: 26, lines: 0 };
    W.star = star; W.figRed = true;   // the figure lines: fine vermilion (the sky's own seal red), as on the ceiling of the Kitora tomb; false = the sky's pale line colour. Judged live in 藍: red separates a figure from a word's gold line at once
    function setStars(J) {
      const nk = W.nk, U = TAU / J.unitsAround, u = STAR_R * U, ja = opt.lang === 'ja'; star.U = U; star.u = u;
      star.P = new Float32Array(nk * 3); star.mag = new Float32Array(nk); star.dep = new Float32Array(nk); star.con = new Int16Array(nk).fill(-1); star.role = new Uint8Array(nk); star.pm = new Int32Array(nk).fill(-9);
      const put = (x, y, dep, out, o) => { const R = STAR_R + Math.max(0, dep - 0.3) * STAR_DR, az = x * U; out[o] = R * Math.sin(az); out[o + 1] = (12 + (y - 12) * R / STAR_R) * u; out[o + 2] = R * Math.cos(az); };   // (a deeper star stands farther from the middle height of the band by the same measure, so from the hub, at that height, every layer lies where the file drew it)
      const rj = T.mulberry(9113); star.bx = new Float32Array(nk); star.by = new Float32Array(nk);
      J.stars.forEach((s, k) => { if (!s || k >= nk || !J.constellations[s[0]]) return; star.con[k] = s[0]; star.role[k] = s[1];
        const f = s[1] ? 1 : 0, bx = s[2] + (rj() - 0.5) * 0.7 * f, by = s[3] + (rj() - 0.5) * 0.7 * f, dep = s[1] ? Math.max(0.38, s[4] + (rj() - 0.5) * 0.3) : s[4];   // (a field star stands a little off the file's even rings, and at its own depth: the eye should not see a pattern, and the layers part when it moves. The figure stars stand exactly where the file puts them)
        star.bx[k] = bx; star.by[k] = by; put(bx, by, dep, star.P, k * 3); star.dep[k] = dep; star.mag[k] = s[5]; });
      star.cons = J.constellations.map((c) => { const C = [0, 0, 0], N = [0, 0, 0], N2 = [0, 0, 0]; put(c.at[0], c.at[1], 0.3, C, 0); put(c.at[0], c.at[1] - c.r - 0.6, 0.3, N, 0); put(c.at[0], c.at[1] + c.r + 0.9, 0.3, N2, 0);
        return { i: c.i, key: c.key, ch: c.fig || c.key, label: c.label || c.key, name: (ja ? c.nameJa : c.gloss) || '', realm: c.realm | 0, n: c.n, tier: c.tier || 4, r: c.r * u, C, N, N2, nUp: false, figR: 0, members: [], lit: { x: 0, v: 0 }, vis: false, na: 0, naAt: -9,
          fig: (c.figure || []).map((row) => { const pts = new Float32Array(row.length * 3); row.forEach((p, q) => put(p[0], p[1], 0.3, pts, q * 3)); return pts; }), figK: (c.figure || []).map((row) => Int32Array.from(row, (p) => (p[2] >= 0 && p[2] < nk ? p[2] : -1))) }; });
      for (let k = 0; k < nk; k += 1) { const c = star.cons[star.con[k]]; if (c) c.members.push(k); }
      star.conOrder = star.cons.slice().sort((p, q) => p.tier - q.tier || q.n - p.n || p.i - q.i);
      for (const c of star.cons) { c.members.sort((p, q) => star.role[p] - star.role[q] || star.mag[q] - star.mag[p] || p - q); c.figN = c.members.filter((k) => star.role[k] === 0).length; for (const pts of c.fig) for (let q = 0; q < pts.length; q += 3) c.figR = Math.max(c.figR, Math.hypot(pts[q] - c.C[0], pts[q + 1] - c.C[1], pts[q + 2] - c.C[2]));
        const az = Math.atan2(c.C[0], c.C[2]); c.w1 = TAU / (25 + 35 * rj()); c.w2 = TAU / (25 + 35 * rj()); c.p1 = az * 5 + (rj() - 0.5) * 1.2; c.p2 = az * 5 + 1.3 + (rj() - 0.5) * 1.2; c.fx = 0; c.fy = 0; }   // (how the family floats: periods of 25 to 60 s; its phase follows its place round the ring, with a little of its own)   // (a family's stars in the order of rank; how many of them stand on its figure)
      star.words = J.wordsOf || W.fam;
      W.readIn = J.readIn || null; W.glossFix = J.gloss || null;   // (lead, 2026-11-12: how each kanji is read in each word, and corrected glosses, for a true line under a touched word)
      star.order = Array.from({ length: nk }, (_, k) => k).filter((k) => star.con[k] >= 0).sort((a, b) => star.role[a] - star.role[b] || star.mag[b] - star.mag[a]);   // the order in which stars take their room: the figure stars first, then the field stars, the brightest first
      star.realms = (J.realms || []).map((r) => { const M = [0, 0, 0]; put((r.from + r.to) / 2, 45, 0.3, M, 0); return { i: r.i, name: ja && REALMS[r.i] ? REALMS[r.i].ja : r.name, ja: REALMS[r.i] ? REALMS[r.i].ja : r.name, en: REALMS[r.i] ? r.name : '', az: (r.from - 1.5) * U, M }; });   // (M: where a realm is named in the farthest view, well inside the ring, toward the zenith)
      /* Every word has a home: the kanji in whose list it stands earliest (a tie: the kanji that comes first in the word).
       * Round its home star the words stand in the order of that list, on a seed-head spiral: the commonest nearest the
       * star and nearest the eye, the rarer farther out and deeper. That field of lights is the whole language at rest. */
      { const D = W.D, n = W.n, best = new Int32Array(n).fill(1e9), home = new Int32Array(n).fill(-1), rnd = T.mulberry(7717);
        for (let k = 0; k < nk; k += 1) { if (star.con[k] < 0) continue; const l = star.words[k] || []; for (let r = 0; r < l.length; r += 1) { const wi = l[r]; if (r < best[wi] || (r === best[wi] && D.words[wi][4].indexOf(k) < D.words[wi][4].indexOf(home[wi]))) { best[wi] = r; home[wi] = k; } } }
        star.homed = Array.from({ length: nk }, () => []); for (let wi = 0; wi < n; wi += 1) if (home[wi] >= 0) star.homed[home[wi]].push(wi); for (const l of star.homed) l.sort((p, q) => best[p] - best[q] || p - q);
        star.wHome = home; star.wP = new Float32Array(n * 3); star.wC = new Float32Array(n); star.layMark = new Uint8Array(n); star.wph = new Float32Array(n * 2); star.ph = new Float32Array(nk * 2); star.dx = new Float32Array(nk); star.dy = new Float32Array(nk);
        for (let q = 0; q < n * 2; q += 1) star.wph[q] = rnd(); for (let q = 0; q < nk * 2; q += 1) star.ph[q] = rnd();
        for (let k = 0; k < nk; k += 1) { const l = star.homed[k], s = J.stars[k]; for (let j = 0; j < l.length; j += 1) { const wi = l[j], ang = j * 2.39996 + star.ph[k * 2] * TAU, rho = 0.5 + 0.36 * Math.sqrt(j + 0.6), lv = W.lvl[wi];
            put(star.bx[k] + rho * Math.cos(ang), star.by[k] + rho * Math.sin(ang) * 0.82, Math.min(1.3, star.dep[k] + 0.08 + 0.55 * j / (j + 5)), star.wP, wi * 3); star.wC[wi] = 0.6 * Math.max(0, 1 - j / 7) + 0.4 * (lv >= 1 ? lv / 5 : 0); } } }
      star.sx = new Float32Array(nk); star.sy = new Float32Array(nk); star.ss = new Float32Array(nk); star.cs = new Float32Array(nk); star.ca = new Float32Array(nk); star.caAt = new Int32Array(nk).fill(-9); star.capW = new Float32Array(nk); star.capAt = new Int32Array(nk).fill(-9); star.shown = new Int32Array(nk); star.nShown = 0; star.wa = new Float32Array(W.n); star.waAt = new Int32Array(W.n).fill(-9);
      /* depth. rf: how large a figure star is written beside the two commonest of its figure (they lead; the rest step down by rank, each a little off the step, so no two in a row are alike);
       * rn: how far out in its family a star stands (0 the middle, 1 the rim): the outer ones stay points longest, so a family has a body and a thinning tail;
       * on: whether a star's character (st.on) or a word (st.won) is written just now: a thing is written or it is a point, it never rests between;
       * NF: where a family's name stands, just under its figure, so it goes with the figure when the family comes forward. */
      star.rf = new Float32Array(nk).fill(1); star.rn = new Float32Array(nk); star.on = new Uint8Array(nk); star.won = new Uint8Array(W.n);
      for (const c of star.cons) { const J0 = J.constellations[c.i]; let q = 0, lo = 1e9, fx = 0, fn = 0; c.m = 1; c.n = 0; c.qx = 0; c.qy = 0; c.lx = 0; c.ly = 0; c.uc = 0; c.lead = 0; c.swx = 0; c.swy = 0; c.jx = 1; c.jy = 1; c.dmx = 0; c.dmy = 0; c.rc = 1; c.rs = 0; c.ok = false; c.nOn = 0; c.lw = 0; c.fall = 1; c.cool = 0;
        for (const k of c.members) { star.rn[k] = clamp(Math.hypot(star.bx[k] - J0.at[0], star.by[k] - J0.at[1]) / Math.max(1, J0.r), 0, 1); if (star.role[k] !== 0) continue; star.rf[k] = (q < 2 ? 1 : q < 5 ? 0.8 : q < 9 ? 0.65 : 0.52) * (0.95 + 0.1 * rj()); q += 1; lo = Math.min(lo, star.by[k]); fx += star.bx[k]; fn += 1; }
        for (const row of J0.figure || []) for (const p of row) lo = Math.min(lo, p[1]);
        c.NF = [0, 0, 0]; put(fn ? fx / fn : J0.at[0], (lo < 1e8 ? lo : J0.at[1]) - 1.45, 0.3, c.NF, 0); c.fq = [0, 0]; }
      /* the planes (see starLens): ld, how far a family leads (1 the one leader, by rank); md, how far it stands in the middle plane (the leader and the two next it).
       * A figure's strokes: sOn, sA: whether each is drawn just now, and how much of it; a stroke's two ends: which stand on a bare joint (they close on a point of light).
       * df: how far a field star stands from the nearest stroke of its family's figure, in units of the band (the field is graded by it as the eye comes nearer). */
      star.leadCi = -1; star.midA = -1; star.midB = -1; star.df = new Float32Array(nk);
      for (const c of star.cons) { const J0 = J.constellations[c.i], rows = J0.figure || []; c.ld = { x: 0, v: 0 }; c.md = { x: 0, v: 0 }; c.sOn = new Uint8Array(c.fig.length).fill(1); c.sA = new Float32Array(c.fig.length).fill(1); c.sAt = -9; c.pl = 0;
        for (const k of c.members) { if (star.role[k] === 0) continue; let best = 1e9; const px = star.bx[k], py = star.by[k];
          for (const row of rows) for (let q = 0; q + 1 < row.length; q += 1) { const ax = row[q][0], ay = row[q][1], bx = row[q + 1][0] - ax, by = row[q + 1][1] - ay, l2 = bx * bx + by * by || 1e-6, t = clamp(((px - ax) * bx + (py - ay) * by) / l2, 0, 1), d = Math.hypot(px - ax - bx * t, py - ay - by * t); if (d < best) best = d; }
          if (best > 1e8) for (const k2 of c.members) if (star.role[k2] === 0) best = Math.min(best, Math.hypot(px - star.bx[k2], py - star.by[k2]));
          star.df[k] = best > 1e8 ? 3 : best; } }
      /* what a word shows where it floats: its own text, cut at the first ';' of a row that lists two spellings; and a word that is nothing but its home kanji shows its reading in kana
       * there instead (体 からだ): a kanji is not repeated as its own word beneath itself, and the reading is what a learner needs. say: that text where it differs; wl: its length */
      { const D = W.D, cut = (s) => String(s || '').split(/[;；、(（]/)[0].trim(); star.say = new Array(W.n).fill(''); star.wl = new Uint8Array(W.n);
        for (let wi = 0; wi < W.n; wi += 1) { const t0 = D.words[wi][0], t1 = cut(t0) || t0, hk = star.wHome[wi], rd = cut(W.rd[wi] || D.words[wi][1]), tx = hk >= 0 && t1 === D.kanji[hk][0] && rd ? rd : t1; if (tx !== t0) star.say[wi] = tx; star.wl[wi] = Array.from(tx).length; } }
      star.put = put; star.ok = true;
    }
    /* ------------------------------------------------------------ 天の川, the river of kana
     * The words written only in kana (sky-kana.json: 500 of them, each with its place) are a river above the constellations, once
     * round the sky: hiragana on the lower bank, katakana on the upper. It is the far plane of the sky: a soft band of fine lights
     * (each word a light, with a little foam of nameless specks round it, which belong to the river and to no word); a word is
     * written where the river passes the middle of the view or the eye has come near. Places are the file's; none is invented for a word. */
    const river = { ok: false, n: 0, P: null, S: null, w: [], br: null, kind: null, on: null, a: null, aAt: null, ph: null, hits: [], sel: -1, names: [], x: null, y: null, nm: { a: 0, at: -9, on: 0 } };
    W.river = river;
    function setKana(K) {
      if (!K || !K.words || !star.ok) return; const n = K.words.length, rnd = T.mulberry(4177), lo = K.riverFrom || 24.2, hi = K.riverTo || 32; river.n = n; river.P = new Float32Array(n * 3); river.S = new Float32Array(n * 4 * 3); river.br = new Float32Array(n); river.kind = new Uint8Array(n); river.on = new Uint8Array(n); river.a = new Float32Array(n); river.aAt = new Int32Array(n).fill(-9); river.ph = new Float32Array(n * 2); river.x = new Float32Array(n); river.y = new Float32Array(n); river.sc = new Float32Array(n); river.len = new Uint8Array(n);
      river.w = K.words.map((w) => [w[0], w[1]]);
      K.words.forEach((w, i) => { star.put(w[5], w[6], 0.3 + 0.9 * w[7], river.P, i * 3); river.br[i] = w[8]; river.kind[i] = w[2] === 'k' ? 1 : 0; river.len[i] = Array.from(w[0]).length; river.ph[i * 2] = rnd(); river.ph[i * 2 + 1] = rnd();
        for (let q = 0; q < 4; q += 1) star.put(w[5] + (rnd() - 0.5) * 3.4, clamp(w[6] + (rnd() - 0.5) * 2.6, lo - 0.5, hi + 0.5), 0.5 + 0.9 * w[7] + 0.3 * rnd(), river.S, (i * 4 + q) * 3); });
      /* where the river is named: eight places round the sky, on its lower bank; only the one nearest the middle of the view is written, quietly */
      const ua = K.unitsAround || 431.363; for (let q = 0; q < 8; q += 1) { const M = [0, 0, 0]; star.put(1.5 + q * ua / 8, lo + 1.5, 0.75, M, 0); river.names.push(M); }
      river.ok = true;
    }
    /* the sheet of every kanji in the print face, cut once (a few rows a frame): the stars are written from it */
    const SA = { N: BASE_N, cell: BASE_N >= 4096 ? 64 : 44, row: 0, done: false }; SA.cols = Math.floor(SA.N / SA.cell); SA.px = Math.round(SA.cell * 0.72);
    const tStar = api.mkTex(SA.N, SA.N, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 3);
    function buildStarStep() {
      if (SA.done || !star.ok) return; const D = W.D, t0 = performance.now(), rows = Math.ceil(W.nk / SA.cols), w = SA.cols * SA.cell;
      while (SA.row < rows && performance.now() - t0 < 6) { sx2.globalCompositeOperation = 'source-over'; sx2.fillStyle = '#000'; sx2.fillRect(0, 0, w, SA.cell); sx2.fillStyle = '#fff'; sx2.font = FONT_W(SA.px); sx2.textBaseline = 'alphabetic'; sx2.textAlign = 'center';
        for (let c = 0; c < SA.cols; c += 1) { const k = SA.row * SA.cols + c; if (k < W.nk) sx2.fillText(D.kanji[k][0], c * SA.cell + SA.cell / 2, SA.cell * 0.5 + SA.px * 0.36); }
        sx2.textAlign = 'start'; const img = sx2.getImageData(0, 0, w, SA.cell).data, out = new Uint8Array(w * SA.cell); for (let q = 0, j = 0; q < out.length; q += 1, j += 4) out[q] = img[j];
        gl.bindTexture(gl.TEXTURE_2D, tStar); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, SA.row * SA.cell, w, SA.cell, gl.RED, gl.UNSIGNED_BYTE, out); SA.row += 1; }
      if (SA.row >= rows) { gl.bindTexture(gl.TEXTURE_2D, tStar); gl.generateMipmap(gl.TEXTURE_2D); SA.done = true; }
    }
    /** Where a point of the world is seen by the stars' wide-angle eye. out = [x, y, px to one unit of the world there]. */
    function sproj(P, o, out) {
      const E = view.eye, dx = P[o] - E[0], dy = P[o + 1] - E[1], dz = P[o + 2] - E[2], f = view.fwd, dist = Math.sqrt(dx * dx + dy * dy + dz * dz); if (dist < 30) return false; const c = (dx * f[0] + dy * f[1] + dz * f[2]) / dist; if (c < -0.4) return false;
      const k = 2 * S.Fz / (1 + c) / dist, r = view.right, u = view.up; out[0] = S.px + k * (dx * r[0] + dy * r[1] + dz * r[2]); out[1] = S.py - k * (dx * u[0] + dy * u[1] + dz * u[2]); out[2] = k; return true;
    }
    /** The direction the stars' eye sees at a place on the screen. */
    function sray(x, y, out) {
      const F2 = 2 * S.Fz, qx = (x - S.px) / F2, qy = (S.py - y) / F2, a = 1 - qx * qx - qy * qy, f = view.fwd, r = view.right, u = view.up, X = f[0] * a + (r[0] * qx + u[0] * qy) * 2, Y = f[1] * a + (r[1] * qx + u[1] * qy) * 2, Z = f[2] * a + (r[2] * qx + u[2] * qy) * 2, l = Math.hypot(X, Y, Z) || 1;
      out[0] = X / l; out[1] = Y / l; out[2] = Z / l; return out;
    }
    const hueC = Array.from({ length: 8 }, () => [1, 1, 1]), STC = { st: true, u: 0, v: 0 }, sp3 = [0, 0, 0], sp4 = [0, 0, 0], stc = [0, 0, 0], sv = [0, 0, 0], starCol = [0, 0, 0];
    /* ------------------------------------------------------------ depth: what the eye faces comes forward
     * The sky of the stars is deep. Each family is one body. The family that stands in the middle of the view comes
     * forward: it is larger (its stars stand farther apart and are written larger), in full light, and it passes the
     * hand faster; the families round it fall back, smaller, dimmer and cooler, down to a radical and a dust of points
     * at the edge of the view. How far forward a family stands (c.n: 1 in the middle, toward 0 at the edge) is read
     * from where its middle lies on the screen and from nothing else: it changes only while the eye moves, never with
     * time. A body is never bent: a figure keeps the shape of its radical at every depth.
     *   c.m: how many times larger the family is drawn than the file's measure; (c.lx, c.ly): where its middle is seen
     * (the middle of the view spreads, the edge closes up: a dome that swells toward the eye); c.jx, c.jy, c.dmx,
     * c.dmy: how fast that place and that size change as the sky turns (the hand uses them to hold what it touched).
     *   The depth goes when a star is touched (the touched star's own view is laid out flat, see starLayout), in the
     * farthest view, and little by little as the eye comes near on its own feet. LENS.K is how much of it is in force.
     *   Under the pointer the layers part (LENS.swx, swy: how far the wall of figure stars shifts for the pointer's
     * place, in px): a body that stands forward shifts more than the wall, one that has fallen back less, and inside
     * a body the figure shifts most, the field stars less the deeper they stand, the dust of words least. */
    const LENS = { K: 0, mN: 1, mF: 1, r0: 245, swx: 0, swy: 0, mx: 0, my: 0, mr: 0, mk: 1 };
    function starLens(dt) {
      const st = star, unit = st.unit, sm = S.small, K = LENS.K = (1 - clamp(st.selS.x, 0, 1)) * (1 - smooth(34, 170, unit)) * smooth(13, 30, unit) * (1 - st.fzS);
      const mN = LENS.mN = 1 + ((sm ? 1.5 : 2.0) - 1) * K, mF = LENS.mF = 1 - (1 - (sm ? 0.72 : 0.62)) * K, Dm = mN - mF, r0 = LENS.r0 = clamp(Math.min(S.W, 1.6 * (S.H - S.foot)) * 0.17, 104, 285), ir2 = 1 / (r0 * r0); st.lensK = K;
      { const sway = W.sway || [0, 0], kw = unit / st.u * K; LENS.swx = -sway[0] * kw; LENS.swy = sway[1] * kw; }
      const up = Math.max(K, st.fzS, 1 - smooth(8.5, 14, unit));
      /* where the moon is on the screen, and how large: the moon hides what is behind it */
      LENS.mr = 0; { const md = S.moon.dir, E = view.eye; stc[0] = E[0] + md[0] * 20000; stc[1] = E[1] + md[1] * 20000; stc[2] = E[2] + md[2] * 20000; if ((1 - view.over) > 0.5 && sproj(stc, 0, sp4) && sp4[0] > -300 && sp4[0] < S.W + 300 && sp4[1] > -300 && sp4[1] < S.H + 300) { LENS.mx = sp4[0]; LENS.my = sp4[1]; LENS.mr = S.moon.r * 20000 * sp4[2]; } }
      LENS.mk = 1 - clamp(st.moonS.x, 0, 1);
      /* Three planes, by rank and not by raw place. Near: ONE family leads, at full size: the one nearest the middle of the view that has a figure of four or more kanji and stands
       * on the stage (clear of the frame and of the moon); it keeps the lead until another is nearer by 60 px, so the choice never flickers. Middle: the two families next nearest
       * that have a figure stand at two thirds of the leader. Far: every other family, small, falling away toward the edge. Where a family stands on the screen is still read from
       * the turn of the eye alone (the dome that swells toward the eye); only its size goes by rank. A family changes plane only when the eye has carried it across a limit. */
      const mFull = sm ? 1.5 : 2.0, mM = Math.max(mF, 1 + (0.66 * mFull - 1) * K), mFm = mF   /* (the far plane is one depth: a far family does not change size as the sky turns, so nothing of it crosses a limit of writing until it changes plane) */, Wd = S.W, Hb = S.H - S.foot;
      let bestL = null, bL = 1e9; const kS = smooth(0.6, 0.95, K), seaL = st.seaY > 0 && K > 0.9 ? st.seaY : 1e9, sx0 = lerp(-0.7, 0.15, kS), sy0 = lerp(-0.7, 0.17, kS), sy1 = lerp(1.7, 0.79, kS);   // (the stage: at the resting distance well inside the frame and clear of the sea of clouds; as the eye comes near, a figure fills the view and its middle may stand far outside it: then how near a family is counts from the edge of its figure, see c.dq, and the stage is no limit)
      for (const c of st.cons) { if (!sproj(c.C, 0, sp3)) { c.ok = false; c.m = 1; c.n = 0; c.lead = 0; c.rc = 1; c.rs = 0; c.fall = 1; c.cool = 0; c.pl = 0; c.ld.x = 0; c.ld.v = 0; c.md.x = 0; c.md.v = 0; continue; }
        const qx = sp3[0], qy = sp3[1], dx = qx - S.px, dy = (qy - S.py) * 1.3, r2 = dx * dx + dy * dy, t2 = r2 * ir2, t = Math.sqrt(t2), w2 = 1 / (1 + t2), at = t > 1e-3 ? Math.atan(t) / t : 1, g = mF + Dm * at, ex = r2 > 1e-6 ? dx * dx / r2 : 0, ey = r2 > 1e-6 ? dy * dy / r2 : 0;   // (the place is the running sum of a swell that falls off as 1 / (1 + t²) from the middle of the view, so no family is pushed onto its neighbour)
        c.ok = true; c.qx = qx; c.qy = qy; c.uc = st.u * sp3[2]; c.n = w2; c.lx = S.px + dx * g; c.ly = S.py + (qy - S.py) * g; c.dq = Math.max(0, Math.sqrt(r2) - 0.6 * c.figR / st.u * c.uc); c.ddx = -2 * w2 * w2 * dx * ir2; c.ddy = -2 * w2 * w2 * dy * 1.3 * ir2;
        c.jx = mF + Dm * (at * (1 - ex) + w2 * ex); c.jy = mF + Dm * (at * (1 - ey) + w2 * ey);
        /* upright: which way the family's own "up" points on the screen, and the turn that sets it straight (in force wherever the depth is, and in the farthest view, where the ring lies round the zenith and would show its families on their sides and on their heads) */
        c.rc = 1; c.rs = 0; if (up > 0.002) { stc[0] = c.C[0]; stc[1] = c.C[1] + 60; stc[2] = c.C[2]; if (sproj(stc, 0, sp4)) { const vx = sp4[0] - qx, vy = sp4[1] - qy, vl = Math.hypot(vx, vy); if (vl > 1e-3) { const ph = Math.atan2(vx, -vy) * up; c.rc = Math.cos(ph); c.rs = Math.sin(ph); } } }
        if (c.figN >= 4 && st.fzS < 0.5 && c.lx > sx0 * Wd && c.lx < (1 - sx0) * Wd && c.ly > sy0 * Hb && c.ly < sy1 * Hb && c.ly + c.figR / st.u * c.uc * mN * 0.62 * K < seaL) { const rb = c.figR / st.u * c.uc * mN * 0.8, pen = LENS.mr > 0 && LENS.mk > 0.5 && K > 0.9 && Math.hypot(c.lx - LENS.mx, c.ly - LENS.my) < LENS.mr * 2 + rb ? 260 : 0, sc = c.dq + pen - (c.i === st.leadCi ? 60 : 0); if (sc < bL) { bL = sc; bestL = c; } }   // (a family that would stand against the moon gives the lead to the next)
      }
      let mA = -1, mB = -1; if (K > 0.02) { let sA = 1e9, sB = 1e9; const ok2 = (c) => c.ok && c !== bestL && c.figN >= 3 && c.lx > 0.05 * Wd && c.lx < 0.95 * Wd && c.ly > 0.09 * Hb && c.ly < 0.8 * Hb && c.ly + c.figR / st.u * c.uc * mM * 0.6 < seaL && !(LENS.mr > 0 && LENS.mk > 0.5 && Math.hypot(c.lx - LENS.mx, c.ly - LENS.my) < LENS.mr * 1.5 + c.figR / st.u * c.uc * mM * 0.7);   // (a family whose figure would stand in the sea of clouds, or against the moon, does not come forward)
        for (const c of st.cons) { if (!ok2(c)) continue; const sc = c.dq - (c.i === st.midA || c.i === st.midB ? 50 : 0); if (sc < sA) { sA = sc; mA = c.i; } }
        if (mA >= 0) { const cx = bestL ? bestL.lx : S.px, sideA = st.cons[mA].lx < cx ? -1 : 1; for (const c of st.cons) { if (!ok2(c) || c.i === mA) continue; const sc = c.dq - (c.i === st.midA || c.i === st.midB ? 50 : 0) + ((c.lx < cx ? -1 : 1) === sideA ? 150 : 0); if (sc < sB) { sB = sc; mB = c.i; } } } }   // (the second of the middle plane stands, where it can, on the other side of the leader from the first: the view is weighed on both sides)
      const lead = bestL ? bestL.i : -1, atOnce = S.reduced || st.leadAt !== S.frame - 1 || (st.leadCi < 0 && lead >= 0 && st.leadSeen !== true); st.leadAt = S.frame; if (lead >= 0) st.leadSeen = true; st.leadCi = lead; st.midA = mA; st.midB = mB;   // (at the first frame, after a pause, and under reduced motion the planes stand at once; otherwise a family that has changed plane takes about a third of a second over it)
      for (const c of st.cons) { if (!c.ok) continue; const tl = c.i === lead ? 1 : 0, tm = tl || c.i === mA || c.i === mB ? 1 : 0;
        if (atOnce) { c.ld.x = tl; c.ld.v = 0; c.md.x = tm; c.md.v = 0; } else { spring(c.ld, tl, 12, dt); spring(c.md, tm, 12, dt); if (Math.abs(c.ld.x - tl) < 0.004) { c.ld.x = tl; c.ld.v = 0; } if (Math.abs(c.md.x - tm) < 0.004) { c.md.x = tm; c.md.v = 0; } if (c.ld.x !== tl || c.md.x !== tm) st.planeMove = S.frame; }   // (planeMove: a family is on its way between planes: the hand that holds a place holds it until that is over, see star.hold)
        const w2 = c.n, sT = clamp((w2 - 0.1) / 0.5, 0, 1), sF = sT * sT * (3 - 2 * sT), far = mF + (mFm - mF) * sF, l = clamp(c.ld.x, 0, 1), md = clamp(c.md.x, 0, 1), big = c.figN >= 3 ? 1 : 0.86;
        c.m = (far + (mM - far) * md + (mN - mM) * l) * lerp(1, big, K); c.lead = l; c.pl = md;
        { const nl = Math.pow(clamp((c.m - mF) / Math.max(1e-4, Dm), 0, 1), 0.6); c.fall = lerp(1, lerp(0.58, 1, nl), K); c.cool = (1 - nl) * K; }   // (fall: how much light the family keeps as it falls back; cool: how far its colour goes toward the sky's far blue)
        { const ds = (1 - md) * (mFm - mF) * 12 * sT * (1 - sT); c.dmx = ds * c.ddx; c.dmy = ds * c.ddy; }
        c.capE = Math.max(smooth(0.2, 0.8, md), 1 - smooth(0.3, 0.6, K));
        c.mD = Math.max(c.m, lerp(c.m, (c.jx + c.jy) * 0.5, 0.9)); c.mS = lerp(c.m, c.mD, 0.55);   // (mD: how far a family's dust of words is spread, mS: its field stars. A family that has fallen back is drawn small, but the sky between the families is not left empty: its dust keeps the measure of the sky round it, so the far sky is one even field of lights, and a family that comes forward gathers its own)
        if (st.fzS > 0.002) { const z = st.fzS, mz = c.tier === 1 ? 1.62 : c.tier === 2 ? 1.25 : 1; c.m = lerp(c.m, mz, z); }   // the farthest view: the larger families' figures are drawn larger than the ring's own measure, so each can be read as its radical
      }
    }
    /* a place of family c, as the file has it (o = what sproj gave), seen at the family's depth. lay: 1 the figure, less for what stands deeper inside the family */
    const lpt = (c, o, lay) => { const m = c.m, l = m * 1.15 * lay - 1, dx = o[0] - c.qx, dy = o[1] - c.qy; o[0] = c.lx + (dx * c.rc + dy * c.rs) * m + LENS.swx * l; o[1] = c.ly + (dy * c.rc - dx * c.rs) * m + LENS.swy * l; o[2] *= m; };   // (rc, rs: a body always stands upright on the screen, also where the wide eye, or the farthest view, would turn it on its side)
    const lptD = (c, o, lay, md) => { const l = c.m * 1.15 * lay - 1, dx = o[0] - c.qx, dy = o[1] - c.qy; o[0] = c.lx + (dx * c.rc + dy * c.rs) * md + LENS.swx * l; o[1] = c.ly + (dy * c.rc - dx * c.rs) * md + LENS.swy * l; o[2] *= c.m; };   // (the same for what stands deeper in the family, its field stars and its dust: spread by md, sized by the family's own depth)
    const layOf = (k) => (star.role[k] === 0 ? 1 : 1 - 0.42 * clamp((star.dep[k] - 0.3) / 0.7, 0, 1));
    /* how much of a thing of half-size r is left at (x, y): nothing behind the moon, all of it a short margin outside the disc; and the same toward the edges of the view, where writing thins out before the frame */
    const moonK = (x, y, r) => (LENS.mr > 0 ? 1 - LENS.mk * (1 - smooth(LENS.mr + 3 + r * 0.4, LENS.mr + 27 + r, Math.hypot(x - LENS.mx, y - LENS.my))) : 1);
    const edgeK = (x, y) => (S.small ? smooth(8, 34, x) * smooth(8, 34, S.W - x) * smooth(38, 64, y) : smooth(12, 46, x) * smooth(12, 46, S.W - x) * smooth(26, 56, y));   // (a short margin: what would stand half in it is not written at all, see the room taken for the frame's edges in drawStars)
    /* what stands under a place on the screen, as a place in a family's own body: the hand holds it there while the eye comes nearer or the sky is turned */
    function starAnchor(x, y) {
      const st = star; let best = null, bd = 1e9; for (const k of st.hits) { const d2 = Math.min(Math.pow(x - st.sx[k] - st.dx[k], 2) + Math.pow(y - st.sy[k] - st.dy[k], 2), Math.pow(x - st.sx[k], 2) + Math.pow(y - st.sy[k], 2)); if (d2 < bd) { bd = d2; best = st.cons[st.con[k]]; } }
      if (bd > 46 * 46) { best = null; bd = 1e9; for (const c of st.cons) { if (!c.ok) continue; const d = Math.hypot(x - c.lx, y - c.ly) / Math.max(30, c.r / st.u * c.uc * c.m); if (d < bd) { bd = d; best = c; } } }
      if (!best || !best.ok || !(best.uc > 0)) return null; const l = best.m * 1.15 - 1; return { ci: best.i, ax: (x - best.lx - LENS.swx * l) / (best.m * best.uc), ay: (y - best.ly - LENS.swy * l) / (best.m * best.uc), x, y, t: S.t };
    }
    /* where that place is seen now, and how fast it moves as the sky turns (out = [x, y, jx, jy]) */
    function anchorNow(h, out) { const c = star.cons[h.ci]; if (!c || !c.ok) return false; const l = c.m * 1.15 - 1; out[0] = c.lx + h.ax * c.m * c.uc + LENS.swx * l; out[1] = c.ly + h.ay * c.m * c.uc + LENS.swy * l; out[2] = Math.max(0.4, c.jx + h.ax * c.uc * c.dmx); out[3] = Math.max(0.4, c.jy + h.ay * c.uc * c.dmy); return true; }
    const anc4 = [0, 0, 1, 1];
    /* a point on the wall between two stars: az, height and distance from the hub each run evenly from a to b; the
     * line bows a little to one side (arc: +1 up, -1 down, about a twentieth of its length), so that the lines of
     * one star part from each other like threads and do not lie on one another */
    function starMid(a, b, t, out, arc) { const P = star.P, oa = a * 3, ob = b * 3, ra = Math.hypot(P[oa], P[oa + 2]), za = Math.atan2(P[oa], P[oa + 2]), span = wrapA(Math.atan2(P[ob], P[ob + 2]) - za), az = za + span * t, R = ra + (Math.hypot(P[ob], P[ob + 2]) - ra) * t;
      out[0] = R * Math.sin(az); out[1] = P[oa + 1] + (P[ob + 1] - P[oa + 1]) * t + (arc || 0) * 0.05 * Math.min(2600, Math.hypot(STAR_R * span, P[ob + 1] - P[oa + 1])) * Math.sin(Math.PI * t); out[2] = R * Math.cos(az); return out; }
    /* that point as the eye sees it: at star a it stands at the depth of a's family, at star b at the depth of b's, and passes evenly from one to the other between them (so a thread always leaves its star and always arrives) */
    function lmid(a, b, t, arc, out) {
      if (!sproj(starMid(a, b, t, stc, arc), 0, out)) return false;
      const st = star, ca = st.cons[st.con[a]], cb = st.cons[st.con[b]], s = t * t * (3 - 2 * t), x = out[0], y = out[1]; let xa = x, ya = y, ma = 1, xb = x, yb = y, mb = 1;
      const k0 = out[2]; if (ca && ca.ok) { lpt(ca, out, layOf(a)); xa = out[0]; ya = out[1]; ma = ca.m; out[0] = x; out[1] = y; }
      if (cb && cb.ok) { lpt(cb, out, layOf(b)); xb = out[0]; yb = out[1]; mb = cb.m; }
      out[0] = xa + (xb - xa) * s; out[1] = ya + (yb - ya) * s; out[2] = k0 * (ma + (mb - ma) * s); return true;
    }
    /** A word as a line from star a to star b, along the wall of the ring: a thread. It is brightest (a0) at a and
     * falls away along its length to a1, which it keeps all the way to b: it always reaches its partner. */
    function starLine(a, b, col, a0, a1, w, arc, fade) {   // fade: the length, in units of the world, over which it falls from a0 toward a1
      const P = star.P, span = Math.abs(wrapA(Math.atan2(P[b * 3], P[b * 3 + 2]) - Math.atan2(P[a * 3], P[a * 3 + 2]))), L = Math.hypot(STAR_R * span, P[b * 3 + 1] - P[a * 3 + 1]), n = clamp(Math.ceil(span / 0.03) + 3, 4, 52); let ok0 = lmid(a, b, 0, arc, sp3), x0 = sp3[0], y0 = sp3[1], t0 = 0;
      for (let q = 1; q <= n; q += 1) { const t1 = Math.pow(q / n, 1.7), ok1 = lmid(a, b, t1, arc, sp4), x1 = sp4[0], y1 = sp4[1];   // (the pieces are short near the star, where the thread fades fastest)
        if (ok0 && ok1 && Math.max(x0, x1) > -60 && Math.min(x0, x1) < S.W + 60 && Math.max(y0, y1) > -60 && Math.min(y0, y1) < S.H + 60) { pushLine(x0, y0, x1, y1, 0, w, col, a1 + (a0 - a1) * Math.exp(-(t0 + t1) * 0.5 * L / (fade || 520)), 1); star.lines += 1; } ok0 = ok1; x0 = x1; y0 = y1; t0 = t1; }
    }
    /* Room on the screen, by rank. Whatever is written (a name, a star's character, a word) is entered here in one fixed
     * order: names, the touched star, the stars from the brightest down, the touched star's words in the order of the
     * file, his own words. A thing reads how much of its place is free of those ranked above it: 1 where it stands
     * clear, falling smoothly to 0 where it would lie on one of them. So what is written is a continuous function of
     * where the eye is; nothing is settled by who came first in a frame, and nothing flickers at a threshold. */
    const YG = { cell: 44, cols: 0, rows: 0, head: null, nx: new Int32Array(12000), it: new Int32Array(12000), nn: 0, x: new Float32Array(4000), y: new Float32Array(4000), hw: new Float32Array(4000), hh: new Float32Array(4000), a: new Float32Array(4000), seen: new Int32Array(4000), n: 0, q: 0 };
    function ygReset() { const cols = Math.ceil(S.W / YG.cell) + 3, rows = Math.ceil(S.H / YG.cell) + 3; if (cols !== YG.cols || rows !== YG.rows) { YG.cols = cols; YG.rows = rows; YG.head = new Int32Array(cols * rows); } YG.head.fill(-1); YG.nn = 0; YG.n = 0; }
    function ygAdd(x, y, hw, hh, a) {
      if (a < 0.02 || YG.n >= 4000) return; const id = YG.n; YG.n += 1; YG.x[id] = x; YG.y[id] = y; YG.hw[id] = hw; YG.hh[id] = hh; YG.a[id] = Math.min(1, a); YG.seen[id] = -1;
      const c0 = clamp(Math.floor((x - hw * 1.25) / YG.cell) + 1, 0, YG.cols - 1), c1 = clamp(Math.floor((x + hw * 1.25) / YG.cell) + 1, 0, YG.cols - 1), r0 = clamp(Math.floor((y - hh * 1.25) / YG.cell) + 1, 0, YG.rows - 1), r1 = clamp(Math.floor((y + hh * 1.25) / YG.cell) + 1, 0, YG.rows - 1);
      for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) { if (YG.nn >= 12000) return; const cell = r * YG.cols + c; YG.it[YG.nn] = id; YG.nx[YG.nn] = YG.head[cell]; YG.head[cell] = YG.nn; YG.nn += 1; }
    }
    function ygFree(x, y, hw, hh) {
      const c0 = clamp(Math.floor((x - hw * 1.25) / YG.cell) + 1, 0, YG.cols - 1), c1 = clamp(Math.floor((x + hw * 1.25) / YG.cell) + 1, 0, YG.cols - 1), r0 = clamp(Math.floor((y - hh * 1.25) / YG.cell) + 1, 0, YG.rows - 1), r1 = clamp(Math.floor((y + hh * 1.25) / YG.cell) + 1, 0, YG.rows - 1); let free = 1; YG.q += 1;
      for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) for (let e = YG.head[r * YG.cols + c]; e >= 0; e = YG.nx[e]) { const id = YG.it[e]; if (YG.seen[id] === YG.q) continue; YG.seen[id] = YG.q;
        const nd = Math.max(Math.abs(x - YG.x[id]) / (hw + YG.hw[id]), Math.abs(y - YG.y[id]) / (hh + YG.hh[id])); if (nd < 1.05) { free *= 1 - YG.a[id] * (1 - smooth(1.03, 1.05, nd)); if (free < 0.012) return 0; } }   // (all but a step from hidden to clear: a character or a word half under another reads as a smudge. What comes or goes still takes a quarter of a second over it: see fadeTo)
      return free;
    }
    /* how large a star's character is written where one unit of the band is `up` px; and the touched star's size */
    const starSize = (k, up, m) => { const mm = m || 1, ur = up / mm; return star.role[k] === 0 ? 24 * star.rf[k] * Math.pow(ur / 34, 0.62) * mm : (5 + 4.2 * star.mag[k]) * (ur / 26) * Math.pow(mm, 0.3) * (1 - 0.4 * star.rn[k] * star.rn[k]); } /* (up: px to one unit where the star is seen, the family's depth included; m: how far forward its family stands. A figure star is written as large as its family stands forward, and by its rank in the figure: the leading family's two commonest about 48 px at the resting distance, a family at the edge of the view a quarter of that. The field stars are points, the brightest and innermost of them small characters; they grow into characters as the eye comes nearer) */, starSel = (cs) => clamp(cs * 2.15, S.small ? 54 : 68, 116);
    /** The places of a touched star's words, decided once, at the touch, for the view that frames the star, in the order
     * of the file (the most telling words first). A word is written on its own line, just clear of it, where the line
     * leaves the family's ground; if that place is taken, at the nearest place along the line that is free of every
     * star's character, of the names, and of the words placed before it. A word of that one kanji alone stands round
     * the star. After the touch a word keeps its place on its line: it is never moved to make room. */
    function starLayout(k, E1, yaw) {
      const st = star, D = W.D, c = st.cons[st.con[k]], list = st.words[k] || [], lay = { k, up0: 26, cs0: 68, items: [], has: [false, false, false, false, false, false], open: 2 };
      const keep = [view.eye[0], view.eye[1], view.eye[2], view.fwd[0], view.fwd[1], view.fwd[2], view.right[0], view.right[1], view.right[2], view.up[0], view.up[1], view.up[2], S.Fz], sy = Math.sin(yaw), cy = Math.cos(yaw);
      view.eye[0] = E1[0]; view.eye[1] = E1[1]; view.eye[2] = E1[2]; view.fwd[0] = sy; view.fwd[1] = 0; view.fwd[2] = cy; view.right[0] = cy; view.right[1] = 0; view.right[2] = -sy; view.up[0] = 0; view.up[1] = 1; view.up[2] = 0; S.Fz = S.F;
      const box = [], hit = (x, y, hw, hh) => { for (let q = 0; q < box.length; q += 4) if (Math.abs(x - box[q]) < hw + box[q + 2] && Math.abs(y - box[q + 1]) < hh + box[q + 3]) return true; return false; };
      const top = S.small ? 104 : 92, bot = S.H - S.foot - (S.small ? 150 : 128), lft = 10, rgt = S.W - (S.small ? 52 : 76);
      if (sproj(st.P, k * 3, sp3)) { const x0 = sp3[0], y0 = sp3[1]; lay.up0 = st.u * sp3[2]; lay.cs0 = starSel(starSize(k, lay.up0)); const cs0 = lay.cs0; box.push(x0, y0, cs0 * 0.56, cs0 * 0.6);
        for (const k2 of st.order) { if (k2 === k || !sproj(st.P, k2 * 3, sp4)) continue; const x = sp4[0], y = sp4[1]; if (x < -30 || x > S.W + 30 || y < -30 || y > S.H + 30) continue; const cs = starSize(k2, st.u * sp4[2]); if (cs >= 11) box.push(x, y, cs * 0.54, cs * 0.58); else box.push(x, y, 3, 3); }
        for (const c2 of st.cons) if (sproj(c2.N, 0, sp4)) box.push(sp4[0], sp4[1] + 8, 20 + (c2.name ? wideOf(c2.name, 13, 0.5) / 2 : 0), 12);
        let lone = 0; const tx = new Float32Array(50), px = new Float32Array(50), py = new Float32Array(50), sl = new Float32Array(50);
        /* the layers, nearest first: 0 the kanji's own words (it alone, or with kana); 1 its commonest compounds (N5, N4); 2 N3; 3 N2; 4 N1; 5 the rest. Within a layer the order of the file. Every word once. */
        const seen = new Set(), pre = []; list.forEach((wi, rank) => { if (seen.has(wi)) return; seen.add(wi); let mate = -1; for (const k2 of D.words[wi][4]) if (k2 !== k && st.con[k2] >= 0) { mate = k2; break; } const lv = W.lvl[wi]; pre.push({ wi, rank, mate, layer: mate < 0 ? 0 : lv >= 4 ? 1 : lv === 3 ? 2 : lv === 2 ? 3 : lv === 1 ? 4 : 5 }); });
        pre.sort((p, q) => p.layer - q.layer || p.rank - q.rank);
        /* the steps in which they come: step 0, at the touch, is the first two layers, but never more than twelve words and never fewer than six (the next of the file's list are taken until there are six); then a step for each further layer */
        { let n0 = 0; for (const p of pre) { p.step = p.layer < 2 && n0 < 12 ? 0 : Math.max(1, p.layer - 1); if (!p.step) n0 += 1; } if (n0 < 6) for (const p of pre.slice().sort((a, b) => a.rank - b.rank)) { if (n0 >= 6) break; if (p.step) { p.step = 0; n0 += 1; } } for (const p of pre) lay.has[p.step] = true; lay.open = 1; }
        pre.forEach(({ wi, mate, layer, step: stp }) => { const tier = layer < 2 ? 2 : 0, size = [17.5, 17.5, 15, 13.5, 12.5, 11.5][layer], hw = W.len[wi] * size * 0.52 + 4, hh = size * 0.62 + 2;
          const it = { wi, mate, layer, step: stp, tier, arc: lay.items.length % 2 ? -1 : 1, wt: [1, 1, 0.84, 0.7, 0.58, 0.48][layer], size, hw, hh, t: 0.3, side: 1, dx: 0, dy: 0, placed: false, a: 0, la: 0 }; lay.items.push(it);
          if (mate < 0) {   // a word of this one kanji: round the star, the first place that is free
            for (let ring = 0; ring < 4 && !it.placed; ring += 1) for (let m = 0; m < 12 && !it.placed; m += 1) { const ang = -Math.PI / 2 + ((lone + m) % 12) * (Math.PI / 6), rr = cs0 * 0.6 + 8 + ring * (size * 1.5 + 4), ca = Math.cos(ang), sa = Math.sin(ang), cx = x0 + ca * (rr + hw * Math.abs(ca)), cy2 = y0 + sa * (rr + hh * Math.abs(sa));
              if (cx - hw < lft || cx + hw > rgt || cy2 - hh < top || cy2 + hh > bot || hit(cx, cy2, hw, hh)) continue; it.dx = cx - x0; it.dy = cy2 - y0; it.placed = true; box.push(cx, cy2, hw, hh); }
            if (!it.placed) { const ang = -Math.PI / 2 + lone * 2.39996, rr = cs0 * 0.6 + 8 + 4 * (size * 1.5 + 4); it.dx = Math.cos(ang) * (rr + hw); it.dy = Math.sin(ang) * rr; } lone += 1; return; }
          /* the line as it runs on the screen from the star, as far as it stays in view */
          let n = 0, sPref = -1; const N = 48; for (let q = 0; q <= N; q += 1) { const t = Math.pow(q / N, 2.2); starMid(k, mate, t, stc, it.arc); if (!sproj(stc, 0, sp4)) break; const x = sp4[0], y = sp4[1]; if (q > 0 && (x < lft - 40 || x > rgt + 40 || y < top - 40 || y > bot + 40)) break;
            tx[n] = t; px[n] = x; py[n] = y; sl[n] = n ? sl[n - 1] + Math.hypot(x - px[n - 1], y - py[n - 1]) : 0; if (sPref < 0 && Math.hypot(stc[0] - c.C[0], stc[1] - c.C[1], stc[2] - c.C[2]) > c.r * 1.04) sPref = sl[n]; n += 1; }
          if (n < 2) return; const sA = cs0 * 0.6 + 8, sB = sl[n - 1] - (tx[n - 1] >= 0.999 ? 16 : 0), step = size * 1.15 + 5; if (sPref < 0) sPref = (sA + sB) / 2; sPref = clamp(sPref + 6, sA, Math.max(sA, sB));
          const at = (s, out) => { let q = 1; while (q < n - 1 && sl[q] < s) q += 1; const f2 = clamp((s - sl[q - 1]) / Math.max(1e-3, sl[q] - sl[q - 1]), 0, 1), dx = px[q] - px[q - 1], dy = py[q] - py[q - 1], dl = Math.hypot(dx, dy) || 1; out.t = tx[q - 1] + (tx[q] - tx[q - 1]) * f2; out.x = px[q - 1] + dx * f2; out.y = py[q - 1] + dy * f2; out.ux = dx / dl; out.uy = dy / dl; return out; }, o = {};
          for (const off of [0, 1, 2, -1, 3, -2, 4, 5, -3, 6, 7, -4, 8]) { const s = sPref + off * step; if (s < sA || s > sB) continue; at(s, o);
            for (const side of (o.ux >= 0 ? [1, -1] : [-1, 1])) { const nx = o.uy * side, ny = -o.ux * side, off2 = hw * Math.abs(nx) + hh * Math.abs(ny) + 2, cx = o.x + nx * off2, cy2 = o.y + ny * off2;   // (first the upper side of the line)
              if (cx - hw < lft || cx + hw > rgt || cy2 - hh < top || cy2 + hh > bot || hit(cx, cy2, hw, hh)) continue; it.t = o.t; it.side = side; it.placed = true; box.push(cx, cy2, hw, hh); break; }
            if (it.placed) break; }
          if (!it.placed) { at(sPref, o); it.t = o.t; it.side = o.ux >= 0 ? 1 : -1; } });
      }
      view.eye[0] = keep[0]; view.eye[1] = keep[1]; view.eye[2] = keep[2]; view.fwd[0] = keep[3]; view.fwd[1] = keep[4]; view.fwd[2] = keep[5]; view.right[0] = keep[6]; view.right[1] = keep[7]; view.right[2] = keep[8]; view.up[0] = keep[9]; view.up[1] = keep[10]; view.up[2] = keep[11]; S.Fz = keep[12];
      return lay;
    }
    const figC = [1, 1, 1], KNC = [0, 0, 0], nmC = [1, 1, 1];
    /** One stroke of a family's figure, written and not ruled. It is one curve through its stars (never a chain of straight pieces), and its width changes along it as a
     * brush's would, by the kind of stroke: a stroke that falls to the left presses at its start and thins to its end; one that falls to the right starts fine, swells and
     * closes to a point; a level stroke presses a little at both ends; an upright one presses at the top and tapers. The family that leads has the full brush (about 2.4 px
     * at its heaviest); every other family the same rule at about a third, pale. It passes behind whatever is written (see pushKno), and behind the moon.
     *   A stroke of a family that does not lead is drawn only while most of its length shows clear of the characters written on it; otherwise the characters carry the
     * shape. An end that stands on a bare joint closes on a small point of light, so no stroke stops in empty sky. lit: how far the family leads (or holds a touched star). */
    const FX = new Float32Array(72), FY = new Float32Array(72), FL = new Float32Array(72);
    function figStroke(c, fq, col, la, lit, lw, fnow, stepA) {
      const st = star, pts = c.fig[fq], fk = c.figK[fq], n = Math.min(72, pts.length / 3), Wd = S.W, Hd = S.H; if (n < 2) return; let cov = 0, L = 0, vis = false;
      for (let q = 0; q < n; q += 1) { if (!sproj(pts, q * 3, sp4)) return; lpt(c, sp4, 1); const k1 = fk[q], rx = sp4[0], ry = sp4[1]; if (rx > -60 && rx < Wd + 60 && ry > -60 && ry < Hd + 60) vis = true;   // (whether it is drawn is decided where the stars rest, not where they have floated to)
        FX[q] = rx + (k1 >= 0 ? st.dx[k1] : c.fx); FY[q] = ry + (k1 >= 0 ? st.dy[k1] : c.fy); if (q) L += Math.hypot(FX[q] - FX[q - 1], FY[q] - FY[q - 1]); FL[q] = L;   // (a star floats: the stroke goes with it)
        if (k1 >= 0 && st.on[k1]) cov += st.cs[k1] * 1.2 * (q === 0 || q === n - 1 ? 0.5 : 1); }
      if (!vis || L < 5) return;
      const clear = 1 - cov / L, on = lit > 0.5 || st.fzS > 0.5 ? 1 : (c.sOn[fq] ? clear > 0.5 : clear > 0.62) ? 1 : 0; c.sOn[fq] = on; const sa = c.sA[fq] = c.sAt === fnow - 1 ? fadeTo(c.sA[fq], on, stepA) : on; if (sa < 0.02) return;
      const ddx = FX[n - 1] - FX[0], ddy = FY[n - 1] - FY[0], kind = Math.abs(ddx) > 2.2 * Math.abs(ddy) ? 0 : ddy < 0 ? 4 : ddx < -0.2 * ddy ? 1 : ddx > 0.2 * ddy ? 2 : 3, wS = lerp(0.36, 1, lit) * (S.small ? 0.85 : 1), step = lit > 0.3 ? 8 : 13, a0 = la * sa;
      st.lines += n - 1;
      let xa = FX[0], ya = FY[0];
      for (let i = 0; i + 1 < n; i += 1) { const i0 = Math.max(0, i - 1), i3 = Math.min(n - 1, i + 2), len = FL[i + 1] - FL[i], m = clamp(Math.ceil(len / step), 1, 40), sag = n === 2 ? 0.026 * len * (ddx >= 0 ? 1 : -1) : 0, nx = n === 2 ? -ddy / (L || 1) : 0, ny = n === 2 ? ddx / (L || 1) : 0;
        for (let j = 1; j <= m; j += 1) { const t = j / m, t2 = t * t, t3 = t2 * t;   // (a curve through the stars: each piece takes its bend from the stars before and after it; a stroke of two stars sags by a fortieth of its length)
          let xb = 0.5 * ((2 * FX[i]) + (-FX[i0] + FX[i + 1]) * t + (2 * FX[i0] - 5 * FX[i] + 4 * FX[i + 1] - FX[i3]) * t2 + (-FX[i0] + 3 * FX[i] - 3 * FX[i + 1] + FX[i3]) * t3), yb = 0.5 * ((2 * FY[i]) + (-FY[i0] + FY[i + 1]) * t + (2 * FY[i0] - 5 * FY[i] + 4 * FY[i + 1] - FY[i3]) * t2 + (-FY[i0] + 3 * FY[i] - 3 * FY[i + 1] + FY[i3]) * t3);
          if (sag) { const b = 4 * t * (1 - t) * sag; xb += nx * b; yb += ny * b; }
          const s = (FL[i] + (t - 0.5 / m) * len) / L; let w;
          if (kind === 1) w = lerp(2.4, 0.5, Math.pow(s, 0.8)); else if (kind === 2) w = s < 0.66 ? lerp(1.15, 2.6, smooth(0, 0.66, s)) : lerp(2.6, 0.25, Math.pow((s - 0.66) / 0.34, 0.75)); else if (kind === 0) w = 1.3 + 0.75 * Math.exp(-s / 0.07) + 0.55 * Math.exp(-(1 - s) / 0.06) - 0.2 * Math.sin(Math.PI * s); else if (kind === 3) w = (1.25 + 0.95 * Math.exp(-s / 0.09) + 0.3 * (1 - s)) * (1 - 0.72 * smooth(0.8, 1, s)); else w = lerp(2.1, 0.45, s);
          w *= wS * lw; const mx = (xa + xb) / 2, my = (ya + yb) / 2, a = a0 * Math.min(1, w / 0.9) * moonK(mx, my, 0) * maskAt(mx, my) * smooth(-10, 26, my) * (1 - smooth(st.seaY - 26, st.seaY + 22, my));   // (a stroke goes down into the sea of clouds and is lost in it: no line is drawn over the cloud)
          pushLine(xa, ya, xb, yb, 0, Math.max(0.9, w), col, a, 1); xa = xb; ya = yb; } }
      if (lit < 0.5) { if (fk[0] < 0) pushPt(FX[0], FY[0], 1.25, col, 1.5 * a0 * moonK(FX[0], FY[0], 0) * maskAt(FX[0], FY[0]), 0); if (fk[n - 1] < 0) pushPt(FX[n - 1], FY[n - 1], 1.25, col, 1.5 * a0 * moonK(FX[n - 1], FY[n - 1], 0) * maskAt(FX[n - 1], FY[n - 1]), 0); }
    }
    /* one piece of a straight line among the stars; where it comes to the moon it goes behind the disc */
    function figSeg(x0, y0, x1, y1, w, col, a) {
      if (LENS.mr > 0 && LENS.mk > 0.01) { const r = LENS.mr + 34, mx = LENS.mx, my = LENS.my; if (Math.max(x0, x1) > mx - r && Math.min(x0, x1) < mx + r && Math.max(y0, y1) > my - r && Math.min(y0, y1) < my + r) {
          const n = clamp(Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 9), 1, 24); for (let q = 0; q < n; q += 1) { const t0 = q / n, t1 = (q + 1) / n, xa = x0 + (x1 - x0) * t0, ya = y0 + (y1 - y0) * t0, xb = x0 + (x1 - x0) * t1, yb = y0 + (y1 - y0) * t1; pushLine(xa, ya, xb, yb, 0, w, col, a * moonK((xa + xb) / 2, (ya + yb) / 2, 0), 1); } return; } }
      pushLine(x0, y0, x1, y1, 0, w, col, a, 1);
    }
    /** The margin of sky round something written: the same glyph, a few px wider, in the sky's own colour at that place. It is drawn over the
     * lines and under all writing, so a line that meets a character or a word goes under it and comes out the other side. a: how much of the glyph is there. */
    function pushKno(x, y, size, sp, cell, a, baseIdx, box) {
      if (nKno >= MAXK || a < 0.06) return; const n0 = nLab; if (!pushLabel(x, y, size, sp, baseIdx || 0, KNC, Math.min(1, a * 1.7), KNC, -1, 0, cell)) return;
      const o = n0 * LSTR, t = nKno * LSTR; for (let q = 0; q < LSTR; q += 1) kno[t + q] = lab[o + q];
      kno[t + 16] = clamp(Math.log2(2.2 * (cell ? SA.px : sp ? sp.px : BASE_PX) / Math.max(4, size)), 0.9, cell || !sp ? 3 : 4);
      kno[t + 12] = box && sp ? Math.min(0.5, (sp.tw * 0.5 + 0.05 * sp.px) / sp.w) : 0; kno[t + 13] = box && sp ? Math.min(0.5, 0.56 * sp.px / sp.h) : 0; nKno += 1; nLab = n0;   // (box: a word clears its whole box, as a part of its rectangle, so a line never shows between its characters; a kanji clears only its own shape and the margin round it, so a stroke of the figure is seen to go in under it and come out again)
    }
    const LAYER_AT = [0, 1.18, 1.44, 1.72, 2.02, 2.3];   // how much nearer than the framing view the eye must be for each step after the first to come by approach alone
    const litCol = [1, 1, 1], fadeTo = (cur, to, step) => (S.reduced ? to : cur + clamp(to - cur, -step, step));
    function drawStars(dt, A) {
      const st = star, D = W.D, pal = S.pal, tc = pal.text, mk = pal.mark, Wd = S.W, Hd = S.H, f = view.fwd, E = view.eye, d = S.dpr, ja = opt.lang === 'ja', fnow = S.frame, sm = S.small, stepA = dt / 0.28; st.lines = 0; st.nShown = 0;   // (stepA: whatever comes or goes takes at least a quarter of a second over it)
      ygReset(); const tF = S.reduced ? 0 : S.t; let wc0 = -1, wc1 = -1; if (st.word >= 0) { const ks = D.words[st.word][4].filter((k) => st.con[k] >= 0); if (ks.length) { wc0 = st.con[ks[0]]; wc1 = st.con[ks[ks.length - 1]]; } }   // (the families of a touched word's stars: both are lit)
      /* the sky's own colours and no others: its line colour for the figures and their names (lifted toward its text until it reads as light), its cream for the stars, cooler and fainter the deeper they stand, its gold for his words */
      { const h = hueC[0]; let k = 0.7; for (let t = 0; t < 5; t += 1) { h[0] = lerp(tc[0], pal.line[0], k); h[1] = lerp(tc[1], pal.line[1], k); h[2] = lerp(tc[2], pal.line[2], k); if (0.299 * h[0] + 0.587 * h[1] + 0.114 * h[2] > 0.55) break; k *= 0.6; } for (let q = 1; q < 8; q += 1) { hueC[q][0] = h[0]; hueC[q][1] = h[1]; hueC[q][2] = h[2]; } }
      st.stepA = stepA;
      /* how near the eye is: the length of one unit of the band on the wall straight ahead, in px (far: under 10; mid; near: over 55) */
      { const a = cam.a + cam.yaw.x; stc[0] = STAR_R * Math.sin(a); stc[1] = 12 * st.u; stc[2] = STAR_R * Math.cos(a); if (sproj(stc, 0, sp4)) st.unit = st.u * sp4[2]; }
      starLens(dt);
      /* what is never written on: the moon (with a margin; unless it has stepped back for a touched family), every seal and button with the strip between the seals and the frame, and the frame's own edges.
       * They take their room before anything else, so a character or a word that would lie there stays a point of light: nothing is half-written under a control or against the disc */
      if (LENS.mr > 0 && LENS.mk > 0.02) ygAdd(LENS.mx, LENS.my, LENS.mr + 9, LENS.mr + 9, LENS.mk);
      { const list = S.mask; if (list) for (const b of list) if (b[5] > 0.02) ygAdd(b[0], b[1], b[2] + 8, b[3] + 8, b[5]); const tb = S.toolsBox; if (tb && W.toolsK > 0.02) { const x0 = tb[0] - tb[2] - 12; ygAdd((x0 + Wd) / 2, tb[1], (Wd - x0) / 2, tb[3] + 22, W.toolsK); }
        /* and the sea of clouds: from its top down nothing is written (type on white cloud is neither read nor gone); what stands there is a point of light until the eye lifts it clear */
        if (st.fzS < 0.3) { const a = cam.a + cam.yaw.x, E = view.eye, el = -0.225; stc[0] = E[0] + 20000 * Math.sin(a) * Math.cos(el); stc[1] = E[1] + 20000 * Math.sin(el); stc[2] = E[2] + 20000 * Math.cos(a) * Math.cos(el); st.seaY = sproj(stc, 0, sp4) ? sp4[1] : Hd; if (st.seaY < Hd) ygAdd(Wd / 2, (st.seaY + Hd) / 2 + 8, Wd / 2, (Hd - st.seaY) / 2, (1 - st.fzS / 0.3) * (1 - clamp(st.selS.x, 0, 1))); } else st.seaY = Hd;   // (not while a star is touched: its own view is laid out for it)
        const eg = sm ? 12 : 26; ygAdd(eg / 2, Hd / 2, eg / 2, Hd / 2, 1); ygAdd(Wd - eg / 2, Hd / 2, eg / 2, Hd / 2, 1); ygAdd(Wd / 2, (sm ? 40 : 30) / 2, Wd / 2, (sm ? 40 : 30) / 2, 1); }
      const unit = st.unit, far = 1 - smooth(8.5, 12, unit), near = smooth(42, 70, unit), sel = st.sel, selK = st.selS.x, selC = sel >= 0 ? st.con[sel] : st.con1, dimA = 1 - 0.7 * S.dim.x, LK = LENS.K, tf = pal.textFar;
      /* the constellations in view: the one the eye faces (the one nearest the middle of the view: it leads), their figures, their names */
      st.nHits.length = 0; let face = -1, fb = -2; const lim = Math.cos(Math.min(2.9, Math.atan(Math.hypot(Wd, Hd) / (4 * S.Fz * LENS.mF)) * 2 + 0.3));   // (the families at the edge are drawn in toward the middle: the eye takes in a wider ring than the frame alone would hold)
      for (const c of st.cons) { const dx = c.C[0] - E[0], dy = c.C[1] - E[1], dz = c.C[2] - E[2], cs0 = (dx * f[0] + dy * f[1] + dz * f[2]) / (Math.hypot(dx, dy, dz) || 1); c.vis = c.ok && cs0 > lim; if (c.vis && c.n > fb) { fb = c.n; face = c.i; } }
      if (st.leadCi >= 0 && LK > 0.5) face = st.leadCi; if (st.fzS > 0.5) face = -1; st.face = face;   // (the family that leads is the one the eye faces; in the farthest view no family is faced: all stand alike round the zenith)
      if (st.fzS > 0.3 && W.fonts) { const ra = A * (1 - 0.7 * S.dim.x) * smooth(0.3, 0.8, st.fzS), sz = sm ? 12 : 15.5, s2 = sm ? 9.5 : 10.5; for (const rm of st.realms) { if (!sproj(rm.M, 0, sp3)) continue; const sp = spriteFor('szJ' + rm.i, rm.ja, 'w', sz * d, null, 490, true); if (sp) { pushLabel(sp3[0], sp3[1], sz, sp, 0, tc, 0.86 * ra, mk, 0, 0); ygAdd(sp3[0], sp3[1], wideOf(rm.ja, sz, 1) / 2 + 4, sz * 0.7, 1); }
          if (!ja && rm.en) { const se = spriteFor('szE' + rm.i, rm.en, 'e', s2 * d, null, 485, true); if (se) pushLabel(sp3[0], sp3[1] + sz * 0.62 + s2 * 0.7, s2, se, 0, tf, 0.62 * ra, mk, 0, 0); } } }   // there the eight realms of the language are named round the zenith, inside the ring: in Japanese first, the gloss small beneath
      for (const c of st.conOrder) { /* (in the order of rank, the larger families first: a lesser name gives way to a greater one) */ const to = c.i === selC || c.i === wc0 || c.i === wc1 ? 1 : 0; if (!c.vis) { c.lit.x = to; c.lit.v = 0; c.fx = 0; c.fy = 0; c.lw = to; continue; } spring(c.lit, to, 7, dt); if (Math.abs(c.lit.x - to) < 0.01) { c.lit.x = to; c.lit.v = 0; }   // (lit: a family he has touched. How much a family leads at rest, c.lead, is read from where it stands in the view, not from a clock)
        /* the family floats as one body: its stars, its figure, its words and its name together, slowly, each family in its own time and its own way (a swell that passes
         * round the ring, so neighbours go nearly together and never into each other). Inside a family nothing moves against anything else. The family of the touched star lies still. */
        if (tF) { const amp = Math.min(0.24 * c.uc, 14) * (0.5 + 0.5 * c.m) * (c.i === selC ? 1 - st.selA : st.prev && st.con[st.prev.k] === c.i ? 1 - st.prev.a : 1); c.fx = amp * Math.sin(tF * c.w1 + c.p1); c.fy = amp * 0.8 * Math.cos(tF * c.w2 + c.p2); } else { c.fx = 0; c.fy = 0; }   // (a family that stands forward floats farther than one that has fallen back: the bodies drift against each other)
        const lit = c.lw = Math.max(c.lit.x, c.lead * (sel >= 0 && c.i !== selC ? 1 - selK : 1) * (1 - far)), hc = hueC[c.realm & 7], tierA = Math.max(lit, c.tier <= 2 ? 1 : c.tier === 3 ? smooth(9, 12, unit) : smooth(42, 54, unit)); if (tierA < 0.02) continue;   // (lit: how much this family leads, 0..1.) At the far distance: the figures and names of the larger families only
        const fall = c.fall;   // how much light a family keeps as it falls back
        const la = A * dimA * tierA * lerp(lerp(0.36, 0.8, far) * fall, 0.9, lit) * (1 - 0.3 * near * (1 - lit)) * (sel >= 0 && c.i !== selC ? 1 - 0.4 * selK : 1), lw = lerp(1.0 + 0.4 * far, 1.15, lit);
        if (W.figRed) { const kr = smooth(0.1, 0.6, lit); figC[0] = lerp(hc[0], pal.cord[0], kr); figC[1] = lerp(hc[1], pal.cord[1], kr); figC[2] = lerp(hc[2], pal.cord[2], kr); } else { figC[0] = hc[0]; figC[1] = hc[1]; figC[2] = hc[2]; }   // full vermilion for the family that leads or holds a touched star; every other figure is a pale line at about a third
        if (c.figN >= 3) { for (let fq = 0; fq < c.fig.length; fq += 1) figStroke(c, fq, figC, la, lit, lw, fnow, stepA); c.sAt = fnow; }   // (a family with fewer than three stars on its figure has no figure to draw: its bare joints would be stray strokes.) Each stroke of the radical is written, not ruled: see figStroke
        /* its name: the radical as a character, just under the figure, part of the family's body (it comes forward and floats with it). Every family in view carries the character; the words of the
         * name are written for the family that leads and, fainter, for those next to the middle, and they come and go by where the family stands, never at a stroke. In the farthest view: the character alone. */
        if (!W.fonts || !sproj(c.NF, 0, sp3)) continue; lpt(c, sp3, 1); let x = sp3[0], y = sp3[1] + 6;
        const zf = Math.max(st.fzS, far), s = lerp(lerp(12.5, 17.5, lit), [17, 15, 12.5, 11.5][c.tier - 1] || 11.5, zf) - (sm ? 1.5 : 0), sn = s * 0.8, tA = Math.max(lit, 0.85 * c.pl * LK) * (1 - smooth(0, 0.4, zf));   // (the words of a name: for the family that leads and, fainter, the two of the middle plane; a far family is its radical alone)
        const wn = c.name ? wideOf(c.name, sn, 0.5) : 0, wOff = wn ? (6 + wn) * 0.5 * tA : 0, hw = s * 0.5 + wOff + 5, hh = s * 0.7 + 2;
        if (x < -80 || x > Wd + 80 || y < 30 || y > Hd - S.foot + 10) continue;
        const free = lit > 0.5 ? 1 : ygFree(x, y, hw, hh); c.nOn = c.nOn ? (free > 0.4 ? 1 : 0) : free > 0.6 ? 1 : 0; const nf = tierA * c.nOn; c.na = c.naAt === fnow - 1 ? fadeTo(c.na, nf, stepA) : nf; c.naAt = fnow; if (c.nOn) ygAdd(x, y, hw, hh, 1); if (c.na < 0.02) continue;   // (a name keeps its place: the characters of the stars give way to it, and it to the names of larger families)
        const na = A * dimA * c.na * lerp(lerp(0.5, 0.86, zf) * fall, 1, lit) * (sel >= 0 && c.i !== selC ? 1 - 0.45 * selK : 1) * moonK(x, y, s) * edgeK(x, y), kc = 0.25 + 0.75 * Math.max(lit, zf);
        nmC[0] = lerp(tf[0], tc[0], kc); nmC[1] = lerp(tf[1], tc[1], kc); nmC[2] = lerp(tf[2], tc[2], kc);
        x += c.fx; y += c.fy; const sg = spriteFor('cnG' + c.i, c.ch, 'k', s * d, null, 480); if (sg) { pushKno(x - wOff, y, s, sg, null, na); pushLabel(x - wOff, y, s, sg, 0, nmC, na, mk, 0, 0); }
        if (wn && tA > 0.03) { const sb = spriteFor('cnN' + c.i, c.name, ja ? 'w' : 'e', sn * d, null, 470); if (sb) pushLabel(x - wOff + s / 2 + 6 + wn / 2, y + (s - sn) * 0.3, sn, sb, 0, nmC, na * 0.9 * tA, mk, 0, 0); }
        st.nHits.push({ ci: c.i, x, y, w: s + 2 * wOff + 12, h: s * 1.6 }); }
      /* the words: the learner's own as the lit lines of his sky, and every word of the touched star (their lines lie under the stars) */
      drawStarWords(A * dimA, unit, false);
      /* the stars: a point of light each; from about 11 px its character, where it has room (the figure stars and the brightest take theirs first) */
      st.hits.length = 0; const big = SA.px * 1.2 / d, pm = st.pm, farK = Math.max(smooth(7.5, 10.5, unit), st.selA), tNow = S.reduced ? 0 : S.t;   // (from far off every star is a point, also where the wide view enlarges the edges)
      for (const q of [sel, st.prev ? st.prev.k : -1]) if (q >= 0 && sproj(st.P, q * 3, sp3)) { const cq = st.cons[st.con[q]]; lpt(cq, sp3, 1); const en = q === sel ? st.selA : st.prev.a, c0 = starSize(q, st.u * sp3[2], cq.m), cs = lerp(c0, starSel(c0), en); ygAdd(sp3[0], sp3[1], cs * 0.56, cs * 0.6, en); }   // the touched star outranks every other
      let capsDone = false, onMoon = 0, nSP = 0;
      for (let q = 0; q < st.order.length; q += 1) { const k = st.order[q], o = k * 3; if (!capsDone && st.role[k] !== 0) { starCaps(unit); capsDone = true; }   /* (the figure stars are done: now the words beneath them, then the field stars) */
        const c = st.cons[st.con[k]], fig = st.role[k] === 0; if (!c.ok || !sproj(st.P, o, sp3)) { st.ss[k] = 0; continue; } if (fig) lpt(c, sp3, 1); else lptD(c, sp3, layOf(k), c.mS); const x = sp3[0], y = sp3[1], up = st.u * sp3[2]; st.sx[k] = x; st.sy[k] = y; st.ss[k] = up;   // (where it is seen: at its family's depth)
        if (x < -40 || x > Wd + 40 || y < -40 || y > Hd + 40) { st.cs[k] = 0; continue; }
        const m = st.mag[k], lit = c.lw, isSel = k === sel, mate = pm[k] >= fnow - 1, z = up / 26, fall = c.fall;
        const hush = sel >= 0 && !isSel && !mate && c.i !== selC ? 1 - 0.62 * selK : 1;   // a star is touched: the stars that are neither its family nor its partners step back
        const en = isSel ? st.selA : st.prev && st.prev.k === k ? st.prev.a : 0; let cs = starSize(k, up, c.m) * (fig ? 1 + 0.14 * c.lit.x : lerp(1.2, 0.42, smooth(0.9, 4.4, st.df[k]))); if (en > 0) cs = lerp(cs, starSel(cs), en); st.cs[k] = cs;   // (the touched star is the largest thing in view; the figure stars of its family are written a little larger)
        const sel1 = isSel || (st.prev && st.prev.k === k), eK = edgeK(x, y), mK = sel1 ? 1 : moonK(x, y, Math.max(3, cs * 0.5 * st.ca[k]));
        const ps = (fig ? 1.9 + 2.3 * m : 1.2 + 1.7 * m) * clamp(Math.pow(z, 0.32), 0.62, 1.8), pa = Math.min(1, (fig ? 0.62 + 0.38 * m : 0.3 + 0.45 * m) * (0.85 + 0.4 * lit)) * hush * A * dimA * Math.sqrt(fall) * mK;   // (a point of light loses less than writing does as its family falls back: the far sky stays a dust of stars)
        /* its character is written, or the star is a point: nothing rests between. It is written from about 11.5 px where it stands clear of every brighter star's character; it leaves again only when it is
         * clearly smaller or clearly covered, so nothing trembles at the limit. The passage itself (a third of a second) is travelled only when the eye has moved it across that limit */
        const thr = fig ? 11.4 : 12.2, hk = st.on[k] ? 0.84 : 1, room = isSel ? 1 : ygFree(x, y, cs * 0.5 * hk, cs * 0.52 * hk)   /* (hk: what is written holds its place until another really lies on it; what is not yet written needs clear room. So two neighbours that draw together as the sky turns do not flicker in and out) */, on = isSel || (SA.done && farK > 0.5 && (st.on[k] ? cs > thr - 0.5 && room > 0.4 : cs > thr + 0.3 && room > 0.6)); st.on[k] = on ? 1 : 0; if (on && !isSel) ygAdd(x, y, cs * 0.5, cs * 0.52, 1);
        const ca = st.ca[k] = st.caAt[k] === fnow - 1 ? fadeTo(st.ca[k], on ? 1 : 0, stepA) : on ? 1 : 0; st.caAt[k] = fnow; if (ca > 0.02 && x > 12 && x < Wd - 12 && y > 12 && y < Hd - 12) { st.shown[st.nShown] = k; st.nShown += 1; }
        { const dk = Math.max(clamp((st.dep[k] - 0.3) / 0.7, 0, 1) * 0.8, c.cool * 0.85), gw = c.lead * (fig ? 0.52 : 0.22) * (1 - dk) * (1 - selK); starCol[0] = lerp(lerp(tc[0], tf[0], dk), mk[0], gw); starCol[1] = lerp(lerp(tc[1], tf[1], dk), mk[1], gw); starCol[2] = lerp(lerp(tc[2], tf[2], dk), mk[2], gw); }   // (cooler the deeper it stands in its family, and the farther its family has fallen back; the family that leads is written in the old sky's warm cream-gold: its text colour carried about halfway to its gold, as that sky writes its nearest words)
        { const fl = fig ? 1 : 0.62; if (tNow) { const amp = Math.min(0.03 * up, 1.6) * (1 - en), p2 = k * 2; st.dx[k] = amp * Math.sin(tNow * (0.16 + 0.08 * st.ph[p2 + 1]) + st.ph[p2] * 6.2832) + c.fx * fl; st.dy[k] = amp * Math.cos(tNow * (0.2 + 0.07 * st.ph[p2]) + st.ph[p2 + 1] * 6.2832) + c.fy * fl; } else { st.dx[k] = 0; st.dy[k] = 0; } }   // it floats with its family (a field star, which stands deeper, a little less far: the layers of a family drift against each other), and a little on its own round its resting place (periods of 26 to 39 s); everything above was decided from the resting place
        const X = x + st.dx[k], Y = y + st.dy[k];
        if (ca < 0.99) { pushPt(X, Y, ps, starCol, pa * (1 - ca) * maskAt(X, Y), 0); if (ca < 0.5 && pa > 0.05 && x > 0 && x < Wd && y > 0 && y < Hd - S.foot) nSP += 1; }   // (a written star shows no point: nothing shines through the openings of its character)
        if (ca > 0.01) { const al = Math.min(1, (fig ? 0.84 + 0.16 * m : 0.4 + 0.2 * m + 0.3 * smooth(12, 22, cs)) * (0.9 + 0.3 * c.lit.x) + en + (mate ? 0.3 : 0)) * hush * ca * A * dimA * (en > 0.5 ? 1 : fall) * eK * mK, col = en > 0.5 ? tc : starCol; let sp = null;
          if (cs > big) sp = spriteFor('st' + k, D.kanji[k][0], 'w', cs * d, null, isSel ? 2600 : 300 + cs, en > 0 ? 2 : 0);
          if (!sp) { STC.u = (k % SA.cols) * SA.cell; STC.v = Math.floor(k / SA.cols) * SA.cell; } pushKno(X, Y, cs, sp, sp ? null : STC, al);
          if (sp && fig && c.lead > 0.04 && cs >= 15 && en < 0.5) pushLabel(X, Y + cs * 0.015, cs * 1.035, sp, 0, pal.c[0], 0.66 * al * smooth(15, 24, cs) * c.lead, mk, 0, 3.0);   // the old sky's soft ground of its own ink directly under its nearest letters: on it the gold reads as light
          pushLabel(X, Y, cs, sp, 0, col, al, mk, 0, en > 0.5 ? 0 : 0.6 * c.cool, sp ? null : STC); }   // (what has fallen back is a little soft as well as smaller and cooler: distance, not dimness)
        if (sel >= 0 && c.i === selC && ca > 0.3 && LENS.mr > 0 && Math.hypot(x - LENS.mx, y - LENS.my) < LENS.mr + cs * 0.45) onMoon += 1;
        if (cs >= 8 || ps >= 2.4) st.hits.push(k); }
      /* the moon hides what is behind it (moonK). Only the family of a touched star, when it stands before the moon, makes the moon step back, so that what he touched can be read whole */
      spring(st.moonS, onMoon ? 1 : 0, 3.2, dt); if (S.reduced) { st.moonS.x = onMoon ? 1 : 0; st.moonS.v = 0; } S.moonH = clamp(st.moonS.x, 0, 1) * st.kk;
      drawStarWords(A * dimA, unit, 1); drawStarField(A * dimA, unit); drawRiver(A * dimA, unit);
      { let kIn = 0; for (let q = 0; q < st.nShown; q += 1) { const k = st.shown[q]; if (st.sx[k] > 0 && st.sx[k] < Wd && st.sy[k] > 0 && st.sy[k] < Hd - S.foot) kIn += 1; }   // what the frame holds, for whoever measures it: lights (points of words, of stars, of the river) and what can be read (characters, words, kana, names)
        W.starStats = { lights: st.nLight + nSP + river.nPt, wordLights: st.nLight, starLights: nSP, riverLights: river.nPt, kanji: kIn, words: st.nWrit, kana: river.nOn, names: st.nHits.length, readable: kIn + st.nWrit + river.nOn + st.nHits.length, points: nPts, lead: st.leadCi >= 0 ? st.cons[st.leadCi].key : '', mids: [st.midA, st.midB].map((q) => (q >= 0 ? st.cons[q].key : '')).join('') }; }
      st.bandCi = -1;   // (no ruler on the horizon: the sea of clouds is the horizon, and a family's name is written once, under its figure)
    }
    /** The whole language at rest: every word is a light near its home star. Whether it is a point or can be read
     * depends only on where the eye is: it is written from about 10 px, where it has room (it gives way to every
     * star's character, to the touched star's words, and to the words before it in the fixed order of rank). From far
     * off the rarer words fall away first, so the figures stay clear. His own words are gold and a little larger.
     * Each floats a little round its resting place; what is drawn is decided from the resting place alone. */
    const wCol = [1, 1, 1];
    /** The commonest word of every figure star in view takes its room beneath its star: after the figure stars'
     * characters, before the field stars' (so a field star gives way to it and stays a point). In the order of rank. */
    function starCaps(unit) {
      const st = star, fnow = S.frame, Wd = S.W, Hd = S.H, keepW = 1 - st.selS.x; if (!W.fonts || unit < 12 || keepW < 0.02) return;
      for (let q = 0; q < st.order.length; q += 1) { const k = st.order[q]; if (st.role[k] !== 0) break; const l = st.homed[k]; if (!l.length || k === st.sel || !(st.ss[k] > 0) || st.layMark[l[0]]) continue; if (st.sx[k] < -60 || st.sx[k] > Wd + 60 || st.sy[k] < -60 || st.sy[k] > Hd + 60) continue;
        capGeom(k, 0); const wi = l[0], ws = capG[2], own = W.front[wi] === 1, thr = own ? 9.8 : lerp(6.5, 9.8, capG[5]), ok = (own || keepW > 0.5) && st.fzS < 0.3 && capG[1] < Hd - S.foot - 8, room = ok && ws > thr - 0.4 ? ygFree(capG[0], capG[1], capG[3], capG[4]) : 0, on = ok && (st.won[wi] ? ws > thr - 0.4 && room > 0.4 : ws > thr + 0.2 && room > 0.6); st.won[wi] = on ? 1 : 0; if (on) ygAdd(capG[0], capG[1], capG[3], capG[4], 1); st.capW[k] = on ? 1 : 0; st.capAt[k] = fnow; }   // (written or a point, like the stars: see drawStars)
    }
    /* the place and size of the first (j = 0) or second word written beneath figure star k: x, y, size, half width, half height. The first stands
     * just clear of its star's character (by the same measure of room that everything here keeps), the second just clear of the first. */
    const capG = [0, 0, 0, 0, 0, 1];
    function capGeom(k, j) {
      const st = star, selK = st.selS.x, l = st.homed[k], c = st.cons[st.con[k]], m = c.m, capK = Math.pow(st.ss[k] / m / HOME_U, 0.55) * Math.pow(m, 0.7) * (0.74 + 0.26 * st.rf[k]) * (1 + 0.1 * c.lit.x * (1 - selK)) * (st.sel < 0 ? 1 : 1 - 0.18 * selK);   // (a word is written by how far forward its family stands and by the rank of its star: about 18 px under the leading family's commonest kanji, about 10 px two families out, a point beyond)
      const s0 = 11 * capK * (W.front[l[0]] === 1 ? 1.08 : 1), h0 = s0 * 0.55 + 1, y0 = st.sy[k] + 1.1 * (lerp(4, st.cs[k] * 0.52, st.ca[k]) + h0) + 0.6; capG[0] = st.sx[k];
      if (!j) { capG[1] = y0; capG[2] = s0; capG[3] = st.wl[l[0]] * s0 * 0.52 + 3; capG[4] = h0; }
      else { const s1 = 8.7 * capK * (W.front[l[1]] === 1 ? 1.08 : 1), h1 = s1 * 0.55 + 1; capG[1] = y0 + 1.1 * (h0 + h1) + 0.6; capG[2] = s1; capG[3] = st.wl[l[1]] * s1 * 0.52 + 3; capG[4] = h1; }
      /* a family of the far plane carries no words beneath its stars: there these two are dust like the rest, at their own places round the star, and they come in under the star as the family comes forward (capE: 0 dust, 1 beneath the star) */
      const e = c.capE; capG[5] = e; if (e < 0.999) { const wi = l[j]; if (sproj(st.wP, wi * 3, sp4)) { lptD(c, sp4, 0.6, c.mD); const sd = (10 - 0.42 * j + 0.22 * W.lvl[wi]) * Math.pow(st.u * sp4[2] / c.m / 34, 0.7) * Math.pow(c.m, 0.12) * (W.front[wi] === 1 ? 1.25 : 1);
          capG[0] = lerp(sp4[0], capG[0], e); capG[1] = lerp(sp4[1], capG[1], e); capG[2] = lerp(sd, capG[2], e); capG[3] = st.wl[wi] * capG[2] * 0.52 + 3; capG[4] = capG[2] * 0.55 + 1; } }
      return capG;
    }
    function drawStarField(A, unit) {
      const st = star, D = W.D, pal = S.pal, tc = pal.text, tf = pal.textFar, mk = pal.mark, d = S.dpr, fnow = S.frame, Wd = S.W, Hd = S.H, t = S.reduced ? 0 : S.t, selK = st.selS.x, wP = st.wP, far = smooth(5, 9.5, unit), selC = st.sel >= 0 ? st.con[st.sel] : -1, dome = st.fzS, foot = Hd - S.foot;
      st.fHits.length = 0; let nLight = 0, nWrit = 0;
      for (const c of st.conOrder) { if (!c.vis) continue; const hushC = selC < 0 ? 1 : (1 - 0.45 * selK) * (c.i !== selC ? 1 - 0.5 * selK : 1), small = selC < 0 ? 1 : 1 - 0.18 * selK;   // a star is touched: every other word steps back, dimmer and smaller than the touched star's own words
        /* in three turns, so that rank and not the order of the list settles who has room: first the commonest word of every figure star, written
         * close beneath its star (the words he reads at the first glance); then each figure star's second word beneath that; then all the other words, at their places round their stars */
        for (let pass = 0; pass < 3; pass += 1) for (const k of c.members) { const l = st.homed[k]; if (!l.length || !(st.ss[k] > 0)) continue; const kx = st.sx[k], ky = st.sy[k]; if (kx < -170 || kx > Wd + 170 || ky < -170 || ky > Hd + 170) continue;
          const fig = st.role[k] === 0, cap = pass < 2; if (cap && (!fig || k === st.sel)) continue; const gradeW = fig ? 1 : lerp(1, 0.56, smooth(0.9, 4.2, st.df[k]));
          for (let j = cap ? pass : fig ? 2 : 0, je = cap ? Math.min(l.length, pass + 1) : l.length; j < je; j += 1) { const wi = l[j], cw = st.wC[wi], own = W.front[wi] === 1, fa = own || far >= 0.99 ? 1 : clamp((cw - 0.75 * (1 - far)) / 0.15 + 1, 0, 1); if (fa < 0.02) continue;
            let x, y, up, cws = 0, chw = 0, chh = 0; if (cap) { up = st.ss[k]; capGeom(k, j); x = capG[0]; y = capG[1]; cws = capG[2]; chw = capG[3]; chh = capG[4]; } else { if (!sproj(wP, wi * 3, sp3)) continue; lptD(c, sp3, 0.6, c.mD); x = sp3[0]; y = sp3[1]; up = st.u * sp3[2]; }   // (the dust of words stands deepest in its family: it shifts least under the pointer)
            if (x < -20 || x > Wd + 20 || y < -20 || y > Hd + 20) continue;
            const mark = st.layMark[wi], gone = mark === 1 ? st.selA : mark === 2 && st.prev ? st.prev.a : 0, aB = A * hushC * fa * (1 - gone) * moonK(x, y, 5), a0 = aB * (cap || own ? c.fall : Math.sqrt(c.fall)); if (a0 < 0.02) continue;   // (a word of the touched star is written once, on its line. The dust loses less light than writing does as its family falls back: the far sky stays full of lights)
            /* how large it would be written. A word beneath a figure star: by its star (capGeom). His own: a little larger than its neighbours. Every other word is the dust of its family: small, by how common it is,
             * how far forward its family stands and how near the eye is; a field star's words are smaller the farther that star stands from the figure's strokes, so the eye coming nearer finds the figure's own words first */
            const ur = up / c.m, ws = cap ? cws : (own ? 12.5 * Math.pow(ur / 26, 0.55) * Math.pow(c.m, 0.6) : (10 - 0.42 * Math.min(j, 8) + 0.22 * W.lvl[wi]) * Math.pow(ur / 34, 0.7) * Math.pow(c.m, 0.12) * gradeW) * small, hw = cap ? chw : st.wl[wi] * ws * 0.52 + 2, hh = cap ? chh : ws * 0.58 + 1.5; let la = 0;
            if (W.fonts) { const held = cap && j === 0 && st.capAt[k] === fnow, pad = cap ? 0 : ws < 9 ? 1.3 : 2.4, capE = cap ? capG[5] : 0, thr = own ? 9.8 : cap ? lerp(6.5, 9.8, capE) : 6.5 + (fig ? 0 : 0.4); let on;   /* (a word is written or it is a point. The words of one star do not all come at one size: the j-th needs 0.9 px more than the one before it, so coming nearer brings them a few at a time, the commonest first. The second word beneath a star belongs to the family that leads; a field star's words wait until its own character is written) */
              if (held) on = st.capW[k] > 0.5; else { const ok = (own || selK < 0.5) && (!cap || j === 0 || LENS.K < 0.3 || capE < 0.5 || (st.won[wi] ? c.lw > 0.4 : c.lw > 0.6)) && (own || dome < 0.3) && (cap || own || (ws < 10 && (st.won[wi] ? unit < 50 : unit < 44)) || (st.on[k] === 1 && j < (fig ? 2 + Math.floor((st.cs[k] - 20) / 10) : Math.floor((st.cs[k] - 9) / 7)))) && y < foot - 8, room   /* (at the resting distance the dust resolves into small writing wherever it has room. Nearer, a word is written only as one of its star's own: a star's size buys its words, the commonest first, so the field is graded from the figure outward: beside the strokes a character with a word, farther out a smaller character alone, beyond that points) */ = ok && ws > thr - 0.4 ? ygFree(x, y, (hw + pad) * (st.won[wi] ? 0.84 : 1), (hh + pad) * (st.won[wi] ? 0.84 : 1)) : 0; on = ok && (st.won[wi] ? ws > thr - 0.4 && room > 0.4 : ws > thr + 0.2 && room > 0.6); if (on) ygAdd(x, y, hw + pad, hh + pad, 1); st.won[wi] = on ? 1 : 0; }   /* (its room is taken a little larger than the word, by as much as it may float; and while a star is touched the other words, his own apart, fall back to points: the touched star's words are the words) */
              la = st.wa[wi] = st.waAt[wi] === fnow - 1 ? fadeTo(st.wa[wi], on ? 1 : 0, st.stepA * (cap || own || ws > 10.5 ? 1 : 3))   /* (the dust comes and goes quickly, in about a tenth of a second: a point that turns into a small word, or back, while the eye moves) */ : on ? 1 : 0; st.waAt[wi] = fnow; }   // (held: its room was taken for it before the field stars' characters, see starCaps. A word that must go fades out; it is never cut off)
            if (cap) { x += st.dx[k]; y += st.dy[k]; } else { if (t) { const amp = Math.min(0.085 * up, 2.2), p = wi * 2; x += amp * Math.sin(t * (0.17 + 0.09 * st.wph[p + 1]) + st.wph[p] * 6.2832); y += amp * Math.cos(t * (0.21 + 0.08 * st.wph[p]) + st.wph[p + 1] * 6.2832); } x += c.fx * 0.45; y += c.fy * 0.45; }   // (a word beneath a star floats with that star; the others each on their own, with periods of 24 to 37 s, and less than half as far with their family: the dust drifts behind the figure)
            /* its colour: his own words in the sky's gold; the words beneath the leading family's stars warm, toward that gold; the dust by how common the word is (the commonest warm white, the rare ones the sky's far blue), cooler as its family falls back */
            const lv = W.lvl[wi], capE = cap ? capG[5] : 0, dk = own ? 0 : Math.max(lerp(0.22 + 0.6 * (1 - cw), j ? 0.34 : 0.16, capE), c.cool * 0.85), gw = own ? 0 : c.lead * (1 - selK) * (cap ? (j ? 0.2 : 0.34) : 0.16) * (1 - dk), col = own ? mk : wCol; if (!own) { wCol[0] = lerp(lerp(tc[0], tf[0], dk), mk[0], gw); wCol[1] = lerp(lerp(tc[1], tf[1], dk), mk[1], gw); wCol[2] = lerp(lerp(tc[2], tf[2], dk), mk[2], gw); }
            const inV = x > 0 && x < Wd && y > 0 && y < foot;
            if (la < 0.98) { const mA = maskAt(x, y), pk = clamp(Math.pow(up / 34, 0.3), 0.6, 1.5) * (0.56 + 0.24 * Math.min(1.7, c.m));   // a point of light, as the old sky draws its far words: by level, the commonest the largest, brightest and warmest
              if (own) pushPt(x, y, 4.6 * pk, mk, 0.95 * a0 * (1 - la) * mA, 0.8);   // (his own: gold, with a fine glint)
              else { const pc = cap ? 0.2 : PT_C[lv]; ptc[0] = lerp(lerp(tc[0], tf[0], pc), tf[0], c.cool * 0.5); ptc[1] = lerp(lerp(tc[1], tf[1], pc), tf[1], c.cool * 0.5); ptc[2] = lerp(lerp(tc[2], tf[2], pc), tf[2], c.cool * 0.5); pushPt(x, y, PT_S[lv] * pk * 0.82, ptc, Math.min(1, PT_A[lv] * 2.1) * (0.74 + 0.46 * cw) * aB * (1 - 0.2 * c.cool) * (1 - la) * mA, 0); }
              if (inV && mA > 0.5) nLight += 1; }
            if (la > 0.02) { const alt = st.say[wi], useBase = !alt && ws * d <= BASE_PX * 1.14 && W.hasBase(wi), sp = useBase ? null : spriteFor(alt ? 'sy' + wi : wi, alt || D.words[wi][0], 'w', ws * d, null, 200 + ws);
              if (sp || useBase || (!alt && W.hasBase(wi))) { const al = (own ? 1 : lerp(lerp(0.52, 0.84, smooth(6.5, 11.5, ws)) * (0.8 + 0.2 * cw), j ? 0.74 : 0.94, capE)) * a0 * la * edgeK(x, y); if (ws >= 8.6) pushKno(x, y, ws, sp, null, al, wi, true);
                pushLabel(x, y, ws, sp, wi, col, al, mk, 0, own ? 0 : (1 - capE) * (0.45 * c.cool + 0.25 * smooth(9.5, 7, ws))); if (own) pushPt(x + hw + 5, y - ws * 0.5, 4.2, mk, 0.95 * al, 0.95);   // (far and small type is a little soft, as distance makes it; his own word carries its glint at its shoulder)
                st.fHits.push({ wi, x, y, w: 2 * hw, h: ws * 1.3 }); if (inV) nWrit += 1; } } } } }
      st.nLight = nLight; st.nWrit = nWrit;
    }
    /** 天の川: the river of kana, the far plane of the sky (see setKana). Every kana word is a light, with the river's foam of fine specks round it; a word is written
     * where the river passes the middle of the view, or the eye has come near; written or a point, never between. It takes its room last: it gives way to every star,
     * word and name. The far plane lies behind the dome that swells toward the eye: it is carried a little way with the swell and no more, so at the resting distance
     * the river is seen across the upper sky, over the constellations, and it passes the hand slower than everything in front of it. In the farthest view it rings the zenith. */
    const rvC = [1, 1, 1], rv3 = [0, 0, 0];
    function riverAt(P, o) {   // where a place of the river is seen: rv3 = x, y, px to one unit there; returns how near the middle of the view it stands (1 in the middle), or -1
      if (!sproj(P, o, sp3)) return -1; const dx = sp3[0] - S.px, dyr = sp3[1] - S.py, dy = dyr * 1.3, ir2 = 1 / (LENS.r0 * LENS.r0), tt = Math.sqrt((dx * dx + dy * dy) * ir2), at = tt > 1e-3 ? Math.atan(tt) / tt : 1, g = LENS.mF + (LENS.mN - LENS.mF) * at * 0.15;
      const X = S.px + dx * g - LENS.swx * 0.55, Y = S.py + dyr * g - LENS.swy * 0.55, ex = X - S.px, ey = (Y - S.py) * 1.3; rv3[0] = X; rv3[1] = Y; rv3[2] = sp3[2] * g; return 1 / (1 + (ex * ex + ey * ey) * ir2);
    }
    function drawRiver(A, unit) {
      const rv = river, st = star; rv.hits.length = 0; rv.nPt = 0; rv.nOn = 0; if (!rv.ok || A < 0.02) return;
      const pal = S.pal, tc = pal.text, tf = pal.textFar, mk = pal.mark, d = S.dpr, Wd = S.W, Hd = S.H, foot = Hd - S.foot, fnow = S.frame, t = S.reduced ? 0 : S.t, K = LENS.K, selK = st.selS.x, hush = 1 - 0.55 * selK, dome = st.fzS, ja = opt.lang === 'ja', far = smooth(5, 9.5, unit), stepA = st.stepA;
      /* the foam: nameless specks, the river's own; they give the band its soft light */
      { const Sp = rv.S, n4 = rv.n * 4, a0 = A * hush * (0.5 + 0.1 * far); rvC[0] = lerp(tc[0], tf[0], 0.6); rvC[1] = lerp(tc[1], tf[1], 0.6); rvC[2] = lerp(tc[2], tf[2], 0.6);
        for (let q = 0; q < n4; q += 1) { if (riverAt(Sp, q * 3) < 0) continue; let x = rv3[0], y = rv3[1]; if (x < -6 || x > Wd + 6 || y < -6 || y > Hd + 6) continue; const h = rv.ph[(q >> 2) * 2 + (q & 1)], h2 = (h * 7.31 + (q & 3) * 0.37) % 1;
          if (t) { x += 3.2 * Math.sin(t * 0.105 + h * 6.2832); y += 2.4 * Math.cos(t * 0.12 + h * 6.2832); }
          pushPt(x, y, 0.85 + 0.75 * h2, rvC, a0 * (0.45 + 0.75 * h2) * moonK(x, y, 0) * maskAt(x, y), 0); if (y > 0 && y < foot && x > 0 && x < Wd) rv.nPt += 1; } }
      for (let i = 0; i < rv.n; i += 1) { const w2 = riverAt(rv.P, i * 3); if (w2 < 0) { rv.on[i] = 0; rv.y[i] = 1e9; continue; } let x = rv3[0], y = rv3[1]; const up = st.u * rv3[2]; rv.x[i] = x; rv.y[i] = y; rv.sc[i] = up; if (x < -60 || x > Wd + 60 || y < -30 || y > Hd + 30) { rv.on[i] = 0; continue; }
        const br = rv.br[i], isSel = i === rv.sel, mR = lerp(1, lerp(0.8, 1.75, smooth(0.25, 0.95, w2)), K), ws = (7 + 5 * br) * Math.pow(up / 34, 0.75) * mR * (isSel ? 1.25 : 1), hw = rv.len[i] * ws * 0.5 + 2, hh = ws * 0.58 + 1.5, mK = moonK(x, y, hw);
        let on = false; if (W.fonts && dome < 0.3 && (selK < 0.5 || isSel) && y < foot - 8) { const room = ws > 6.2 ? ygFree(x, y, hw + 1.5, hh + 1.5) : 0; on = isSel ? ws > 6.2 && room > 0.3 : rv.on[i] ? ws > 6.4 && room > 0.4 : ws > 6.9 && room > 0.6; if (on) ygAdd(x, y, hw + 1.5, hh + 1.5, 1); }   // (written or a point: decided where it rests, with a little hold so nothing trembles at the limit)
        rv.on[i] = on ? 1 : 0; const la = rv.a[i] = rv.aAt[i] === fnow - 1 ? fadeTo(rv.a[i], on ? 1 : 0, stepA) : on ? 1 : 0; rv.aAt[i] = fnow;
        if (t) { const p = i * 2; x += 3.2 * Math.sin(t * 0.105 + rv.ph[p] * 6.2832); y += 2.4 * Math.cos(t * 0.12 + rv.ph[p] * 6.2832); }   // (the river floats as one water: a word and its foam go together, slowly)
        const a0 = A * hush * mK;
        const cool = lerp(0.62, 0.3, w2) * (1 - 0.6 * br); rvC[0] = lerp(tc[0], tf[0], cool); rvC[1] = lerp(tc[1], tf[1], cool); rvC[2] = lerp(tc[2], tf[2], cool);
        if (la < 0.98) { pushPt(x, y, 1.4 + 1.6 * br, rvC, (0.52 + 0.45 * br) * a0 * (1 - la) * maskAt(x, y), 0); if (y > 0 && y < foot && x > 0 && x < Wd) rv.nPt += 1; }
        if (la > 0.02) { const sp = spriteFor('kn' + i, rv.w[i][0], 'w', ws * d, null, 150 + ws); if (sp) { const al = (isSel ? 1 : lerp(0.4, 0.86, smooth(6.5, 13, ws)) * (0.7 + 0.3 * br)) * a0 * la * edgeK(x, y); if (ws >= 8.6) pushKno(x, y, ws, sp, null, al, 0, true);
            pushLabel(x, y, ws, sp, 0, isSel ? tc : rvC, al, mk, 0, isSel ? 0 : 0.3 * (1 - w2)); rv.hits.push({ i, x, y, w: 2 * hw, h: ws * 1.3 }); if (y > 0 && y < foot && x > 0 && x < Wd) rv.nOn += 1; } } }
      /* its name, once and quietly: at the one of its eight places that stands nearest the middle of the view */
      if (W.fonts) { let bi = -1, bd = 1e9, bx = 0, by = 0; for (let q = 0; q < rv.names.length; q += 1) { if (riverAt(rv.names[q], 0) < 0) continue; const x = rv3[0], y = rv3[1]; if (y < 40 || y > foot - 30 || (dome > 0.3 && y > S.py)) continue; const dd = Math.abs(x - S.px); if (dd < bd) { bd = dd; bi = q; bx = x; by = y; } }
        const nm = rv.nm, s1 = S.small ? 11 : 12.5, s2 = S.small ? 9.5 : 10.5, tj = '天の川 かな', te = 'the river of kana', w1 = wideOf(tj, s1, 0.5), w2e = ja ? 0 : wideOf(te, s2, 0.5), hw = (w1 + (w2e ? 8 + w2e : 0)) / 2 + 4, hh = s1 * 0.7 + 2;
        let on = false; if (bi >= 0 && bd < Wd * 0.46 && selK < 0.5) { const room = ygFree(bx, by, hw, hh); on = nm.on && nm.q === bi ? room > 0.4 : room > 0.6; if (on) ygAdd(bx, by, hw, hh, 1); } nm.on = on ? 1 : 0; nm.q = bi; nm.a = nm.at === fnow - 1 ? fadeTo(nm.a, on ? 1 : 0, stepA) : on ? 1 : 0; nm.at = fnow;
        if (nm.a > 0.02 && bi >= 0) { const al = A * hush * nm.a * 0.6 * moonK(bx, by, hw) * edgeK(bx, by), x0 = bx - hw + 4; rvC[0] = lerp(tc[0], tf[0], 0.4); rvC[1] = lerp(tc[1], tf[1], 0.4); rvC[2] = lerp(tc[2], tf[2], 0.4);
          const sj = spriteFor('rvJ', tj, 'w', s1 * d, null, 460, true); if (sj) { pushKno(x0 + w1 / 2, by, s1, sj, null, al, 0, true); pushLabel(x0 + w1 / 2, by, s1, sj, 0, rvC, al, mk, 0, 0); }
          if (w2e) { const se = spriteFor('rvE', te, 'e', s2 * d, null, 455, true); if (se) pushLabel(x0 + w1 + 8 + w2e / 2, by + (s1 - s2) * 0.3, s2, se, 0, rvC, al * 0.9, mk, 0, 0); } } }
      /* the river's milk: each word lays a wide faint glow, and together they are the band. These are queued last and drawn over the margins of sky under the type (see S.drawWorld), so a word that stands in the river has the river behind it too */
      glowFrom = nPts; { const ga = 0.05 * A * hush * (1 - 0.3 * dome); for (let i = 0; i < rv.n; i += 1) { const x = rv.x[i], y = rv.y[i]; if (x < -90 || x > Wd + 90 || y < -90 || y > Hd + 90) continue; pushPt(x, y, (78 + 20 * rv.ph[i * 2 + 1]) * clamp(rv.sc[i] / 25, 0.25, 1.2), tf, ga * moonK(x, y, 40) * maskAt(x, y), -1); } }   // (each glow is wider than the distance to the next word: no single one can be made out)
    }
    /** The lines of the stars' order, and the words written on them. At rest no line is drawn at all: every word,
     * his own among them (in gold), is a light at its home star. A touched star lights its words as lines.
     * labels 0: the lines (they lie under the stars); 1: the words on them. */
    function drawStarWords(A, unit, labels) {
      const st = star; if (labels) st.wHits.length = 0;
      if (st.prev) starTouched(st.prev.k, st.prev.lay, A * st.prev.a, labels, false); if (st.sel >= 0) starTouched(st.sel, st.lay, A * st.selA, labels, true);
      /* a word touched where it floats: its own line is lit from star to star (and both stars, and both their families: see the faced weight in drawStars) */
      if (!labels && st.word >= 0) { const mk = S.pal.mark, tc = S.pal.text, own = W.front[st.word] === 1; spring(st.wordS, 1, 8, 0.016); litCol[0] = lerp(tc[0], mk[0], 0.5); litCol[1] = lerp(tc[1], mk[1], 0.5); litCol[2] = lerp(tc[2], mk[2], 0.5);
        let from = -1; for (const k2 of W.D.words[st.word][4]) { if (st.con[k2] < 0 || k2 === from) continue; st.pm[k2] = S.frame; if (from >= 0) starLine(from, k2, own ? mk : litCol, 0.95 * A * st.wordS.x, 0.6 * A * st.wordS.x, 1.2, 1, 1e7); from = k2; } }
    }
    /** The words of a touched star (cur), or of the one touched before it while that one fades (not cur). labels 0: every
     * word as a line to its partner star, full at the star and fading along its length, but reaching; 1: the words,
     * each at the place on its own line that the touch gave it (see starLayout). */
    function starTouched(k, lay, aK, labels, cur) {
      const st = star, D = W.D, mk = S.pal.mark, tc = S.pal.text, d = S.dpr, fnow = S.frame; if (aK < 0.01 || !lay) return; if (labels && !(st.ss[k] > 0)) return;
      const x = st.sx[k], y = st.sy[k], grow = st.cs[k] / lay.cs0, zr = st.ss[k] / (st.cons[st.con[k]].m || 1) / lay.up0, items = lay.items;   // (zr: how much nearer the eye itself has come; the depth of the family is not approach)
      litCol[0] = lerp(tc[0], mk[0], 0.5); litCol[1] = lerp(tc[1], mk[1], 0.5); litCol[2] = lerp(tc[2], mk[2], 0.5);   // a lit line: the sky's gold, paler than the full gold of his own words
      for (let rank = 0; rank < items.length; rank += 1) { const it = items[rank], wi = it.wi, mate = it.mate, own = W.front[wi] === 1, col = own ? mk : tc, held = cur && wi === st.why;
        if (!labels && cur) it.la = fadeTo(it.la, it.step < lay.open ? 1 : smooth(LAYER_AT[it.step], LAYER_AT[it.step] + 0.24, zr), st.stepA);   // a layer beyond the first two comes with one more touch of the star, or with one more step of approach
        const al = aK * it.wt * it.la; if (al < 0.012) { if (labels) it.at = -9; continue; }
        if (!labels) { if (mate < 0) continue; let from = k; for (const k2 of D.words[wi][4]) { if (k2 === from || st.con[k2] < 0) continue; if (k2 !== k && cur) st.pm[k2] = fnow; starLine(from, k2, own ? mk : litCol, Math.min(1, al * (held ? 1.25 : 0.9)), (held ? 0.8 : 0.2) * al, held ? 1.5 : 0.9, it.arc, 300 * st.u / Math.max(4, st.ss[k] || 26)); from = k2; } continue; }   // a thread: fine, brightest at the star; the one he has touched is held brighter
        const size = it.size, hw = it.hw, hh = it.hh; let cx, cy, above = true;
        if (mate >= 0) { const sg = it.t < 0.98 ? 1 : -1; if (!lmid(k, mate, it.t, it.arc, sp3) || !lmid(k, mate, it.t + 0.012 * sg, it.arc, sp4)) { it.at = -9; continue; }
          let ux = (sp4[0] - sp3[0]) * sg, uy = (sp4[1] - sp3[1]) * sg; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul; const nx = uy * it.side, ny = -ux * it.side, off = hw * Math.abs(nx) + hh * Math.abs(ny) + 2; cx = sp3[0] + nx * off; cy = sp3[1] + ny * off; above = ny <= 0.2; }   // just clear of its line, on the side the touch gave it
        else { cx = x + it.dx * grow; cy = y + it.dy * grow; }
        if (cx < -hw || cx > S.W + hw || cy < -20 || cy > S.H + 20) { it.at = -9; continue; }
        if (cur) { const want = ygFree(cx, cy, hw, hh); ygAdd(cx, cy, hw, hh, want * it.la); it.a = it.at === fnow - 1 ? fadeTo(it.a, want, st.stepA) : want; it.at = fnow; }
        const la = al * it.a; if (la < 0.02) continue;
        const sp = spriteFor(wi, D.words[wi][0], 'w', size * d, null, 700 - rank); if (!sp && !W.hasBase(wi)) continue;
        pushLabel(cx, cy, size, sp, wi, col, Math.min(1, la * 1.15), mk, 0, 0);
        if (it.tier === 2 && W.rd[wi]) { const ra = smooth(1.12, 1.45, zr) * la; if (ra > 0.03) { const rs = size * 0.56, sr = spriteFor('rd' + wi, W.rd[wi], 'w', rs * d, null, 400); if (sr) pushLabel(cx, above ? cy - size * 0.6 - rs * 0.56 : cy + size * 0.6 + rs * 0.6, rs, sr, 0, tc, 0.78 * ra, mk, 0, 0); } }   // its reading, on approach, on the side away from the line
        if (cur) st.wHits.push({ wi, k: mate, x: cx, y: cy, w: 2 * hw, h: size * 1.4 }); }
    }
    /** NOT DRAWN since the sky was given its depth (2026-11-12): the ruler on the horizon, its ticks, the realm names on it
     * and the name and count of the faced family are gone; the sea of clouds is the horizon and a family's name stands once,
     * under its figure (see drawStars). The function is kept only so the builder after can see what was there; nothing calls it.
     * It was: the horizon in the stars' order: the same engraved line, a tick where each family in view stands, a taller one
     * and the realm's name where a realm begins, and the full name and count of the constellation the eye faces. */
    function starBand(A) {
      if (A < 0.03 || !W.fonts) return; const st = star, E = view.eye, f = view.fwd, ce = Math.sqrt(1 - BAND_E * BAND_E), col = S.pal.line, tc = S.pal.text, mk = S.pal.mark, d = S.dpr, ja = opt.lang === 'ja', sm = S.small, yaw = Math.atan2(f[0], f[2]), left = sm ? 10 : 20, right = S.W - (sm ? 50 : 66);
      const r2e = E[0] * E[0] + E[2] * E[2], raw = (az) => { const dx = Math.sin(az), dz = Math.cos(az), bq = E[0] * dx + E[2] * dz, t = -bq + Math.sqrt(Math.max(0, bq * bq - (r2e - STAR_R * STAR_R))); stc[0] = E[0] + dx * t; stc[1] = -1.2 * st.u; stc[2] = E[2] + dz * t; return sproj(stc, 0, sp4) ? [sp4[0], sp4[1]] : null; }, pc = raw(yaw); if (!pc) return;   // the horizon of this order is the foot of the wall of stars: no star stands below it
      const yb = clamp(pc[1], sm ? 86 : 72, S.H - S.foot - (sm ? 104 : 98)), at = (az) => { const p = raw(az); return p ? [p[0], yb + clamp(p[1] - pc[1], -70, 46)] : null; }, half = Math.min(2.5, Math.atan(S.W / (4 * S.Fz)) * 2 + 0.2); band.y = yb;
      let p0 = at(yaw - half); for (let q = 1; q <= 44; q += 1) { const p1 = at(yaw - half + 2 * half * q / 44); if (p0 && p1) pushLine(p0[0], p0[1], p1[0], p1[1], 0, 0.7, col, 0.3 * A, 1); p0 = p1; }
      let fx = S.px; for (const c of st.cons) { if (!c.vis) continue; const az = Math.atan2(c.C[0] - E[0], c.C[2] - E[2]); if (Math.abs(wrapA(az - yaw)) > half) continue; const p = at(az); if (!p) continue; const lit = c.lit.x; if (c.i === st.face) fx = p[0];
        pushLine(p[0], p[1] - lerp(c.tier <= 2 ? 6.5 : 3.5, 10, lit), p[0], p[1] + 0.5, 0, 0.9, col, lerp(c.tier <= 2 ? 0.62 : 0.4, 1, lit) * A, 1); }
      for (const rm of st.realms) { const az = Math.atan2(STAR_R * Math.sin(rm.az) - E[0], STAR_R * Math.cos(rm.az) - E[2]); if (Math.abs(wrapA(az - yaw)) > half) continue; const p = at(az); if (!p || p[0] < left || p[0] > right) continue; pushLine(p[0], p[1] - 12, p[0], p[1] + 20, 0, 1.1, col, 0.9 * A, 1);
        const sz = sm ? 11 : 11.5, w = wideOf(rm.name, sz, 0.5); if (p[0] + 8 + w > right || Math.abs(p[0] + 7 + w / 2 - (st.sel >= 0 ? S.px : fx)) < w / 2 + 130) continue; const sp = spriteFor('sbR' + rm.i, rm.name, ja ? 'w' : 'e', sz * d, null, 490, true); if (sp) pushLabel(p[0] + 7 + w / 2, p[1] + 13, sz, sp, 0, tc, 0.55 * A, mk, 0, 0); }   // (a realm's name stands under the line, clear of the stars above it and of what is written of the faced family)
      const c = st.cons[st.sel >= 0 ? st.con[st.sel] : st.face]; st.bandCi = c ? c.i : -1; if (!c) return; const s1 = sm ? 16 : 19, s2 = sm ? 12.5 : 15, s3 = 12, cnt = ja ? c.n + '字' : c.n + (c.n === 1 ? ' character' : ' characters'), wl = wideOf(c.label, s1, 0.5), wn = c.name ? 9 + wideOf(c.name, s2, 0.5) : 0, wA = Math.max(wl + wn, wideOf(cnt, s3, 0.52));
      const cx = clamp(st.sel >= 0 ? S.px : fx, left + wA / 2 + 6, Math.max(left + wA / 2 + 6, right - wA / 2 - 6)), y1 = yb + 19, xs = cx - (wl + wn) / 2;
      const sa = spriteFor('sbF' + c.i, c.label, 'k', s1 * d, null, 520, 2); if (!sa) return; const wa = sa.w * s1 / sa.px, pa2 = 12 * s1 / sa.px; pushLabel(xs - pa2 + wa / 2, y1, s1, sa, 0, tc, 0.96 * A, mk, 0, 0);
      if (c.name) { const sb = spriteFor('sbG' + c.i, c.name, ja ? 'w' : 'e', s2 * d, null, 515, 2); if (sb) { const wb = sb.w * s2 / sb.px, pb2 = 12 * s2 / sb.px; pushLabel(xs + wl + 9 - pb2 + wb / 2, y1 + (s1 - s2) * 0.37, s2, sb, 0, tc, 0.92 * A, mk, 0, 0); } }
      const sc2 = spriteFor('sbC' + c.i, cnt, 'w', s3 * d, null, 510, 2); if (sc2) pushLabel(cx, y1 + s1 * 0.62 + 5 + s3 * 0.6, s3, sc2, 0, tc, 0.76 * A, mk, 0, 0);
      if (A > 0.5 && !st.nHits.some((h) => h.ci === c.i)) st.nHits.push({ ci: c.i, x: cx, y: y1 + 9, w: wA + 18, h: 46, band: true });   // what is written of the faced family under the horizon is a door to its whole figure
    }
    /** The eye's resting place in the stars' order: inside the ring, level with the middle of the band, at the distance
     * where one unit of the band is 26 px, facing the part of the band that holds most of the learner's own words. */
    function starHome() {
      const bins = new Float32Array(40); for (const wi of W.frontList) for (const k of W.D.words[wi][4]) if (star.con[k] >= 0) bins[Math.floor((((Math.atan2(star.P[k * 3], star.P[k * 3 + 2]) % TAU) + TAU) % TAU) / TAU * 40) % 40] += 1;
      let best = 0, bv = -1; for (let q = 0; q < 40; q += 1) { const v = bins[q] + bins[(q + 1) % 40] + bins[(q + 39) % 40]; if (v > bv) { bv = v; best = q; } }
      let az = (best + 0.5) / 40 * TAU; { const mz = Math.atan2(S.moon.dir[0], S.moon.dir[2]); let bc = null, bd = 9; for (const c of star.cons) { if (c.tier > 2 || c.figN < 3) continue; const ca = Math.atan2(c.C[0], c.C[2]), dd = Math.abs(wrapA(ca - az)) + (Math.abs(wrapA(ca - mz)) < 0.2 ? 1 : 0) + Math.abs(c.C[1] / star.u - 12) * 0.04; if (dd < bd) { bd = dd; bc = c; } } if (bc) az = Math.atan2(bc.C[0], bc.C[2]); }   // (the eye opens on one family, the large one nearest to where most of his own words are, standing in the middle of the view: it leads from the first moment. Never one that would stand before the moon)
      const re = STAR_R - star.u * S.F / HOME_U, E = [re * Math.sin(az), 12 * star.u, re * Math.cos(az)];
      for (let q = 0; q < 3; q += 1) { star.E[q].x = E[q]; star.E[q].v = 0; star.Eto[q] = E[q]; } star.lf.x = star.lfTo = Math.log(S.F); star.lf.v = 0; cam.a = az; cam.aTo = null; tgt.yaw = 0; cam.yaw.x = 0; cam.yaw.v = 0; tgt.pitch = 0.02; cam.pitch.x = 0.02; cam.pitch.v = 0; star.fly = null; star.home = true;
    }
    /** Come nearer (dz > 0) or draw back along the line of sight under a place on the screen: what stands under it stays
     * under it. Drawing back ends at the far side of the ring; from there the view widens instead, and narrows again first. */
    function starZoom(dz, x, y) {
      star.fly = null; star.glide = null; if (star.hold && Math.hypot(star.hold.x - x, star.hold.y - y) < 3) star.hold.t = S.t; else star.hold = starAnchor(x, y);   // (one stroke of the wheel after another at one place holds the same thing)
      if (dz > 0 && star.fzTo > 1e-3) { sray(x, y, sv); if (sv[1] < 0.985) star.orb += wrapA(Math.atan2(sv[0], sv[2]) - cam.a) * Math.min(1, dz * 0.9 / star.fzTo); star.fzTo = Math.max(0, star.fzTo - dz * 0.9); return; }   // coming down from the farthest view: the eye turns toward what is under the pointer as it comes
      sray(x, y, sv); const E = star.Eto, dh2 = sv[0] * sv[0] + sv[2] * sv[2]; if (dh2 < 1e-4) return;
      const bq = (E[0] * sv[0] + E[2] * sv[2]) / dh2, r2 = E[0] * E[0] + E[2] * E[2], t = -bq + Math.sqrt(Math.max(0, bq * bq - (r2 - STAR_R * STAR_R) / dh2)); if (!(t > 1)) return;   // how far along that line the wall of figure stars stands
      let t2 = t * Math.exp(-dz);
      if (dz > 0) t2 = Math.max(t2, Math.min(t, 170));
      else { const RB = 0.66 * STAR_R, disc = bq * bq - (r2 - RB * RB) / dh2, sMin = Math.min(0, disc >= 0 ? -bq - Math.sqrt(disc) : -bq), tMax = t - sMin; if (t2 > tMax) { star.fzTo = Math.min(1, star.fzTo + Math.log(t2 / tMax) * 0.9); t2 = tMax; } }   // past the far side of the ring the eye rises to the farthest view: the whole ring round the zenith
      const s = t - t2; star.Eto = [E[0] + sv[0] * s, clamp(E[1] + sv[1] * s, 40, 26 * star.u), E[2] + sv[2] * s];
    }
    /** Carry the eye to a place, a direction and a width of view (smoothly; at once under reduced motion). */
    function starFlyTo(E1, yaw1, pitch1, lf1, fz1) {
      star.fzTo = fz1 || 0;
      cam.a += cam.yaw.x; tgt.yaw = 0; cam.yaw.x = 0; cam.yaw.v = 0; cam.aTo = null;   // (among the stars cam.a is the whole direction of the eye)
      const yaw0 = cam.a, E0 = [star.E[0].x, star.E[1].x, star.E[2].x], dist = Math.hypot(E1[0] - E0[0], E1[1] - E0[1], E1[2] - E0[2]), ang = Math.abs(wrapA(yaw1 - yaw0));
      star.Eto = E1.slice(); star.lfTo = lf1; vel.a = vel.yaw = vel.pitch = 0; star.orb = 0; star.glide = null;
      if (S.reduced || (dist < 2 && ang < 0.002 && Math.abs(lf1 - star.lf.x) < 0.002)) { for (let q = 0; q < 3; q += 1) { star.E[q].x = E1[q]; star.E[q].v = 0; } star.lf.x = lf1; star.lf.v = 0; cam.a = yaw1; tgt.pitch = cam.pitch.x = pitch1; cam.pitch.v = 0; star.fly = null; return; }
      star.fly = { t: 0, T: Math.max(clamp(0.55 + 0.4 * ang + dist / 9000, 0.6, 1.5), Math.abs(star.fzTo - star.fz.x) > 0.02 ? 1.3 : 0), E0, E1: E1.slice(), yaw0, dyaw: wrapA(yaw1 - yaw0), p0: cam.pitch.x, p1: pitch1, lf0: star.lf.x, lf1, fz0: star.fz.x, fz1: star.fzTo };
    }
    /** Turn the ring of stars about its hub by th: the eye travels round with its view, so the near stars pass the deeper ones. */
    function starOrbit(th) {
      if (!th) return; const c = Math.cos(th), s = Math.sin(th), E = star.E, T = star.Eto; let x = E[0].x, z = E[2].x; E[0].x = x * c + z * s; E[2].x = z * c - x * s; x = E[0].v; z = E[2].v; E[0].v = x * c + z * s; E[2].v = z * c - x * s; x = T[0]; z = T[2]; T[0] = x * c + z * s; T[2] = z * c - x * s; cam.a += th;
    }
    /** The stars' own clock: where the eye is, each frame. Travel begun by a touch runs its course unless his hand takes over; everything else follows his hand with a little weight. */
    function starStep(dt, on) {
      if (!star.ok) return; const to = on ? 1 : 0; if (S.reduced) { star.k.x = to; star.k.v = 0; } else { spring(star.k, to, 3.6, dt); if (Math.abs(star.k.x - to) < 0.003) { star.k.x = to; star.k.v = 0; } }
      const k = clamp(star.k.x, 0, 1); star.kk = k * k * (3 - 2 * k); S.stereo = star.kk; S.starK = lerp(1, 0.34, star.kk);   // (the dust of the sky behind steps back: here the stars are the kanji. In the farthest view the zenith keeps its own stars: see uZen in FS_COMP)
      const lb = Math.log(S.F); if (star.lb && Math.abs(lb - star.lb) > 1e-6) { star.lf.x += lb - star.lb; star.lfTo += lb - star.lb; } star.lb = lb; if (!star.home) { star.lf.x = star.lfTo = lb; }
      if (star.kk > 0) {
        if (star.fly) { const fl = star.fly; fl.t = Math.min(1, fl.t + dt / fl.T); const q = fl.t, m = q * q * q * (q * (6 * q - 15) + 10); for (let c = 0; c < 3; c += 1) { star.E[c].x = fl.E0[c] + (fl.E1[c] - fl.E0[c]) * m; star.E[c].v = 0; }
          cam.a = fl.yaw0 + fl.dyaw * m; cam.pitch.x = tgt.pitch = fl.p0 + (fl.p1 - fl.p0) * m; cam.pitch.v = 0; star.lf.x = fl.lf0 + (fl.lf1 - fl.lf0) * m; star.lf.v = 0; star.fz.x = fl.fz0 + (fl.fz1 - fl.fz0) * m; star.fz.v = 0; if (q >= 1) star.fly = null; }   // (the fold into the farthest view and out of it runs on the flight's own curve: one movement, not two)
        else { if (star.glide) { const g = star.glide, q = Math.max(0, 1 - g.t / g.T), f = q * q * 1.5; star.orb += g.va * f * dt; tgt.pitch += g.vp * f * dt; g.t += dt; if (g.t >= g.T) star.glide = null; }   // letting go: the ring glides on and comes to rest in four tenths of a second, without a stop and without a bounce
          if (star.orb) { const st2 = Math.abs(star.orb) < 1e-5 ? star.orb : star.orb * (1 - Math.exp(-dt * 26)); starOrbit(st2); star.orb -= st2; }
          /* coming nearer or drawing back: what stood under the pointer is held under it. The travel itself keeps the wall of stars there; this keeps the family's own body there while its depth changes with the eye */
          if (star.hold) { const h = star.hold; if ((S.t - h.t > 0.9 && !(star.planeMove >= S.frame - 24 && S.t - h.t < 2.6)) || pt.down || star.fzTo > 1e-3 || !anchorNow(h, anc4)) star.hold = null; else { const c = star.cons[h.ci], kpx = c.uc / star.u, ex = h.x - anc4[0], ey = h.y - anc4[1];
              if (Math.abs(ex) > 0.05 || Math.abs(ey) > 0.05) { const dth = clamp(-ex / (kpx * STAR_R * anc4[2]), -0.03, 0.03), dp = clamp(ey / (S.Fz * anc4[3]), -0.03, 0.03); starOrbit(dth); tgt.pitch += dp; cam.pitch.x += dp; } } }
          for (let c = 0; c < 3; c += 1) spring(star.E[c], star.Eto[c], 13, dt); spring(star.lf, star.lfTo, 13, dt); }
        spring(star.selS, star.sel >= 0 ? 1 : 0, 9, dt); if (star.sel < 0 && star.selS.x < 0.01) { star.selS.x = 0; star.selS.v = 0; } if (star.sel >= 0 && star.selS.x > 0.99) { star.selS.x = 1; star.selS.v = 0; } if (S.reduced) star.selS.x = star.sel >= 0 ? 1 : 0;
        if (star.sel >= 0) star.selA = S.reduced ? 1 : Math.min(1, star.selA + dt / 0.32); if (star.prev) { star.prev.a -= dt / 0.32; if (star.prev.a <= 0 || S.reduced) { layMarks(star.prev.lay, 2, 0); star.prev = null; } }   // a touch lights a star's words, and lets the last star's words go, over a third of a second
        const isFar = star.fzTo > 0.5; if (isFar !== star.far) { star.far = isFar; if (W.onOver && on) W.onOver(isFar); } }
      if (!star.fly) { spring(star.fz, star.fzTo, 3.4, dt); if (Math.abs(star.fz.x - star.fzTo) < 0.0015) { star.fz.x = star.fzTo; star.fz.v = 0; } } if (S.reduced) star.fz.x = star.fzTo; /* (by the wheel the fold takes about a second; by the seal it follows the flight, see starStep) */ { const q = clamp(star.fz.x, 0, 1); star.fzS = q * q * (3 - 2 * q); }
      S.Fz = Math.exp(lerp(star.lf.x, starLzen(), star.fzS)); S.zen = star.fzS * star.kk;
    }
    /* the focal length of the farthest view: the foot of the ring of stars (a little under the horizon) just inside the shorter side of the view */
    const starLzen = () => Math.log(Math.max(40, (Math.min(S.W / 2 - 30, (S.H - S.foot) / 2 - 34)) / 2.48));   // (2.48: the ring stands as large as the view allows without cutting the largest figures at the frame; the rim of cloud beyond it is narrow, see uZen in FS_SKY)
    /** The farthest view of the stars (the whole ring of constellations round the zenith, as figures with names), and back from it. */
    function starFar(on) {
      const a = cam.a + cam.yaw.x, re = on ? -0.66 * STAR_R : STAR_R - star.u * S.F / HOME_U;
      starFlyTo([re * Math.sin(a), 12 * star.u, re * Math.cos(a)], a, 0.02, Math.log(S.F), on ? 1 : 0); if (W.web && W.web.isOpen()) W.web.close();   // (from far off the eye looks a little up: the band of constellations under the dome, not the sea of clouds)
    }
    /** Back to the resting place, by travel. */
    function starHomeFly() {
      const E0 = [star.E[0].x, star.E[1].x, star.E[2].x], a0 = cam.a + cam.yaw.x, p0 = cam.pitch.x, l0 = star.lf.x; starHome(); const E1 = star.Eto.slice(), a1 = cam.a;
      for (let q = 0; q < 3; q += 1) star.E[q].x = E0[q]; cam.a = a0; cam.pitch.x = tgt.pitch = p0; star.lf.x = l0; starFlyTo(E1, a0 + wrapA(a1 - a0), 0.02, Math.log(S.F));
    }
    W.starHome = starHomeFly;
    /* for the passage between this order and the others: every word leaves from, and returns to, its first star */
    function layoutStar(out) {
      layoutForm(out); const D = W.D; for (let i = 0; i < W.n; i += 1) { let k0 = -1; for (const k of D.words[i][4]) if (star.con[k] >= 0) { k0 = k; break; } if (k0 < 0) continue; const o = i * 3, q = k0 * 3; out[o] = star.P[q]; out[o + 1] = star.P[q + 1]; out[o + 2] = star.P[q + 2]; }
    }
    /** Arrive at a star, by any route: it stands in the middle of the view, the largest thing there, its constellation
     * round it, and every word that holds it lit. */
    function starGo(k, keep) { river.sel = -1;
      if (!star.ok || !(k >= 0) || !(star.con[k] >= 0)) return false; if (W.web && W.web.isOpen()) W.web.close(); if (W.lens !== 'star') setLens('star'); if (tgt.ov > 0.5) setOver(false); if (!star.home) starHome();
      const c = star.cons[star.con[k]], P = star.P, o = k * 3, az = Math.atan2(P[o], P[o + 2]), mind = Math.min(S.W, S.H - S.foot - 90), Dn = clamp(c.r * S.F / (0.42 * mind), 640, 2600), re = STAR_R - Dn, E1 = [re * Math.sin(az), P[o + 1], re * Math.cos(az)];   // (the eye stays inside the wall of figure stars, level with the star, at the distance from which its whole family is in view)
      if (k !== star.sel) { starDrop(); star.sel = k; star.selA = S.reduced ? 1 : 0; star.lay = starLayout(k, E1, az); layMarks(star.lay, 0, 1); }
      star.con1 = -1; if (!keep) { const at = star.trail.indexOf(k); if (at >= 0) star.trail.length = at + 1; else star.trail.push(k); if (star.trail.length > 7) star.trail.shift(); }
      starFlyTo(E1, az, 0, Math.log(S.F)); if (W.onStar) W.onStar(); return true;
    }
    /* the touched star is let go: its words fade (they are not cut off) */
    function starDrop() { star.why = -1; star.word = -1; if (star.sel < 0) return; if (star.prev) layMarks(star.prev.lay, 2, 0); star.prev = star.selA > 0.02 && !S.reduced ? { k: star.sel, lay: star.lay, a: star.selA } : null; layMarks(star.lay, 1, star.prev ? 2 : 0); star.sel = -1; star.selA = 0; star.lay = null; }
    /* which words are written on a touched star's lines just now (1), or on those of the star let go and fading (2): their lights in the field stand back meanwhile, so every word is written once */
    function layMarks(lay, from, to) { if (lay) for (const it of lay.items) if (!from || star.layMark[it.wi] === from) star.layMark[it.wi] = to; }
    /** Frame a whole constellation. */
    function starFrame(ci) {
      const c = star.cons[ci]; if (!c) return false; if (W.lens !== 'star') setLens('star'); if (!star.home) starHome(); const az = Math.atan2(c.C[0], c.C[2]), mind = Math.min(S.W, S.H - S.foot - 120);
      let un = 0.36 * mind * star.u / c.r; { const tg = un; for (let q = 0; q < 12; q += 1) un = 0.5 * (un + tg / (1 + ((S.small ? 1.5 : 2.0) - 1) * (1 - smooth(34, 170, un)) * smooth(13, 30, un))); }   // (a family framed in the middle of the view stands forward, see LENS: the eye stops where the family, as it is then drawn, fills the frame)
      const Dn = clamp(star.u * S.F / un, 700, 5600), re = STAR_R - Dn;
      starDrop(); star.trail.length = 0; star.con1 = ci; starFlyTo([re * Math.sin(az), c.C[1], re * Math.cos(az)], az, 0, Math.log(S.F)); if (W.onStar) W.onStar(); return true;
    }
    /** One step back along the stars he has touched; from the first, the star is let go (the eye stays where it is). */
    function starBack() { if (star.trail.length > 1) { star.trail.pop(); return starGo(star.trail[star.trail.length - 1], true); } return W.starLetGo(); }
    function pickStar(px, py, slop) {
      const st = star, inB = (h) => Math.abs(px - h.x) <= h.w / 2 + slop && Math.abs(py - h.y) <= h.h / 2 + slop; for (const h of st.wHits) if (inB(h)) return { t: 'sw', i: h.wi, k: h.k, rd: W.rd[h.wi] }; for (const h of st.oHits) if (inB(h)) return { t: 'w', i: h.wi };
      { let bw = null; for (const h of st.fHits) if (inB(h) && (!bw || h.h > bw.h)) bw = h; if (bw && bw.h >= 16) return { t: 'w', i: bw.wi }; var wordUnder = bw; }   // a word that can be read near its star (a large one before the star beside it; a small one after)
      let best = -1, bd = 1e9; for (const k of st.hits) { const dx = px - st.sx[k] - st.dx[k], dy = py - st.sy[k] - st.dy[k], rr = Math.max(9, st.cs[k] * 0.58) + slop, d2 = dx * dx + dy * dy; if (d2 < rr * rr && d2 < bd) { bd = d2; best = k; } }
      if (best >= 0 && (!wordUnder || bd < Math.pow(Math.max(5, st.cs[best] * st.ca[best] * 0.5), 2))) return { t: 's', i: best }; if (wordUnder) return { t: 'w', i: wordUnder.wi }; if (best >= 0) return { t: 's', i: best };
      for (const h of st.nHits) if (inB(h)) return { t: 'sc', i: h.ci }; for (const h of river.hits) if (inB(h)) return { t: 'kw', i: h.i }; return null;   // (last, a word of the river of kana that is written there)
    }
    W.starGo = starGo; W.starFrame = starFrame; W.starBack = starBack; W.starCon = (ci) => { star.con1 = star.con1 === ci ? -1 : ci; starDrop(); star.trail.length = 0; if (W.onStar) W.onStar(); };
    W.starAlong = (wi, k) => { if (k >= 0) return starGo(k); return false; };   // a lit word touched: the eye travels along it to the partner star
    /* one more touch of the touched star: its next layer of words. A first touch of a lit word: the word says why it exists (see the margin line); the second flies along it. */
    W.starMore = () => { const lay = star.lay; if (!lay) return false; for (let q = lay.open; q < 6; q += 1) if (lay.has[q]) { lay.open = q + 1; if (W.onStar) W.onStar(); return true; } return false; };
    W.starWhy = (wi) => { if (star.why === wi) return false; star.why = wi; if (W.onStar) W.onStar(); return true; };
    W.starCount = () => { const lay = star.lay; if (!lay) return [0, 0]; let n = 0; for (const it of lay.items) if (it.step < lay.open || it.la > 0.5) n += 1; return [n, lay.items.length]; };
    W.starAway = () => star.sel >= 0 || star.con1 >= 0 || star.far || Math.abs(tgt.pitch - 0.02) > 0.07 || Math.abs(Math.hypot(star.Eto[0], star.Eto[2]) - (STAR_R - star.u * S.F / HOME_U)) > 80 || Math.abs(star.Eto[1] - 12 * star.u) > 50;
    W.starKana = (i) => { if (!river.ok || i < 0 || i >= river.n) return null; river.sel = i; star.word = -1; if (W.onStar) W.onStar(); return river.w[i]; };   // a kana word of the river touched: it is lit and says what it means (the caller writes the line); it has no stars to fly to and nothing to open
    W.starWord = (wi) => { river.sel = -1; if (star.word === wi) return false; star.word = wi; star.wordS.x = 0; star.wordS.v = 0; if (W.onStar) W.onStar(); return true; };   // a first touch of a word where it floats: it shows its line and says what it is made of; false = it was already touched (the caller then opens it)
    W.starLetGo = () => { if (star.sel < 0 && star.con1 < 0 && star.word < 0 && river.sel < 0) return false; river.sel = -1; star.word = -1; starDrop(); star.con1 = -1; star.trail.length = 0; if (W.onStar) W.onStar(); return true; };

    /* ------------------------------------------------------------ the hand
     * drag: turn the eye (the sky follows the finger), with a little sideways travel so near words still pass faster;
     * scroll: fly along the line of sight; sideways scroll: travel round the ring; pinch or pulling far back: rise above. */
    function pick(px, py, slop) {
      if (W.web) { const h = W.web.pick(px, py, slop); if (h) return h; if (W.web.isOpen()) return null; }
      if (W.lens === 'star' && star.kk > 0.5) return pickStar(px, py, slop);
      if (view.over > 0.3) return null;
      for (const h of W.gHits) if (h.i >= 0 && Math.abs(px - h.x) <= h.w / 2 + slop && Math.abs(py - h.y) <= h.s * 0.7 + slop) return { t: 'g', i: h.i };
      let best = -1, bz = 1e9; for (const i of hits) { const o = i * 5, hw = W.vis[o + 4] / 2 + slop, hh = W.vis[o + 2] * 0.62 + slop; if (Math.abs(px - W.vis[o]) <= hw && Math.abs(py - W.vis[o + 1]) <= hh) { const z = -W.vis[o + 2]; if (z < bz) { bz = z; best = i; } } }
      if (best >= 0) return { t: 'w', i: best };
      if (W.lens === 'mean' && W.hHits) for (const h of W.hHits) if (h.on && Math.abs(px - h.x) <= h.s * 0.56 + slop && Math.abs(py - h.y) <= h.s * 0.62 + slop) return { t: 'h', i: h.k };   // the head of a family is a door to its character
      if (W.lens === 'mean' && W.sHits) for (const h of W.sHits) if (h.gi != null && h.on && !h.nd && Math.abs(px - h.x) <= h.w / 2 + slop && py >= h.y - h.s * 0.7 - slop && py <= h.y + h.s * 0.8 + h.b + slop) return { t: 'r', i: h.gi };   // the sign of a radical group is a door to its whole family
      return null;
    }
    W.pick = pick;   // the engine's own rule for what lies under a place on the screen, for whoever needs it (the ear). Among the stars: { t: 's', i: kanji } a star; { t: 'sw', i: word, k: partner kanji or -1, rd: stored reading } a word of the touched star, on its line or beside the star; { t: 'w', i: word } one of his own words; { t: 'sc', i: constellation } a name
    const local = (e) => { const r = wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const pt = S.pointer;
    function setHover(h) { const i = h && h.t === 'w' ? h.i : -1; hoverKind = h ? h.t : ''; const key = h ? h.t + ':' + (h.i != null ? h.i : h.id) : ''; if (key !== W.hoverKey) { W.hoverKey = key; hover = i; if (i >= 0 && !awake.has(i)) awake.set(i, { x: 0, v: 0 }); if (W.onHover) W.onHover(h); } wrap.classList.toggle('on-word', !!h); }
    const onMove = (e) => {
      const [x, y] = local(e); pt.x = x; pt.y = y; pt.inside = true;
      if (e.target !== canvas && !pt.down) { pt.inside = false; setHover(null); return; }   // over a seal or a caption the pointer belongs to that control, not to the word behind it
      if (pinch.ids.has(e.pointerId)) { pinch.ids.set(e.pointerId, [x, y]); if (pinch.ids.size === 2) { const [a, b] = [...pinch.ids.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (W.lens === 'star' && star.ok) { if (!(W.web && W.web.isOpen()) && pinch.dl > 0 && d > 0) { starZoom(Math.log(d / pinch.dl) * 1.15, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch.dl = d; if (W.onTouch) W.onTouch('fly'); } }   // two fingers: nearer or farther, about the place between them
          else if (tgt.ov > 0.5) { if (d > pinch.d0 * 1.25) setOver(false); } else if (!(W.web && W.web.isOpen())) { const z = pinch.z0 + (d - pinch.d0) * 4.2; if (z < -420) { setOver(true); pinch.d0 = d; } else tgt.offZ = z; } return; } }
      if (pt.down && e.pointerId === pt.id) {
        const ddx = x - pt.lx, ddy = y - pt.ly; pt.moved += Math.abs(ddx) + Math.abs(ddy);
        if (pt.moved > 6) { const now = performance.now(), dtm = Math.max(8, now - pt.lt) / 1000; grabbed = true; wrap.classList.add('grabbing');
          if (W.web && W.web.isOpen()) { if (W.web.turn) W.web.turn(ddx, ddy); }
          else if (W.lens === 'star' && star.ok) {   // the ring of stars is held where it was touched: sideways it turns about its hub under the finger, up and down the eye looks up and down
            star.fly = null; sray(x, y, sv); const E = view.eye, dh2 = sv[0] * sv[0] + sv[2] * sv[2] || 1e-6, bq = (E[0] * sv[0] + E[2] * sv[2]) / dh2, t = Math.max(120, -bq + Math.sqrt(Math.max(0, bq * bq - (E[0] * E[0] + E[2] * E[2] - STAR_R * STAR_R) / dh2))), c = sv[0] * view.fwd[0] + sv[1] * view.fwd[1] + sv[2] * view.fwd[2], kpx = 2 * S.Fz / (1 + c) / t;
            let dth = clamp(-ddx / (kpx * STAR_R), -0.2, 0.2), dp = ddy * (1 + c) / (2 * S.Fz);
            if (pt.anc && anchorNow(pt.anc, anc4)) { dth /= anc4[2]; dp /= anc4[3]; }   // (what he took hold of stays under the finger: a family that stands forward passes faster than the wall, so the sky turns less for the same stroke)
            if (star.fzS > 0.6) { sray(pt.lx, pt.ly, sv); const a0 = Math.atan2(sv[0], sv[2]); sray(x, y, sv); dth = clamp(wrapA(a0 - Math.atan2(sv[0], sv[2])), -0.3, 0.3); dp = 0; }   // in the farthest view the ring is a wheel round the zenith: it turns with the finger
            star.orb += dth; tgt.pitch += dp; vel.a = lerp(vel.a, dth / dtm, 0.35); vel.pitch = lerp(vel.pitch, dp / dtm, 0.35); vel.yaw = 0; }
          else if (tgt.ov > 0.5) { const k = 0.0042; cam.a -= ddx * k; vel.a = lerp(vel.a, -ddx * k / dtm, 0.35); tgt.phi = clamp(tgt.phi + ddy * 0.0036, 0.44, 1.32); }   // sideways turns the wheel, up and down tilts it
          else { const k = 1 / S.F, ks = 0.35 * (900 / S.F) / Math.max(400, RE + cam.offZ.x); tgt.yaw -= ddx * k; tgt.pitch += ddy * k; cam.a -= ddx * ks;
            vel.yaw = lerp(vel.yaw, -ddx * k / dtm, 0.35); vel.pitch = lerp(vel.pitch, ddy * k / dtm, 0.35); vel.a = lerp(vel.a, -ddx * ks / dtm, 0.35); }
          vel.yaw = clamp(vel.yaw, -2.2, 2.2); vel.pitch = clamp(vel.pitch, -1.4, 1.4); vel.a = clamp(vel.a, tgt.ov > 0.5 ? -1.6 : -0.12, tgt.ov > 0.5 ? 1.6 : 0.12);   // a flick carries on a little, never spins away
          pt.lt = now; if (W.onTouch) W.onTouch('turn'); }
        pt.lx = x; pt.ly = y; return;
      }
      if (e.pointerType !== 'touch') { S.par.x = clamp(x / S.W * 2 - 1, -1, 1); S.par.y = clamp(y / S.H * 2 - 1, -1, 1); }
      if (star.hold && Math.hypot(x - star.hold.x, y - star.hold.y) > 3) star.hold = null;   // (the pointer has moved on: nothing is held any more)
    };
    const onDown = (e) => { if (e.button > 0 || e.target !== canvas) return; const [x, y] = local(e); pinch.ids.set(e.pointerId, [x, y]); if (pinch.ids.size === 2) { const [a, b] = [...pinch.ids.values()]; pinch.d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); pinch.dl = pinch.d0; pinch.z0 = tgt.offZ; pt.down = false; grabbed = false; return; }
      star.glide = null; star.hold = null; pt.anc = W.lens === 'star' && star.ok && star.kk > 0.5 ? starAnchor(x, y) : null; pt.down = true; pt.id = e.pointerId; pt.moved = 0; pt.sx = pt.lx = x; pt.sy = pt.ly = y; pt.lt = performance.now(); vel.a = vel.yaw = vel.pitch = 0; try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } };
    const onUp = (e) => { pinch.ids.delete(e.pointerId); if (!pt.down || e.pointerId !== pt.id) return; pt.down = false; wrap.classList.remove('grabbing'); const was = grabbed; grabbed = false;
      if (was) { if (performance.now() - pt.lt > 90) vel.a = vel.yaw = vel.pitch = 0; if (Math.abs(vel.yaw) < 0.012) vel.yaw = 0; if (Math.abs(vel.pitch) < 0.012) vel.pitch = 0; if (Math.abs(vel.a) < 0.0006) vel.a = 0;
        if (W.lens === 'star' && star.ok) { star.glide = vel.a || vel.pitch ? { t: 0, T: 0.34, va: vel.a, vp: vel.pitch } : null; vel.a = vel.yaw = vel.pitch = 0; } if (W.web && W.web.turnEnd) W.web.turnEnd(); return; }
      vel.a = vel.yaw = vel.pitch = 0; const [x, y] = local(e);
      if (tgt.ov > 0.5 && view.over > 0.6) {   // above the ring: a touch on the ring is where to come down
        if (W.rimHits && W.web) { const sl = e.pointerType === 'touch' ? 12 : 4, rh = W.rimHits.find((b) => b.f >= S.frame - 1 && Math.abs(x - b.x) <= b.w / 2 + sl && Math.abs(y - b.y) <= b.h / 2 + sl); if (rh && rh.ki != null) { starGo(rh.ki); return; } if (rh && W.lens === 'mean' && W.web.openFamily) { W.web.openFamily(rh.gi); return; } }   // a touch on a group's name on the rim opens that radical's whole family
        const d = [view.fwd[0] * S.F + view.right[0] * (x - S.px) + view.up[0] * (S.py - y), view.fwd[1] * S.F + view.right[1] * (x - S.px) + view.up[1] * (S.py - y), view.fwd[2] * S.F + view.right[2] * (x - S.px) + view.up[2] * (S.py - y)];
        if (d[1] < -1e-3) { const t = -view.eye[1] / d[1], hx = view.eye[0] + d[0] * t, hz = view.eye[2] + d[2] * t, rr = Math.hypot(hx, hz); if (rr > 1500 && rr < 7600) cam.aTo = Math.atan2(hx, hz); } setOver(false); return; }
      const h = pick(x, y, e.pointerType === 'touch' ? 14 : 5);
      if (W.web) W.web.tap(h, e); };
    const onLeave = () => { pt.inside = false; S.par.x = 0; S.par.y = 0; setHover(null); };
    const onWheel = (e) => { e.preventDefault(); const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY; if (W.web && W.web.isOpen()) { if (W.web.fly && !e.ctrlKey) W.web.fly(dy * 1.15); return; }   // a whole family opened: the wheel flies in among its characters
      if (W.lens === 'star' && star.ok) {   // among the stars: the wheel and the pinch both carry the eye toward, or away from, what is under the pointer; a sideways stroke turns the ring
        const [x, y] = local(e); if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(dy) * 1.2) { star.fly = null; star.orb += clamp(e.deltaX * 0.0011 * (S.F / S.Fz), -0.2, 0.2); } else starZoom(clamp(e.ctrlKey ? -dy * 0.011 : dy * 0.0021, -0.6, 0.6), x, y);   // (the same way as in every other order: a stroke that flies forward there comes nearer here)
        if (W.onTouch) W.onTouch('fly'); return; }
      if (e.ctrlKey) { pullBack += dy; if (pullBack > 40 && tgt.ov < 0.5) setOver(true); else if (pullBack < -40 && tgt.ov > 0.5) setOver(false); return; }
      if (tgt.ov > 0.5) { pullBack += dy; if (pullBack > 160) setOver(false); return; }
      if (Math.abs(e.deltaX) > Math.abs(dy) * 1.2) cam.a += e.deltaX * 0.9 / Math.max(400, RE + cam.offZ.x);
      else { if (dy < 0 && tgt.offZ <= -239 && Math.abs(cam.yaw.x) < 0.5) { pullBack -= dy; if (pullBack > 420) setOver(true); } else pullBack = 0; fly(dy * 1.15); }
      if (W.onTouch) W.onTouch('fly'); };
    const onKey = (e) => {
      if (S.paused || wrap.getClientRects().length === 0 || e.metaKey || e.ctrlKey || e.altKey) return; const ae = document.activeElement; if (ae && ae !== document.body && ae !== document.documentElement && !(wrap.getRootNode().host && ae === wrap.getRootNode().host)) return;   // keys belong to whatever holds the focus
      if (e.key === 'Escape') { if (W.web && W.web.isOpen()) { W.web.close(); e.stopPropagation(); } else if (W.lens === 'star' && star.ok) { if (starBack() || (star.far && (starFar(false), true))) e.stopPropagation(); } else if (tgt.ov > 0.5) { setOver(false); e.stopPropagation(); } return; }
      if (W.web && W.web.isOpen()) { if (W.web.fly && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && W.web.fly(e.key === 'ArrowUp' ? 170 : -170)) e.preventDefault(); return; }
      if (W.lens === 'star' && star.ok) {   // among the stars: the arrows turn the eye, + and - carry it nearer and farther, Enter touches the star in the middle of the view
        const st2 = e.shiftKey ? 3 : 1, L2 = !!opt.standalone, kx = S.F / S.Fz; let used2 = true;
        if (e.key === 'ArrowLeft' || (L2 && e.key === 'a')) { star.fly = null; vel.a -= 0.5 * st2 * kx * (1 - star.E[0].x * Math.sin(cam.a) / STAR_R - star.E[2].x * Math.cos(cam.a) / STAR_R); } else if (e.key === 'ArrowRight' || (L2 && e.key === 'd')) { star.fly = null; vel.a += 0.5 * st2 * kx * (1 - star.E[0].x * Math.sin(cam.a) / STAR_R - star.E[2].x * Math.cos(cam.a) / STAR_R); }
        else if (e.key === 'ArrowUp') { star.fly = null; vel.pitch += 0.9 * st2; } else if (e.key === 'ArrowDown') { star.fly = null; vel.pitch -= 0.9 * st2; }
        else if (e.key === '+' || e.key === '=' || (L2 && e.key === 'w')) starZoom(0.32 * st2, S.px, S.py); else if (e.key === '-' || e.key === '_' || (L2 && e.key === 's')) starZoom(-0.32 * st2, S.px, S.py);
        else if (e.key === 'Enter') { let best = -1, bd = 1e9; for (const k of star.hits) { if (k === star.sel) continue; const d2 = (star.sx[k] - S.px) * (star.sx[k] - S.px) + (star.sy[k] - S.py) * (star.sy[k] - S.py) - star.cs[k] * star.cs[k] * 9; if (d2 < bd) { bd = d2; best = k; } } if (best >= 0) starGo(best); else used2 = false; }
        else if (L2 && e.key === 'o') setOver(!star.far); else if (e.key === 'Home' || (L2 && e.key === '0')) { W.starLetGo(); starHomeFly(); } else used2 = false;
        if (used2) { e.preventDefault(); if (W.onTouch) W.onTouch('key'); } return; }
      const step = e.shiftKey ? 3 : 1, L = !!opt.standalone; let used = true;   // letters only on the stand-alone page: the app keeps its own letter keys
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
    const dataUrl = opt.dataUrl || 'sky-data.json', starsUrl = opt.starsUrl || (dataUrl.indexOf('sky-data.json') >= 0 ? dataUrl.replace('sky-data.json', 'sky-stars.json') : '');   // the file of the stars lies beside the data
    const kanaUrl = opt.kanaUrl || (starsUrl && starsUrl.indexOf('sky-stars.json') >= 0 ? starsUrl.replace('sky-stars.json', 'sky-kana.json') : '');   // the river of kana lies beside the stars; the sky stands without it
    Promise.all([fetch(dataUrl).then((r) => r.json()), starsUrl ? fetch(starsUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null, kanaUrl ? fetch(kanaUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null]).then(([D, J, K]) => {
      setData(D, J); if (K && star.ok) setKana(K);
      const chars = new Set(); if (star.ok) for (const c of J.constellations) for (const ch of (c.fig || '') + (c.label || '') + (c.nameJa || '')) chars.add(ch); for (const w of D.words) for (const ch of w[0]) chars.add(ch); for (const k of D.kanji) chars.add(k[0]); for (const p of D.parts) chars.add(p[0]); for (const rm of REALMS) chars.add(rm.mark); for (const k of Object.keys(RAD_SAY)) for (const ch of (RAD_SAY[k].also || '') + (RAD_SAY[k].jn || '') + (RAD_SAY[k].ja || '')) chars.add(ch);
      const all = [...chars].join(''), jobs = []; if (document.fonts && document.fonts.load) for (let i = 0; i < all.length; i += 180) { const part = all.slice(i, i + 180); jobs.push(document.fonts.load(FONT_W(20), part).catch(() => null)); jobs.push(document.fonts.load(FONT_K(20), part).catch(() => null)); }
      if (document.fonts && document.fonts.load) jobs.push(document.fonts.load(FONT_E(14), 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ').catch(() => null));
      return Promise.race([Promise.all(jobs), new Promise((res) => setTimeout(res, 7000))]);
    }).then(() => { W.fonts = true; if (opt.contextUrl) fetch(opt.contextUrl).then((r) => (r.ok ? r.json() : null)).then((C) => { if (C && C.grammar) setContext(C); }).catch(() => { /* the sky stands without it */ }); }).catch((err) => { console.error('SKY data', err); if (opt.onFail) opt.onFail(err); });

    if (window.BunkiSkyWeb) window.BunkiSkyWeb(api, opt);
  };
})();
