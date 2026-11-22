/** The one question a voice link asks (LEAN, 2026-11-22; John: the pairing forms were "far far far too confusing").
 * "Bunki Voice" opens `<bunki origin>/#voice-connect=<payload>` for the learner (voice-client.mjs, parseVoiceConnect);
 * shared-study-boot.mjs takes the link out of the address before anything else runs and hands the payload here. One
 * click on Turn on redeems it through the voice client's own pairing, the same call the field under Settings makes, and
 * the page opens again with its voice. The install it makes is the speak-only kind: its token can spend capped audio
 * and nothing else.
 *
 * Nothing is kept and nothing is sent before Turn on. The payload is held in memory only and dropped when the panel
 * closes or the code is spent; it never reaches storage, a log, the panel's words or any request but the one redeem. */
import { readStudyServerAddress } from '../shared-study-pairing.mjs';
import { createDeviceTokenStore, createVoiceClient } from './voice-client.mjs';
import { VOICE_PAIRING, voicePairingLine } from './voice-lines.mjs';

const PANEL_STYLE = `#voice-link{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(24,20,16,.42)}
#voice-link .voice-link-card{box-sizing:border-box;width:min(440px,100%);padding:24px 24px 20px;border-radius:var(--radius-card,16px);background:var(--ground,#f7f3ea);color:var(--ink,#1f1b16);box-shadow:0 18px 48px rgba(0,0,0,.24);font-family:var(--sans,system-ui,-apple-system,"Hiragino Sans",sans-serif)}
#voice-link h2{margin:0 0 10px;font-size:1.15rem;line-height:1.45;font-weight:600}
#voice-link p{margin:0 0 8px;font-size:.95rem;line-height:1.6}
#voice-link .voice-link-server{font-size:.85rem;opacity:.72;overflow-wrap:anywhere}
#voice-link .voice-link-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:12px;margin-top:18px}
#voice-link button{min-height:44px;padding:10px 20px;border:1px solid var(--line,rgba(0,0,0,.2));border-radius:var(--radius-control,999px);background:transparent;color:inherit;font:inherit;font-size:.95rem;cursor:pointer}
#voice-link button.voice-link-primary{border-color:transparent;background:var(--ink,#1f1b16);color:var(--ground,#f7f3ea)}
#voice-link button:disabled{opacity:.5;cursor:default}
#voice-link [hidden]{display:none!important}`;
const elementsOf = (document) => (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
};

/** The panel a voice link opens: one question, the server's host name, Not now and Turn on. A browser whose voice is on
 * already is told so and offered Close only: turning it off in Settings first is the way to change server. A link
 * naming another server than this browser's voice or study server is refused with nothing sent. `text` is the link's
 * payload. Resolves the panel. */
export async function offerVoiceConnect(text, { env = globalThis, client = createVoiceClient({ store: createDeviceTokenStore(env) }),
  known = () => readStudyServerAddress(env), english = new URLSearchParams(env.location?.search || '').get('ui') !== 'ja',
  el = elementsOf(env.document), mount = (panel) => env.document.body.append(panel), unmount = (panel) => panel.remove(),
  reload = () => env.location.reload(), reloadDelayMs = 1500 } = {}) {
  let link = text;
  const say = (pair) => (english ? pair[1] : pair[0]);
  let study = null;
  try { study = await known(); } catch { study = null; }
  const vetted = await client.check({ link }, { known: study });
  if (!vetted.ok) link = null;
  const panel = el('div', 'voice-link'); panel.id = 'voice-link';
  const card = el('div', 'voice-link-card');
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'voice-link-title');
  const title = el('h2', '', ''); title.id = 'voice-link-title';
  const server = el('p', 'voice-link-server', vetted.ok ? say(VOICE_PAIRING.askServer(vetted.host)) : ''); server.id = 'voice-link-server';
  const what = el('p', '', say(VOICE_PAIRING.askWhat)); what.id = 'voice-link-what';
  const note = el('p', '', ''); note.id = 'voice-link-note'; note.setAttribute('role', 'status');
  const actions = el('div', 'voice-link-actions');
  const no = el('button', '', say(VOICE_PAIRING.notNow)); no.type = 'button'; no.id = 'voice-link-no';
  const yes = el('button', 'voice-link-primary', say(VOICE_PAIRING.turnOn)); yes.type = 'button'; yes.id = 'voice-link-yes';
  actions.append(no, yes);
  card.append(title, server, what, note, actions);
  panel.append(card);
  let busy = false;
  const show = (state, { heading = VOICE_PAIRING.ask, line = null, refused = '' } = {}) => {
    panel.dataset.state = state; panel.dataset.refused = refused;
    title.textContent = say(heading);
    note.textContent = line ? say(line) : ''; note.hidden = !line;
    const asking = state === 'offer' || state === 'pairing';
    server.hidden = !asking; what.hidden = !asking; yes.hidden = !asking;
    no.hidden = state === 'on';
    no.textContent = say(asking ? VOICE_PAIRING.notNow : VOICE_PAIRING.close);
    yes.disabled = no.disabled = state === 'pairing';
  };
  const close = () => {
    if (busy) return;
    link = null; panel.dataset.state = 'closed';
    unmount(panel);
  };
  const go = async () => {
    if (busy || link === null) return;
    busy = true; show('pairing', { line: VOICE_PAIRING.pairing });
    const answer = await client.pair({ link }, { known: study });
    // a code is spent once, whatever the answer: a new try is a new link
    link = null; busy = false;
    if (answer.ok) {
      show('on', { heading: VOICE_PAIRING.on, line: VOICE_PAIRING.reopening });
      env.setTimeout(() => reload(), reloadDelayMs);
    } else show('failed', { heading: VOICE_PAIRING.refused, line: voicePairingLine(answer.code), refused: answer.code });
  };
  yes.addEventListener('click', go);
  no.addEventListener('click', close);
  panel.addEventListener('keydown', (event) => { if (event?.key === 'Escape') close(); });
  if (vetted.ok) show('offer');
  else if (vetted.code === 'already-paired') show('held', { heading: VOICE_PAIRING.held, line: voicePairingLine('already-paired'), refused: vetted.code });
  else show('refused', { heading: VOICE_PAIRING.refused, line: voicePairingLine(vetted.code), refused: vetted.code });
  const head = env.document?.head;
  if (head && !env.document.getElementById('voice-link-style')) {
    const style = env.document.createElement('style'); style.id = 'voice-link-style'; style.textContent = PANEL_STYLE;
    head.append(style);
  }
  mount(panel);
  try { (yes.hidden ? no : yes).focus?.(); } catch { /* focus is a convenience */ }
  return panel;
}
