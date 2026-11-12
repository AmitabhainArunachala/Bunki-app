/** drift seam: split out of corridor.js (G3); now edited here directly. */
import { D, DEPTH_NAMES, DRIFT_THEME_BY_WORLD, ISO_DAY, KAGAMI_BAND_NAMES, KAGAMI_CLEAR, KAGAMI_LEVELS, KAGAMI_MIN_SEEN, KAGAMI_OOV, LEADING_DROP_DAYS, LEARN_STAGE_DECKS, MONTHS_EN, NODE_KIND, PART_WRITTEN, ROOM_NAMES, S, TODAY_JA_WORD, TODAY_SKY_CAP, TODAY_SKY_WORD, allAssessmentEvidence, bi, commitStorePatch, depthIndexMemo, depthNodeCache, el, finiteNumber, go, installScaleBridge, isLeech, kanaReadingKey, metReadable, nonEmptyString, notYetReleased, openAssessmentQuestionReview, openPassage, openSentencePractice, owns, plainRecord, readFrameRows, readHelpReadable, recordWritable, render, savedAnswerFor, setJaWords, setOwnRecordValue, shelfDay, srsKey, todaySky, trayItemPending, tx, uiIcon, withEn, wordCardIdentity } from '../corridor.js';
import { dictionaryAnsweredForm, dictionaryEpoch, dictionaryRowsReadAs, lookup, partMeaning, readerTokenAt, readerTokenNode } from './dictionary.mjs';
import { themeId } from './learner.mjs';
import { articleReadChars, shelfDateLabel, shelfStories } from './library.mjs';
import { learnerModel, learningItemNode, srsWhen } from './study-host.mjs';
import { recordViewSurface } from './voice.mjs';
import { keptItemNode } from './word-entry.mjs';
import { GRAMMARS, wwMine, wwPartCap } from './worlds.mjs';

function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function monthLabel(key) {
  const match = String(key).match(/^(\d{4})年(\d{1,2})月$/u);
  if (!match || !bi()) return key;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return key;
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1]} ${match[1]}`;
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function byNewest(a, b) {
  const da = shelfDay(a);
  const db = shelfDay(b);
  if (da !== db) {
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? 1 : -1;
  }
  return (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0);
}

function newestDropDay(rows) {
  let day = '';
  for (const p of rows) if (ISO_DAY.test(String(p?.addedAt || '')) && p.addedAt > day) day = p.addedAt;
  return day;
}

function leadingDropDays(rows) {
  const newest = newestDropDay(rows);
  if (!newest) return [];
  const floor = Date.parse(`${newest}T00:00:00Z`) - LEADING_DROP_DAYS * 86400000;
  return [...new Set(rows.map((p) => String(p?.addedAt || '')).filter((day) => ISO_DAY.test(day) && Date.parse(`${day}T00:00:00Z`) >= floor))]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

function byLeadingDrops(days) {
  const rank = new Map(days.map((day, i) => [day, i]));
  return (a, b) => {
    const ra = rank.get(a.addedAt) ?? Infinity;
    const rb = rank.get(b.addedAt) ?? Infinity;
    if (ra !== rb) return ra - rb;
    return ra === Infinity ? byNewest(a, b) : 0;
  };
}

function dayAge(day) {
  const [y, m, d] = day.split('-').map(Number);
  const now = new Date();
  return Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 86400000);
}

function dateStamp(day, cls) {
  const stamp = el('time', cls, shelfDateLabel(day));
  stamp.dateTime = day;
  return stamp;
}

function readerDateStamp(day) {
  const stamp = el('time', 'shelf-date');
  stamp.dateTime = day;
  const [whole, ago] = shelfDateLabel(day).split(' · ');
  const [y] = day.split('-');
  const thisYear = String(new Date().getFullYear()) === y;
  // the day, with its year in a span a phone may drop when it is this year
  const abs = el('span', 'date-abs');
  if (bi()) abs.append(whole.replace(` ${y}`, ''), el('span', thisYear ? 'date-year is-current' : 'date-year', ` ${y}`));
  else abs.append(el('span', thisYear ? 'date-year is-current' : 'date-year', `${y}年`), whole.replace(`${y}年`, ''));
  stamp.append(abs);
  if (ago) stamp.append(el('span', 'date-rel', ` · ${ago}`));
  return stamp;
}

function renderDrift(main) {
  // 銀河 is the hero: the galaxy fills the view and the corridor adds nothing
  // over it here. The way in to the shelf, the tutor, search and the dojo all
  // live behind the single symbol (buildGingaChrome) — the galaxy stays clear.
  main.style.padding = '0';
  installScaleBridge();
  window.__DRIFT__?.setPracticePriorities?.(allAssessmentEvidence().priorities);
}

function todayHash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function todayRng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function todayKanji(word) {
  return [...new Set([...String(word || '')].filter((c) => D.kanji?.[c]))];
}

function todayPartStrokes(part) {
  return D.radicals?.[part]?.st || D.kanji?.[part]?.st || 0;
}

function todayIsRadical(part, c) {
  const row = D.radByGlyph?.[part] || D.radByGlyph?.[(PART_WRITTEN[part] || [])[0]];
  return !!row && row.n === D.kanji?.[c]?.rad;
}

/** A radical's Japanese name from the official table (radicals214 `name`), only for the written form that name belongs
 * to: the positional variant (氵 さんずい) or a radical with one form (言 ごんべん, 門 もんがまえ). A standalone form whose
 * table name is its variant's (水 beside 氵) gets none: a name is never guessed. */
function todayRadicalName(part) {
  const row = D.radByGlyph?.[part];
  return row?.name && (row.var ? part === row.var : part === row.c) ? row.name : '';
}

function todaySharedPart(ks) {
  if (ks.length < 2) return null;
  const lists = ks.map((c) => D.kanji[c].parts || []);
  const shared = [...new Set(lists[0])]
    .filter((p) => !ks.includes(p) && D.radicals?.[p] && lists.slice(1).every((l) => l.includes(p)) && ks.every((c) => todayIsRadical(p, c)));
  shared.sort((a, b) => todayPartStrokes(b) - todayPartStrokes(a) || (a < b ? -1 : 1));
  return shared[0] || null;
}

function todayLargestPart(c) {
  const parts = [...new Set(D.kanji?.[c]?.parts || [])].filter((p) => p !== c && D.radicals?.[p] && todayIsRadical(p, c));
  parts.sort((a, b) => todayPartStrokes(b) - todayPartStrokes(a) || (a < b ? -1 : 1));
  return parts[0] || null;
}

function todayDueKeys(today) {
  const keys = new Set((today?.order || []).map((item) => srsKey(item.t, item.id)));
  const end = startOfDay(new Date()) + 86400000;
  for (const [key, rec] of Object.entries(S.srs || {})) if (Date.parse(rec?.due) < end) keys.add(key);
  return keys;
}

function todayHook(word) {
  const ks = todayKanji(word);
  let part = todaySharedPart(ks);
  const shared = !!part;
  let host = null;
  if (!part) {
    host = ks.map((c) => [c, todayLargestPart(c)]).filter(([, p]) => p)
      .sort((a, b) => todayPartStrokes(b[1]) - todayPartStrokes(a[1]))[0] || null;
    part = host?.[1] || null;
  }
  if (!part) return null;
  // the word web's own count (wwPartCap over wwMine), so Today and the web it opens say one number
  const cap = wwPartCap(part, wwMine());
  const family = cap.count;
  const mine = cap.mine;
  // its plain meaning (the written form's own, else its standalone form's: 氵 is water), never the catalogue's words
  const meaning = partMeaning(D.kanji?.[part]?.m) || partMeaning(D.kanji?.[(PART_WRITTEN[part] || [])[0]]?.m);
  return { part, shared, host: host?.[0] || null, kanji: ks, count: ks.length, family, mine, meaning };
}

function todaySecondsPerCard() {
  const times = (S.revlog || []).filter((row) => Array.isArray(row) && row[2] >= 1 && row[2] <= 4)
    .map((row) => row[0]).sort((a, b) => a - b).slice(-400);
  const gaps = [];
  for (let i = 1; i < times.length; i += 1) {
    const gap = times[i] - times[i - 1];
    if (gap >= 1500 && gap <= 120000) gaps.push(gap);
  }
  if (gaps.length < 10) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] / 1000;
}

function todayReadPick() {
  const curated = (D.passages || []).filter((p) => D.libraryDiscoverable?.(p) !== false && !String(p.file || '').startsWith('archive/'));
  const stories = shelfStories(curated);
  const pool = stories.filter((p) => p.source !== 'isa-yasashii-glossary' && !owns(S.readDone || {}, p.id));
  if (!pool.length) return null;
  const dropDays = leadingDropDays(stories);
  const order = byLeadingDrops(dropDays);
  const dropDay = dropDays.find((day) => pool.some((p) => p.addedAt === day)) || '';
  const fresh = dropDay ? pool.filter((p) => p.addedAt === dropDay) : [];
  const mine = new Set(S.taken.filter((i) => i.t === 'word').map((i) => i.id));
  let best = null;
  for (const p of fresh.length ? fresh : pool) {
    const count = mine.size ? (p.readingFacets?.forms || []).filter((f) => mine.has(f)).length : 0;
    if (!best || count > best.count || (count === best.count && order(p, best.passage) < 0)) best = { passage: p, count };
  }
  if (best.count || fresh.length) return best;
  const ready = pool.filter((p) => !/-pending$/u.test(p.review || '') && !p.pendingVerification);
  return { passage: [...(ready.length ? ready : pool)].sort(order)[0], count: 0 };
}

function todayLearning(tag, cls, text) {
  const node = el(tag, cls, text);
  node.lang = 'ja';
  node.dataset.uiContent = 'learning';
  return node;
}

function todayPhrases(node, text) {
  return setJaWords(node, text);
}

function todayDateline() {
  const now = new Date();
  const [y, m, d, w] = [now.getFullYear(), now.getMonth(), now.getDate(), now.getDay()];
  return tx(`${y}年${m + 1}月${d}日（${'日月火水木金土'[w]}）`,
    `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][w]} · ${d} ${MONTHS_EN[m]} ${y}`);
}

function todayCity() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'today-city');
  svg.setAttribute('viewBox', '0 0 400 80');
  svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const roofs = document.createElementNS(NS, 'path');
  roofs.setAttribute('class', 'today-roofs');
  const wins = document.createElementNS(NS, 'path');
  wins.setAttribute('class', 'today-wins');
  const lamps = document.createElementNS(NS, 'path');
  lamps.setAttribute('class', 'today-lamps');
  const r = todayRng(9);
  let roof = '';
  let win = '';
  let lamp = '';
  for (let x = 0, n = 0; x < 400; n += 1) {
    const w = 14 + Math.floor(r() * 26);
    const h = 10 + Math.floor(r() * (x > 130 && x < 270 ? 16 : 40));
    roof += `M${x} 80V${80 - h}h${w - 1}V80z`;
    for (let wy = 80 - h + 4; wy < 77; wy += 5) {
      for (let wx = x + 3; wx < x + w - 4; wx += 4) {
        if (r() > 0.62) {
          if ((n + wx + wy) % 11 === 0) lamp += `M${wx} ${wy}h1.6v2h-1.6z`;
          else win += `M${wx} ${wy}h1.6v2h-1.6z`;
        }
      }
    }
    x += w;
  }
  roofs.setAttribute('d', roof);
  wins.setAttribute('d', win);
  lamps.setAttribute('d', lamp);
  const horizon = document.createElementNS(NS, 'path');
  horizon.setAttribute('class', 'today-horizon');
  horizon.setAttribute('d', 'M0 79.5H400');
  svg.append(roofs, wins, lamps, horizon);
  return svg;
}

function todaySkyWord(w) {
  const n = [...String(w || '')].length;
  return n >= 2 && n <= 4 && TODAY_JA_WORD.test(w) && TODAY_SKY_WORD.test(w) && !!lookup(w);
}

function todayWhen(at) {
  const days = Math.round((new Date(dayKey()).getTime() - new Date(dayKey(new Date(at))).getTime()) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days;
}

function todaySkyWhy(kind, detail = {}) {
  const when = detail.at ? todayWhen(detail.at) : null;
  if (kind === 'missed') {
    if (detail.test) return tx('テストでまちがえた', 'missed in a test');
    return when === 'today' ? tx('今日まちがえた', 'missed today') : when === 'yesterday' ? tx('きのうまちがえた', 'missed yesterday')
      : tx(`${when}日前にまちがえた`, `missed ${when} days ago`);
  }
  if (kind === 'unknown') return tx('「まだ」にした', 'you marked it not yet');
  if (kind === 'looked') return detail.times === 2 ? tx('2回調べた', 'you looked it up twice') : tx(`${detail.times}回調べた`, `you looked it up ${detail.times} times`);
  if (kind === 'due') return tx('今日の復習', 'due today');
  if (kind === 'read' || kind === 'glyph') return tx('今日の読み物から', "from today's story");
  if (kind === 'kin') return tx(`今日のことばと「${detail.kanji}」が同じ`, `shares ${detail.kanji} with today's word`);
  return '';
}

function notYetMarks(record = S) {
  const root = record?.met;
  if (!metReadable(root)) return [];
  const marks = [];
  for (const [key, entry] of Object.entries(root.entries || {})) {
    const said = plainRecord(entry) && plainRecord(entry.said) ? entry.said : null;
    if (said?.value !== 'not-yet') continue;
    let parsed;
    try { parsed = JSON.parse(key); } catch { parsed = null; }
    // [1, 'word', id, kind, seq, reading] — what he met, never the spelling alone
    if (!Array.isArray(parsed) || parsed[0] !== 1 || parsed[1] !== 'word' || !nonEmptyString(parsed[2])) continue;
    const identity = { t: 'word', id: parsed[2], kind: parsed[3], seq: parsed[4] ?? null, reading: parsed[5] ?? null };
    const skey = srsKey('word', identity.id);
    const match = depthIdentityMatch(identity, wordCardIdentity(record, identity.id));
    if (match === 'same' && notYetReleased(record, skey, said.cursor)) continue;
    marks.push({ id: identity.id, key: skey, at: finiteNumber(said.at) ? said.at : 0 });
  }
  return marks.sort((a, b) => b.at - a.at);
}

function todayRedrawSky() {
  const hero = document.querySelector('#app main .today-hero');
  const old = hero?.querySelector('.today-sky');
  if (S.view !== 'tray' || !old || document.getElementById('mini') || !old.todayArgs) return;
  const fresh = todaySky(...old.todayArgs);
  old.replaceWith(fresh);
  todayPlaceSky(hero);
}

function todayPlaceSky(hero) {
  const sky = hero.querySelector('.today-sky');
  if (!sky?.isConnected || !sky.todayLanes) return;
  const R = sky.getBoundingClientRect();
  if (!R.width || !R.height) return;
  const r = todayRng(todayHash(`${dayKey()}:sky`));
  const W = R.width;
  const n = sky.todayLanes.length;
  // lane centres stand 23px inside the band, so every touch area is whole inside it
  const pitch = (R.height - 46) / Math.max(1, n - 1);
  // the caption that names the band sits on the near lane's right end; its whole touch area is
  // taken, so no star's own touch area runs under it
  const up = hero.querySelector('.today-universe')?.getBoundingClientRect();
  const nearRight = up?.width ? Math.min(W, up.left - R.left - 6) : W;
  const caption = up?.width ? [{ x: up.left - R.left - 4, y: up.top - R.top, w: up.width + 8, h: up.height }] : [];
  // his learning reads largest, the story and the family quieter (S)
  const SIZE = { glyph: 24, missed: 19, unknown: 19, looked: 18, due: 18, read: 16, kin: 16 };
  // per lane, top to bottom: does it float by, how far it sways each way, how many stars it keeps
  const FLOAT = [true, false, true, false, false];
  const SWAY = [0, 12, 0, 14, 4];
  const LIMIT = [2, 2, 2, 2, 2];
  const SPEED = [5, 0, 7, 0, 0];
  const placed = [...caption];
  const order = [4, 1, 3, 0, 2].filter((i) => i < n);
  const kept = sky.todayLanes.map(() => []);
  const laneBox = (li) => {
    const cy = 23 + li * pitch;
    const inset = FLOAT[li] ? 10 : 8 + SWAY[li];
    return { cy, left: inset, right: (li === n - 1 ? nearRight : W) - inset };
  };
  sky.todayLanes.forEach(({ lane }, li) => {
    lane.style.top = `${(laneBox(li).cy - 22).toFixed(1)}px`;
    lane.style.height = '44px';
  });
  // S · stars are seated in rank order (his learning first), each in its own lane when it has room, else in the next lane
  // that does: a star chosen for a reason is never dropped for want of luck while the sky has a place for it
  const ranked = sky.todayLanes.flatMap(({ stars }, li) => stars.map((star) => ({ star, li })))
    .sort((x, y) => Number(x.star.dataset.rank || 0) - Number(y.star.dataset.rank || 0));
  for (const { star, li: home } of ranked) {
    star.hidden = true;
    if (kept.flat().length >= TODAY_SKY_CAP) continue;
    const kind = Object.keys(SIZE).find((k) => star.classList.contains(k)) || 'read';
    const size = SIZE[kind];
    const w = [...star.textContent].length * size;
    // a touch area of at least 44 x 44 around the word that meets no other at rest: a place at random in the lane, else
    // the first free place from its left edge
    const hitW = Math.max(44, w + 16);
    let seat = null;
    for (const li of [home, ...order.filter((i) => i !== home)]) {
      if (kept[li].length >= LIMIT[li]) continue;
      const { cy, left, right } = laneBox(li);
      const span = right - left - w;
      if (span < 0) continue;
      const tries = [...Array.from({ length: 48 }, () => left + r() * span), ...Array.from({ length: Math.floor(span / 6) + 1 }, (_, k) => left + k * 6)];
      for (const x of tries) {
        const box = { x: x + w / 2 - hitW / 2, y: cy - 22, w: hitW, h: 44 };
        if (placed.some((o) => box.x < o.x + o.w && o.x < box.x + box.w && box.y < o.y + o.h && o.y < box.y + box.h)) continue;
        placed.push(box);
        seat = { li, x };
        break;
      }
      if (seat) break;
    }
    if (!seat) continue;
    const lane = sky.todayLanes[seat.li].lane;
    if (star.parentElement !== lane) lane.append(star);
    kept[seat.li].push({ star, x: seat.x, w, size });
  }
  kept.forEach((seated, li) => {
    const ringW = W + Math.max(0, ...seated.map((s) => s.w)) + 48;
    for (const { star, x, size } of seated) {
      star.style.fontSize = `${size}px`;
      star.style.left = `${((x / W) * 100).toFixed(2)}%`;
      star.style.top = `${(22 - size / 2).toFixed(1)}px`;
      for (const name of ['--from', '--to', '--lag', '--ring']) star.style.removeProperty(name);
      if (FLOAT[li]) {
        // one ring for the whole lane: its stars move at one pace and wrap out of sight, so their
        // spacing never changes; at rest (and with reduced motion) each sits at x
        const start = W + 24;
        star.style.setProperty('--from', `${(start - x).toFixed(1)}px`);
        star.style.setProperty('--to', `${(start - ringW - x).toFixed(1)}px`);
        star.style.setProperty('--lag', `${(-(start - x) / SPEED[li]).toFixed(2)}s`);
        star.style.setProperty('--ring', `${(ringW / SPEED[li]).toFixed(2)}s`);
      }
      star.hidden = false;
    }
  });
}

/** The day's word's one line of why, from its rule (todayWordOfDay), dated in the app's style (8 Nov · 11月8日; the year
 * only when it is not this one) (John, 2026-11-10: "how is the word connected to the user or the study or progress?"). */
function todayWordWhy(pick) {
  const on = (at) => {
    const d = new Date(at);
    const year = d.getFullYear() === new Date().getFullYear() ? null : d.getFullYear();
    return { ja: `${year ? `${year}年` : ''}${d.getMonth() + 1}月${d.getDate()}日`, en: `${d.getDate()} ${MONTHS_EN[d.getMonth()]}${year ? ` ${year}` : ''}` };
  };
  if (pick.from === 'missed' && Number.isFinite(pick.at)) {
    const day = on(pick.at);
    return tx(`${day.ja}にまちがえた語`, `You missed this on ${day.en}.`);
  }
  if (pick.from === 'saved') {
    if (!pick.at) return tx('保存した語', 'You saved this.');
    const day = on(pick.at);
    return tx(`${day.ja}に保存した語`, `You saved this on ${day.en}.`);
  }
  if (pick.from === 'read') return tx('今日の読み物から', "From today's reading.");
  const deck = pick.from === 'deck' ? LEARN_STAGE_DECKS.find(([id]) => id === pick.deck) : null;
  if (deck) return tx(`${deck[1]}デッキの次の語`, `Next in your ${deck[2]} deck.`);
  return '';
}

function renderTodayWord(pick) {
  const block = el('div', 'today-dayword');
  const label = el('p', 'dw-label', tx('今日のことば', "Today's word"));
  label.dataset.japaneseLookup = 'off';
  block.append(label);
  // why this word is here, from the pick's own source only (todayWordWhy)
  const why = todayWordWhy(pick);
  if (why) block.append(el('p', 'dw-why', why));
  const word = el('button', 'dw-word');
  word.type = 'button';
  word.dataset.uiContentValue = `語|${pick.word}`;
  const glyph = todayLearning('span', 'dw-glyph');
  for (const ch of pick.word) glyph.append(el('span', 'dw-k', ch));
  glyph.style.setProperty('--n', String(Math.max(2, [...pick.word].length)));
  word.append(glyph);
  if (pick.reading) word.append(todayLearning('span', 'dw-r', pick.reading));
  word.addEventListener('click', () => go(pick.item ? learningItemNode(pick.item) : { t: 'word', id: pick.word }, { invoker: word }));
  block.append(word);
  const hook = todayHook(pick.word);
  if (!hook) return block;
  const pk = () => todayLearning('span', 'dw-pk', hook.part);
  // John, 2026-11-10: "it doesn't HIDE? it is A RADICAL ... it should be INSTRUCTIVE but accurate". The part is the
  // classical radical (部首) of every kanji named (todayIsRadical), so the line says that, with the radical's own name
  //   談 and 話 share the radical 言 (ごんべん, “say”).   「談」と「話」の部首は、どちらも 言（ごんべん）。
  //   The radical of 海 is 氵 (さんずい, “water”).        「海」の部首は 氵（さんずい）。
  const names = hook.shared ? hook.kanji : [hook.host];
  const ref = (c) => todayLearning('span', 'dw-kref', c);
  const radicalName = todayRadicalName(hook.part);
  const line = el('p', 'dw-hook');
  // the words that name the radical and the radical itself are one unbroken run (dw-keep), so the larger glyph never
  // opens a line alone ("…share the radical / 言 (ごんべん…" at 390 and 1440 px, owed repair 4); the line balances
  const keep = (...parts) => {
    const run = el('span', 'dw-keep');
    run.append(...parts);
    return run;
  };
  if (bi()) {
    if (hook.shared) {
      names.forEach((c, i) => line.append(i ? (i === names.length - 1 ? ' and ' : ', ') : '', ref(c)));
      line.append(' share ', keep('the radical ', pk()));
    } else line.append('The radical of ', ref(hook.host), ' ', keep('is ', pk()));
    const gloss = [radicalName && todayLearning('span', 'dw-rn', radicalName), hook.meaning && `“${hook.meaning}”`].filter(Boolean);
    if (gloss.length) line.append(' (', ...gloss.flatMap((g, i) => (i ? [', ', g] : [g])), ')');
    line.append('.');
  } else {
    names.forEach((c, i) => line.append(i ? (i === names.length - 1 ? 'と' : '、') : '', '「', ref(c), '」'));
    if (hook.shared) line.append('の部首は、', keep(names.length === 2 ? 'どちらも ' : 'どれも ', pk()));
    else line.append('の', keep('部首は ', pk()));
    if (radicalName) line.append('（', todayLearning('span', 'dw-rn', radicalName), '）');
    line.append('。');
  }
  block.append(line);
  // the web's own count (kanji that carry this part), the same number the door below opens on
  if (hook.family) {
    block.append(el('p', 'dw-fam', hook.mine
      ? tx(`この部首を含む漢字 ${hook.family} 字・うち ${hook.mine} 字はあなたの語に`, `${hook.family} kanji contain this radical · ${hook.mine} of them are in your words`)
      : tx(`この部首を含む漢字 ${hook.family} 字`, `${hook.family} kanji contain this radical`)));
  }
  // plain words (LABELS.md, round 4): the door names where it goes, the kanji that hold this part
  const follow = el('button', 'dw-go');
  follow.type = 'button';
  follow.dataset.uiContentValue = `部品|${hook.part}`;
  follow.append(el('span', 'dw-go-l', tx('', 'Kanji with')), pk(), el('span', 'dw-go-l', tx('を含む漢字', '')));
  follow.append(el('i', 'today-arrow'));
  follow.addEventListener('click', () => {
    // the word web, centred on the shared part; the part's own sheet when the web isn't ready
    if (typeof window.openWordWeb === 'function' && window.openWordWeb(hook.part, { type: 'part', invoker: follow }) !== false) return;
    go(D.radicals?.[hook.part] ? { t: 'radical', id: hook.part } : { t: 'kanji', id: hook.part }, { invoker: follow });
  });
  block.append(follow);
  return block;
}

function renderTodayLine(today, door, read) {
  const line = el('section', 'today-line');
  line.setAttribute('aria-label', tx('今日', 'Today'));
  if (door) line.append(door);
  if (read) {
    const then = el('button', 'today-then');
    then.type = 'button';
    then.append(el('span', 'today-then-l', tx('今日の読み物', "Today's reading")),
      todayPhrases(todayLearning('span', 'today-then-title'), read.passage.title));
    if (read.count) then.append(el('span', 'today-then-n', tx(`あなたの語 ${read.count}`, `${read.count} of your words`)));
    then.append(el('i', 'today-arrow'));
    // Back from the reading returns to Today, where it was opened (tighten pass 2026-11-10; it landed on the bookshelf)
    then.addEventListener('click', () => openPassage(read.passage.id, { returnView: 'tray' }));
    line.append(then);
  }
  return line;
}

function landOnKeptWords() {
  if (S.view !== 'tray' || !S.taken.length) return;
  const newest = S.taken.reduce((best, row) => (!best || (row.ts || 0) >= (best.ts || 0) ? row : best), null);
  const key = newest ? srsKey(newest.t, newest.id) : '';
  // a named list carries copies; the month buckets follow the lists, so the last row for the word is its month's
  const row = [...document.querySelectorAll('#app main .tray-line[data-kept-key]')].filter((node) => node.dataset.keptKey === key).at(-1)
    || document.getElementById('kept-words');
  if (!row) return;
  const ceiling = Math.max(0, document.querySelector('#app > .chrome')?.getBoundingClientRect().bottom || 0);
  const box = row.getBoundingClientRect();
  window.scrollTo({ top: Math.max(0, Math.round(window.scrollY + box.top - ceiling - (innerHeight - ceiling) * 0.3)), behavior: 'instant' });
  if (!row.matches('.tray-line')) return;
  row.dataset.landed = '';
  setTimeout(() => { if (row.isConnected) delete row.dataset.landed; }, 2000);
  row.focus({ preventScroll: true });
}

function trayLine(item, dueKeys) {
  const currentSurface = recordViewSurface();
  const line = el('div', 'tray-line');
  line.tabIndex = 0;
  line.setAttribute('role', 'button');
  const key = srsKey(item.t, item.id);
  line.dataset.keptKey = key;
  line.append(el('span', 'w', item.label));
  // G2 · the saved word's dot, for the entry and reading it was saved as
  if (item.t === 'word') line.append(depthDot(learningItemNode(item)));
  // a words list wearing a [word] chip on every row was chip noise
  // (operator, 2026-08-20): the kind speaks only when it differs from
  // the default. Rows stored before the kind fields existed still heal.
  if (item.t !== 'word') {
    const kindJa = item.kind || NODE_KIND[item.t]?.[0] || '';
    const kindEn = item.kindEn || item.kind || NODE_KIND[item.t]?.[1] || '';
    line.append(el('span', 'pool-tag', tx(kindJa, kindEn)));
  }
  if (isLeech(item)) line.append(el('span', 'pool-tag read-tag', tx('苦手', 'struggling')));
  // provenance, not authority: the tutor made this row, and saying so is
  // what keeps its autonomy honest (operator's word, 2026-08-24)
  if (item.by === 'sensei') line.append(el('span', 'pool-tag', tx('先生', 'tutor-made')));
  const when = el('span', 'when', srsWhen(item));
  // red is for NOW — a whole column of red "due" was noise wearing urgency
  if (dueKeys.has(key)) when.classList.add('due-now');
  line.append(when);
  if (!S.srs[key] && !finiteNumber(item.started) && !S.suspended[key]) {
    // a no-debt row (legacy or imported) wakes by hand: one quiet
    // affordance in the row itself, and only this press mints the card
    // into the review cycle — 始める is the explicit promotion
    const start = el('button', 'rest-toggle srs-start', tx('始める', 'start'));
    start.type = 'button';
    start.dataset.srsStart = key;
    start.setAttribute('aria-label', tx(`「${item.label}」の復習を始める`, `start learning ${item.label}`));
    start.disabled = trayItemPending.has(key) || !recordWritable();
    start.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (trayItemPending.has(key) || !recordWritable()) return;
      // matched by identity ON THE DECK ROW: a named list carries copies,
      // so the promotion must find the deck row by t/id, not by reference
      const now = Date.now();
      trayItemPending.add(key);
      start.disabled = true;
      let saved;
      try {
        saved = await commitStorePatch((latest) => ({
          taken: latest.taken.map((row) => row.t === item.t && row.id === item.id && !finiteNumber(row.started)
            ? { ...row, started: now } : row),
        }));
      } finally {
        trayItemPending.delete(key);
        start.disabled = !recordWritable();
      }
      if (saved && currentSurface()) render();
    });
    line.append(start);
  } else {
    // rest / wake — the card stays on the list, reviews skip it
    const rest = el('button', S.suspended[key] ? 'rest-toggle resting' : 'rest-toggle', S.suspended[key] ? '▶' : '');
    if (!S.suspended[key]) rest.append(uiIcon('pause', 'rest-icon'));
    rest.type = 'button';
    rest.setAttribute('aria-label', S.suspended[key] ? tx('復習にもどす', 'wake this card') : tx('休ませる', 'rest this card'));
    rest.title = S.suspended[key] ? tx('この札を復習にもどす', 'resume this card in reviews') : tx('この札を休ませる（復習で出さない）', 'pause this card: reviews skip it');
    rest.disabled = trayItemPending.has(key) || !recordWritable();
    const wasSuspended = !!S.suspended[key];
    rest.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (trayItemPending.has(key) || !recordWritable()) return;
      // rest/wake is deck state: it rides the guarded boundary, so a
      // failed persist changes nothing (the alert names the failure)
      const now = Date.now();
      trayItemPending.add(key);
      rest.disabled = true;
      let saved;
      try {
        saved = await commitStorePatch((latest) => {
          const suspended = { ...latest.suspended };
          if (wasSuspended) delete suspended[key];
          else setOwnRecordValue(suspended, key, now);
          return { suspended };
        });
      } finally {
        trayItemPending.delete(key);
        rest.disabled = !recordWritable();
      }
      if (saved && currentSurface()) render();
    });
    line.append(rest);
  }
  const openRow = () => item.t === 'question' ? openAssessmentQuestionReview(item) : item.t === 'sentence' ? openSentencePractice(item.id) : go(learningItemNode(item));
  line.setAttribute('aria-label', tx(`${item.label} の全項目`, `${item.label} — full entry`));
  line.addEventListener('click', openRow);
  line.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    // the row's own controls keep their keys
    if (ev.target !== line) return;
    ev.preventDefault();
    openRow();
  });
  return line;
}

function kagamiBand() {
  return { levels: {}, edge: null, evidence: 0, measured: 0, observed: 0, disagreement: false, sampled: false };
}

function kagamiNote(band, level, right, measured) {
  band.evidence += 1;
  if (measured) band.measured += 1;
  else band.observed += 1;
  // a judged answer on a word the graded lists never tagged is still an
  // answer (review round 11): counting it in the totals and then dropping it
  // from every cell left the page reporting evidence it could not show.
  // 級外 is a cell like any other — it simply clears nothing, since it
  // names no level.
  const at = level || KAGAMI_OOV;
  const cell = band.levels[at] || (band.levels[at] = { seen: 0, right: 0, obsSeen: 0, obsRight: 0 });
  if (measured) {
    cell.seen += 1;
    if (right) cell.right += 1;
  } else {
    cell.obsSeen += 1;
    if (right) cell.obsRight += 1;
  }
}

function kagamiEdge(band) {
  let edge = null;
  let failedAt = -1;
  band.sampled = false;
  KAGAMI_LEVELS.forEach((level, ix) => {
    const cell = band.levels[level];
    if (!cell || cell.seen < KAGAMI_MIN_SEEN) return;
    band.sampled = true;
    if (cell.right / cell.seen >= KAGAMI_CLEAR) {
      edge = level;
      // clearing something HARDER than a level already failed is the only
      // real contradiction. Failing the harder level after clearing the
      // easier one is not disagreement — it is what learning looks like.
      if (failedAt >= 0 && ix > failedAt) band.disagreement = true;
    } else if (failedAt < 0) failedAt = ix;
  });
  return edge;
}

function renderKagami(main) {
  const model = learnerModel();
  main.append(withEn(el('p', 'eyebrow', '鏡'), 'the mirror', 'en-inline'));
  main.append(el('h1', 'view-title', tx(...ROOM_NAMES.rooms.kagami)));
  main.append(
    el(
      'p',
      'gloss',
      tx(
        'ここに出るのは、これまでの記録そのもの。級を言い当てるのではなく、どの級の問題をどれだけ通したかを並べる — 合否は、ここでは分からない。',
        'What follows is the record itself. It does not name your level; it lays out how much of each level’s material you have actually cleared — and whether you would pass is not knowable from here.',
      ),
    ),
  );
  // Bands need judged answers; confusions, the frontier and the leeches do
  // not. Treating an empty band set as an empty ledger hid pairs the sensei
  // had actually recorded (review round 10) — only a record with nothing at
  // all in it gets the bare line.
  const anything =
    model.totals.rows || model.unverifiedPractice.rows || model.edges.length || model.frontier.length || model.leeches.length;
  if (!anything) {
    main.append(
      el(
        'p',
        'card-kind',
        tx(
          'まだ何も映っていない。読んで、練習すると、ここに映る。',
          'Nothing here yet. Read and practise, and what you learn shows up here.',
        ),
      ),
    );
    return;
  }
  main.append(
    el(
      'p',
      'card-kind',
      model.totals.rows
        ? tx(
            `記録 ${model.totals.rows} 件 — 測定 ${model.totals.measured} · 観察 ${model.totals.observed}`,
            `${model.totals.rows} judged answers — ${model.totals.measured} measured · ${model.totals.observed} observed`,
          )
        : tx(
            '採点のついた記録はまだない。下は、それ以外に残ったもの。',
            'No judged answers yet — what follows is what the record holds besides them.',
          ),
    ),
  );

  if (model.unverifiedPractice.rows) {
    const practice = el('p', 'card-kind', tx(
      `過去の練習解答 ${model.unverifiedPractice.rows} 件を記録に残している。問題の版と解答の条件が分からないので、能力の測定には使っていない。`,
      `${model.unverifiedPractice.rows} earlier practice answers remain in your record. Their question versions and answer conditions are unknown, so they are not used to measure ability.`,
    ));
    practice.id = 'kagami-unverified-practice'; main.append(practice);
  }

  for (const [id, band] of Object.entries(model.totals.rows ? model.bands : {})) {
    const [ja, en] = KAGAMI_BAND_NAMES[id];
    const block = el('div', 'kagami-band');
    block.dataset.band = id;
    const head = el('p', 'eyebrow list-head');
    head.append(document.createTextNode(tx(ja, en)));
    block.append(head);
    if (!band.evidence) {
      block.append(el('p', 'kagami-thin', tx('まだない。', 'nothing yet')));
      main.append(block);
      continue;
    }
    const cells = el('div', 'kagami-levels');
    for (const level of [...KAGAMI_LEVELS, KAGAMI_OOV]) {
      const cell = band.levels[level];
      if (!cell || (!cell.seen && !cell.obsSeen)) continue;
      const box = el('div', 'kagami-cell' + (cell.seen < KAGAMI_MIN_SEEN ? ' thin' : ''));
      box.dataset.kagamiCell = `${id}:${level}`;
      box.append(el('span', 'kagami-level', level === KAGAMI_OOV ? tx('級外', 'untagged') : level));
      // the measured count is the claim; what was merely observed sits
      // beside it, visible and powerless
      box.append(el('span', 'kagami-count', cell.seen ? `${cell.right}/${cell.seen}` : '—'));
      if (cell.obsSeen) {
        box.append(el('span', 'kagami-obs', `${cell.obsRight}/${cell.obsSeen}${tx('観', ' obs')}`));
      }
      cells.append(box);
    }
    if (cells.children.length) block.append(cells);
    // the one sentence about this band — a description of rows, never a verdict
    block.append(
      el(
        'p',
        'kagami-read',
        band.edge
          ? tx(
              `${band.edge} の問題は通っている。その上はまだ足りない。`,
              `${band.edge} material is coming through; above it, not yet.`,
            )
          : band.sampled
            ? tx(
                '答えた級はあるが、どれもまだ通っていない。',
                'levels have been answered, and none is coming through yet.',
              )
            : tx(
                `どの級もまだ測定 ${KAGAMI_MIN_SEEN} 件に届かない — 判断はしない。`,
                `no level has reached ${KAGAMI_MIN_SEEN} measured answers yet — so nothing is claimed.`,
              ),
      ),
    );
    const tag = el('p', 'kagami-prov');
    tag.append(
      document.createTextNode(
        tx(
          `測定 ${band.measured} · 観察 ${band.observed}`,
          `${band.measured} measured · ${band.observed} observed`,
        ),
      ),
    );
    if (band.measured === 0) {
      tag.append(
        el(
          'span',
          'kagami-warn',
          tx('（会話からの観察だけ）', '(mined from conversation only)'),
        ),
      );
    }
    if (band.disagreement) {
      tag.append(
        el('span', 'kagami-warn', tx('（級ごとに食い違いあり）', '(the levels disagree)')),
      );
    }
    block.append(tag);
    main.append(block);
  }

  // what a key is CALLED on the page. Every deck type's id is already the
  // Japanese itself except a grammar point, whose id is an ascii handle
  // ('teiru') — printing it raw put "te / teiru" on the frontier where
  // 〜ている belongs. The id itself stays separate: the doors below navigate
  // by it, and a display name is not an address.
  const label = (key) => {
    const id = key.slice(key.indexOf(':') + 1);
    if (!key.startsWith('grammar:')) return id;
    return GRAMMARS().find((g) => g.id === id)?.p || id;
  };
  const glyph = (name) => name.replace(/^[〜~]/u, '').slice(0, 2);
  if (model.edges.length) {
    main.append(withEn(el('p', 'eyebrow list-head', '迷い'), 'pairs that trade places', 'en-inline'));
    const list = el('div', 'kagami-edges');
    for (const edge of model.edges) {
      const row = el('div', 'kagami-edge-row');
      row.dataset.kagamiEdge = `${edge.a}|${edge.b}`;
      row.append(el('span', 'kagami-pair', `${label(edge.a)} ↔ ${label(edge.b)}`));
      row.append(el('span', 'kagami-count', `${edge.n}`));
      list.append(row);
    }
    main.append(list);
  }

  if (model.frontier.length) {
    main.append(withEn(el('p', 'eyebrow list-head', '際'), 'the edge you are working', 'en-inline'));
    main.append(
      el(
        'p',
        'kagami-thin',
        tx('会って、まだ落ち着いていない言葉。', 'Met, and not yet settled.'),
      ),
    );
    const list = el('div', 'kagami-frontier');
    for (const item of model.frontier) {
      const cut = item.key.indexOf(':');
      const t = item.key.slice(0, cut);
      const id = item.key.slice(cut + 1);
      const name = label(item.key);
      const row = el('button', 'entry-row kagami-row');
      row.type = 'button';
      row.dataset.kagamiFrontier = item.key;
      // G2 · a kept word's door is its capture (keptItemNode): the entry and reading he saved, never the spelling alone
      const door = keptItemNode(t, id);
      row.append(el('span', 'row-glyph', glyph(name)));
      row.append(el('span', 'row-main', `${name}　${item.right}/${item.seen}`));
      if (door.t === 'word') kagamiKeptReading(row, door);
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go(door));
      list.append(row);
    }
    main.append(list);
  }

  if (model.leeches.length) {
    main.append(withEn(el('p', 'eyebrow list-head', '手こずり'), 'the ones that keep slipping', 'en-inline'));
    const list = el('div', 'kagami-frontier');
    for (const key of model.leeches.slice(0, 12)) {
      const cut = key.indexOf(':');
      const t = key.slice(0, cut);
      const id = key.slice(cut + 1);
      const name = label(key);
      const row = el('button', 'entry-row kagami-row');
      row.type = 'button';
      row.dataset.kagamiLeech = key;
      const door = keptItemNode(t, id);
      row.append(el('span', 'row-glyph', glyph(name)));
      row.append(el('span', 'row-main', name));
      if (door.t === 'word') kagamiKeptReading(row, door);
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go(door));
      list.append(row);
    }
    main.append(list);
  }
}

function localDayOrdinal(ms) {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function localMonthKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function depthIdentityMatch(occ, card) {
  if (!occ || !card || card.kind === 'unknown') return 'unknown';
  const cardReading = card.kind === 'core' ? kanaReadingKey(D.dict?.[occ.id]?.r || '') || null
    : nonEmptyString(card.reading) ? kanaReadingKey(card.reading) || null : null;
  const readings = occ.reading && cardReading ? (occ.reading === cardReading ? 'same' : 'other') : 'unknown';
  if (readings === 'other') return 'other';
  if (occ.kind === 'seq' && card.kind === 'seq') {
    if (occ.seq !== String(card.seq)) return 'other';
    return readings === 'same' ? 'same' : 'compatible';
  }
  if (occ.kind === 'core' && card.kind === 'core') return 'same';
  if (occ.kind === 'text' && card.kind === 'text') return readings === 'same' ? 'same' : 'unknown';
  if (readings !== 'same') return 'unknown';
  // the core record beside an entry read alike: one word only where the full dictionary, asked for this spelling, has exactly
  // one entry written and read so, and it is the entry named (the core is that entry's editorial pick). Not asked: compatible.
  if ((occ.kind === 'core' && card.kind === 'seq') || (occ.kind === 'seq' && card.kind === 'core')) {
    const seq = String(occ.kind === 'seq' ? occ.seq : card.seq);
    const rows = dictionaryAnsweredForm(occ.id) ? dictionaryRowsReadAs(occ.id, occ.reading) : [];
    return rows.length === 1 && String(rows[0][0]) === seq ? 'same' : 'compatible';
  }
  return 'compatible';
}

function depthIndex(record) {
  const anchor = Array.isArray(record.revlog) ? record.revlog : depthIndex;
  const memo = depthIndexMemo.get(anchor);
  if (memo && memo.taken === record.taken && memo.lists === record.lists && memo.srs === record.srs) return memo;
  const taken = new Map();
  for (const row of Array.isArray(record.taken) ? record.taken : []) if (row?.t === 'word' && !taken.has(row.id)) taken.set(row.id, row);
  const listed = new Set();
  for (const items of Object.values(plainRecord(record.lists) ? record.lists : {}))
    for (const item of Array.isArray(items) ? items : []) if (item?.t === 'word') listed.add(item.id);
  const reviewed = new Set();
  for (const row of Array.isArray(record.revlog) ? record.revlog : []) if (Array.isArray(row)) reviewed.add(row[1]);
  const index = { taken: record.taken, lists: record.lists, srs: record.srs, takenRows: taken, listed, reviewed };
  if (anchor !== depthIndex) depthIndexMemo.set(anchor, index);
  return index;
}

function depthNodeOf(element) {
  const raw = element.dataset.depthNode;
  if (raw) {
    try {
      const node = JSON.parse(raw);
      return plainRecord(node) && nonEmptyString(node.id) ? { t: 'word', id: node.id,
        ...(nonEmptyString(node.seq) ? { seq: node.seq } : {}), reading: nonEmptyString(node.reading) ? node.reading : '' } : null;
    } catch { return null; }
  }
  if (element.matches('.japanese-lookup-word')) {
    const text = element.dataset.lookupText;
    // the page's own headword stays bare: its dot stands at the head of the basis line under it, with the words that say why
    if (element.closest('.headword')) return null;
    return /[\p{Script=Han}\p{Script=Katakana}]/u.test(text) || D.dict?.[text] ? { t: 'word', id: text } : null;
  }
  if (!element.closest('#reader') || element.dataset.targetKind === 'particle' || element.classList.contains('annotation')) return null;
  const epoch = dictionaryEpoch();
  const cached = depthNodeCache.get(element);
  if (cached && cached.epoch === epoch && cached.passage === S.passageId && cached.index === element.dataset.index) return cached.node;
  const node = readerTokenNode(readerTokenAt(S.passageId, Number(element.dataset.index)));
  depthNodeCache.set(element, { epoch, passage: S.passageId, index: element.dataset.index, node });
  return node;
}

function depthDot(node) {
  const dot = el('span', 'depth-dot');
  dot.setAttribute('aria-hidden', 'true');
  dot.dataset.depthNode = JSON.stringify({ id: node.id, ...(node.seq != null && node.seq !== '' ? { seq: String(node.seq) } : {}),
    reading: String(node.reading || '') });
  return dot;
}

function depthBasisParts(result) {
  const parts = [];
  const name = DEPTH_NAMES[result.depth] || DEPTH_NAMES.unmet;
  const days = result.days;
  parts.push(!days ? tx(name[0], name[1])
    : result.depth === 'met' ? (days === 1 ? tx('一度出会った', 'Met once') : tx(`${days}日出会った`, `Met on ${days} days`))
      : result.depth === 'again' ? (days === 1 ? tx(name[0], name[1]) : tx(`再会・${days}日`, `Seen again, on ${days} days`))
        : tx(`${name[0]}・${days}日出会った`, `${name[1]} · met on ${days} day${days === 1 ? '' : 's'}`));
  const review = result.review;
  if (review) {
    const r = review.r === null ? null : Math.round(review.r * 100);
    parts.push(review.state === 0 ? tx('保存済み・まだ復習なし', 'saved, not yet reviewed')
      : review.state === 2 ? (r === null ? tx('復習中', 'in review') : tx(`復習中・いま思い出せる見込み ${r}%`, `in review · recall now ${r}%`))
        : tx('覚えている途中', 'still learning'));
  } else if (result.match === 'other') parts.push(tx('保存したのは別の読み', 'your saved card is another reading'));
  else if (result.identity.kind === 'unresolved') parts.push(tx('この読みの項目はまだ定まらない', 'this reading’s entry is not settled'));
  // the page's reading stands once, in the line above this one (tighten pass, 2026-11-10)
  if (result.said === 'known') parts.push(tx('自分で「知っている」', 'you said you know it'));
  if (result.said === 'not-yet') parts.push(result.cap === 'not-yet' || result.depth === 'again' || result.depth === 'met'
    ? tx('「まだ」— 次によく思い出せるまで', '“not yet” — until your next good review') : tx('「まだ」', '“not yet”'));
  return parts;
}

function helpByMonth(record = S) {
  const root = readHelpReadable(record.readHelp) ? record.readHelp : null;
  if (!root) return null;
  const months = new Map();
  for (const [articleId, row] of Object.entries(root.articles)) {
    if (!owns(row, 'done')) continue;
    const month = months.get(row.month) || { month: row.month, articles: 0, chars: 0, help: 0, levels: [], unlevelled: 0 };
    month.articles += 1;
    month.chars += articleReadChars(articleId, record);
    month.help += row.helped.length;
    if (row.level) month.levels.push(Number(row.level.slice(1)));
    else month.unlevelled += 1;
    months.set(row.month, month);
  }
  return { since: root.since, months: [...months.values()].sort((a, b) => (a.month < b.month ? 1 : -1)).map((month) => ({
    month: month.month, articles: month.articles, chars: month.chars, help: month.help, unlevelled: month.unlevelled,
    per1000: month.chars > 0 ? (1000 * month.help) / month.chars : null,
    level: month.levels.length ? `N${Math.round(month.levels.reduce((sum, n) => sum + n, 0) / month.levels.length)}` : null })) };
}

function kagamiKeptReading(row, door) {
  if (!S.taken.some((item) => item.t === 'word' && item.id === door.id)) return;
  const answer = savedAnswerFor({ t: 'word', id: door.id });
  const reading = door.reading || (answer?.status === 'available' ? answer.reading : '');
  if (reading) {
    const span = el('span', 'row-reading', reading);
    span.lang = 'ja';
    row.append(span);
  }
  row.append(depthDot(door));
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function trailLastPhrase(row) {
  const kind = row[1];
  const g = row[3];
  if (kind === 'tap') {
    if (g === 3) return tx('全項目をひらいた', 'opened the full entry');
    if (g === 2) return tx('語釈を見た', 'looked at the meaning');
    return tx('ふりがなを出した', 'revealed the reading');
  }
  if (kind === 'drift') return g === 3 ? tx('水で「わかる」', 'flicked as known in the water') : tx('水で「まだ」', 'flicked as not yet in the water');
  if (kind === 'probe') return g === 3 ? tx('読めた（読みの確認）', 'read it right in a reading check') : tx('読めなかった（読みの確認）', 'missed it in a reading check');
  if (kind === 'lesson') return g === 3 ? tx('レッスンで正解', 'answered right in a lesson') : tx('レッスンで不正解', 'answered wrong in a lesson');
  if (kind === 'reveal') return g === 1 ? tx('復習で「思い出した」', 'declared recall in review') : tx('復習で「まだ」', 'declared not-yet in review');
  if (kind === 'dojo') {
    // detail 0 is the revocation an undo files, not a grade
    if (g === 0) return tx('道場の稽古を取り消した', 'took back a dojo practice');
    const seal = { 1: '再', 2: '難', 3: '良', 4: '易' }[g];
    return seal ? tx(`道場の稽古 — ${seal}`, `practised in the dojo — ${['', 'again', 'hard', 'good', 'easy'][g]}`) : tx('道場の稽古', 'practised in the dojo');
  }
  return tx('出会った', 'met it');
}

function roughestThisWeek(n = 5) {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return readFrameRows().filter((row) => row[0] >= since).sort((a, b) => b[3] - a[3]).slice(0, n)
    .map(([t, name, where, worst]) => ({ name, where, worst_ms: worst, at: new Date(t).toISOString().slice(0, 10) }));
}

function syncDriftTheme() {
  try {
    if (window.__DRIFT__ && window.__DRIFT__.setTheme) {
      window.__DRIFT__.setTheme(DRIFT_THEME_BY_WORLD[themeId()] ?? 0);
    }
  } catch {
    /* drift not mounted yet — render() re-syncs when it first shows */
  }
}

export { dayKey, monthKey, monthLabel, luminance, byNewest, newestDropDay, leadingDropDays, byLeadingDrops, dayAge, dateStamp, readerDateStamp, renderDrift, todayHash, todayRng, todayKanji, todayPartStrokes, todayIsRadical, todaySharedPart, todayLargestPart, todayDueKeys, todayHook, todaySecondsPerCard, todayReadPick, todayLearning, todayPhrases, todayDateline, todayCity, todaySkyWord, todayWhen, todaySkyWhy, notYetMarks, todayRedrawSky, todayPlaceSky, renderTodayWord, renderTodayLine, landOnKeptWords, trayLine, kagamiBand, kagamiNote, kagamiEdge, renderKagami, localDayOrdinal, localMonthKey, depthIdentityMatch, depthIndex, depthNodeOf, depthDot, depthBasisParts, helpByMonth, kagamiKeptReading, startOfDay, trailLastPhrase, roughestThisWeek, syncDriftTheme };
