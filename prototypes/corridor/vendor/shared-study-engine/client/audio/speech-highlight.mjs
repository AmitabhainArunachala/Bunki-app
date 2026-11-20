/** Passage text and the CSS Custom Highlight API, without rewriting the DOM. */

const SKIP = new Set(['RT', 'RP']);

/** Text nodes under `element` in reading order, skipping ruby annotations. */
function textNodes(element) {
  const nodes = [];
  const visit = node => {
    if (node.nodeType === 3) {
      if (node.nodeValue) nodes.push(node);
      return;
    }
    if (node.nodeType !== 1 || SKIP.has(node.tagName)) return;
    for (const child of node.childNodes) visit(child);
  };
  visit(element);
  return nodes;
}

/** The element's text with every <rt> and <rp> reading left out. */
export function speakableText(element) {
  return textNodes(element).map(node => node.nodeValue).join('');
}

/** A DOM boundary's UTF-16 offset in speakableText(element). */
export function offsetOf(element, node, nodeOffset = 0) {
  let offset = 0;
  let found = null;
  const visit = current => {
    if (found !== null) return;
    if (current.nodeType === 1 && SKIP.has(current.tagName)) return;
    if (current === node) {
      if (current.nodeType === 3) {
        found = offset + nodeOffset;
        return;
      }
      if (current.nodeType === 1) {
        const end = Math.min(nodeOffset, current.childNodes.length);
        for (let index = 0; index < end; index++) visit(current.childNodes[index]);
      }
      found = offset;
      return;
    }
    if (current.nodeType === 3) {
      offset += current.nodeValue.length;
      return;
    }
    if (current.nodeType !== 1) return;
    for (const child of current.childNodes) visit(child);
  };
  visit(element);
  return found;
}

/** The sentence containing the tapped node, or -1 when its offset is unknown. */
export function sentenceIndexFor(element, node, sentences) {
  const offset = offsetOf(element, node);
  if (offset === null) return -1;
  return sentences.findIndex(sentence => offset >= sentence.start && offset < sentence.end);
}

/** Map UTF-16 offsets in speakableText(element) onto a DOM Range. */
export function rangeFor(element, start, end) {
  const nodes = textNodes(element);
  const range = element.ownerDocument.createRange();
  const locate = offset => {
    let seen = 0;
    for (const node of nodes) {
      const length = node.nodeValue.length;
      if (offset <= seen + length) return [node, Math.max(0, offset - seen)];
      seen += length;
    }
    const last = nodes[nodes.length - 1];
    return last ? [last, last.nodeValue.length] : [element, 0];
  };
  const [startNode, startOffset] = locate(start);
  const [endNode, endOffset] = locate(end);
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  // A DOM Range over ruby necessarily contains the <rt> text nodes. Speakable
  // offsets exclude them, so keep the range's string form aligned with the
  // text it highlights while the real range still drives the CSS highlight.
  const text = speakableText(element).slice(start, end);
  Object.defineProperty(range, 'toString', { value: () => text });
  return range;
}

/** Set or clear the single nsrs-speaking highlight and its visible DOM marks. */
export function showSpeaking(range, host) {
  const container = range?.commonAncestorContainer;
  const document = host?.ownerDocument ?? container?.ownerDocument ?? globalThis.document;
  document?.querySelectorAll('[data-speaking]').forEach(element => element.removeAttribute('data-speaking'));

  const highlights = globalThis.CSS?.highlights;
  if (highlights && typeof Highlight === 'function') {
    if (range) highlights.set('nsrs-speaking', new Highlight(range));
    else highlights.delete('nsrs-speaking');
  }
  if (!range) return;

  host ??= container?.nodeType === 1 ? container : container?.parentElement;
  if (!host) return;
  const start = offsetOf(host, range.startContainer, range.startOffset);
  const end = offsetOf(host, range.endContainer, range.endOffset);
  if (start === null || end === null) return;
  const intersects = node => {
    const nodeStart = offsetOf(host, node);
    if (nodeStart === null) return false;
    const length = node.nodeType === 3 ? node.nodeValue.length : speakableText(node).length;
    return nodeStart < end && nodeStart + length > start;
  };
  const view = host.ownerDocument?.defaultView;
  for (const element of host.querySelectorAll('*')) {
    if (SKIP.has(element.tagName)) continue;
    const word = element.matches('button[data-word]');
    if (!word) {
      const display = view?.getComputedStyle(element).display;
      if (!display || (!display.startsWith('inline') && display !== 'ruby')) continue;
      const intersectsText = [...element.childNodes].some(node => node.nodeType === 3 && node.nodeValue && intersects(node));
      if (!intersectsText) continue;
    }
    if (intersects(element)) element.setAttribute('data-speaking', '');
  }
}
