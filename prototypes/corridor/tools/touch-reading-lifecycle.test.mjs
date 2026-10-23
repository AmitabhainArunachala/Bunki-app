import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

// Execute the shipped lifecycle and observer, with a deterministic DOM/clock seam.
// These tests prove ownership and cleanup, not native CSS interpolation or layout.
// G61 and touch-ruby browser witnesses remain required for those properties.
const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
const start = source.indexOf('const TOUCH_READING_GAP = 2;');
const end = source.indexOf('function clearWordLadder(', start);
assert(start >= 0 && end > start, 'executable lifecycle boundary exists');
const executable = source.slice(start, end);

function harness() {
  let now = 1000, nextTimer = 1, observe;
  const timers = new Map(), motionListeners = new Set();
  const motion = { matches: false, addEventListener: (_type, fn) => motionListeners.add(fn) };
  const css = () => ({ width: '', marginInline: '', display: '',
    getPropertyPriority: () => '',
    setProperty(name, value) { this[name] = value; },
    removeProperty(name) { this[name === 'margin-inline' ? 'marginInline' : name] = ''; } });
  class Node {
    constructor(tag, display = 'block', box = { left: 0, right: 300, top: 0, bottom: 30, width: 300 }) {
      this.nodeName = this.tagName = tag; this.nodeType = 1; this.display = display; this.box = box;
      this.parentElement = null; this.children = []; this.style = css(); this.attrs = new Map(); this.dataset = {};
      const classes = new Set();
      this.classList = { contains: x => classes.has(x), add: x => classes.add(x), remove: x => classes.delete(x),
        toggle: (x, yes = !classes.has(x)) => yes ? classes.add(x) : classes.delete(x) };
      this.listeners = new Map();
    }
    append(node) { node.parentElement = this; this.children.push(node); }
    remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
    get isConnected() { return this === body || !!this.parentElement?.isConnected; }
    get previousSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) - 1] || null; }
    closest(selector) { for (let n = this; n; n = n.parentElement) if (selector === '#reader' && n.id === 'reader') return n; return null; }
    setAttribute(name, value) { this.attrs.set(name, value); }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    hasAttribute(name) { return this.attrs.has(name); }
    removeAttribute(name) { this.attrs.delete(name); }
    querySelectorAll(selector) {
      const nodes = this.children.flatMap(node => [node, ...node.querySelectorAll('*')]);
      if (selector === '*') return nodes;
      if (selector === 'rt') return nodes.filter(node => node.nodeName === 'RT');
      if (selector === 'rt:not(.hidden-rt)') return nodes.filter(node => node.nodeName === 'RT' && !node.classList.contains('hidden-rt'));
      return [];
    }
    getBoundingClientRect() { return this.box; }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    emit(type, extra = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn({ target: this, propertyName: 'opacity', pseudoElement: '', timeStamp: now, ...extra }); }
  }
  const body = new Node('BODY');
  const reader = new Node('DIV'); reader.id = 'reader'; body.append(reader);
  const paragraph = new Node('P'); reader.append(paragraph);
  function style(node) {
    const hidden = node.classList.contains('hidden-rt');
    const held = node.hasAttribute('data-touch-fading') && !motion.matches;
    return { display: node.style.display || (hidden && !held ? 'none' : node.display), visibility: 'visible',
      opacity: hidden ? '0' : '1', width: node.style.width || '40px', paddingLeft: '0', paddingRight: '0',
      transitionProperty: 'opacity', transitionDuration: motion.matches ? '0s' : '0.15s', transitionDelay: '0s' };
  }
  const context = { window: { matchMedia: () => motion, addEventListener() {} },
    document: { body, documentElement: body, querySelectorAll: selector => body.querySelectorAll(selector),
      createRange() { let node; return { selectNodeContents(value) { node = value; }, getClientRects: () => [node.box] }; } },
    getComputedStyle: style, performance: { now: () => now },
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => fn(), cancelAnimationFrame() {}, seatInlineGloss() {},
    MutationObserver: class { constructor(fn) { observe = fn; } observe() {} } };
  runInNewContext(executable + `\nthis.api = { set: setTouchReadingShown, seat: seatTouchReading,
    fades: TOUCH_READING_FADES, seats: TOUCH_READING_ROWS, pins: TOUCH_ROW_PINS };`, context);
  function reading(wide = false, row = null, x = 60) {
    if (!row) { const tok = new Node('SPAN', 'inline-flex'); paragraph.append(tok); row = new Node('SPAN'); tok.append(row); }
    const ruby = new Node('RUBY', 'ruby'); row.append(ruby);
    const base = new Node('#text', 'inline', { left: x, right: x + 40, top: 10, bottom: 30, width: 40 }); base.nodeType = 3;
    const rt = new Node('RT', 'ruby-text', { left: x, right: x + (wide ? 60 : 20), top: 0, bottom: 10, width: wide ? 60 : 20 });
    ruby.append(base); ruby.append(rt); rt.classList.add('hidden-rt');
    return { rt, row, ruby, wide };
  }
  const flush = records => observe(records);
  function removed(item, reinsert = false) {
    const parent = item.ruby.parentElement; item.ruby.remove();
    if (reinsert) parent.append(item.ruby);
    flush([{ type: 'childList', removedNodes: [item.ruby], addedNodes: reinsert ? [item.ruby] : [] }]);
  }
  function reduce() { motion.matches = true; for (const fn of motionListeners) fn(); }
  function advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now && timers.delete(id)) timer.fn(); }
  function clean(item, shown = false) {
    assert.equal(style(item.rt).display, shown ? 'ruby-text' : 'none');
    assert.equal(context.api.fades.has(item.rt), false);
    assert.equal(item.rt.hasAttribute('data-touch-fading'), false);
    assert.equal([...item.rt.listeners.values()].reduce((n, set) => n + set.size, 0), 0);
    if (!shown) { assert.equal(item.rt.style.marginInline, ''); assert.equal(context.api.seats.has(item.rt), false); }
  }
  return { ...context.api, reading, style, flush, removed, reduce, advance, timers, clean, reader };
}

for (const wide of [false, true]) {
  const kind = wide ? 'overhanging' : 'short';
  test(`${kind}: conceal holds its seat, filters completion, then clears all ownership`, () => {
    const h = harness(), a = h.reading(wide); h.set(a.rt, true);
    const margin = a.rt.style.marginInline, width = a.row.style.width;
    assert.equal(!!margin, wide); h.set(a.rt, false);
    assert.equal(h.style(a.rt).display, 'ruby-text'); assert.equal(h.fades.size, 1);
    assert.equal(a.rt.style.marginInline, margin); assert.equal(a.row.style.width, width);
    const cycle = h.fades.get(a.rt); h.set(a.rt, false); assert.equal(h.fades.get(a.rt), cycle);
    a.rt.emit('transitionend', { propertyName: 'color' });
    a.rt.emit('transitionend', { target: a.ruby });
    a.rt.emit('transitionend', { pseudoElement: '::before' });
    assert.equal(h.fades.size, 1); a.rt.emit('transitionend'); h.clean(a);
    assert.equal(a.row.style.width, ''); assert.equal(h.timers.size, 0);
  });
  test(`${kind}: mid-fade reveal and rapid cycles invalidate old completions`, () => {
    const h = harness(), a = h.reading(wide); h.set(a.rt, true); h.set(a.rt, false);
    const old = h.fades.get(a.rt), late = [...h.timers.values()][0].fn;
    h.set(a.rt, true); h.clean(a, true); assert.equal(h.style(a.rt).opacity, '1');
    h.set(a.rt, false); const fresh = h.fades.get(a.rt); assert.notEqual(old, fresh);
    old.event({ target: a.rt, propertyName: 'opacity', timeStamp: 1100 }); late();
    assert.equal(h.fades.get(a.rt), fresh);
    h.set(a.rt, true); h.set(a.rt, false); a.rt.emit('transitionend'); h.clean(a); assert.equal(h.timers.size, 0);
  });
  test(`${kind}: cancellation and lost-event fallback settle hidden`, () => {
    const h = harness(), a = h.reading(wide); h.set(a.rt, true); h.set(a.rt, false);
    a.rt.emit('transitioncancel'); h.clean(a); assert.equal(h.timers.size, 0);
    h.set(a.rt, true); h.set(a.rt, false); h.advance(199); assert.equal(h.fades.size, 1);
    h.advance(1); h.clean(a); assert.equal(h.timers.size, 0);
  });
  test(`${kind}: detach/reinsert and replacement release old rows and pending work`, () => {
    const h = harness(), a = h.reading(wide); h.set(a.rt, true); h.set(a.rt, false);
    h.removed(a, true); h.clean(a); assert.equal(a.row.style.width, '');
    h.set(a.rt, true); h.set(a.rt, false); h.removed(a);
    h.clean(a); assert.equal(a.row.style.width, ''); assert.equal(h.timers.size, 0);
    const next = h.reading(wide); h.flush([{ type: 'childList', removedNodes: [], addedNodes: [next.ruby] }]);
    h.clean(next); assert.equal(h.fades.size, 0); h.set(next.rt, true); h.clean(next, true);
  });
  test(`${kind}: reduced motion mid-fade and initially hidden nodes never retain a hold`, () => {
    const h = harness(), a = h.reading(wide); h.set(a.rt, false); h.clean(a); assert.equal(h.timers.size, 0);
    h.set(a.rt, true); h.set(a.rt, false); h.reduce(); h.clean(a); assert.equal(a.row.style.width, '');
    h.set(a.rt, true); h.set(a.rt, false); h.clean(a); assert.equal(h.timers.size, 0);
  });
}

test('one concealed reading cannot unpin a shown reading sharing its row', () => {
  const h = harness(), a = h.reading(true), b = h.reading(true, a.row, 160);
  h.set(a.rt, true); h.set(b.rt, true); assert.equal(h.pins.get(a.row).owners.size, 2);
  const width = a.row.style.width; h.set(a.rt, false); a.rt.emit('transitionend'); h.clean(a);
  assert.equal(a.row.style.width, width); assert.equal(h.pins.get(a.row).owners.has(b.rt), true);
  assert.equal(h.style(b.rt).display, 'ruby-text'); assert.notEqual(b.rt.style.marginInline, '');
  h.set(b.rt, false); b.rt.emit('transitionend'); h.clean(b); assert.equal(a.row.style.width, '');
  assert.equal(a.row.hasAttribute('data-touch-pin'), false); assert.equal(h.timers.size, 0);
});

test('an old animation promise and queued event cannot finish a fresh running transition', async () => {
  const h = harness(), a = h.reading(true), animations = [];
  a.rt.getAnimations = () => {
    let resolve, reject;
    const animation = { transitionProperty: 'opacity', effect: { target: a.rt }, playState: 'running',
      finished: new Promise((yes, no) => { resolve = yes; reject = no; }) };
    animations.push({ animation, resolve, reject }); return [animation];
  };
  h.set(a.rt, true); h.set(a.rt, false); h.set(a.rt, true); h.set(a.rt, false);
  const fresh = h.fades.get(a.rt); animations[0].resolve(); await Promise.resolve();
  a.rt.emit('transitionend'); assert.equal(h.fades.get(a.rt), fresh);
  animations[1].animation.playState = 'idle'; animations[1].reject(new Error('cancelled')); await Promise.resolve();
  h.clean(a); assert.equal(h.timers.size, 0);
});
