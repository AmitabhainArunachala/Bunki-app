/**
 * 言葉の鉱脈 card identity (review finding F26, standard amendment A25).
 *
 * Card IDs, and the Anki GUIDs derived from them, come from the committed
 * manifest decks/kotoba-mine/source/ids.json, keyed by word, passage text and
 * card kind, never from a card's position:
 *   MCD 語  `${wid}|word|${sha1(ja)[:12]}`
 *   MCD 字  `${wid}|kanji|${sha1(ja)[:12]}|${k}`  (k: the kanji's index in the word's parts)
 *   文      `${wid}|sentence|${sha1(ja)[:12]}`
 *
 * Since 2026-10-05 (STANDARD A49) each word's contract-v2 passages (they carry a register) come
 * first and its earlier passages follow; the 字 cards stay on the word's origin passage (its first
 * passage without a register, passage 1 before the reorder), so no id moves and no v2 passage
 * has a 字 card.
 *
 * The data checks always run. The build checks run decks/kotoba-mine/tools/build.py
 * and are skipped, saying why, when python3 with fugashi and unidic-lite is missing.
 */
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(REPO, 'decks/kotoba-mine/source');
const BUILD = resolve(REPO, 'decks/kotoba-mine/tools/build.py');
const DECK_IDS = ['kotoba-mcd', 'kotoba-mine'];

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const shippedDeck = (id) => readJson(resolve(REPO, 'prototypes/corridor/decks', id, 'deck.json'));
const without = (obj, ...keys) =>
  Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)));
const sha12 = (text) => createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 12);

function cardKey(wid, card) {
  if (card.type === 'word') return `${wid}|word|${sha12(card.ja)}`;
  if (card.type === 'kanji') {
    const k = card.ruby.filter((seg) => seg.length > 2).findIndex((seg) => seg[2] === 1);
    return `${wid}|kanji|${sha12(card.ja)}|${k}`;
  }
  return `${wid}|sentence|${sha12(card.ja)}`;
}

/** key → card, for every card of a built deck */
function byKey(deck) {
  const out = new Map();
  for (const w of deck.words) for (const c of w.cards) out.set(cardKey(w.id, c), c);
  return out;
}

const manifest = readJson(resolve(SRC, 'ids.json'));

describe('the shipped decks take their card ids from ids.json', () => {
  for (const deckId of DECK_IDS) {
    const deck = shippedDeck(deckId);
    const cards = byKey(deck);
    const ids = manifest[deckId];
    const reserved = new Set((manifest.reserved?.[deckId] ?? []).map((r) => r.id));

    it(`${deckId}: every card id is ids.json[deck][key]`, () => {
      const wrong = [...cards]
        .filter(([key, c]) => ids[key] !== c.id)
        .map(([key, c]) => `${c.id} ${key}`);
      expect(wrong).toEqual([]);
      expect(cards.size).toBe(deck.words.reduce((n, w) => n + w.cards.length, 0));
    });

    it(`${deckId}: ids are unique, and every manifest id is built or reserved`, () => {
      const built = [...cards.values()].map((c) => c.id);
      expect(new Set(built).size).toBe(built.length);
      const all = [...Object.values(ids), ...reserved];
      expect(new Set(all).size).toBe(all.length);
      const builtSet = new Set(built);
      expect(Object.values(ids).filter((id) => !builtSet.has(id))).toEqual([]);
      expect([...reserved].filter((id) => builtSet.has(id))).toEqual([]);
    });
  }
});

/** a word's passages in deck order: [passage number, its 語 card] */
const passagesOf = (w) => w.cards.filter((c) => c.type === 'word').map((c) => [c.passage, c]);
/** the word's origin passage: its first passage without a register (build.py origin_passage) */
const originOf = (w) => passagesOf(w).find(([, c]) => !c.register)?.[1] ?? null;

describe('kotoba-mcd: contract-v2 passages first, 字 cards on their origin passage (A49)', () => {
  const deck = shippedDeck('kotoba-mcd');
  const ids = manifest['kotoba-mcd'];

  it('every word starts with a contract-v2 passage, and its v2 passages all come before its earlier ones', () => {
    const wrong = deck.words
      .filter((w) => {
        const v2 = passagesOf(w).map(([, c]) => !!c.register);
        return !v2[0] || v2.some((x, i) => i > 0 && x && !v2[i - 1]);
      })
      .map((w) => w.id);
    expect(wrong).toEqual([]);
    expect(deck.words.length).toBe(323);
  });

  it('passage numbers and lv follow the new order (1…n, with the 字 cards right after their passage)', () => {
    const wrong = deck.words
      .filter(
        (w) =>
          w.cards.map((c) => c.lv).join() !== w.cards.map((_, i) => i + 1).join() ||
          passagesOf(w)
            .map(([n]) => n)
            .join() !==
            passagesOf(w)
              .map((_, i) => i + 1)
              .join(),
      )
      .map((w) => w.id);
    expect(wrong).toEqual([]);
  });

  it('every 字 card still points at its origin passage: the same passage text and number as the word’s first passage without a register, and the id ids.json gave that key', () => {
    const wrong = [];
    let n = 0;
    for (const w of deck.words) {
      const origin = originOf(w);
      for (const c of w.cards.filter((x) => x.type === 'kanji')) {
        n += 1;
        if (
          !origin ||
          c.ja !== origin.ja ||
          c.passage !== origin.passage ||
          c.register ||
          ids[cardKey(w.id, c)] !== c.id
        )
          wrong.push(c.id);
      }
    }
    expect(wrong).toEqual([]);
    expect(n).toBe(538);
    // and every 字 key in the manifest names the origin passage's text
    const origins = new Map(deck.words.map((w) => [w.id, sha12(originOf(w)?.ja ?? '')]));
    const stray = Object.keys(ids)
      .filter((key) => key.split('|')[1] === 'kanji')
      .filter((key) => key.split('|')[2] !== origins.get(key.split('|')[0]));
    expect(stray).toEqual([]);
  });
});

const probe = spawnSync('python3', ['-c', 'import fugashi, unidic_lite'], { encoding: 'utf8' });
const noPython =
  probe.error || probe.status !== 0
    ? `python3 with fugashi and unidic-lite is not available (${probe.error?.message ?? probe.stderr.trim().split('\n').pop()}); pip install fugashi unidic-lite==1.0.8`
    : '';
if (noPython) console.warn(`kotoba-deck-ids: build checks skipped: ${noPython}`);

describe.skipIf(!!noPython)(
  `build.py keeps ids when passages move${noPython ? ` (skipped: ${noPython})` : ''}`,
  () => {
    const tmp = mkdtempSync(join(tmpdir(), 'kotoba-ids-'));
    afterAll(() => rmSync(tmp, { recursive: true, force: true }));
    const mcd = readJson(resolve(SRC, 'mcd.json'));
    // passages 2 and 3 (both contract v2): 字 cards are made from the origin passage (the first
    // without a register), so moving that one changes which cards exist, not just their order
    const n = Object.keys(mcd).find((key) => mcd[key].length >= 3 && mcd[key][2].register);
    const wid = `km-${n.padStart(3, '0')}`;

    const build = (name, source, ...flags) => {
      const path = join(tmp, `${name}.json`);
      writeFileSync(path, JSON.stringify(source, null, 2));
      const out = join(tmp, name);
      const run = spawnSync('python3', [BUILD, ...flags, '--out', out, '--mcd', path], {
        cwd: REPO,
        encoding: 'utf8',
      });
      return { run, deck: (id) => readJson(join(out, id, 'deck.json')) };
    };

    it('reordering passages changes lv (and the passage number), never an id', () => {
      const swapped = { ...mcd, [n]: [mcd[n][0], mcd[n][2], mcd[n][1], ...mcd[n].slice(3)] };
      const { run, deck } = build('reorder', swapped, '--frozen');
      expect(run.status, run.stderr).toBe(0);
      for (const deckId of DECK_IDS) {
        const before = byKey(shippedDeck(deckId));
        const after = byKey(deck(deckId));
        const ids = (m) => Object.fromEntries([...m].map(([key, c]) => [key, c.id]));
        expect(ids(after)).toEqual(ids(before));
        for (const [key, c] of after) {
          expect(without(c, 'lv', 'passage'), key).toEqual(
            without(before.get(key), 'lv', 'passage'),
          );
        }
      }
      const moved = deck('kotoba-mcd').words.find((w) => w.id === wid).cards;
      const old = shippedDeck('kotoba-mcd').words.find((w) => w.id === wid).cards;
      expect(moved.map((c) => c.id)).not.toEqual(old.map((c) => c.id));
      expect(moved.map((c) => c.lv)).toEqual(old.map((c) => c.lv));
    });

    it('the v2 passages put back after the older ones (the order before A49): only lv and passage move; same ids, same 字 cards on the same passage', () => {
      const old = Object.fromEntries(
        Object.entries(mcd).map(([key, rows]) => [
          key,
          [...rows.filter((p) => !p.register), ...rows.filter((p) => p.register)],
        ]),
      );
      const { run, deck } = build('v2-last', old, '--frozen');
      expect(run.status, run.stderr).toBe(0);
      const before = byKey(shippedDeck('kotoba-mcd'));
      const after = byKey(deck('kotoba-mcd'));
      const ids = (m) => Object.fromEntries([...m].map(([key, c]) => [key, c.id]));
      expect(ids(after)).toEqual(ids(before));
      for (const [key, c] of after)
        expect(without(c, 'lv', 'passage'), key).toEqual(without(before.get(key), 'lv', 'passage'));
      // in the old order the origin passage is passage 1 again, its 字 cards with it
      const w = deck('kotoba-mcd').words.find((x) => x.id === wid);
      expect(w.cards[0].register).toBeUndefined();
      expect(w.cards.filter((c) => c.type === 'kanji').every((c) => c.passage === 1)).toBe(true);
    });

    it('a changed passage fails under --frozen, naming its key', () => {
      const altered = {
        ...mcd,
        [n]: mcd[n].map((p, i) => (i === 1 ? { ...p, ja: `${p.ja}そう話す人は多い。` } : p)),
      };
      const { run } = build('frozen', altered, '--frozen');
      const key = `${wid}|word|${sha12(altered[n][1].ja)}`;
      expect(run.status).not.toBe(0);
      expect(run.stderr + run.stdout).toContain(key);
    });

    it('without --frozen it gets the next free id; the old one is reserved; nothing else moves', () => {
      const altered = {
        ...mcd,
        [n]: mcd[n].map((p, i) => (i === 1 ? { ...p, ja: `${p.ja}そう話す人は多い。` } : p)),
      };
      const idsCopy = join(tmp, 'ids.json');
      copyFileSync(resolve(SRC, 'ids.json'), idsCopy);
      const { run, deck } = build('append', altered, '--ids', idsCopy);
      expect(run.status, run.stderr).toBe(0);
      const updated = readJson(idsCopy);
      const oldKey = `${wid}|word|${sha12(mcd[n][1].ja)}`;
      const newKey = `${wid}|word|${sha12(altered[n][1].ja)}`;
      const reservedBefore = manifest.reserved?.['kotoba-mcd'] ?? [];
      const top = Math.max(
        ...[...Object.values(manifest['kotoba-mcd']), ...reservedBefore.map((r) => r.id)]
          .filter((id) => id.startsWith(`${wid}-m`))
          .map((id) => Number(id.slice(wid.length + 2))),
      );
      expect(updated['kotoba-mcd'][newKey]).toBe(`${wid}-m${String(top + 1).padStart(2, '0')}`);
      // ids reserved earlier stay reserved; the replaced passage's id joins them
      expect(updated.reserved['kotoba-mcd']).toEqual([
        ...reservedBefore,
        { key: oldKey, id: manifest['kotoba-mcd'][oldKey] },
      ]);
      expect(without(updated['kotoba-mcd'], newKey)).toEqual(
        without(manifest['kotoba-mcd'], oldKey),
      );
      expect(updated['kotoba-mine']).toEqual(manifest['kotoba-mine']);
      expect(byKey(deck('kotoba-mcd')).get(newKey).id).toBe(updated['kotoba-mcd'][newKey]);
    });
  },
  120_000,
);
