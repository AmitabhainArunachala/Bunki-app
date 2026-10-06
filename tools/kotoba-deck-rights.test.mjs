/**
 * 言葉の鉱脈 source rights (review findings F12–F14, N07, N11; standard amendments A11–A13).
 *
 * decks/kotoba-mine/source/rights.json holds the licence of record for every source;
 * decks/kotoba-mine/tools/build.py applies it to every card's `src` and, with
 * `--profile public`, leaves out what may not be shared (release/public/).
 *
 * The data checks always run. tools/test_rights.py (Aozora header and trailer parsing,
 * allowed() and relabel()) needs only python3 and is skipped, saying why, without it.
 */
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DECK_DIR = resolve(REPO, 'decks/kotoba-mine');
const DECK_IDS = ['kotoba-mcd', 'kotoba-mine'];
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const rights = readJson(resolve(DECK_DIR, 'source/rights.json'));
const shipped = (id) => readJson(resolve(REPO, 'prototypes/corridor/decks', id, 'deck.json'));
const publicPath = (id) => resolve(DECK_DIR, 'release/public', `deck-${id}.json`);
const cards = (deck) => deck.words.flatMap((w) => w.cards.map((c) => ({ ...c, wid: w.id })));

function host(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** why a card may not be in the public build, or '' (an independent reading of rights.json) */
function publicProblem(card) {
  if (card.kind === 'original') return '';
  const src = card.src ?? {};
  const licence = src.licence ?? '';
  const url = src.url ?? '';
  const h = host(url);
  const domain = rights.excludeDomainsPublic.find((d) =>
    d.includes('.') ? h === d || h.endsWith(`.${d}`) : h.includes(d),
  );
  if (domain) return `excluded domain ${domain}`;
  if (!licence) return 'no licence';
  const restricted = rights.privateOnlyLicences.find((p) => licence.startsWith(p));
  if (restricted) return `private-only licence ${licence}`;
  if (!url && licence.startsWith('CC')) return 'CC licence without URL';
  return '';
}

const RESTRICTED = {
  '青空文庫『七月の水玉』片岡義男': 'CC BY-NC-ND 2.1 JP',
  '青空文庫『東京青年』片岡義男': 'CC BY-NC-ND 2.1 JP',
  '青空文庫『45回転の夏』第１章　ローラーコースター、１９６６年': 'CC BY-NC-ND 2.1 JP',
  '青空文庫『赤い婚礼』RED BRIDAL': 'CC BY-ND 2.1 JP',
};

describe('the private decks carry the licence of record', () => {
  for (const id of DECK_IDS) {
    it(`${id}: no card says "public domain"`, () => {
      const bad = cards(shipped(id)).filter((c) => /public domain/i.test(c.src?.licence ?? ''));
      expect(bad.map((c) => c.id)).toEqual([]);
    });
    it(`${id}: every Aozora card's label is the one rights.json records`, () => {
      const wrong = cards(shipped(id))
        .filter((c) => c.src?.site?.startsWith('青空文庫'))
        .filter((c) => c.src.licence !== rights.aozora[c.src.site]?.licence)
        .map((c) => `${c.id} ${c.src.site} ${c.src.licence}`);
      expect(wrong).toEqual([]);
    });
  }
  it('the restricted works are labelled ND / NC-ND', () => {
    const seen = new Map();
    for (const c of cards(shipped('kotoba-mcd')))
      if (c.src?.site in RESTRICTED) seen.set(c.src.site, c.src.licence);
    expect(Object.fromEntries(seen)).toEqual(RESTRICTED);
  });
});

describe.skipIf(!DECK_IDS.every((id) => existsSync(publicPath(id))))(
  'the public build ships only what may be shared',
  () => {
    for (const id of DECK_IDS) {
      it(`${id}: no excluded domain, private-only licence or CC record without a URL`, () => {
        const bad = cards(readJson(publicPath(id)))
          .map((c) => [c.id, publicProblem(c)])
          .filter(([, why]) => why);
        expect(bad).toEqual([]);
      });
      it(`${id}: every public card is a private card, unchanged`, () => {
        const priv = new Map(cards(shipped(id)).map((c) => [c.id, c]));
        const changed = cards(readJson(publicPath(id))).filter(
          (c) => JSON.stringify(priv.get(c.id)) !== JSON.stringify(c),
        );
        expect(changed.map((c) => c.id)).toEqual([]);
      });
      it(`${id}: ATTRIBUTION-${id}.md lists every source it ships`, () => {
        const md = readFileSync(
          resolve(DECK_DIR, 'release/public', `ATTRIBUTION-${id}.md`),
          'utf8',
        );
        const sites = new Set(
          cards(readJson(publicPath(id)))
            .filter((c) => c.kind !== 'original')
            .map((c) => c.src.site),
        );
        expect([...sites].filter((s) => !md.includes(`## ${s}\n`))).toEqual([]);
      });
    }
  },
);

const probe = spawnSync('python3', ['--version'], { encoding: 'utf8' });
const noPython =
  probe.status === 0 ? '' : `python3 is not available (${probe.error?.message ?? probe.stderr})`;
if (noPython) console.warn(`kotoba-deck-rights: test_rights.py skipped: ${noPython}`);

describe.skipIf(!!noPython)('tools/test_rights.py', () => {
  it('Aozora header and trailer parsing, allowed() and relabel() pass', () => {
    const run = spawnSync('python3', [resolve(DECK_DIR, 'tools/test_rights.py')], {
      encoding: 'utf8',
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
  });
});
