/** Bands over text in their own layer (voice plan N5, 2026-11-11). WebKit paints neither the CSS custom highlight nor an
 * inline background inside a word button, so whatever must show on text (the sentence being read, the ear's marks) is
 * drawn as plain boxes in a fixed layer above the page, placed from the text's client rects, taking no pointer and
 * moving no layout. One painter for the reader and the ear; it does not know either of them.
 *
 * baseTextRects(range): the client rects of the base text a range covers, ruby readings left out;
 * baseFontSize(range): the largest font size of that base text (the glyphs' em box);
 * lineBands(rects, clip, {height}): the light, one band per line, every band the same height, over the base text;
 * footBands(rects, clip): per rect an underline ('line') and a wash along its foot ('wash');
 * scrollClip(node): the visible box of the node's scroll containers;
 * createBandLayer(document, {draw, ...}): the layer; set(name, range|null), redraw(), dispose(). */

const SKIP = new Set(['RT', 'RP']);

function clipBox(clip, left, top, width, height) {
  const l = Math.max(left, clip.left), r = Math.min(left + width, clip.right);
  const t = Math.max(top, clip.top), b = Math.min(top + height, clip.bottom);
  return r - l >= 1 && b - t > 0 ? {left: l, top: t, width: r - l, height: b - t} : null;
}

function insideReading(node) {
  for (let at = node.parentNode; at && at.nodeType === 1; at = at.parentNode) if (SKIP.has(at.tagName)) return true;
  return false;
}

export function baseTextRects(range) {
  const document = range?.startContainer?.ownerDocument;
  if (!document) return [];
  let root = range.commonAncestorContainer;
  if (root.nodeType !== 1) root = root.parentNode;
  if (!root) return [];
  const rects = [];
  const walker = document.createTreeWalker(root, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue || insideReading(node)) continue;
    try { if (!range.intersectsNode(node)) continue; } catch { continue; }
    const part = document.createRange();
    part.selectNodeContents(node);
    if (node === range.startContainer) part.setStart(node, range.startOffset);
    if (node === range.endContainer) part.setEnd(node, range.endOffset);
    if (part.collapsed) continue;
    for (const rect of part.getClientRects()) if (rect.width >= 1 && rect.height >= 1) rects.push(rect);
  }
  return rects;
}

export function baseFontSize(range) {
  const document = range?.startContainer?.ownerDocument, win = document?.defaultView;
  let root = range?.commonAncestorContainer;
  if (!win || !root) return 0;
  if (root.nodeType !== 1) root = root.parentNode;
  let size = 0;
  const walker = document.createTreeWalker(root, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue || insideReading(node)) continue;
    try { if (!range.intersectsNode(node)) continue; } catch { continue; }
    size = Math.max(size, Number.parseFloat(win.getComputedStyle(node.parentElement).fontSize) || 0);
  }
  return size;
}

/** One band per line: rects whose middles fall within a line join it; every band has one height and is centred on its
 * line's text, so the bands of one sentence are even whatever each engine reports per fragment. The height is the
 * glyphs' em box when given (a text rect also holds the font's leading above the glyphs, where a ruby reading sits),
 * else the tallest rect. */
export function lineBands(rects, clip, {height: em = 0} = {}) {
  const boxes = [...rects].filter(r => r && r.width >= 1 && r.height >= 1).sort((a, b) => a.top - b.top || a.left - b.left);
  if (!boxes.length) return [];
  const tallest = boxes.reduce((max, r) => Math.max(max, r.height), 0), height = em > 0 ? Math.min(em, tallest) : tallest, lines = [];
  for (const r of boxes) {
    const middle = r.top + r.height / 2;
    const line = lines.find(l => Math.abs(l.middle - middle) < tallest / 2);
    if (line) {
      line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.left + r.width);
      line.middles.push(middle); line.middle = line.middles.reduce((a, b) => a + b, 0) / line.middles.length;
    } else lines.push({left: r.left, right: r.left + r.width, middle, middles: [middle]});
  }
  const out = [];
  for (const line of lines) {
    const band = clipBox(clip, line.left, line.middle - height / 2, line.right - line.left, height);
    if (band) out.push({kind: 'speaking', ...band});
  }
  return out;
}

/** Per text rect an underline just below it and a wash along its foot; rows much shorter than the tallest (readings
 * drawn by the engine as their own rows) are left out. */
export function footBands(rects, clip) {
  const lines = [...rects].filter(r => r && r.width >= 1 && r.height >= 1), tallest = lines.reduce((max, r) => Math.max(max, r.height), 0), out = [];
  for (const r of lines) {
    if (r.height < tallest * 0.6) continue;
    const bottom = r.top + r.height, foot = r.height * 0.38;
    const line = clipBox(clip, r.left, bottom + 2, r.width, 1.5);
    if (line) out.push({kind: 'line', ...line});
    const wash = clipBox(clip, r.left, bottom - foot, r.width, foot);
    if (wash) out.push({kind: 'wash', ...wash});
  }
  return out;
}

export function scrollClip(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  const document = element?.ownerDocument, win = document?.defaultView;
  if (!win) return {left: 0, top: 0, right: 0, bottom: 0};
  let box = {left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight};
  for (let at = element; at && at !== document.body && at !== document.documentElement; at = at.parentElement) {
    const style = win.getComputedStyle(at);
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX + ' ' + style.overflowY)) {
      const r = at.getBoundingClientRect();
      box = {left: Math.max(box.left, r.left), top: Math.max(box.top, r.top), right: Math.min(box.right, r.right), bottom: Math.min(box.bottom, r.bottom)};
    }
  }
  return box;
}

/** The layer: a fixed box that takes no pointer. draw(name, range) returns bands ({kind, left, top, width, height});
 * each becomes a plain div with data-band=kind. While a mark is shown the layer follows its text by itself: every
 * animation frame it compares where the marked text is (its range's box and line count, and the window's size) with
 * where it was drawn, and redraws when anything moved, whatever moved it (a scroll, a line shown above the card, a fold
 * opening, the text size, the readings). With nothing shown, or once its host has cleared it, no frame is requested and
 * no listener is left. enabled() false (N6-6, the owner's "no highlighting at all") draws no band; the marks are still kept,
 * so a later redraw() with it true shows them where their text is. */
export function createBandLayer(document, {draw, className = 'speech-bands', bandClass = 'speech-band', attribute = 'data-speech-bands', parent = null, enabled = () => true, idle = () => false, idleMs = 250} = {}) {
  if (typeof draw !== 'function') throw new TypeError('a band layer needs draw');
  const win = document.defaultView, marks = new Map();
  const layer = document.createElement('div');
  layer.className = className; layer.setAttribute(attribute, ''); layer.setAttribute('aria-hidden', 'true');
  const requestFrame = win.requestAnimationFrame ? fn => win.requestAnimationFrame(fn) : fn => win.setTimeout(fn, 16);
  const cancelFrame = win.cancelAnimationFrame ? id => win.cancelAnimationFrame(id) : id => win.clearTimeout(id);
  // N7: idle() true (a paused read) looks four times a second on a timer instead of every animation frame.
  let frame = null, slow = false, placed = false, drawnAt = '';
  const resting = () => { try { return idle() === true; } catch { return false; } };
  const where = () => {
    let out = `${win.innerWidth}x${win.innerHeight}`;
    for (const [name, range] of marks) {
      let box = null, lines = 0;
      try { box = range.getBoundingClientRect(); lines = range.getClientRects().length; } catch { box = null; }
      out += `|${name}:` + (box ? [box.left, box.top, box.width, box.height].map(v => Math.round(v * 4)).join(',') + `/${lines}` : '-');
    }
    return out;
  };
  const gone = () => placed && !layer.isConnected;
  function watch() {
    if (frame !== null || !marks.size || gone()) return;
    slow = resting();
    const look = () => {
      frame = null;
      if (!marks.size) return;
      if (gone()) { marks.clear(); return; }
      // F1e (review of c4f6312): a mark whose text has left the page (the screen changed under a still pointer) is
      // dropped, so no frame is asked for it; a host that draws the text again sets a new mark.
      let dropped = false;
      for (const [name, range] of marks) if (range?.commonAncestorContainer?.isConnected === false) { marks.delete(name); dropped = true; }
      if (dropped || where() !== drawnAt) redraw();
      if (marks.size) watch();
    };
    frame = slow ? win.setTimeout(look, idleMs) : requestFrame(look);
  }
  function stopWatching() { if (frame !== null) { if (slow) win.clearTimeout(frame); else cancelFrame(frame); frame = null; } }
  function redraw() {
    if (gone()) { marks.clear(); stopWatching(); return; }
    const nodes = [];
    let shown = true;
    try { shown = enabled() !== false; } catch { shown = true; }
    for (const [name, range] of shown ? marks : []) {
      let bands = [];
      try { bands = draw(name, range) ?? []; } catch { bands = []; }
      for (const band of bands) {
        const div = document.createElement('div');
        div.className = bandClass; div.setAttribute('data-band', band.kind); div.setAttribute('data-mark', name);
        div.style.left = band.left + 'px'; div.style.top = band.top + 'px'; div.style.width = band.width + 'px'; div.style.height = band.height + 'px';
        nodes.push(div);
      }
    }
    layer.replaceChildren(...nodes);
    if (!layer.isConnected) { const host = parent ?? document.body; if (host) { host.append(layer); placed = true; } }
    drawnAt = where();
    stopWatching();
    if (marks.size) watch();
  }
  return Object.freeze({
    layer,
    set(name, range) { if (range) marks.set(name, range); else marks.delete(name); redraw(); },
    redraw,
    dispose() { marks.clear(); stopWatching(); layer.remove(); },
  });
}

/** The reading light: the sentence being read (or any text being spoken) as one even band per line. */
export function createSpeechLight(document, {parent = null, enabled = () => true, idle = () => false} = {}) {
  return createBandLayer(document, {parent, enabled, idle, className: 'speech-light', bandClass: 'speech-light-band', attribute: 'data-speech-light',
    draw: (name, range) => lineBands(baseTextRects(range), scrollClip(range.commonAncestorContainer), {height: baseFontSize(range)})});
}
