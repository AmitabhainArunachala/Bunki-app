// Review measurement (hunt 2, "money and loops"): the ear held on, on the Mac, the pointer resting 0.45 s on one sentence
// after another of an article (no read playing). Counts what is asked of the stand-in server, whether any text is asked
// twice, and what the learner sees when the server's per-minute limit for new clips answers (the stand-in's limit is 20 a
// minute; the real server's is 60). A measurement, not a pass/fail check: it exits 0 unless it could not run.
//   node sweep-mac.mjs --engine chromium [--width 1728] [--rest 450] [--sentences 30]
import { arg, holdOn, open, openArticle } from './lib.mjs';

const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '1728'));
const REST = Number(arg('--rest', '450'));
const MAX = Number(arg('--sentences', '30'));
const s = await open({ engine: ENGINE, width: WIDTH, clipSeconds: () => 0.3, voicePort: Number(arg('--voice-port', '19532')) });
const { page, fake } = s;
const out = { engine: ENGINE, width: WIDTH, restMs: REST, visits: 0, states: [] };
try {
  await openArticle(s, { start: false });
  await holdOn(s);
  const t0 = Date.now();
  // one point per sentence: the first content word after each sentence end, top to bottom
  for (let pass = 0; pass < 6 && out.visits < MAX; pass += 1) {
    const points = await page.evaluate(() => {
      const toks = [...document.querySelectorAll('#reader .tok[data-index]')];
      const pts = [];
      let fresh = true;
      for (const t of toks) {
        const r = t.getBoundingClientRect();
        if (fresh && t.classList.contains('content') && r.top > 120 && r.bottom < innerHeight - 160 && r.width > 6) { pts.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); fresh = false; }
        if (/[。！？]/u.test(t.textContent)) fresh = true;
      }
      return pts;
    });
    for (const p of points) {
      if (out.visits >= MAX) break;
      await page.mouse.move(p.x, p.y, { steps: 3 });
      await s.sleep(REST);
      out.visits += 1;
      const ear = await page.evaluate(() => ({ ear: document.documentElement.dataset.ear, why: document.querySelector('.ear-why:not([hidden])')?.textContent || '' }));
      if (!out.states.length || out.states.at(-1).ear !== ear.ear) out.states.push({ at: out.visits, ...ear });
    }
    await page.mouse.wheel(0, 500);
    await s.sleep(500);
  }
  out.seconds = Math.round((Date.now() - t0) / 100) / 10;
  const rows = fake.speaks();
  out.requests = rows.length;
  out.byStatus = rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
  const texts = rows.filter((r) => r.status === 200).map((r) => `${r.voiceKey}|${r.text}`);
  out.askedTwice = texts.filter((t, i) => texts.indexOf(t) !== i).length;
  out.newClips = rows.filter((r) => r.status === 200 && !r.cached).length;
  out.perMinute = Math.round((rows.length / out.seconds) * 60);
} catch (error) {
  out.error = String(error.message).split('\n')[0].slice(0, 200);
}
await s.close();
console.log(JSON.stringify(out, null, 1));
process.exit(out.error ? 1 : 0);
