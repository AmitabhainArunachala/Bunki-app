/** Exercise competing ordinary N2 sessions in the same browser profile. */
import assert from 'node:assert/strict';

export async function verifyConcurrentDeck(browser, origin) {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const key = 'bunki-cloze:n2';
  const bytes = (page) => page.evaluate((k) => localStorage.getItem(k), key);
  const start = async (page) => {
    await page.locator('#kp-start').click();
    if (await page.locator('#kp-rule-go').isVisible()) await page.locator('#kp-rule-go').click();
    await page.locator('#kp-reveal').click();
  };
  try {
    const tabs = await Promise.all([context.newPage(), context.newPage()]);
    await Promise.all(tabs.map(async (page) => {
      await page.goto(`${origin}/?deck=n2&ui=bi`);
      await start(page);
    }));
    const card = await tabs[0].locator('#kp-card').getAttribute('data-card');
    assert.equal(await tabs[1].locator('#kp-card').getAttribute('data-card'), card);

    // Stage both real grade handlers behind the same lock before either can commit.
    const barrier = await context.newPage();
    await barrier.goto(`${origin}/build-identity.json`);
    await barrier.evaluate((k) => {
      navigator.locks.request(k, () => new Promise(resolve => { window.releaseDeck = resolve; }));
    }, key);
    await barrier.waitForFunction(() => !!window.releaseDeck);
    await Promise.all([tabs[0].locator('#kp-grade-good').click(), tabs[1].locator('#kp-grade-hard').click()]);
    await barrier.waitForFunction(async (k) => (await navigator.locks.query()).pending.filter(l => l.name === k).length === 2, key);
    await barrier.evaluate(() => window.releaseDeck());

    await Promise.any(tabs.map(page => page.locator('.kp-toast[role=alert]').waitFor()));
    const stale = await tabs[0].locator('#kp-start').isVisible() ? tabs[0] : tabs[1];
    const winner = tabs.find(page => page !== stale);
    assert.match(await stale.locator('.kp-toast').textContent(), /latest review/);
    const first = JSON.parse(await bytes(winner));
    assert.equal(first.log.length, 1);
    assert.equal(first.log[0][0], card);
    assert.equal(first.cards[card].reps, 1);

    // The rejected tab may immediately study the next card from the durable ledger.
    await start(stale);
    assert.notEqual(await stale.locator('#kp-card').getAttribute('data-card'), card);
    await stale.locator('#kp-grade-good').click();
    await stale.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).log.length === 2, key);
    const both = await bytes(stale);
    assert.deepEqual(JSON.parse(both).log[0], first.log[0]);
    assert.deepEqual(JSON.parse(both).cards[card], first.cards[card]);

    // An old undo snapshot also cannot discard work accepted in the other window.
    await winner.locator('#kp-undo').click();
    await winner.locator('.kp-toast[role=alert]').waitFor();
    assert.match(await winner.locator('.kp-toast').textContent(), /latest review/);
    assert.equal(await bytes(winner), both);
    await stale.reload();
    await stale.locator('#kp-start').waitFor();
    assert.equal(await bytes(stale), both);
    // The injectable storage contract is also used outside the PWA. Its grade
    // remains durably visible to synchronous callers in the click event's turn.
    const legacyCount = await barrier.evaluate(async (k) => {
      const data = new Map();
      const storage = { getItem: id => data.get(id) ?? null, setItem: (id, value) => data.set(id, value) };
      const { render } = await import('/decks/player/mount.js');
      await render(document.body, { deckId: 'n2', storage, autoStart: true });
      document.querySelector('#kp-rule-go')?.click();
      document.querySelector('#kp-reveal').click();
      document.querySelector('#kp-grade-good').click();
      return JSON.parse(storage.getItem(k)).log.length;
    }, key);
    assert.equal(legacyCount, 1);
    return { concurrentGradesStored: 1, gradesAfterRecovery: 2, staleUndoPreservedBoth: true, reloadPreservedBytes: true, synchronousInjectedGrade: true };
  } finally {
    await context.close();
  }
}
