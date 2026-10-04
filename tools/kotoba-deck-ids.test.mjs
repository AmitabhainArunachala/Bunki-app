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
    // passages 2 and 3, not 1: 字 cards are made from the first passage only, so
    // moving passage 1 changes which cards exist, not just their order
    const n = Object.keys(mcd).find((key) => mcd[key].length >= 3);
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
