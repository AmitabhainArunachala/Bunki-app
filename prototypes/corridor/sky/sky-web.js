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
    ja: { sky: '宙', open: 'ページを開く', more: (n) => 'ほか ' + n, hint: 'ドラッグで見回す　・　スクロールで奥へ　・　言葉に触れると開く', hintOver: '輪に触れると、そこへ降りる。横に引くと回り、縦に引くと傾く。', hintOverTouch: '輪に触れると降りる。横になぞると回り、縦で傾く。', lensMean: '意：部首の順（部首は字の意味の手がかり）', ownLegend: '金色の言葉はあなたの言葉。いつもそばにある', pathLegend: '赤い糸は、開いた言葉の道', overLegend: '赤い線は、立っていた場所と、そこから見えていた範囲。', legendParts: 'この字の部品', legendOwn: 'この字をもつ言葉と、同じ部品をもつ字', legendEx: '例文の言葉', legendCarry: 'この部品をもつ字', skyLabel: '言葉の宙。Tab で見えている言葉へ進む。', reach: '見えている言葉', reachOver: '降りる場所', sayOpen: (w, parts, n) => w + ' を開いた。' + (parts ? '字：' + parts + '。' : '') + (n ? 'つながる言葉 ' + n + '。' : ''), sayBack: '宙へ戻った。', sayDown: (w) => w + ' のあたりへ降りる', hintTouch: 'なぞって見回す　・　指を広げて奥へ　・　言葉に触れると開く', hintTurn: 'ドラッグで回す　・　宙か空に触れると放す', over: '上から見る', down: '中へ降りる', front: '正面へ戻る', lensForm: '形：字の家族の順', gram: '文法を見上げる', gramWords: 'この例文の言葉', ctxMore: '次の文', seenIn: '出典', lensSound: '音：よみの順', lensRead: '読：出会った文章ごと', out: 'この字は字の表にまだありません', both: (p) => 'どちらも「' + p + '」をもつ', sound: '音', rad: '部首', homo: '同じ音', legendCord: 'この言葉の字', legendFam: '同じ字をもつ言葉', legendSem: '意味のつながり', legendTurn: 'ドラッグで回す', words: (n) => n + ' 語', strokes: (n) => n + ' 画', back: '宙へ戻る',
      rel: { syn: '類義', ant: '対義', reg: '語感', fam: '同族', col: '共起', thm: '主題' } },
    en: { sky: '宙', open: 'Open the page', more: (n) => n + ' more', hint: 'Drag to look around　・　scroll to go deeper　・　touch a word to open it', hintOver: 'Touch the ring to come down there. Drag sideways to turn it, up or down to tilt it.', hintOverTouch: 'Touch the ring to come down. Drag sideways to turn it, up or down to tilt it.', lensMean: 'Meaning: by radical, the part that says what a character is about', ownLegend: 'the words in gold are your own and stay near you', pathLegend: 'the red thread joins the words you opened', overLegend: 'The red lines show where you stood and what you saw from there.', legendParts: 'the parts of this character', legendOwn: 'words that carry it, and characters that share a part', legendEx: 'words in its examples', legendCarry: 'characters that carry this part', skyLabel: 'The sky of words. Tab reaches the words in view.', reach: 'Words in view', reachOver: 'Places to come down', sayOpen: (w, parts, n) => 'Opened ' + w + '. ' + (parts ? 'Characters: ' + parts + '. ' : '') + (n ? n + ' related words shown.' : ''), sayBack: 'Back in the sky.', sayDown: (w) => 'Come down near ' + w, hintTouch: 'Drag to look around　・　spread two fingers to go deeper　・　touch a word', hintTurn: 'Drag to turn it　・　touch 宙 or the sky to let go', over: 'See it from above', down: 'Come down', front: 'Face front again', lensForm: 'Form: by families of characters', gram: 'Look up at the grammar', gramWords: 'words in these examples', ctxMore: 'next sentence', seenIn: 'from', lensSound: 'Sound: by reading', lensRead: 'Read: by the article each word comes from', out: 'This character is not in the character table yet', both: (p) => 'Both carry ' + p, sound: 'sound', rad: 'radical', homo: 'same sound', legendCord: 'the characters of this word', legendFam: 'words that carry the same character', legendSem: 'linked by meaning', legendTurn: 'drag to turn it', words: (n) => n + ' words', strokes: (n) => n + ' strokes', back: 'Back to the sky',
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
  .cap .cx { margin: 13px auto 0; width: 430px; white-space: normal; font-size: 14.5px; line-height: 1.62; letter-spacing: 0.03em; }
  .cap .cx b { color: var(--sky-mark); font-weight: 800; }
  .cap .cx .en { display: block; font-family: 'Noto Serif', serif; font-style: italic; font-size: 12.5px; letter-spacing: 0; opacity: 0.8; }
  .cap .cx .src { display: block; margin-top: 3px; font-size: 11px; letter-spacing: 0.06em; opacity: 0.66; }
  .cap .cx button { pointer-events: auto; cursor: pointer; font: inherit; font-size: 11px; color: inherit; background: none; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--sky-text) 40%, transparent); padding: 0 1px; margin-left: 8px; opacity: 0.8; }
  .cap .cx button:hover { opacity: 1; color: var(--sky-mark); }
  .cap.gram { width: 560px; white-space: normal; line-height: 1.6; }
  .cap.gram .fm { font-size: 13px; letter-spacing: 0.04em; opacity: 0.88; margin-top: 2px; }
  .cap.gram .exj { font-size: 15.5px; margin-top: 12px; letter-spacing: 0.03em; }
  .cap.gram .exe { font-family: 'Noto Serif', serif; font-style: italic; font-size: 13px; opacity: 0.8; }
  @media (max-width: 719px) { .cap .cx { display: none; } .cap.gram { width: 300px; } .cap.gram .exj { font-size: 14px; } }
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
  .hint { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--sky-foot, 0px) + 13px); font-size: 12.5px; letter-spacing: 0.14em; white-space: nowrap; opacity: 0; transition: opacity 600ms; color: var(--sky-ink); pointer-events: none; text-shadow: 0 0 7px var(--sky-paper), 0 0 2px var(--sky-paper); }
  .hint.on { opacity: 0.86; }
  .hint.line { letter-spacing: 0.07em; }
  .hint.top { bottom: auto; top: 60px; left: 30px; transform: none; text-align: left; white-space: normal; width: 232px; line-height: 1.75; letter-spacing: 0.08em; color: var(--sky-text); text-shadow: 0 0 8px var(--sky-deep), 0 0 3px var(--sky-deep); }
  .legend { position: absolute; left: 30px; top: 98px; display: flex; flex-direction: column; gap: 5px; letter-spacing: 0.06em; font-size: 11.5px; white-space: nowrap; opacity: 0; transition: opacity 600ms; color: var(--sky-text); pointer-events: none; }
  .legend.on { opacity: 0.72; }
  .legend span { display: inline-flex; align-items: center; gap: 8px; opacity: 0; }
  .legend i { display: inline-block; width: 26px; height: 0; border-top: 2px solid var(--sky-cord); }
  .legend i.f { border-top: 1px solid var(--sky-line); }
  .legend i.s { border-top: 1px dashed var(--sky-text); opacity: 0.8; }
  .legend i.t { border: 0; height: auto; font-style: normal; text-align: center; font-size: 13px; line-height: 1; }
  .reach, .say { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .reach button { pointer-events: auto; }
  .ring { position: absolute; left: 0; top: 0; border: 2px solid var(--sky-mark); border-radius: 3px; box-shadow: 0 0 0 2px color-mix(in srgb, var(--sky-deep) 72%, transparent); opacity: 0; pointer-events: none; }
  .tools { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 9px; pointer-events: auto; }
  .tools .gap { height: 10px; }
  .tools.away { opacity: 0; pointer-events: none; }
  .tools button { position: relative; width: 34px; height: 34px; padding: 0; font: 400 17px/1 'Yuji Syuku', 'Shippori Mincho B1', serif; color: var(--sky-text); background: color-mix(in srgb, var(--sky-deep) 95%, transparent); border: 1px solid color-mix(in srgb, var(--sky-text) 46%, transparent); border-radius: 3px; cursor: pointer; transition: background 160ms, color 160ms, border-color 160ms, opacity 240ms; }
  .tools button:hover { border-color: var(--sky-text); }
  .tools button[aria-pressed='true'] { background: var(--sky-text); color: var(--sky-ink); border-color: var(--sky-text); }
  .tools button[hidden] { display: none; }
  .tools button:active { transform: scale(0.96); }
  .tools button::after { content: attr(data-tip); position: absolute; right: calc(100% + 10px); top: 50%; transform: translateY(-50%); white-space: nowrap; font: 500 12px/1 'Shippori Mincho B1', serif; letter-spacing: 0.06em; color: var(--sky-ink); background: var(--sky-paper); padding: 7px 10px 8px; border-radius: 2px; box-shadow: 0 1px 0 color-mix(in srgb, var(--sky-ink) 22%, transparent); opacity: 0; pointer-events: none; transition: opacity 140ms cubic-bezier(0.23, 1, 0.32, 1); }
  @media (hover: hover) and (pointer: fine) { .tools button:hover::after { opacity: 1; } }
  .tools button:focus-visible::after { opacity: 1; }
  .tools button:focus-visible { outline: 2px solid var(--sky-mark); outline-offset: 2px; }
  @media (pointer: coarse) { .tools { gap: 6px; } .tools button { width: 44px; height: 44px; font-size: 19px; } }
  @media (max-width: 719px) { .cap.hub { width: 172px; line-height: 1.38; } .cap.hub .yo { display: none; } .cap.hub .kw { font-size: 14px; } .cap.hub .pt { font-size: 11.5px; margin-top: 1px; } .cap.hub .pt b { font-size: 15px; } .cap.hub .kin { font-size: 11px; margin-top: 2px; } .cap.hub .kin button { font-size: 15px; }
    .cap.hub.tight { width: 112px; } .cap.hub.tight .kin, .cap.hub.tight .plus ~ i:nth-of-type(n+3) { display: none; } .cap.note.wrap { width: 172px; white-space: normal; } .cap .gl { font-size: 15px; } .cap .act { margin-top: 8px; padding: 5px 13px 6px; font-size: 12.5px; } .legend { display: none; } }
  @media (max-width: 700px) { .tools { right: 8px; } .hint { font-size: 11px; letter-spacing: 0.04em; white-space: normal; width: 92%; text-align: center; line-height: 1.5; } .hint.top { left: 14px; top: 58px; width: 190px; text-align: left; } .legend { left: 14px; top: 84px; font-size: 10.5px; } .trail { left: 12px; top: 52px; font-size: 13px; } }
  `);

  window.BunkiSkyWeb = function (api, opt) {
    const { S, wrap, ui } = api, W = api.W, L = TXT[opt.lang === 'ja' ? 'ja' : 'en'];
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const web = W.web = { taken: new Set(), items: new Map(), leaving: [], lines: [], linesOut: [], caps: [], cur: null, trail: [], page: 0, walk: [] };
    const tip = el('div', 'tip'); tip.append(el('div', 'rd'), el('div', 'gl')); ui.append(tip);
    const trailEl = el('nav', 'trail'); ui.append(trailEl);
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; const HINT = coarse ? L.hintTouch : L.hint;
    const hint = el('div', 'hint', HINT); ui.append(hint);
    const legend = el('div', 'legend'); ui.append(legend); let legendRows = [];
    /* the legend is built for what is open and lists only the kinds of line that are on the screen */
    function buildLegend(kind, lines) {
      legend.textContent = ''; legendRows = []; const has = (k) => lines.some((l) => l.kind === k), rows = [];
      if (has('cord')) rows.push(['', 'cord', kind === 'k' ? L.legendParts : L.legendCord]);
      if (has('fam')) rows.push(['f', 'fam', kind === 'k' ? L.legendOwn : kind === 'g' ? L.legendEx : kind === 'p' ? L.legendCarry : L.legendFam]);
      if (has('sem')) rows.push(['s', 'sem', L.legendSem]);
      if (S.W >= 720) rows.push(['t', 'turn', L.legendTurn]);
      for (const [c, k, t] of rows) { const s = el('span'); s.append(el('i', c, c === 't' ? '⟲' : null), document.createTextNode(t)); legend.append(s); legendRows.push({ k, node: s }); }
    }
    /* reach: the words in view, and the pieces of an opened word, are real buttons for the keyboard and for a screen
     * reader. They are not drawn (the sky draws them); the one that holds the focus carries a ring, at once. */
    wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', L.skyLabel); api.canvas.setAttribute('aria-hidden', 'true');
    const reach = el('div', 'reach'); reach.setAttribute('role', 'group'); reach.setAttribute('aria-label', L.reach); ui.append(reach);
    const ring = el('div', 'ring'); ui.append(ring);
    const say = el('div', 'say'); say.setAttribute('aria-live', 'polite'); ui.append(say);
    let reachSig = '', focused = null;
    const wordLabel = (i) => { const w = W.D.words[i]; return w[0] + (W.rd[i] ? '、' + W.rd[i] : '') + (w[2] ? ': ' + w[2] : ''); };
    function setReach(list, label) {
      const sig = label + '#' + list.map((x) => x.key).join('|'); if (sig === reachSig) return; const had = !!focused; reachSig = sig; focused = null; W.kbFocus = false; reach.textContent = ''; reach.setAttribute('aria-label', label);
      for (const x of list) { const b = el('button', '', x.label); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); x.act(); }); b.addEventListener('focus', () => { focused = x; W.kbFocus = true; }); b.addEventListener('blur', () => { if (focused === x) { focused = null; W.kbFocus = false; ring.style.opacity = '0'; } }); reach.append(b); }
      if (had && reach.firstChild) reach.firstChild.focus();
    }
    function refreshReach(force) {
      if (!W.ready) return;
      if (web.cur) { const order = { centre: 0, hub: 1, fam: 2, own: 2, sem: 3, homo: 4, kin: 5 }, its = [...web.items.values()].filter((it) => it.kind !== 'a' && !(it.kind === 'x')).sort((a, b) => order[a.role] - order[b.role] || (a.delay - b.delay));
        setReach(its.map((it) => ({ key: it.key + ':' + it.role, label: it.kind === 'w' ? wordLabel(it.id) : it.kind === 'k' ? W.D.kanji[it.id][0] + ': ' + W.D.kanji[it.id][1] : it.kind === 'g' ? it.text : it.text + (W.D.parts[it.id] ? ': ' + (W.D.parts[it.id][2] || W.D.parts[it.id][1] || '') : ''), act: () => web.tap({ t: 'i', item: it }), pos: () => (web.items.get(it.key) === it && it.born ? { x: it.x.x, y: it.y.x, w: it.w || it.s.x, h: it.s.x * 1.24 } : null) })), L.reach); return; }
      if (focused && !force) return;   // the list never changes under the focus (letting a family go is the one exception: the focus moves to the nearest word)
      if (W.tgt && W.tgt.ov > 0.5) { setReach(W.sectors().filter((s) => s.name !== '…').map((s) => ({ key: 'sec' + s.name, label: L.sayDown(s.name + (s.sub ? ' ' + s.sub : '')), act: () => { W.cam.aTo = s.th; W.setOver(false); }, pos: () => null })), L.reachOver); return; }
      const top = W.hits.slice().sort((a, b) => W.vis[b * 5 + 2] - W.vis[a * 5 + 2]).slice(0, 14);
      setReach(top.map((i) => ({ key: 'w' + i, label: wordLabel(i), act: () => open('w', i), pos: () => (W.visAt[i] >= S.frame - 1 ? { x: W.vis[i * 5], y: W.vis[i * 5 + 1], w: W.vis[i * 5 + 4], h: W.vis[i * 5 + 2] * 1.3 } : null) })), L.reach);
    }
    let hinted = false, marginKey = '';
    W.onTouch = () => { hinted = true; };
    /* the line on the paper margin: first how to move; after the first touch, what the present order is, that the
     * words in gold are his own, and what the red thread is. From above it stands at the top left with the red lines
     * explained. Each arrives only when the thing it speaks of is on the screen. */
    const GLYPH = { form: '形', sound: '音', read: '読', mean: '意' };
    function margin() {
      const over = S.view ? S.view.over : 0, above = W.tgt && W.tgt.ov > 0.5, wide = S.W >= 720; let text = '', cls = '';
      if (web.cur) text = '';
      else if (above) { if (over > 0.84) { text = (coarse || !wide ? L.hintOverTouch : L.hintOver) + (wide ? ' ' + L.overLegend : ''); cls = 'top'; } }
      else if (over < 0.12 && W.fieldAlpha && W.fieldAlpha() > 0.9 && S.view.fwd[1] > -0.2 && S.view.fwd[1] < 0.05 && Math.abs(S.view.eye[1]) < 130) {   // only while the paper margin is what lies at the foot of the view
        if (!hinted) text = HINT;
        else { text = GLYPH[W.lens] + '　' + W.lensCaption(W.lens).replace(/^.[：:]\s*/, ''); if (wide) { text += '　・　' + L.ownLegend; if (web.walk.length > 1) text += '　・　' + L.pathLegend; } cls = 'line'; }
      }
      const key = cls + '|' + text; if (key === marginKey) return; marginKey = key;
      if (text) { hint.textContent = text; hint.className = 'hint on' + (cls ? ' ' + cls : ''); } else hint.classList.remove('on');
    }
    /* seals on the right edge: the orders of the sky, the view from above, the way back to the front */
    const tools = el('div', 'tools'); ui.append(tools);
    const seal = (glyph, tip, fn) => { const b = el('button', '', glyph); b.type = 'button'; b.dataset.tip = tip; b.setAttribute('aria-label', tip); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); tools.append(b); return b; };
    const lensBtn = {}; if (W.setLens) { lensBtn.form = seal('形', L.lensForm, () => W.setLens('form')); lensBtn.sound = seal('音', L.lensSound, () => W.setLens('sound')); lensBtn.mean = seal('意', L.lensMean, () => W.setLens('mean')); lensBtn.read = seal('読', L.lensRead, () => W.setLens('read')); lensBtn.form.setAttribute('aria-pressed', 'true'); lensBtn.sound.hidden = true; lensBtn.mean.hidden = true; lensBtn.read.hidden = true; tools.append(el('div', 'gap')); }
    W.lensCaption = (name) => ({ form: L.lensForm, sound: L.lensSound, read: L.lensRead, mean: L.lensMean })[name] || '';
    const overBtn = W.setOver ? seal('俯', L.over, () => W.setOver(!(W.tgt.ov > 0.5))) : null;
    const frontBtn = W.resetView ? seal('正', L.front, () => W.resetView()) : null; if (frontBtn) frontBtn.hidden = true;
    W.onOver = (on) => { if (overBtn) { overBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); overBtn.dataset.tip = on ? L.down : L.over; overBtn.setAttribute('aria-label', overBtn.dataset.tip); } };
    let gramBtn = null; W.onContext = () => { if (!gramBtn && W.gram && W.gram.length) { gramBtn = seal('文', L.gram, () => W.lookUp()); tools.insertBefore(gramBtn, overBtn); } };
    if (W.gram && W.gram.length) W.onContext();
    W.onLens = (name) => { for (const k of Object.keys(lensBtn)) lensBtn[k].setAttribute('aria-pressed', k === name ? 'true' : 'false'); };
    W.lensReady = (name) => { if (lensBtn[name]) lensBtn[name].hidden = false; };

    /* ---------------------------------------------------------------- data helpers */
    let partKanji = null;
    web.onData = () => { const D = W.D; partKanji = Array.from({ length: D.parts.length }, () => []); D.kanji.forEach((k, ki) => { for (const p of k[5]) partKanji[p].push(ki); if (k[6] >= 0 && !k[5].includes(k[6])) partKanji[k[6]].push(ki); }); for (const a of partKanji) a.sort((x, y) => D.kanji[y][9] - D.kanji[x][9]); };
    if (W.D) web.onData();
    const scaleU = () => clamp(Math.min(S.W / 1728, S.H / 1084), 0.5, 1.14);
    const centreXY = () => (S.W < 720 ? [S.W / 2, Math.max(150, S.H * 0.2)] : [S.W / 2, S.H * 0.44]);
    const kun = (s) => String(s).replace('.', '·');

    /* ---------------------------------------------------------------- building a constellation */
    const HUBS = { 1: [[-335, 0]], 2: [[-345, 0], [345, 0]], 3: [[-405, 36], [0, -236], [405, 36]], 4: [[-435, 54], [-152, -238], [152, -238], [435, 54]] };
    const DIRS = { 1: [Math.PI], 2: [Math.PI, 0], 3: [Math.PI, -Math.PI / 2, 0], 4: [Math.PI - 0.12, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42, 0.12] };
    const TOP = [[0, -236], [-252, -196], [252, -196], [-152, -318], [152, -318]];   // wide enough apart that the note under one never runs into the next
    const BOT = [[0, 240], [-205, 256], [205, 256], [-104, 318], [104, 318]];
    /* places for a character's family, nearest first; they keep clear of the note under the character */
    /* (the outer places stand on rays that pass between the inner ones, so no line to an outer word runs through an inner word) */
    const SIDE = [[182, -14, 25], [152, -98, 25], [178, 76, 25], [304, -99, 20], [316, 53, 20], [222, -230, 20], [256, 193, 20], [112, -208, 20], [142, 226, 20]];
    const UPW = [[0, -142, 24], [-104, -118, 22], [104, -118, 22], [-214, -92, 20], [214, -92, 20]];
    function fanSlots(hx, hy, dir, up) { return up ? UPW.map(([x, y, sz]) => [hx + x, hy + y, sz]) : SIDE.map(([x, y, sz]) => [hx + (Math.cos(dir) < 0 ? -x : x), hy + y, sz]); }
    /* an opened family is a thing in space: each piece has its own depth, and the hand can turn the whole of it */
    const DZ = { centre: 0, hub: -70, fam: 70, sem: 120, homo: 130, kin: 140, own: 95 };
    const rot = { yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, toYaw: 0, toPitch: 0 };
    web.turn = (dx, dy) => { rot.toYaw = clamp(rot.toYaw + dx * 0.0046, -0.52, 0.52); rot.toPitch = clamp(rot.toPitch - dy * 0.0036, -0.32, 0.32); };
    web.turnEnd = () => {};
    const mk = (o) => Object.assign({ x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, s: { x: 0, v: 0 }, a: { x: 0, v: 0 }, delay: 0, depth: 600, marks: null, w: 0, h: 0, born: false, zz: 0 }, o);
    function build(kind, id) {
      const D = W.D, items = [], lines = [], caps = [], used = new Set();
      const add = (o) => { const it = mk(o); it.dz = (DZ[it.role] || 0) + (it.role === 'fam' && it.size <= 21 ? 85 : 0); items.push(it); if (it.kind === 'w') used.add(it.id); return it; };
      const wordMarks = (wi, ch) => { const out = []; Array.from(D.words[wi][0]).forEach((c, n) => { if (c === ch) out.push(n); }); return out; };
      if (kind === 'w') {
        const w = D.words[id], chars = Array.from(w[0]), hubsCh = []; for (const c of chars) if (HAN.test(c) && !hubsCh.includes(c)) hubsCh.push(c);
        const n = clamp(hubsCh.length, 1, 4), cs = chars.length <= 3 ? 70 : chars.length === 4 ? 58 : 46;
        const centre = add({ key: 'w' + id, kind: 'w', id, text: w[0], font: 'w', role: 'centre', tx: 0, ty: 0, size: cs, depth: 520 });
        caps.push({ of: centre, dy: -cs * 0.60 - 26, cls: 'cap', wait: 0.34, build: (n2) => n2.append(el('div', 'rd', W.rd[id])) });
        caps.push({ of: centre, dy: cs * 0.60 + 8, cls: 'cap', wait: 0.46, build: (n2) => { if (w[2]) n2.append(el('div', 'gl', w[2])); if (canOpen('w', id)) { const b = el('button', 'act', L.open + '  →'); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); openPage('w', id); }); n2.append(b); } sentenceBlock(n2, id); } });
        /* linked by meaning: the stored relation and its note */
        const sem = (W.sem.get(id) || []).slice().sort((a, b) => REL_ORDER[a.rel] - REL_ORDER[b.rel]).slice(0, 5), semSlots = n >= 3 ? BOT : TOP;
        sem.forEach((e, q) => { const it = add({ key: 'w' + e.w, kind: 'w', id: e.w, text: D.words[e.w][0], font: 'w', role: 'sem', q, tx: semSlots[q][0], ty: semSlots[q][1], size: 24, depth: 640, delay: 0.62 + q * 0.05, from: centre });
          lines.push({ a: centre, b: it, kind: 'sem', delay: 0.60 + q * 0.05 });
          caps.push({ of: it, dy: 20, cls: 'cap note', build: (n2) => { n2.append(el('span', 'tag', L.rel[e.rel])); if (e.note) n2.append(el('span', 'nt', e.note)); } }); });
        /* its characters, each with its own family */
        const hubItems = [];
        hubsCh.slice(0, 4).forEach((ch, h) => { const ki = W.byKanji.get(ch), [hx, hy] = HUBS[n][h], dir = DIRS[n][h], up = Math.abs(Math.sin(dir)) > 0.6, hs = [98, 98, 84, 76][n - 1];
          const hub = add({ key: (ki != null ? 'k' + ki : 'x' + ch), kind: ki != null ? 'k' : 'x', id: ki != null ? ki : ch, text: ch, font: 'k', role: 'hub', tx: hx, ty: hy, size: hs, depth: 470, delay: 0.24 + h * 0.07, glyph: { of: centre, at: chars.indexOf(ch) - (chars.length - 1) / 2 } }); hubItems.push(hub);
          lines.push({ a: centre, b: hub, kind: 'cord', delay: 0.24 + h * 0.07 });
          if (ki == null) { caps.push({ of: hub, dy: hs * 0.58 + 4, cls: 'cap hub', wait: 0.62 + h * 0.07, build: (n2) => n2.append(el('div', 'yo', L.out)) }); return; }
          caps.push(up ? { of: hub, dx: hs * 0.60 + 6, dy: -hs * 0.46, left: true, cls: 'cap hub side', wait: 0.62 + h * 0.07, build: (n2) => hubCaption(n2, ki) } : { of: hub, dy: hs * 0.58 + 2, cls: 'cap hub', wait: 0.62 + h * 0.07, build: (n2) => hubCaption(n2, ki) });
          const fam = W.fam[ki].filter((wi) => wi !== id && !used.has(wi)), slots = fanSlots(hx, hy, dir, up), shown = fam.slice(0, slots.length);
          shown.forEach((wi, q) => { const it = add({ key: 'w' + wi, kind: 'w', id: wi, text: D.words[wi][0], font: 'w', role: 'fam', q, tx: slots[q][0], ty: slots[q][1], size: slots[q][2], depth: 610, marks: wordMarks(wi, ch), delay: 0.52 + h * 0.06 + q * 0.04, from: hub });
            lines.push({ a: hub, b: it, kind: 'fam', delay: 0.50 + h * 0.06 + q * 0.04 }); });
          if (fam.length > shown.length) { const r = 392, pin = add({ key: 'a' + h, kind: 'a', id: h, text: '', font: 'w', role: 'fam', tx: hx + (up ? 300 : Math.cos(dir) * r), ty: hy + (up ? -150 : Math.sin(dir) * r - 8), size: 12, depth: 610, delay: 0.9 }); caps.push({ of: pin, dy: -8, cls: 'cap more', build: (n2) => { const b = el('button', '', L.more(fam.length - shown.length)); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); open('k', ki); }); n2.append(b); } }); } });
        /* two characters of one word that share a meaning part: say so */
        for (let a = 0; a < hubItems.length; a += 1) for (let b = a + 1; b < hubItems.length; b += 1) { const A = hubItems[a], B = hubItems[b]; if (A.kind !== 'k' || B.kind !== 'k') continue; const pa = D.kanji[A.id][8], pb = D.kanji[B.id][8]; if (pa < 0 || pb < 0) continue; const ca = D.parts[pa][0], cb = D.parts[pb][0]; if ((VARIANT[ca] || ca) !== (VARIANT[cb] || cb)) continue;
          lines.push({ a: A, b: B, kind: 'bond', delay: 0.5, bow: -150 }); centre.bondTop = cs * 0.60 + 112; const g = D.parts[pa][2] || D.parts[pb][2]; caps.push({ of: centre, dy: -cs * 0.60 - 96, cls: 'cap bond', build: (n2) => n2.append(document.createTextNode(L.both(ca === cb ? ca : ca + ' ・ ' + cb) + (g ? '　·　' + g : ''))) }); }
        /* the same sound, another word */
        if (n <= 2) { const homo = (W.rd[id] ? W.byReading.get(W.rd[id]) || [] : []).filter((wi) => wi !== id && !used.has(wi)).slice(0, 3);
          homo.forEach((wi, q) => { const it = add({ key: 'w' + wi, kind: 'w', id: wi, text: D.words[wi][0], font: 'w', role: 'homo', tx: BOT[q][0], ty: BOT[q][1] + 26 + (W.ctx && W.ctx.wordSent && W.ctx.wordSent[id] ? 78 : 0), size: 21, depth: 660, delay: 0.78 + q * 0.05, from: centre });
            lines.push({ a: centre, b: it, kind: 'homo', delay: 0.76 + q * 0.05 });
            caps.push({ of: it, dy: 18, cls: 'cap note', build: (n2) => { n2.append(el('span', 'tag', L.homo)); if (D.words[wi][2]) n2.append(el('span', 'nt', D.words[wi][2])); } }); }); }
      } else if (kind === 'k') {
        const k = D.kanji[id], parts = k[5].slice(0, 4), n = parts.length;
        const centre = add({ key: 'k' + id, kind: 'k', id, text: k[0], font: 'k', role: 'centre', tx: 0, ty: -4, size: 132, depth: 520, capH: 58 + (canOpen('k', id) ? 46 : 0) });
        caps.push({ of: centre, dy: 132 * 0.56 + 2, cls: 'cap', build: (n2) => { n2.append(el('div', 'gl', k[1] + (k[4] ? '  ·  ' + L.strokes(k[4]) : ''))); n2.append(el('div', 'rd small', [k[2].slice(0, 3).join('・'), k[3].slice(0, 2).map(kun).join('・')].filter(Boolean).join('　'))); if (canOpen('k', id)) { const b = el('button', 'act', L.open + '  →'); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); openPage('k', id); }); n2.append(b); } } });
        const famAll = W.fam[id], page = web.page % Math.max(1, Math.ceil(famAll.length / 10)), mine = famAll.slice(page * 10, page * 10 + 10), slots = TOP.concat(BOT);
        mine.forEach((wi, q) => { const it = add({ key: 'w' + wi, kind: 'w', id: wi, text: D.words[wi][0], font: 'w', role: 'own', q, tx: slots[q][0] * 1.06, ty: slots[q][1] + (q < 5 ? -16 : 40), size: 25, depth: 610, marks: wordMarks(wi, k[0]), delay: 0.40 + q * 0.04, from: centre });
          lines.push({ a: centre, b: it, kind: 'fam', delay: 0.38 + q * 0.04 }); });
        if (famAll.length > 10) caps.push({ of: centre, dx: 0, dy: mine.length > 5 ? 408 : 132 * 0.56 + 62 + (canOpen('k', id) ? 46 : 0), cls: 'cap more', wait: 0.9, build: (n2) => { const b = el('button', '', L.words(famAll.length) + '  ·  ' + (page + 1) + ' / ' + Math.ceil(famAll.length / 10) + '  →'); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); web.page += 1; open('k', id, true); }); n2.append(b); } });
        parts.forEach((p, h) => { const part = D.parts[p], asK = part[3], [hx, hy] = (n === 1 ? [[-470, 0]] : n === 2 ? [[-470, 0], [470, 0]] : n === 3 ? [[-480, -150], [480, -30], [-480, 180]] : [[-480, -150], [480, -150], [-480, 180], [480, 180]])[h], out = hx < 0 ? -1 : 1;
          const hub = add({ key: asK >= 0 ? 'k' + asK : 'p' + p, kind: asK >= 0 ? 'k' : 'p', id: asK >= 0 ? asK : p, text: part[0], font: 'k', role: 'hub', tx: hx, ty: hy, size: 66, depth: 470, delay: 0.24 + h * 0.07, glyph: { of: centre, at: 0, k: 0.5 } });
          lines.push({ a: centre, b: hub, kind: 'cord', delay: 0.24 + h * 0.07 });
          caps.push({ of: hub, dy: 66 * 0.58 + 2, cls: 'cap hub', wait: 0.62 + h * 0.07, build: (n2) => { const row = el('div', 'pt'); if (p === k[6]) row.append(el('span', 'tag', L.sound + ' ' + k[7])); if (p === k[8]) row.append(el('span', 'tag', L.rad)); row.append(el('i', '', part[2] || part[1] || '')); n2.append(row); } });
          const sib = (partKanji[p] || []).filter((x) => x !== id && !items.some((it) => it.kind === 'k' && it.id === x)).slice(0, n >= 3 ? 3 : 4);
          sib.forEach((x, q) => { const ang = [78, 46, 14, 110][q] * Math.PI / 180, it = add({ key: 'k' + x, kind: 'k', id: x, text: D.kanji[x][0], font: 'k', role: 'kin', tx: hx + out * Math.sin(ang) * 190, ty: hy - Math.cos(ang) * 168, size: 38, depth: 640, delay: 0.56 + h * 0.06 + q * 0.045, from: hub });
            lines.push({ a: hub, b: it, kind: 'fam', delay: 0.54 + h * 0.06 + q * 0.045 }); }); });
      } else if (kind === 'g') {
        const g = W.gramById.get(id), len = Array.from(g.p).length, cs = len <= 5 ? 62 : len <= 9 ? 46 : 34;
        const centre = add({ key: 'g' + id, kind: 'g', id, text: g.p, font: 'w', role: 'centre', tx: 0, ty: -150, size: cs, depth: 520, capH: 150 });
        caps.push({ of: centre, dy: -cs * 0.6 - 28, cls: 'cap', build: (n2) => { n2.append(el('span', 'tag', g.lvName)); n2.append(el('span', 'gl', opt.lang === 'ja' && g.mJa ? g.mJa : g.mEn)); } });
        caps.push({ of: centre, dy: cs * 0.6 + 6, cls: 'cap gram', build: (n2) => { if (g.form) n2.append(el('div', 'fm', g.form)); for (const ex of g.ex.slice(0, 2)) { n2.append(el('div', 'exj', ex[0])); if (ex[1]) n2.append(el('div', 'exe', ex[1])); } } });
        g.words.slice(0, 8).forEach((wi, q) => { const x = (q - (Math.min(8, g.words.length) - 1) / 2) * 150, it = add({ key: 'w' + wi, kind: 'w', id: wi, text: D.words[wi][0], font: 'w', role: 'own', q, tx: x, ty: 250 + (q % 2) * 46, size: 23, depth: 610, delay: 0.14 + q * 0.04 }); lines.push({ a: centre, b: it, kind: 'fam', delay: 0.1 + q * 0.04, under: true }); });
      } else {
        const part = D.parts[id];
        const centre = add({ key: 'p' + id, kind: 'p', id, text: part[0], font: 'k', role: 'centre', tx: 0, ty: 0, size: 120, depth: 520, capH: 34 });
        caps.push({ of: centre, dy: 120 * 0.56 + 2, cls: 'cap', build: (n2) => n2.append(el('div', 'gl', [part[1], part[2]].filter(Boolean).join('  ·  '))) });
        (partKanji[id] || []).slice(0, 14).forEach((x, q) => { const ang = -Math.PI / 2 + (q / 14) * Math.PI * 2, r = q % 2 ? 300 : 232, it = add({ key: 'k' + x, kind: 'k', id: x, text: D.kanji[x][0], font: 'k', role: 'kin', tx: Math.cos(ang) * r * 1.5, ty: Math.sin(ang) * r * 0.86, size: 44, depth: 620, delay: 0.1 + q * 0.03 });
          lines.push({ a: centre, b: it, kind: 'fam', delay: 0.06 + q * 0.03 }); });
      }
      if (S.W < 720 && kind !== 'g') return narrow(kind, { kind, id, items, lines, caps });
      /* a line between a character and one of its words bends round any other word that stands in its way */
      { const boxes = items.filter((it) => it.kind !== 'a').map((it) => ({ it, x: it.tx, y: it.ty, hw: (it.kind === 'w' || it.kind === 'g' ? Array.from(it.text).length * it.size * 0.52 : it.size * 0.56) + 7, hh: it.size * 0.62 + 6 }));
        for (const l of lines) { if (l.kind !== 'fam') continue; const A = l.a, B = l.b, x0 = A.tx, y0 = A.ty, x1 = B.tx, y1 = B.ty, len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / len, ny = (x1 - x0) / len, plain = (x1 - x0) * (y1 - y0) > 0 ? 9 : -9;
          const hits = (bend) => { const cx = (x0 + x1) / 2 + nx * bend, cy = (y0 + y1) / 2 + ny * bend; for (let q = 1; q < 14; q += 1) { const t = q / 14, mt = 1 - t, X = mt * mt * x0 + 2 * mt * t * cx + t * t * x1, Y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1; for (const b of boxes) { if (b.it === A || b.it === B) continue; if (Math.abs(X - b.x) < b.hw && Math.abs(Y - b.y) < b.hh) return true; } } return false; };
          l.bend = plain; for (const bend of [plain, -plain, 24, -24]) if (!hits(bend)) { l.bend = bend; break; } } }   // a gentle bend only: a line never loops
      if (kind === 'w' && items.filter((it) => it.role === 'hub').length === 1 && !items.some((it) => it.role === 'sem' || it.role === 'homo')) for (const it of items) it.tx += 160;
      return { kind, id, items, lines, caps };
    }
    /** A narrow screen (a phone held upright): the word at the top, its characters in a row beneath, each family
     * hanging in a column under its character. Same pieces, same rules, laid out to be read with one thumb. */
    function narrow(kind, c) {
      const U = scaleU(), P = (v) => v / U, centre = c.items.find((it) => it.role === 'centre'), hubs = c.items.filter((it) => it.role === 'hub'), n = hubs.length, drop = new Set();
      const capOf = (it) => c.caps.filter((cp) => cp.of === it);
      if (kind === 'w') {
        const cs = centre.size >= 70 ? 52 : centre.size >= 58 ? 44 : 36, HX = { 1: [0], 2: [-92, 92], 3: [-118, 0, 118], 4: [-138, -46, 46, 138] }[n] || [0], hs = [60, 60, 50, 42][Math.max(0, n - 1)], fs = [19, 19, 17, 15][Math.max(0, n - 1)], ch = n <= 2 ? 70 : 54, top = 172, col0 = top + hs * 0.58 + ch + 18;
        centre.size = P(cs); centre.tx = 0; centre.ty = 0; centre.capH = P(92);
        const cc = capOf(centre); if (cc[0]) cc[0].dy = -P(cs * 0.6 + 22); if (cc[1]) cc[1].dy = P(cs * 0.6 + 6); if (cc[2]) { cc[2].dy = P(cs * 0.6 + 76); }
        hubs.forEach((hub, h) => { hub.tx = P(HX[h]); hub.ty = P(top); hub.size = P(hs); hub.capH = P(ch + 4); hub.dz = -40; for (const cp of capOf(hub)) { cp.dy = P(hs * 0.58 + 2); cp.dx = 0; cp.left = false; cp.cls = 'cap hub' + (n >= 3 ? ' tight' : ''); } });
        for (const it of c.items) {
          if (it.kind === 'a') { const hub = hubs[it.id]; if (!hub) { drop.add(it); continue; } it.tx = hub.tx; it.ty = P(col0 + 4 * 32 + 2); it.dz = 110; }
          else if (it.role === 'fam') { if (it.q > 3) { drop.add(it); continue; } it.tx = it.from.tx; it.ty = P(col0 + it.q * 32); it.size = P(fs); it.dz = 50 + it.q * 16; }
          else if (it.role === 'sem') { if (it.q > 1) { drop.add(it); continue; } it.tx = P(it.q ? 94 : -94); it.ty = P(col0 + 4 * 32 + 58); it.size = P(19); it.dz = 100; for (const cp of capOf(it)) { cp.dy = P(15); cp.cls = 'cap note wrap'; } }
          else if (it.role === 'homo') drop.add(it);
        }
        c.fit = () => { hubs.forEach((hub, h) => { const cp = capOf(hub)[0], hgt = cp && cp.node ? cp.node.offsetHeight : ch, start = top + hs * 0.58 + hgt + 34; hub.capH = P(hgt + 10);
          for (const it of c.items) { if (it.kind === 'a' && it.id === h) it.ty = P(start + 4 * 32 + 2); else if (it.role === 'fam' && it.from === hub) it.ty = P(start + it.q * 32); } });
          const low = Math.max(...c.items.filter((it) => it.role === 'fam' || it.kind === 'a').map((it) => it.ty), P(col0)); for (const it of c.items) if (it.role === 'sem') it.ty = low + P(56); };
        c.lines = c.lines.filter((l) => l.kind === 'cord' || (l.kind === 'fam' && l.b.q === 0));   // under each character its words hang in a plain column; one line joins the character to the column
        for (const l of c.lines) l.under = true;
      } else if (kind === 'k') {
        const HX = { 1: [0], 2: [-80, 80], 3: [-110, 0, 110], 4: [-132, -44, 44, 132] }[n] || [0], top = 196, row0 = top + 40 * 0.58 + 52;
        centre.size = P(96); centre.tx = 0; centre.ty = 0; const cc = capOf(centre); if (cc[0]) cc[0].dy = P(96 * 0.56 + 2); if (cc[1]) cc[1].dy = P(96 * 0.56 + 60 + (c.caps[0] && cc[0] && cc[0].node ? 0 : 0));
        hubs.forEach((hub, h) => { hub.tx = P(HX[h]); hub.ty = P(top); hub.size = P(40); hub.dz = -30; for (const cp of capOf(hub)) { cp.dy = P(40 * 0.58 + 2); cp.cls = 'cap hub tight'; } });
        for (const it of c.items) { if (it.role === 'kin') drop.add(it); else if (it.role === 'own') { if (it.q > 7) { drop.add(it); continue; } it.tx = P(it.q % 2 ? 90 : -90); it.ty = P(row0 + Math.floor(it.q / 2) * 34); it.size = P(19); it.dz = 70; } }
        c.lines = c.lines.filter((l) => l.kind === 'cord'); for (const l of c.lines) l.under = true; centre.capH = P(112);
        c.fit = () => { const h0 = cc[0] && cc[0].node ? cc[0].node.offsetHeight : 92, base0 = 96 * 0.56 + 2 + h0; if (cc[1]) cc[1].dy = P(base0 + 6); const top2 = base0 + (cc[1] ? 30 : 6) + 40, row2 = top2 + 40 * 0.58 + 52; centre.capH = P(h0 + (cc[1] ? 34 : 8));
          hubs.forEach((hub) => { hub.ty = P(top2); }); for (const it of c.items) if (it.role === 'own') it.ty = P(row2 + Math.floor(it.q / 2) * 34); };
      } else { for (const it of c.items) if (it !== centre) { it.tx *= 0.44; it.ty = it.ty * 0.9 + 190; it.size = P(30); } centre.size = P(84); centre.ty = 0; }
      c.items = c.items.filter((it) => !drop.has(it)); c.lines = c.lines.filter((l) => !drop.has(l.a) && !drop.has(l.b)); c.caps = c.caps.filter((cp) => !drop.has(cp.of) && cp.cls !== 'cap bond');
      return c;
    }
    /** A sentence from the app's own reading that holds this word, as stored, with the word marked and its source named. */
    function sentenceBlock(node, id) {
      const C = W.ctx, list = C && C.wordSent ? C.wordSent[id] : null; if (!list || !list.length) return; const w = W.D.words[id][0], box = el('div', 'cx'); let at = 0;
      const marks = C.wordSentAt ? C.wordSentAt[id] : null;
      const show = () => { box.textContent = ''; const row = C.sentences[list[at]], text = row[1], m = marks && marks[at], k = m ? m[0] : text.indexOf(w), len = m ? m[1] : w.length;   // the stored place of the word, so a bent form (持って for 持つ) is marked too
        if (k < 0) box.append(document.createTextNode(text)); else box.append(document.createTextNode(text.slice(0, k)), el('b', '', text.slice(k, k + len)), document.createTextNode(text.slice(k + len)));
        if (row[2] && row[0] !== -1) box.append(el('span', 'en', row[2]));   // one source stores its English in pieces and lower case: left out rather than shown badly
        const art = row[0] >= 0 ? C.articles[row[0]] : null, src = el('span', 'src', L.seenIn + '　' + (art ? art[1] : ({ '-1': 'SNOW T15 / T23', '-2': 'Tanaka Corpus', '-3': 'ja.wikinews' })[String(row[0])] || '')); if (list.length > 1) { const b = el('button', '', (at + 1) + ' / ' + list.length + '  →'); b.type = 'button'; b.title = L.ctxMore; b.addEventListener('click', (e) => { e.stopPropagation(); at = (at + 1) % list.length; show(); }); src.append(b); } box.append(src); };
      show(); node.append(box);
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
      rot.toYaw = 0; rot.toPitch = 0;
      const c = build(kind, id), next = new Map();
      for (const it of c.items) { start(it, prev); next.set(it.key, it); }
      for (const [key, it] of prev) if (!next.has(key)) { it.leavingAt = S.t; web.leaving.push(it); }
      for (const cap of web.caps) cap.node.remove();
      web.caps = c.caps.map((cp) => { const node = el('div', cp.cls); cp.build(node); ui.append(node); return Object.assign(cp, { node }); });
      if (c.fit) c.fit(); tools.classList.toggle('away', S.W < 720);
      for (const l of web.lines) if (!next.has(l.a.key) || !next.has(l.b.key) || next.get(l.a.key) !== l.a) web.linesOut.push(l);
      web.items = next; web.lines = c.lines.map((l) => Object.assign(l, { p: { x: 0, v: 0 } })); web.cur = { kind, id, t0: S.t };
      web.taken = new Set(); for (const it of next.values()) if (it.kind === 'w') web.taken.add(it.id); for (const it of web.leaving) if (it.kind === 'w') web.taken.add(it.id);
      web.takenG = new Set(); for (const it of next.values()) if (it.kind === 'g') web.takenG.add(it.id);
      if (kind === 'w' && web.walk[web.walk.length - 1] !== id) { web.walk.push(id); if (web.walk.length > 60) web.walk.shift(); }
      const label = kind === 'w' ? W.D.words[id][0] : kind === 'k' ? W.D.kanji[id][0] : kind === 'g' ? W.gramById.get(id).p : W.D.parts[id][0], at = web.trail.findIndex((t) => t.kind === kind && t.id === id);
      if (at >= 0) web.trail.length = at + 1; else web.trail.push({ kind, id, label }); if (web.trail.length > 7) web.trail.splice(0, web.trail.length - 7);
      drawTrail(); buildLegend(kind, c.lines); legend.classList.add('on'); hinted = true; setTip(null);
      for (const cp of web.caps) if (cp.of.role === 'hub' && !cp.left && S.W >= 720) cp.of.capH = cp.node.offsetHeight / scaleU() + 6;   // a line to a word below a character starts under that character's note, never through it
      refreshReach(); { const hubs = c.items.filter((it) => it.role === 'hub').map((it) => it.text + (it.kind === 'k' ? ' ' + W.D.kanji[it.id][1] : '')).join(', '), nRel = c.items.filter((it) => it.kind === 'w' && it.role !== 'centre').length; say.textContent = L.sayOpen(label + (kind === 'w' && W.D.words[id][2] ? ' (' + W.D.words[id][2] + ')' : ''), hubs, nRel); }
      if (opt.onState) opt.onState({ open: true, kind, id, label });
    }
    function close() {
      if (!web.cur) return; for (const it of web.items.values()) { it.leavingAt = S.t; it.home = true; web.leaving.push(it); }
      web.takenG = new Set(); web.items = new Map(); for (const l of web.lines) web.linesOut.push(l); web.lines = []; for (const cap of web.caps) cap.node.remove(); web.caps = []; web.cur = null; web.trail = []; drawTrail(); legend.classList.remove('on'); tools.classList.remove('away');
      reachSig = ''; refreshReach(true); say.textContent = L.sayBack;
      if (opt.onState) opt.onState({ open: false });
    }
    function drawTrail() {
      trailEl.textContent = ''; if (!web.trail.length) { trailEl.classList.remove('on'); return; }
      const home = el('button', '', L.sky); home.type = 'button'; home.title = L.back; home.addEventListener('click', (e) => { e.stopPropagation(); close(); }); trailEl.append(el('span', 'knot'), home);
      web.trail.forEach((t, n) => { trailEl.append(el('span', 'sep')); const b = el('button', '', t.label); b.type = 'button'; if (n === web.trail.length - 1) b.setAttribute('aria-current', 'true'); b.addEventListener('click', (e) => { e.stopPropagation(); open(t.kind, t.id); }); trailEl.append(b); });
      trailEl.classList.add('on');
    }
    const target = (kind, id) => (kind === 'g' ? { kind: 'grammar' } : kind === 'w' ? { kind: 'word', word: W.D.words[id][0], reading: W.D.words[id][1] } : { kind: 'kanji', char: W.D.kanji[id][0] });
    function canOpen(kind, id) { if (kind !== 'w' && kind !== 'k') return false; return opt.canOpen ? !!opt.canOpen(target(kind, id)) : !!opt.onOpen; }
    function openPage(kind, id) { if (!canOpen(kind, id)) return; const D = W.D; if (opt.onOpen) opt.onOpen(kind === 'w' ? { kind: 'word', word: D.words[id][0], reading: D.words[id][1] } : { kind: 'kanji', char: D.kanji[id][0] }); }
    web.isOpen = () => !!web.cur; web.open = open; web.close = close;
    web.tap = (h) => {
      if (!h) { if (web.cur) close(); return; }
      if (h.t === 'w') { open('w', h.i); return; }
      if (h.t === 'g') { open('g', h.i); return; }
      if (h.t === 'i') { const it = h.item; if (it.role === 'centre') { if (it.kind === 'w' || it.kind === 'k') openPage(it.kind, it.id); return; } if (it.kind === 'x') return; open(it.kind, it.id); }
    };
    web.pick = (px, py, slop) => { let best = null; for (const it of web.items.values()) { if (it.a.x < 0.5 || it.kind === 'a' || it.kind === 'x' && it.role !== 'centre') continue; if (Math.abs(px - it.x.x) <= it.w / 2 + slop && Math.abs(py - it.y.x) <= it.s.x * 0.62 + slop) { if (!best || it.zz < best.zz) best = it; } } return best ? { t: 'i', item: best, id: best.key } : null; };

    /* ---------------------------------------------------------------- frame */
    web.update = (dt) => {
      if (!W.ready) return; const u = scaleU(), [cx, cy] = centreXY(), t = web.cur ? S.t - web.cur.t0 : 0, pk = 0.35 * S.F;
      const sway = S.reduced ? 0 : 1; spring(rot.yaw, rot.toYaw + sway * 0.05 * Math.sin(S.t * 0.33), 6, dt); spring(rot.pitch, rot.toPitch + sway * 0.022 * Math.sin(S.t * 0.26 + 1.1), 6, dt);
      const cyw = Math.cos(rot.yaw.x), syw = Math.sin(rot.yaw.x), cpt = Math.cos(rot.pitch.x), spt = Math.sin(rot.pitch.x), D0 = 1500;
      for (const it of web.items.values()) {
        const x1 = it.tx * cyw + it.dz * syw, z1 = -it.tx * syw + it.dz * cyw, y1 = it.ty * cpt - z1 * spt, z2 = it.ty * spt + z1 * cpt, k = D0 / (D0 + z2); it.zz = z2;
        const X = cx + x1 * k * u - S.parS.x.x * pk / it.depth, Y = cy + y1 * k * u + S.parS.y.x * pk / it.depth, Sz = Math.max(it.size * u * k, it.role === 'centre' ? 30 : 12);
        if (!it.born) { const f = it.from, g = it.glyph; if (t < it.delay || (g && !g.of.born)) continue; it.born = true;
          if (S.reduced) { it.x.x = X; it.y.x = Y; it.s.x = Sz; }
          else if (g) { it.x.x = g.of.x.x + g.at * g.of.s.x; it.y.x = g.of.y.x; it.s.x = g.of.s.x * (g.k || 1); }   // on its own glyph inside the word
          else if (f) { it.x.x = f.x.x + (X - f.x.x) * 0.35; it.y.x = f.y.x + (Y - f.y.x) * 0.35; it.s.x = Sz * 0.9; } else { it.x.x = X; it.y.x = Y + 10; it.s.x = Sz * 0.94; } it.a.x = 0; }
        const om = it.glyph ? 6.2 : 7.5; spring(it.x, X, om, dt); spring(it.y, Y, om, dt); spring(it.s, Sz, om, dt); spring(it.a, 1, 6, dt); it.rest = Math.abs(it.x.v) + Math.abs(it.y.v) + Math.abs(it.s.v) < 0.6;
      }
      for (let n = web.leaving.length - 1; n >= 0; n -= 1) { const it = web.leaving[n]; let gone = false;
        if (S.reduced) { spring(it.a, 0, 14, dt); if (it.a.x < 0.03) gone = true; }
        else if (it.glyph && it.glyph.of && it.glyph.of.leavingAt) { const g = it.glyph, c = g.of; spring(it.x, c.x.x + g.at * c.s.x, 9.5, dt); spring(it.y, c.y.x, 9.5, dt); spring(it.s, c.s.x * (g.k || 1), 9.5, dt); spring(it.a, 0, 7.5, dt); if (it.a.x < 0.03) gone = true; }
        else if (it.from && it.from.leavingAt && it.kind !== 'w') { spring(it.x, it.from.x.x, 9, dt); spring(it.y, it.from.y.x, 9, dt); spring(it.a, 0, 9, dt); if (it.a.x < 0.03) gone = true; }
        else if (it.home && it.kind === 'w') { const p = W.project(it.id), on = p && p.x > -80 && p.x < S.W + 80 && p.y > -40 && p.y < S.H * S.hor; if (on) { spring(it.x, p.x, 8.2, dt); spring(it.y, p.y, 8.2, dt); spring(it.s, p.size, 8.2, dt); spring(it.a, 0.85, 5, dt); if (S.t - it.leavingAt > 0.75 && Math.abs(it.x.x - p.x) + Math.abs(it.y.x - p.y) < 2.5) gone = true; } else { spring(it.a, 0, 8, dt); spring(it.s, it.s.x * 0.9, 5, dt); if (it.a.x < 0.03) gone = true; } }
        else { spring(it.a, 0, 9, dt); if (it.a.x < 0.03) gone = true; }
        if (gone || S.t - it.leavingAt > 2.2) { web.leaving.splice(n, 1); if (it.kind === 'w' && !web.items.has(it.key)) web.taken.delete(it.id); } }
      for (const l of web.lines) spring(l.p, t >= l.delay && l.a.born && l.b.born ? 1 : 0, 5.2, dt);
      for (let n = web.linesOut.length - 1; n >= 0; n -= 1) { const l = web.linesOut[n]; spring(l.p, 0, 15, dt); if (l.p.x < 0.03) web.linesOut.splice(n, 1); }
      spring(wake.k, wake.i >= 0 && !web.cur ? 1 : 0, 8, dt); W.kinK = wake.k.x; if (wake.k.x < 0.01 && wake.i < 0) { W.kin = null; wake.lines = []; }
    };
    function edge(it, tx, ty, pad) { const dx = tx - it.x.x, dy = ty - it.y.x, hw = it.w / 2 + pad, hh = it.s.x * 0.58 + pad, k = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh, 1e-6); return k >= 1 ? [it.x.x, it.y.x] : [it.x.x + dx * k, it.y.x + dy * k]; }
    function drawItem(it) {
      if (it.kind === 'a') return;   // a pin: it only carries a note
      const pal = S.pal, D = W.D, px = it.size * scaleU() * S.dpr, rest = it.rest && !it.leavingAt;
      let sp = W.spriteFor(it.kind === 'w' ? it.id : it.key, it.text, it.font, px, it.marks, 2000 + it.size, true);
      const col = pal.text, a = it.a.x * (it.leavingAt ? 1 : lerp(1, 0.7, clamp(it.zz / 320, 0, 1)));
      if (!sp && it.kind === 'w' && W.hasBase(it.id)) { const box = W.pushLabel(it.x.x, it.y.x, it.s.x, null, it.id, col, a, pal.mark, 0, 0); if (box) it.w = box.w - it.s.x * 0.5; return; }
      if (!sp) { it.w = Array.from(it.text).length * it.s.x; return; }
      if (it.s.x >= 15) W.pushLabel(it.x.x, it.y.x + it.s.x * 0.015, it.s.x * 1.035, sp, 0, pal.c[0], 0.66 * a, pal.c[0], 0.66 * a, 3.0);
      const box = W.pushLabel(it.x.x, it.y.x, it.s.x, sp, 0, col, a, pal.mark, a, 0, null, rest); if (box) it.w = box.w - 24 * it.s.x / sp.px; void D;
    }
    web.draw = () => {
      const pal = S.pal;
      for (const it of web.leaving) drawItem(it);
      for (const l of web.linesOut.concat(web.lines)) { if (l.p.x < 0.01) continue; const A = l.a, B = l.b, al = Math.min(A.a.x, B.a.x);
        const pad = l.kind === 'cord' ? 10 : B.role === 'kin' ? 3 : 7; let [x0, y0] = edge(A, B.x.x, B.y.x, pad); const [x1, y1] = edge(B, A.x.x, A.y.x, pad);
        if (A.capH && B.y.x > A.y.x + A.s.x * 0.5 && (l.under || (A.role === 'centre' && A.kind !== 'w' && l.kind === 'fam') || (A.role === 'hub' && l.kind === 'fam' && B.ty > A.ty + 100))) { const ux = A.x.x + clamp((B.x.x - A.x.x) * 0.22, -70, 70), uy = A.y.x + A.s.x * 0.56 + A.capH * scaleU(); if (uy <= y1 - 8) { x0 = ux; y0 = uy; } else if (A.role !== 'hub') continue; }   // start under the notes, never through them (where a character's note is too tall for that, the line keeps its plain course)
        if (l.kind === 'cord') W.pushLine(x0, y0, x1, y1, 0, 2.3, pal.cord, 0.95 * al, l.p.x);
        else if (l.kind === 'fam') W.pushLine(x0, y0, x1, y1, l.bend != null ? l.bend * scaleU() : (x1 - x0) * (y1 - y0) > 0 ? 9 : -9, 1.1, pal.line, 0.62 * al, l.p.x);
        else if (l.kind === 'bond') W.pushLine(A.x.x, A.y.x - A.s.x * 0.62, B.x.x, B.y.x - B.s.x * 0.62, l.bow * scaleU(), 1.2, pal.mark, 0.6 * al, l.p.x);
        else { if (A.bondTop && B.y.x < A.y.x && Math.abs(B.x.x - A.x.x) < 90 * scaleU()) { x0 = A.x.x + (B.x.x - A.x.x) * 0.3; y0 = A.y.x - A.bondTop * scaleU(); if (y0 < y1 + 10) continue; } dashed(x0, y0, x1, y1, pal.text, 0.5 * al, l.p.x); } }
      const order = [...web.items.values()].filter((it) => it.born).sort((a, b) => b.zz - a.zz); for (const it of order) drawItem(it);
    };
    function dashed(x0, y0, x1, y1, col, a, prog) { const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / 11)); for (let q = 0; q < n; q += 2) { const t0 = q / n, t1 = Math.min(1, (q + 1) / n); if (t0 > prog) break; W.pushLine(lerp(x0, x1, t0), lerp(y0, y1, t0), lerp(x0, x1, t1), lerp(y0, y1, t1), 0, 1.0, col, a, 1); } }
    web.after = () => {
      const u = scaleU(); margin();
      if (web.cur) { const tO = S.t - web.cur.t0; for (const row of legendRows) { let a = 0; if (row.k === 'turn') a = tO > 1.5 ? 1 : 0; else for (const l of web.lines) if (l.kind === row.k && l.p.x > a) a = l.p.x; row.node.style.opacity = a.toFixed(2); } }
      if (!web.cur && S.frame % 45 === 3) refreshReach();
      if (focused) { const q = focused.pos(); if (q) { ring.style.opacity = '1'; ring.style.width = (q.w + 14).toFixed(1) + 'px'; ring.style.height = (q.h + 8).toFixed(1) + 'px'; ring.style.transform = 'translate(' + (q.x - q.w / 2 - 7).toFixed(1) + 'px,' + (q.y - q.h / 2 - 4).toFixed(1) + 'px)'; } else ring.style.opacity = '0'; }
      if (frontBtn && W.tgt) { const g = W.tgt, away = !web.cur && g.ov < 0.5 && (Math.abs(g.yaw) > 0.06 || Math.abs(g.pitch) > 0.06 || Math.abs(g.offY) > 25 || Math.abs(g.offZ) > 50); if (frontBtn.hidden === away) frontBtn.hidden = !away; }
      const tOpen = web.cur ? S.t - web.cur.t0 : 9;
      for (const cp of web.caps) { const it = cp.of, node = cp.node, a = it.born ? clamp((it.a.x - 0.35) / 0.65, 0, 1) * (cp.wait ? clamp((tOpen - cp.wait) / 0.24, 0, 1) : 1) : 0; node.style.opacity = a.toFixed(3); if (a <= 0) continue;
        const x = it.x.x + (cp.dx || 0) * u, y = it.y.x + cp.dy * (it.s.x / (it.size * u || 1)) * u; node.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)' + (cp.left ? '' : ' translateX(-50%)'); }
      if (tipOn) { let x = 0, y = 0, s = 0, ok = false; if (tipOn.t === 'g') { const q = W.gHits.find((z) => z.i === tipOn.q.i); if (q) { x = q.x; y = q.y; s = q.s; ok = true; } } else if (tipOn.t === 'w') { if (W.visAt[tipOn.i] >= S.frame - 1) { const o = tipOn.i * 5; x = W.vis[o]; y = W.vis[o + 1]; s = W.vis[o + 2]; ok = true; } } else { const it = tipOn.item; x = it.x.x; y = it.y.x; s = it.s.x; ok = web.items.has(it.key); }
        if (ok) { tip.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)'; tip.firstChild.style.bottom = (s * 0.62 + 5) + 'px'; tip.lastChild.style.top = (s * 0.62 + 4) + 'px'; tip.style.opacity = '1'; } else tip.style.opacity = '0'; }
    };

    /* ---------------------------------------------------------------- waking a word by touch of the pointer */
    const wake = { i: -1, k: { x: 0, v: 0 }, lines: [] }; let tipOn = null;
    function setTip(h) {
      tipOn = null; if (!h) { tip.style.opacity = '0'; return; } const D = W.D;
      if (h.t === 'g') { const g = W.gramById.get(h.i), q = W.gHits.find((x) => x.i === h.i); tip.firstChild.textContent = g.lvName; tip.lastChild.textContent = opt.lang === 'ja' && g.mJa ? g.mJa : g.mEn; tipOn = q ? { t: 'g', q } : null; return; }
      if (h.t === 'w') { tip.firstChild.textContent = W.rd[h.i]; tip.lastChild.textContent = D.words[h.i][2] || ''; tipOn = h; }
      else if (h.t === 'i') { const it = h.item; if (it.role === 'centre' || it.role === 'hub' || it.role === 'sem' || it.role === 'homo') { tip.style.opacity = '0'; return; }
        if (it.kind === 'w') { tip.firstChild.textContent = W.rd[it.id]; tip.lastChild.textContent = D.words[it.id][2] || ''; } else if (it.kind === 'k') { tip.firstChild.textContent = D.kanji[it.id][2].slice(0, 2).join('・'); tip.lastChild.textContent = D.kanji[it.id][1]; } else { tip.firstChild.textContent = D.parts[it.id][1] || ''; tip.lastChild.textContent = D.parts[it.id][2] || ''; } tipOn = h; }
    }
    W.onHover = (h) => {
      setTip(h); if (web.cur) { wake.i = -1; return; }
      if (h && h.t === 'w') { wake.i = h.i; const D = W.D, kin = new Set(), lines = [], o = h.i * 5, hx = W.vis[o], hy = W.vis[o + 1];
        if (W.lens === 'sound') { for (const wi of (W.rd[h.i] ? W.byReading.get(W.rd[h.i]) || [] : [])) if (wi !== h.i && W.visAt[wi] >= S.frame - 1) { kin.add(wi); lines.push(wi); } }
        else if (W.lens === 'mean' && W.mOrder) { const rm = W.mOrder.realmOf[h.i], near = []; for (const wi of W.hits) { if (wi === h.i || W.mOrder.realmOf[wi] !== rm) continue; const q = wi * 5; near.push([Math.hypot(W.vis[q] - hx, W.vis[q + 1] - hy), wi]); } near.sort((x, y) => x[0] - y[0]); for (const [, wi] of near.slice(0, 8)) { kin.add(wi); lines.push(wi); } }
        else if (W.lens === 'read' && W.rOrder) { const a = W.rOrder.home[h.i]; if (a >= 0) { const near = []; for (const wi of W.ctx.articleWords[a]) { if (wi === h.i || W.rOrder.home[wi] !== a || W.visAt[wi] < S.frame - 1) continue; const q = wi * 5; near.push([Math.hypot(W.vis[q] - hx, W.vis[q + 1] - hy), wi]); } near.sort((x, y) => x[0] - y[0]); for (const [, wi] of near.slice(0, 8)) { kin.add(wi); lines.push(wi); } } }
        else for (const k of D.words[h.i][4]) { const near = []; for (const wi of W.fam[k]) { if (wi === h.i || W.visAt[wi] < S.frame - 1 || W.vis[wi * 5 + 3] < 0.1) continue; const q = wi * 5; near.push([Math.hypot(W.vis[q] - hx, W.vis[q + 1] - hy), wi]); } near.sort((a, b) => a[0] - b[0]); for (const [d2, wi] of near.slice(0, 5)) { if (d2 > 440) break; if (!kin.has(wi)) { kin.add(wi); lines.push(wi); } } }   // only kin that stand near: a thread never runs across the whole sky
        W.kin = kin; wake.lines = lines; } else wake.i = -1;
    };
    W.drawPath = () => {
      const wk = web.walk; if (wk.length < 1) return; const over = S.view ? S.view.over : 0, a0 = (0.34 + 0.4 * over) * (1 - 0.7 * S.dim.x), col = S.pal.cord; let prev = null, prevId = -1;
      for (const id of wk) { const p = W.project(id), on = p && p.z2 > 70 && p.x > -300 && p.x < S.W + 300 && p.y > -300 && p.y < S.H + 300 ? p : null;
        if (on && prev) { const dx = on.x - prev.x, dy = on.y - prev.y, box = (q, wid) => { const hw = (W.visAt[wid] >= S.frame - 1 ? W.vis[wid * 5 + 4] / 2 : q.size * 1.2) + 7, hh = q.size * 0.62 + 6; return 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh, 1e-6); }, k0 = over > 0.5 ? 0 : box(prev, prevId), k1 = over > 0.5 ? 0 : box(on, id);
          if (k0 + k1 < 0.95) W.pushLine(prev.x + dx * k0, prev.y + dy * k0, on.x - dx * k1, on.y - dy * k1, 0, 1.3, col, a0, 1); }
        if (on && over > 0.5) W.pushLabel(on.x, on.y, 3.4, null, 0, col, Math.min(1, a0 * 2.2), col, 0, 0, { u: 0, v: 0 });
        prev = on; prevId = id; }
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
