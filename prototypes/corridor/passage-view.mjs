/**
 * Passage preview (prototype, 2026-11-10): the door on the 職・識・織 kanji pages and the one
 * screen that walks the fixed seven-stop route of m4-passage.mjs, 職 → 戠 → 識 → 戠 → 織 → 糸 → 織.
 *
 * This file is the host that model never had, and it is deliberately a small one:
 *  - The model's owner gets a READ port only. Nothing here can write to the learner's record,
 *    the schedule or the help record, and the model's reductions carry no effects.
 *  - The walk lives in page memory. Return keeps the place through the model's own
 *    interrupt and resume, bound to the page it was opened from; a reload forgets it.
 *  - A kanji page opened from a word in a reading hands that occurrence to the model as its
 *    carried word, when the word is one of the family's own (職業, 知識, 組織). The model copies
 *    it and checks it; any other way in carries nothing.
 *  - No mechanics are added. Each control is one reducePassage command (next, play, pause,
 *    replay, motion); the interval below is the host timer the model's motion ticket expects.
 *
 * corridor.js loads this module beside the app and calls mountDoor from mountPageEffects.
 */
const FORMS = new Set(['職', '識', '織']);
const DOOR_ID = 'passage-door';
const STOP_MS = 5000; // one stop of a played walk
const TICK_MS = 100;
// Identities the model compares and never reads into.
const HOST = Object.freeze({}), BOOT = Object.freeze({}), VIEW = Object.freeze({}), NO_FRAME = Object.freeze({});

let host = null; // { state, epoch, tx, sentence }: the live app, as the latest door mount handed it over
let sources = null; // the admitted catalog, its route and what the stops show
let loading = null;
let owner = null;
let ride = null; // { page, node, held }: the one walk in page memory; held is the model's return capability
let carried = null; // what the owner snapshot offers the model: the reading occurrence of the current walk, or nothing
let visit = null; // the open screen

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const tx = (ja, en) => host.tx(ja, en);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
const frame = () => {
  const top = host.state.stack.at(-1);
  return top && typeof top === 'object' ? top : NO_FRAME;
};
/** The whole owner snapshot the model samples. No capture, lifecycle or digest port exists beside it. */
const read = () => ({
  owner: HOST, record: host.state, boot: BOOT, epoch: host.epoch(), generation: null, journeyId: null,
  view: VIEW, navigation: frame(), visit: host.state.kanjiCourse ?? null, carried, root: null,
});

function ensureStyles() {
  if (document.getElementById('passage-view-styles')) return;
  const link = el('link');
  link.id = 'passage-view-styles'; link.rel = 'stylesheet';
  link.href = new URL('./passage-view.css', import.meta.url).href;
  document.head.append(link);
}

/** Admit the five original source files through the model's own pinned gate, then resolve its route. */
function load() {
  if (sources) return Promise.resolve(sources);
  loading ||= (async () => {
    const [passage, world] = await Promise.all([import('./m4-passage.mjs'), import('./m4-worldcraft.mjs')]);
    const fields = Object.keys(world.SOURCE_PINS);
    const buffers = await Promise.all(fields.map(async (field) => {
      const response = await fetch(new URL('./data/share_alike/' + world.SOURCE_PINS[field].file, import.meta.url));
      if (!response.ok) throw new Error('source-unavailable');
      return response.arrayBuffer();
    }));
    const bytes = Object.fromEntries(fields.map((field, index) => [field, buffers[index]]));
    const admitted = await world.createWorldcraftCatalog(bytes);
    if (!admitted.ok) throw new Error(admitted.reason);
    const route = passage.resolvePassage(admitted.value);
    if (!route.ok) throw new Error(route.reason);
    const plan = passage.inspectRoute(admitted.value, route.value);
    const info = world.inspectWorldcraftCatalog(admitted.value);
    if (!plan.ok || !info.ok) throw new Error('route-not-admitted');
    const decode = (buffer) => JSON.parse(new TextDecoder().decode(buffer));
    const family = decode(bytes.familyBytes);
    sources = { passage, world, catalog: admitted.value, route: route.value, plan: plan.value,
      family: info.value.family, words: info.value.words, cited: new Map(family.sources.map((row) => [row.id, row])),
      kanji: decode(bytes.kanjiBytes).kanji };
    return sources;
  })().finally(() => { loading = null; });
  return loading;
}

function dropRide() {
  if (ride) sources?.passage.discardPassage(ride.page);
  ride = null; carried = null;
}
/** The word the learner came with: an actual occurrence of one of the family's words in a loaded reading, else nothing. */
function carriedFrom(node) {
  const found = node.from ? host.sentence(node) : null; // { p, index, start, end, quote }
  const token = found?.p.tokens[found.index];
  const word = token && sources.words.find((row) => row.id === token.b && row.reading === token.r);
  if (!word) return null;
  return { word: { type: 'word', id: word.id, reading: word.reading },
    sourceOccurrence: { source: 'passage', passage: found.p.id, token: found.index, sentence: [found.start, found.end],
      quote: found.quote, title: found.p.title || '' },
    sense: null };
}
function liveOwner() {
  if (owner && sources.world.readWorldOwner(owner).ok) return owner;
  dropRide(); // a changed record revoked the old owner and every page it held
  const made = sources.world.createWorldOwner(sources.catalog, { read });
  owner = made.ok ? made.value : null;
  return owner;
}
function heldStop(node) {
  if (!ride?.held || ride.node !== node) return 0;
  const view = sources.passage.inspectPassage(ride.page);
  return view.ok ? view.value.cursor.index + 1 : 0;
}
function paintDoor(door, node) {
  const stop = heldStop(node), total = stop && sources.plan.stops.length;
  door.textContent = stop
    ? tx(`続きをたどる（${stop}／${total}）`, `Resume the passage · stop ${stop} of ${total}`)
    : tx('職・識・織をたどる', 'Walk the 職・識・織 passage');
}

/** Called on every mount of a kanji page: one door, in its current state, or none. */
export function mountDoor({ sheet, node, state, tx: text, eligible, epoch, sentence }) {
  const old = sheet.querySelector('#' + DOOR_ID);
  if (!FORMS.has(node.id) || !eligible() || state.kanjiCourse) { old?.remove(); return; }
  host = { state, epoch, tx: text, sentence };
  ensureStyles();
  const door = old || el('button', 'chip passage-door');
  paintDoor(door, node);
  if (old) return;
  door.id = DOOR_ID; door.type = 'button';
  door.addEventListener('click', () => {
    if (!visit && eligible() && !state.kanjiCourse && state.stack.at(-1) === node) void openPassage(door, node);
  });
  // with the page's other doors (tighten pass, 2026-11-10): after the course door, else last in the doors' group
  const anchor = sheet.querySelector('#kanji-course-unit-door'), group = sheet.querySelector('.kanji-doors');
  if (anchor) anchor.after(door);
  else if (group) group.append(door);
  else if (sheet.querySelector('.hero')) sheet.querySelector('.hero').after(door);
  else sheet.append(door);
}

function citation(evidence) {
  const source = sources.cited.get(evidence.sourceId);
  const label = `${source?.title || evidence.sourceId} · ${evidence.locator}`;
  const line = el(/^https:\/\//u.test(source?.url || '') ? 'a' : 'p', 'fine passage-source', label);
  if (line.tagName === 'A') { line.href = source.url; line.target = '_blank'; line.rel = 'noopener noreferrer'; }
  return line;
}
function hopLine(hop) {
  const whole = hop.direction === 'incoming' ? hop.from.id : hop.to.id;
  const part = hop.direction === 'incoming' ? hop.to.id : hop.from.id;
  return hop.relation === 'phonetic-component'
    ? tx(`${hop.from.id} から ${hop.to.id} へ。${part} は ${whole} の音を表す部分です。`,
      `From ${hop.from.id} to ${hop.to.id}: ${part} is the part of ${whole} that carries its sound.`)
    : tx(`${hop.from.id} から ${hop.to.id} へ。${part} は ${whole} の意味に関わる部分です。`,
      `From ${hop.from.id} to ${hop.to.id}: ${part} is the part of ${whole} tied to its meaning.`);
}

async function openPassage(invoker, node) {
  const state = host.state, epoch = host.epoch();
  const sheet = invoker.closest('#sheet');
  const origin = { view: state.view, top: sheet?.scrollTop ?? 0 };
  const dialog = el('dialog', 'passage-dialog');
  dialog.id = 'passage-dialog';
  dialog.setAttribute('aria-label', tx('職・識・織をたどる', 'Passage through 職, 識 and 織'));
  const page = el('div', 'passage-page'), bar = el('div', 'passage-bar'), body = el('div', 'passage-body');
  const back = el('button', 'sheet-back', tx('戻る', 'Back'));
  back.type = 'button'; back.id = 'passage-return'; back.dataset.barBack = '';
  bar.append(back, el('span', 'pool-tag', tx('試作', 'preview')));
  page.append(bar, body); dialog.append(page);
  const oldOverflow = document.body.style.overflow;
  const media = reducedMotion();
  let closed = false, painted = false, timer = null, ticket = null, started = 0;
  const here = () => host.epoch() === epoch && state.view === origin.view && state.stack.at(-1) === node;
  const snapshot = () => {
    const view = ride && sources.passage.inspectPassage(ride.page);
    return view?.ok ? view.value : null;
  };
  const stopTimer = () => { clearInterval(timer); timer = null; ticket = null; };

  function close(restore = true) {
    if (closed) return;
    closed = true; stopTimer();
    media?.removeEventListener('change', onMotion);
    window.removeEventListener('popstate', onPop);
    const view = snapshot();
    if (view && view.cursor.status !== 'complete' && !view.interrupted && here()) {
      // an unfinished walk keeps its place: the model's continuation, bound to this page
      const kept = sources.passage.interruptPassage(ride.page);
      if (kept.ok) ride.held = kept.value; else dropRide();
    } else if (!view?.interrupted) dropRide();
    dialog.close(); dialog.remove(); document.body.style.overflow = oldOverflow;
    visit = null;
    if (!here()) return;
    const door = document.getElementById(DOOR_ID);
    if (door) paintDoor(door, node);
    if (!restore) return;
    if (sheet?.isConnected) sheet.scrollTop = origin.top;
    (door || invoker).focus({ preventScroll: true });
  }
  function refuse(ja, en) {
    stopTimer();
    const line = el('p', 'fine', tx(ja, en));
    line.setAttribute('role', 'status');
    body.replaceChildren(line);
    back.focus();
  }
  function command(type, extra = {}) {
    const result = sources.passage.reducePassage(ride.page, { type, ...extra });
    return result.ok ? result.value.snapshot : null;
  }
  function act(type) {
    if (closed) return;
    if (!command(type)) {
      refuse('この道のりは、ここでは続けられなくなりました。戻って、もう一度開いてください。',
        'This passage is no longer available here. Go back and open it again.');
      return;
    }
    paint();
  }
  // the browser's own Back moves the app under this screen: leave with it, without claiming the page
  function onPop() { close(false); }
  function onMotion() {
    const view = snapshot(), motion = media?.matches ? 'reduced' : 'full';
    if (view && view.cursor.motion !== motion && command('motion', { motion })) paint();
  }
  /** The host timer of a played walk: progress under the model's ticket, then finish the step. */
  function tick() {
    const view = snapshot();
    if (closed || !view || view.cursor.status !== 'playing' || !view.motionTicket) { stopTimer(); return; }
    if (document.hidden) { act('pause'); return; }
    if (view.motionTicket !== ticket) { ticket = view.motionTicket; started = performance.now() - view.cursor.phase * STOP_MS; }
    const phase = Math.min(1, Math.max(view.cursor.phase, (performance.now() - started) / STOP_MS));
    if (!command('progress', { ticket, phase })) { stopTimer(); return; }
    const fill = body.querySelector('.passage-progress > span');
    if (fill) fill.style.width = `${Math.round(phase * 100)}%`;
    if (phase < 1) return;
    if (command('finish-step', { ticket })) paint(); else stopTimer();
  }

  function paint() {
    const view = snapshot();
    if (!view) {
      refuse('この道のりは、ここでは続けられなくなりました。戻って、もう一度開いてください。',
        'This passage is no longer available here. Go back and open it again.');
      return;
    }
    const { plan, family, kanji } = sources, { cursor, stop, incomingHop } = view;
    const brought = view.carried;
    const total = plan.stops.length, done = cursor.status === 'complete';
    // the repaint replaces the control that holds the keyboard: hand it to the same control, or the first one
    const active = document.activeElement;
    const focused = !painted || body.contains(active) ? active?.id || '' : null;
    painted = true;
    const count = el('p', 'eyebrow', tx(`道のり · ${cursor.index + 1}／${total}`, `Passage · stop ${cursor.index + 1} of ${total}`));
    count.id = 'passage-count'; count.setAttribute('role', 'status');
    const title = el('h2', 'passage-title', tx(family.titleJa, family.titleEn));
    const route = el('ol', 'passage-route');
    route.setAttribute('aria-label', tx('道のりの七つの字', 'The seven stops'));
    plan.stops.forEach((row, index) => {
      const item = el('li', index < cursor.index || done ? 'is-past' : null, row.reference.id);
      if (index === cursor.index && !done) item.setAttribute('aria-current', 'step');
      route.append(item);
    });
    const progress = el('div', 'passage-progress');
    progress.append(el('span'));
    progress.hidden = cursor.status !== 'playing' || !view.motionTicket;
    const parts = [count, title, route, progress];
    const actions = el('div', 'passage-actions');
    const button = (id, cls, ja, en, run) => {
      const node = el('button', cls, tx(ja, en));
      node.type = 'button'; node.id = id; node.addEventListener('click', run);
      actions.append(node);
    };
    if (done) {
      parts.push(el('h3', 'list-head', tx('道のりの終わり', 'End of the passage')),
        el('p', 'passage-hop', tx(`${total}つの字をすべてたどりました：${plan.stops.map((row) => row.reference.id).join(' → ')}`,
          `You walked all ${total} stops: ${plan.stops.map((row) => row.reference.id).join(' → ')}`)));
      button('passage-finish', 'chip btn-primary', '元の場所へ戻る', 'Return to where you were', () => close());
      button('passage-replay', 'chip', 'もう一度たどる', 'Walk it again', () => act('replay'));
    } else {
      const record = kanji[stop.reference.id];
      const hero = el('div', 'hero'), meta = el('div', 'hero-meta');
      const glyph = el('div', 'hero-glyph', stop.reference.id);
      glyph.id = 'passage-glyph';
      if (record?.m) meta.append(el('div', 'hero-mean', record.m));
      const readings = el('dl', 'kv');
      for (const [ja, en, list] of [['音', 'on', record?.on], ['訓', 'kun', record?.kun]]) {
        const value = el('dd'), line = el('span', 'on', list?.length ? null : '—');
        (list || []).forEach((reading, index) => line.append(el('span', 'reading-item', reading + (index < list.length - 1 ? '・' : ''))));
        value.append(line);
        readings.append(el('dt', null, tx(ja, en)), value);
      }
      meta.append(readings); hero.append(glyph, meta); parts.push(hero);
      if (incomingHop) {
        parts.push(el('p', 'passage-hop', hopLine(incomingHop)), ...incomingHop.evidence.map(citation));
        if (incomingHop.relation === 'phonetic-component') parts.push(el('p', 'fine', tx(
          '音読みの手がかりであり、ことば全体の読みを決めるものではありません。',
          'A clue to on-readings, not a rule determining a word’s reading.')));
      } else {
        parts.push(el('p', 'passage-hop', tx(`この道のりは ${stop.reference.id} から始まります。`,
          `The passage starts at ${stop.reference.id}.`)));
      }
      const last = cursor.index === total - 1;
      button('passage-next', 'chip btn-primary', last ? '道のりを終える' : '次の字へ', last ? 'Finish the passage' : 'Next stop',
        () => act('next'));
      if (cursor.motion === 'full') {
        if (cursor.status === 'playing') button('passage-play', 'chip', '止める', 'Pause', () => act('pause'));
        else button('passage-play', 'chip', '自動で進める', 'Play through', () => act('play'));
      }
    }
    parts.push(actions);
    if (brought) {
      // the model's own copy of the occurrence the learner came from
      const word = el('p', 'passage-carried', brought.word.id);
      word.append(el('span', 'row-reading', brought.word.reading));
      parts.push(el('h3', 'list-head', tx('読んでいた文から', 'From your reading')), word,
        el('p', 'passage-quote', brought.sourceOccurrence.quote));
      if (brought.sourceOccurrence.title) parts.push(el('p', 'fine', `「${brought.sourceOccurrence.title}」`));
    }
    parts.push(el('p', 'fine passage-note', done
      ? tx('試作です。ここでは何も保存せず、復習にも数えていません。', 'Preview. Nothing here was saved or counted as review.')
      : tx('試作です。ここでは何も保存せず、復習にも数えません。戻っても、アプリを再読み込みするまでは続きから再開できます。',
        'Preview. Nothing here is saved or counted as review. Back keeps your place until the app is reloaded.')));
    body.replaceChildren(...parts);
    if (focused !== null) ((focused && body.querySelector('#' + CSS.escape(focused))) || actions.querySelector('button'))
      ?.focus({ preventScroll: true });
    if (cursor.status === 'playing' && view.motionTicket) timer ||= setInterval(tick, TICK_MS);
    else stopTimer();
  }

  visit = { close };
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  window.addEventListener('popstate', onPop);
  back.addEventListener('click', () => close());
  const wait = el('p', 'fine', tx('読み込み中…', 'Loading the passage…'));
  wait.setAttribute('role', 'status'); body.append(wait);
  document.body.append(dialog); dialog.showModal(); document.body.style.overflow = 'hidden';
  try { await load(); } catch (error) {
    if (closed) return;
    if (error?.message === 'crypto-unavailable') refuse('この試作は、資料を確かめるために安全な（https の）アドレスが必要です。',
      'This preview needs a secure (https) address to check its sources.');
    else refuse('道のりを読み込めませんでした。戻って、もう一度お試しください。', 'The passage could not load. Go back and try again.');
    return;
  }
  if (closed) return;
  if (!here()) { close(false); return; }
  const unavailable = () => refuse('道のりを読み込めませんでした。戻って、もう一度お試しください。', 'The passage could not load. Go back and try again.');
  if (!liveOwner()) { unavailable(); return; }
  const { passage, route } = sources;
  // the place kept on this page resumes exactly; anything else begins a new walk
  let resumed = false;
  if (ride?.held && ride.node === node) {
    resumed = passage.resumePassage(ride.page, ride.held, owner).ok;
    if (resumed) ride.held = null;
  }
  if (!resumed) {
    dropRide();
    carried = carriedFrom(node);
    if (carried && !sources.world.readWorldOwner(owner).ok) carried = null; // the model refused it: walk without
    const made = passage.createPassage(owner, route, { motion: media?.matches ? 'reduced' : 'full' });
    if (!made.ok) { unavailable(); return; }
    ride = { page: made.value, node, held: null };
  }
  media?.addEventListener('change', onMotion);
  onMotion();
  paint();
}

globalThis.__KAIRO_PASSAGE__ = Object.freeze({ mountDoor });
