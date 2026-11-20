/** SENSE G: one fixture's tap and card, read against the fixture's own law. The suite supplies the browser steps. */
import { readingInteraction } from './vh-voice-contracts.mjs';

/** The sink commits a semantic observation BEFORE the next navigation. The fixture, never the DOM, selects the law. */
export async function grokCase(page, fixture, emit, { openArticle, card, cardState, closeMini, delay, pageSense, glossesOf, sidecarRow, led, pageNames,
  vhControl, vhMutations }) {
  const publish = (id, title, ok, observed = null) => emit({ id, title, ok: !!ok, observed });
  let opened;
  try { opened = await openArticle(page, fixture.at); }
  catch (error) { if (error.name === 'TimeoutError') error.senseStage = 'setup'; throw error; }
  if (!opened) { publish(`G.${fixture.name}`, `${fixture.at} opens from the shelf`, false); return; }
  if (fixture.kind === 'reading') {
    const target = page.locator(`#reader .tok[data-index="${fixture.index}"]`).first();
    const observed = await target.evaluate((n) => ({ annotation: n.dataset.readerAnnotation === 'true',
      interactive: n.hasAttribute('tabindex') || n.hasAttribute('role') || n.hasAttribute('data-japanese-lookup') }));
    if (fixture.expectedInteraction === 'inert-annotation') {
      await closeMini(page);
      await target.tap({ timeout: 30000 });
      await delay(600);
      Object.assign(observed, await page.evaluate((i) => ({ mini: !!document.getElementById('mini'), sheet: !!document.getElementById('sheet'),
        rung: document.querySelector(`#reader .tok[data-index="${i}"]`)?.dataset.ladderRung || null }), fixture.index));
      publish(`G.${fixture.name}`, `${fixture.at} #${fixture.index}: independently bracketed reading is inert`,
        readingInteraction(fixture.expectedInteraction, observed), observed);
      return;
    }
    const classified = readingInteraction(fixture.expectedInteraction, observed);
    publish(`G.${fixture.name}.classification`, 'the independently quoted reading is an interactive reading card, not an annotation', classified, observed);
    if (!classified) { publish(`G.${fixture.name}`, 'a misclassified reading cannot satisfy its card contract', false, observed); return; }
  }
  let got = await card(page, fixture.index);
  if (vhControl === 'discard-completed-red-on-retry') {
    await page.locator('#mini .mini-gloss').first().evaluate((node) => { node.textContent = 'VH wrong sense sentinel'; });
    got = await cardState(page);
    vhMutations.push({ control: vhControl, fixture: `${fixture.at}#${fixture.index}`, observed: got.lines, phase: 'real card DOM before semantic observation' });
  }
  if (fixture.kind === 'name') {
    publish(`G.${fixture.name}`, `${fixture.at} #${fixture.index}: a name, never "${fixture.never}"`,
      got?.word === fixture.s && got.lines[0] === 'a name in this text' && !got.lines.includes(fixture.never), got);
    return;
  }
  if (fixture.kind === 'reading') {
    publish(`G.${fixture.name}`, `${fixture.at} #${fixture.index}: exactly the reading in this text`,
      got?.word === fixture.s && got.lines[0] === 'a reading in this text' && !got.more && !got.lines.includes(fixture.never) && !got.sense, got);
    return;
  }
  const lead = fixture.kind === 'gloss' ? sidecarRow(fixture.at, fixture.index)?.[3] : undefined;
  const glosses = led(glossesOf(fixture.seq, fixture.k), lead);
  const lines = [...(got?.lines || []), ...(got?.more ? got.more.split('; ') : [])];
  publish(`G.${fixture.name}`, `${fixture.at} #${fixture.index}: entry ${fixture.seq} sense ${fixture.k + 1}, never "${fixture.never}"`,
    got?.lines?.[0] === glosses[0] && got.sense === `${fixture.seq}:${fixture.k}` && (!fixture.label || got.word === fixture.label)
      && (glosses.length < 2 || got.more.startsWith(glosses[1])) && (fixture.kind !== 'gloss' || fixture.leads.includes(lead))
      && !lines.includes(fixture.never), got);
  if (pageNames.has(fixture.name)) {
    if (vhControl === 'discard-completed-red-on-retry') { const error = new Error('controlled post-G navigation timeout'); error.name = 'TimeoutError'; error.senseStage = 'navigation'; throw error; }
    const marked = await pageSense(page);
    publish(`P.${fixture.name}`, `its word page marks sense ${fixture.k + 1} as the meaning in this text`, marked.length === 1 && marked[0].k === fixture.k, marked);
  }
}
