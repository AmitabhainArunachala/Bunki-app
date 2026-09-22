/* SKIP is a lookup lens, not evidence of learning. All mutable data belongs
 * to the caller's ephemeral S.skipUi; nothing here writes learner storage.
 * Classic-script surface also works in the fully embedded standalone. */
(function (root) {
  'use strict';
  const ROW = 44;
  const PAGE = 72;
  const node = (tag, cls, text) => {
    const out = document.createElement(tag);
    if (cls) out.className = cls;
    if (text != null) out.textContent = text;
    return out;
  };
  const button = (cls, text, click) => {
    const out = node('button', cls, text);
    out.type = 'button';
    out.addEventListener('click', click);
    return out;
  };
  const core = () => root.BunkiSkipCore;
  const text = (ja, en, bilingual) => bilingual ? en : ja;
  const any = (bi) => text('指定なし', 'Any', bi);
  const makeState = () => ({
    status: 'idle', data: null, byChar: null, pending: null, error: null,
    sessions: {}, searchOpen: false,
  });
  function parse(raw) {
    // Script failures must never prevent ordinary dictionary search.
    if (core()) return core().parseQuery(String(raw).replace(/^\s*skip(?:\s+|$)/i, 'skip:'));
    return { kind: /^\s*skip\b/i.test(raw) || /^\s*[\d*?]+[-－–—]/.test(raw) ? 'invalid' : 'text',
      error: 'SKIP lookup is unavailable. Reload the page to try again.' };
  }
  async function ensureData(state) {
    if (state.data) return state.data;
    if (state.pending) return state.pending;
    state.status = 'loading';
    state.error = null;
    state.pending = (async () => {
      if (!core()) throw new Error('SKIP engine unavailable');
      let data = root.__CORRIDOR_BUNDLE__?.['share_alike/skip'];
      const embedded = document.getElementById('corridor-skip-data');
      if (!data && embedded) data = JSON.parse(embedded.textContent);
      if (!data) {
        if (root.__CORRIDOR_STANDALONE__) throw new Error('Embedded SKIP index is missing');
        const response = await fetch('data/share_alike/skip.json');
        if (!response.ok) throw new Error(`SKIP index: ${response.status}`);
        data = await response.json();
      }
      if (data?.schemaVersion !== 1 || !Array.isArray(data.entries) || !data.entries.length)
        throw new Error('Unsupported SKIP index');
      state.data = data;
      state.byChar = new Map(data.entries.map((entry) => [entry.literal, entry]));
      state.maxStrokes = Math.max(1, ...data.entries.flatMap((e) => [
        ...(e.strokeCounts || []),
        ...(e.canonical || []).flatMap((code) => code.split('-').slice(1).map(Number)),
        ...(e.alternatives || []).flatMap((alt) => alt.code.split('-').slice(1).map(Number)),
      ]).filter(Number.isFinite));
      state.status = 'ready';
      return data;
    })().catch((error) => {
      state.status = 'error';
      state.error = error;
      throw error;
    }).finally(() => { state.pending = null; });
    return state.pending;
  }
  function getKanji(state, literal) {
    const e = state?.byChar?.get(literal);
    if (!e) return null;
    return { c: e.literal, m: e.meanings?.join('; ') || 'No English meaning in KANJIDIC2',
      on: e.readings?.on || [], kun: e.readings?.kun || [],
      st: e.strokeCounts?.[0] || null, rad: e.radical, parts: [], skipFallback: true };
  }
  function symbol(pattern) {
    const mark = node('span', `skip-symbol skip-symbol-${pattern}`);
    mark.setAttribute('aria-hidden', 'true');
    mark.append(node('i'), node('i'));
    return mark;
  }
  function link(label, href) {
    const a = node('a', null, label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function rules(bi, session) {
    const fold = node('details', 'skip-rules');
    fold.open = !!session.rulesOpen;
    fold.addEventListener('toggle', () => { session.rulesOpen = fold.open; });
    fold.append(node('summary', null, text('SKIP の引き方・数え方・出典', 'How SKIP works · counting rules · credits', bi)));
    const body = node('div', 'skip-rules-body');
    body.append(node('p', null, text(
      '読み方を知らなくても、全体の形と画数から探せます。コードは「形－前半の画数－後半の画数」。部首は追加の絞り込みで、コードには入りません。',
      'Find a character without knowing its reading. The code is pattern–first count–second count. Radical is an optional extra filter, never a fourth code segment.', bi)));
    const definitions = [
      ['1', '左右', 'Left–right', '左の部分 → 右の部分。例：休 1-2-4。', 'Count the left part, then the right part. Example: 休 1-2-4.'],
      ['2', '上下', 'Up–down', '上の部分 → 下の部分。例：字 2-3-3。', 'Count the upper part, then the lower part. Example: 字 2-3-3.'],
      ['3', '囲み', 'Enclosure', '外側の囲み → 内側。例：国 3-3-5。囲みは閉じていなくてもよい。', 'Count the enclosing part, then the inside. Example: 国 3-3-5. An enclosure need not close on every side.'],
      ['4', '一体', 'Solid', '分けられない形。全文字の画数 → 種類番号（画数ではない）。例：本 4-5-3。', 'An indivisible shape. Count the whole character, then choose a subtype (not a stroke count). Example: 本 4-5-3.'],
    ];
    const list = node('ol', 'skip-rule-patterns');
    for (const [p, ja, en, descJa, descEn] of definitions) {
      const item = node('li');
      const heading = node('strong', null, `${p} · ${text(ja, en, bi)}`);
      heading.prepend(symbol(p));
      item.append(heading, node('p', null, text(descJa, descEn, bi)));
      list.append(item);
    }
    body.append(list);
    body.append(node('p', null, text(
      '最初の自然な境目で二つに分けます。左右に三つなら、まず左の部分を分けます。画の途中や、これ以上分けられない一体の部分を切らないでください。部首を知っているかどうかは関係ありません。',
      'Split at the first natural boundary: with three side-by-side parts, separate the leftmost part first. Never cut a stroke or break an indivisible unit. A visual split is not necessarily the dictionary radical.', bi)));
    body.append(node('p', null, text(
      '分ける位置：① 左から最初の空間、② 上から最初の空間・横線・枠、③ 外から最初の囲み。複数の型に見える場合は、文字の自然な構成に沿う分け方を選びます。',
      'Where to divide: 1 at the first space from the left; 2 at the first space, horizontal line or frame from the top; 3 at the first enclosure from the outside. If several primary patterns seem possible, follow the character’s natural construction.', bi)));
    body.append(node('p', null, text(
      '一体型の優先順：① 上に横線 → ② 下に横線 → ③ 全体を貫く縦線 → ④ その他。複数に当てはまるときは、この順の最初を選びます。',
      'Solid subtype precedence: 1 top horizontal line → 2 bottom horizontal line → 3 vertical line through the whole character → 4 other. If more than one applies, choose the first in this order.', bi)));
    body.append(node('p', null, text(
      '画数はペンを紙から離すまでを一画とします。曲がりや鉤を別々に数えないこと。口は3画、日は4画、氵と忄は各3画です。字体・印刷体で違って見えることがあります。迷ったら * で片方を省略するか、別分類を明示的に含めてください。',
      'Count one continuous pen movement as one stroke; a bend or hook is not automatically another stroke. 口 has 3, 日 has 4, and 氵 and 忄 each have 3. Printed and regional forms can mislead. If unsure, leave a count as * or explicitly include recorded alternate classifications.', bi)));
    body.append(node('p', null, text(
      '標準コードを先に表示します。別分類は、資料に記録された位置の違いや数え違いです。習熟度や正誤の評価ではありません。',
      'Canonical codes come first. Alternates are source-recorded positional classifications or common miscounts, not mastery levels or a judgment of your answer.', bi)));
    const credits = node('p', 'skip-credits');
    credits.append(document.createTextNode('The SKIP (System of Kanji Indexing by Patterns) system for ordering kanji was developed by Jack Halpern ('),
      link('Kanji Dictionary Publishing Society', 'https://www.kanji.org/'),
      document.createTextNode('), and is used with his permission. System and established codes: Creative Commons Attribution–ShareAlike 4.0. '),
      link('Permission and attribution', 'https://www.kanji.org/dictionaries/skip_permission.htm'),
      document.createTextNode(' · '),
      link('SKIP guide · EDRDG', 'http://www.edrdg.org/wwwjdic/SKIP.html'),
      document.createTextNode(' · '),
      link('CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'));
    const dictionaryCredit = node('p', 'skip-credits');
    dictionaryCredit.append(document.createTextNode('This lookup uses the KANJIDIC2 dictionary file, the property of the '),
      link('Electronic Dictionary Research and Development Group', 'https://www.edrdg.org/'),
      document.createTextNode(', in conformance with the '),
      link('Group’s licence', 'https://www.edrdg.org/edrdg/licence.html'),
      document.createTextNode(' · '),
      link('KANJIDIC documentation', 'https://www.edrdg.org/wiki/KANJIDIC_Project.html'),
      document.createTextNode('. JSON conversion by '),
      link('jmdict-simplified', 'https://github.com/scriptin/jmdict-simplified'),
      document.createTextNode('. The lookup preserves canonical codes and labels recorded alternates.'));
    body.append(credits, dictionaryCredit);
    fold.append(body);
    return fold;
  }
  function mount(host, options) {
    const { state, onOpen, onQuery, radicals = {}, bilingual: bi = true, partsOf = null, partInfo = null } = options;
    const key = options.sessionKey || 'kanjidex';
    const session = state.sessions[key] ||= {
      query: 'skip:1-*-*', parts: [1, null, null], radical: null, leftPart: null,
      includeAlternates: false, visible: PAGE, gridScroll: 0, rulesOpen: false,
    };
    if (!('leftPart' in session)) session.leftPart = null;
    // The parts column (operator, 2026-09-17): "see and scroll through the
    // left side particles … that CORRELATE WITH THE left stroke order
    // number". The component layer knows each kanji's parts and each part's
    // stroke count, not its position — so the column lists the parts among the
    // current hits whose stroke count equals the first count of the code
    // (left, upper or outer), and picking one narrows the hits to kanji that
    // carry it. Its label says exactly that.
    const withParts = typeof partsOf === 'function' && typeof partInfo === 'function';
    function partOptions(hits) {
      const count = session.parts[1];
      const anyOption = { value: null, label: any(bi) };
      if (!withParts || !count || session.parts[0] === 4) return [anyOption];
      const tally = new Map();
      for (const hit of hits) {
        for (const p of partsOf(hit.literal) || []) {
          const info = partInfo(p);
          if (!info || info.st !== count) continue;
          tally.set(p, (tally.get(p) || 0) + 1);
        }
      }
      const rows = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].codePointAt(0) - b[0].codePointAt(0));
      return [anyOption, ...rows.map(([p, n]) => ({
        value: p, label: p, sub: String(n),
        aria: `${p} ${partInfo(p)?.name || ''} · ${count}${text('画', ' strokes', bi)} · ${n}${text('字', ' kanji', bi)}`,
      }))];
    }
    if (options.query != null && options.query !== session.query) {
      session.query = options.query;
      session.visible = PAGE;
      session.gridScroll = 0;
    }
    const parsed = parse(session.query);
    if (parsed.kind === 'skip') session.parts = [...parsed.parts];
    host.replaceChildren();
    const wrap = node('section', 'skip-ui');
    wrap.setAttribute('aria-label', text('SKIP 漢字検索', 'SKIP kanji lookup', bi));
    host.append(wrap);
    const title = node('div', 'skip-title');
    title.append(node('h2', null, text('形から探す · SKIP', 'Find by shape · SKIP', bi)));
    const code = node('output', 'skip-code', parsed.kind === 'skip' ? session.parts.map((p) => p ?? '*').join('-') : '—');
    code.setAttribute('aria-label', text('現在の SKIP コード', 'Current SKIP code', bi));
    title.append(code);
    wrap.append(title);
    const help = node('p', 'skip-help', text(
      '字を選ぶか、下の四つの列を動かします。形・画数・部首は検索条件です。',
      'Choose a character, or roll the four columns below. Shape, counts and radical are lookup filters.', bi));
    wrap.append(help);
    const results = node('div', 'skip-results');
    const wheelHost = node('div', 'skip-wheel-host');
    wrap.append(results, wheelHost, rules(bi, session));
    let generation = 0;
    function retryMessage() {
      results.replaceChildren(node('p', 'skip-error', text(
        'SKIP 索引を読み込めません。通常の検索は使えます。',
        'The SKIP index could not load. Ordinary search is still available.', bi)));
      results.append(button('skip-retry', text('もう一度読み込む', 'Retry SKIP index', bi), load));
    }
    function load() {
      const current = ++generation;
      results.replaceChildren(node('p', 'skip-status', text('SKIP 索引を読み込み中…', 'Loading the SKIP index…', bi)));
      results.setAttribute('aria-busy', 'true');
      ensureData(state).then(() => {
        if (current !== generation || !wrap.isConnected) return;
        results.removeAttribute('aria-busy');
        buildWheels();
        paintResults();
      }).catch(() => {
        if (current !== generation || !wrap.isConnected) return;
        results.removeAttribute('aria-busy');
        retryMessage();
      });
    }
    function paintResults() {
      const active = parse(session.query);
      const focused = document.activeElement;
      const focusId = results.contains(focused) ? focused.id : null;
      results.replaceChildren();
      if (active.kind !== 'skip') {
        const error = node('p', 'skip-error', active.error || text('SKIP コードを入力してください。', 'Enter a SKIP code.', bi));
        error.setAttribute('role', 'status');
        results.append(error, node('p', 'skip-help', text(
          '例：1-3-8、1-3、1-*-8。形は1〜4。一体型は4-全文字の画数-種類1〜4。',
          'Try 1-3-8, 1-3 or 1-*-8. Patterns are 1–4; solid codes use 4–total strokes–subtype 1–4.', bi)));
        return;
      }
      const allHits = core().search(state.data, active, {
        includeAlternates: session.includeAlternates, radical: session.radical,
      }).sort((a, b) => {
        // Useful everyday characters first within each classification; this
        // is dictionary frequency, never a learner's mastery or history.
        const group = Number(a.matchType === 'alternate') - Number(b.matchType === 'alternate');
        return group || (a.frequency || Infinity) - (b.frequency || Infinity) ||
          (a.strokeCounts?.[0] || 0) - (b.strokeCounts?.[0] || 0) ||
          a.literal.codePointAt(0) - b.literal.codePointAt(0);
      });
      // a chosen part that no current hit carries is dropped, never silently
      // applied to an empty grid
      if (session.leftPart && withParts && !allHits.some((h) => (partsOf(h.literal) || []).includes(session.leftPart))) session.leftPart = null;
      const hits = session.leftPart && withParts
        ? allHits.filter((h) => (partsOf(h.literal) || []).includes(session.leftPart))
        : allHits;
      lastAllHits = allHits;
      const canonical = hits.filter((hit) => hit.matchType === 'canonical').length;
      const shown = Math.min(session.visible, hits.length);
      const summary = node('p', 'skip-result-count', text(
        `${hits.length.toLocaleString()} 字 · 標準 ${canonical.toLocaleString()} · ${shown.toLocaleString()} 字表示`,
        `${hits.length.toLocaleString()} kanji · ${canonical.toLocaleString()} canonical · ${shown.toLocaleString()} shown`, bi));
      summary.setAttribute('role', 'status');
      summary.setAttribute('aria-live', 'polite');
      summary.setAttribute('aria-atomic', 'true');
      results.append(summary);
      const alternates = node('label', 'skip-alternates');
      const check = node('input');
      check.type = 'checkbox';
      check.checked = session.includeAlternates;
      check.id = `skip-alternates-${encodeURIComponent(key)}`;
      check.addEventListener('change', () => {
        session.includeAlternates = check.checked;
        session.visible = PAGE;
        session.gridScroll = 0;
        paintResults();
      });
      alternates.append(check, document.createTextNode(text(
        '記録された別分類・数え違いも含める（標準を先に表示）',
        'Include recorded alternates / miscounts (canonical first)', bi)));
      results.append(alternates);
      const viewport = node('div', 'skip-grid-viewport');
      const grid = node('div', 'skip-grid');
      for (const hit of hits.slice(0, shown)) {
        const alternate = hit.matchType === 'alternate';
        const entry = button('skip-hit', null, () => onOpen(hit.literal, entry));
        entry.id = `skip-hit-${encodeURIComponent(key)}-${hit.literal.codePointAt(0).toString(16)}`;
        entry.dataset.skipHit = hit.literal;
        entry.dataset.matchType = hit.matchType;
        entry.dataset.skipCode = hit.matchedCode;
        if (withParts) entry.dataset.parts = (partsOf(hit.literal) || []).join('');
        const meaning = hit.meanings?.slice(0, 2).join('; ') || '';
        entry.setAttribute('aria-label', `${hit.literal} · ${meaning} · SKIP ${hit.matchedCode}${alternate ? ` · ${text('別分類', 'alternate', bi)} ${hit.misclass || ''}` : ''}`);
        entry.title = `${hit.literal} · ${hit.matchedCode}${alternate ? ` · alternate: ${hit.misclass || ''}` : ''} · ${meaning}`;
        entry.append(node('span', 'skip-hit-glyph', hit.literal));
        if (alternate) entry.append(node('span', 'skip-hit-alt', text('別分類', 'alternate', bi)));
        grid.append(entry);
      }
      viewport.append(grid);
      if (!hits.length) viewport.append(node('p', 'skip-empty', text(
        'この条件の字はありません。画数か部首を「指定なし」にしてみてください。',
        'No kanji match. Try Any for a stroke count or radical, or include recorded alternates.', bi)));
      if (shown < hits.length) {
        const more = button('skip-more', text(
          `次の ${Math.min(PAGE, hits.length - shown)} 字を表示（残り ${hits.length - shown} 字）`,
          `Show ${Math.min(PAGE, hits.length - shown)} more · ${hits.length - shown} remaining`, bi), () => {
          const y = viewport.scrollTop;
          session.visible += PAGE;
          paintResults();
          const next = results.querySelector('.skip-grid-viewport');
          if (next) next.scrollTop = y;
          (results.querySelector('.skip-more') || results.querySelectorAll('.skip-hit')[shown])?.focus({ preventScroll: true });
        });
        more.id = `skip-more-${encodeURIComponent(key)}`;
        viewport.append(more);
      }
      results.append(viewport);
      const restoreGridY = session.gridScroll || 0;
      requestAnimationFrame(() => {
        if (viewport.isConnected) viewport.scrollTop = restoreGridY;
      });
      viewport.addEventListener('scroll', () => {
        if (viewport.isConnected) session.gridScroll = viewport.scrollTop;
      }, { passive: true });
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    }
    let lastAllHits = [];
    let partColumn = null;
    function updateQuery() {
      session.query = `skip:${session.parts.map((p) => p ?? '*').join('-')}`;
      session.visible = PAGE;
      session.gridScroll = 0;
      session.leftPart = null;
      code.textContent = session.parts.map((p) => p ?? '*').join('-');
      if (onQuery) onQuery(session.query);
      paintResults();
      if (partColumn) {
        partColumn.setOptions(partOptions(lastAllHits), null);
        partColumn.setLabel(partLabel());
      }
    }
    function partLabel() {
      const count = session.parts[1];
      const side = [null, text('左', 'left', bi), text('上', 'upper', bi), text('外', 'outer', bi)][session.parts[0]] || text('前半', 'first', bi);
      return count && session.parts[0] !== 4
        ? text(`${side}の部品 · ${count}画`, `${side} parts · ${count} strokes`, bi)
        : text('部品 · 画数を選ぶと', 'parts · pick a count first', bi);
    }
    function buildWheels() {
      wheelHost.replaceChildren();
      partColumn = null;
      const labels = [
        [text('形', 'Pattern', bi), text('前半の画数', 'First strokes', bi), text('後半 / 種類', 'Second / subtype', bi)],
        [text('形', 'Pattern', bi), text('左の画数', 'Left strokes', bi), text('右の画数', 'Right strokes', bi)],
        [text('形', 'Pattern', bi), text('上の画数', 'Upper strokes', bi), text('下の画数', 'Lower strokes', bi)],
        [text('形', 'Pattern', bi), text('外の画数', 'Outer strokes', bi), text('内の画数', 'Inner strokes', bi)],
        [text('形', 'Pattern', bi), text('全文字の画数', 'Total strokes', bi), text('種類 · 画数ではない', 'Subtype · not strokes', bi)],
      ];
      const patternOptions = [
        { value: null, label: any(bi) },
        ...['Left–right', 'Up–down', 'Enclosure', 'Solid'].map((en, ix) => ({
          value: ix + 1, label: `${ix + 1}`, aria: `${ix + 1} ${text(['左右', '上下', '囲み', '一体'][ix], en, bi)}`, pattern: ix + 1,
        })),
      ];
      // A syntactically valid typed count beyond this source's range still
      // appears on the wheel; never show "Any" while querying e.g. 1-99-2.
      const countValues = [...new Set([
        ...Array.from({ length: state.maxStrokes }, (_, i) => i + 1),
        ...session.parts.slice(1).filter((n) => Number.isSafeInteger(n) && n > 0),
      ])].sort((a, b) => a - b);
      const counts = [{ value: null, label: any(bi) }, ...countValues.map((value) => ({ value, label: String(value) }))];
      const subtypes = [{ value: null, label: any(bi) }, ...['Top line', 'Bottom line', 'Through line', 'Other'].map((en, ix) => ({
        value: ix + 1, label: `${ix + 1}`, sub: text(['上に横線', '下に横線', '貫く縦線', 'その他'][ix], en, bi),
      }))];
      const radicalOptions = [{ value: null, label: any(bi) }, ...Array.from({ length: 214 }, (_, i) => {
        const n = i + 1;
        const r = radicals[n];
        const glyph = r?.var && [...r.var].length === 1 ? r.var : r?.c;
        return { value: n, label: glyph || String.fromCodePoint(0x2eff + n), sub: String(n),
          aria: `${text('部首', 'Radical', bi)} ${n} ${r?.c || ''} ${r?.var || ''} ${r?.name || ''}` };
      })];
      const wheels = node('div', 'skip-wheels');
      const band = node('div', 'skip-selection-band');
      band.setAttribute('aria-hidden', 'true');
      wheels.append(band);
      const p = session.parts[0] || 0;
      const columns = [];
      columns.push(makeWheel(0, labels[p][0], patternOptions, session.parts[0], (value) => {
        const wasSolid = session.parts[0] === 4;
        session.parts[0] = value;
        // The third number changes meaning at the solid boundary; never
        // silently reinterpret a right/inside stroke count as a subtype.
        if (wasSolid !== (value === 4)) session.parts[2] = null;
        columns[1].setLabel(labels[value || 0][1]);
        columns[2].setLabel(labels[value || 0][2]);
        columns[2].setOptions(value === 4 ? subtypes : counts, session.parts[2]);
        updateQuery();
      }));
      columns.push(makeWheel(1, labels[p][1], counts, session.parts[1], (value) => {
        session.parts[1] = value;
        updateQuery();
      }));
      columns.push(makeWheel(2, labels[p][2], p === 4 ? subtypes : counts, session.parts[2], (value) => {
        session.parts[2] = value;
        updateQuery();
      }));
      columns.push(makeWheel(3, text('部首で絞る · コード外', 'Radical filter · not part of the code', bi), radicalOptions, session.radical, (value) => {
        session.radical = value;
        session.visible = PAGE;
        session.gridScroll = 0;
        paintResults();
      }));
      // the radical wheel is a filter beside the three-number code, never a
      // fourth number (Halpern's SKIP has no radical step); it is marked so
      columns[3].element.classList.add('skip-wheel-filter');
      columns[3].element.dataset.role = 'filter';
      if (withParts) {
        // the parts column, far right: the parts among the current hits whose
        // stroke count equals the code's first count; picking one narrows
        const initialHits = core().search(state.data, parse(session.query), {
          includeAlternates: session.includeAlternates, radical: session.radical,
        });
        partColumn = makeWheel(4, partLabel(), partOptions(initialHits), session.leftPart, (value) => {
          session.leftPart = value;
          session.visible = PAGE;
          session.gridScroll = 0;
          paintResults();
        });
        partColumn.element.classList.add('skip-wheel-filter', 'skip-wheel-parts');
        partColumn.element.dataset.role = 'left-parts';
        columns.push(partColumn);
        wheels.classList.add('has-parts');
      }
      for (const column of columns) wheels.append(column.element);
      wheelHost.append(wheels, node('p', 'skip-wheel-help', text(
        '上下にスクロール・行をタップ。キーボード：↑↓、Home / End。部首はコードに含まれません。',
        'Scroll vertically or tap a row. Keyboard: ↑ ↓, Home / End. Radical is not part of the code.', bi)));
      function makeWheel(number, labelText, initialOptions, initialValue, change) {
        const element = node('div', 'skip-wheel-column');
        const label = node('div', 'skip-wheel-label', labelText);
        label.id = `skip-label-${encodeURIComponent(key)}-${number}`;
        const list = node('div', 'skip-wheel');
        list.id = `skip-wheel-${encodeURIComponent(key)}-${number}`;
        list.tabIndex = 0;
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-labelledby', label.id);
        list.setAttribute('aria-orientation', 'vertical');
        element.append(label, list);
        let values = [], selected = -1, timer, programmatic = false, initialized = false;
        function highlight(ix, notify) {
          if (ix < 0 || ix >= values.length || ix === selected) return;
          selected = ix;
          [...list.children].forEach((row, j) => row.setAttribute('aria-selected', String(j === ix)));
          list.setAttribute('aria-activedescendant', list.children[ix].id);
          if (notify) change(values[ix].value);
        }
        function select(ix) {
          ix = Math.max(0, Math.min(values.length - 1, ix));
          highlight(ix, true);
          programmatic = true;
          list.scrollTo({ top: ix * ROW, behavior: 'auto' });
          requestAnimationFrame(() => { programmatic = false; });
        }
        function setOptions(next, value) {
          values = next;
          selected = -1;
          initialized = false;
          clearTimeout(timer);
          list.replaceChildren();
          values.forEach((option, ix) => {
            const row = node('div', 'skip-wheel-option');
            row.id = `${list.id}-option-${ix}`;
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', 'false');
            row.setAttribute('aria-label', option.aria || `${option.label}${option.sub ? ` ${option.sub}` : ''}`);
            if (option.pattern) row.append(symbol(option.pattern));
            row.append(node('span', 'skip-option-value', option.label));
            if (option.sub) row.append(node('small', 'skip-option-sub', option.sub));
            row.addEventListener('click', () => {
              select(ix);
              list.focus({ preventScroll: true });
            });
            list.append(row);
          });
          const ix = Math.max(0, values.findIndex((o) => o.value === value));
          highlight(ix, false);
          requestAnimationFrame(() => {
            if (!list.isConnected) return;
            list.scrollTop = ix * ROW;
            requestAnimationFrame(() => { initialized = true; });
          });
        }
        list.addEventListener('keydown', (event) => {
          let ix = selected;
          if (event.key === 'ArrowDown' || event.key === 'ArrowRight') ix++;
          else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') ix--;
          else if (event.key === 'Home') ix = 0;
          else if (event.key === 'End') ix = values.length - 1;
          else return;
          event.preventDefault();
          select(ix);
        });
        list.addEventListener('scroll', () => {
          if (!initialized || programmatic || !list.isConnected) return;
          // Native touch momentum stays native. Selection follows the
          // center live; only after motion settles do we correct rounding.
          highlight(Math.max(0, Math.min(values.length - 1, Math.round(list.scrollTop / ROW))), true);
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (!list.isConnected) return;
            list.scrollTo({ top: selected * ROW, behavior: 'auto' });
          }, 180);
        }, { passive: true });
        setOptions(initialOptions, initialValue);
        return { element, setOptions, setLabel(value) { label.textContent = value; } };
      }
    }
    if (state.data) {
      buildWheels();
      paintResults();
    } else if (state.status === 'error') retryMessage();
    else load();
    return wrap;
  }
  function codeDoor(host, { state, literal, onLookup, bilingual: bi = true }) {
    const slot = node('span', 'skip-code-door-wrap');
    host.append(slot);
    function paint() {
      slot.replaceChildren();
      const entry = state.byChar?.get(literal);
      if (!entry?.canonical?.length) {
        slot.append(node('span', 'skip-code-unavailable', text('SKIP 記載なし', 'SKIP not indexed', bi)));
        return;
      }
      for (const code of entry.canonical) {
        const valid = parse(code).kind === 'skip';
        if (!valid) {
          slot.append(node('span', 'skip-code-unavailable', `SKIP ${code} · ${text('資料のコード要確認', 'source code flagged', bi)}`));
          continue;
        }
        const door = button('skip-code-door', `SKIP ${code}`, () => onLookup(code, door));
        door.dataset.skipLookup = code;
        door.setAttribute('aria-label', text(`SKIP ${code} で字を引く`, `Look up kanji with SKIP ${code}`, bi));
        slot.append(door);
      }
    }
    function load() {
      slot.replaceChildren(node('span', 'skip-code-unavailable', text('SKIP 読み込み中…', 'SKIP loading…', bi)));
      ensureData(state).then(() => { if (slot.isConnected) paint(); }).catch(() => {
        if (!slot.isConnected) return;
        slot.replaceChildren(button('skip-code-door', text('SKIP 再読込', 'Retry SKIP', bi), load));
      });
    }
    if (state.data) paint();
    else load();
  }
  root.BunkiSkipUI = Object.freeze({ makeState, parse, ensureData, getKanji, mount, codeDoor });
})(typeof window !== 'undefined' ? window : globalThis);
