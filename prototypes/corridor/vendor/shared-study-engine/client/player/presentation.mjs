/** Visible-active recall timer; answer-reading and hidden time never count. */
export function createRecallTimer(document, clock = () => performance.now()) {
  const window=document.defaultView;
  let focused=typeof document.hasFocus==='function'?document.hasFocus():true;
  const active=()=>!document.hidden&&focused;
  let total = 0, started = active() ? clock() : null, frozen = false;
  const visibility = () => {
    if (frozen) return;
    if (started !== null) { total += Math.max(0, clock() - started); started = null; }
    if (active()) started = clock();
  };
  const blur=()=>{focused=false;visibility();};
  const focus=()=>{focused=true;visibility();};
  const detach=()=>{document.removeEventListener('visibilitychange',visibility);window?.removeEventListener('blur',blur);window?.removeEventListener('focus',focus);};
  document.addEventListener('visibilitychange', visibility);
  window?.addEventListener('blur',blur);window?.addEventListener('focus',focus);
  return Object.freeze({
    freeze() {
      if (!frozen) {
        if (started !== null) total += Math.max(0, clock() - started);
        started = null; frozen = true;detach();
      }
      return Math.round(total);
    },
    dispose() { frozen = true;detach(); },
  });
}
export function wordSegments(text) {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
  return [...segmenter.segment(text)].map(s => ({ surface: s.segment, start: s.index, end: s.index + s.segment.length,
    isWord: s.isWordLike && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(s.segment) }));
}
export function createNode(document, tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class') node.className = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(name, value === true ? '' : String(value));
  }
  node.append(...children.flat(Infinity).filter(x => x !== null && x !== undefined));
  return node;
}
