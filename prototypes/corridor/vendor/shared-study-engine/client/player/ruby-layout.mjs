// Keep ruby out of base-text layout in WebKit as well as Chromium. Readings
// retain their source spans; only their visual positions may move within a line.
const GAP = 2;
const HEIGHT = 12;

/** Closest nonoverlapping positions to the supplied centers (squared distance).
 * Pool adjacent violations after subtracting occupied widths, then clamp the
 * resulting monotone sequence to the available interval. */
export function packRubyRow(items, left, right, gap = GAP) {
  if (!items.length) return [];
  const total = items.reduce((sum, item) => sum + item.width, 0) + gap * (items.length - 1);
  if (total > right - left + .01) throw new RangeError('ruby-row-overflow');
  let prefix = 0;
  const offsets = [], blocks = [];
  for (let i = 0; i < items.length; i++) {
    offsets.push(prefix);
    blocks.push({start:i, end:i + 1, sum:items[i].center - items[i].width / 2 - prefix, count:1});
    prefix += items[i].width + gap;
    while (blocks.length > 1 && blocks.at(-2).sum / blocks.at(-2).count > blocks.at(-1).sum / blocks.at(-1).count) {
      const b = blocks.pop(), a = blocks.pop();
      blocks.push({start:a.start, end:b.end, sum:a.sum + b.sum, count:a.count + b.count});
    }
  }
  const result = [];
  for (const block of blocks) {
    const value = Math.max(left, Math.min(right - total, block.sum / block.count));
    for (let i = block.start; i < block.end; i++) result[i] = value + offsets[i];
  }
  return result;
}

const extras = new WeakMap();

/** Call after mounting a passage. Hidden front readings take exactly the same
 * positions as visible back readings. No source text, lookup or glyph advance
 * changes. Extremely dense lines get another reading lane, never smaller text. */
export function fitRubyReadings(root) {
  const passages = root.matches?.('.passage') ? [root] : [...root.querySelectorAll('.passage')];
  for (const passage of passages) {
    const spans = [...passage.querySelectorAll('.ruby-reading')];
    if (!spans.length || !passage.getClientRects().length) continue;
    const win = passage.ownerDocument.defaultView;
    const previous = extras.get(passage);
    if (previous) { passage.style.lineHeight = previous.inline; passage.style.paddingTop = previous.padding; }
    const baseLine = Number.parseFloat(win.getComputedStyle(passage).lineHeight);
    const basePadding = Number.parseFloat(win.getComputedStyle(passage).paddingTop) || 0;
    const bounds = passage.getBoundingClientRect();
    if (bounds.width < 1) continue;
    for (const span of spans) {
      span.style.left = '50%'; span.style.transform = 'translateX(-50%)';
      span.style.bottom = '100%'; span.style.width = ''; span.style.maxWidth = ''; span.style.whiteSpace = '';
      span.style.lineHeight = '';
    }
    const rows = [];
    for (const span of spans) {
      const base = span.closest('ruby').getBoundingClientRect(), natural = span.getBoundingClientRect();
      if (base.width < .01 || natural.width < .01) continue;
      const width = Math.min(natural.width, bounds.width), height = natural.width > bounds.width ? Math.ceil(natural.width / bounds.width) * (HEIGHT + 6) : HEIGHT;
      let row = rows.find(row => Math.abs(row.bottom - base.bottom) < 1);
      if (!row) rows.push(row = {bottom:base.bottom, items:[]});
      row.items.push({span, base, width, height, naturalWidth:natural.width, center:(base.left + base.right) / 2});
    }
    let extra = 0;
    for (const row of rows) {
      row.items.sort((a,b) => a.center - b.center);
      const lanes = []; let lane = [], used = 0;
      for (const item of row.items) {
        let separate = used + (lane.length ? GAP : 0) + item.width > bounds.width + .01;
        if (!separate && lane.length) {
          const proposed = [...lane, item], positions = packRubyRow(proposed, bounds.left, bounds.right);
          // Keep at least half of the smaller interval over its own base, so a
          // long reading cannot look as though it belongs to the next word.
          separate = proposed.some((p,i) => Math.abs(positions[i] + p.width/2 - p.center) > Math.max(p.base.width,p.width)/2 + .01);
        }
        if (lane.length && separate) {
          lanes.push(lane); lane = []; used = 0;
        }
        used += (lane.length ? GAP : 0) + item.width; lane.push(item);
      }
      if (lane.length) lanes.push(lane);
      let rise = 0;
      for (const items of lanes) {
        const positions = packRubyRow(items, bounds.left, bounds.right);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          item.span.style.left = (positions[i] - item.base.left) + 'px';
          item.span.style.transform = 'none';
          item.span.style.bottom = `calc(100% + ${rise}px)`;
          if (item.naturalWidth > bounds.width) {
            item.span.style.width = bounds.width + 'px'; item.span.style.maxWidth = bounds.width + 'px'; item.span.style.whiteSpace = 'normal'; item.span.style.lineHeight = (HEIGHT + 6) + 'px';
          }
        }
        rise += Math.max(...items.map(item => item.height)) + 6;
      }
      extra = Math.max(extra, rise - 6 - HEIGHT);
    }
    // Reserving the same extra room on both faces also handles zoom/narrow
    // windows. Position offsets are relative to each ruby and survive this move.
    if (extra && Number.isFinite(baseLine)) {
      extras.set(passage, {inline:previous?.inline ?? passage.style.lineHeight, padding:previous?.padding ?? passage.style.paddingTop});
      passage.style.lineHeight = (baseLine + extra) + 'px';
      passage.style.paddingTop = (basePadding + extra) + 'px';
    } else extras.delete(passage);
  }
}

export function watchRubyLayout(root) {
  const win = root.ownerDocument.defaultView, fonts = root.ownerDocument.fonts;
  let disposed = false;
  const fit = () => { if (!disposed) fitRubyReadings(root); };
  const observer = win.ResizeObserver ? new win.ResizeObserver(fit) : null;
  observer?.observe(root);
  fonts?.addEventListener('loadingdone', fit);
  fonts?.ready.then(fit);
  return {fit, dispose() { disposed = true; observer?.disconnect(); fonts?.removeEventListener('loadingdone', fit); }};
}
