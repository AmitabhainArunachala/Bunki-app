// Review check (hunt 3, "can he always grade a card"), the Mac: the ear held on, the review card answered with Anki's keys
// (Space shows the answer, 1–4 grade). The app presses its buttons with node.click() (corridor.js reviewKeys); that click has
// detail 0, which the ear reads as a keyboard press and treats as a tap. In the Japanese interface the buttons carry
// Japanese (答えを見る, ふつう). The table: held on, on the Mac, "clicks behave as usual"; and the app's controls are never
// spoken. With --control the ear stays off (each key must work and ask nothing).
//   node held-mac-keys.mjs --engine chromium|webkit [--ui ja|bi] [--control]
import { arg, dismissFirstLine, holdOn, open, openArticle, reporter } from './lib.mjs';

const ENGINE = arg('--engine', 'chromium');
const UI = arg('--ui', 'ja');
const CONTROL = process.argv.includes('--control');
const tag = `${ENGINE}-1728-${UI}${CONTROL ? '-control' : ''}`;
const { rows, record } = reporter(tag);
const s = await open({ engine: ENGINE, width: 1728, ui: UI, clipSeconds: () => 0.4, voicePort: Number(arg('--voice-port', '19532')) });
const { page, press, fake } = s;
try {
  await openArticle(s, { start: false });
  const word = page.locator('.reader .tok.content').first();
  for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await press(word); await s.sleep(700); }
  await press('#mini-take'); await s.sleep(900);
  await s.ready();
  await press('#home-review').catch(() => {});
  await page.locator('#tab-today').waitFor();
  await press('#tab-today'); await s.sleep(1200);
  await dismissFirstLine(s);
  if (!CONTROL) await holdOn(s);
  await page.mouse.move(4, 400);
  await press('#review-start');
  await page.locator('#reveal').waitFor();
  await s.sleep(800);
  let n = fake.speaks().length;
  await page.keyboard.press('Space');
  await s.sleep(1200);
  const revealed = await page.evaluate(() => !!document.querySelector('.grade-row'));
  const spaceAsks = fake.speaks().slice(n).map((r) => `"${r.text}"`);
  record('Space shows the answer', revealed ? [] : [`not revealed; asked ${spaceAsks.join(', ') || 'nothing'}`], `revealed ${revealed}; requests ${spaceAsks.join(', ') || 'none'}`);
  if (!revealed) { await page.mouse.click(...(await page.locator('#reveal').boundingBox().then((b) => [b.x + b.width / 2, b.y + b.height / 2]))); await s.sleep(1200); }
  const face = await page.evaluate(() => document.querySelector('.review-face')?.textContent.slice(0, 40) || '');
  n = fake.speaks().length;
  await page.keyboard.press('3');
  await s.sleep(1500);
  const graded = await page.evaluate((face) => !document.querySelector('.grade-row') || (document.querySelector('.review-face')?.textContent.slice(0, 40) || '') !== face, face);
  const gradeAsks = fake.speaks().slice(n).map((r) => `"${r.text}"`);
  const gradeSpoken = gradeAsks.filter((t) => /もう一度|難しい|ふつう|簡単|分|日/.test(t));
  record('3 grades the card (Good)', [...(graded ? [] : ['not graded']), ...(gradeSpoken.length ? [`the grade button was read aloud: ${gradeSpoken.join(', ')}`] : [])],
    `graded ${graded}; requests ${gradeAsks.join(', ') || 'none'}; ear ${await page.evaluate(() => document.documentElement.dataset.ear)}`);
} catch (error) {
  record('the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
}
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
