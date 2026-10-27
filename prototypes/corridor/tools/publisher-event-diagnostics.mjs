// Diagnostic-only event-delivery recorder for the silent "open saved context" (1830/1834), used by
// verify-publisher-reading in KAIRO_PUBLISHER_EVENT_DIAGNOSTICS=1 mode. installEventDiagnostics runs as an init
// script before any app script: private per-node ids (a WeakMap, shared with the source probes as
// window.__diagId), window capture listeners registered before the app's and bubble listeners after the target,
// every stopPropagation/stopImmediatePropagation/preventDefault on press and click events (the original is always
// called), and a MutationObserver on the document itself. It never prevents, stops, dispatches, focuses, selects
// or awaits anything; a failure inside the recorder sets a durable fault and stops recording, and the original method
// still runs exactly once. Each event object gets a private id shared by all of its rows. openSnapshot reads the Open
// button's state at action time. classifyOpen is pure and gives INCONCLUSIVE whenever the evidence is missing,
// truncated, faulted, unreadable, ambiguous or from another document.
//
// EV3 (lead 1933, W2 1937, addendum 1945) adds pressGeometry: one structured read of the five live nodes (Open, Save, its
// save row, the save menu, main) and the source-verified surfaces around them. Fixed read order (GEOMETRY_ORDER): the
// scalars first (time, scroll, visualViewport, activeElement), then per node in GEOMETRY_NODES order its rect, offset
// chain, computed position/transform/translate/scale and own animations, then the surfaces' rects, then the document's
// animations. On a relevant pointerdown/mousedown capture row: geometry before the hit, the existing hit read once, and
// geometry after it, so a difference inside the read is visible instead of assumed away. Bubble rows carry a
// phase-labelled sample without a hit read. Load-time window and html capture brackets, armed approach samples and armed
// scroll/transition/animation rows (all bounded) add timing around the press; a missing bracket row stays unknown. These
// are ordinary DOM reads and can flush layout: that observer effect is a stated limit, not excluded. A failing geometry
// getter marks only its sample; the event and the rest of the recorder are untouched. The classifier takes the action
// document's own trace (recorder, source probes and version read together in that document before anything later can
// replace it, W2 1928) and reports geometry differences between consecutive samples without naming a cause.

import { EVENT_PROBE_VERSION } from './publisher-context-probes.mjs';

export const EVENT_RECORDER_VERSION = 'publisher-event-diagnostics/4';
export const GEOMETRY_NODES = ['open', 'save', 'actions', 'menu', 'main'];
export const GEOMETRY_SURFACES = ['prompt', 'quote', 'timed', 'status', 'sealStrip', 'mini', 'readerLayers', 'layersMark'];
export const GEOMETRY_ORDER = ['time', 'scroll', 'visualViewport', 'activeElement',
  ...GEOMETRY_NODES.map((name) => `${name}:rect,offsets,style,animations`), 'surfaces:rect', 'ladder:rect', 'extra:rect', 'documentAnimations'];
export const MUTATION_LIMITS = Object.freeze({ rows: 128, nodesPerRow: 8, field: 240, ladderDetails: 4, extraRects: 8 });
const GEOMETRY_REQUIRED = ['open', 'save', 'actions', 'main'];

export function installEventDiagnostics(win, cap = 5000) {
  if (win.__evDiag) return;
  const ids = new WeakMap();
  let next = 0;
  const idOf = (node) => {
    if (!node || (typeof node !== 'object' && typeof node !== 'function')) return null;
    if (!ids.has(node)) ids.set(node, ++next);
    return ids.get(node);
  };
  // one private id per event object, shared by its capture, bubble and stop/prevent rows and the Open listener entry
  const eventIds = new WeakMap();
  let nextEvent = 0;
  const eventIdOf = (event) => {
    if (!event || typeof event !== 'object') return null;
    if (!eventIds.has(event)) eventIds.set(event, ++nextEvent);
    return eventIds.get(event);
  };
  win.__diagId = idOf;
  win.__diagEventId = eventIdOf;
  const state = { version: 'publisher-event-diagnostics/4', docId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    cap, truncated: false, fault: null, rows: [] };
  win.__evDiag = state;
  // a failure inside the recorder sets one durable fault (no clock, no row) and stops all further recording; it never
  // reaches the page, and never prevents or repeats the original method
  const fail = (where, error) => { if (!state.fault) state.fault = { where, message: String((error && error.message) || error) }; };
  const now = () => win.performance.now();
  const add = (row) => {
    if (state.fault) return;
    if (state.rows.length >= cap) { state.truncated = true; return; }
    state.rows.push({ now: now(), ...row });
  };
  const guarded = (where, fn) => (...args) => {
    if (state.fault) return;
    try { fn(...args); } catch (error) { fail(where, error); }
  };
  const describe = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node === win) return 'window';
    if (node.nodeType === 9) return 'document';
    if (node.nodeType !== 1) return `node:${node.nodeType}`;
    const cls = typeof node.className === 'string' && node.className.trim() ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${String(node.tagName).toLowerCase()}${node.id ? `#${node.id}` : ''}${cls}${node.isConnected === false ? ' (detached)' : ''}`;
  };
  const ref = (node) => [idOf(node), describe(node)];
  const OPEN = '[id$="-context-open"]', SECTION = '.publisher-context-selection';
  const doc = () => win.document;
  const openButtons = () => Array.from(doc()?.querySelectorAll?.(OPEN) || []);
  const chain = (node) => {
    const out = [];
    for (let n = node, depth = 0; n && n.nodeType === 1 && depth < 12; n = n.parentElement, depth += 1) {
      const style = win.getComputedStyle ? win.getComputedStyle(n) : null;
      out.push({ node: ref(n), disabled: !!n.disabled, inert: !!n.inert, ariaDisabled: n.getAttribute?.('aria-disabled') ?? null,
        pointerEvents: style?.pointerEvents ?? null, visibility: style?.visibility ?? null, display: style?.display ?? null });
    }
    return out;
  };
  const openInfo = (node) => {
    const button = node?.closest?.(OPEN);
    if (!button) return null;
    return { node: ref(button), connected: button.isConnected, disabled: !!button.disabled,
      current: doc()?.getElementById?.(button.id) === button, duplicates: openButtons().length };
  };
  const relevant = (node) => !!(node?.closest?.(OPEN) || node?.closest?.(SECTION));
  // pressGeometry (W2 1937 + addendum 1945): these constants repeat the module's exported ones because this function
  // runs as page source. Scalars (time, scroll, visual viewport, focus) are read before any layout getter.
  const NODE_NAMES = ['open', 'save', 'actions', 'menu', 'main'];
  const SURFACE_NAMES = ['prompt', 'quote', 'timed', 'status', 'sealStrip', 'mini', 'readerLayers', 'layersMark'];
  const ORDER = ['time', 'scroll', 'visualViewport', 'activeElement',
    ...NODE_NAMES.map((name) => `${name}:rect,offsets,style,animations`), 'surfaces:rect', 'ladder:rect', 'extra:rect', 'documentAnimations'];
  // EV4 (W2 2037): bounded mutation stream; these repeat MUTATION_LIMITS for the same page-source reason
  const MUTATION_ROWS = 128, NODES_PER_ROW = 8, FIELD = 240, LADDER_DETAILS = 4, EXTRA_RECTS = 8;
  // EV4 references keep the private numeric id (so rows still join) and bound only the description (W2 EV4-R1)
  const bref = (node, flags) => {
    const [id, text] = ref(node);
    if (typeof text === 'string' && text.length > FIELD) { flags.truncated = true; return [id, text.slice(0, FIELD)]; }
    return [id, text];
  };
  const GEOMETRY_CAP = 200, ANIMATION_CAP = 16, OFFSET_DEPTH = 10, APPROACH_CAP = 24, ARMED_ROW_CAP = 64, MENU = 'vocabulary-list-popover';
  let geometrySeq = 0, armed = false, approachRows = 0, armedRows = 0;
  Object.assign(state, { geometryTruncated: false, approachTruncated: false, armedRowsTruncated: false });
  const rectOf = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const offsetsOf = (node, bounded, name) => {
    const out = [];
    for (let n = node, depth = 0; n; n = n.offsetParent, depth += 1) {
      if (depth >= OFFSET_DEPTH) { bounded.push(`offsets:${name}`); break; }
      out.push({ node: ref(n), top: n.offsetTop, left: n.offsetLeft, width: n.offsetWidth, height: n.offsetHeight });
    }
    return out;
  };
  const styleOf = (node) => {
    const style = win.getComputedStyle(node);
    return { position: style.position, transform: style.transform, translate: style.translate ?? null, scale: style.scale ?? null };
  };
  const animationsOf = (list, bounded, label) => {
    if (list.length > ANIMATION_CAP) bounded.push(label);
    return list.slice(0, ANIMATION_CAP).map((a) => ({ id: idOf(a), kind: a.constructor?.name ?? null,
      name: a.animationName ?? a.transitionProperty ?? (a.id || null), target: ref(a.effect?.target ?? null),
      pseudo: a.effect?.pseudoElement ?? null, currentTime: a.currentTime ?? null, playState: a.playState ?? null }));
  };
  // identities only (no layout): the one live Open, its Save, its save row, the one save menu, main, and the
  // source-verified surfaces around them (corridor.js C:24482-24487 section children, C:13437, C:11779, C:16140, C:16189)
  const geometryNodes = () => {
    const opens = openButtons();
    const menus = Array.from(doc().querySelectorAll(`[id="${MENU}"]`));
    const open = opens.length === 1 ? opens[0] : null;
    const prefix = open ? open.id.replace(/-context-open$/u, '') : null;
    const section = open?.closest(SECTION) ?? null;
    const byId = (id) => doc().getElementById(id);
    return {
      ambiguous: [...(opens.length > 1 ? ['open'] : []), ...(menus.length > 1 ? ['menu'] : [])],
      nodes: { open, save: prefix ? byId(`${prefix}-context-save`) : null, actions: open?.closest('[data-save-row]') ?? null,
        menu: menus.length === 1 ? menus[0] : null, main: open?.closest('main') ?? null },
      surfaces: { prompt: section?.querySelector(':scope > p.teacher-note:not([role="status"])') ?? null,
        quote: section?.querySelector(':scope > .teacher-source-quote') ?? null, timed: prefix ? byId(`${prefix}-selection-time`) : null,
        status: prefix ? byId(`${prefix}-context-status`) : null, sealStrip: byId('seal-strip'), mini: byId('mini'),
        readerLayers: byId('reader-layers'), layersMark: byId('layers-mark') },
    };
  };
  // the last rect each node had while it was connected and measured, with when and in which sample: a removed node's
  // history is this cached value, never a detached node's zero rect
  const lastLive = new WeakMap();
  const liveRect = (node, sample) => {
    const rect = rectOf(node);
    lastLive.set(node, { rect, t: now(), sample: sample.seq });
    return rect;
  };
  // source-verified ladder and body observables (corridor.js C:8877/8655 body, C:10164/10171/10176 rungs,
  // C:9767-9776 gloss rows, C:9731-9745 readings); counts beyond the detail cap are marked partial
  const ladderOf = (sample) => {
    const body = doc().getElementById('publisher-body') || doc().getElementById('source-reader-body');
    if (!body) return { body: null };
    const flags = { truncated: false };
    const detail = (selector, extra) => {
      const all = Array.from(body.querySelectorAll(selector));
      return { count: all.length, partial: all.length > LADDER_DETAILS,
        details: all.slice(0, LADDER_DETAILS).map((node) => ({ node: bref(node, flags), connected: node.isConnected, ...extra(node), rect: liveRect(node, sample) })) };
    };
    const rungOf = (node) => { const value = node.getAttribute('data-ladder-rung'); return value === null ? null : clip(value, flags); };
    const out = {
      body: { node: bref(body, flags), id: clip(body.id, flags), rect: liveRect(body, sample) },
      rungs: detail('[data-ladder-rung]', (node) => ({ rung: rungOf(node) })),
      gloss: detail('.tok-en', (node) => ({ wait: node.classList.contains('tok-en-wait'), miss: node.classList.contains('tok-en-miss') })),
      ruby: detail('ruby[data-r]', () => ({})),
      visibleReadings: body.querySelectorAll('rt:not(.hidden-rt)').length,
      glossedWords: body.querySelectorAll('.has-en').length,
    };
    if (flags.truncated) sample.bounded.push('ladder-metadata');
    return out;
  };
  const sampleGeometry = (label, extra = []) => {
    if (geometrySeq >= GEOMETRY_CAP) { state.geometryTruncated = true; return { label, truncated: true }; }
    const sample = { seq: ++geometrySeq, label, t0: now(), order: ORDER, bounded: [], error: null };
    try {
      sample.scroll = { x: win.scrollX, y: win.scrollY };
      const vv = win.visualViewport;
      sample.visualViewport = vv ? { offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop, pageLeft: vv.pageLeft, pageTop: vv.pageTop,
        width: vv.width, height: vv.height, scale: vv.scale } : null;
      sample.active = ref(doc().activeElement);
      const { nodes, surfaces, ambiguous } = geometryNodes();
      sample.ambiguous = ambiguous;
      sample.nodes = {};
      for (const name of NODE_NAMES) {
        const node = nodes[name];
        sample.nodes[name] = node ? { node: ref(node), connected: node.isConnected,
          ...(name === 'menu' ? { classes: String(node.className).slice(0, 240) } : {}),
          rect: rectOf(node), offsets: offsetsOf(node, sample.bounded, name), style: styleOf(node),
          animations: animationsOf(node.getAnimations ? node.getAnimations() : [], sample.bounded, `animations:${name}`) } : null;
      }
      sample.surfaces = {};
      for (const name of SURFACE_NAMES) {
        const node = surfaces[name];
        sample.surfaces[name] = node ? { node: ref(node), connected: node.isConnected, hidden: !!node.hidden, rect: rectOf(node) } : null;
      }
      sample.ladder = ladderOf(sample);
      if (extra.length > EXTRA_RECTS) sample.bounded.push('extra');
      const extraFlags = { truncated: false };
      sample.extra = extra.slice(0, EXTRA_RECTS).map((node) => ({ node: bref(node, extraFlags), connected: node.isConnected,
        rect: node.isConnected ? liveRect(node, sample) : null }));
      if (extraFlags.truncated) sample.bounded.push('extra-metadata');
      sample.documentAnimations = animationsOf(doc().getAnimations ? doc().getAnimations() : [], sample.bounded, 'animations:document');
    } catch (error) { sample.error = String((error && error.message) || error); }
    sample.t1 = now();
    return sample;
  };
  const hitAt = (event) => {
    const at = typeof event.clientX === 'number' && doc()?.elementFromPoint ? doc().elementFromPoint(event.clientX, event.clientY) : null;
    return at ? { node: ref(at), open: openInfo(at) } : null;
  };
  win.__evDiagGeometry = (label) => (state.fault ? null : sampleGeometry(String(label)));
  // the action arms approach, scroll and style rows between its two snapshots (openSnapshot 'pre' arms, 'post' disarms)
  /* EV4 mutation stream: main's subtree, kept only for targets that precede the selection section or contain it. A row is
   * delivery-time metadata: the record's own target and previous/next siblings (retained context, so a removed node keeps
   * its place without asking a detached node for its order), oldValue for attributes (historical), current values read
   * at delivery (not the mutation's own time), text lengths only. Scroll is read first, then at most one geometry sample
   * per callback batch, which measures up to EXTRA_RECTS connected added nodes. A mutation's delivery is not its time
   * and not its handler; these reads can themselves settle layout. */
  let stream = null, binding = null, mutationSeq = 0, batchSeq = 0;
  Object.assign(state, { binding: null, mutationTruncated: false, mutationFault: null, mutationSkipped: 0 });
  const clip = (value, flags) => {
    const text = String(value ?? '');
    if (text.length <= FIELD) return text;
    flags.truncated = true;
    return text.slice(0, FIELD);
  };
  const nodeMeta = (node, flags) => {
    if (!node) return null;
    if (node.nodeType === 1) return { node: bref(node, flags), kind: 'element', tag: clip(String(node.tagName).toLowerCase(), flags), id: clip(node.id, flags),
      classes: clip(typeof node.className === 'string' ? node.className : '', flags), connected: node.isConnected };
    if (node.nodeType === 3) return { node: bref(node, flags), kind: 'text', length: String(node.data ?? '').length, connected: node.isConnected };
    return { node: bref(node, flags), kind: `node:${node.nodeType}`, connected: node.isConnected };
  };
  const relationOf = (target) => {
    if (!target.isConnected) return 'detached'; // never compareDocumentPosition on a detached node
    if (target === binding.section || binding.section.contains(target)) return 'inside-section';
    if (target.contains(binding.section)) return 'ancestor';
    const position = binding.section.compareDocumentPosition(target);
    return position & 2 ? 'preceding' : position & 4 ? 'following' : 'unknown';
  };
  const bindingValid = () => !!binding && binding.main.isConnected && binding.section.isConnected && binding.main.contains(binding.section) &&
    win.__evDiag === state;
  const invalidate = (why) => {
    if (!binding || state.binding.invalidated) return;
    state.binding.invalidated = { why, at: now() };
    add({ id: 'binding-invalidated', why });
  };
  const onMutations = (records) => {
    if (!binding || state.mutationFault || !records.length) return;
    try {
      const t = now(), batch = ++batchSeq;
      const scroll = { x: win.scrollX, y: win.scrollY }; // scalar, before any geometry
      if (!bindingValid()) invalidate('main or section replaced');
      const added = [];
      for (const record of records) {
        const target = record.target;
        const relation = state.binding.invalidated ? 'unbound' : relationOf(target);
        const retained = relation === 'detached' && record.type === 'childList';
        if (!['preceding', 'ancestor', 'detached', 'unbound'].includes(relation)) { state.mutationSkipped += 1; continue; }
        if (mutationSeq >= MUTATION_ROWS) { state.mutationTruncated = true; continue; }
        const flags = { truncated: false };
        const row = { id: 'mutation', seq: ++mutationSeq, batch, delivered: t, type: record.type, target: nodeMeta(target, flags),
          relation, relationAt: 'delivery', retainedContext: retained,
          previous: bref(record.previousSibling ?? null, flags), next: bref(record.nextSibling ?? null, flags) };
        if (record.type === 'attributes') {
          row.attribute = record.attributeName;
          row.oldValue = record.oldValue == null ? null : clip(record.oldValue, flags); // historical
          const value = target.getAttribute ? target.getAttribute(record.attributeName) : null;
          row.valueAtDelivery = value === null ? null : clip(value, flags); // absent stays null, present-empty stays ''
        } else if (record.type === 'characterData') {
          row.lengthAtDelivery = String(target.data ?? '').length; // no raw text
        } else {
          const ad = Array.from(record.addedNodes || []), rm = Array.from(record.removedNodes || []);
          row.addedCount = ad.length; row.removedCount = rm.length;
          row.added = ad.slice(0, NODES_PER_ROW).map((node) => nodeMeta(node, flags));
          row.removed = rm.slice(0, NODES_PER_ROW).map((node) => ({ ...nodeMeta(node, flags), rectAtDelivery: null,
            lastLiveRect: lastLive.get(node) ?? null }));
          if (ad.length > NODES_PER_ROW || rm.length > NODES_PER_ROW) flags.truncated = true;
          for (const node of ad) if (node.nodeType === 1 && node.isConnected && added.length < EXTRA_RECTS + 1) added.push(node);
        }
        row.truncated = flags.truncated;
        add(row);
      }
      add({ id: 'mutation-batch', batch, delivered: t, records: records.length, scroll, geometry: sampleGeometry('mutation-batch', added) });
    } catch (error) {
      state.mutationFault = String((error && error.message) || error);
      try { stream?.disconnect(); } catch { /* the fault is already recorded */ }
    }
  };
  // one binding per document, made at its first arm (the action); a later arm in the same document keeps it
  const bind = () => {
    const opens = openButtons();
    const section = opens.length === 1 ? opens[0].closest(SECTION) : null;
    const main = section?.closest('main') ?? null;
    if (!section || !main) { add({ id: 'binding-missing', open: opens.length }); return; }
    binding = { main, section };
    const flags = { truncated: false };
    state.binding = { docId: state.docId, main: bref(main, flags), section: bref(section, flags), at: now(), invalidated: null, truncated: flags.truncated };
    if (typeof win.MutationObserver !== 'function') { state.mutationFault = 'no MutationObserver'; return; }
    stream = new win.MutationObserver(onMutations);
    stream.observe(main, { childList: true, subtree: true, characterData: true, attributes: true, attributeOldValue: true,
      attributeFilter: ['class', 'hidden', 'style', 'data-ladder-rung', 'data-depth-aside', 'aria-hidden'] });
  };
  const unbind = () => {
    if (!stream) return;
    try { onMutations(stream.takeRecords()); } finally { stream.disconnect(); stream = null; }
    if (binding && !bindingValid()) invalidate('main or section replaced');
  };
  win.__evDiagArm = guarded('arm', (on) => {
    armed = on === true;
    if (armed) { approachRows = 0; armedRows = 0; }
    add({ id: 'arm', on: armed });
    if (armed && !binding) bind();
    else if (!armed) unbind();
  });
  const GEOMETRY_TYPES = ['pointerdown', 'mousedown'];
  const TYPES = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'pointercancel', 'touchstart', 'touchend'];
  const listen = (phase) => (event) => {
    const target = event.target;
    const row = { id: phase, event: eventIdOf(event), t: event.timeStamp, type: event.type, trusted: event.isTrusted, button: event.button ?? null,
      pointerType: event.pointerType ?? null, x: event.clientX ?? null, y: event.clientY ?? null, target: ref(target),
      defaultPrevented: event.defaultPrevented, cancelBubble: event.cancelBubble, open: openInfo(target) };
    const geometry = GEOMETRY_TYPES.includes(event.type) && relevant(target);
    if (phase === 'capture') {
      row.path = (event.composedPath?.() || []).slice(0, 14).map(ref);
      if (relevant(target) || event.type === 'click') {
        if (geometry) row.geometry = sampleGeometry(`${event.type}:capture:beforeHit`);
        row.hit = hitAt(event);
        if (geometry) row.afterHit = sampleGeometry(`${event.type}:capture:afterHit`);
        const live = openButtons();
        row.live = live.map(ref);
        row.chain = live.length ? chain(live[live.length - 1]) : [];
      }
    } else if (geometry) row.geometry = sampleGeometry(`${event.type}:bubble`);
    add(row);
  };
  for (const type of TYPES) {
    win.addEventListener(type, guarded('capture', listen('capture')), true);
    win.addEventListener(type, guarded('bubble', listen('bubble')), false);
  }
  // group brackets: a window capture listener registered at load (after the listeners the app registered by then) and a
  // capture listener on the html element (after every document capture listener, when propagation reaches it)
  const bracket = (where) => guarded(`bracket:${where}`, (event) => {
    if (!GEOMETRY_TYPES.includes(event.type) || !relevant(event.target)) return;
    const path = event.composedPath?.() || [];
    add({ id: 'bracket', where, event: eventIdOf(event), t: event.timeStamp, type: event.type, trusted: event.isTrusted, docId: state.docId,
      phase: event.eventPhase, current: ref(event.currentTarget), target: ref(event.target), pathHasHtml: path.includes(doc().documentElement),
      geometry: sampleGeometry(`${event.type}:${where}`) });
  });
  const registerBracket = (where, node, stage) => {
    for (const type of GEOMETRY_TYPES) node.addEventListener(type, bracket(where), true);
    add({ id: 'bracket-registered', where, stage, docId: state.docId });
  };
  win.addEventListener('load', guarded('bracket:load', () => registerBracket('window-late', win, 'load')));
  const registerHtml = guarded('bracket:html', (stage) => { if (doc()?.documentElement) registerBracket('html', doc().documentElement, stage); });
  if (doc()?.documentElement) registerHtml('install');
  else win.addEventListener('DOMContentLoaded', () => registerHtml('domcontentloaded'));
  // approach (Playwright moves to the point before pressing) and armed scroll/transition/animation rows, all bounded
  for (const type of ['pointerover', 'pointermove', 'mouseover', 'mousemove']) {
    win.addEventListener(type, guarded('approach', (event) => {
      if (!armed) return;
      if (approachRows >= APPROACH_CAP) { state.approachTruncated = true; return; }
      approachRows += 1;
      add({ id: 'approach', event: eventIdOf(event), t: event.timeStamp, type: event.type, trusted: event.isTrusted, x: event.clientX ?? null,
        y: event.clientY ?? null, target: ref(event.target), related: ref(event.relatedTarget ?? null), geometry: sampleGeometry(`${event.type}:approach`) });
    }), true);
  }
  const armedRow = (row) => {
    if (!armed) return;
    if (armedRows >= ARMED_ROW_CAP) { state.armedRowsTruncated = true; return; }
    armedRows += 1;
    add(row);
  };
  win.addEventListener('scroll', guarded('scroll', (event) => armedRow({ id: 'scroll', t: event.timeStamp, target: ref(event.target),
    scroll: { x: win.scrollX, y: win.scrollY } })), true);
  for (const type of ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel', 'animationstart', 'animationiteration', 'animationend', 'animationcancel']) {
    win.addEventListener(type, guarded('style-event', (event) => armedRow({ id: 'style-event', type: event.type, t: event.timeStamp, target: ref(event.target),
      name: event.propertyName ?? event.animationName ?? null, pseudo: event.pseudoElement || null, elapsed: event.elapsedTime ?? null })), true);
  }
  const stack = () => String(new Error().stack || '').split('\n').slice(2, 9).map((line) => line.trim());
  for (const method of ['stopPropagation', 'stopImmediatePropagation', 'preventDefault']) {
    const original = win.Event.prototype[method];
    win.Event.prototype[method] = function observed(...args) {
      if (!state.fault) {
        try {
          if (TYPES.includes(this.type))
            add({ id: method, event: eventIdOf(this), t: this.timeStamp, type: this.type, target: ref(this.target), current: ref(this.currentTarget),
              phase: this.eventPhase, stack: stack() });
        } catch (error) { fail(method, error); }
      }
      // the original, exactly once, with the same receiver and arguments; its return value or exception is the caller's
      return original.apply(this, args);
    };
  }
  win.addEventListener('error', guarded('error', (event) => add({ id: 'error', message: String(event.message || event.error?.message || '') })));
  win.addEventListener('unhandledrejection', guarded('unhandledrejection', (event) => add({ id: 'unhandledrejection', message: String(event.reason?.message || event.reason || '') })));
  for (const type of ['pagehide', 'beforeunload', 'visibilitychange']) win.addEventListener(type, guarded(type, () => add({ id: type, visibility: doc()?.visibilityState ?? null })));
  if (typeof win.MutationObserver === 'function' && doc()) {
    const watched = (node) => node?.nodeType === 1 && (node.matches?.(`${OPEN},${SECTION}`) || !!node.querySelector?.(`${OPEN},${SECTION}`));
    const opensIn = (node) => (node.matches?.(OPEN) ? [node] : Array.from(node.querySelectorAll?.(OPEN) || [])).map(ref);
    new win.MutationObserver(guarded('mutation', (list) => {
      for (const m of list) {
        if (m.type === 'childList') {
          for (const n of m.removedNodes) if (watched(n)) add({ id: 'removed', node: ref(n), parent: ref(m.target), opens: opensIn(n) });
          for (const n of m.addedNodes) if (watched(n)) add({ id: 'added', node: ref(n), parent: ref(m.target), opens: opensIn(n) });
        } else if (openButtons().some((button) => button === m.target || m.target.contains?.(button))) {
          add({ id: 'attribute', node: ref(m.target), name: m.attributeName, value: m.target.getAttribute?.(m.attributeName) ?? null });
        }
      }
    })).observe(doc(), { childList: true, subtree: true, attributes: true,
      attributeFilter: ['disabled', 'inert', 'hidden', 'style', 'class', 'aria-hidden', 'aria-busy', 'aria-expanded'] });
  }
  guarded('install', () => add({ id: 'install', docId: state.docId, url: String(win.location?.href || '') }))();
}

/** Page function (page.evaluate(openSnapshot, 'pre' | 'post')): the Open button's state at action time, read only. The
 * pre read arms the recorder's approach/scroll/style rows after its own reads; the post read disarms them after its own. */
export function openSnapshot(phase = null) {
  const idOf = window.__diagId || (() => null);
  const describe = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node === window) return 'window';
    if (node.nodeType === 9) return 'document';
    if (node.nodeType !== 1) return `node:${node.nodeType}`;
    const cls = typeof node.className === 'string' && node.className.trim() ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${String(node.tagName).toLowerCase()}${node.id ? `#${node.id}` : ''}${cls}${node.isConnected === false ? ' (detached)' : ''}`;
  };
  const ref = (node) => [idOf(node), describe(node)];
  const chain = [];
  const button = document.getElementById('publisher-context-open');
  for (let n = button, depth = 0; n && n.nodeType === 1 && depth < 12; n = n.parentElement, depth += 1) {
    const style = getComputedStyle(n);
    chain.push({ node: ref(n), disabled: !!n.disabled, inert: !!n.inert, ariaDisabled: n.getAttribute('aria-disabled'),
      pointerEvents: style.pointerEvents, visibility: style.visibility, display: style.display });
  }
  const box = button?.getBoundingClientRect();
  const center = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  const hit = center ? document.elementFromPoint(center.x, center.y) : null;
  const snapshot = {
    now: performance.now(), docId: window.__evDiag?.docId ?? null,
    live: Array.from(document.querySelectorAll('[id$="-context-open"]')).map(ref), byId: button ? ref(button) : null,
    rect: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null, center,
    hit: hit ? ref(hit) : null, hitInside: !!(hit && button && button.contains(hit)), disabled: !!button?.disabled, chain,
    active: ref(document.activeElement), expanded: Array.from(document.querySelectorAll('[aria-expanded="true"]')).map(ref),
    dialogs: Array.from(document.querySelectorAll('dialog[open],[role="dialog"]')).map(ref),
    selection: String(window.getSelection?.() || '').slice(0, 80), scrollY: window.scrollY,
  };
  // EV3: read after the fields above, so their order and values are the EV2 ones
  snapshot.phase = phase;
  snapshot.geometry = typeof window.__evDiagGeometry === 'function' ? window.__evDiagGeometry(`snapshot:${phase}`) : null;
  if (typeof window.__evDiagArm === 'function' && (phase === 'pre' || phase === 'post')) window.__evDiagArm(phase === 'pre');
  return snapshot;
}

/* pressGeometry facts (pure). A sample is usable only when it is complete: not truncated, no failed or bounded read,
 * no ambiguous node, the documented read order, and the four required nodes present and connected (the menu is
 * recorded when present; its absence is a fact, not a fault). Differences are reported between consecutive samples
 * as numbers and a plain description of what changed (scroll, layout, both, none); none of it names a cause. */
const GEOMETRY_STYLE = ['position', 'transform', 'translate', 'scale'];
const VIEWPORT_KEYS = ['offsetLeft', 'offsetTop', 'pageLeft', 'pageTop', 'width', 'height', 'scale'];
const delta = (from, to) => (typeof from === 'number' && typeof to === 'number' ? to - from : null);
function sampleProblems(label, sample) {
  if (!sample) return [`${label}: no geometry sample`];
  if (sample.truncated) return [`${label}: the geometry sample was truncated`];
  const out = [];
  if (sample.error) out.push(`${label}: a geometry read failed (${sample.error})`);
  if (sample.bounded?.length) out.push(`${label}: geometry was bounded (${sample.bounded.join(', ')})`);
  if (sample.ambiguous?.length) out.push(`${label}: ambiguous ${sample.ambiguous.join(', ')}`);
  if (!Array.isArray(sample.order) || sample.order.join('|') !== GEOMETRY_ORDER.join('|')) out.push(`${label}: the geometry read order differs`);
  if (!sample.scroll || typeof sample.seq !== 'number' || !sample.nodes || !sample.surfaces) out.push(`${label}: the geometry sample is incomplete`);
  for (const name of GEOMETRY_REQUIRED) {
    const node = sample.nodes?.[name];
    if (!node) out.push(`${label}: ${name} is missing`);
    else if (node.connected !== true) out.push(`${label}: ${name} is disconnected`);
  }
  return out;
}
const animationKey = (list) => JSON.stringify((list || []).map((a) => [a.id, a.playState, a.currentTime]));
const offsetKey = (node) => JSON.stringify((node.offsets || []).map((o) => [o.node?.[0] ?? null, o.top, o.left, o.width, o.height]));
export function diffGeometry(fromLabel, a, toLabel, b) {
  const scroll = { dx: delta(a.scroll.x, b.scroll.x), dy: delta(a.scroll.y, b.scroll.y) };
  const visualViewport = VIEWPORT_KEYS.filter((key) => (a.visualViewport?.[key] ?? null) !== (b.visualViewport?.[key] ?? null));
  const placed = (p, q) => ({
    sameNode: p.node?.[0] === q.node?.[0],
    viewport: { dx: delta(p.rect.x, q.rect.x), dy: delta(p.rect.y, q.rect.y), dw: delta(p.rect.width, q.rect.width), dh: delta(p.rect.height, q.rect.height) },
    document: { dx: delta(p.rect.x + a.scroll.x, q.rect.x + b.scroll.x), dy: delta(p.rect.y + a.scroll.y, q.rect.y + b.scroll.y) },
    connectedChanged: p.connected !== q.connected,
  });
  const presence = (p, q) => (p ? 'disappeared' : q ? 'appeared' : 'absent');
  const nodes = {};
  for (const name of GEOMETRY_NODES) {
    const p = a.nodes?.[name] ?? null, q = b.nodes?.[name] ?? null;
    if (!p || !q) { nodes[name] = { presence: presence(p, q) }; continue; }
    nodes[name] = { presence: 'present', ...placed(p, q),
      offsetsChanged: offsetKey(p) !== offsetKey(q),
      styleChanged: GEOMETRY_STYLE.filter((key) => (p.style?.[key] ?? null) !== (q.style?.[key] ?? null)),
      ...(name === 'menu' ? { classesChanged: p.classes !== q.classes } : {}),
      animationsChanged: animationKey(p.animations) !== animationKey(q.animations) };
  }
  const surfaces = {};
  for (const name of GEOMETRY_SURFACES) {
    const p = a.surfaces?.[name] ?? null, q = b.surfaces?.[name] ?? null;
    surfaces[name] = !p || !q ? { presence: presence(p, q) } : { presence: 'present', ...placed(p, q), hiddenChanged: p.hidden !== q.hidden };
  }
  const moved = (n) => n.presence === 'appeared' || n.presence === 'disappeared' || (n.presence === 'present' && (!n.sameNode ||
    n.document.dx !== 0 || n.document.dy !== 0 || n.viewport.dw !== 0 || n.viewport.dh !== 0 || n.connectedChanged ||
    n.offsetsChanged === true || n.styleChanged?.length > 0 || n.classesChanged === true || n.hiddenChanged === true));
  const documentAnimationsChanged = animationKey(a.documentAnimations) !== animationKey(b.documentAnimations);
  const scrolled = scroll.dx !== 0 || scroll.dy !== 0 || visualViewport.length > 0;
  const layout = Object.values(nodes).some(moved) || Object.values(surfaces).some(moved);
  const animation = documentAnimationsChanged || Object.values(nodes).some((n) => n.animationsChanged === true);
  return { from: fromLabel, to: toLabel, dt: delta(a.t0, b.t0), scroll, visualViewport, activeChanged: a.active?.[0] !== b.active?.[0],
    nodes, surfaces, documentAnimationsChanged, scrolled, layout, animation,
    observed: scrolled && layout ? 'scroll+layout' : scrolled ? 'scroll' : layout ? 'layout' : 'none' };
}
/** The press's geometry: the one trusted pointerdown and mousedown in the action interval (their before-hit and
 * after-hit capture samples and bubble samples, which are required), their load-time window and html brackets (optional:
 * a missing or unusable bracket is listed as unknown), and the two snapshots, in sampling order. INCONCLUSIVE when any
 * required sample is unusable or out of order. Approach, scroll and style rows are listed with their own overflow flags. */
export function pressGeometry({ rows, from, to, pre, post, recorder = {} }) {
  const inAction = rows.filter((row) => row.now >= from && row.now <= to);
  const capture = (type) => inAction.filter((row) => row.id === 'capture' && row.type === type && row.trusted === true);
  const pointerdown = capture('pointerdown'), mousedown = capture('mousedown');
  const reasons = [];
  if (recorder.geometryTruncated) reasons.push('geometry samples were truncated');
  if (recorder.binding?.invalidated) reasons.push(`the main/section binding was invalidated (${recorder.binding.invalidated.why})`);
  if (pointerdown.length !== 1) reasons.push(`${pointerdown.length} trusted pointerdown candidates in the action interval`);
  if (mousedown.length !== 1) reasons.push(`${mousedown.length} trusted mousedown candidates in the action interval`);
  if (reasons.length) return { verdict: 'INCONCLUSIVE', reasons, steps: null };
  const required = [['pre', pre?.geometry ?? null]];
  const optional = [];
  const unknown = [];
  for (const [type, row] of [['pointerdown', pointerdown[0]], ['mousedown', mousedown[0]]]) {
    const bubble = rows.find((other) => other.id === 'bubble' && other.event === row.event) || null;
    required.push([`${type}:capture:beforeHit`, row.geometry ?? null], [`${type}:capture:afterHit`, row.afterHit ?? null]);
    for (const where of ['window-late', 'html']) {
      const found = rows.filter((other) => other.id === 'bracket' && other.where === where && other.event === row.event);
      const problems = found.length === 1 ? sampleProblems(`${type}:${where}`, found[0].geometry) : [`${type}:${where}: ${found.length} bracket rows`];
      if (problems.length) unknown.push(...problems);
      else optional.push([`${type}:${where}`, found[0].geometry, row.afterHit?.seq, bubble?.geometry?.seq]);
    }
    required.push([`${type}:bubble`, bubble?.geometry ?? null]);
  }
  required.push(['post', post?.geometry ?? null]);
  for (const [label, sample] of required) reasons.push(...sampleProblems(label, sample));
  if (!reasons.length && required.some(([, sample], i) => i > 0 && sample.seq <= required[i - 1][1].seq)) reasons.push('geometry samples are out of sampling order');
  if (reasons.length) return { verdict: 'INCONCLUSIVE', reasons, steps: null };
  // a bracket belongs between its event's after-hit sample and its bubble sample
  const placedBrackets = optional.filter(([label, sample, after, bubble]) => {
    const ok = sample.seq > after && sample.seq < bubble;
    if (!ok) unknown.push(`${label}: out of place in the sampling order`);
    return ok;
  }).map(([label, sample]) => [label, sample]);
  const sequence = [...required, ...placedBrackets].sort((x, y) => x[1].seq - y[1].seq);
  const steps = sequence.slice(1).map(([label, sample], i) => diffGeometry(sequence[i][0], sequence[i][1], label, sample));
  const sampleOf = (label) => sequence.find(([name]) => name === label)?.[1];
  const firstChange = steps.find((step) => step.observed !== 'none') || null;
  const approach = inAction.filter((row) => row.id === 'approach');
  const geometryOk = (sample) => sampleProblems('approach', sample).length === 0;
  return { verdict: 'OBSERVED', reasons: [], steps, unknown,
    hits: { 'pointerdown:capture': pointerdown[0].hit ?? null, 'mousedown:capture': mousedown[0].hit ?? null },
    intraSample: { pointerdown: diffGeometry('pointerdown:capture:beforeHit', sampleOf('pointerdown:capture:beforeHit'), 'pointerdown:capture:afterHit', sampleOf('pointerdown:capture:afterHit')),
      mousedown: diffGeometry('mousedown:capture:beforeHit', sampleOf('mousedown:capture:beforeHit'), 'mousedown:capture:afterHit', sampleOf('mousedown:capture:afterHit')) },
    press: diffGeometry('pointerdown:capture:beforeHit', sampleOf('pointerdown:capture:beforeHit'), 'mousedown:capture:beforeHit', sampleOf('mousedown:capture:beforeHit')),
    action: diffGeometry('pre', pre.geometry, 'post', post.geometry),
    firstChange: firstChange && { from: firstChange.from, to: firstChange.to, observed: firstChange.observed },
    approach: { truncated: recorder.approachTruncated === true, rows: approach.map((row) => ({ type: row.type, trusted: row.trusted, x: row.x, y: row.y,
      target: row.target, related: row.related, sinceSnapshot: geometryOk(row.geometry) ? diffGeometry('pre', pre.geometry, row.type, row.geometry).observed : 'unusable' })) },
    armedRows: { truncated: recorder.armedRowsTruncated === true, scroll: inAction.filter((row) => row.id === 'scroll'),
      style: inAction.filter((row) => row.id === 'style-event') },
    stream: mutationStream({ rows: inAction, recorder }) };
}
/** The EV4 mutation stream inside the action interval, with its own verdict: absent binding, a stream fault or overflow
 * makes it INCONCLUSIVE (absent rows then prove nothing). Rows are delivery-time metadata; none names a cause. */
export function mutationStream({ rows, recorder = {} }) {
  const reasons = [];
  if (!recorder.binding) reasons.push('no main/section binding');
  else if (recorder.binding.invalidated) reasons.push(`binding invalidated (${recorder.binding.invalidated.why})`);
  if (recorder.mutationFault) reasons.push(`mutation stream faulted (${recorder.mutationFault})`);
  if (recorder.mutationTruncated) reasons.push('mutation rows were truncated');
  const mutations = rows.filter((row) => row.id === 'mutation');
  const clipped = mutations.filter((row) => row.truncated).length;
  if (clipped) reasons.push(`${clipped} mutation rows had clipped metadata or node lists`);
  const incompleteBatches = rows.filter((row) => row.id === 'mutation-batch' &&
    (!row.geometry || row.geometry.truncated || row.geometry.error || row.geometry.bounded?.length)).length;
  if (incompleteBatches) reasons.push(`${incompleteBatches} mutation-batch geometry samples failed or were bounded`);
  return { verdict: reasons.length ? 'INCONCLUSIVE' : 'OBSERVED', complete: reasons.length === 0, reasons, binding: recorder.binding ?? null,
    skippedOutsideScope: recorder.mutationSkipped ?? 0, batches: rows.filter((row) => row.id === 'mutation-batch').length,
    truncatedRows: mutations.filter((row) => row.truncated).length, rows: mutations };
}

/** Pure: what the evidence says happened to the Open click. Never classifies from missing, truncated, faulted or
 * unreadable evidence, or from a document other than the one the Open action ran in. The recorder and the source
 * probes and their witnessed version come only from actionDoc, read together in the action's own document before any
 * later navigation (W2 1928, EV3-V1):
 * a later document's trace never stands in for it. Only the one trusted click inside the action interval (the pre
 * read to the post read, same document) is attributed, and its bubble, its stops and the Open listener entry are
 * joined to it by the private event id; untrusted, late or other events stay raw evidence. A failed native click is
 * that action's result, never a delivery cause. The geometry verdict is separate: it never changes the delivery class. */
export function classifyOpen({ actionDoc, pre, post = null, click, page = {} }) {
  const reasons = [];
  const captured = !!actionDoc && !actionDoc.captureError;
  const recorder = captured ? actionDoc.recorder ?? null : null, ctx = captured ? actionDoc.ctx : null;
  if (!captured) reasons.push('the action-document trace was not captured');
  else {
    if (!recorder || recorder.captureError) reasons.push('the event recorder could not be read');
    else {
      if (actionDoc.docId == null || recorder.docId !== actionDoc.docId) reasons.push('the action-document trace is not from one document');
      if (recorder.version !== EVENT_RECORDER_VERSION) reasons.push('the event recorder is missing or another version');
      if (recorder.fault) reasons.push(`the event recorder faulted (${recorder.fault.where})`);
      if (recorder.truncated) reasons.push('the event recorder was truncated');
      if (!Array.isArray(recorder.rows) || !recorder.rows.some((row) => row.id === 'install' && row.docId === recorder.docId))
        reasons.push('the recorder install row is missing');
    }
    if (!Array.isArray(ctx)) reasons.push('the source probe records could not be read');
    else if (!ctx.some((row) => row.id === 'reg-open')) reasons.push('no Open listener registration was recorded');
    // the probe version witnessed in the action document itself (W2 EV3-V1): a later document's version never stands in
    if (actionDoc.ctxVersion !== EVENT_PROBE_VERSION) reasons.push('the action document\'s probe version is missing or another version');
  }
  if (!pre || !click) reasons.push('the Open action was not reached');
  else if (pre.snapshotError) reasons.push('the Open button state could not be read before the click');
  else if (recorder && !recorder.captureError && pre.docId !== recorder.docId) reasons.push('the document changed between the Open action and capture');
  const postRead = !!(post && !post.snapshotError);
  if (click?.ok === true && !postRead) reasons.push('the Open button state could not be read after a successful click');
  if (postRead && pre && !pre.snapshotError && post.docId !== pre.docId) reasons.push('the document changed during the Open action');
  if (page.crashed) reasons.push('the page crashed');
  if (page.closed) reasons.push('the page closed before capture');
  if (reasons.length) return { verdict: 'INCONCLUSIVE', reasons, classification: null, facts: null, geometry: null };

  const registered = ctx.filter((row) => row.id === 'reg-open').map((row) => row.node);
  const live = pre.byId?.[0] ?? null;
  const base = { registeredOpen: registered, liveOpen: live, liveRegistered: registered.includes(live), duplicates: pre.live?.length ?? null,
    preHitInside: pre.hitInside, preDisabled: pre.disabled, click: { ok: click.ok === true, error: click.error ?? null } };
  const geometry = postRead
    ? pressGeometry({ rows: recorder.rows, from: pre.now, to: post.now, pre, post, recorder })
    : { verdict: 'INCONCLUSIVE', reasons: ['no post read for the press geometry'], steps: null };
  if (click.ok !== true) return { verdict: 'OBSERVED', reasons: [], classification: 'native-click-failed', facts: base, geometry };

  const from = pre.now, to = post.now;
  const inAction = recorder.rows.filter((row) => row.now >= from && row.now <= to);
  const candidates = inAction.filter((row) => row.id === 'capture' && row.type === 'click' && row.trusted === true);
  if (candidates.length > 1)
    return { verdict: 'INCONCLUSIVE', reasons: [`${candidates.length} trusted click candidates in the action interval`], classification: null, facts: null, geometry: null };
  const presses = inAction.filter((row) => row.id === 'capture' && row.trusted === true && ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].includes(row.type));
  const ignored = inAction.filter((row) => row.id === 'capture' && row.trusted !== true).length;
  const facts = { ...base, presses: presses.map((row) => ({ type: row.type, target: row.target, open: row.open, hit: row.hit ?? null })), ignoredUntrusted: ignored,
    removedLive: inAction.filter((row) => row.id === 'removed' && row.opens?.some(([id]) => id === live)).length };
  if (!candidates.length)
    return { verdict: 'OBSERVED', reasons: [], classification: presses.length ? 'press-without-click' : 'no-native-input-observed', facts, geometry };

  const action = candidates[0], event = action.event;
  const bubble = recorder.rows.find((row) => row.id === 'bubble' && row.event === event) || null;
  const stops = recorder.rows.filter((row) => ['stopPropagation', 'stopImmediatePropagation'].includes(row.id) && row.event === event);
  const listener = ctx.filter((row) => row.id === 'listener-open' && row.event === event);
  const entered = listener.length > 0 && ctx.some((row) => row.id === 'enter' && row.discuss === true && row.t >= listener[0].t && row.t <= to);
  Object.assign(facts, {
    action: { event, target: action.target, open: action.open, hit: action.hit ?? null, path: action.path },
    bubbled: !!bubble, stops: stops.map((row) => ({ method: row.id, current: row.current, phase: row.phase, stack: row.stack })),
    listenerRan: listener.length > 0, enteredOpen: entered,
  });
  let classification;
  if (facts.listenerRan && entered) classification = 'listener-ran-and-keepSelection-entered';
  else if (facts.listenerRan) classification = 'listener-ran-without-keepSelection-entry';
  else if (!action.open) classification = 'click-landed-outside-open-button';
  else if (!registered.includes(action.open.node[0])) classification = 'clicked-unregistered-open-node';
  else if (stops.length) classification = 'click-propagation-stopped';
  else if (!bubble) classification = 'bubble-not-observed';
  else classification = 'click-reached-registered-node-but-listener-did-not-run';
  return { verdict: 'OBSERVED', reasons: [], classification, facts, geometry };
}
