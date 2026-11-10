// prototypes/corridor/modules/orbit-preview.mjs — the door to 廻 Meguri, the orbit word field, and the host it opens in.
//
// A labelled PREVIEW (John, 2026-11-10: tonight's prototype switches everything on; rough screens are fine when they
// say so). The experience is the author's standalone prototype (claude/meguri-20261016 @ aa567e27), restored beside
// this file in orbit-preview/ and left as he made it; orbit-preview/frame.html lists its two differences. It is not
// the Drift mode that spec S9-R11 plans (orbit-field.mjs, the corridor's own copy of the mechanics, stays unimported).
//
// corridor.js touches this module once: buildGingaChrome() imports it when the door's menu opens and calls
// addOrbitDoor(). Nothing here loads at boot, and the standalone single-file build never asks for it.
//
// Why a frame filled from text (srcdoc) and not a page address: Meguri is a whole document (its own :root tokens,
// data-theme, fixed word page and key handling), so it keeps its own document; the service worker answers every
// navigation except the study frame with the app shell, so a frame pointed at an address would load the app again;
// and the desktop host forbids framing any document but the study frame (static-host.cjs, frame-ancestors 'none').
//
// Storage: the page keeps its own state in localStorage 'meguri.v1' (passes, seals, lists, tempo, toggles), reads an
// absent key as a fresh start, and never touches the learner's record. Spoken words are off unless the address carries
// ?orbitVoice=1: the corridor keeps unbound device speech off (device-voice.mjs), and Meguri's voice is a recorded
// stand-in plus the device voice. The plucked strings and the drone are the instrument and stay.

const FRAME_DIR = new URL('./orbit-preview/', import.meta.url);
const SPEECH = new URLSearchParams(globalThis.location?.search || '').get('orbitVoice') === '1';
const SAVE_GRACE_MS = 400; // the page writes its state 200 ms after a change; its document outlives the close by this much

const STYLE = `
.corner-bubble.bubble-orbit { left: 0; right: 0; width: max-content; margin: 0 auto; bottom: calc(92px + env(safe-area-inset-bottom)); color: #7a2a1c; }
dialog.orbit-preview { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; overflow: hidden; background: #0d0d0d; color: #f1efd8; }
dialog.orbit-preview[open] { display: flex; flex-direction: column; }
dialog.orbit-preview::backdrop { background: #0d0d0d; }
.orbit-preview-bar { flex: none; display: flex; align-items: center; gap: 10px; min-height: 48px; padding: env(safe-area-inset-top, 0px) 56px 0 10px; font: 600 14px/1.2 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', system-ui, sans-serif; }
/* the app keeps its report entry reachable inside any open dialog (maintenance/report-client.js); here it takes the bar's right end, off the instrument */
dialog.orbit-preview[open] #bunki-reports-root .br-rail { top: calc(env(safe-area-inset-top, 0px) + 2px); right: 6px; bottom: auto; }
dialog.orbit-preview[open] #bunki-reports-root .br-rail .br-bug:not(:hover, :focus-visible) { color: rgb(241 239 216 / 78%); }
.orbit-preview-back { appearance: none; flex: none; min-height: 36px; padding: 0 14px; border: 1px solid rgb(241 239 216 / 32%); border-radius: 999px; background: none; color: inherit; font: inherit; cursor: pointer; }
.orbit-preview-back:focus-visible { outline: 2px solid #de5b43; outline-offset: 2px; }
.orbit-preview-name { flex: none; }
.orbit-preview-tag { flex: none; padding: 3px 9px; border: 1px solid #de5b43; border-radius: 999px; color: #f1b3a5; font-size: 12px; font-weight: 500; letter-spacing: 0.04em; }
.orbit-preview-note { margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 400; opacity: 0.66; }
.orbit-preview-stage { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; padding-bottom: env(safe-area-inset-bottom, 0px); font: 400 14px/1.5 'Noto Sans JP', system-ui, sans-serif; }
.orbit-preview-frame { flex: 1 1 auto; align-self: stretch; width: 100%; height: 100%; border: 0; background: #ebe7dc; }
`;

let pageText = null; // Promise<string>: the page with its base address and the host's word about speech
let visit = null; // { dialog, close } while the preview is open

function ensureStyle() {
  if (document.getElementById('orbit-preview-style')) return;
  const style = document.createElement('style');
  style.id = 'orbit-preview-style';
  style.textContent = STYLE;
  document.head.append(style);
}

function node(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function framePage() {
  if (!pageText) {
    pageText = fetch(new URL('frame.html', FRAME_DIR))
      .then((response) => {
        if (!response.ok) throw new Error(`orbit preview page: ${response.status}`);
        return response.text();
      })
      .then((html) => {
        if (!html.includes('<head>') || /<link\b[^>]*\bhref=["']?https?:/iu.test(html)) throw new Error('orbit preview page: not the page this host knows');
        const host = `<base href="${FRAME_DIR.href}"><script>window.MEGURI_HOST=${JSON.stringify({ speech: SPEECH })};</script>`;
        return html.replace('<head>', () => `<head>${host}`);
      });
    pageText.catch(() => { pageText = null; }); // a failed load can be tried again from the door
  }
  return pageText;
}

/**
 * The door: one more corner bubble while the front door's menu is open, named in the interface language and tagged
 * "preview" in both. `root` is the app root that corridor.js is drawing, `open()` says whether the menu still stands
 * (this module arrives a moment after the first draw asks for it).
 */
export function addOrbitDoor(root, { tx, biLabel, open }) {
  if (!root?.isConnected || !open()) return null;
  ensureStyle();
  root.querySelector('.bubble-orbit')?.remove();
  const door = biLabel('button', 'corner-bubble bubble-orbit', '廻', 'orbit');
  door.type = 'button';
  door.id = 'orbit-preview-door';
  door.setAttribute('data-drift-chrome', '');
  door.append(node('span', 'en-sub', 'preview'));
  door.setAttribute('aria-label', tx('廻 めぐり、ことばの輪。プレビュー', 'Orbit word field, preview'));
  door.addEventListener('click', () => { void openOrbitPreview({ tx }); });
  root.append(door);
  return door;
}

/** Opens the preview over the app as a modal dialog; Back (or Escape on the bar) closes it and the app is where it was. */
export async function openOrbitPreview({ tx = (ja, en) => en } = {}) {
  if (visit) return visit;
  ensureStyle();
  const dialog = node('dialog', 'orbit-preview');
  dialog.id = 'orbit-preview';
  dialog.setAttribute('aria-label', tx('廻 めぐり、ことばの輪。プレビュー', 'Orbit word field, preview'));
  const back = node('button', 'orbit-preview-back', tx('‹ 戻る', '‹ Back'));
  back.type = 'button';
  back.id = 'orbit-preview-back';
  const bar = node('header', 'orbit-preview-bar');
  bar.append(back, node('span', 'orbit-preview-name', tx('廻 めぐり', '廻 Orbit')), node('span', 'orbit-preview-tag', 'preview'));
  if (!SPEECH) bar.append(node('span', 'orbit-preview-note', tx('読み上げは休み', 'spoken voice off')));
  const stage = node('div', 'orbit-preview-stage', tx('読み込み中…', 'Loading…'));
  dialog.append(bar, stage);
  // The galaxy under the dialog is a room nobody is looking at: it sleeps through its public seam, as it does on a view
  // switch or a hidden tab (its loop holds the main thread), and wakes on the way back if the door is still its room.
  const galaxy = document.getElementById('drift-layer')?.classList.contains('active') ? globalThis.__DRIFT__ : null;

  const close = () => {
    if (visit?.dialog !== dialog) return;
    visit = null;
    if (galaxy && !document.hidden && document.body.classList.contains('ginga')) galaxy.show();
    const inner = dialog.querySelector('iframe')?.contentWindow;
    try {
      inner?.document.querySelector('#b-play[data-on="1"]')?.click(); // the page's own stop: the rings and the drone
      if (SPEECH) inner?.speechSynthesis?.cancel();
      inner?.__meguri?.sound().AC?.close(); // and any string still ringing
    } catch { /* the page never started its sound */ }
    dialog.close();
    setTimeout(() => dialog.remove(), SAVE_GRACE_MS);
    document.getElementById('orbit-preview-door')?.focus({ preventScroll: true });
  };
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  back.addEventListener('click', close);
  visit = { dialog, close };
  document.body.append(dialog);
  dialog.showModal();
  galaxy?.hide();

  try {
    const html = await framePage();
    if (visit?.dialog !== dialog) return null; // closed while the page was on its way
    const frame = node('iframe', 'orbit-preview-frame');
    frame.id = 'orbit-preview-frame';
    frame.title = tx('廻 めぐり、ことばの輪', 'Meguri, the orbit word field');
    frame.srcdoc = html;
    stage.replaceChildren(frame);
  } catch (error) {
    console.warn('orbit preview unavailable', error);
    if (visit?.dialog === dialog) stage.textContent = tx('プレビューを読み込めませんでした。', 'The preview could not load.');
  }
  return visit;
}
