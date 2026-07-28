# Era coverage — what the dictionary tier can actually place

**Lane:** Campaign E, Wave A′ / A2′ (`agent/bunki-e-era`)
**Measured:** 2026-07-28
**Produced by:** `packages/domain/test/graph/era-corpus.test.ts`, which calls the
shipped `attributeLexemeEra` / `summariseEraCoverage` in
`packages/domain/src/graph/era.ts`. Nothing below was computed by a throwaway
script or typed in by hand.

---

## Headline

**9.8% of the 3,000-lexeme dictionary tier can be placed on an era layer.**
All 295 of them land on 古道 `kodo`, all by one rule. **街道 `kaido` and 鉄道
`tetsudo` cannot be populated from this data at all** — 0 lexemes each, and not
because the rules missed: because no rule for them exists that would not be a
guess.

---

## The run

```
3,000-lexeme dictionary tier: 3000 lexemes
  placed on a layer: 295 (9.8%)
  kodo 295 / kaido 0 / tetsudo 0 / unknown 2705
  native_single_morpheme     295  → kodo
  sino_japanese_reading     2389  → unknown
  native_compound             50  → unknown
  mixed_reading               45  → unknown
  reading_ambiguous            1  → unknown
  reading_unresolved         220  → unknown

phase-0 hand seed: 16 lexemes
  placed on a layer: 5 (31.3%)
  kodo 5 / kaido 0 / tetsudo 0 / unknown 11
  native_single_morpheme       5  → kodo
  sino_japanese_reading       11  → unknown
```

Two bases came back **zero** on this corpus and both zeros are informative:

- `foreign_script` — **0**. There is not one katakana-spelled headword in the
  3,000-lexeme tier (see "What the importer drops" below).
- `no_reading_evidence` — **0**. Every character of every headword had a
  KANJIDIC2 reading list, so the 90% that is unplaced is unplaced because the
  data cannot date it, not because the data is missing.

### Stratum, which is the axis that *is* derivable

| | count | share |
|---|---:|---:|
| stratum identified (native / Sino-Japanese / mixed) | 2,779 | 92.6% |
| era layer placed | 295 | 9.8% |

The gap between those two rows is the whole finding.

---

## How the corpus was reached

The dictionary tier is not on `agent/bunki-e-integration`; it lives on branch
`dict-view`. For the measurement its two files were checked out into
`packages/seed/data/dictionary/` and removed again — **no dictionary bytes are
committed on this lane's branch**, which keeps the share-alike confinement in
`packages/seed/README.md` intact.

```
git show dict-view:packages/seed/data/dictionary/lexemes.json > packages/seed/data/dictionary/lexemes.json
git show dict-view:packages/seed/data/dictionary/kanji.json   > packages/seed/data/dictionary/kanji.json
npx vitest run packages/domain/test/graph/era-corpus.test.ts
rm -rf packages/seed/data/dictionary
```

| | |
|---|---|
| `dict-view` head | `0b3400a10ee1bc851bba6a1fccd4ff8478f042eb` |
| `dictionary/lexemes.json` sha256 | `5d04b23b7daa78f7fd4e9035d86932da820eb4cc32c4981f7adbf80fbc1ad968` |
| `dictionary/kanji.json` sha256 | `debd46c45dcce683380df5fb47ce8f506e24186e215d1d7856726253968bb3fb` |

Both digests match the ones `packages/seed/data/dictionary/manifest.json`
records for its own outputs, so the bytes measured are the committed bytes.

The test needs no edit when the dictionary lands on this line — it reads
whichever tiers are present under `packages/seed/data/` and skips, loudly, when
there are none.

---

## The rule that places, stated exactly

> A headword that is **one ideograph**, optionally followed by exactly the
> okurigana KANJIDIC2 records for that reading, whose lexeme reading is
> **exactly** one of that character's kun readings and **not** also one of its on
> readings, is a single native morpheme (和語) and is placed on 古道.

山 やま, 手 て, 話す はなす. The design document
(`BUNKI_THE_MAP_AS_VOYAGE_THROUGH_TIME_2026-07-28.md` §2) assigns "訓読み, native
vocabulary" to the 古道 layer, and the native lexical stratum predates every road
on the map.

**What this rule claims and does not claim:** it places a *stratum*, not a date.
It does not assert a first attestation, and there is nothing in the corpus that
could support one.

---

## Why nothing else is placed

| Refused | Count | Why |
|---|---:|---|
| Sino-Japanese reading | 2,389 | 漢語 spans all three layers. 電話 (Meiji coinage) and 世界 (Buddhist import, a millennium older) are the same object in this data: two on-readings. Separating them would be invention. |
| Native compound | 50 | Morpheme stratum does not transfer to a compound. 取締役 とりしまりやく is native throughout and is a Meiji office. |
| Mixed reading (重箱/湯桶) | 45 | Undated for the same reason the pure cases are. |
| Reading ambiguous | 1 | The reading is listed as both an on and a kun reading of the character. |
| Reading unresolved | 220 | The reading could not be exactly reconstructed from the characters' recorded readings — mostly nominalised verb stems whose okurigana differs from KANJIDIC2's citation form (疑い vs `うたが.う`) and full-width-numeral headwords (９月). |
| Katakana spelling | 0 available | Orthography is not etymology. パン and ガラス are Edo-period Portuguese and Dutch loans, ドキドキ is native onomatopoeia, イヌ is native. A katakana→鉄道 rule would put Edo bread on a Meiji train and nothing in the data would ever contradict it. |
| Kanji characters | n/a | Never placed at all. 駅 is the design document's own worked example *because* it is a 駅家 post-station, a 宿場 and a railway station at once. |

---

## What the importer drops — the highest-value fix, and it is not in this lane

The brief for this lane suggested katakana loanwords with an explicit
source-language field would be identifiable as modern borrowings. **They are not,
for two independent reasons**, both verified in
`packages/seed/scripts/import-sources.mjs` on `dict-view`:

1. **`parseJMdict` never reads `<lsource>` or `<misc>`.** It reads `ent_seq`,
   `keb`, `reb`, `ke_pri`/`re_pri`, `pos` and `gloss`, and nothing else. So the
   source-language field and the `arch` / `obs` / `rare` markers — the only
   fields in JMdict that carry anything era-shaped — are absent from the shipped
   bytes. (`<lsource>` would not have dated a loan either, but it would at least
   have separated 外来語 from native katakana; `misc=arch` genuinely would have
   given the 古道 layer a second, independent population.)

2. **`selectLexemes` filters on `entry.hasKanji`**, so kana-only entries are
   excluded from the subset by construction. Measured consequence: **0 of 3,000
   headwords are written in katakana.** Every loanword the tier contains is one
   with a kanji spelling.

The 34 distinct `pos` labels the tier does carry were enumerated and contain no
era signal at all — they are grammatical categories (`noun (common)`,
`transitive verb`, `Godan verb with 'ru' ending`, …).

**Recommendation for the seed lane, not acted on here** (this lane owns
`packages/domain/src/graph/**` and `packages/domain/src/journey/**` only): if
Wave B wants more than one populated era layer, the change with the best return
is to parse `<misc>` and `<lsource>` in `import-sources.mjs` and carry them onto
the lexeme record. `misc=arch`/`obs` is a genuine, upstream-authored,
citable marker of the archaic stratum. Nothing the domain can compute
substitutes for it.

---

## What this means for Wave B

1. **The 街道 and 鉄道 layers have no data.** A three-layer map built on this
   corpus is a map with one populated layer, one large "stratum known, era
   undetermined" band, and two empty layers. Design for that, or change the data
   first.
2. **`unknown` is the majority state and must render as a first-class place**,
   not as a fallback onto 古道. `EraAttribution` carries an `EraBasis` for
   exactly this: the map can say *why* it does not know, and the reasons differ.
3. **`stratum` is the axis worth rendering.** 92.6% of the corpus has an
   identified lexical stratum. That is a true, sourced, useful thing to show, and
   it is not a date.
