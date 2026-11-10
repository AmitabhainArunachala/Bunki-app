/** The Rajōmon picture carried the builder's label "Rajōmon · art candidate" on the learner's page (John, 2026-11-10:
 * yes, remove it). The picture's review status stays in the content packet's own status field; the encounter, run
 * from its authored module with its real packet and picture, shows the learner no builder word at any stage. */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { openCorridorSourcePage } from './corridor-source-page.mjs';

const BUILDER_WORDS =
  /candidate|候補|placeholder|stand-in|prototype|draft art|work in progress|\bWIP\b|\bTODO\b/iu;
let host;
beforeAll(async () => {
  host = await openCorridorSourcePage({ stylesheets: ['kanji-world-encounter.css'] });
}, 60000);
afterAll(async () => {
  await host?.close();
});

for (const language of ['en', 'ja']) {
  test(`the Rajōmon scene shows no builder label (${language})`, async () => {
    // a string, so the test runner's own module transform leaves the page's import() alone
    const seen = await host.page.evaluate(`(async (language) => {
      const { createKanjiWorldEncounter } = await import('/kanji-world-encounter.mjs');
      const content = await (await fetch('/kanji-world/rajomon-content.json')).json();
      document.body.replaceChildren();
      const container = document.createElement('div');
      document.body.append(container);
      const encounter = createKanjiWorldEncounter({ container, content, imageUrl: '/kanji-world/rajomon-r1.png', language, onReturn() {} });
      const stages = [];
      const read = () => stages.push({ text: container.innerText, captions: container.querySelectorAll('figcaption').length,
        image: !!container.querySelector('.kw-image') });
      read();
      // every stage the "next" door reaches, as a learner walks it
      for (let i = 0; i < 3; i += 1) {
        const next = container.querySelector('[data-kw-action="next"]');
        if (!next) break;
        next.click();
        read();
      }
      encounter.destroy?.();
      return { status: content.status, stages };
    })(${JSON.stringify(language)})`);
    // the status lives in the data
    expect(seen.status).toMatch(/candidate/u);
    expect(seen.stages[0].image).toBe(true);
    expect(seen.stages[0].captions).toBe(0);
    for (const stage of seen.stages) expect(stage.text).not.toMatch(BUILDER_WORDS);
  }, 60000);
}
