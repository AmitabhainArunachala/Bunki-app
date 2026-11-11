/** G3 library seam — declarations moved verbatim from ../corridor.js (pure move, no body edits). */
import { D, MONTHS_EN, READER_KANA, READER_KANJI, S, bi, biLabel, controlsUnder, el, ensureArchiveIndex, ensureArticle, ensureReadingPositionModule, finiteNumber, frameFoot, glyphBox, go, kankenGradeLabel, kataToHira, layersMarkTop, openReferenceCollection, owns, passage, readHelpReadable, readerReadingFits, readerSummaryFor, render, renderReferenceConnections, renderTextSourceContextSelection, resolveReaderChoice, tx, updateReadingPlaces, withEn } from '../corridor.js';
import { readerCaptureReason } from './capture.mjs';
import { dictionaryAnsweredForm, dictionaryHomographChoices, dictionaryQueryToken, dictionaryRowsForForm, readerGlossMissText, readingAsksIndex, readingToken, tokenReading } from './dictionary.mjs';
import { dayAge, dayKey } from './drift.mjs';
import { markStripMore, note } from './word-entry.mjs';
import { classicalRadicalHits, joyoOnNote, kanjiFactsState, kanjiFactsStatus, kanjiReference, kanjiReferenceView, renderKanjiClassifications, storyLevel } from './worlds.mjs';

function levelPhrase(grading) {
  const band = grading.signals.jreadability.band || '';
  const levelMap = {
    初級前半: 'Beginner',
    初級後半: 'Upper beginner',
    中級前半: 'Intermediate',
    中級後半: 'Upper intermediate',
    上級前半: 'Advanced',
    上級後半: 'Upper advanced',
  };
  const level = levelMap[band] || 'Ungraded';
  // vocabulary-load phrasing prefers the NINJAL pair where it was measured;
  // otherwise the live JLPT-lexicon coverage (substrate named in the hint)
  const ninjal = grading.signals.lexical_coverage?.coverage;
  const jlpt = grading.signals.jlpt_lexicon?.coverage;
  const cov = ninjal ?? jlpt;
  let vocabNote = '';
  let vocabNoteJa = '';
  if (cov != null && cov < 1) {
    // the number is THIS card's measured coverage, never a floor or an
    // average (the #42 law). Below one-in-two the ratio phrasing stops
    // being true — say plainly that most words fall outside instead.
    const oneIn = Math.round(1 / (1 - cov));
    const outside = ninjal != null ? 'the everyday core vocabulary' : 'the JLPT word lists';
    const outsideJa = ninjal != null ? '基本語彙の外' : 'JLPT語彙の外';
    if (oneIn < 2) {
      vocabNote = ` · most words are outside ${outside}`;
      vocabNoteJa = `・大半が${outsideJa}`;
    } else {
      vocabNote = ` · about 1 word in ${oneIn} is outside ${outside}`;
      vocabNoteJa = `・約${oneIn}語に1語が${outsideJa}`;
    }
  }
  return { level, ja: band, note: vocabNote, noteJa: vocabNoteJa };
}

function libraryVisibilityPolicy(raw) {
  if (raw == null) return null;
  const ids = value => Array.isArray(value) && value.every(id => typeof id === 'string' && id.length > 0) && new Set(value).size === value.length;
  if (raw.schema !== 1 || raw.kind !== 'bunki-library-visibility' || raw.id !== 'library-20261003-apply-cuts' ||
      typeof raw.active !== 'boolean' || !['hideIds', 'alreadyAbsentIds', 'keepIds', 'laterIds'].every(key => ids(raw[key]))) {
    throw new Error('Invalid library visibility policy');
  }
  if (raw.hideIds.some(id => raw.keepIds.includes(id) || raw.laterIds.includes(id) || raw.alreadyAbsentIds.includes(id))) {
    throw new Error('Library visibility dispositions overlap');
  }
  if (!raw.active) return null;
  const approval = raw.activationDecision;
  if (!approval || approval.authority !== 'John' || approval.synthetic !== false ||
      approval.policyId !== raw.id || !/^[0-9a-f]{64}$/.test(approval.evidenceSha256 || '') ||
      !/^[0-9a-f]{40}$/.test(approval.sourceParent || '') || !ids(approval.selectedIds) ||
      !Array.isArray(approval.hideIds) || JSON.stringify(approval.hideIds) !== JSON.stringify(raw.hideIds) ||
      !approval.textHashes || Object.keys(approval.textHashes).length !== approval.selectedIds.length ||
      approval.selectedIds.some(id => !/^[0-9a-f]{64}$/.test(approval.textHashes[id] || ''))) {
    throw new Error('Library activation decision missing or inconsistent');
  }
  return Object.freeze({ active: true, hiddenIds: Object.freeze([...raw.hideIds]) });
}

function libraryDiscoverable(row, policy) {
  return !policy?.active || !policy.hiddenIds.includes(row?.id);
}

function shelfStories(curated) {
  const standing = new Set(curated.map((p) => p.id));
  return curated.filter((p) => !(p.adaptation?.basedOn && standing.has(p.adaptation.basedOn)));
}

function shelfTallyText(list) {
  const glossary = list.filter((p) => p.source === 'isa-yasashii-glossary').length;
  if (!glossary) return tx(`読み物 ${list.length} 本`, `${list.length} articles`);
  return tx(`読み物 ${list.length} 本（うち用語集 ${glossary}）`, `${list.length} articles, ${glossary} of them short word definitions`);
}

function shelfDateline(day) {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return tx(`${y}年${m}月${d}日（${'日月火水木金土'[weekday]}）`,
    `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday]} ${d} ${MONTHS_EN[m - 1]} ${y}`);
}

function shelfCurrentDay() {
  let override = null;
  try { override = localStorage.getItem('kairo-shelf-day'); } catch { /* existing verifier seam */ }
  return /^\d{4}-\d{2}-\d{2}$/.test(override || '') && Number.isFinite(Date.parse(`${override}T00:00:00Z`))
    ? override : dayKey();
}

function shelfDailyOrder(stories, day) {
  const recent = stories.filter(p => p.source !== 'isa-yasashii-glossary').slice(0, 12);
  if (!recent.length) return stories;
  const ordinal = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
  const offset = ((ordinal * 3) % recent.length + recent.length) % recent.length;
  const leading = Array.from({ length: Math.min(3, recent.length) }, (_, i) => recent[(offset + i) % recent.length]);
  const heads = new Set(leading.map(p => p.id));
  return [...leading, ...stories.filter(p => !heads.has(p.id))];
}

function feedDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return tx('日付不明', 'date unavailable');
  return new Intl.DateTimeFormat(bi() ? 'en-GB' : 'ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo', timeZoneName: 'short',
  }).format(new Date(value));
}

function publisherLink(label, url, className = '') {
  const link = el('a', className, label);
  link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}

function shelfDateLabel(day) {
  const [y, m, d] = day.split('-').map(Number);
  const age = dayAge(day);
  const when =
    age === 0 ? tx('今日', 'today') : age === 1 ? tx('昨日', 'yesterday') : age > 1 && age < 7 ? tx(`${age}日前`, `${age} days ago`) : '';
  const base = bi() ? `${d} ${MONTHS_EN[m - 1]} ${y}` : `${y}年${m}月${d}日`;
  return when ? `${base} · ${when}` : base;
}

function levelChip(p, extra = '') {
  const jlpt = p.readingFacets?.jlpt;
  const { level, authored, step } = storyLevel(p);
  const lv = levelPhrase(p.grading);
  const chip = el('span', `level-chip${extra ? ` ${extra}` : ''}`, level || (bi() ? lv.level : lv.ja));
  if (level) chip.dataset.level = step;
  chip.title = authored
    ? tx(`レベル ${authored} · 文の難しさ ${lv.ja}`, `Level ${authored} · sentences ${lv.level}`)
    : jlpt
      ? tx(`JLPT ${jlpt} 程度の語彙（目安）· 文の難しさ ${lv.ja}`, `JLPT ${jlpt} vocabulary (estimate) · sentences ${lv.level}`)
      : tx(`文の難しさ ${lv.ja}`, `sentences ${lv.level}`);
  return chip;
}

function placeSealStrip(open) {
  const { strip, anchor } = open;
  const fixedEdge = (selector, edge) => {
    const node = document.querySelector(selector);
    if (!node || !['fixed', 'sticky'].includes(getComputedStyle(node).position)) return null;
    const box = node.getBoundingClientRect();
    return box.height ? box[edge] : null;
  };
  // the glass is the visual viewport (a zoomed-out or keyboard-shortened page shows less than its layout viewport)
  const vv = window.visualViewport;
  const glassTop = vv ? vv.offsetTop : 0, glassBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const glassLeft = vv ? vv.offsetLeft : 0, glassRight = vv ? vv.offsetLeft + vv.width : window.innerWidth;
  const onPage = !!anchor.closest('#sheet');
  const scroller = onPage ? anchor.closest('#sheet') : null;
  const ceiling = Math.max(glassTop + 8, frameFoot(onPage, fixedEdge) ?? 0);
  const view = vv?.height || window.innerHeight;
  // SAVE · a strip that holds the chooser, or a place's words (Show), may take more of the glass than a strip that names
  // the place
  const share = ['choose', 'move'].includes(strip.dataset.mode) || strip.querySelector('#save-place-panel') ? 0.56 : 0.4;
  strip.style.maxHeight = `${Math.max(96, Math.floor(view * share))}px`;
  // Hfix-1A · measured without its own "more" fade: in Chromium the fade's sticky foot adds 4 px of overflow, so a strip
  // seated again while it showed measured as not fitting, was cut a row short, and kept its fade (markStripMore sets it
  // again once seated)
  delete strip.dataset.more;
  strip.style.left = '0px';
  strip.style.top = '0px';
  // as wide as the glass allows (a page wider than the phone's screen still shows the strip whole)
  strip.style.maxWidth = `${Math.floor(glassRight - glassLeft - 16)}px`;
  const w = strip.offsetWidth;
  const leftOf = (word) => Math.max(glassLeft + 8, Math.min(glassRight - w - 8, word.left + word.width / 2 - w / 2));
  let word = glyphBox(anchor) || anchor.getBoundingClientRect();
  let left = leftOf(word);
  const floorAt = (x) => Math.min(glassBottom, fixedEdge('.listen-row', 'top') ?? glassBottom, fixedEdge('#primary-tabs', 'top') ?? glassBottom,
    fixedEdge('.kp-grades', 'top') ?? glassBottom, layersMarkTop(x, w) ?? glassBottom) - 8;
  let floor = floorAt(left);
  const cap = Math.max(96, Math.floor(Math.min(view * share, floor - ceiling)));
  strip.style.maxHeight = `${cap}px`;
  const h = Math.min(strip.offsetHeight, cap);
  const rect = (top, tall) => ({ left, right: left + w, top, bottom: top + tall });
  const free = (s) => !controlsUnder(rect(s.top, s.tall), strip, anchor).length;
  const seatsNow = () => {
    const below = word.top + word.height + 10, above = word.top - 10, seats = [];
    if (below + h <= floor) seats.push({ top: below, tall: h, side: 'below' });
    if (above - h >= ceiling) seats.push({ top: above - h, tall: h, side: 'above' });
    return seats.find(free) || null;
  };
  // the reading moves only as far as the strip needs to stand wholly on the glass, and never so far the word leaves it
  const scrollRoom = () => (scroller
    ? { up: scroller.scrollTop, down: scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop }
    : { up: window.scrollY, down: document.documentElement.scrollHeight - window.innerHeight - window.scrollY });
  const scrollBy = (dy) => {
    if (scroller) scroller.scrollTop += dy;
    else window.scrollTo({ top: window.scrollY + dy, behavior: 'instant' });
  };
  const remeasure = () => { word = glyphBox(anchor) || anchor.getBoundingClientRect(); left = leftOf(word); floor = floorAt(left); };
  let seat = seatsNow();
  if (!seat) {
    const room = scrollRoom();
    const moves = [];
    const downBy = Math.ceil(word.top + word.height + 10 + h - floor);
    if (downBy > 0 && downBy <= room.down && word.top - downBy >= ceiling) moves.push(downBy);
    const upBy = Math.ceil(ceiling - (word.top - 10 - h));
    if (upBy > 0 && upBy <= room.up && word.top + word.height + upBy <= floor) moves.push(-upBy);
    for (const dy of moves.sort((a, b) => Math.abs(a) - Math.abs(b))) {
      scrollBy(dy);
      remeasure();
      seat = seatsNow();
      if (seat) break;
      scrollBy(-dy);
      remeasure();
    }
  }
  if (!seat) {
    // shortened to the room before the nearest control on either side, two rows at least
    const below = word.top + word.height + 10, above = word.top - 10;
    const room = (top, tall, side) => {
      const hits = controlsUnder(rect(top, tall), strip, anchor);
      if (side === 'below') {
        const edge = Math.min(floor, ...hits.map((box) => box.top)) - 6;
        return { top, tall: Math.min(tall, edge - top), side };
      }
      const edge = Math.max(ceiling, ...hits.map((box) => box.bottom)) + 6;
      return { top: Math.max(edge, top + tall - (above - edge)), tall: Math.min(tall, above - edge), side };
    };
    const tries = [room(below, Math.max(0, Math.min(h, floor - below)), 'below'), room(Math.max(ceiling, above - h), Math.min(h, above - ceiling), 'above')]
      .filter((s) => s.tall >= 104 && free(s))
      .sort((a, b) => b.tall - a.tall);
    seat = tries[0] || null;
  }
  const origin = scroller ? scroller.getBoundingClientRect() : { left: -window.scrollX, top: -window.scrollY };
  const scrollTop = scroller ? scroller.scrollTop : 0, scrollLeft = scroller ? scroller.scrollLeft : 0;
  if (seat) {
    open.room?.remove();
    open.room = null;
    // a strip shortened to its room ends between two rows, never across a control; what is below it scrolls inside it
    const tall = Math.floor(seat.tall);
    let fit = tall;
    if (strip.scrollHeight > tall) {
      const bottoms = [...strip.querySelectorAll('button, input, .seal-strip-status')]
        .filter((node) => node.getClientRects().length && !node.closest('[hidden]')).map((node) => node.offsetTop + node.offsetHeight);
      const rows = bottoms.filter((bottom) => bottom + 6 <= tall);
      if (rows.length) fit = Math.max(...rows) + 6;
    }
    strip.style.maxHeight = `${fit}px`;
    strip.dataset.side = seat.side;
    if (seat.side === 'above') seat.top += tall - fit;
    strip.style.left = `${Math.round(left - origin.left + scrollLeft)}px`;
    strip.style.top = `${Math.round(seat.top - origin.top + scrollTop)}px`;
    markStripMore(strip);
    return seat;
  }
  // a room of its own under the word's paragraph: nothing is laid over a control; then the reading moves the least that
  // brings the whole strip onto the glass
  // Hfix-2e · a word in the word web's plate (its nodes stand at absolute places) takes its room under the whole plate,
  // never at the top of its layer over the plate's other nodes
  const block = anchor.closest('p, li, dd, blockquote, [data-reader-prose], [data-lookup-block], .example-ja, .sent-reader, .ww-plate') || anchor.parentElement;
  if (!open.room) {
    open.room = el('div', 'seal-strip-room');
    open.room.setAttribute('aria-hidden', 'true');
    block.after(open.room);
  }
  const tall = Math.floor(Math.min(h, cap, floor - ceiling));
  open.room.style.height = `${Math.ceil(tall) + 12}px`;
  let box = open.room.getBoundingClientRect();
  const past = box.top + 6 + tall - floor, before = ceiling - (box.top + 6);
  if (past > 0) scrollBy(Math.min(past, scrollRoom().down));
  else if (before > 0) scrollBy(-Math.min(before, scrollRoom().up));
  remeasure();
  box = open.room.getBoundingClientRect();
  const placed = scroller ? scroller.getBoundingClientRect() : { left: -window.scrollX, top: -window.scrollY };
  const placedTop = scroller ? scroller.scrollTop : 0, placedLeft = scroller ? scroller.scrollLeft : 0;
  strip.dataset.side = 'room';
  strip.style.maxHeight = `${tall}px`;
  strip.style.left = `${Math.round(left - placed.left + placedLeft)}px`;
  strip.style.top = `${Math.round(box.top + 6 - placed.top + placedTop)}px`;
  markStripMore(strip);
  return { top: box.top + 6, tall, side: 'room' };
}

function readerReadingMissText(form = '') {
  if (dictionaryAnsweredForm(form) && dictionaryRowsForForm(form).length) return tx('この読みの辞書項目はありません。', 'No dictionary entry for this reading.');
  return readerGlossMissText(form);
}

async function resolveReadingPlace(anchor) {
  if (!anchor.source.sourceId.startsWith('bundled-reading:')) return null;
  const id = anchor.source.sourceId.slice('bundled-reading:'.length);
  let p = D.passages.find((entry) => entry.id === id);
  if (!p && !D.archive && window.__CORRIDOR_STANDALONE__ !== true) {
    await ensureArchiveIndex();
    p = D.passages.find((entry) => entry.id === id);
  }
  if (!p) return null;
  if (!p.tokens) await ensureArticle(p);
  const module = await ensureReadingPositionModule();
  const resolved = await module.resolveBundledReadingAnchor(p, anchor);
  return resolved ? { p, ...resolved } : null;
}

function refreshReadingPlacesSurface() {
  const container = document.getElementById('record-reading-places');
  if (container?.isConnected) updateReadingPlaces(container);
}

function renderPublisherContextSelection(main, saved, body) {
  renderTextSourceContextSelection(main, saved, body, false);
}

function openReferenceEntry(entry, invoker) {
  const target = entry.canonicalTarget;
  const origin = S.stack.at(-1)?.from;
  go({ t: target ? target.type : 'reference', id: target ? target.id : entry.key,
    ...(target?.reading ? { reading: target.reading } : {}), ...(origin ? { from: origin } : {}),
    referenceEntry: entry }, { invoker });
}

function renderReferenceMetadata(container, entry) {
  if (entry.type === 'word' && entry.variants?.length) {
    for (const variant of entry.variants) {
      const text = [variant.reading, variant.meanings?.join('; ')].filter(Boolean).join(' — ');
      container.append(el('p', 'reference-source-sense', text));
      container.append(el('p', 'sense-pos', [variant.source, variant.sourceId, variant.level].filter(Boolean).join(' · ')));
    }
  }
  const grouped = new Map();
  const labels = { on: '音読み', kun: '訓読み', meanings: tx('意味', 'meanings'), completeMeanings: tx('辞書の全語義', 'complete dictionary meanings'),
    radicalSchemes: tx('辞書の部首分類', 'dictionary radical classifications'), strokeCount: tx('画数', 'stroke count'),
    readings: tx('すべての読み', 'every reading'), officialReadings: tx('常用漢字表の読み', 'Jōyō table readings') };
  for (const [field, credit] of Object.entries(entry.metadataSources || {})) {
    if (credit.source === 'kanji' || credit.source === 'kmeta') continue;
    const source = `${credit.source} · ${credit.sourceId}`;
    if (!grouped.has(source)) grouped.set(source, []);
    grouped.get(source).push(labels[field] || field);
  }
  for (const [source, fields] of grouped) container.append(el('p', 'sense-pos', `${fields.join('・')} · ${source}`));
}

function referenceCollectionChip(label, collectionId) {
  const translated = collectionId.startsWith('kanken:') ? `Kanji Kentei ${kankenGradeLabel(collectionId.slice(7))}` : label;
  const shown = tx(label, translated);
  const chip = el('button', 'pool-tag cat-chip', shown);
  chip.type = 'button';
  chip.dataset.referenceDoor = collectionId;
  chip.setAttribute('aria-label', tx(`${label} の参考書庫をひらく`, `open ${shown} in the reference library`));
  chip.addEventListener('click', () => openReferenceCollection(collectionId, chip));
  return chip;
}

function renderReferenceNode(sheet, node) {
  const entry = node.referenceEntry;
  sheet.append(withEn(el('p', 'eyebrow', '収録資料の項目'), 'reference-only source record', 'en-inline'));
  sheet.append(el('h2', 'headword', entry.missingGlyph
    ? tx(`字形未収録 (${entry.id})`, `Glyph not supplied (${entry.id})`)
    : entry.text || entry.id));
  const displayReadings = entry.displayReadings || entry.readings;
  sheet.append(el('p', 'reading', displayReadings?.length
    ? displayReadings.join('・')
    : entry.reading || tx('読みなし', 'No reading')));
  const meanings = entry.type === 'kanji' ? entry.completeMeanings || entry.meanings : entry.meanings;
  sheet.append(el('p', 'gloss', meanings?.length
    ? meanings.join('; ')
    : tx('意味未収録', 'Meaning not supplied')));
  if (entry.type === 'kanji') {
    const readings = el('dl', 'kv');
    readings.append(el('dt', null, '音読み'), el('dd', null, (entry.displayOn || entry.on)?.join('・') || tx('未収録', 'Not supplied')), el('dt', null, '訓読み'), el('dd', null, (entry.displayKun || entry.kun)?.join('・') || tx('未収録', 'Not supplied')));
    sheet.append(readings);
    const tableStatus = joyoOnNote(entry.id, entry.displayOn || entry.on);
    if (tableStatus) sheet.append(tableStatus);
    if (entry.strokeCount != null) sheet.append(el('p', 'sense-pos', tx(`${entry.strokeCount} 画`, `${entry.strokeCount} strokes`)));
    renderKanjiClassifications(sheet, entry.id, node);
  }
  renderReferenceMetadata(sheet, entry);
  renderReferenceConnections(sheet, entry);
  sheet.append(el('p', 'sense-pos', (entry.levelSources || []).map((source) => `${source.source}: ${/級/u.test(source.level) ? tx(source.level, kankenGradeLabel(source.level)) : source.level}`).join(' · ')));
  for (const source of entry.sourceRecords || []) {
    const info = el('p', 'sense-pos', `${source.sourceId} · ${source.form || ''} · ${source.level || ''}`);
    // Consult the source only on an explicit link. No glyph images or
    // dictionaries are fetched in the reference browsing path.
    if (source.url && /^https:\/\//.test(source.url)) {
      const link = el('a', null, tx(' 出典の項目を開く', ' Open source record'));
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      info.append(link);
    }
    sheet.append(info);
  }
  sheet.append(el('p', 'note', tx(
    'この項目は参考資料にはありますが、学習用の項目データは未収録です。My Study への登録はまだできません。読み・意味などの未収録情報は推測で補っていません。',
    'This source record is available for reference, but its study-entry data is not bundled. It cannot yet be added to My Study. Missing readings or meanings have not been guessed.',
  )));
}

function shelfBodyToken() {
  return `${S.query?.trim() || ''}\u0000${dictionaryQueryToken(S.query)}\u0000${JSON.stringify(S.shelfFilters || null)}\u0000${shelfCurrentDay()}`;
}

function searchRowShownByCore(e, core) {
  if (!core || !e?.seq || core.w !== e.w || core.r !== e.r || core.g !== e.g) return false;
  return dictionaryHomographChoices(core.id).some(
    (choice) => choice.enabledOnCore && String(choice.row[0]) === String(e.seq) && choice.summary[0] === e.reading,
  );
}

function catalogLabel(by, value) {
  if (by === 'classical-radical') return tx(`伝統部首 ${value}・${D.radInfo?.[value]?.c || ''}`, `Classical radical ${value} · ${D.radInfo?.[value]?.c || ''}`);
  if (by === 'strokes') return tx(`${value} 画`, `${value} strokes`);
  if (by === 'kanken') return tx(`漢検 ${value}`, `Kanji Kentei ${kankenGradeLabel(value)}`);
  if (by === 'jlpt') return `JLPT ${value}`;
  return String(value);
}

function catalogEn(by, value) {
  if (by === 'classical-radical') return 'KANJIDIC2 dictionary classification';
  if (by === 'strokes') return `${value}-stroke kanji`;
  if (by === 'kanken') return `Kanji Kentei ${kankenGradeLabel(value)} kanji`;
  if (by === 'jlpt') return `JLPT ${value} kanji`;
  return '';
}

function catalogMatch(by, value) {
  if (by === 'classical-radical') return classicalRadicalHits(value);
  const out = [];
  for (const [c, k] of Object.entries(D.kanji)) {
    const hit =
      by === 'strokes'
        ? k.st === value
        : by === 'kanken'
          ? k.kk === value
          : by === 'jlpt'
            ? D.kmeta?.[c]?.jlpt === value
            : false;
    if (hit) out.push(c);
  }
  out.sort(
    (a, b) =>
      (D.kanji[a].kr || 9999) - (D.kanji[b].kr || 9999) || D.kanji[a].st - D.kanji[b].st || a.localeCompare(b),
  );
  return out;
}

function catalogChip(ja, en, by, value, from) {
  // Level categories share one exhaustive collection; other categories
  // retain their existing canonical catalog (for example stroke count).
  if (by === 'kanken') return referenceCollectionChip(ja, `kanken:${value}`);
  if (by === 'jlpt') return referenceCollectionChip(ja, `jlpt-kanji:${value}`);
  const chip = el('button', 'pool-tag cat-chip', bi() && en ? en : ja);
  chip.type = 'button';
  chip.setAttribute('aria-label', tx(`${ja} の漢字をすべて見る`, `see every ${en} kanji`));
  chip.addEventListener('click', () => go({ t: 'catalog', id: `${by}:${value}`, by, value, from }, { invoker: chip }));
  return chip;
}

function renderCatalogNode(sheet, node) {
  const { by, value } = node;
  const chars = catalogMatch(by, value);
  sheet.append(withEn(el('h1', 'view-title', catalogLabel(by, value)), catalogEn(by, value), 'en-inline'));
  if (by === 'classical-radical') {
    kanjiFactsStatus(sheet, kanjiFactsState(), 'catalog-facts-retry', () => { if (sheet.isConnected) render(); });
    if (kanjiFactsState() !== 'complete') return;
    sheet.append(el('p', 'fine', tx('字引に収録した字の分類。部品の形や語源の説明ではありません。', 'Classification of characters in this finder. This does not describe their visible parts or origins.')));
  }
  sheet.append(
    el('p', 'gloss', tx(`このくくりの漢字 — 全 ${chars.length} 字`, `every kanji in this group — all ${chars.length}`)),
  );
  if (!chars.length) {
    sheet.append(el('div', 'sem-empty', tx('この層に該当する字がない。', 'No kanji in this layer match.')));
    return;
  }
  const grid = el('div', 'cat-grid');
  for (const c of chars) {
    const cell = el('button', 'cat-cell');
    cell.type = 'button';
    cell.append(el('span', 'cat-glyph', c));
    cell.append(el('span', 'cat-mean', kanjiReferenceView(c, D.kanji[c] || kanjiReference(c)).meanings.join('; ')));
    cell.addEventListener('click', () => go({ t: 'kanji', id: c, from: node.from }, { invoker: cell }));
    grid.append(cell);
  }
  sheet.append(grid);
}

function articleFingerprint(p) {
  const text = (p?.tokens || []).map((token) => String(token?.s || '')).join('');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  const level = storyLevel(p).step;
  return { src: hash.toString(16).padStart(8, '0'), chars: [...text].filter((ch) => !/\s/u.test(ch)).length,
    level: /^N[1-5]$/u.test(level) ? level : null };
}

function articleReadChars(articleId, record = S, p = null) {
  const root = readHelpReadable(record.readHelp) ? record.readHelp : null;
  const row = root && owns(root.articles, articleId) ? root.articles[articleId] : null;
  if (row && owns(row, 'done') && finiteNumber(row.chars)) return row.chars;
  const passage = p || D.passages?.find((entry) => entry.id === articleId) || null;
  if (passage?.tokens?.length) return articleFingerprint(passage).chars;
  return finiteNumber(passage?.chars) ? passage.chars : null;
}

function readerChoiceMatch(choice, rows) {
  // R2 · an inflected token is matched as its dictionary form read the text's way (choice.form, choice.reading)
  const base = choice.form || choice.b || '';
  const spelled = READER_KANJI.test(base);
  const key = (spelled || READER_KANA.test(base) ? base : choice.r) || '';
  const reading = spelled ? '' : kataToHira(key);
  const by = spelled ? 'spelling' : 'reading';
  if (!key || (!spelled && !reading)) return { by, key, rows: [] };
  const collect = (fits) => {
    const found = [];
    for (const row of rows) {
      const k = row[5].findIndex((kana, index) => fits(row, kana, index));
      if (k < 0) continue;
      // a kana match is shown under a spelling its own reading permits (垂れ for だれ,
      // not the entry's kana head たれ), or as itself when it is kana only (ダレ)
      const head = spelled ? base : row[4].find((form) => readerReadingFits(row, k, form)) || row[5][k];
      found.push({ seq: String(row[0]), head, reading: row[5][k], gloss: readerSummaryFor(row, k)[2] });
    }
    return found;
  };
  if (!spelled) return { by, key, rows: collect((row, kana) => kataToHira(kana) === reading) };
  const written = (row, kana, index) => readerReadingFits(row, index, base);
  // an uninflected token's own reading is evidence: 産 read さん in 産巣日 is not ウブ.
  // An inflected one (分かっ for 分かる) says nothing about the dictionary form's reading by itself; R2: the reading
  // derived from it (choice.reading) is the dictionary form's
  const surface = choice.form ? kataToHira(choice.reading || '') : choice.s === base ? kataToHira(choice.r || '') : '';
  if (!surface) return { by, key, rows: collect(written) };
  const matching = collect((row, kana, index) => written(row, kana, index) && kataToHira(kana) === surface);
  if (matching.length) return { by, key, rows: matching };
  // no entry of this spelling carries the text's reading (the tokenizer may be wrong, or the word a
  // fragment): its entries are offered as explicit candidates under their own readings — never opened
  // for the learner, never called absent (産 is listed, as うぶ). With no entry at all, it is absent.
  const offered = collect(written);
  return offered.length ? { by, key, rows: offered, mismatch: (choice.form ? choice.reading : choice.r) || surface } : { by, key, rows: [] };
}

function readerEntryNode(token, index, p) {
  // R · the entry the token's own reading names, as its slip showed it (readingToken): 年 read ねん opens ねん's
  // entry; before the full dictionary answers, a core spelling carries the reading and its sheet resolves it.
  // R2 · the page is the door's: an inflected word's dictionary form read the text's way (its entry, or its D11 choice
  // matched by that reading), a sound change's entry by the entry's own reading, a lone kanji's page
  const door = readingToken(token);
  if (door.kanjiOnly) return { t: 'kanji', id: door.b, from: { passage: p.id, index } };
  // R3 · the page marks the sense its text uses (senseDoor)
  const node = { t: 'word', id: door.b, from: { passage: p.id, index }, ctxScope: 'sent',
    ...(door.sense?.seq ? { sense: { seq: door.sense.seq, k: door.sense.k } } : {}) };
  const own = tokenReading(door);
  if (door.seq) return { ...node, seq: door.seq, reading: door.r || own };
  // R2 · an unfit door (a verb read like the quick dictionary's noun) never opens that noun's page: it is matched like a
  // word the quick dictionary lacks (D11), by its reading
  if (D.dict[door.b] && readingAsksIndex(door.b, own) && !door.unfit) return { ...node, reading: own };
  if (D.dict[door.b] && !door.unfit) return node;
  node.readerChoice = { passage: p.id, index, s: token.s, b: token.b, r: token.r || '', state: 'pending',
    ...(door !== token ? { form: door.b, reading: own } : {}) };
  return node;
}

function readerChoiceTokenHolds(choice) {
  if (S.view !== 'reader' || S.passageId !== choice.passage) return false;
  const token = D.passages?.find((p) => p.id === choice.passage)?.tokens?.[choice.index];
  return !!token && token.s === choice.s && token.b === choice.b && (token.r || '') === choice.r;
}

function renderReaderChoice(sheet, node) {
  const choice = node.readerChoice;
  const head = el('h2', 'headword');
  head.append(document.createTextNode(node.id));
  sheet.append(head);
  // R2 · an inflected word's page reads as its dictionary form is read in the text (おい → おく), never the surface's ruby
  const shownReading = choice.form ? choice.reading : choice.r;
  if (shownReading) sheet.append(el('p', 'reading', shownReading));
  const box = el('div', 'reader-choice');
  box.id = 'reader-choice';
  box.dataset.state = choice.state;
  if (choice.by) box.dataset.by = choice.by;
  if (choice.state === 'pending') {
    // the existing opening line: the index opens off the main thread
    box.append(el('p', 'dictionary-opening', tx('語義と用法をひらいています…', 'Opening complete senses and usage…')));
    queueMicrotask(() => resolveReaderChoice(node));
  } else if (choice.state === 'unavailable') {
    const warning = el('p', 'dictionary-warning', tx(
      '全辞書をひらけないため、この語に合う項目を選べない。読み物と簡易辞書はそのまま使える。',
      'The full dictionary could not be opened, so no entry can be matched to this word. The reader and its quick dictionary still work.',
    ));
    warning.id = 'reader-choice-unavailable';
    const retry = biLabel('button', 'dictionary-retry', 'もう一度ひらく', 'try the full dictionary again');
    retry.type = 'button';
    retry.id = 'reader-choice-retry';
    retry.addEventListener('click', () => {
      if (S.stack.at(-1) !== node || choice.state !== 'unavailable') return;
      choice.state = 'pending';
      render();
    });
    box.append(warning, retry);
  } else if (choice.state === 'moved') {
    const moved = el('p', 'dictionary-warning', tx(
      '辞書をひらく間に本文が変わったため、この語は照合していない。本文からもう一度ひらいてください。',
      'The text changed while the dictionary opened, so this word was not matched. Open it again from the text.',
    ));
    moved.id = 'reader-choice-moved';
    box.append(moved);
  } else if (choice.state === 'none') {
    // name what was actually missing: no entry for the form at all; a listed spelling no reading is
    // permitted for (田ぼ, Codex D11 r4 review); or no entry read the way a kana base is
    const none = el('p', 'gloss absent', !choice.formRows
      ? tx('この語は辞書にない。', 'This word is not in the dictionary.')
      : choice.by === 'spelling'
        ? tx('辞書にこの書き方は載っているが、この書き方で読める項目はない。', 'The dictionary lists this spelling, but no entry permits a reading for it.')
      : choice.key
        ? tx(`辞書に、読み「${choice.key}」の項目はない。`, `No dictionary entry is read ${choice.key}.`)
        : tx('この語には読みがないため、辞書の項目と照合できない。', 'This word carries no reading, so it cannot be matched to a dictionary entry.'));
    none.id = 'reader-choice-none';
    box.append(none);
  } else if (choice.state === 'choose') {
    const title = withEn(
      el('p', 'reader-choice-title', '候補から選ぶ（この文での意味は確かめてください）'),
      'Choose the word — check it fits this sentence',
      'en-inline',
    );
    title.id = 'reader-choice-title';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-labelledby', title.id);
    box.append(title);
    if (choice.mismatch) {
      const mismatch = el('p', 'dictionary-warning', tx(
        `辞書に、この書き方で読み「${choice.mismatch}」の項目はない。別の読みの項目：`,
        `No entry with this spelling is read ${choice.mismatch}. Entries with other readings:`,
      ));
      mismatch.id = 'reader-choice-mismatch';
      box.append(mismatch);
    }
    for (const candidate of choice.candidates) {
      const button = el('button', 'reader-choice-row');
      button.type = 'button';
      button.id = `reader-choice-${candidate.seq}`;
      button.dataset.readerChoice = candidate.seq;
      button.setAttribute('aria-label', [candidate.head, candidate.reading, candidate.gloss].filter(Boolean).join(' · '));
      const stack = el('span', 'row-stack');
      const word = el('span', 'row-word');
      word.append(document.createTextNode(candidate.head), el('span', 'row-reading', candidate.reading));
      stack.append(word);
      if (candidate.gloss) stack.append(el('span', 'row-gloss', candidate.gloss));
      const arrow = el('span', 'row-go', '›');
      arrow.setAttribute('aria-hidden', 'true');
      button.append(stack, arrow);
      button.addEventListener('click', () => {
        if (S.stack.at(-1) !== node) return;
        // the article token keeps its identity (id, from); the chosen entry
        // rides only as seq/reading, exactly as a homograph door opens one
        go({
          t: 'word', id: node.id, seq: candidate.seq, reading: candidate.reading, matchedHead: candidate.head,
          matchedGloss: candidate.gloss || null,
          from: node.from, ctxScope: 'sent',
          readerChoice: {
            passage: choice.passage, index: choice.index, s: choice.s, b: choice.b, r: choice.r,
            by: choice.by, key: choice.key, state: 'chosen',
          },
        }, { invoker: button });
      });
      box.append(button);
    }
    if (choice.total > choice.candidates.length) {
      box.append(el('p', 'reader-choice-more', tx(
        `候補 ${choice.total} 件のうち ${choice.candidates.length} 件を表示`,
        `Showing ${choice.candidates.length} of ${choice.total} candidates`,
      )));
    }
  }
  box.append(readerCaptureReason(node));
  sheet.append(box);
}

function renderReaderChoiceNote(sheet, node) {
  const choice = node.readerChoice;
  const note = el('div', 'reader-choice-note');
  note.id = 'reader-choice-note';
  note.dataset.seq = String(node.seq);
  note.dataset.state = choice.state;
  if (choice.by) note.dataset.by = choice.by;
  const single = choice.by === 'spelling'
    ? tx(`表記「${choice.key}」の項目はこれ一つ（この文での意味は確かめてください）`, `The one entry written ${choice.key} — check it fits this sentence`)
    : tx(`読み「${choice.key}」の項目はこれ一つ（この文での意味は確かめてください）`, `The one entry read ${choice.key} — check it fits this sentence`);
  note.append(el('p', null, choice.state === 'single'
    ? single
    : tx('候補から選んだ項目（この文での意味は確かめてください）', 'Chosen from the candidates — check it fits this sentence')));
  note.append(readerCaptureReason(node));
  sheet.append(note);
}

export { levelPhrase, libraryVisibilityPolicy, libraryDiscoverable, shelfStories, shelfTallyText, shelfDateline, shelfCurrentDay, shelfDailyOrder, feedDate, publisherLink, shelfDateLabel, levelChip, placeSealStrip, readerReadingMissText, resolveReadingPlace, refreshReadingPlacesSurface, renderPublisherContextSelection, openReferenceEntry, renderReferenceMetadata, referenceCollectionChip, renderReferenceNode, shelfBodyToken, searchRowShownByCore, catalogLabel, catalogEn, catalogMatch, catalogChip, renderCatalogNode, articleFingerprint, articleReadChars, readerChoiceMatch, readerEntryNode, readerChoiceTokenHolds, renderReaderChoice, renderReaderChoiceNote };
