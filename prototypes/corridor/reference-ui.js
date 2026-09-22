/**
 * Reference shelves over the committed corpus, not a second study system.
 * This controller owns only disposable navigation state. The corridor owns
 * entry sheets, explicit enrollment, history, and the existing learner store.
 */
(function (global) {
  'use strict';

  const PAGE_SIZE = 100;
  const number = (value) => Number(value).toLocaleString('en-US');
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  };
  const button = (id, text, action, className = 'reference-button') => {
    const element = node('button', className, text);
    element.type = 'button';
    if (id) element.id = id;
    element.addEventListener('click', action);
    return element;
  };

  function create({ catalog, tx, onChange, onOpen, onExit, onStudy, onMock, onSearch, getReturnLabel, getTaken }) {
    const state = {
      collectionId: null,
      jlptKind: 'word',
      query: '',
      page: 1,
      sort: 'reading',
      scroll: 0,
      overviewScroll: 0,
      overviewFocus: null,
      provenanceOpen: false,
    };
    const collections = catalog.collections;
    const entriesByKey = new Map();
    const entriesByPrinted = new Map();
    for (const collection of collections) {
      for (const entry of collection.entries) {
        const type = entry.type || collection.kind;
        const key = `${type}:${entry.key ?? entry.id}`;
        entriesByKey.set(key, entry);
        const printed = `${type}:${entry.id}`;
        if (!entriesByPrinted.has(printed)) entriesByPrinted.set(printed, new Map());
        entriesByPrinted.get(printed).set(key, entry);
      }
    }
    const headwordOrder = new Map();
    const current = () => collections.find((item) => item.id === state.collectionId);
    const entryType = (entry, collection) => entry.type || collection.kind;
    const studySet = () => getTaken();
    const isInStudy = (entry, taken) => {
      const target = entry.canonicalTarget;
      if (!target) return false;
      return taken.some((item) => item.t === target.type && item.id === target.id
        && (target.type !== 'word' || ((!item.cueReading || item.cueReading === target.reading)
          && (!item.entrySeq || (entry.dictionaryLinks || []).some((link) =>
            link.reading === target.reading && link.candidates.includes(String(item.entrySeq)))))));
    };
    const inStudy = (collection, taken) =>
      collection.entries.filter((entry) => isInStudy(entry, taken)).length;
    const focus = (id) => {
      requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));
    };
    const collectionName = (collection) => {
      const level = collection.level === 'unknown' ? tx('級未設定', 'Unassigned') : collection.level;
      if (collection.family === 'kanken') return `${tx('漢検', 'Kanji Kentei')} · ${level}`;
      return `JLPT · ${level} · ${collection.kind === 'kanji' ? tx('漢字', 'Kanji') : tx('語彙', 'Vocabulary')}`;
    };

    function openCollection(collection, invoker) {
      state.overviewScroll = window.scrollY;
      state.overviewFocus = invoker.id;
      state.collectionId = collection.id;
      state.query = '';
      state.page = 1;
      state.scroll = 0;
      onChange();
      window.scrollTo(0, 0);
      focus('reference-title');
    }

    function back() {
      if (!state.collectionId) return false;
      state.collectionId = null;
      state.query = '';
      state.page = 1;
      onChange();
      window.scrollTo(0, state.overviewScroll);
      focus(state.overviewFocus);
      return true;
    }

    function provenance() {
      const details = node('details', 'reference-provenance');
      details.id = 'reference-provenance';
      details.open = state.provenanceOpen;
      details.append(node('summary', null, tx('収録範囲・出典について', 'Coverage & source notes')));
      details.addEventListener('toggle', () => {
        // A detached disclosure can emit a delayed toggle after a full render.
        if (details.isConnected) state.provenanceOpen = details.open;
      });
      const body = node('div', 'reference-source-body');
      body.append(
        node('p', null, tx(
          '全件とは、このアプリに収録された資料の全件です。閲覧しても My Study には追加されません。「My Study に登録」は登録数で、習得数ではありません。',
          '“All entries” means every available record in this app’s bundled sources. Browsing adds nothing to My Study. “In My Study” counts saved items, not known or mastered items.',
        )),
        node('p', null, tx(
          'JLPT の級は資料ごとのタグです。現在の試験には公式の語彙・漢字・文法の網羅的な出題一覧はありません。辞書層と語彙層を合わせ、N1 も収録。級が異なる項目は各資料の級に表示し、相違を明記しています。漢字の JLPT タグは別資料です。',
          'JLPT levels are corpus tags, not an official exam syllabus. The current test does not publish exhaustive vocabulary, kanji, or grammar lists. Vocabulary combines the dictionary and word layers, including N1. Conflicting tags retain membership in each source level and are marked on entries. Kanji tags come from a separate metadata layer.',
        )),
      );
      const jlptLink = node('a', null, tx('JLPT 公式ガイドブック · Q7–Q8', 'Official JLPT guidebook · Q7–Q8'));
      jlptLink.href = 'https://www.jlpt.jp/e/reference/pdf/guidebook_s_e.pdf';
      jlptLink.target = '_blank';
      jlptLink.rel = 'noopener noreferrer';
      body.append(jlptLink);
      body.append(node('p', null, tx(
        '従来のアプリ内の配当表は 2,453 字ですが、参考書庫では拡張された収録資料も統合し、異体字・字形未収録の記録も残しています。各級の数はその級に配当された記録で、下の級を含む累計ではありません。準1級・1級の公式範囲すべての保証ではありません。1/準1級、準1級、配当外、級未設定などの資料上の区分は、推測で再分類せず残しています。',
        'The original app’s Kentei table contains 2,453 characters; this reference adds the extended committed Kentei corpus, including variant forms and source records without a Unicode glyph. Counts are distinct records assigned to a grade, not cumulative exam targets. They are not proof of official exam completeness (approximately 3,000 characters at 準1級 and 6,000 at 1級). Explicit source bins, including 1/準1級, 準1級, 配当外, and unassigned metadata, remain separate; no grade is guessed.',
      )));
      const kankenLink = node('a', null, tx('日本漢字能力検定 · 各級の概要', 'Official Kanji Kentei grade overview'));
      kankenLink.href = 'https://www.kanken.or.jp/kanken/grades/overview/';
      kankenLink.target = '_blank';
      kankenLink.rel = 'noopener noreferrer';
      body.append(kankenLink);
      body.append(node('p', null, tx(
        `漢検の拡張資料 ${number(catalog.stats.sourceRows['kanken-corpus'])} 行を統合。字形未収録は ${number(catalog.stats.missingGlyphRecords)} 件あり、資料 ID で表示します。読み・意味の不足や、現行 JLPT 漢字 N3 にタグ付き項目がないことを、推測で埋めません。`,
        `The extended Kentei corpus contributes ${number(catalog.stats.sourceRows['kanken-corpus'])} source rows. ${number(catalog.stats.missingGlyphRecords)} records lack a Unicode glyph and are identified by source ID. Missing metadata stays visible. There are no N3-tagged kanji in these sources; historical pre-2010 levels are not guessed into modern JLPT levels.`,
      )));
      body.append(node('p', 'reference-source-files', tx(
        '収録資料：dict.json・words.json（語彙）、kanji.json（読み・意味）、strokes.json の meta（JLPT 漢字）、kanken.json・corpus/datasets/kanji/kanken.jsonl（漢検配当）。reference-extra.json は Kotobako・Drift の収録語彙と KANJIDIC 由来のメタデータも保持しています。級をまたぐ合計には同じ項目が含まれる場合があります。',
        'Bundled sources: dict.json and words.json (vocabulary); kanji.json (readings and meanings); strokes.json meta (JLPT kanji); kanken.json and corpus/datasets/kanji/kanken.jsonl (Kentei assignments). reference-extra.json also preserves vocabulary from the committed Kotobako and Drift sources and KANJIDIC-derived metadata. Summing level counts can count the same entry more than once.',
      )));
      const credits = node('p', 'reference-source-credits');
      for (const [label, url] of [
        ['Kentei facts · mimneko/kanji-data · CC0', 'https://github.com/mimneko/kanji-data'],
        ['Dictionary metadata · EDRDG', 'https://www.edrdg.org/'],
        ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
      ]) {
        const link = node('a', null, label);
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        credits.append(link, document.createTextNode(' '));
      }
      body.append(credits);
      details.append(body);
      return details;
    }

    function navigation() {
      const nav = node('nav', 'reference-navigation');
      nav.setAttribute('aria-label', tx('参考書庫の移動', 'Reference navigation'));
      nav.append(button('reference-back', getReturnLabel?.() || (state.collectionId
        ? tx('← 参考書庫', '← Library')
        : tx('← 本棚', '← Reading shelf')), onExit, 'reference-text-button'));
      const others = node('div', 'reference-other-rooms');
      others.append(
        button('reference-global-search', tx('辞書で検索 →', 'Dictionary search →'), () => onSearch(state.query), 'reference-text-button'),
        button('reference-study', tx('My Study →', 'My Study →'), onStudy, 'reference-text-button'),
        button('reference-mock', tx('模試 →', 'Mock papers →'), onMock, 'reference-text-button'),
      );
      nav.append(others);
      return nav;
    }

    function levelCard(collection, index, taken) {
      const card = button(`reference-collection-${index}`, null, () => openCollection(collection, card), 'reference-level');
      card.dataset.referenceCollection = collection.id;
      card.dataset.count = String(collection.count);
      if (collection.level === 'unknown') card.classList.add('reference-level-unknown');
      const name = collection.level === 'unknown' ? tx('級未設定', 'Unassigned') : collection.level;
      const heading = node('span', 'reference-level-name', name);
      const count = node('span', 'reference-level-count', number(collection.count));
      count.append(node('span', 'reference-count-unit', collection.kind === 'kanji' ? tx('件', 'entries') : tx('語', 'words')));
      const saved = inStudy(collection, taken);
      card.dataset.studyCount = String(saved);
      card.append(
        heading,
        count,
        node('span', 'reference-level-study', tx(`My Study に登録 ${number(saved)}`, `${number(saved)} in My Study`)),
        node('span', 'reference-level-arrow', '↗'),
      );
      card.setAttribute('aria-label', `${collectionName(collection)}; ${number(collection.count)} ${tx('件', 'entries')}; ${number(saved)} ${tx('My Study に登録', 'in My Study')}`);
      return card;
    }

    function overview(root) {
      const head = node('header', 'reference-heading');
      head.append(node('p', 'reference-eyebrow', tx('参考書庫', '参考書庫 / REFERENCE')));
      const title = node('h1', 'reference-title', tx('JLPT と 漢検の参考書庫', 'Reference library'));
      title.id = 'reference-title';
      title.tabIndex = -1;
      head.append(title, node('p', 'reference-intro', tx(
        '級から引く、読む、確かめる。収録された語彙と漢字の全件を、手元で。',
        'Look up a level. Read every entry. All bundled vocabulary and kanji, here on your shelf.',
      )));
      root.append(head);
      const taken = studySet();
      const jlpt = node('section', 'reference-family');
      jlpt.setAttribute('aria-labelledby', 'reference-jlpt-heading');
      const jlptHead = node('div', 'reference-family-heading');
      const heading = node('h2', null, 'JLPT');
      heading.id = 'reference-jlpt-heading';
      jlptHead.append(heading, node('span', 'reference-family-note', tx('N5 → N1 · 資料の級タグ', 'N5 → N1 · corpus level tags')));
      jlpt.append(jlptHead);
      const tabs = node('div', 'reference-tabs');
      tabs.setAttribute('role', 'group');
      tabs.setAttribute('aria-label', tx('JLPT の資料', 'JLPT collection type'));
      for (const [kind, id, label] of [
        ['word', 'vocabulary', tx('語彙', 'Vocabulary')],
        ['kanji', 'kanji', tx('漢字', 'Kanji')],
      ]) {
        const tab = button(`reference-tab-${id}`, label, () => {
          state.jlptKind = kind;
          onChange();
          focus(`reference-tab-${id}`);
        }, 'reference-tab');
        tab.setAttribute('aria-pressed', String(state.jlptKind === kind));
        tabs.append(tab);
      }
      jlpt.append(tabs);
      const grid = node('div', 'reference-level-grid reference-jlpt-grid');
      collections.forEach((collection, index) => {
        if (collection.family === (state.jlptKind === 'kanji' ? 'jlpt-kanji' : 'jlpt')) {
          grid.append(levelCard(collection, index, taken));
        }
      });
      jlpt.append(grid);
      jlpt.append(node('p', 'reference-footnote', tx(
        '公式の出題一覧ではなく、収録資料の級タグです。',
        'Source-assigned levels, not an official exam syllabus.',
      )));
      root.append(jlpt);

      const kanken = node('section', 'reference-family');
      kanken.setAttribute('aria-labelledby', 'reference-kanken-heading');
      const kankenHead = node('div', 'reference-family-heading');
      const kankenTitle = node('h2', null, tx('漢検', 'Kanji Kentei'));
      kankenTitle.id = 'reference-kanken-heading';
      kankenHead.append(kankenTitle, node('span', 'reference-family-note', tx('各級に配当された字', 'Assigned to each grade')));
      kanken.append(kankenHead, node('p', 'reference-footnote', tx(
        `級タグ付き ${number(catalog.stats.families.kanken.uniqueLabelled)} 件。異体字・字形未収録も含む資料上の区分です。公式範囲すべての保証ではありません。`,
        `${number(catalog.stats.families.kanken.uniqueLabelled)} source-tagged records, including variant forms and missing-glyph records. Not a claim of complete official coverage.`,
      )));
      const grades = node('div', 'reference-level-grid reference-kanken-grid');
      collections.forEach((collection, index) => {
        if (collection.family === 'kanken') grades.append(levelCard(collection, index, taken));
      });
      kanken.append(grades);
      root.append(kanken, provenance(), node('p', 'reference-quiet-note', tx(
        '閲覧だけで登録されることはありません。覚える項目は、各項目のページで選びます。',
        'A reference shelf, not an assignment. Choose what to memorize from an entry’s own page.',
      )));
    }

    function queryCollection(collection) {
      const core = global.BunkiReferenceCore;
      let ordered = collection;
      if (state.sort === 'headword') {
        if (!headwordOrder.has(collection.id)) {
          headwordOrder.set(collection.id, {
            ...collection,
            entries: [...collection.entries].sort((a, b) =>
              a.text < b.text ? -1 : a.text > b.text ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
          });
        }
        ordered = headwordOrder.get(collection.id);
      }
      const result = core.search(ordered, state.query, {
        page: state.page,
        pageSize: PAGE_SIZE,
      });
      return { ...result, totalPages: Math.max(1, result.pageCount) };
    }

    function refreshResults({ moveFocus = false } = {}) {
      const collection = current();
      const old = document.getElementById('reference-results');
      if (!collection || !old) return;
      old.replaceWith(results(collection));
      const clear = document.getElementById('reference-search-clear');
      if (clear) clear.disabled = !state.query;
      if (moveFocus) {
        document.getElementById('reference-results-count')?.scrollIntoView({ block: 'start' });
        focus('reference-results-count');
      }
    }

    function changePage(page) {
      state.page = page;
      refreshResults({ moveFocus: true });
      state.scroll = window.scrollY;
    }

    function clearSearch() {
      state.query = '';
      state.page = 1;
      const input = document.getElementById('reference-search');
      if (input) input.value = '';
      refreshResults();
      focus('reference-search');
    }

    function pager(result, bottom = false) {
      const nav = node('nav', 'reference-pagination');
      nav.setAttribute('aria-label', bottom ? tx('下部のページ移動', 'Bottom pagination') : tx('ページ移動', 'Pagination'));
      const prefix = bottom ? 'reference-bottom' : 'reference-page';
      const controls = node('div', 'reference-page-controls');
      for (const [id, label, page, disabled] of [
        ['first', tx('最初', 'First'), 1, result.page <= 1],
        ['prev', tx('← 前', '← Previous'), result.page - 1, result.page <= 1],
        ['next', tx('次 →', 'Next →'), result.page + 1, result.page >= result.totalPages],
        ['last', tx('最後', 'Last'), result.totalPages, result.page >= result.totalPages],
      ]) {
        const control = button(`${prefix}-${id}`, label, () => changePage(page));
        control.disabled = !result.total || disabled;
        controls.append(control);
      }
      nav.append(controls);
      if (bottom) {
        nav.append(node('span', 'reference-page-label', tx(
          `${number(result.page)} / ${number(result.totalPages)} ページ`,
          `Page ${number(result.page)} of ${number(result.totalPages)}`,
        )));
      } else {
        const form = node('form', 'reference-jump');
        const label = node('label', null, tx('ページ', 'Page'));
        label.htmlFor = 'reference-page-jump';
        const input = node('input');
        input.id = 'reference-page-jump';
        input.type = 'number';
        input.inputMode = 'numeric';
        input.min = '1';
        input.max = String(result.totalPages);
        input.step = '1';
        input.value = String(result.page);
        input.disabled = !result.total;
        input.required = true;
        const go = button('reference-page-go', tx('移動', 'Go'), () => {});
        go.type = 'submit';
        go.disabled = !result.total;
        form.append(label, input, node('span', null, `/ ${number(result.totalPages)}`), go);
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          if (!form.reportValidity()) return;
          changePage(Number(input.value));
        });
        nav.append(form);
      }
      return nav;
    }

    function results(collection) {
      const result = queryCollection(collection);
      state.page = result.page;
      const wrap = node('div');
      wrap.id = 'reference-results';
      const count = node('p', 'reference-results-count', result.total
        ? tx(
          `${number(result.start)}–${number(result.end)} / ${number(result.total)} 件${state.query ? `（全 ${number(collection.count)} 件から検索）` : ''}`,
          `${number(result.start)}–${number(result.end)} of ${number(result.total)}${state.query ? ` matches · ${number(collection.count)} in this collection` : ''}`,
        )
        : tx(`0 件 / 全 ${number(collection.count)} 件`, `0 matches · ${number(collection.count)} entries in this collection`));
      count.id = 'reference-results-count';
      count.tabIndex = -1;
      count.setAttribute('role', 'status');
      count.setAttribute('aria-live', 'polite');
      count.dataset.total = String(result.total);
      count.dataset.page = String(result.page);
      count.dataset.totalPages = String(result.totalPages);
      const resultHead = node('div', 'reference-results-header');
      const sortGroup = node('div', 'reference-sort-group');
      const sortLabel = node('label', 'reference-field-label', tx('順序', 'Sort'));
      sortLabel.htmlFor = 'reference-sort';
      const sort = node('select');
      sort.id = 'reference-sort';
      for (const [value, label] of [['reading', tx('読み', 'Reading')], ['headword', tx('見出し', 'Headword')]]) {
        const option = node('option', null, label);
        option.value = value;
        sort.append(option);
      }
      sort.value = state.sort;
      sort.addEventListener('change', () => {
        state.sort = sort.value;
        state.page = 1;
        refreshResults();
        focus('reference-sort');
      });
      sortGroup.append(sortLabel, sort);
      resultHead.append(count, sortGroup);
      wrap.append(resultHead, pager(result));
      const list = node('div', 'reference-list');
      list.id = 'reference-list';
      list.setAttribute('role', 'list');
      list.setAttribute('aria-label', collectionName(collection));
      const taken = studySet();
      result.entries.forEach((entry, index) => {
        const type = entryType(entry, collection);
        const item = node('div', 'reference-list-item');
        item.setAttribute('role', 'listitem');
        const row = button(`reference-entry-${encodeURIComponent(collection.id)}-${encodeURIComponent(entry.key ?? entry.id)}`, null, () => {
          state.scroll = window.scrollY;
          onOpen({ ...entry, type }, row);
        }, 'reference-entry');
        row.dataset.entryId = entry.id;
        row.dataset.referenceKey = entry.key ?? entry.id;
        row.dataset.entryType = type;
        row.append(node('span', 'reference-entry-number', number(result.start + index)));
        const content = node('span', 'reference-entry-content');
        content.append(
          node('span', 'reference-entry-headword', entry.missingGlyph ? tx(`字形未収録 (${entry.id})`, `Glyph not supplied (${entry.id})`) : entry.text || entry.id),
          node('span', 'reference-entry-reading', entry.readings?.length ? entry.readings.join('・') : entry.reading || tx('読み未収録', 'Reading not supplied')),
          node('span', 'reference-entry-meaning', entry.meanings?.length
            ? entry.meanings.join('; ')
            : tx('意味未収録', 'Meaning not supplied')),
        );
        if (entry.conflicts?.[collection.family] || (entry.conflict && !entry.conflicts)) {
          content.append(node('span', 'reference-entry-source', `${tx('級タグに相違', 'Level tags differ')} · ${(entry.levelSources || []).filter((source) => !source.family || source.family === collection.family).map((source) => `${source.source}: ${source.level}`).join(' · ')}`));
        }
        if (isInStudy(entry, taken)) {
          content.append(node('span', 'reference-entry-saved', tx('My Study に登録', 'In My Study')));
        }
        const arrow = node('span', 'reference-entry-arrow', '›');
        arrow.setAttribute('aria-hidden', 'true');
        row.append(content, arrow);
        item.append(row);
        list.append(item);
      });
      if (!result.total) {
        const empty = node('div', 'reference-empty');
        empty.append(
          node('h2', null, state.query ? tx('一致する項目がありません', 'No matching entries') : tx('この区分に収録はありません', 'No bundled entries in this bin')),
          node('p', null, state.query ? tx(
            'この区分の全件を検索しました。字・かな・英語の意味で、別の語をお試しください。',
            'Searched the entire collection. Try another headword, kana reading, or English meaning.',
          ) : tx('資料の区分は残していますが、項目を推測で補うことはしません。', 'The source bin is preserved; missing records are not invented.')),
        );
        if (state.query) {
          empty.append(button('reference-empty-clear', tx('検索をクリア', 'Clear search'), clearSearch));
          empty.append(button('reference-empty-global-search', tx('辞書全体で検索 →', 'Search the whole dictionary →'), () => onSearch(state.query)));
        }
        list.append(empty);
      }
      wrap.append(list);
      if (result.entries.length) wrap.append(pager(result, true));
      return wrap;
    }

    function collectionView(root, collection) {
      const head = node('header', 'reference-heading');
      const title = node('h1', 'reference-title', collectionName(collection));
      title.id = 'reference-title';
      title.tabIndex = -1;
      const saved = inStudy(collection, studySet());
      head.append(title, node('p', 'reference-collection-meta', tx(
        `${number(collection.count)} 件収録 · My Study に登録 ${number(saved)}`,
        `${number(collection.count)} entries · ${number(saved)} in My Study`,
      )));
      head.append(node('p', 'reference-footnote', collection.family === 'kanken'
        ? tx('資料による級配当。公式の累計範囲とは異なります。', 'Source-assigned records, not cumulative exam scope.')
        : tx('資料の級タグ。公式の出題一覧ではありません。', 'Corpus tags, not an official exam syllabus.')));
      root.append(head, provenance());
      const toolbar = node('div', 'reference-toolbar');
      const searchGroup = node('div', 'reference-search-group');
      const searchLabel = node('label', 'reference-field-label', tx('この区分の全件を検索', 'Search this entire collection'));
      searchLabel.htmlFor = 'reference-search';
      const searchLine = node('div', 'reference-search-line');
      const search = node('input');
      search.id = 'reference-search';
      search.type = 'search';
      search.placeholder = tx('字・かな・英語の意味', 'Headword, kana, or English meaning');
      search.autocomplete = 'off';
      search.spellcheck = false;
      search.value = state.query;
      search.setAttribute('aria-controls', 'reference-results');
      search.addEventListener('input', (event) => {
        state.query = search.value;
        state.page = 1;
        if (!event.isComposing) refreshResults();
      });
      search.addEventListener('compositionend', () => {
        state.query = search.value;
        state.page = 1;
        refreshResults();
      });
      const clear = button('reference-search-clear', tx('クリア', 'Clear'), clearSearch);
      clear.disabled = !state.query;
      searchLine.append(search, clear);
      searchGroup.append(searchLabel, searchLine);
      toolbar.append(searchGroup);
      root.append(toolbar, results(collection), node('p', 'reference-search-hint', tx(
        '100 件ずつ表示。詳しい語釈は各項目へ。「覚える」は学習用データがある項目で使えます。',
        '100 entries per page. Open an entry for details; Memorize is available where study data is bundled.',
      )));
    }

    return {
      state,
      back,
      entry: (type, key) => {
        const exact = entriesByKey.get(`${type}:${key}`);
        if (exact) return exact;
        const matches = entriesByPrinted.get(`${type}:${key}`);
        return matches?.size === 1 ? matches.values().next().value : null;
      },
      locationName: () => current() ? collectionName(current()) : tx('参考書庫', 'Reference library'),
      open(id) {
        const collection = collections.find((item) => item.id === id);
        if (!collection) return false;
        state.collectionId = id;
        state.query = '';
        state.page = 1;
        state.scroll = 0;
        onChange();
        window.scrollTo(0, 0);
        focus('reference-title');
        return true;
      },
      reset() {
        state.collectionId = null;
        state.query = '';
        state.page = 1;
        state.scroll = 0;
        state.overviewScroll = 0;
        state.overviewFocus = null;
      },
      keepScroll() {
        state.scroll = window.scrollY;
      },
      returnScroll() {
        window.scrollTo(0, state.scroll);
      },
      render(main) {
        const root = node('div', 'reference-library');
        root.id = 'reference-library';
        root.dataset.view = current() ? 'collection' : 'overview';
        root.append(navigation());
        if (current()) collectionView(root, current());
        else overview(root);
        main.append(root);
      },
    };
  }

  global.BunkiReferenceUI = Object.freeze({ create });
})(window);
