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

## 2. EDRDG — JMdict / KANJIDIC2 — LICENSED REDISTRIBUTION

**Used for:** every lexeme `reading`, `partOfSpeech` and `senses` value in
`data/lexemes.json` (JMdict), and every kanji `onReadings`, `kunReadings` and
`meanings` value in `data/kanji.json` (KANJIDIC2).

This replaces WP-04's deferral D-1. What has **not** changed is the reason D-1
was opened: `www.edrdg.org` and `ftp.edrdg.org` are still refused by this
session's egress policy, reproduced 2026-07-28.

| Host                                           | 2026-07-27 | 2026-07-28 |
| ---------------------------------------------- | ---------- | ---------- |
| `www.edrdg.org`                                | refused    | refused    |
| `ftp.edrdg.org`                                | refused    | refused    |
| `creativecommons.org`                          | refused    | refused    |
| `api.github.com`, `codeload.github.com`        | —          | 403        |
| `raw.githubusercontent.com`                    | 200        | 200        |
| `files.pythonhosted.org`, `registry.npmjs.org` | —          | 200        |

### 2.1 The artefact

What became possible is a pinned redistribution that carries the data and the
licensor's own statement in the same file.

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

### 2.2 Licence statement, verbatim

The EDRDG **General Dictionary Licence Statement** is shipped verbatim at
[`licenses/EDRDG-licence-statement.md`](licenses/EDRDG-licence-statement.md).

- 9,416 bytes, sha256 `1980bff8562ca1f4e83a5b4a5646de805da61e3409d288a8dea11dd7bb3a13f6`
- Retrieved twice, by independent paths, and `cmp` reports the two byte-identical:
  - bundled in the pinned sdist at `jamdict_data-1.5/jamdict_data/LICENSE.md`
  - `https://raw.githubusercontent.com/neocl/jamdict_data/main/jamdict_data/LICENSE.md`
- The statement's own first line records its origin as
  `https://www.edrdg.org/edrdg/licence.html`

Its opening paragraphs, quoted from that file:

```text
Copyright over the documents covered by this statement is held by James William
BREEN and The Electronic Dictionary Research and Development Group.

The dictionary files are made available under a Creative Commons
Attribution-ShareAlike Licence (V3.0).
```

**On the licence version.** This statement says **CC BY-SA 3.0**, and 3.0 is
therefore what every EDRDG provenance record in this package declares, because
3.0 is what the statement travelling with these bytes says. Several unaffiliated
repositories describe current JMdict as CC BY-SA 4.0. That may well be right, and
it is **not asserted here**: `www.edrdg.org` is unreachable, so the current
statement could not be read, and guessing a licence version is the same class of
error as guessing an attribution. If the operator opens EDRDG's hosts, this is
the first thing to re-check.

### 2.3 Full licence text

The CC BY-SA 3.0 Unported legal code the statement points at is shipped verbatim
at [`licenses/CC-BY-SA-3.0.txt`](licenses/CC-BY-SA-3.0.txt).

- 22,240 bytes, sha256 `3f941b3b89cf7b8370ceb83cc76d2120d471b58735d8ca60238a751a48d7f72f`
- Retrieved from
  `https://raw.githubusercontent.com/spdx/license-list-data/main/text/CC-BY-SA-3.0.txt`
  on 2026-07-28

`creativecommons.org` is refused by the proxy, so this text comes from the SPDX
license list (Linux Foundation) — the canonical machine-readable publication of
licence texts — and is named as such rather than passed off as
creativecommons.org. It is the same licence KanjiVG uses, whose licensor-issued
copy is separately on file at `licenses/KanjiVG-COPYING.txt`.

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
  JMdict, KANJIDIC2, the EDRDG and CC BY-SA 3.0, and is rendered on every word
  and kanji page. `test/dataset.test.ts` and `test/edrdg.test.ts` fail if that
  string stops naming them.
- **Documentation and licence files provided.** This file, plus the two verbatim
  texts above, shipped in the repository.
- **Share-alike.** The EDRDG-derived fields are labelled `CC BY-SA 3.0`,
  `modification_status: "derived"`, and are confined to this package.
- **Entry identifiers are real.** Every JMdict field carries that entry's real
  `ent_seq` in `source_entry_id`; every KANJIDIC2 field carries the literal,
  which is that file's entry identifier. Nothing is a placeholder.
- **Nothing claims more than it is.** `review_status` is
  `licensed-redistribution`, never `primary-source-verified` — that status is
  reserved for sources whose own host answered, which here means KanjiVG alone.

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

## 3. Tatoeba — DEFERRED (D-2)

**Content shipped from this source: none.** Unchanged from WP-04, and re-tested
on 2026-07-28 rather than assumed.

Controller §8 names a filtered Tatoeba subset (CC BY 2.0 FR text, per-sentence
attribution) as the intended source for example sentences. Three independent
blockers, each sufficient on its own:

| Blocker                   | Evidence (2026-07-28)                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data unreachable          | `tatoeba.org` and `downloads.tatoeba.org` both refused by the egress proxy                                                                                     |
| No data in the artefact   | the pinned `jamdict.db` has no examples table at all — JMdict, JMnedict, KANJIDIC2 and KRADFILE only                                                           |
| Licence text unobtainable | `creativecommons.org` refused; the SPDX license list has **no** `CC-BY-2.0-FR` — `text/CC-BY-2.0-FR.txt` is 404 and the licence index carries only `CC-BY-2.0` |

CC BY 2.0 FR additionally requires per-sentence attribution naming the sentence
id and the contributing user. No reachable artefact carries those. Under the
rule stated at the top of this file — licence first, data second — no Tatoeba
content is shipped, and none is labelled as such.

**What was done instead.** The eight sentences in `data/sentences.json`, the
three grammar examples in `data/grammar.json`, and the integration passage in
`data/passages.json` are **original text written for this project**, labelled
`bunki-authored-text`. They carry no third-party attribution obligation, and
`SEED_ENTRY_DISCLOSURE` says so on the same screen that credits EDRDG for the
lexical data — so a reader is never left to infer that the sentences are sourced
because the readings are.

**Smallest operator action to close D-2:** allow `tatoeba.org` and
`downloads.tatoeba.org` through the egress policy. Failing that, any pinned
artefact that carries Tatoeba sentence ids, contributor names **and** the CC BY
2.0 FR text together would satisfy the same rule EDRDG was admitted under.

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

| Retrieved  | Host                        | URL                                              | Result                                                                               |
| ---------- | --------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 2026-07-27 | `raw.githubusercontent.com` | KanjiVG `README.md` @ `61e39cf`                  | 200 — verified                                                                       |
| 2026-07-27 | `raw.githubusercontent.com` | KanjiVG `COPYING` @ `61e39cf`                    | 200 — verified                                                                       |
| 2026-07-27 | `raw.githubusercontent.com` | KanjiVG `kanji/*.svg` @ `61e39cf` (10 files)     | 200 — verified                                                                       |
| 2026-07-27 | `github.com` (git)          | `git ls-remote … HEAD`                           | ok — `61e39cfc29724132a6f8823b166296932985a0ff`                                      |
| 2026-07-27 | `www.edrdg.org`             | `/edrdg/licence.html`                            | **403 CONNECT refused** — D-1                                                        |
| 2026-07-27 | `www.csse.monash.edu.au`    | `/~jwb/edict.html`                               | **403 CONNECT refused** — D-1                                                        |
| 2026-07-27 | `tatoeba.org`               | `/en/terms_of_use`                               | **403 CONNECT refused** — D-2                                                        |
| 2026-07-27 | `downloads.tatoeba.org`     | `/exports/`                                      | **403 CONNECT refused** — D-2                                                        |
| 2026-07-27 | `creativecommons.org`       | `/licenses/by-sa/4.0/legalcode`                  | **403 CONNECT refused** — D-1                                                        |
| 2026-07-27 | `kanjivg.tagaini.net`       | `/`                                              | **403 CONNECT refused** — not needed; the project's repository served the same texts |
| 2026-07-28 | `www.edrdg.org`             | `/jmdict/edict_doc.html`                         | **refused** — re-tested, unchanged                                                   |
| 2026-07-28 | `ftp.edrdg.org`             | `/pub/Nihongo/JMdict_e.gz`                       | **refused** — re-tested, unchanged                                                   |
| 2026-07-28 | `tatoeba.org`               | `/en/downloads`                                  | **refused** — re-tested, D-2 stands                                                  |
| 2026-07-28 | `downloads.tatoeba.org`     | `/exports/sentences.tar.bz2`                     | **refused** — re-tested, D-2 stands                                                  |
| 2026-07-28 | `creativecommons.org`       | `/licenses/by-sa/4.0/legalcode.txt`              | **refused** — re-tested                                                              |
| 2026-07-28 | `api.github.com`            | `/repos/scriptin/jmdict-simplified`              | **403** — no REST API; release assets unreachable                                    |
| 2026-07-28 | `codeload.github.com`       | `/KanjiVG/kanjivg/tar.gz/master`                 | **403** — no tarballs                                                                |
| 2026-07-28 | `raw.githubusercontent.com` | `spdx/license-list-data` `text/CC-BY-SA-3.0.txt` | 200 — shipped at `licenses/CC-BY-SA-3.0.txt`                                         |
| 2026-07-28 | `raw.githubusercontent.com` | `spdx/license-list-data` `text/CC-BY-2.0-FR.txt` | **404** — SPDX does not carry this licence; D-2 stands                               |
| 2026-07-28 | `raw.githubusercontent.com` | `neocl/jamdict_data` `jamdict_data/LICENSE.md`   | 200 — shipped at `licenses/EDRDG-licence-statement.md`                               |
| 2026-07-28 | `raw.githubusercontent.com` | `scriptin/jmdict-simplified` `LICENSE.txt`       | 200 — CC BY-SA 4.0 legal code; licence reachable, its data is not                    |
| 2026-07-28 | `files.pythonhosted.org`    | `jamdict_data-1.5.tar.gz`                        | 200 — 53,940,912 bytes, sha256 verified                                              |
| 2026-07-28 | `pypi.org`                  | `/pypi/jamdict-data/json`                        | 200 — package metadata                                                               |
| 2026-07-28 | `registry.npmjs.org`        | `/kotobako-data`                                 | 200 — inspected and **rejected**, see below                                          |

The 403/refusals were reproduced with `curl` in this session and match the WP-04
record, so they are an egress-policy property, not a client misconfiguration.

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

| Id   | Item                                                          | Status                                                                    | Smallest operator action                                                          |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D-1  | JMdict / KANJIDIC2 with verbatim EDRDG attribution text       | **closed** — shipped under LICENSED REDISTRIBUTION (§2)                   | —                                                                                 |
| D-1a | Confirm the current EDRDG licence **version** at the licensor | open — statement on file says CC BY-SA 3.0; 4.0 unverified, unclaimed     | allow `www.edrdg.org`, re-read `/edrdg/licence.html`, and re-record if it differs |
| D-2  | Tatoeba sentence subset with per-sentence attribution         | open — not shipped; sentences are original                                | allow `tatoeba.org` + `downloads.tatoeba.org`, then add a sourced subset          |
| D-3  | CC BY 2.0 FR legal code                                       | open — unobtainable; `creativecommons.org` refused, SPDX has no such text | closes with D-2                                                                   |

No asset in this package has an unresolved licence: everything shipped is either
covered by a verbatim licence text on disk (§1, §2) or is this project's own work
under the pending OD-09 decision (§4). D-1a and D-3 are open **questions about
sources**, not exposure on shipped bytes.
