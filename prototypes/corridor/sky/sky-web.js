/* 宙 — a word opened: the constellation.
 * A word opens into its own characters. Each character says what it means and what it is made of, and gathers
 * only the words that carry it, with that character marked in each. Words linked by meaning carry the stored
 * note that says how. Nothing arrives or leaves on a timer: the family stays until the learner lets go.
 * Every relation shown is stored in the app's data or is a plain equality over stored fields. */
(function () {
  'use strict';
  const T = window.BunkiSky.tools, clamp = T.clamp, lerp = T.lerp, spring = T.spring;
  const HAN = /[㐀-鿿豈-﫿]/;
  const VARIANT = { '灬': '火', '氵': '水', '氺': '水', '忄': '心', '⺗': '心', '扌': '手', '亻': '人', '刂': '刀', '犭': '犬', '礻': '示', '衤': '衣', '飠': '食', '艹': '艸', '辶': '辵', '罒': '网', '⺮': '竹', '糹': '糸', '訁': '言', '釒': '金', '牜': '牛' };
  const TXT = {
    ja: { sky: '宙', open: 'ページを開く', more: (n) => 'ほか ' + n, hint: 'ドラッグで巡る　・　スクロールで奥へ　・　言葉に触れると開く', out: 'この字は字の表にまだありません', both: (p) => 'どちらも「' + p + '」をもつ', sound: '音', rad: '部首', homo: '同じ音', legendCord: 'この言葉の字', legendFam: '同じ字をもつ言葉', legendSem: '意味のつながり', words: (n) => n + ' 語', strokes: (n) => n + ' 画', back: '宙へ戻る',
      rel: { syn: '類義', ant: '対義', reg: '語感', fam: '同族', col: '共起', thm: '主題' } },
    en: { sky: '宙', open: 'Open the page', more: (n) => n + ' more', hint: 'Drag to wander　・　scroll to go deeper　・　touch a word to open it', out: 'This character is not in the character table yet', both: (p) => 'Both carry ' + p, sound: 'sound', rad: 'radical', homo: 'same sound', legendCord: 'the characters of this word', legendFam: 'words that carry the same character', legendSem: 'linked by meaning', words: (n) => n + ' words', strokes: (n) => n + ' strokes', back: 'Back to the sky',
      rel: { syn: 'near in meaning', ant: 'opposite', reg: 'same sense, other tone', fam: 'same family', col: 'goes with', thm: 'same theme' } },
  };
  const REL_ORDER = { syn: 0, ant: 1, reg: 2, col: 3, fam: 4, thm: 5 };

  window.BunkiSky.css(`
  .ui { font-feature-settings: 'palt'; }
  .cap { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform, opacity; text-align: center; white-space: nowrap; color: var(--sky-text); pointer-events: none; opacity: 0; }
  .cap .rd { font-size: 15px; letter-spacing: 0.14em; opacity: 0.86; }
  .cap .rd.small { font-size: 12.5px; letter-spacing: 0.1em; margin-top: 3px; opacity: 0.78; }
  .cap .gl { font-family: 'Noto Serif', 'Shippori Mincho B1', serif; font-style: italic; font-size: 16px; letter-spacing: 0.01em; opacity: 0.92; }
  .cap.hub { width: 224px; white-space: normal; line-height: 1.5; }
  .cap.hub.side { text-align: left; width: 200px; }
  .cap.hub .kw { font-family: 'Noto Serif', serif; font-style: italic; font-size: 15px; }
  .cap.hub .yo { font-size: 12px; letter-spacing: 0.08em; opacity: 0.78; }
  .cap.hub .pt { font-size: 12.5px; margin-top: 3px; opacity: 0.96; }
  .cap.hub .pt b { font-family: 'Yuji Syuku', 'Shippori Mincho B1', serif; font-weight: 400; font-size: 17px; color: var(--sky-mark); margin-right: 3px; }
  .cap.hub .pt i { font-family: 'Noto Serif', serif; font-size: 12px; opacity: 0.85; }
  .cap.hub .pt .plus { opacity: 0.5; margin: 0 5px; }
  .tag { display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; padding: 0 4px 0 5px; margin-right: 5px; border: 1px solid currentColor; border-radius: 2px; color: var(--sky-mark); line-height: 15px; vertical-align: 1px; opacity: 0.9; }
  .cap.hub .kin { font-size: 12px; margin-top: 4px; }
  .cap.hub .kin button, .cap .act { pointer-events: auto; cursor: pointer; font: inherit; color: inherit; background: none; border: 0; padding: 0 2px; }
  .cap.hub .kin button { font-family: 'Yuji Syuku', 'Shippori Mincho B1', serif; font-size: 17px; margin: 0 1px; border-bottom: 1px solid transparent; }
  .cap.hub .kin button:hover { color: var(--sky-mark); border-bottom-color: currentColor; }
  .cap .act { margin-top: 12px; font-size: 13px; letter-spacing: 0.1em; padding: 6px 15px 7px; border: 1px solid color-mix(in srgb, var(--sky-text) 46%, transparent); border-radius: 2px; background: color-mix(in srgb, var(--sky-deep) 55%, transparent); transition: background 160ms, border-color 160ms, color 160ms; }
  .cap .act:hover, .cap .act:focus-visible { background: var(--sky-text); color: var(--sky-ink); border-color: var(--sky-text); outline: none; }
  .cap.note { font-size: 11.5px; line-height: 1.45; }
  .cap.note .nt { font-family: 'Noto Serif', serif; font-style: italic; opacity: 0.86; }
  .cap.bond { font-size: 12px; letter-spacing: 0.06em; color: var(--sky-mark); }
  .cap.more button { pointer-events: auto; cursor: pointer; font: inherit; font-size: 12px; letter-spacing: 0.08em; color: var(--sky-text); background: none; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--sky-text) 40%, transparent); padding: 1px 2px; opacity: 0.8; }
  .cap.more button:hover { opacity: 1; color: var(--sky-mark); border-bottom-color: currentColor; }
  .tip { position: absolute; left: 0; top: 0; pointer-events: none; text-align: center; white-space: nowrap; opacity: 0; transition: opacity 140ms; color: var(--sky-text); }
  .tip .rd { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); font-size: 13px; letter-spacing: 0.12em; }
  .tip .gl { position: absolute; left: 50%; top: 0; transform: translateX(-50%); font-family: 'Noto Serif', serif; font-style: italic; font-size: 13.5px; }
  .trail { position: absolute; left: 26px; top: 58px; display: flex; align-items: center; gap: 2px; pointer-events: auto; font-size: 14px; opacity: 0; transition: opacity 240ms; }
  .trail.on { opacity: 1; }
  .trail button { font: inherit; color: var(--sky-text); background: none; border: 0; padding: 4px 6px; cursor: pointer; opacity: 0.66; letter-spacing: 0.04em; }
  .trail button:hover, .trail button[aria-current] { opacity: 1; }
  .trail button[aria-current] { color: var(--sky-mark); }
  .trail .sep { width: 18px; height: 1px; background: var(--sky-cord); opacity: 0.8; }
  .trail .knot { width: 7px; height: 7px; border-radius: 50%; background: var(--sky-cord); margin-right: 2px; }
  .hint { position: absolute; left: 50%; transform: translateX(-50%); bottom: 20.2%; font-size: 12.5px; letter-spacing: 0.16em; white-space: nowrap; opacity: 0; transition: opacity 600ms; color: var(--sky-text); pointer-events: none; text-shadow: 0 0 8px var(--sky-mid), 0 0 3px var(--sky-mid); }
  .hint.on { opacity: 0.78; }
  .legend { position: absolute; left: 30px; top: 98px; display: flex; flex-direction: column; gap: 5px; letter-spacing: 0.06em; font-size: 11.5px; white-space: nowrap; opacity: 0; transition: opacity 600ms; color: var(--sky-text); pointer-events: none; }
  .legend.on { opacity: 0.72; }
  .legend span { display: inline-flex; align-items: center; gap: 8px; }
  .legend i { display: inline-block; width: 26px; height: 0; border-top: 2px solid var(--sky-cord); }
  .legend i.f { border-top: 1px solid var(--sky-line); }
  .legend i.s { border-top: 1px dashed var(--sky-text); opacity: 0.8; }
  @media (max-width: 700px) { .hint { font-size: 11px; letter-spacing: 0.06em; white-space: normal; width: 88%; text-align: center; } .legend { left: 14px; top: 84px; font-size: 10.5px; } .trail { left: 12px; top: 52px; font-size: 13px; } }
  `);

  window.BunkiSkyWeb = function (api, opt) {
    const { S, wrap, ui } = api, W = api.W, L = TXT[opt.lang === 'ja' ? 'ja' : 'en'];
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const web = W.web = { taken: new Set(), items: new Map(), leaving: [], lines: [], caps: [], cur: null, trail: [], page: 0 };
    const tip = el('div', 'tip'); tip.append(el('div', 'rd'), el('div', 'gl')); ui.append(tip);
    const trailEl = el('nav', 'trail'); ui.append(trailEl);
    const hint = el('div', 'hint', L.hint); ui.append(hint);
    const legend = el('div', 'legend'); for (const [c, t] of [['', L.legendCord], ['f', L.legendFam], ['s', L.legendSem]]) { const s = el('span'); s.append(el('i', c), document.createTextNode(t)); legend.append(s); } ui.append(legend);
    let hinted = false; requestAnimationFrame(() => hint.classList.add('on'));
    W.onTouch = () => { if (!hinted) { hinted = true; hint.classList.remove('on'); } };

    /* ---------------------------------------------------------------- data helpers */
    let partKanji = null;
    web.onData = () => { const D = W.D; partKanji = Array.from({ length: D.parts.length }, () => []); D.kanji.forEach((k, ki) => { for (const p of k[5]) partKanji[p].push(ki); if (k[6] >= 0 && !k[5].includes(k[6])) partKanji[k[6]].push(ki); }); for (const a of partKanji) a.sort((x, y) => D.kanji[y][9] - D.kanji[x][9]); };
    if (W.D) web.onData();
    const scaleU = () => clamp(Math.min(S.W / 1728, S.H / 1084), 0.5, 1.14);
    const centreXY = () => [S.W / 2, S.H * 0.44];
    const kun = (s) => String(s).replace('.', '·');

    /* ---------------------------------------------------------------- building a constellation */
    const HUBS = { 1: [[-335, 0]], 2: [[-345, 0], [345, 0]], 3: [[-405, 36], [0, -236], [405, 36]], 4: [[-435, 54], [-152, -238], [152, -238], [435, 54]] };
    const DIRS = { 1: [Math.PI], 2: [Math.PI, 0], 3: [Math.PI, -Math.PI / 2, 0], 4: [Math.PI - 0.12, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42, 0.12] };
    const TOP = [[0, -252], [-222, -208], [222, -208], [-112, -328], [112, -328]];
    const BOT = [[0, 240], [-205, 256], [205, 256], [-104, 318], [104, 318]];
    /* places for a character's family, nearest first; they keep clear of the note under the character */
    const SIDE = [[182, -14, 25], [152, -98, 25], [178, 76, 25], [312, -62, 20], [318, 42, 20], [258, -160, 20], [268, 142, 20], [112, -208, 20], [142, 226, 20]];
    const UPW = [[0, -142, 24], [-104, -118, 22], [104, -118, 22], [-214, -92, 20], [214, -92, 20]];
    function fanSlots(hx, hy, dir, up) { return up ? UPW.map(([x, y, sz]) => [hx + x, hy + y, sz]) : SIDE.map(([x, y, sz]) => [hx + (Math.cos(dir) < 0 ? -x : x), hy + y, sz]); }
    const mk = (o) => Object.assign({ x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, s: { x: 0, v: 0 }, a: { x: 0, v: 0 }, delay: 0, depth: 600, marks: null, w: 0, h: 0, born: false }, o);
    function build(kind, id) {
      const D = W.D, items = [], lines = [], caps = [], used = new Set();
      const add = (o) => { const it = mk(o); items.push(it); if (it.kind === 'w') used.add(it.id); return it; };
      const wordMarks = (wi, ch) => { const out = []; Array.from(D.words[wi][0]).forEach((c, n) => { if (c === ch) out.push(n); }); return out; };
      if (kind === 'w') {
        const w = D.words[id], chars = Array.from(w[0]), hubsCh = []; for (const c of chars) if (HAN.test(c) && !hubsCh.includes(c)) hubsCh.push(c);
        const n = clamp(hubsCh.length, 1, 4), cs = chars.length <= 3 ? 70 : chars.length === 4 ? 58 : 46;
        const centre = add({ key: 'w' + id, kind: 'w', id, text: w[0], font: 'w', role: 'centre', tx: 0, ty: 0, size: cs, depth: 520 });
        caps.push({ of: centre, dy: -cs * 0.60 - 26, cls: 'cap', build: (n2) => n2.append(el('div', 'rd', W.rd[id])) });
        caps.push({ of: centre, dy: cs * 0.60 + 8, cls: 'cap', build: (n2) => { if (w[2]) n2.append(el('div', 'gl', w[2])); if (canOpen('w', id)) { const b = el('button', 'act', L.open + '  →'); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); openPage('w', id); }); n2.append(b); } } });
        /* linked by meaning: the stored relation and its note */
        const sem = (W.sem.get(id) || []).slice().sort((a, b) => REL_ORDER[a.rel] - REL_ORDER[b.rel]).slice(0, 5), semSlots = n >= 3 ? BOT : TOP;
        sem.forEach((e, q) => { const it = add({ key: 'w' + e.w, kind: 'w', id: e.w, text: D.words[e.w][0], font: 'w', role: 'sem', tx: semSlots[q][0], ty: semSlots[q][1], size: 24, depth: 640, delay: 0.16 + q * 0.05 });
          lines.push({ a: centre, b: it, kind: 'sem', delay: 0.12 + q * 0.05 });
          caps.push({ of: it, dy: 20, cls: 'cap note', build: (n2) => { n2.append(el('span', 'tag', L.rel[e.rel])); if (e.note) n2.append(el('span', 'nt', e.note)); } }); });
        /* its characters, each with its own family */
        const hubItems = [];
        hubsCh.slice(0, 4).forEach((ch, h) => { const ki = W.byKanji.get(ch), [hx, hy] = HUBS[n][h], dir = DIRS[n][h], up = Math.abs(Math.sin(dir)) > 0.6, hs = [98, 98, 84, 76][n - 1];
          const hub = add({ key: (ki != null ? 'k' + ki : 'x' + ch), kind: ki != null ? 'k' : 'x', id: ki != null ? ki : ch, text: ch, font: 'k', role: 'hub', tx: hx, ty: hy, size: hs, depth: 470, delay: 0.05 + h * 0.06 }); hubItems.push(hub);
          lines.push({ a: centre, b: hub, kind: 'cord', delay: 0.02 + h * 0.06 });
          if (ki == null) { caps.push({ of: hub, dy: hs * 0.58 + 4, cls: 'cap hub', build: (n2) => n2.append(el('div', 'yo', L.out)) }); return; }
          caps.push(up ? { of: hub, dx: hs * 0.60 + 6, dy: -hs * 0.46, left: true, cls: 'cap hub side', build: (n2) => hubCaption(n2, ki) } : { of: hub, dy: hs * 0.58 + 2, cls: 'cap hub', build: (n2) => hubCaption(n2, ki) });
          const fam = W.fam[ki].filter((wi) => wi !== id && !used.has(wi)), slots = fanSlots(hx, hy, dir, up), shown = fam.slice(0, slots.length);
          shown.forEach((wi, q) => { const it = add({ key: 'w' + wi, kind: 'w', id: wi, text: D.words[wi][0], font: 'w', role: 'fam', tx: slots[q][0], ty: slots[q][1], size: slots[q][2], depth: 610, marks: wordMarks(wi, ch), delay: 0.20 + h * 0.05 + q * 0.035, from: hub });
            lines.push({ a: hub, b: it, kind: 'fam', delay: 0.16 + h * 0.05 + q * 0.035 }); });
          if (fam.length > shown.length) { const r = 392; caps.push({ of: hub, dx: up ? 300 : Math.cos(dir) * r, dy: up ? -150 : Math.sin(dir) * r - 8, cls: 'cap more', build: (n2) => { const b = el('button', '', L.more(fam.length - shown.length)); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); open('k', ki); }); n2.append(b); } }); } });
        /* two characters of one word that share a meaning part: say so */
        for (let a = 0; a < hubItems.length; a += 1) for (let b = a + 1; b < hubItems.length; b += 1) { const A = hubItems[a], B = hubItems[b]; if (A.kind !== 'k' || B.kind !== 'k') continue; const pa = D.kanji[A.id][8], pb = D.kanji[B.id][8]; if (pa < 0 || pb < 0) continue; const ca = D.parts[pa][0], cb = D.parts[pb][0]; if ((VARIANT[ca] || ca) !== (VARIANT[cb] || cb)) continue;
          lines.push({ a: A, b: B, kind: 'bond', delay: 0.5, bow: -150 }); centre.bondTop = cs * 0.60 + 112; const g = D.parts[pa][2] || D.parts[pb][2]; caps.push({ of: centre, dy: -cs * 0.60 - 96, cls: 'cap bond', build: (n2) => n2.append(document.createTextNode(L.both(ca === cb ? ca : ca + ' ・ ' + cb) + (g ? '  —  ' + g : ''))) }); }
        /* the same sound, another word */
        if (n <= 2) { const homo = (W.rd[id] ? W.byReading.get(W.rd[id]) || [] : []).filter((wi) => wi !== id && !used.has(wi)).slice(0, 3);
          homo.forEach((wi, q) => { const it = add({ key: 'w' + wi, kind: 'w', id: wi, text: D.words[wi][0], font: 'w', role: 'homo', tx: BOT[q][0], ty: BOT[q][1] + 26, size: 21, depth: 660, delay: 0.3 + q * 0.05 });
            lines.push({ a: centre, b: it, kind: 'homo', delay: 0.28 + q * 0.05 });
            caps.push({ of: it, dy: 18, cls: 'cap note', build: (n2) => { n2.append(el('span', 'tag', L.homo)); if (D.words[wi][2]) n2.append(el('span', 'nt', D.words[wi][2])); } }); }); }
      } else if (kind === 'k') {
        const k = D.kanji[id], parts = k[5].slice(0, 4), n = parts.length;
        const centre = add({ key: 'k' + id, kind: 'k', id, text: k[0], font: 'k', role: 'centre', tx: 0, ty: -4, size: 132, depth: 520, capH: 58 + (canOpen('k', id) ? 46 : 0) + (W.fam[id].length > 10 ? 30 : 0) });
        caps.push({ of: centre, dy: 132 * 0.56 + 2, cls: 'cap', build: (n2) => { n2.append(el('div', 'gl', k[1] + (k[4] ? '  ·  ' + L.strokes(k[4]) : ''))); n2.append(el('div', 'rd small', [k[2].slice(0, 3).join('・'), k[3].slice(0, 2).map(kun).join('・')].filter(Boolean).join('　'))); if (canOpen('k', id)) { const b = el('button', 'act', L.open + '  →'); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); openPage('k', id); }); n2.append(b); } } });
        const famAll = W.fam[id], page = web.page % Math.max(1, Math.ceil(famAll.length / 10)), mine = famAll.slice(page * 10, page * 10 + 10), slots = TOP.concat(BOT);
        mine.forEach((wi, q) => { const it = add({ key: 'w' + wi, kind: 'w', id: wi, text: D.words[wi][0], font: 'w', role: 'own', tx: slots[q][0] * 1.06, ty: slots[q][1] + (q < 5 ? -16 : 40), size: 25, depth: 610, marks: wordMarks(wi, k[0]), delay: 0.12 + q * 0.035 });
          lines.push({ a: centre, b: it, kind: 'fam', delay: 0.08 + q * 0.035 }); });
        if (famAll.length > 10) caps.push({ of: centre, dx: 0, dy: 132 * 0.56 + 62 + (canOpen('k', id) ? 46 : 0), cls: 'cap more', build: (n2) => { const b = el('button', '', L.words(famAll.length) + '  ·  ' + (page + 1) + ' / ' + Math.ceil(famAll.length / 10) + '  →'); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); web.page += 1; open('k', id, true); }); n2.append(b); } });
        parts.forEach((p, h) => { const part = D.parts[p], asK = part[3], [hx, hy] = (n === 1 ? [[-470, 0]] : n === 2 ? [[-470, 0], [470, 0]] : n === 3 ? [[-470, -40], [470, -40], [-470, 150]] : [[-470, -70], [470, -70], [-470, 130], [470, 130]])[h], dir = hx < 0 ? Math.PI : 0;
          const hub = add({ key: asK >= 0 ? 'k' + asK : 'p' + p, kind: asK >= 0 ? 'k' : 'p', id: asK >= 0 ? asK : p, text: part[0], font: 'k', role: 'hub', tx: hx, ty: hy, size: 66, depth: 470, delay: 0.05 + h * 0.06 });
          lines.push({ a: centre, b: hub, kind: 'cord', delay: 0.02 + h * 0.06 });
          caps.push({ of: hub, dy: 66 * 0.58 + 2, cls: 'cap hub', build: (n2) => { const row = el('div', 'pt'); if (p === k[6]) row.append(el('span', 'tag', L.sound + ' ' + k[7])); if (p === k[8]) row.append(el('span', 'tag', L.rad)); row.append(el('i', '', part[2] || part[1] || '')); n2.append(row); } });
          const sib = (partKanji[p] || []).filter((x) => x !== id && !items.some((it) => it.kind === 'k' && it.id === x)).slice(0, 4);
          sib.forEach((x, q) => { const ang = dir + [-24, 24, -62, 62][q] * Math.PI / 180, it = add({ key: 'k' + x, kind: 'k', id: x, text: D.kanji[x][0], font: 'k', role: 'kin', tx: hx + Math.cos(ang) * 132, ty: hy + Math.sin(ang) * 132, size: 38, depth: 640, delay: 0.22 + h * 0.05 + q * 0.04, from: hub });
            lines.push({ a: hub, b: it, kind: 'fam', delay: 0.18 + h * 0.05 + q * 0.04 }); }); });
      } else {
        const part = D.parts[id];
        const centre = add({ key: 'p' + id, kind: 'p', id, text: part[0], font: 'k', role: 'centre', tx: 0, ty: 0, size: 120, depth: 520, capH: 34 });
        caps.push({ of: centre, dy: 120 * 0.56 + 2, cls: 'cap', build: (n2) => n2.append(el('div', 'gl', [part[1], part[2]].filter(Boolean).join('  ·  '))) });
        (partKanji[id] || []).slice(0, 14).forEach((x, q) => { const ang = -Math.PI / 2 + (q / 14) * Math.PI * 2, r = q % 2 ? 300 : 232, it = add({ key: 'k' + x, kind: 'k', id: x, text: D.kanji[x][0], font: 'k', role: 'kin', tx: Math.cos(ang) * r * 1.5, ty: Math.sin(ang) * r * 0.86, size: 44, depth: 620, delay: 0.1 + q * 0.03 });
          lines.push({ a: centre, b: it, kind: 'fam', delay: 0.06 + q * 0.03 }); });
      }
      if (kind === 'w' && items.filter((it) => it.role === 'hub').length === 1 && !items.some((it) => it.role === 'sem' || it.role === 'homo')) for (const it of items) it.tx += 160;
      return { kind, id, items, lines, caps };
    }
    function hubCaption(node, ki) {
      const D = W.D, k = D.kanji[ki];
      node.append(el('div', 'kw', k[1]));
      node.append(el('div', 'yo', [k[2].slice(0, 2).join('・'), k[3].slice(0, 1).map(kun).join('・')].filter(Boolean).join('　')));
      if (k[5].length) { const row = el('div', 'pt'); k[5].slice(0, 4).forEach((p, n) => { if (n) row.append(el('span', 'plus', '＋')); const part = D.parts[p]; row.append(el('b', '', part[0]), el('i', '', part[2] || part[1] || '')); }); node.append(row); }
      const si = W.soundOf.get(ki); if (si != null && k[6] >= 0) { const fam = D.sound[si], row = el('div', 'kin'); row.append(el('span', 'tag', L.sound + ' ' + fam[1])); for (const x of fam[2]) { if (x === ki) continue; const b = el('button', '', D.kanji[x][0]); b.type = 'button'; b.title = D.kanji[x][1]; b.addEventListener('click', (e) => { e.stopPropagation(); open('k', x); }); row.append(b); } node.append(row); }
    }

    /* ---------------------------------------------------------------- opening, moving on, letting go */
    function start(it, prev) {
      const old = prev && prev.get(it.key);
      if (old) { it.x.x = old.x.x; it.y.x = old.y.x; it.s.x = old.s.x; it.a.x = old.a.x; it.born = true; return; }
      if (it.kind === 'w' && W.visAt[it.id] >= S.frame - 2) { const o = it.id * 5; it.x.x = W.vis[o]; it.y.x = W.vis[o + 1]; it.s.x = W.vis[o + 2]; it.a.x = Math.min(1, W.vis[o + 3] + 0.2); it.born = true; }
    }
    function open(kind, id, samePlace) {
      if (!W.ready) return; const prev = web.items; if (!samePlace) { if (!(web.cur && web.cur.kind === kind && web.cur.id === id)) web.page = 0; }
      const c = build(kind, id), next = new Map();
      for (const it of c.items) { start(it, prev); next.set(it.key, it); }
      for (const [key, it] of prev) if (!next.has(key)) { it.leavingAt = S.t; web.leaving.push(it); }
      for (const cap of web.caps) cap.node.remove();
      web.caps = c.caps.map((cp) => { const node = el('div', cp.cls); cp.build(node); ui.append(node); return Object.assign(cp, { node }); });
      web.items = next; web.lines = c.lines.map((l) => Object.assign(l, { p: { x: 0, v: 0 } })); web.cur = { kind, id, t0: S.t };
      web.taken = new Set(); for (const it of next.values()) if (it.kind === 'w') web.taken.add(it.id); for (const it of web.leaving) if (it.kind === 'w') web.taken.add(it.id);
      const label = kind === 'w' ? W.D.words[id][0] : kind === 'k' ? W.D.kanji[id][0] : W.D.parts[id][0], at = web.trail.findIndex((t) => t.kind === kind && t.id === id);
      if (at >= 0) web.trail.length = at + 1; else web.trail.push({ kind, id, label }); if (web.trail.length > 7) web.trail.splice(0, web.trail.length - 7);
      drawTrail(); legend.classList.add('on'); hint.classList.remove('on'); hinted = true; setTip(null);
      if (opt.onState) opt.onState({ open: true, kind, id, label });
    }
    function close() {
      if (!web.cur) return; for (const it of web.items.values()) { it.leavingAt = S.t; it.home = true; web.leaving.push(it); }
      web.items = new Map(); web.lines = []; for (const cap of web.caps) cap.node.remove(); web.caps = []; web.cur = null; web.trail = []; drawTrail(); legend.classList.remove('on');
      if (opt.onState) opt.onState({ open: false });
    }
    function drawTrail() {
      trailEl.textContent = ''; if (!web.trail.length) { trailEl.classList.remove('on'); return; }
      const home = el('button', '', L.sky); home.type = 'button'; home.title = L.back; home.addEventListener('click', (e) => { e.stopPropagation(); close(); }); trailEl.append(el('span', 'knot'), home);
      web.trail.forEach((t, n) => { trailEl.append(el('span', 'sep')); const b = el('button', '', t.label); b.type = 'button'; if (n === web.trail.length - 1) b.setAttribute('aria-current', 'true'); b.addEventListener('click', (e) => { e.stopPropagation(); open(t.kind, t.id); }); trailEl.append(b); });
      trailEl.classList.add('on');
    }
    const target = (kind, id) => (kind === 'w' ? { kind: 'word', word: W.D.words[id][0], reading: W.D.words[id][1] } : { kind: 'kanji', char: W.D.kanji[id][0] });
    function canOpen(kind, id) { return opt.canOpen ? !!opt.canOpen(target(kind, id)) : !!opt.onOpen; }
    function openPage(kind, id) { if (!canOpen(kind, id)) return; const D = W.D; if (opt.onOpen) opt.onOpen(kind === 'w' ? { kind: 'word', word: D.words[id][0], reading: D.words[id][1] } : { kind: 'kanji', char: D.kanji[id][0] }); }
    web.isOpen = () => !!web.cur; web.open = open; web.close = close;
    web.tap = (h) => {
      if (!h) { if (web.cur) close(); return; }
      if (h.t === 'w') { open('w', h.i); return; }
      if (h.t === 'i') { const it = h.item; if (it.role === 'centre') { if (it.kind !== 'p') openPage(it.kind, it.id); return; } if (it.kind === 'x') return; open(it.kind, it.id); }
    };
    web.pick = (px, py, slop) => { let best = null; for (const it of web.items.values()) { if (it.a.x < 0.5 || it.kind === 'x' && it.role !== 'centre') continue; if (Math.abs(px - it.x.x) <= it.w / 2 + slop && Math.abs(py - it.y.x) <= it.s.x * 0.62 + slop) { if (!best || it.depth < best.depth) best = it; } } return best ? { t: 'i', item: best, id: best.key } : null; };

    /* ---------------------------------------------------------------- frame */
    web.update = (dt) => {
      if (!W.ready) return; const u = scaleU(), [cx, cy] = centreXY(), t = web.cur ? S.t - web.cur.t0 : 0, pk = 0.35 * S.F;
      for (const it of web.items.values()) {
        const X = cx + it.tx * u - S.parS.x.x * pk / it.depth, Y = cy + it.ty * u + S.parS.y.x * pk / it.depth, Sz = Math.max(it.size * u, it.role === 'centre' ? 30 : 13);
        if (!it.born) { const f = it.from; if (t < it.delay) { if (f) { it.x.x = f.x.x; it.y.x = f.y.x; } continue; } it.born = true; if (f) { it.x.x = f.x.x; it.y.x = f.y.x; it.s.x = Sz * 0.6; } else { it.x.x = X; it.y.x = Y + 14; it.s.x = Sz * 0.86; } it.a.x = 0; }
        spring(it.x, X, 7.5, dt); spring(it.y, Y, 7.5, dt); spring(it.s, Sz, 7.5, dt); spring(it.a, 1, 6, dt); it.rest = Math.abs(it.x.v) + Math.abs(it.y.v) + Math.abs(it.s.v) < 0.6;
      }
      for (let n = web.leaving.length - 1; n >= 0; n -= 1) { const it = web.leaving[n]; let gone = false;
        if (it.home && it.kind === 'w') { const p = W.project(it.id), on = p && p.x > -80 && p.x < S.W + 80 && p.y > -40 && p.y < S.H * S.hor; if (on) { spring(it.x, p.x, 6.5, dt); spring(it.y, p.y, 6.5, dt); spring(it.s, p.size, 6.5, dt); spring(it.a, 0.85, 5, dt); if (S.t - it.leavingAt > 0.75 && Math.abs(it.x.x - p.x) + Math.abs(it.y.x - p.y) < 2.5) gone = true; } else { spring(it.a, 0, 8, dt); spring(it.s, it.s.x * 0.9, 5, dt); if (it.a.x < 0.03) gone = true; } }
        else { spring(it.a, 0, 9, dt); if (it.a.x < 0.03) gone = true; }
        if (gone || S.t - it.leavingAt > 2.2) { web.leaving.splice(n, 1); if (it.kind === 'w' && !web.items.has(it.key)) web.taken.delete(it.id); } }
      for (const l of web.lines) spring(l.p, t >= l.delay && l.a.born && l.b.born ? 1 : 0, 5.2, dt);
      spring(wake.k, wake.i >= 0 && !web.cur ? 1 : 0, 8, dt); W.kinK = wake.k.x; if (wake.k.x < 0.01 && wake.i < 0) { W.kin = null; wake.lines = []; }
    };
    function edge(it, tx, ty, pad) { const dx = tx - it.x.x, dy = ty - it.y.x, hw = it.w / 2 + pad, hh = it.s.x * 0.58 + pad, k = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh, 1e-6); return k >= 1 ? [it.x.x, it.y.x] : [it.x.x + dx * k, it.y.x + dy * k]; }
    function drawItem(it) {
      const pal = S.pal, D = W.D, px = it.size * scaleU() * S.dpr, rest = it.rest && !it.leavingAt;
      let sp = W.spriteFor(it.kind === 'w' ? it.id : it.key, it.text, it.font, px, it.marks, 2000 + it.size, true);
      const col = it.role === 'sem' || it.role === 'homo' ? pal.text : pal.text, a = it.a.x;
      if (!sp && it.kind === 'w' && W.hasBase(it.id)) { const box = W.pushLabel(it.x.x, it.y.x, it.s.x, null, it.id, col, a, pal.mark, 0, 0); if (box) it.w = box.w - it.s.x * 0.5; return; }
      if (!sp) { it.w = Array.from(it.text).length * it.s.x; return; }
      if (it.s.x >= 19) W.pushLabel(it.x.x + it.s.x * 0.04, it.y.x + it.s.x * 0.075, it.s.x, sp, 0, pal.c[0], 0.55 * a, pal.c[0], 0.55 * a, 1.8);
      const box = W.pushLabel(it.x.x, it.y.x, it.s.x, sp, 0, col, a, pal.mark, a, 0, null, rest); if (box) it.w = box.w - 24 * it.s.x / sp.px; void D;
    }
    web.draw = () => {
      const pal = S.pal;
      for (const it of web.leaving) drawItem(it);
      for (const l of web.lines) { if (l.p.x < 0.01) continue; const A = l.a, B = l.b, al = Math.min(A.a.x, B.a.x);
        const pad = l.kind === 'cord' ? 10 : 7; let [x0, y0] = edge(A, B.x.x, B.y.x, pad); const [x1, y1] = edge(B, A.x.x, A.y.x, pad);
        if (A.role === 'centre' && A.kind !== 'w' && l.kind === 'fam' && B.y.x > A.y.x + A.s.x * 0.5) { x0 = A.x.x + clamp((B.x.x - A.x.x) * 0.22, -70, 70); y0 = A.y.x + A.s.x * 0.56 + A.capH * scaleU(); if (y0 > y1 - 12) continue; }   // start under the notes, never through them
        if (l.kind === 'cord') W.pushLine(x0, y0, x1, y1, 0, 2.3, pal.cord, 0.95 * al, l.p.x);
        else if (l.kind === 'fam') W.pushLine(x0, y0, x1, y1, (x1 - x0) * (y1 - y0) > 0 ? 9 : -9, 1.1, pal.line, 0.62 * al, l.p.x);
        else if (l.kind === 'bond') W.pushLine(A.x.x, A.y.x - A.s.x * 0.62, B.x.x, B.y.x - B.s.x * 0.62, l.bow * scaleU(), 1.2, pal.mark, 0.6 * al, l.p.x);
        else { if (A.bondTop && B.y.x < A.y.x && Math.abs(B.x.x - A.x.x) < 90 * scaleU()) { x0 = A.x.x + (B.x.x - A.x.x) * 0.3; y0 = A.y.x - A.bondTop * scaleU(); if (y0 < y1 + 10) continue; } dashed(x0, y0, x1, y1, pal.text, 0.5 * al, l.p.x); } }
      for (const it of web.items.values()) if (it.born) drawItem(it);
    };
    function dashed(x0, y0, x1, y1, col, a, prog) { const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / 11)); for (let q = 0; q < n; q += 2) { const t0 = q / n, t1 = Math.min(1, (q + 1) / n); if (t0 > prog) break; W.pushLine(lerp(x0, x1, t0), lerp(y0, y1, t0), lerp(x0, x1, t1), lerp(y0, y1, t1), 0, 1.0, col, a, 1); } }
    web.after = () => {
      const u = scaleU();
      for (const cp of web.caps) { const it = cp.of, node = cp.node, a = it.born ? clamp((it.a.x - 0.35) / 0.65, 0, 1) : 0; node.style.opacity = a.toFixed(3); if (a <= 0) continue;
        const x = it.x.x + (cp.dx || 0) * u, y = it.y.x + cp.dy * (it.s.x / (it.size * u || 1)) * u; node.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)' + (cp.left ? '' : ' translateX(-50%)'); }
      if (tipOn) { let x = 0, y = 0, s = 0, ok = false; if (tipOn.t === 'w') { if (W.visAt[tipOn.i] >= S.frame - 1) { const o = tipOn.i * 5; x = W.vis[o]; y = W.vis[o + 1]; s = W.vis[o + 2]; ok = true; } } else { const it = tipOn.item; x = it.x.x; y = it.y.x; s = it.s.x; ok = web.items.has(it.key); }
        if (ok) { tip.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)'; tip.firstChild.style.bottom = (s * 0.62 + 5) + 'px'; tip.lastChild.style.top = (s * 0.62 + 4) + 'px'; tip.style.opacity = '1'; } else tip.style.opacity = '0'; }
    };

    /* ---------------------------------------------------------------- waking a word by touch of the pointer */
    const wake = { i: -1, k: { x: 0, v: 0 }, lines: [] }; let tipOn = null;
    function setTip(h) {
      tipOn = null; if (!h) { tip.style.opacity = '0'; return; } const D = W.D;
      if (h.t === 'w') { tip.firstChild.textContent = W.rd[h.i]; tip.lastChild.textContent = D.words[h.i][2] || ''; tipOn = h; }
      else if (h.t === 'i') { const it = h.item; if (it.role === 'centre' || it.role === 'hub' || it.role === 'sem' || it.role === 'homo') { tip.style.opacity = '0'; return; }
        if (it.kind === 'w') { tip.firstChild.textContent = W.rd[it.id]; tip.lastChild.textContent = D.words[it.id][2] || ''; } else if (it.kind === 'k') { tip.firstChild.textContent = D.kanji[it.id][2].slice(0, 2).join('・'); tip.lastChild.textContent = D.kanji[it.id][1]; } else { tip.firstChild.textContent = D.parts[it.id][1] || ''; tip.lastChild.textContent = D.parts[it.id][2] || ''; } tipOn = h; }
    }
    W.onHover = (h) => {
      setTip(h); if (web.cur) { wake.i = -1; return; }
      if (h && h.t === 'w') { wake.i = h.i; const D = W.D, kin = new Set(), lines = [], o = h.i * 5, hx = W.vis[o], hy = W.vis[o + 1];
        for (const k of D.words[h.i][4]) { const near = []; for (const wi of W.fam[k]) { if (wi === h.i || W.visAt[wi] < S.frame - 1 || W.vis[wi * 5 + 3] < 0.1) continue; const q = wi * 5; near.push([Math.hypot(W.vis[q] - hx, W.vis[q + 1] - hy), wi]); } near.sort((a, b) => a[0] - b[0]); for (const [, wi] of near.slice(0, 5)) { if (!kin.has(wi)) { kin.add(wi); lines.push(wi); } } }
        W.kin = kin; wake.lines = lines; } else wake.i = -1;
    };
    W.drawWake = () => {
      if (wake.k.x < 0.02 || !wake.lines.length || wake.i < 0 && !W.kin) return; const i = wake.i >= 0 ? wake.i : wake.last; if (i == null || i < 0 || W.visAt[i] < S.frame - 1) return; wake.last = i;
      const o = i * 5, ax = W.vis[o], ay = W.vis[o + 1], aw = W.vis[o + 4] / 2, ah = W.vis[o + 2] * 0.6;
      for (const wi of wake.lines) { if (W.visAt[wi] < S.frame - 1) continue; const q = wi * 5, bx = W.vis[q], by = W.vis[q + 1], dx = bx - ax, dy = by - ay, k0 = 1 / Math.max(Math.abs(dx) / (aw + 6), Math.abs(dy) / (ah + 6), 1e-6), k1 = 1 / Math.max(Math.abs(dx) / (W.vis[q + 4] / 2 + 4), Math.abs(dy) / (W.vis[q + 2] * 0.6 + 4), 1e-6); if (k0 + k1 >= 1) continue;
        W.pushLine(ax + dx * k0, ay + dy * k0, bx - dx * k1, by - dy * k1, dx * dy > 0 ? 7 : -7, 1.0, S.pal.line, 0.5 * wake.k.x, wake.k.x); }
    };
    api.open = (word) => { const i = W.byWord.get(word); if (i != null) open('w', i); return i != null; };
    api.close = close;
  };
})();
