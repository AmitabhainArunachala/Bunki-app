import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
/** Deck/misc receipts; independent case inventories reviewed at 384d4a70. */
export const DECK_CASES = Object.freeze({
  personal: [
    'original collection and exported bundle validate',
    'answer enrichment binds to original text without changing assessment IDs, hashes or history',
    'bad readings, changed text, missing kanji coverage and incorrect edition bindings reject atomically',
    'answer revisions cannot downgrade or silently replace conflicting saved explanations',
    'reject malformed input, tampering, duplicate identities, unsafe sources and foreign references',
    'four modalities have stable, independent identities',
    'view and preview create no evidence; exact due time gates reviews',
    'related-card burial survives reload and expires on the Japan study day',
    'undo is append-only, replay restores the prior memory state',
    'daily new limit is shared across themes and task types',
    'old or invalid backups cannot erase events; compatible history extends',
    'invalid ratings, unknown cards, sequence gaps and backwards clocks are blocked',
    'six failures pause a card, explicit resume permits review',
    'long history is never truncated and export replay is deterministic',
    'private route and all module dependencies are packaged and precached',
  ],
  legacy: [
    'valid envelope · a real flick commits one judgment',
    'valid envelope · unknown top-level fields survive the flick',
    'malformed envelope · exact raw bytes are quarantined',
    'malformed envelope · protection hint is visible',
    'malformed envelope · failed judgment leaves the word touchable',
    'quota failure · exact raw bytes remain unchanged',
    'quota failure · save-failure hint is visible',
    'quota failure · failed judgment leaves the word touchable',
    'browser integrity · zero page and console errors',
  ],
  'personal-browser': [
    'full paragraph with no grade before reveal',
    'abort preserves answer; committed grade and sibling burial survive reload',
    'durable undo preserves the original event',
    'answer upgrade preserves evidence; Japanese feedback, complete ruby and deliberate English reveal',
    'malformed restore, free reading, search and routes preserve evidence',
    'concurrent windows cannot overwrite or double-grade stale evidence',
    'complete backup round-trips into a second device context',
    'no JavaScript exceptions or external requests',
  ],
});
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const nonempty = (value) => typeof value === 'string' && value.length > 0;
const exact = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length > 0 &&
  a.length === b.length &&
  new Set(a).size === a.length &&
  new Set(b).size === b.length &&
  a.every((x) => b.includes(x));
const realPath = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
};
const sameSite = (a, b) =>
  nonempty(a) && nonempty(b) && realPath(a) !== null && realPath(a) === realPath(b);
export const PAIRED_ENGINES = Object.freeze(['chromium', 'webkit']);
const pairedVersions = (versions) =>
  exact(PAIRED_ENGINES, Object.keys(versions || {})) &&
  PAIRED_ENGINES.every((engine) => nonempty(versions[engine]));
const engines = (engine) => {
  if (!['chromium', 'webkit', 'all'].includes(engine || 'chromium'))
    throw Error('Unknown engine scope');
  return engine === 'all' ? ['chromium', 'webkit'] : [engine || 'chromium'];
};
const envOf = (c) => c.env || c.environment || {};
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function named({
  producer,
  path,
  roster,
  sourceOnly = false,
  direct = false,
  rowKey = 'results',
  passKey = 'pass',
  rowId = (row) => row.name,
  expectedCases = () => roster,
  extra = () => {},
}) {
  return {
    producer,
    paths: [path],
    sourceOnly,
    expectedCases,
    validate(report, context = {}) {
      const errors = [],
        require = (ok, why) => {
          if (!ok) errors.push(why);
        },
        expected = expectedCases(context.engine, context),
        rows = report[rowKey];
      require(Array.isArray(rows), 'Missing producer rows');
      const observed = (Array.isArray(rows) ? rows : []).map(rowId);
      require(exact(expected, observed), 'Missing/duplicate/extra/wrong-engine case');
      require(!(context.args || context.argv || []).some((a) =>
        /^--(?:case|only|boundary-only)(?:=|$)/u.test(a),
      ), 'Filtered invocation');
      for (const key of deckReportNarrowingEnvironment)
        require(!Object.hasOwn(
          context.env || context.environment || {},
          key,
        ), `Narrowing input ${key}`);
      if (sourceOnly)
        require(context.sourceVerifiedBeforeAndAfter === true, 'Unverified source-only execution');
      else if (direct)
        require(sha(context.artifactSha256) &&
          report.artifactSha256 === context.artifactSha256 &&
          sha(report.verifierSha256) &&
          report.verifierSha256 === context.verifierSha256, 'Wrong artifact/producer identity');
      else
        require(context.artifactVerifiedBeforeAndAfter === true &&
          sha(context.artifactSha256) &&
          report.artifactSha256 === context.artifactSha256 &&
          sameSite(report.site, context.site) &&
          nonempty(context.runId) &&
          report.runId ===
            context.runId, 'Served report needs its own site, artifact and attempt identity');
      for (const row of rows || [])
        if (typeof row === 'object') {
          require(row?.[passKey] === true &&
            !row?.error &&
            !row?.failure &&
            !row?.message, `Case not green: ${row?.name || row?.id || 'unknown'}`);
          if ('errors' in row)
            require(Array.isArray(row.errors) && !row.errors.length, 'Case page errors');
          if ('pageErrors' in row)
            require(Array.isArray(row.pageErrors) && !row.pageErrors.length, 'Case page errors');
        }
      require(!report.error && !report.failure, 'Terminal producer failure');
      for (const key of ['failures', 'failed'])
        if (key in report)
          require(Array.isArray(report[key])
            ? report[key].length === 0
            : report[key] === 0, `${key} nonzero`);
      if ('fullAcceptance' in report)
        require(report.fullAcceptance === true, 'Producer denies acceptance');
      extra(report, context, require, rows);
      return {
        passed: errors.length === 0,
        errors,
        expectedCases: expected,
        observedCases: observed,
      };
    },
  };
}
const defs = {
  'personal-collections-contract': named({
    producer: 'prototypes/corridor/tools/test-personal-collections.mjs',
    path: 'personal-collections.json',
    roster: DECK_CASES.personal,
    rowKey: 'checks',
    rowId: (r) => r,
    sourceOnly: true,
    extra(r, c, q) {
      q(
        r.suite === 'personal-collections' &&
          r.passed === DECK_CASES.personal.length &&
          r.completed === true &&
          r.schemaVersion === 2 &&
          nonempty(c.runId) &&
          r.runId === c.runId &&
          sha(c.verifierSha256) &&
          r.verifierSha256 === c.verifierSha256,
        'Personal contract completion invalid',
      );
      q(
        exact(
          r.sources.map((x) => x.path),
          PERSONAL_SOURCES,
        ) && r.sources.every((x) => sha(x.sha256) && x.sha256 === c.sourceFiles?.[x.path]),
        'Personal module/fixture source identities differ',
      );
    },
  }),
  'legacy-drift-storage': named({
    producer: 'prototypes/drift/tools/verify-storage-integrity.mjs',
    path: 'report.json',
    roster: DECK_CASES.legacy,
    sourceOnly: true,
    extra(r, c, q) {
      q(
        c.engine === 'chromium' &&
          r.passed === DECK_CASES.legacy.length &&
          r.total === DECK_CASES.legacy.length &&
          r.browserErrors?.length === 0,
        'Legacy Drift completeness/error',
      );
      for (const key of ['valid', 'malformed', 'quota'])
        q(r.evidence?.[key] && !r.evidence[key].error, `Missing ${key} source Drift experiment`);
    },
  }),
  'personal-collections-browser': named({
    producer: 'prototypes/corridor/tools/verify-personal-collections.mjs',
    path: 'results.json',
    rowKey: 'checks',
    rowId: (r) => r,
    expectedCases: () =>
      PAIRED_ENGINES.flatMap((engine) =>
        [
          ...DECK_CASES['personal-browser'],
          engine === 'webkit'
            ? 'origin stopped; uncached navigation served by worker and review committed (offline emulation not claimed)'
            : 'cold offline app route opens and commits a review',
        ].map((n) => `${engine}: ${n}`),
      ),
    extra(r, c, q) {
      q(
        (envOf(c).PERSONAL_BROWSERS ?? PAIRED_ENGINES.join(',')) === PAIRED_ENGINES.join(',') &&
          r.status === 'passed' &&
          exact(PAIRED_ENGINES, r.browsers) &&
          pairedVersions(r.browserVersions) &&
          r.executableOverride === false,
        'Personal browser full engine coverage invalid',
      );
    },
  }),
};
defs['redesign-foundation'] = named({
  producer: 'tools/verify-redesign-foundation.mjs',
  path: 'foundation.json',
  rowKey: 'checks',
  passKey: 'passed',
  rowId: (r) => `${r.engine}/${r.width}/${r.lang}`,
  expectedCases: () =>
    PAIRED_ENGINES.flatMap((engine) =>
      [320, 390, 768].flatMap((w) => ['bi', 'ja'].map((l) => `${engine}/${w}/${l}`)),
    ),
  extra(r, c, q) {
    q(
      c.engine === 'all' && envOf(c).KAIRO_BROWSER === 'all' && pairedVersions(r.browserVersions),
      'Foundation always runs both engines; engine/version evidence missing',
    );
    q(
      r.diagnostics?.length === 0 &&
        Array.isArray(r.horizontalSamples) &&
        exact(
          r.checks.map((x) => `${x.engine}/${x.width}/${x.lang}`),
          r.horizontalSamples.map((x) => `${x.engine}/${x.width}/${x.lang}`),
        ) &&
        r.horizontalSamples.every(
          (x) => x.noHorizontalScroll === true && x.stage === 'return-to-read-after-dictionary',
        ),
      'Foundation diagnostics/geometry missing',
    );
  },
});
defs['redesign-docks'] = named({
  producer: 'tools/verify-redesign-docks.mjs',
  path: 'redesign-docks.json',
  direct: true,
  passKey: 'passed',
  rowId: (r) => `${r.engine}/${r.lang}/${r.width}/${r.kind}`,
  expectedCases: () =>
    PAIRED_ENGINES.flatMap((e) =>
      ['bi', 'ja'].flatMap((l) =>
        [
          ['context', 390],
          ['private', 390],
          ['palette', 390],
          ['sheet', 390],
          ['palette', 320],
          ['rule', 768],
        ].map(([k, w]) => `${e}/${l}/${w}/${k}`),
      ),
    ),
  extra(r, c, q, rows) {
    q(
      c.engine === 'all' &&
        r.suite === 'redesign-docks' &&
        r.pass === true &&
        r.passed === 24 &&
        r.expectedCases === 24 &&
        rows.every((row) => nonempty(row.browserVersion)),
      'Docks always runs both engines; completion/version missing',
    );
  },
});
defs['n2n1-decks-browser'] = {
  producer: 'prototypes/corridor/tools/verify-n2n1-decks.mjs',
  paths: ['n2n1-tour.json'],
  expectedCases: () =>
    ['n2', 'n1', 'senmon'].flatMap((id) => [
      'data/' + id,
      ...['hokusai', 'yoru'].map((w) => `chromium/${id}/${w}`),
    ]),
  validate(r, c) {
    const errors = [],
      q = (ok, why) => {
        if (!ok) errors.push(why);
      },
      expected = this.expectedCases();
    q(
      r.status === 'passed' &&
        !r.error &&
        c.engine === 'chromium' &&
        sameSite(r.site, c.site) &&
        c.artifactVerifiedBeforeAndAfter === true &&
        sha(c.artifactSha256),
      'N2/N1 artifact/engine/completion',
    );
    q(r.viewport?.width === 390 && r.viewport?.height === 844, 'N2/N1 wrong viewport');
    const observed = [
      ...r.decks.map((d) => 'data/' + d.id),
      ...r.tours.map((t) => `chromium/${t.id}/${t.world}`),
    ];
    q(exact(expected, observed), 'Missing/duplicate N2/N1 tour/data');
    for (const deck of r.decks) {
      const input = c.readArtifactJson?.(`decks/${deck.id}/deck.json`);
      q(
        input?.id === deck.id &&
          input.words?.length === deck.words &&
          input.words.flatMap((w) => w.cards).length === deck.cards &&
          deck.cards > 0,
        'N2/N1 deck roster differs from artifact',
      );
    }
    q(
      r.tours.every((t) =>
        ['furigana', 'defJa', 'englishFolds', 'tapToDefine', 'offline'].every((k) => t[k] === true),
      ),
      'N2/N1 incomplete tour',
    );
    return { passed: !errors.length, errors, expectedCases: expected, observedCases: observed };
  },
};

export const deckReportNarrowingEnvironment = Object.freeze([
  'KOTOBA_ONLY',
  'FOUNDATION_ONLY',
  'EXPERIENCE_ONLY',
]);
export const PERSONAL_SOURCES = Object.freeze([
  '../decks/personal/engine.mjs',
  '../decks/personal/schema.mjs',
  '../decks/personal/enrichment.mjs',
  '../vendor/ts-fsrs.mjs',
  './personal-fixture.mjs',
  '../sw.js',
  '../../../scripts/corridor-assets.mjs',
]);

// Frozen from the reviewed 161 completion sites; ten failure-only terminals are never accepted.
export const KOTOBA_SITES = Object.freeze([
  {
    id: 'K001',
    phase: 'data',
    name: 'the deck is a bunki-cloze-deck v1 with 12 topics',
    dynamic: false,
  },
  {
    id: 'K002',
    phase: 'data',
    name: '323 words, each with one or more sentences, best first',
    dynamic: false,
  },
  {
    id: 'K003',
    phase: 'data',
    name: 'every passage names its source; real mined passages and passages written for the deck',
    dynamic: false,
  },
  {
    id: 'K004',
    phase: 'data',
    name: 'MCD: one word asked per card — 語 cards blank the word (and any repeat of it), 字 cards one kanji with its reading as the hint',
    dynamic: false,
  },
  {
    id: 'K005',
    phase: 'data',
    name: 'every card spells its sentence, asks exactly one word, and gives it a kana reading',
    dynamic: false,
  },
  {
    id: 'K006',
    phase: 'data',
    name: '`${deck.id}: every card id is the one ids.json gives its key (word, passage, kind), not its position`',
    dynamic: true,
  },
  {
    id: 'K007',
    phase: 'data',
    name: 'no 語 or 文 card prints its word outside the blanks (a repeat of the word is blanked too)',
    dynamic: false,
  },
  {
    id: 'K008',
    phase: 'data',
    name: 'no 字 card prints its blanked kanji elsewhere in the passage',
    dynamic: false,
  },
  {
    id: 'K009',
    phase: 'data',
    name: 'corrected readings stay corrected: 日本人 じん, 他の ほか, 一日 いちにち, 一般の方 かた, 土曜日 び, 寛仁 ともひと …',
    dynamic: false,
  },
  {
    id: 'K010',
    phase: 'browser',
    name: 'when storage refuses the write, the card stays (1/N), the ledger is unchanged and the page says 保存できませんでした',
    dynamic: false,
  },
  {
    id: 'K011',
    phase: 'browser',
    name: 'a learning card that comes due while another card is open does not replace it',
    dynamic: false,
  },
  {
    id: 'K012',
    phase: 'browser',
    name: '…and it is the very next card once that one is answered',
    dynamic: false,
  },
  {
    id: 'K013',
    phase: 'browser',
    name: '復元 with {} leaves the ledger bytes as they were and says no card records are in it',
    dynamic: false,
  },
  {
    id: 'K014',
    phase: 'browser',
    name: 'an older backup with fewer cards: the first tap shows both counts and asks again (置き換える); the second replaces and keeps the old ledger aside',
    dynamic: false,
  },
  {
    id: 'K015',
    phase: 'browser',
    name: 'an unreadable stored ledger is copied to bunki-cloze:kotoba-mcd:quarantine and the deck home says so',
    dynamic: false,
  },
  {
    id: 'K016',
    phase: 'browser',
    name: 'the grade bar shows Again · Hard · Good · Easy in that order (ids again, hard, good, easy; keys 1–4), each with an interval, whatever button setting is stored, and stays on screen (fixed)',
    dynamic: false,
  },
  {
    id: 'K017',
    phase: 'browser',
    name: 'a cancelled swipe and a mostly vertical one (dx 105, dy 300) never grade and put the card back; a sideways swipe grades 正解 (Good, rating 3)',
    dynamic: false,
  },
  {
    id: 'K018',
    phase: 'browser',
    name: '設定: the backup box has a label, each of the three choice rows (new per day, mode, English) is a radio group with one checked — no 色 picker (the deck wears the world), no 判定のボタン, no front ふりがな, no ヒント row — the storage line shows, and axe finds no label or aria problems',
    dynamic: false,
  },
  {
    id: 'K019',
    phase: 'browser',
    name: '3) 設定 › バックアップ offers コピー and 復元 and no 記録を消す: whole-deck reset is not offered (A34)',
    dynamic: false,
  },
  {
    id: 'K020',
    phase: 'browser',
    name: 'the done screen keeps ひとつ戻す and it brings the last card back',
    dynamic: false,
  },
  {
    id: 'K021',
    phase: 'browser',
    name: 'in 4択 a 字 card shows no choices: hint, 答えを見る and the four-pad grade bar instead',
    dynamic: false,
  },
  {
    id: 'K022',
    phase: 'browser',
    name: 'keys 1–4 each grade their own rating (Again 1, Hard 2, Good 3, Easy 4) on the card on screen, and each stored interval is the one its pad showed',
    dynamic: false,
  },
  {
    id: 'K023',
    phase: 'browser',
    name: 'a ledger written by the two-button player (ratings 1 and 3 only) loads as it is: its due card is counted, nothing is set aside, and a Hard adds one [id, 2, time] row after the old rows, the other record untouched',
    dynamic: false,
  },
  {
    id: 'K024',
    phase: 'browser',
    name: "the deck's material (the world's own page): every text colour, the kind colours and the four grade hues included, is at least 4.5:1 on the card, the second panel, the page, the 正解 pad and the accent wash",
    dynamic: false,
  },
  {
    id: 'K025',
    phase: 'data',
    name: 'b) every kanji in every passage has a reading for the back (none left bare)',
    dynamic: false,
  },
  {
    id: 'K026',
    phase: 'data',
    name: 'b) no pitch is shown because the decks carry none (the back omits it)',
    dynamic: false,
  },
  {
    id: 'K027',
    phase: 'data',
    name: 'c) both decks default the English gloss to a tap (deck.defaults.gloss = tap, written by build.py)',
    dynamic: false,
  },
  {
    id: 'K028',
    phase: 'data',
    name: '2) both decks open in 読んで思い出す (deck.defaults.mode = read, no front hint setting); the MCD method says so and that 字 cards come with 穴埋め',
    dynamic: false,
  },
  {
    id: 'K029',
    phase: 'data',
    name: 'c) a passage card carries the English of its target sentence only — part of the passage translation, never all of it when the passage has more than one sentence',
    dynamic: false,
  },
  {
    id: 'K030',
    phase: 'data',
    name: 'parity: both separately served Kotoba release HTML outputs embed the exact built-site player CSS and mount code, room motion, and all 451 bundled faces',
    dynamic: false,
  },
  {
    id: 'K031',
    phase: 'data',
    name: 'parity: the study pages bundle this player; the Anki fronts show no readings, English or hint; the Anki backs keep the same order (英語 and 英訳 closed, 漢字 open on 字 cards, 出典 the last fold) and translate only the target sentence; Anki edges and first chips by item kind (the retuned 字 hue), 形容動詞 on な-adjectives',
    dynamic: false,
  },
  {
    id: 'K032',
    phase: 'browser',
    name: 'tokens: both decks name a side file (deck.tokens) that build.py wrote beside them, and a card holds 語, 字 and 文法 tokens',
    dynamic: false,
  },
  {
    id: 'K033',
    phase: 'browser',
    name: 'host: the corridor mounts the deck with its lexicon adapter (lookup, open, isTaken, take, addToList, installProseWords; no lists() chooser feed); the tokens side file loads only when asked',
    dynamic: false,
  },
  {
    id: 'K034',
    phase: 'browser',
    name: '`host: lookup of known tokens on ${id} returns entries — a 語 with its reading and gloss, a 字 from kanji.json, a 文法 point from the grammar table; punctuation stays plain while known Japanese は resolves`',
    dynamic: true,
  },
  {
    id: 'K035',
    phase: 'browser',
    name: 'host: take() is the corridor’s one-tap save (A51) — the word and a 字 land in the shared review pool (覚えるの札) of the durable record at once, with the Saved toast and 元に戻す and no chooser; a second take writes nothing; isTaken() then says so; the deck ledger, the observation log and the schedule are untouched',
    dynamic: false,
  },
  {
    id: 'K036',
    phase: 'browser',
    name: 'host: open(entry) shows the corridor’s own entry sheet for the word (its one Save already on), over the deck',
    dynamic: false,
  },
  {
    id: 'K038',
    phase: 'browser',
    name: 'host: the standalone study pages mount with a null adapter (data-host none), bundle no host.js and no tokens, and fetch none',
    dynamic: false,
  },
  {
    id: 'K039',
    phase: 'browser',
    name: 'host: both actual release study pages embed 451 faces; Chromium attributes visible glyphs to bundled fonts, WebKit matches embedded-face rasters and rejects fallback',
    dynamic: false,
  },
  {
    id: 'K040',
    phase: 'data',
    name: 'pilot and full run: every contract-v2 card is 4–5 sentences of 180–300 characters, the target once, written for the deck, with a register, a topic, a Japanese usage note and a Japanese sense where it names them, and its target sentence’s English',
    dynamic: false,
  },
  {
    id: 'K041',
    phase: 'data',
    name: 'pilot and full run: a word’s v2 passages differ in register (§5) and come first, unbroken from its first card (A49)',
    dynamic: false,
  },
  {
    id: 'K042',
    phase: 'data',
    name: 'pilot: the MCD tokens file carries Japanese senses for words that are not the deck’s own (gloss_ja.json), beside one definition per deck word',
    dynamic: false,
  },
  {
    id: 'K043',
    phase: 'data',
    name: 'full run (A50): 323 words, 2435 cards — 1897 語 (one per passage) and 538 字 — over 1897 passages: 954 contract v2 (54 pilot, 900 full run over 303 words), 454 mined',
    dynamic: false,
  },
  {
    id: 'K044',
    phase: 'data',
    name: 'full run (A49): every word’s first passage is contract v2 — its first card is a 語 card with a register, passage 1, lv 1',
    dynamic: false,
  },
  {
    id: 'K045',
    phase: 'data',
    name: 'full run (A49): every 字 card points at its origin passage — the word’s first passage without a register, the one its id was minted on — and no contract-v2 passage has a 字 card',
    dynamic: false,
  },
  {
    id: 'K047',
    phase: 'browser',
    name: '`${label}: ${card.id} (${card.word.term}, ${card.register}/${card.topic}) shows its ${sentenceEnds(card.ja).length} sentences with the target marked once, no readings, no gap`',
    dynamic: true,
  },
  {
    id: 'K048',
    phase: 'browser',
    name: '`${label}: the topic sits as a small text chip in the card’s chip row in place of the word’s group; no register chip and no source chip on the front; in the app the level is the one chip drawn, on one row on a phone`',
    dynamic: true,
  },
  {
    id: 'K049',
    phase: 'browser',
    name: '`${label}: the back’s 出典 fold names the passage’s style in full (${UI_REGISTER_NAMES[card.register]})`',
    dynamic: true,
  },
  {
    id: 'K050',
    phase: 'browser',
    name: '`${label}: on the back the drawn chips still sit on one row`',
    dynamic: true,
  },
  {
    id: 'K051',
    phase: 'browser',
    name: '`${label}: the back puts the passage’s own usage note (tipJa) in tier one, right after the definition and before the folds, in Japanese`',
    dynamic: true,
  },
  {
    id: 'K052',
    phase: 'browser',
    name: '`${label}: the passage’s grammar points appear in the back’s 文法 line`',
    dynamic: true,
  },
  {
    id: 'K053',
    phase: 'browser',
    name: "`${label}: tapping a word that is not the deck’s own (${pick?.s ?? 'none found'}) shows its Japanese sense from gloss_ja.json in the slip, not the dictionary’s miss line`",
    dynamic: true,
  },
  {
    id: 'K054',
    phase: 'browser',
    name: '`${label}: no page errors`',
    dynamic: true,
  },
  {
    id: 'K055',
    phase: 'browser',
    name: 'tap: reach fixture has no page errors',
    dynamic: false,
  },
  {
    id: 'K056',
    phase: 'browser',
    name: 'tap: the front has no tap targets, even with the tokens loaded (front pin)',
    dynamic: false,
  },
  {
    id: 'K057',
    phase: 'browser',
    name: "`tap: after the reveal every word of ${front.card}'s passage (語・字・文法, ${want.length}) and of its definition is a tap target, the target too; native inline prose with one Tab stop per paragraph`",
    dynamic: true,
  },
  {
    id: 'K058',
    phase: 'browser',
    name: "tap: each word reaches 44px tall (real presses 21px above and below activate its exact occurrence, stage and key once without scheduling), wears no mark at rest, and under the pointer wears the house's one word mark: a hairline underline in the reading's colour (an inset shadow, no text-decoration)",
    dynamic: false,
  },
  {
    id: 'K059',
    phase: 'browser',
    name: 'tap: paragraph arrows select the exact occurrence without opening or logging',
    dynamic: false,
  },
  {
    id: 'K060',
    phase: 'browser',
    name: 'tap: first Enter exposes the exact reading only, logs depth1 once and leaves the schedule unchanged',
    dynamic: false,
  },
  {
    id: 'K061',
    phase: 'browser',
    name: 'tap: the full page retains an inert, hidden deck occurrence; grade, undo and advance keys cannot change its schedule or observations',
    dynamic: false,
  },
  {
    id: 'K062',
    phase: 'browser',
    name: 'tap: third activation opens the exact entry; Back restores its stage without another observation',
    dynamic: false,
  },
  {
    id: 'K063',
    phase: 'browser',
    name: "`tap: a word of the passage (${tokText}) opens the slip through the host — its reading, the Japanese sense (or the slip's miss line), no English line under the deck's default (the band is the door into the full entry, where English lives), Save, its kanji band; a dialog that is not modal, the lit word keeping the keyboard`",
    dynamic: true,
  },
  {
    id: 'K064',
    phase: 'browser',
    name: 'tap: Save is one tap through the corridor’s save path (A51) — no chooser appears; the word is in the shared review pool (覚えるの札) at once, still one row; the button reads 保存済み ✓ · Saved ✓ and its menu (review · + New list · copy) unfolds inside the slip, which stays on the same word',
    dynamic: false,
  },
  {
    id: 'K065',
    phase: 'browser',
    name: 'tap: after its entry animation Save ▾’s list popover rests inside the slip under Save, covering no other control',
    dynamic: false,
  },
  {
    id: 'K066',
    phase: 'browser',
    name: 'tap: a tap is capture, never evidence — the deck ledger’s cards, log, suspensions and repairs are byte-identical, no card was added, the observation log and the corridor schedule did not move; the three activations are exactly depths1/2/3 in lookups[]',
    dynamic: false,
  },
  {
    id: 'K067',
    phase: 'browser',
    name: 'tap: with the slip open the grade keys do nothing; Escape closes it on the same card and the word is bare',
    dynamic: false,
  },
  {
    id: 'K069',
    phase: 'browser',
    name: 'tap: the card’s own word (a word enrolled in this deck) shows its Japanese sense, 「Already in this deck」 in Save’s place and no Save; its band is the door into the dictionary’s entry; the slip holds no deeper chain of taps',
    dynamic: false,
  },
  {
    id: 'K070',
    phase: 'browser',
    name: 'tap: the same word again opens its full dictionary entry (the slip goes with it); Back restores its stage on the same card with no new observation',
    dynamic: false,
  },
  {
    id: 'K071',
    phase: 'browser',
    name: 'tap: definition first activation reveals ruby without stage',
    dynamic: false,
  },
  {
    id: 'K072',
    phase: 'browser',
    name: 'tap: lookups[] keeps where and how deep each tap was (already-visible passage target: stage2 then page3; definition: reveal1 then stage2) and the schedule is unchanged',
    dynamic: false,
  },
  {
    id: 'K073',
    phase: 'browser',
    name: 'tap: the card still grades as before, and its lookups stay in the ledger beside the answer',
    dynamic: false,
  },
  {
    id: 'K076',
    phase: 'browser',
    name: 'tap, standalone (study-mcd.html, study.html): no tap target on the front; after the reveal furigana and only this deck’s own words are tappable (the built-in gloss map); a tap shows a small popover — term, reading, definition, English behind 英語 — with no 覚える and a one-line note saying so; a press elsewhere closes it; one lookups[] row, the schedule unchanged',
    dynamic: false,
  },
  {
    id: 'K077',
    phase: 'browser',
    name: 'tap, standalone: both release backs and popovers pass bundled-font evidence (Chromium glyph attribution; WebKit embedded-face raster match and fallback rejection)',
    dynamic: false,
  },
  {
    id: 'K078',
    phase: 'browser',
    name: 'tap: the study pages carry the gloss map of their own deck (bunki-cloze-gloss), still no tokens, their popover and no entry-sheet builder',
    dynamic: false,
  },
  {
    id: 'K079',
    phase: 'browser',
    name: 'tap: the Anki templates add nothing for it (no tap-to-define in Anki: furigana only, STANDARD A44)',
    dynamic: false,
  },
  {
    id: 'K081',
    phase: 'browser',
    name: 'a, 2) front pin, both decks: no furigana, no English, no tap targets in the passage, no folds, no hint under a blank — also with old tap-ふりがな / English-hint prefs stored; MCD opens in 読んで思い出す (target marked, nothing blanked), 穴埋め blanks it; only a card repaired with a ladder hint shows one, marked data-repaired',
    dynamic: false,
  },
  {
    id: 'K082',
    phase: 'browser',
    name: 'b) tier one under the passage: the word (reading, part of speech, no pitch), a reading over every kanji, the Japanese definition, no English; the part-of-speech badge is chrome in the interface language (EN: noun)',
    dynamic: false,
  },
  {
    id: 'K083',
    phase: 'browser',
    name: 'c) tier two: native folds in order 英語 → 英訳 → 漢字の形と意味 → (類語) → other passages → 出典, the folds last in the answer; 英語 is closed by default and holds the gloss',
    dynamic: false,
  },
  {
    id: 'K084',
    phase: 'browser',
    name: '4) 出典 is the last fold, closed: the site (a link when the record has a URL), the licence from card.src.licence (lang="en"), the author when there is one, and which passage of the word this is',
    dynamic: false,
  },
  {
    id: 'K085',
    phase: 'browser',
    name: 'c) 英訳 is the target sentence only (not the passage); 漢字 closed on a 語 card; 類語 absent on a new card; other passages are titles only',
    dynamic: false,
  },
  {
    id: 'K086',
    phase: 'browser',
    name: 'c) screen readers: EN fold summaries and English content carry lang="en", while native details add no language override',
    dynamic: false,
  },
  {
    id: 'K087',
    phase: 'browser',
    name: "e) the zoom toggle and the rule's × each have a 44px hit area on a phone without growing on screen",
    dynamic: false,
  },
  {
    id: 'K088',
    phase: 'browser',
    name: 'd) switching 全文／焦点 does not rebuild the screen: an open 英訳 stays open',
    dynamic: false,
  },
  {
    id: 'K089',
    phase: 'browser',
    name: 'd) a new passage card opens 全文 after the reveal (no zoom on the front); 焦点 in the card header dims the other sentences, keeps them, and is remembered for the deck',
    dynamic: false,
  },
  {
    id: 'K090',
    phase: 'browser',
    name: 'e) the grade bar is pinned to the bottom of the phone screen and shows 「答えを見て理解が深まったなら もう一度」 until dismissed; dismissing is remembered in prefs and keeps an open fold open',
    dynamic: false,
  },
  {
    id: 'K091',
    phase: 'browser',
    name: 'c) a passage with no matched sentence (km-109-m05) keeps the 英訳 fold in its place, saying 未対応, never the whole translation',
    dynamic: false,
  },
  {
    id: 'K092',
    phase: 'browser',
    name: 'e) the rule is shown once: after the card it sat under is answered, the next back has none (prefs ruleSeen)',
    dynamic: false,
  },
  {
    id: 'K093',
    phase: 'browser',
    name: '`1) ellipsis fixture ${id} actually renders in ${world} before geometry is measured`',
    dynamic: true,
  },
  {
    id: 'K094',
    phase: 'browser',
    name: '1) in 焦点 the ⋯ never sits on the passage: no visible glyph of a folded group intersects its ⋯, at rest or opened (km-109-m05 by day and at night in 紺紙, km-298-m02)',
    dynamic: false,
  },
  {
    id: 'K095',
    phase: 'browser',
    name: '1) the longest passage (km-298-m02) at its resting position after the reveal, 焦点 and 全文: .kp-term and the definition sit above the pinned bar, no fold row is cut by it; in 焦点 the target sentence is on screen too',
    dynamic: false,
  },
  {
    id: 'K096',
    phase: 'browser',
    name: '1) 焦点 folds the sentences before and after the target to two dimmed lines each (never removed: the passage text is whole), with ⋯ (aria-expanded) on a group that runs longer, which opens it; 全文 lays the groups out inline with no ⋯',
    dynamic: false,
  },
  {
    id: 'K097',
    phase: 'browser',
    name: '5) at the resting position after the reveal no fold row is cut by the pinned bar (each wholly above it or wholly below), the word and definition are above it, and the last fold (出典) scrolls clear of it',
    dynamic: false,
  },
  {
    id: 'K098',
    phase: 'browser',
    name: '5, A39) standalone study pages (no host header): the study top bar pins itself, so at rest after the reveal it is on screen (its top ≥ 0) on a short passage and on a long contract-v2 first passage alike, and the word and definition sit between it and the pinned grade bar',
    dynamic: false,
  },
  {
    id: 'K099',
    phase: 'browser',
    name: 'e) the longest passage (195 characters): the grade bar is on screen at the top of the page and the 出典 fold scrolls clear of it; a card seen before opens in 焦点',
    dynamic: false,
  },
  {
    id: 'K100',
    phase: 'browser',
    name: '6) each sitting counts (prefs.sittings); the tap hint shows in the first three sittings of a deck and is gone from the fourth, on both decks; the swipe hint shows on the first back of the first sitting only',
    dynamic: false,
  },
  {
    id: 'K101',
    phase: 'browser',
    name: '2) 読んで思い出す (the MCD default) leaves a due 字 card out of the queue — nothing suspended, its record kept; choosing 穴埋め brings it back, blanked with its reading',
    dynamic: false,
  },
  {
    id: 'K102',
    phase: 'browser',
    name: 'c) on a 字 card 漢字の形と意味 is open by default',
    dynamic: false,
  },
  {
    id: 'K103',
    phase: 'browser',
    name: 'c, d, 4, 7) sentence deck: 英語 stays open with 設定 › いつも開いておく, 英訳 is the sentence, the same fold order with 「この語の他の文」 and 出典 (site, licence, no passage number) last, and no zoom',
    dynamic: false,
  },
  {
    id: 'K104',
    phase: 'browser',
    name: 'c) 類語 appears only when the word has entries and the card is in review state (closed, after 漢字), never on a new or learning card; a card in review opens 焦点',
    dynamic: false,
  },
  {
    id: 'K105',
    phase: 'browser',
    name: "a) 削除 on a card never shown does not hold the word: the next passage (not that passage's 字 cards) becomes its first; deleting a 字 card leaves its passage first",
    dynamic: false,
  },
  {
    id: 'K106',
    phase: 'browser',
    name: '`2) 読んで思い出す leaves all ${ji.length} 字 cards out of the queue (none due, none new) without suspending them; 穴埋め and 4択 keep them (skipFor)`',
    dynamic: true,
  },
  {
    id: 'K107',
    phase: 'browser',
    name: 'b) the leech threshold is 5 lapses (LEECH_LAPSES, contract §4); the unlock constants are unchanged (14 days, 3 lapses)',
    dynamic: false,
  },
  {
    id: 'K108',
    phase: 'browser',
    name: 'c) each kanji of a word carries its reading in that word (kanji[].r, from the kanji table, never guessed): kana only, and together they spell an all-kanji word',
    dynamic: false,
  },
  {
    id: 'K109',
    phase: 'browser',
    name: 'c) parity: the Anki 漢字 fold lists the kanji family (同 / 読) over the words before it in deck order, as the player derives it',
    dynamic: false,
  },
  {
    id: 'K111',
    phase: 'browser',
    name: '`a) ${deck}: 削除 at the right end of the study top bar (one tap, 44px reach) takes the card out of the sitting at once, keeps its FSRS record and id, and says how to undo; 元に戻す brings it back on screen`',
    dynamic: true,
  },
  {
    id: 'K112',
    phase: 'browser',
    name: '`a) ${deck}: after a reload the deleted card is not in the queue; 設定 › 保留中のカード counts it and 復元 puts it back (logged), with the record as it was`',
    dynamic: true,
  },
  {
    id: 'K113',
    phase: 'browser',
    name: 'b) a card with 5 lapses shows the repair ladder after tier one (the definition or usage note) and before the folds, in order 別の文に替える → ヒントを付ける → 保留 (and このまま続ける); a card with 4 does not',
    dynamic: false,
  },
  {
    id: 'K114',
    phase: 'browser',
    name: 'b) with the ladder shown on km-064-m01 at 390×844, the revealed word (.kp-term) and its definition sit inside the first screen, above the grade bar, with no scroll',
    dynamic: false,
  },
  {
    id: 'K115',
    phase: 'browser',
    name: 'b) ヒントを付ける: one tap stores the hint for this card in the ledger (repairs, logged), the ladder closes, and the card is still graded as usual',
    dynamic: false,
  },
  {
    id: 'K116',
    phase: 'browser',
    name: 'b) the hint shows on the front of the repaired card only (marked data-repaired, gone after the reveal); the next card has none; no ladder until it lapses again',
    dynamic: false,
  },
  {
    id: 'K117',
    phase: 'browser',
    name: "b) 別の文に替える: one tap suspends the leech (record and the word's other progress kept), logs the swap, and puts the word's next unseen passage on screen, due at once — still first after a reload",
    dynamic: false,
  },
  {
    id: 'K118',
    phase: 'browser',
    name: 'b) 保留 (sentence deck): one tap suspends the leech (by leech, logged as suspend) and the next card comes up; on a sentence card the swap names 例文2',
    dynamic: false,
  },
  {
    id: 'K119',
    phase: 'browser',
    name: "b) a 字 card has no passage to swap to (step disabled, said so) and its hint is the kanji's parts; このまま続ける closes the ladder until the next lapse (logged as keep)",
    dynamic: false,
  },
  {
    id: 'K120',
    phase: 'browser',
    name: "c) 漢字の形と意味 lists the learner's own words sharing a kanji (同 財閥) or a kanji reading (読 制圧 for せい, 自由自在 for ざい), with the reading, each a 44px link; words not met yet (財物, 起爆剤…) are left out",
    dynamic: false,
  },
  {
    id: 'K121',
    phase: 'browser',
    name: 'c) each family word opens its row in 語の一覧, and ← returns to the card, still revealed',
    dynamic: false,
  },
  {
    id: 'K122',
    phase: 'browser',
    name: 'c, d) with no other word met, the kanji fold holds the anatomy only; with no see-also or grammar in the deck there is no 参照 line',
    dynamic: false,
  },
  {
    id: 'K123',
    phase: 'browser',
    name: 'd) a see-also and a grammar id in the deck show as one line right after the kanji fold: 参照 links to a deck word (語の一覧) and shows a word outside the deck as text; in the corridor the grammar point opens the corridor’s grammar sheet through the host adapter',
    dynamic: false,
  },
  {
    id: 'K124',
    phase: 'browser',
    name: 'b) word.level comes from the public list (wbig.json, joined on headword and reading, one level only) and the method names the list as a 目安',
    dynamic: false,
  },
  {
    id: 'K125',
    phase: 'browser',
    name: 'c) contrast (tools/contrast-kotoba.mjs, read from player.css): the standalone sheet (the frozen study pages: the default world by day) — passage ≥ 7, body, gloss, muted text, every chip, state, accent and part-of-speech colour ≥ 4.5',
    dynamic: false,
  },
  {
    id: 'K126',
    phase: 'browser',
    name: "`7) the 字 hue (a 字 card's edge and chip) is at least ΔE_ok ${KIND_JI_FLOOR} from every other hue of the standalone sheet`",
    dynamic: true,
  },
  {
    id: 'K127',
    phase: 'browser',
    name: 'c) the deck in all eleven worlds (hosted; home and sitting): passage ≥ 7, body, gloss, muted text, every chip, state, accent, part-of-speech, stage and dock colour ≥ 4.5',
    dynamic: false,
  },
  {
    id: 'K128',
    phase: 'browser',
    name: '`7) the 字 hue is at least ΔE_ok ${KIND_JI_FLOOR} from every other hue of its material, in every world, by day and at night`',
    dynamic: true,
  },
  {
    id: 'K129',
    phase: 'browser',
    name: "one material: in every world the deck's ground is the world's own page and it carries no look of its own",
    dynamic: false,
  },
  {
    id: 'K131',
    phase: 'browser',
    name: 'a) the deck home has no 見て覚えるコツ panel, no method panel and no topic hue on its rows; このデッキのしくみ sits in 設定 with every line of the method, beside three choice rows (no 色 picker: the deck wears the world)',
    dynamic: false,
  },
  {
    id: 'K132',
    phase: 'browser',
    name: '`a, b) ${look}: the 語 card has one hairline edge, the same colour all round (no kind stripe, no level 1–3 edge, no topic hue); its kind chip (Word) and 初めて are built but not drawn; the target and term are bold ink with no underline; the level N1 is the one chip drawn, in ink-2 with no fill, with its 目安 label`',
    dynamic: true,
  },
  {
    id: 'K133',
    phase: 'browser',
    name: '`b) ${look}: English is never coloured (gloss, 英訳 and the note in ink-2, no amber bar on the note); the four grades are red, amber, green and blue`',
    dynamic: true,
  },
  {
    id: 'K134',
    phase: 'browser',
    name: 'b) 字 card: marked 字 with its Kanji chip built, one hairline edge (no kind stripe) and nothing but the level drawn in the head; a word with no level (利回り) has no level chip and draws none; the sentence deck says 語 and its source, never a "3/1" count',
    dynamic: false,
  },
  {
    id: 'K135',
    phase: 'browser',
    name: "b) ベロ藍 and 柿渋, verb card km-200-m01 (追い上げる): the reading over the target is the target's own colour (in the app, its ink), never the accent",
    dynamic: false,
  },
  {
    id: 'K136',
    phase: 'browser',
    name: 'b) Anki (both note types): a note tagged level::N1 shows an N1 chip in the chip row, a note without a level tag shows none; no new field',
    dynamic: false,
  },
  {
    id: 'K137',
    phase: 'browser',
    name: "d) ベロ藍, 柿渋 and 紺紙: the card under the ruby is plain and the deck paints no texture of its own — no fibre (url) and no repeating pattern on the page; the stage's soft light is the stage's",
    dynamic: false,
  },
  {
    id: 'K138',
    phase: 'browser',
    name: 'e) the reveal keeps the card node, its chips and the screen (no rebuild): the readings fade in (140 ms after a 40 ms delay, done by 180 ms) and the answer rises in 120–180 ms, opacity and transform only',
    dynamic: false,
  },
  {
    id: 'K139',
    phase: 'browser',
    name: 'e) a grade slides the answered card out its way (正解 right, もう一度 left; an inert copy without ids, gone after the slide) while the next card settles; the rail ticks by transform in 120 ms',
    dynamic: false,
  },
  {
    id: 'K140',
    phase: 'browser',
    name: 'e) prefers-reduced-motion (emulateMedia): no ambient motion or smooth autoscroll; every declared animation, idle transition and observed effect is opacity-only within 120 ms, including after settling; reveal keeps the card, swipe never drags or slides out, next card crossfades and rail uses plain width',
    dynamic: false,
  },
  {
    id: 'K141',
    phase: 'browser',
    name: 'e) reduced-motion probe rejects idle transform/color transitions, finished CSS and Web Animations transform/stroke effects, ambient fades and smooth autoscroll; removing the mutations restores a passing baseline',
    dynamic: false,
  },
  {
    id: 'K142',
    phase: 'data',
    name: '言葉の鉱脈・文 sits beside it: 323 words of real single sentences, each with its source',
    dynamic: false,
  },
  {
    id: 'K143',
    phase: 'data',
    name: 'the method text names the same four grades the player shows (もう一度・難しい・正解・簡単), never the retired 思い出せた button or 覚えた',
    dynamic: false,
  },
  {
    id: 'K145',
    phase: 'browser',
    name: '集中道場 lists 私の文脈, N2, N1, 専門, 言葉の鉱脈・MCD and ・文, 文脈札, and the saved-word queue',
    dynamic: false,
  },
  {
    id: 'K146',
    phase: 'browser',
    name: 'the deck home leads with the count: no method panel there, no 見て覚えるコツ panel',
    dynamic: false,
  },
  {
    id: 'K147',
    phase: 'browser',
    name: 'the deck home shows today’s count and its 12 exact topics remain in Settings, with their source counts and no preference or ledger change on return',
    dynamic: false,
  },
  {
    id: 'K148',
    phase: 'browser',
    name: 'the deck home shows four small tiles in one row, Due · New · Known · Difficult, with the queue’s own counts (due + new is the start button’s number), in amber, ink, green and red (T2)',
    dynamic: false,
  },
  {
    id: 'K149',
    phase: 'browser',
    name: 'a card is a passage with the word marked (読んで思い出す) — no gap, no hint, no readings, no English',
    dynamic: false,
  },
  {
    id: 'K150',
    phase: 'browser',
    name: 'the answer puts readings over the kanji, gives the meaning, and names the source',
    dynamic: false,
  },
  {
    id: 'K151',
    phase: 'browser',
    name: 'a grade lands in the deck’s own ledger and never in the word queue',
    dynamic: false,
  },
  {
    id: 'K152',
    phase: 'browser',
    name: '?deck=mcd opens the MCD deck directly and the ledger survived the reload',
    dynamic: false,
  },
  {
    id: 'K153',
    phase: 'browser',
    name: '4-choice mode: four words, one tap answers and grades',
    dynamic: false,
  },
  {
    id: 'K154',
    phase: 'browser',
    name: "the two decks open in the same material: ?deck=mcd stands on the world's page and carries no look of its own",
    dynamic: false,
  },
  {
    id: 'K155',
    phase: 'browser',
    name: '穴埋め (the MCD blank preset): one gap and nothing under it — no hint, no readings, no English',
    dynamic: false,
  },
  {
    id: 'K156',
    phase: 'browser',
    name: "?deck=kotoba opens the sentence deck: a real sentence with the word marked, its home on the world's own page (one material: the deck's ground is the page's, no look of its own; a sitting stands on the room's lacquer stage)",
    dynamic: false,
  },
  {
    id: 'K157',
    phase: 'browser',
    name: "one tap on the page's one Save saves the word and opens its menu (review ticked, lists one tap away), nothing more written yet",
    dynamic: false,
  },
  {
    id: 'K158',
    phase: 'browser',
    name: 'the new list receives the word, still one card',
    dynamic: false,
  },
  {
    id: 'K159',
    phase: 'browser',
    name: "the Save's menu then says where the word went",
    dynamic: false,
  },
  {
    id: 'K160',
    phase: 'browser',
    name: 'no console errors',
    dynamic: false,
  },
]);
export const PLACES_CASES = Object.freeze([
  'focus · day: the four grades are colour coded, each in its own hue',
  'focus · night: the four grades are colour coded, each in its own hue',
  'focus · current layout: the four grades are colour coded, each in its own hue',
  'focus · day: every grade word reads at 4.5:1 or more on its pad',
  'focus · night: every grade word reads at 4.5:1 or more on its pad',
  'focus · current layout: every grade word reads at 4.5:1 or more on its pad',
  'default · the current layout, unmarked',
  'default · the current tab bar',
  'default · Settings offers Layout with Current pressed',
  'default · no page errors',
  'switch · Settings turns the new layout on',
  'switch · the choice holds after a reload',
  'bar · five places: Review · Bookshelf · Dictionary · Tests · Progress',
  'bar · no two labels touch at 390 px',
  'review · the top bar holds only Back and search',
  'bookshelf · the top bar holds only Back and search',
  'dictionary · the top bar holds only Back and search',
  'tests · the top bar holds only Back and search',
  'progress · the top bar holds only Back and search',
  'review · its station is lit',
  'bookshelf · its station is lit',
  'dictionary · its station is lit',
  'tests · its station is lit',
  'progress · its station is lit',
  'review · titled Review',
  "review · Begin reads today's queue",
  'review · Begin, the deck row and the badge give one number',
  'review · every deck, the saved words and the lists stand together',
  'review · no tests here',
  'review · Begin starts the review',
  'review · leaving the review returns to Review',
  'saved · opens from Review and keeps Review lit',
  'saved · holds the ledger, the lists, the list maker and the notes',
  'saved · a list opens its page',
  'saved · Back from a list returns to Saved',
  'saved · Back from Saved returns to Review',
  'review · Browse cards opens',
  'review · Back from Browse returns to Review',
  'review · Back up now opens Settings at Export',
  'review · Back from there returns to Review',
  'tests · titled Tests: JLPT tests, guided practice, lessons, sentence practice, level lists, no decks',
  'tests · mock opens and keeps Tests lit',
  'tests · lessons opens and keeps Tests lit',
  'tests · guided opens and keeps Tests lit',
  'tests · Back from mock returns to Tests',
  'tests · Back from lessons returns to Tests',
  'tests · Back from guided returns to Tests',
  'bookshelf · titled Bookshelf',
  'bookshelf · the bookmarks stand on the shelf',
  "bookshelf · today's reading opens its article",
  'bookshelf · Back from the article returns to the shelf',
  "dictionary · the day's word stands under the search",
  "dictionary · a search puts the day's word away",
  'progress · unbegun goals send you to Review, never to Learn',
  'progress · Saved words & lists opens Saved',
  'progress · Back returns to Progress',
  'settings · the pace stands open and applies',
  'settings · language, colour theme, layout, sync, export, import and the builder note are here',
  'door · its one button says Review · 57 cards',
  'door · the button opens Review',
  'door · the menu: each place with a line saying what is inside',
  'door · no language switch on the door',
  'door · review opens its room',
  'door · bookshelf opens its room',
  'door · dictionary opens its room',
  'door · tests opens its room',
  'door · progress opens its room',
  'door · Back from review returns to the door',
  'door · Back from bookshelf returns to the door',
  'door · Back from dictionary returns to the door',
  'door · Back from tests returns to the door',
  'door · Back from progress returns to the door',
  'places · no page errors',
  'switch back · the current layout returns, unmarked',
  'switch back · the current tab bar after a reload',
  'link · ?layout=places applies, stays chosen and leaves the address',
  'focus · while a card is up: no top bar, no tab bar, no report button',
  'focus · the front shows no readings',
  'focus · a tap on the left half leaves the front',
  'focus · a tap on the right half turns the card',
  'focus · after the turn every kanji carries its reading',
  'focus · the turn keeps the passage whole, its lines at one pitch',
  'focus · the Readings switch returns the clean text',
  'focus · turning readings off moves no line',
  'focus · no page errors',
  'collection · a private collection page names its way back Review',
  'current · a fresh device opens the current layout',
  'current · while a card is up: no top bar, no tab bar, no report button',
  'current · a tap on the left half leaves the front',
  'current · a tap on the right half turns the card',
  'current · the Readings switch is on the back',
  'current · no page errors',
]);
export const EXPERIENCE_CASES = Object.freeze([
  'E01-clean',
  'E01-closed-radoc',
  'E02-neighbor',
  'E02-literal',
  'E03-browse-no-debt',
  'E04-palette-roster',
  'E04-return',
  'E05-one-tap-meaning',
  'E06-pre-capture-no-debt',
  'E06-explicit-enrollment-label',
  'E06-enrollment',
  'E07-study-visible',
  'E07-list-empty-validation',
  'E07-list-create',
  'E07-list-cancel',
  'E07-summary-surface',
  'E07-review-record',
  'E07-review-trace',
  'E15-export',
  'E08-no-auto-enrollment',
  'E09-requires-answer',
  'E09-answer-persists-back',
  'E09-no-auto-enrollment',
  'E10-reference-return',
  'E19-reference-320',
  'E19-reference-1280',
  'E10-browse-no-enrollment',
  'E13-current-shape-flow',
  'E13-skip-context',
  'E14-mirror',
  'E16-language-cycle',
  'E19-shelf-desktop',
  'E18-palette-reload',
  'E18-state-reload',
  'E17-empty-key',
  'E17-offline-safe',
  'E18-warm-offline',
  'E19-shelf-320',
  'E19-header-44',
  'E18-home',
  'E20-no-page-errors',
  'E20-frozen-assets',
]);
export const HOST_CASES = Object.freeze([
  'realCoreDictionary',
  'sharedRememberAndNamedList',
  'oneTapSave',
  'optionalListPopover',
  'addToListPointerToggle',
  'dictionaryRefreshPreservesListDraft',
  'explicitReviewEnrollment',
  'recursiveKanjiBack',
  'privateRootAndAssessmentPreserved',
  'englishDeliberateReveal',
  'frontLoadsNoDictionary',
  'requestsAllSameOriginGet',
  'deviceBackClosesHost',
  'sharedGrammarCapture',
]);
for (const engine of ['chromium', 'webkit'])
  defs[`personal-host-${engine}`] = {
    producer: 'prototypes/corridor/tools/verify-personal-host.mjs',
    paths: ['personal-host.json'],
    expectedCases: () => HOST_CASES.map((id) => `${engine}/${id}`),
    validate(r, c) {
      const errors = [],
        q = (ok, why) => {
          if (!ok) errors.push(why);
        },
        expected = this.expectedCases();
      q(
        (envOf(c).PERSONAL_HOST_BROWSER || 'chromium') === engine &&
          r.engine === engine &&
          nonempty(r.browserVersion),
        'Personal host engine mismatch',
      );
      q(
        r.schemaVersion === 2 &&
          r.completed === true &&
          r.status === 'PASS' &&
          !r.error &&
          r.errors?.length === 0,
        'Personal host did not reach successful terminal',
      );
      q(
        nonempty(c.runId) &&
          r.runId === c.runId &&
          sha(c.artifactSha256) &&
          r.artifactSha256 === c.artifactSha256 &&
          sha(c.verifierSha256) &&
          r.verifierSha256 === c.verifierSha256,
        'Personal host invocation/artifact/verifier mismatch',
      );
      const observed = HOST_CASES.filter((id) => r[id] === true).map((id) => `${engine}/${id}`);
      q(exact(expected, observed), 'Personal host missing actual terminal assertion');
      return { passed: !errors.length, errors, expectedCases: expected, observedCases: observed };
    },
  };
export const LANGUAGE_ROOMS = Object.freeze([
  'drift',
  'shelf',
  'reader',
  'entry',
  'tray',
  'list',
  'browse',
  'srs-stats',
  'review',
  'probe',
  'archive',
  'dojo',
  'levels',
  'ai',
  'aiquiz',
  'lessons',
  'mock',
  'kagami',
  'thesaurus',
  'airead',
  'feed',
  'publisher',
  'source-inbox',
  'source-reader',
  'sentence-practice',
  'kanjidex',
  'yoji',
  'grammar',
  'guided',
  'search',
  'me',
  'settings',
  'front-navigation',
  'world-picker',
  'mirror-with-evidence',
  ...['review', 'probe', 'lesson'].flatMap((k) => [`${k}-question`, `${k}-answer`]),
  ...[
    'setup',
    'question',
    'explanation',
    'answer',
    'grammar-question',
    'grammar-explanation',
    'branch',
    'word',
    'summary',
    'results',
    'learn',
    'field',
    'sensei',
    'about',
  ].map((k) => `guided-${k}`),
  'mock-confirm',
  'mock-question',
  ...[
    'skip',
    'parts',
    'radical',
    'draw',
    'reading',
    'meaning',
    'strokes',
    'freq',
    'level',
    'kkld',
  ].map((k) => `search-${k}`),
  'shelf-tools',
  ...['word', 'kanji', 'radical', 'idiom', 'grammar', 'particle'].flatMap((k) => [
    `sheet-${k}`,
    `sheet-${k}-details`,
  ]),
  'word-save-destinations',
  'word-new-list',
  'variants',
  ...['n2', 'n1', 'senmon', 'kotoba', 'mcd', 'context'].flatMap((k) => [
    `deck-${k}`,
    `deck-${k}-question`,
    `deck-${k}-answer`,
    ...(k === 'context' ? [] : [`deck-${k}-settings`]),
  ]),
  ...[
    'home',
    'import-preview',
    'study',
    'answer',
    'dictionary',
    'dictionary-meanings',
    'read',
    'connections',
    'settings',
  ].map((k) => `personal-${k}`),
]);
export const LANGUAGE_STAMPS = Object.freeze({
  drift: 'door',
  entry: 'entry',
  shelf: 'shelf',
  reader: 'reader',
  tray: 'tray',
  list: 'list',
  browse: 'browse',
  'srs-stats': 'progress',
  review: 'review',
  probe: 'probe',
  archive: 'archive',
  dojo: 'learn',
  deckplay: 'deckplay',
  contextdeck: 'contextdeck',
  personaldeck: 'personal',
  aiquiz: 'quiz',
  levels: 'reference',
  ai: 'tutor',
  lessons: 'lessons',
  mock: 'jlpt',
  kagami: 'progress',
  thesaurus: 'word-web',
  airead: 'personal-reading',
  feed: 'feed',
  publisher: 'publisher',
  'source-inbox': 'source-inbox',
  'source-reader': 'source-reader',
  'sentence-practice': 'sentence-practice',
  kanjidex: 'kanji',
  yoji: 'idioms',
  grammar: 'grammar',
  guided: 'guided',
  search: 'search',
  me: 'me',
  settings: 'settings',
});
function languageRoomView(room) {
  if (room === 'aiquiz') return 'tray';
  if (['front-navigation', 'world-picker'].includes(room)) return 'drift';
  if (room === 'mirror-with-evidence') return 'kagami';
  if (room.startsWith('lesson-')) return 'lessons';
  for (const view of ['review', 'probe', 'guided', 'mock', 'search'])
    if (room.startsWith(`${view}-`)) return view;
  if (
    room === 'shelf-tools' ||
    room.startsWith('sheet-') ||
    ['word-save-destinations', 'word-new-list', 'variants'].includes(room)
  )
    return 'shelf';
  if (room.startsWith('deck-context')) return 'contextdeck';
  if (room.startsWith('deck-')) return 'deckplay';
  if (room.startsWith('personal-')) return 'personaldeck';
  return room;
}
export const LANGUAGE_ROOM_VIEWS = Object.freeze(
  Object.fromEntries(LANGUAGE_ROOMS.map((room) => [room, languageRoomView(room)])),
);
defs['redesign-language'] = {
  producer: 'tools/lint-ui-language.mjs',
  paths: ['ui-language/report.json'],
  expectedCases: () =>
    ['EN', '日本語'].flatMap((l) => LANGUAGE_ROOMS.map((room) => `${l}/${room}`)),
  validate(r, c) {
    const errors = [],
      q = (ok, why) => {
        if (!ok) errors.push(why);
      },
      expected = this.expectedCases(),
      observed = r.results.map((row) => `${row.language}/${row.room}`);
    q(
      c.engine === 'chromium' &&
        c.artifactVerifiedBeforeAndAfter === true &&
        sha(c.artifactSha256) &&
        sameSite(r.artifact, c.site),
      'Language tour artifact/engine mismatch',
    );
    q(!(c.args || c.argv || []).includes('--core-only'), 'Core-only language run');
    q(exact(expected, observed), 'Language room/language missing, duplicate or extra');
    q(r.errors?.length === 0 && r.issues?.length === 0, 'Language errors/issues');
    for (const row of r.results) {
      const sh = row.shell;
      q(
        !row.error &&
          row.issues?.length === 0 &&
          row.contractIssues?.length === 0 &&
          Number.isInteger(row.inspected) &&
          (row.language === 'EN' ? row.inspected > 0 : row.inspected >= 0),
        `Language inspection failed ${row.room}`,
      );
      q(
        sh &&
          Object.hasOwn(LANGUAGE_ROOM_VIEWS, row.room) &&
          Object.hasOwn(LANGUAGE_STAMPS, LANGUAGE_ROOM_VIEWS[row.room]) &&
          row.view === LANGUAGE_ROOM_VIEWS[row.room] &&
          sh.view === row.view &&
          sh.stamp === LANGUAGE_STAMPS[row.view] &&
          typeof sh.quiet === 'boolean' &&
          sh.activeTabs === (sh.quiet ? 0 : 1) &&
          (sh.quiet || sh.tabs === 1),
        `Language shell mismatch ${row.room}`,
      );
    }
    return { passed: !errors.length, errors, expectedCases: expected, observedCases: observed };
  },
};
defs['places-layout'] = named({
  producer: 'prototypes/corridor/tools/verify-places-layout.mjs',
  path: 'places-layout.json',
  roster: PLACES_CASES,
  direct: true,
  extra(r, c, q) {
    q(
      c.engine === 'chromium' &&
        r.suite === 'places-layout' &&
        r.pass === true &&
        r.passed === PLACES_CASES.length &&
        r.failed === 0 &&
        nonempty(r.completedAt),
      'Incomplete places tour',
    );
  },
});
export const EXPERIENCE_ASSETS = Object.freeze([
  'index.html',
  'corridor.js',
  'corridor.css',
  'drift-layer.js',
  'drift-layer.css',
  'reference-ui.js',
  'reference-ui.css',
  'reference-core.js',
  'data/share_alike/reference-extra.json',
]);
const runtime = (c, path) =>
  Array.isArray(c.runtimeFiles)
    ? c.runtimeFiles.find((f) => f.path === path)?.sha256
    : c.runtimeFiles?.[path];
defs['experience-require-skip'] = {
  producer: 'prototypes/corridor/tools/verify-experience.mjs',
  paths: ['results.json'],
  expectedCases: () => EXPERIENCE_CASES,
  validate(r, c) {
    const errors = [],
      q = (ok, why) => {
        if (!ok) errors.push(why);
      },
      expected = this.expectedCases(),
      observed = r.checks.map((row) => row.id);
    q(
      c.engine === 'chromium' &&
        r.requiredSkip === true &&
        sameSite(r.root, c.site) &&
        sha(c.artifactSha256) &&
        r.artifactSha256 === c.artifactSha256 &&
        c.artifactVerifiedBeforeAndAfter === true,
      'Experience requires SKIP and pinned Chromium artifact',
    );
    q(
      exact(expected, observed) &&
        r.checks.every(
          (row) => row.status === 'pass' && nonempty(row.expected) && nonempty(row.observed),
        ),
      'Experience missing/duplicate/skipped/failed check',
    );
    q(
      r.summary?.passed === expected.length &&
        r.summary.failed === 0 &&
        r.summary.skipped === 0 &&
        nonempty(r.finished) &&
        r.finalState &&
        r.pageErrors?.length === 0 &&
        r.providerRequests?.length === 0,
      'Experience incomplete/error/provider request',
    );
    q(
      r.assetsChangedDuringRun === false &&
        exact(EXPERIENCE_ASSETS, Object.keys(r.assetHashes || {})) &&
        exact(EXPERIENCE_ASSETS, Object.keys(r.assetHashesAtEnd || {})),
      'Experience tracked asset inventory changed',
    );
    for (const path of EXPERIENCE_ASSETS)
      q(
        sha(runtime(c, path)) &&
          r.assetHashes[path] === runtime(c, path) &&
          r.assetHashesAtEnd[path] === runtime(c, path),
        `Experience runtime identity ${path}`,
      );
    return { passed: !errors.length, errors, expectedCases: expected, observedCases: observed };
  },
};
export const KOTOBA_PILOTS = Object.freeze(['km-240-m06', 'km-064-m08', 'km-110-m07']);
function pilotIdentity(c, id) {
  const deck = c.readArtifactJson?.('decks/kotoba-mcd/deck.json');
  const word = deck?.words?.find((w) => w.cards?.some((card) => card.id === id));
  const card = word?.cards.find((card) => card.id === id);
  if (deck?.id !== 'kotoba-mcd' || !card || !word.id) throw Error(`Missing pinned pilot ${id}`);
  return { deckId: deck.id, wordId: word.id, cardId: id, cardSha256: digest(card) };
}
const pilotSuffix = (f) => `${f.deckId}/${f.wordId}/${f.cardId}/${f.cardSha256}`;
export function kotobaExpectedCases(engine, context = {}) {
  const pilot = KOTOBA_PILOTS.map((id) => pilotIdentity(context, id));
  return KOTOBA_SITES.flatMap((site) => {
    let suffixes = [''];
    if (site.id === 'K006') suffixes = ['/kotoba-mcd', '/kotoba-mine'];
    else if (site.id === 'K093')
      suffixes = ['/km-109-m05/hokusai', '/km-109-m05/yoru', '/km-298-m02/hokusai'];
    else if (['K111', 'K112'].includes(site.id)) suffixes = ['/kotoba-mcd', '/kotoba-mine'];
    else if (['K132', 'K133'].includes(site.id)) suffixes = ['/hokusai', '/yoru'];
    else if (Number(site.id.slice(1)) >= 47 && Number(site.id.slice(1)) <= 54)
      suffixes = pilot.map((f) => `/${pilotSuffix(f)}`);
    return (site.phase === 'data' ? ['data'] : engines(engine)).flatMap((e) =>
      suffixes.map((s) => `${e}/${site.id}${s}`),
    );
  });
}
defs['deck-player-browser'] = {
  producer: 'prototypes/corridor/tools/verify-kotoba-mine.mjs',
  paths: ['kotoba-mine.json'],
  expectedCases: kotobaExpectedCases,
  validate(r, c) {
    const errors = [],
      q = (ok, why) => {
        if (!ok) errors.push(why);
      },
      expected = this.expectedCases(c.engine, c);
    const observed = r.results.map(
      (row) =>
        `${row.engine ?? 'data'}/${row.caseId}${row.fixture ? '/' + pilotSuffix(row.fixture) : ''}`,
    );
    q(
      r.schemaVersion === 2 &&
        nonempty(c.runId) &&
        r.runId === c.runId &&
        r.scope === 'full' &&
        r.failures === 0,
      'Deck invocation incomplete/filtered/failed',
    );
    q(
      sha(c.artifactSha256) &&
        r.artifactSha256 === c.artifactSha256 &&
        sha(c.verifierSha256) &&
        r.verifierSha256 === c.verifierSha256,
      'Deck artifact/verifier mismatch',
    );
    q(
      exact(expected, observed) &&
        exact(engines(c.engine), r.engines) &&
        exact(engines(c.engine), Object.keys(r.browserVersions || {})) &&
        Object.values(r.browserVersions).every(nonempty),
      'Deck exact fixture/case/engine roster mismatch',
    );
    for (const row of r.results) {
      const site = KOTOBA_SITES.find((site) => site.id === row.caseId?.split('/')[0]);
      q(
        row.pass === true && site && nonempty(row.name) && (site.dynamic || site.name === row.name),
        'Deck completion predicate/name failed',
      );
    }
    return { passed: !errors.length, errors, expectedCases: expected, observedCases: observed };
  },
};
export const deckReportContracts = Object.freeze(
  Object.fromEntries(
    Object.entries(defs).map(([name, contract]) => [
      name,
      Object.freeze({
        ...contract,
        validate(report, context = {}) {
          try {
            const inputs = context.args || context.argv || [],
              environment = envOf(context);
            if (
              inputs.some((arg) => /^--(?:case|only|boundary-only|core-only)(?:=|$)/u.test(arg)) ||
              deckReportNarrowingEnvironment.some((key) => Object.hasOwn(environment, key))
            )
              throw Error('Narrowed invocation cannot accept');
            return contract.validate(report, context);
          } catch (error) {
            return {
              passed: false,
              errors: [`Missing/malformed ${name}: ${error.message}`],
              expectedCases: [],
              observedCases: [],
            };
          }
        },
      }),
    ]),
  ),
);
export function validateDeckReport(name, report, context = {}) {
  return (
    deckReportContracts[name]?.validate(report, context) || {
      passed: false,
      errors: [`Unsupported deck gate ${name}`],
      expectedCases: [],
      observedCases: [],
    }
  );
}
