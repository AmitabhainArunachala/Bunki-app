/** Fixed on phones; follows the source word on wide screens. */
export function watchWordPopover(node, anchorFor, obstaclesFor, initialWord = null) {
  const document = node.ownerDocument, win = document.defaultView;
  const initial = win.getComputedStyle(node);
  const padding = [parseFloat(initial.paddingTop), parseFloat(initial.paddingBottom)];
  const properties = ['left','right','top','bottom','max-width','max-height','padding-top','padding-bottom'];
  let stopped = false, frame = 0, lastWord = initialWord && {...initialWord};
  const set = (key, value) => { if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value); };
  const schedule = () => { if (!stopped && !frame) frame = win.requestAnimationFrame(() => { frame = 0; update(); }); };
  function update() {
    if (stopped) return;
    const anchor = anchorFor();
    if (anchor?.isConnected && anchor.getClientRects().length) {
      const rect = anchor.getBoundingClientRect();
      if (rect.width && rect.height) {
        const readings = [...(anchor.closest('ruby') ?? anchor).querySelectorAll('.ruby-reading')].map(n => n.getBoundingClientRect());
        lastWord = {left:rect.left,top:Math.min(rect.top,...readings.map(r => r.top)),bottom:Math.max(rect.bottom,...readings.map(r => r.bottom))};
      }
    }
    if (!win.matchMedia('(min-width:900px)').matches) {
      for (const key of properties) node.style.removeProperty(key);
      return;
    }
    if (!lastWord) return;
    const view = win.visualViewport;
    const leftEdge = (view?.offsetLeft ?? 0) + 16, topEdge = (view?.offsetTop ?? 0) + 16;
    const rightEdge = leftEdge + (view?.width ?? win.innerWidth) - 32;
    const bottomEdge = topEdge + (view?.height ?? win.innerHeight) - 32;
    set('max-width', Math.max(0, rightEdge - leftEdge) + 'px');
    const width = node.getBoundingClientRect().width;
    const left = Math.max(leftEdge, Math.min(lastWord.left, rightEdge - width));
    const below = {top:Math.max(topEdge,lastWord.bottom + 8),bottom:bottomEdge};
    const above = {top:topEdge,bottom:Math.min(bottomEdge,lastWord.top - 8)};
    for (const obstacle of obstaclesFor()) {
      if (!obstacle.getClientRects().length) continue;
      const r = obstacle.getBoundingClientRect();
      if (r.right <= left || r.left >= left + width) continue;
      if (r.bottom > below.top && r.top < below.bottom) below.bottom = Math.min(below.bottom,r.top - 8);
      if (r.top < above.bottom && r.bottom > above.top) above.top = Math.max(above.top,r.bottom + 8);
    }
    const room = area => Math.max(0,Math.floor(area.bottom - area.top));
    const style = win.getComputedStyle(node), border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const natural = node.scrollHeight + border + padding[0] + padding[1] - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const area = natural <= room(below) ? below : natural <= room(above) ? above : room(below) >= room(above) ? below : above;
    const available = room(area);
    // Very short windows scroll the contents instead of covering controls.
    const pad = Math.max(0,(available - border) / 4);
    set('padding-top', Math.min(padding[0],pad) + 'px');
    set('padding-bottom', Math.min(padding[1],pad) + 'px');
    set('max-height', available + 'px');
    set('right','auto'); set('bottom','auto'); set('left',left + 'px');
    const height = node.getBoundingClientRect().height;
    set('top',(area === below ? area.top : area.bottom - height) + 'px');
  }
  const observer = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
  observer?.observe(node);
  document.addEventListener('scroll',schedule,true);
  win.addEventListener('resize',schedule);
  win.visualViewport?.addEventListener('resize',schedule);
  win.visualViewport?.addEventListener('scroll',schedule);
  node.addEventListener('toggle',schedule,true);
  document.fonts?.addEventListener('loadingdone',schedule);
  document.fonts?.ready.then(schedule);
  update();
  return {update,get anchorRect() { return lastWord && {...lastWord}; },dispose() {
    stopped = true; win.cancelAnimationFrame(frame); observer?.disconnect();
    document.removeEventListener('scroll',schedule,true);
    win.removeEventListener('resize',schedule);
    win.visualViewport?.removeEventListener('resize',schedule);
    win.visualViewport?.removeEventListener('scroll',schedule);
    node.removeEventListener('toggle',schedule,true);
    document.fonts?.removeEventListener('loadingdone',schedule);
  }};
}
