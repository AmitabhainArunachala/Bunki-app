/** Bands of light over text: one even band per line of a sentence, painted in a layer of their own (2026-11-11).
 *
 * The read-along used the CSS Custom Highlight API. WebKit, the engine of Safari and the iPhone, painted it in patches:
 * nothing on the kanji words (the reader's inline-flex word boxes with ruby) and the kana at uneven heights (John, on his
 * phone: "the highlighting is very very wonky"). Here Bunki computes the bands itself, the same in every engine: the
 * boxes of the words' base text (never the readings above them) are grouped into lines, and each line gets one band
 * from its first character to its last, all of the sentence's bands the same height. The layer takes no pointer and
 * moves no layout; the caller dresses it with its own classes (its colour, its place in the stack).
 *
 *   bandLines(boxes)          the geometry, a pure function: base-text boxes in, one { left, top, right, bottom } per line
 *   baseBoxes(nodes)          the base-text boxes of some words (elements or text nodes), readings above words left out
 *   rangeBoxes(range)         the same for a DOM range
 *   createBands(doc, opts)    a painter: show(source, state) paints the boxes `source()` returns, and repaints them when
 *                             the page scrolls, the window changes size, or refresh() is called (the page drawn again) */

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
};

/** One band per line: the boxes are grouped by their vertical middle; every band has the sentence's one height (the
 * median height of its boxes) and is centred on its line; it runs from the line's first box to its last. */
export function bandLines(boxes) {
  const rows = (boxes || []).filter((b) => b && b.right - b.left >= 1 && b.bottom - b.top >= 1)
    .map((b) => ({ left: b.left, right: b.right, top: b.top, bottom: b.bottom, mid: (b.top + b.bottom) / 2, height: b.bottom - b.top }));
  if (!rows.length) return [];
  const height = median(rows.map((row) => row.height));
  const lines = [];
  for (const row of rows) {
    const line = lines.find((one) => Math.abs(one.mid - row.mid) <= height / 2);
    if (line) {
      line.rows.push(row);
      line.mid = median(line.rows.map((one) => one.mid));
      line.left = Math.min(line.left, row.left);
      line.right = Math.max(line.right, row.right);
    } else lines.push({ rows: [row], mid: row.mid, left: row.left, right: row.right });
  }
  lines.sort((a, b) => a.mid - b.mid);
  return lines.map((line) => ({ left: line.left, right: line.right, top: line.mid - height / 2, bottom: line.mid + height / 2 }));
}

const SKIP = new Set(['RT', 'RP', 'SCRIPT', 'STYLE', 'TEMPLATE']);
/** Inside a reading above a word (rt, rp) or another element that is not text, up to `stop`. */
const skipped = (node, stop) => {
  for (let at = node.parentNode; at && at !== stop?.parentNode; at = at.parentNode) if (at.nodeType === 1 && SKIP.has(at.tagName.toUpperCase())) return true;
  return false;
};
function textRects(doc, text, from = 0, to = text.nodeValue.length) {
  if (!/\S/u.test(text.nodeValue.slice(from, to))) return [];
  const range = doc.createRange();
  range.setStart(text, from);
  range.setEnd(text, to);
  return [...range.getClientRects()];
}
/** The base-text boxes of some words: every text node inside them but those of readings above words (rt, rp). */
export function baseBoxes(nodes) {
  const out = [];
  for (const node of nodes || []) {
    if (!node?.isConnected) continue;
    const doc = node.ownerDocument;
    if (node.nodeType === 3) { if (!skipped(node, node)) out.push(...textRects(doc, node)); continue; }
    const walker = doc.createTreeWalker(node, 4);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) if (!skipped(text, node)) out.push(...textRects(doc, text));
  }
  return out;
}
/** The base-text boxes of a DOM range. */
export function rangeBoxes(range) {
  if (!range) return [];
  const doc = range.startContainer.ownerDocument || range.startContainer;
  const root = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
  if (range.startContainer === range.endContainer && range.startContainer.nodeType === 3) {
    return skipped(range.startContainer, root) ? [] : textRects(doc, range.startContainer, range.startOffset, range.endOffset);
  }
  const out = [];
  const walker = doc.createTreeWalker(root, 4);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!range.intersectsNode(text) || skipped(text, root)) continue;
    const from = text === range.startContainer ? range.startOffset : 0;
    const to = text === range.endContainer ? range.endOffset : text.nodeValue.length;
    out.push(...textRects(doc, text, from, to));
  }
  return out;
}

/** A painter of bands. `layerClass` and `bandClass` dress the layer and its bands (position, colour, stacking); each band
 * carries data-state. The bands are placed in the layer's own coordinates and measured again whenever what they light
 * may have moved: a scroll, a resize, refresh() (the page drawn again), and a change of size of the elements `watch()`
 * names (the lit words, their block, the page), whatever made it (a style that grows the text, a reading shown above a
 * word). While no light is on the painter keeps no listener, observer or frame. */
export function createBands(doc, { layerClass = 'voice-bands', bandClass = 'voice-band', attributes = {} } = {}) {
  const view = doc.defaultView;
  const layer = doc.createElement('div');
  layer.className = layerClass;
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('data-voice-bands', '');
  for (const [name, value] of Object.entries(attributes)) layer.setAttribute(name, value);
  let source = null, watch = null, state = '', frame = 0, listening = false;
  let observer = null, watched = [];
  const sizes = new WeakMap();
  function observe() {
    if (!watch || typeof view.ResizeObserver !== 'function') return;
    let next = [];
    try { next = [...new Set((watch() || []).filter((el) => el?.nodeType === 1 && el.isConnected))]; } catch { next = []; }
    if (next.length === watched.length && next.every((el, i) => el === watched[i])) return;
    observer ||= new view.ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const box = entry.contentRect, was = sizes.get(entry.target);
        sizes.set(entry.target, { width: box.width, height: box.height });
        // the first report of an element is its size now; a later one is a change
        if (was && (Math.abs(was.width - box.width) > 0.25 || Math.abs(was.height - box.height) > 0.25)) changed = true;
      }
      if (changed) follow();
    });
    observer.disconnect();
    watched = next;
    for (const el of next) observer.observe(el);
  }
  function paint() {
    let boxes = [];
    try { boxes = source ? source() : []; } catch { boxes = []; }
    const lines = bandLines(boxes);
    observe();
    if (!lines.length) { layer.replaceChildren(); return lines; }
    if (!layer.isConnected) doc.body.append(layer);
    const origin = layer.getBoundingClientRect();
    while (layer.children.length > lines.length) layer.lastElementChild.remove();
    while (layer.children.length < lines.length) { const band = doc.createElement('i'); band.className = bandClass; layer.append(band); }
    lines.forEach((line, i) => {
      const band = layer.children[i];
      band.dataset.state = state;
      band.style.cssText = `left:${line.left - origin.left}px;top:${line.top - origin.top}px;width:${line.right - line.left}px;height:${line.bottom - line.top}px`;
    });
    return lines;
  }
  function follow() {
    if (!source || frame) return;
    frame = view.requestAnimationFrame(() => { frame = 0; paint(); });
  }
  const listen = (on) => {
    if (on === listening) return;
    listening = on;
    const method = on ? 'addEventListener' : 'removeEventListener';
    view[method]('scroll', follow, { capture: true, passive: true });
    view[method]('resize', follow, { passive: true });
  };
  return {
    /** Paint the boxes `next()` returns (it is asked again at every repaint), with `nextState` on every band; `watchNext()`
     * names the elements whose change of size moves them. */
    show(next, nextState = '', watchNext = null) { source = next; state = nextState; watch = watchNext; listen(true); return paint(); },
    /** The page was drawn again: measure again. */
    refresh() { return source ? paint() : []; },
    hide() {
      source = null; watch = null; state = '';
      layer.replaceChildren();
      listen(false);
      if (frame) { view.cancelAnimationFrame(frame); frame = 0; }
      observer?.disconnect();
      watched = [];
    },
    get shown() { return !!source; },
    layer,
  };
}
