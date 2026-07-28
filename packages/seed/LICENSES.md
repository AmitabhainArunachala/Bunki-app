# `@bunki/seed` — licences and attributions

**Scope.** This file covers every asset in `packages/seed/`. Share-alike source
data is accepted in this package and only this package (controller §4,
REQ-SRC-02, DL-33); it must not leak into `@bunki/domain`, `@bunki/persistence`,
`@bunki/ai`, `@bunki/export`, or `apps/app`.

**Repository licence: pending operator decision** (OD-09). Nothing recorded here
constrains that choice beyond what the controller already accepts.

**Machine-readable half.** `data/licences.json` binds each provenance source to
the licence texts that back it, with byte lengths and sha256 digests.
`test/edrdg.test.ts` checks that binding three ways — files exist and hash as
recorded; every path and digest here appears in this document; every third-party
source has backing — and, crucially, that a source claiming a licence with no
text on file **fails**. The prose below and the bytes on disk cannot drift apart
without the suite going red.

---

## What the states in this file mean

Controller §8 requires each licence text to be checked **against the primary
source**, with URLs and retrieval dates recorded. There are three states, and
the boundaries between them are the point:

- **VERIFIED (primary source)** — the text was retrieved over HTTPS from the
  source project's own artefacts during a build session, and is reproduced here
  byte-for-byte. URL, retrieval date and sha256 recorded.
- **LICENSED REDISTRIBUTION** — the licensor's own host was unreachable, so the
  content **and the licensor's own licence statement** were taken together from
  one pinned, sha256-verified artefact published by a named project, and the
  upstream entry identifiers shipped are the licensor's real ones. What is _not_
  claimed: that the licensor's host was reached, or that the statement is
  current. Provenance records carry `review_status: "licensed-redistribution"`,
  which the app renders differently from a primary-source citation.
- **DEFERRED** — the source could not be reached and no artefact carrying both
  its data and its licence text could be found. **No content from that source is
  shipped**, and no licence text for it is reproduced.

There is still **no "verified from a mirror" state**, and this document has not
quietly acquired one. A redistribution is not a licensor. The middle state is
narrower than a mirror in three specific ways: the artefact is pinned by digest,
the licence statement travels inside that same artefact rather than being
sourced separately, and the name of the redistributor is recorded here and in
every affected provenance record. A repackaging that fails any of those three —
as `kotobako-data` on npm did — is refused, not downgraded.

Retrieval dates: KanjiVG material **2026-07-27**; EDRDG material **2026-07-28**.
Toolchain: `curl` through this session's egress proxy, `git ls-remote` for the
pinned KanjiVG commit, `node:sqlite` for reading the pinned database.

---

## 1. KanjiVG — VERIFIED (primary source)

**Used for:** the ten stroke-order SVG files in `data/strokes/`, and the stroke
counts, component decompositions and radical labels in `data/kanji.json` that are
read out of them.

|                     |                                                                         |
| ------------------- | ----------------------------------------------------------------------- |
| Project             | KanjiVG                                                                 |
| Copyright           | Ulrich Apel                                                             |
| Licence             | Creative Commons Attribution-Share Alike 3.0 (CC BY-SA 3.0)             |
| Licence URI         | http://creativecommons.org/licenses/by-sa/3.0/                          |
| Upstream repository | https://github.com/KanjiVG/kanjivg                                      |
| Pinned commit       | `61e39cfc29724132a6f8823b166296932985a0ff`                              |
| Commit resolved by  | `git ls-remote https://github.com/KanjiVG/kanjivg.git HEAD`             |
| Retrieved           | 2026-07-27                                                              |
| Modification status | **unmodified** — byte-identical copies, in-file copyright header intact |

### 1.1 Licence statement, verbatim from the project's `README.md`

Retrieved from
`https://raw.githubusercontent.com/KanjiVG/kanjivg/61e39cfc29724132a6f8823b166296932985a0ff/README.md`
(sha256 `aae5625e1f622110886950779e9c40ffdc6f794b32c0aed7f382e04a682de54a`):

```text
Licence
-------
KanjiVG is copyright Ulrich Apel and released under the Creative Commons
Attribution-Share Alike 3.0 licence:

http://creativecommons.org/licenses/by-sa/3.0/

See the file COPYING for more details.
```

### 1.2 Attribution requirement, verbatim from the header of every SVG we ship

Every file in `data/strokes/` carries this header upstream, and still carries it
here (`test/strokes.test.ts` fails if a file loses it):

```text
Copyright (C) 2009/2010/2011 Ulrich Apel.
This work is distributed under the conditions of the Creative Commons
Attribution-Share Alike 3.0 Licence. This means you are free:
* to Share - to copy, distribute and transmit the work
* to Remix - to adapt the work

Under the following conditions:
* Attribution. You must attribute the work by stating your use of KanjiVG in
  your own copyright header and linking to KanjiVG's website
  (http://kanjivg.tagaini.net)
* Share Alike. If you alter, transform, or build upon this work, you may
  distribute the resulting work only under the same or similar license to this
  one.

See http://creativecommons.org/licenses/by-sa/3.0/ for more details.
```

### 1.3 Full licence text

The upstream `COPYING` file — the CC BY-SA 3.0 Unported legal code as the
licensor distributes it — is shipped verbatim at
[`licenses/KanjiVG-COPYING.txt`](licenses/KanjiVG-COPYING.txt).

- Retrieved from
  `https://raw.githubusercontent.com/KanjiVG/kanjivg/61e39cfc29724132a6f8823b166296932985a0ff/COPYING`
- sha256 `d255e07978fd16ddfec38bc59dc9d857b885dd44ddbf4e79baf207d30746bdcc`
- 20,595 bytes

Its digest is recorded in `data/strokes.json` and re-checked offline by
`test/strokes.test.ts`.

### 1.4 How this project complies

> **This product includes stroke-order data from KanjiVG**
> (https://kanjivg.tagaini.net, https://github.com/KanjiVG/kanjivg), copyright
> Ulrich Apel, licensed under Creative Commons Attribution-Share Alike 3.0
> (http://creativecommons.org/licenses/by-sa/3.0/). The KanjiVG files in
> `packages/seed/data/strokes/` are unmodified. Stroke counts, component
> decompositions and radical labels in `packages/seed/data/kanji.json` are derived
> from those files and are share-alike under the same licence.

- **Attribution** — the statement above, the per-field `attribution` in every
  KanjiVG provenance record, and the untouched in-file headers.
- **Link to the project's website** — as the licence text explicitly requires:
  https://kanjivg.tagaini.net
- **Share-alike** — the derived fields (`strokeCount`, `components`, `radicals`)
  are labelled `modification_status: "derived"`, licence `CC BY-SA 3.0`, and are
  confined to this package. The verbatim SVGs are labelled `"unmodified"`.
- **Notices kept intact** — no minification, no reformatting, no header stripping.
  This is enforced, not promised: `test/strokes.test.ts` re-hashes every file and
  re-derives every extracted value from the bytes.

### 1.5 Files covered

| Kanji | File                     | Upstream path     | sha256                                                             |
| ----- | ------------------------ | ----------------- | ------------------------------------------------------------------ |
| 分    | `data/strokes/05206.svg` | `kanji/05206.svg` | `7f35124e1d19f45141fa626534463505161ec1a01650f12674e91a74163e56bc` |
| 岐    | `data/strokes/05c90.svg` | `kanji/05c90.svg` | `4a3f0b6b133dc55a6650b1c0da0072e201b1fc0985fef3ab3caa124cb4837747` |
| 点    | `data/strokes/070b9.svg` | `kanji/070b9.svg` | `08bdd5dc492062f15d5af697a9c9e3b77f7cda3c81a956bcc22430f05d2618d1` |
| 路    | `data/strokes/08def.svg` | `kanji/08def.svg` | `1470a638ff41ef992542514a23396dc3c4a3dddc261c615fd2aab71b3bbc1c87` |
| 線    | `data/strokes/07dda.svg` | `kanji/07dda.svg` | `1c403c0ec912451fd418f6f92b40c7497b01c152bbb4d4b09d201abd39b5ed9a` |
| 道    | `data/strokes/09053.svg` | `kanji/09053.svg` | `826fd1adbf301491c5c726fedb4d3dec4089760dd40a6824c83403f0c4b86418` |
| 車    | `data/strokes/08eca.svg` | `kanji/08eca.svg` | `1b9d847cf86b897afd0bf64a73e9b7447784ef1f7a39e253dca61b0f6ad7aac5` |
| 駅    | `data/strokes/099c5.svg` | `kanji/099c5.svg` | `a3eec84d7f07d22db7b6f81725ddb52d1a1395b8fb25d5a93d910ed83731e559` |
| 自    | `data/strokes/081ea.svg` | `kanji/081ea.svg` | `ac161a62094277640b9dd24ec0c1f6e4d261c92708f4c81eca17651efd1774bc` |
| 部    | `data/strokes/090e8.svg` | `kanji/090e8.svg` | `f29343890de2226fdb7d13f5f156c802f8cedffa5355180d9756fac83b0dc0e3` |

Re-verify against upstream at any time:

```bash
node packages/seed/scripts/fetch-kanjivg.mjs --check
```

---

## 2. EDRDG — JMdict / KANJIDIC2 — VERIFIED (primary source)

**Used for:** every lexeme `reading`, `partOfSpeech` and `senses` value in
`data/lexemes.json` and `data/dictionary/lexemes.json` (JMdict), and every kanji
`onReadings`, `kunReadings`, `meanings`, `grade`, `strokeCount`, `frequency` and
`jlpt` value in `data/kanji.json` and `data/dictionary/kanji.json` (KANJIDIC2).

This closes deferral **D-1a**. The operator changed the egress policy on
2026-07-28; `www.edrdg.org` now answers, so the licensor's own statement and the
licensor's own data files were read directly and the redistribution route was
abandoned. The correction that came out of it is not cosmetic — see §2.2.

| Host                        | 2026-07-27 | 2026-07-28 (earlier) | 2026-07-28 (now) |
| --------------------------- | ---------- | -------------------- | ---------------- |
| `www.edrdg.org`             | refused    | refused              | **200**          |
| `creativecommons.org`       | refused    | refused              | **200**          |
| `downloads.tatoeba.org`     | refused    | refused              | **200**          |
| `raw.githubusercontent.com` | 200        | 200                  | 200              |
| `ftp.edrdg.org`             | refused    | refused              | still refused    |
| `codeload.github.com`       | —          | 403                  | 403              |

`ftp.edrdg.org` remains unreachable (bad TLS certificate, plain HTTP refused).
It is not needed: `www.edrdg.org` serves the identical files, and that is where
everything below came from.

### 2.1 The artefacts

Downloaded from the licensor's own host by
`scripts/import-sources.mjs`. The archives themselves are **not** committed
(~12 MB compressed, ~75 MB expanded); their digests are recorded in
`data/dictionary/manifest.json`, which is committed, so any shipped gloss can be
traced to the exact upstream bytes it was read from.

|           | JMdict                                          | KANJIDIC2                                            |
| --------- | ----------------------------------------------- | ---------------------------------------------------- |
| URL       | `https://www.edrdg.org/pub/Nihongo/JMdict_e.gz` | `https://www.edrdg.org/pub/Nihongo/kanjidic2.xml.gz` |
| Bytes     | 10,523,044                                      | 1,488,563                                            |
| Retrieved | 2026-07-28                                      | 2026-07-28                                           |
| Contents  | 218,148 entries (English edition)               | 13,108 characters                                    |

Exact sha256 for both is in `data/dictionary/manifest.json` under `sources`.
Re-verify the committed output against it, offline:

```bash
node packages/seed/scripts/import-sources.mjs --check
```

Re-download and re-derive everything from upstream:

```bash
NODE_USE_ENV_PROXY=1 node packages/seed/scripts/import-sources.mjs --lexemes=3000
```

The superseded route is recorded rather than erased: the previous round took
these files from the `jamdict-data` 1.5 sdist on PyPI, because EDRDG's hosts were
refused. That artefact carried JMdict 1.08 compiled 2021-04-17 with KANJIDIC2
dated April 2008. It is no longer used, and `licenses/EDRDG-licence-statement.md`
(the copy bundled with it) has been removed in favour of the licensor's own.

|                 |                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package         | `jamdict-data` 1.5 — the data package of the `jamdict` project                                                                                    |
| Publisher       | Le Tuan Anh — https://github.com/neocl/jamdict_data, https://github.com/neocl/jamdict                                                             |
| Why this one    | it is the project's **own** distribution channel, not a third-party scrape, and it bundles the EDRDG licence statement beside the data it governs |
| sdist URL       | `https://files.pythonhosted.org/packages/97/a5/075928aed2b3b70459fc1db396397dfa6714d266c143c51af9b648551a4e/jamdict_data-1.5.tar.gz`              |
| sdist sha256    | `a4247dd9bb3148ab17c1b32fc56d7a7f1c35293b0d6ff2838c811f896d13f415` (53,940,912 bytes)                                                             |
| `jamdict.db.xz` | sha256 `124577d8f2c44841f1f4ec43ac5413be81770ce3ed60ea917bae6c5944d88d39`                                                                         |
| Contents        | JMdict 191,541 entries; KANJIDIC2 13,108 characters (also JMnedict, KRADFILE — neither used)                                                      |
| Database `meta` | `jmdict.version=1.08`, `kanjidic2.version=1.6`, `kanjidic2.date=April 2008`                                                                       |
| Compiled        | 2021-04-17                                                                                                                                        |
| Retrieved       | 2026-07-28                                                                                                                                        |

Recorded in `data/edrdg-upstream.json`. Re-verify — this re-downloads, re-checks
every digest, and re-derives every shipped value from the database:

```bash
node packages/seed/scripts/fetch-edrdg.mjs --check
```

### 2.2 Licence statement, verbatim — and a version correction

The EDRDG **General Dictionary Licence Statement** is shipped verbatim, exactly
as served, at
[`licenses/EDRDG-licence-statement.html`](licenses/EDRDG-licence-statement.html).

- 13,587 bytes, sha256 `52f60ea9ca68170a2f0663d7dba381ebf1bd57c17a3347dfe21153865c156692`
- Retrieved from `https://www.edrdg.org/edrdg/licence.html` on 2026-07-28
- Stored as the bytes the licensor served — no HTML stripping, no reflow.
  `.prettierignore` covers `licenses/` so a formatter cannot rewrite a document
  published as an exact copy.

Quoted from §3 of that file:

```text
The dictionary files are made available under a Creative Commons
Attribution-ShareAlike Licence (V4.0).
```

**The correction.** The previous round labelled this data **CC BY-SA 3.0**, and
every EDRDG provenance record in the package said 3.0. That came from the licence
copy bundled in the `jamdict-data` sdist, which is what could be reached at the
time; the round recorded the discrepancy as open item D-1a rather than guessing.
Reading the licensor's own statement settles it: **the licence is V4.0**, the
3.0 label was wrong, and every provenance record, the machine-readable registry
and the on-screen disclosure have been corrected to 4.0. This is the concrete
reason the "fetch the licence from the licensor, not from whoever is reachable"
rule is worth its cost — a redistributor's bundled copy was a licence version
behind, and nothing inside the package could have detected that on its own.

§3 also fixes how attribution must be shown, and the wording is specific:

```text
If a WWW server is providing a dictionary function or an on-screen
display of words from the files, the acknowledgement must be made on each
screen display, e.g. in the form of a message at the foot of the screen
or page.

For smartphone and tablet apps, acknowledgement must be made, e.g. on a
separate screen accessed from a menu, such as one labelled "About",
"Sources", etc. It is not sufficient just to mention it on a
start-up/launch page of the app.
```

The two obligations are in different states, and this file previously conflated
them:

- **The WWW-server obligation is met.** `SEED_ENTRY_DISCLOSURE` renders on every
  screen that displays words from the files — the word page, the kanji page and,
  since this round, the **search screen**, which had been missed. A search result
  row is a reading, a set of senses and a part of speech; the screen displayed all
  three with no acknowledgement anywhere on it. See §2.4.
- **The smartphone/tablet obligation is not yet met, and no such app ships.**
  There is no Sources/About screen. Phase 0's only surface is Expo Web, where the
  first clause governs; the separate screen is an open coordination request
  against the app shell (`packages/seed/README.md`, "Status"). If a packaged
  mobile app is ever built from this tree, that screen is a precondition, not a
  follow-up.

### 2.3 Full licence text

The CC BY-SA 4.0 legal code the statement points at is shipped verbatim at
[`licenses/CC-BY-SA-4.0.html`](licenses/CC-BY-SA-4.0.html).

- 51,859 bytes, sha256 `a7dbad04e9a44a69a06d2ea5f20cceccb163091550591ed41ac610f112789246`
- Retrieved from `https://creativecommons.org/licenses/by-sa/4.0/legalcode` on
  2026-07-28 — Creative Commons' own host, not a mirror and not SPDX.

`licenses/CC-BY-SA-3.0.txt` (22,240 bytes, sha256
`3f941b3b89cf7b8370ceb83cc76d2120d471b58735d8ca60238a751a48d7f72f`, from the SPDX
license list on 2026-07-28) stays in the package, but it now backs **KanjiVG**,
which really is CC BY-SA 3.0. It no longer backs any EDRDG claim.

### 2.4 How this project complies

> **This product uses the JMdict and KANJIDIC2 dictionary files.** These files
> are the property of the Electronic Dictionary Research and Development Group,
> copyright James William BREEN and the EDRDG, and are used in conformance with
> the Group's licence.
> https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project
> https://www.edrdg.org/wiki/index.php/KANJIDIC_Project

- **Acknowledgement on the screen showing the words.** §3 of the statement is
  explicit that for a display of words from the files, the acknowledgement must
  appear on the display itself — an attribution living only in this file would
  not satisfy it. `SEED_ENTRY_DISCLOSURE` in `src/index.ts` therefore names
  JMdict, KANJIDIC2, the EDRDG and CC BY-SA 4.0, and is rendered on the word page,
  the kanji page **and the search screen**. `test/dataset.test.ts` and
  `test/edrdg.test.ts` fail if that string stops naming them;
  `apps/app/e2e/adv-claim-audit.spec.ts` drives each of those three surfaces in a
  browser and fails if the acknowledgement is absent from the rendered page.
  The search screen was missed until this round — it displayed JMdict readings,
  senses and parts of speech with no EDRDG string in the DOM at all, and the
  route was not in the e2e list, so nothing said so.
- **Documentation and licence files provided.** This file, plus the two verbatim
  texts above, shipped in the repository.
- **Share-alike.** The EDRDG-derived fields are labelled `CC BY-SA 3.0`,
  `modification_status: "derived"`, and are confined to this package.
- **Entry identifiers are real.** Every JMdict field carries that entry's real
  `ent_seq` in `source_entry_id`; every KANJIDIC2 field carries the literal,
  which is that file's entry identifier. Nothing is a placeholder.
- **Nothing claims more than it is.** `review_status` is
  `primary-source-verified` for these two sources, and only because
  `www.edrdg.org` itself answered this round — the files, the licence statement
  and every re-derived value came from the licensor's own host. When only the
  `jamdict-data` redistribution was reachable the status was
  `licensed-redistribution`, which is what that status is for.

### 2.5 What "derived" means for these fields, precisely

`modification_status: "derived"` is not hedging; it names a real transformation.
The seed schema stores senses, parts of speech and readings as **flat string
arrays**, so upstream structure is lost by the shape of the destination:

- `reading` — the entry's first kana element, in upstream order.
- `partOfSpeech` — every sense's part-of-speech values, upstream order, deduplicated.
- `senses` — every English gloss of every sense, upstream order, deduplicated;
  **sense boundaries are not preserved**.
- `onReadings` / `kunReadings` — `ja_on` / `ja_kun` readings across every
  KANJIDIC2 reading-meaning group, flattened.
- `meanings` — English meanings across those groups, flattened.

The extraction rules live in `scripts/fetch-edrdg.mjs` and are re-run by
`--check`. `SEED_ENTRY_DISCLOSURE` tells the user the lists are flattened.

**Fields not extracted.** §7 of the EDRDG statement attaches special conditions
to third-party material inside KANJIDIC2 — Halpern's SKIP codes, App's Four
Corner and Morohashi data, Spahn/Hadamitzky descriptors, De Roo codes, Korean
readings, Pinyin. **None of those fields are extracted or shipped**, so those
conditions do not arise. Nanori, dictionary references, query codes, variants,
JMnedict and KRADFILE are likewise untouched.

### 2.6 Which entries

`data/edrdg-upstream.json` records the full lexeme-id → `ent_seq` map. Five seed
headwords match more than one JMdict entry (岐路, 分, 車, 点, 道), so the mapping
is pinned in `scripts/fetch-edrdg.mjs` rather than re-resolved at run time — a
silent re-resolution could move a seed word to a different word between imports
without showing in a diff. The script refuses to run if a pinned `ent_seq` no
longer has the expected headword as its first kanji element.

---

## 3. Tatoeba — VERIFIED (primary source)

**Used for:** every record in `data/dictionary/sentences.json` —
2,000 Japanese sentences each paired with an English translation.

This closes deferrals **D-2** and **D-3**. All three blockers WP-04 recorded are
gone: `downloads.tatoeba.org` answers, the exports carry contributor usernames,
and `creativecommons.org` serves the CC BY 2.0 FR legal code that SPDX does not
publish.

### 3.1 Licence text, verbatim

[`licenses/CC-BY-2.0-FR.html`](licenses/CC-BY-2.0-FR.html)

- 39,707 bytes, sha256 `af0d7ada8b9be52a6874238f4533512d0b2568595bf7cb3427e41f7c38847b71`
- Retrieved from `https://creativecommons.org/licenses/by/2.0/fr/legalcode` on
  2026-07-28, from Creative Commons' own host

### 3.2 The artefacts

| File               | URL                                                                                     | Bytes       |
| ------------------ | --------------------------------------------------------------------------------------- | ----------- |
| Japanese sentences | `https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences_detailed.tsv.bz2` | 4,460,133   |
| English sentences  | `https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_detailed.tsv.bz2` | 34,779,571  |
| Translation links  | `https://downloads.tatoeba.org/exports/links.tar.bz2`                                   | 148,936,941 |

The `_detailed` exports are used deliberately in place of the plain ones: they
_can_ carry the contributing member's username, which the plain export never
does, and CC BY 2.0 FR attributes the individual author. "Can" is exact: the
export is a MySQL dump, and an ownerless sentence carries the NULL sentinel — the
two literal characters `\N` — in the username column. 100,087 of the 248,821
Japanese rows are like that.

### 3.3 How this project complies

Attribution is **per sentence, per half**. A Tatoeba pair is two works by two
people, so each record carries `japaneseId` + `japaneseContributor` and
`englishId` + `englishContributor` separately rather than one shared credit —
collapsing them would misattribute both, and each half also names its own
provenance registry entry (`tatoeba-japanese`, `tatoeba-english`).

**A pair with an unnamed contributor on either half is not shipped.** An
attribution licence cannot be complied with for a work whose author cannot be
named, so the importer drops those rather than crediting a placeholder: at the
committed parameters 1,009 candidate pairs were declined, recorded in
`data/dictionary/manifest.json` under `deferred` and counted as
`counts.sentencePairsDroppedWithoutNamedContributor`. Every one of the 2,000
sentences that does ship names both of its contributors.

> **This section previously claimed a compliance the tests did not enforce.** It
> said `test/dictionary.test.ts` "fails if any shipped sentence is missing either
> contributor". The assertion was `toBeTruthy()`, which the non-empty sentinel
> `\N` satisfies, and 652 of the 2,000 shipped records credited `\N` as a
> person — 211 Japanese halves and 591 English. The importer now maps the
> sentinel to null, the check is a positive name pattern with a negative case
> beside it, and the sentence above is true of the data rather than of the
> intention.

On screen, `SEED_ENTRY_DISCLOSURE` names the Tatoeba Project and CC BY 2.0 FR.

### 3.4 What is _not_ Tatoeba

The eight worked examples in `data/sentences.json`, the grammar examples in
`data/grammar.json` and the integration passage in `data/passages.json` remain
**original text written for this project**, labelled `bunki-authored-text`.
Now that real corpus sentences ship alongside them, `test/dataset.test.ts`
asserts that no §8 fixture record carries a Tatoeba label — mislabelling
project prose as corpus text is the mirror image of the error WP-04 avoided.

---

## 4. Content authored by this project

**Licence: pending operator decision (OD-09).** Original work of this project; no
third-party licence attaches. Provenance sources `bunki-authored-text`,
`bunki-editorial`, `bunki-selection`, `bunki-computed` in `data/provenance.json`.

This covers:

- the integration passage `pas-bunki-01` (「分かれた道」) — hand-written for the
  §10 screen-5 contextual reuse canvas, explicitly labelled with this project as
  its author. It is not AI-generated bridging material under REQ-SRC-01(5), and
  not adapted from any source;
- the eight example sentences and their translations;
- the three grammar constructions, their explanations and examples;
- selection decisions: which kanji and words the seed covers (`bunki-selection`),
  and values a machine recomputes from the record itself (`bunki-computed`).

What this **no longer** covers: lexeme readings, parts of speech and senses, and
kanji on/kun readings and meanings. Those were hand-assembled in WP-04 and are
now real EDRDG entries (§2). `bunki-editorial` remains in the registry for
anything that falls back to it, still labelled `unreviewed` with a null entry id.

---

## 5. Retrieval log

Every network retrieval, with its outcome.

| Retrieved  | Host                        | URL                                              | Result                                                                                |
| ---------- | --------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 2026-07-27 | `raw.githubusercontent.com` | KanjiVG `README.md` @ `61e39cf`                  | 200 — verified                                                                        |
| 2026-07-27 | `raw.githubusercontent.com` | KanjiVG `COPYING` @ `61e39cf`                    | 200 — verified                                                                        |
| 2026-07-27 | `raw.githubusercontent.com` | KanjiVG `kanji/*.svg` @ `61e39cf` (10 files)     | 200 — verified                                                                        |
| 2026-07-27 | `github.com` (git)          | `git ls-remote … HEAD`                           | ok — `61e39cfc29724132a6f8823b166296932985a0ff`                                       |
| 2026-07-27 | `www.edrdg.org`             | `/edrdg/licence.html`                            | **403 CONNECT refused** — D-1                                                         |
| 2026-07-27 | `www.csse.monash.edu.au`    | `/~jwb/edict.html`                               | **403 CONNECT refused** — D-1                                                         |
| 2026-07-27 | `tatoeba.org`               | `/en/terms_of_use`                               | **403 CONNECT refused** — D-2                                                         |
| 2026-07-27 | `downloads.tatoeba.org`     | `/exports/`                                      | **403 CONNECT refused** — D-2                                                         |
| 2026-07-27 | `creativecommons.org`       | `/licenses/by-sa/4.0/legalcode`                  | **403 CONNECT refused** — D-1                                                         |
| 2026-07-27 | `kanjivg.tagaini.net`       | `/`                                              | **403 CONNECT refused** — not needed; the project's repository served the same texts  |
| 2026-07-28 | `www.edrdg.org`             | `/jmdict/edict_doc.html`                         | **refused** — re-tested, unchanged                                                    |
| 2026-07-28 | `ftp.edrdg.org`             | `/pub/Nihongo/JMdict_e.gz`                       | **refused** — re-tested, unchanged                                                    |
| 2026-07-28 | `tatoeba.org`               | `/en/downloads`                                  | **refused** — re-tested, D-2 stands                                                   |
| 2026-07-28 | `downloads.tatoeba.org`     | `/exports/sentences.tar.bz2`                     | **refused** — re-tested, D-2 stands                                                   |
| 2026-07-28 | `creativecommons.org`       | `/licenses/by-sa/4.0/legalcode.txt`              | **refused** — re-tested                                                               |
| 2026-07-28 | `api.github.com`            | `/repos/scriptin/jmdict-simplified`              | **403** — no REST API; release assets unreachable                                     |
| 2026-07-28 | `codeload.github.com`       | `/KanjiVG/kanjivg/tar.gz/master`                 | **403** — no tarballs                                                                 |
| 2026-07-28 | `raw.githubusercontent.com` | `spdx/license-list-data` `text/CC-BY-SA-3.0.txt` | 200 — shipped at `licenses/CC-BY-SA-3.0.txt`                                          |
| 2026-07-28 | `raw.githubusercontent.com` | `spdx/license-list-data` `text/CC-BY-2.0-FR.txt` | **404** — SPDX does not carry this licence; D-2 stands                                |
| 2026-07-28 | `raw.githubusercontent.com` | `neocl/jamdict_data` `jamdict_data/LICENSE.md`   | 200 — shipped at `licenses/EDRDG-licence-statement.md`                                |
| 2026-07-28 | `raw.githubusercontent.com` | `scriptin/jmdict-simplified` `LICENSE.txt`       | 200 — CC BY-SA 4.0 legal code; licence reachable, its data is not                     |
| 2026-07-28 | `files.pythonhosted.org`    | `jamdict_data-1.5.tar.gz`                        | 200 — 53,940,912 bytes, sha256 verified                                               |
| 2026-07-28 | `pypi.org`                  | `/pypi/jamdict-data/json`                        | 200 — package metadata                                                                |
| 2026-07-28 | `registry.npmjs.org`        | `/kotobako-data`                                 | 200 — inspected and **rejected**, see below                                           |
| 2026-07-28 | `www.edrdg.org`             | `/edrdg/licence.html`                            | **200** — shipped at `licenses/EDRDG-licence-statement.html`; says CC BY-SA **V4.0**  |
| 2026-07-28 | `www.edrdg.org`             | `/pub/Nihongo/JMdict_e.gz`                       | **200** — 10,523,044 bytes, 218,148 entries                                           |
| 2026-07-28 | `www.edrdg.org`             | `/pub/Nihongo/kanjidic2.xml.gz`                  | **200** — 1,488,563 bytes, 13,108 characters                                          |
| 2026-07-28 | `creativecommons.org`       | `/licenses/by-sa/4.0/legalcode`                  | **200** — shipped at `licenses/CC-BY-SA-4.0.html`                                     |
| 2026-07-28 | `creativecommons.org`       | `/licenses/by/2.0/fr/legalcode`                  | **200** — shipped at `licenses/CC-BY-2.0-FR.html`; closes D-3                         |
| 2026-07-28 | `downloads.tatoeba.org`     | `jpn_sentences_detailed.tsv.bz2`                 | **200** — 4,460,133 bytes, 248,821 sentences with contributor names                   |
| 2026-07-28 | `downloads.tatoeba.org`     | `eng_sentences_detailed.tsv.bz2`                 | **200** — 34,779,571 bytes                                                            |
| 2026-07-28 | `downloads.tatoeba.org`     | `links.tar.bz2`                                  | **200** — 148,936,941 bytes                                                           |
| 2026-07-28 | `ftp.edrdg.org`             | any                                              | still refused — bad TLS certificate, plain HTTP refused; `www.edrdg.org` used instead |

The rows above the divide were recorded before the operator widened the egress
policy on 2026-07-28; the `www.edrdg.org`, `creativecommons.org` and
`downloads.tatoeba.org` rows after it were reproduced with `curl` **and**
independently by the importer, whose byte counts match. The earlier refusals are
kept rather than deleted: they are why the superseded EDRDG statement said 3.0,
and a reader who cannot see that history cannot audit the correction.

One route stayed shut. `ftp.edrdg.org` still fails TLS and refuses plain HTTP,
and `codeload.github.com` still returns 403, so KanjiVG is fetched file by file
at a pinned commit rather than as a tarball.

### 5.1 Sources inspected and rejected

- **`kotobako-data` (npm, 26.7.19)** — describes itself as
  "JMdict/KANJIDIC2/KanjiVG-derived; CC BY-SA". Rejected: published by a single
  unaffiliated account days before this session, no README
  (`"readme": "ERROR: No README data found!"`), no repository, and no upstream
  licence file inside the package (`fileCount: 2`). It fails all three conditions
  the LICENSED REDISTRIBUTION state requires. An anonymous repackaging is exactly
  the thing the "no verified-from-a-mirror" rule exists to exclude.
- **`scriptin/jmdict-simplified`** — the best-known JMdict/KANJIDIC2 JSON
  conversion, and its `LICENSE.txt` is reachable. Its data ships only as GitHub
  release assets, which need `api.github.com` or `github.com`; both are denied.
  Licence obtainable, data not.
- **Wiktionary, CHISE, Kanjium** — not considered. REQ-SRC-03 places them in a
  Phase-3 vetting queue; they are not selectable canonical sources.

---

## 6. Deferred items

| Id   | Item                                                          | Status                                                                                           | Smallest operator action                                            |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| D-1  | JMdict / KANJIDIC2 with verbatim EDRDG attribution text       | **closed** — shipped VERIFIED from the licensor's host (§2)                                      | —                                                                   |
| D-1a | Confirm the current EDRDG licence **version** at the licensor | **closed** — licensor says CC BY-SA **4.0**; the 3.0 label was wrong and is corrected everywhere | —                                                                   |
| D-2  | Tatoeba sentence subset with per-sentence attribution         | **closed** — shipped with per-half contributor attribution (§3)                                  | —                                                                   |
| D-3  | CC BY 2.0 FR legal code                                       | **closed** — verbatim from creativecommons.org at `licenses/CC-BY-2.0-FR.html`                   | —                                                                   |
| D-4  | Re-run against a later upstream                               | open — JMdict and KANJIDIC2 change continuously; this snapshot is 2026-07-28                     | re-run `import-sources.mjs`; `--verify-fixtures` reports what moved |

No asset in this package has an unresolved licence: everything shipped is either
covered by a verbatim licence text on disk (§1, §2, §3) or is this project's own
work under the pending OD-09 decision (§4). Every deferral WP-04 opened is now
closed against the licensor's own artefacts rather than a redistributor's.

D-4 is not a defect. These files are living documents, and the honest position is
that this package pins a dated snapshot and can say exactly which one:
`data/dictionary/manifest.json` records the sha256 of every archive it read, and
`--verify-fixtures` re-derives the §8 fixtures from current upstream and prints
every field that has since moved. When it was first run against the 2026-07-28
files it found seven such fields left over from the 2021 redistribution — which
is the whole argument for keeping that command rather than trusting the label.
