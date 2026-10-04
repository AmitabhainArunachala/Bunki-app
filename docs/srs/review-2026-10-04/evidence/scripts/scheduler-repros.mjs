/* global process, console */
// Run from repository root; set REVIEW_EVIDENCE_OUT to an existing scratch directory.
import fs from 'node:fs';
const root = process.cwd();
const engine = await import(`file://${root}/prototypes/corridor/decks/player/engine.js`);
const api = await import(`file://${root}/prototypes/corridor/vendor/ts-fsrs.mjs`);
const pin = JSON.parse(fs.readFileSync(`${root}/prototypes/corridor/data/fsrs-pin.json`));
const scheduler = engine.createScheduler(api, pin);
const now = new Date('2026-10-04T09:00:00Z');
const deck = {
  id: 'demo',
  groups: [{ id: 'g' }],
  words: [
    {
      id: 'w',
      group: 'g',
      cards: [
        { id: 'c1', lv: 1 },
        { id: 'c2', lv: 2 },
      ],
    },
  ],
};
let s = engine.emptyState(deck.id);
s = engine.grade(api, scheduler, s, 'c1', 3, now);
let queue = ['c1'];
let pos = 1;
if (s.cards.c1.state !== 2 && new Date(s.cards.c1.due).getTime() - now.getTime() < 15 * 60000)
  queue.splice(Math.min(queue.length, pos + 4), 0, 'c1');
console.log(
  'early_learning_requeue',
  JSON.stringify({
    scheduledDue: s.cards.c1.due,
    queueNext: queue[pos],
    shownAt: now.toISOString(),
    secondsBeforeDue: (new Date(s.cards.c1.due) - now) / 1000,
  }),
);
const review = engine.grade(
  api,
  scheduler,
  engine.emptyState('demo'),
  'c1',
  4,
  new Date('2026-09-01T09:00:00Z'),
).cards.c1;
s = {
  ...engine.emptyState('demo'),
  cards: {
    c1: { ...review, due: '2026-10-01T00:00:00Z' },
    c2: { ...review, due: '2026-10-02T00:00:00Z' },
  },
};
const first = engine.buildQueue(deck, s, now, 0);
s = engine.grade(api, scheduler, s, first.queue[0], 3, now);
const reopened = engine.buildQueue(deck, s, now, 0);
console.log(
  'same_day_sibling_reopen',
  JSON.stringify({ first: first.queue, reopened: reopened.queue }),
);
let t = engine.grade(api, scheduler, engine.emptyState('demo'), 'c1', 4, now);
try {
  t = engine.grade(api, scheduler, t, 'c1', 3, new Date('2026-10-03T09:00:00Z'));
  console.log('backward_clock', JSON.stringify(t.cards.c1));
} catch (e) {
  console.log('backward_clock_error', e.message);
}
const malformed = engine.normalizeState(
  { ...engine.emptyState('demo'), cards: { c1: { due: 'not-a-date' } } },
  deck,
);
console.log('malformed_import_accepted', JSON.stringify(malformed));
try {
  engine.grade(api, scheduler, malformed, 'c1', 3, now);
  console.log('malformed_grade_success');
} catch (e) {
  console.log('malformed_grade_error', e.message);
}
const truncated = engine.normalizeState(
  {
    ...engine.emptyState('demo'),
    log: Array.from({ length: 5001 }, (_, i) => ['c1', 3, String(i)]),
  },
  deck,
);
console.log(
  'log_truncation',
  JSON.stringify({
    received: 5001,
    retained: truncated.log.length,
    firstRetained: truncated.log[0],
  }),
);
