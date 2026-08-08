# `@bunki/seed` — licences and attributions

**Scope.** This file covers every asset in `packages/seed/`. Share-alike source
data is accepted in this package and only this package (controller §4,
REQ-SRC-02, DL-33); it must not leak into `@bunki/domain`, `@bunki/persistence`,
`@bunki/ai`, `@bunki/export`, or `apps/app`.

**Repository licence: pending operator decision** (OD-09). Nothing recorded here
constrains that choice beyond what the controller already accepts.

---

## What "verified" means in this file

Controller §8 requires each licence text to be checked **against the primary
source** during WP-04, with URLs and retrieval dates recorded. So there are
exactly two states below, and no third:

- **VERIFIED** — the text was retrieved over HTTPS from the source project's own
  artefacts during this build session, and is reproduced here byte-for-byte from
  what was retrieved. URL, retrieval date and a sha256 of the retrieved file are
  recorded so a verifier can re-fetch and diff.
- **DEFERRED** — the primary source could not be reached from this build
  session. **No content from that source is shipped**, and no licence text for it
  is reproduced. Writing out remembered licence text and calling it verified
  would be a false claim of exactly the kind this project exists to avoid.

There is no "verified from a mirror" state. A redistribution of a dataset is not
that dataset's licensor.

Everything below was retrieved on **2026-07-27**. Toolchain: `curl` through this
session's egress proxy, `git ls-remote` for the pinned commit.

---

## 1. KanjiVG — VERIFIED

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

## 2. EDRDG — JMdict / KANJIDIC2 — DEFERRED (D-1)

**Content shipped from this source: none.**

Controller §8 names JMdict and KANJIDIC2 subsets (EDRDG, CC BY-SA 4.0) as the
intended source for lexeme and kanji data, with the attribution text verbatim in
this file. That could not be done: every EDRDG-controlled host was refused by
this session's egress policy.

| Host                                                      | Result                                           | Evidence                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `www.edrdg.org`                                           | `curl: (56) CONNECT tunnel failed, response 403` | proxy status endpoint logged `connect_rejected … host: www.edrdg.org:443`, 2026-07-27T07:44:29Z |
| `www.csse.monash.edu.au` (Jim Breen's EDICT/JMdict pages) | `curl: (56) CONNECT tunnel failed, response 403` | same session                                                                                    |
| `creativecommons.org` (CC BY-SA 4.0 legal code)           | `curl: (56) CONNECT tunnel failed, response 403` | same session                                                                                    |

Per `/root/.ccr/README.md`, a 403 from that proxy is an organisation egress
policy denial, to be reported rather than routed around.

**What was done instead, and why.** The lexeme readings, senses, parts of speech
and kanji meanings in this package are hand-assembled by this project and are
labelled as such — provenance source `bunki-editorial`, `review_status:
"unreviewed"`, `confidence: "medium"`, `source_entry_id: null`. They are **not**
labelled JMdict or KANJIDIC2, and no `ent_seq` or KANJIDIC2 entry identifier is
recorded, because none could be obtained. Copying entry sequence numbers from
memory would have manufactured exactly the audit trail this work package exists
to make trustworthy. `test/dataset.test.ts` fails if any field's `source` or
`attribution` so much as mentions JMdict, KANJIDIC2 or EDRDG.

**Consequence for the closure predicate.** No unresolved licensing enters the
fixtures — controller §21.3(3) is not triggered, because no EDRDG-licensed asset
is present to be unresolved. What remains open is _content_ verification, not
licence hygiene.

**Smallest operator action to close D-1:** allow `www.edrdg.org` (and
`ftp.edrdg.org`) through the session egress policy. A follow-up pass can then
retrieve the JMdict/KANJIDIC2 subsets with real entry sequence numbers, reproduce
the EDRDG licence statement verbatim here, and flip the affected fields from
`bunki-editorial` to an EDRDG source with `review_status:
"primary-source-verified"`. The provenance registry is the only file that has to
change for the licence, plus the per-field `source_entry_id` overrides — the
override mechanism already exists and is exercised by the KanjiVG fields.

---

## 3. Tatoeba — DEFERRED (D-2)

**Content shipped from this source: none.**

Controller §8 names a filtered Tatoeba subset (CC BY 2.0 FR text, per-sentence
attribution) as the intended source for example sentences.

| Host                    | Result                                           |
| ----------------------- | ------------------------------------------------ |
| `tatoeba.org`           | `curl: (56) CONNECT tunnel failed, response 403` |
| `downloads.tatoeba.org` | `curl: (56) CONNECT tunnel failed, response 403` |

Per-sentence attribution is not optional under CC BY 2.0 FR, and it requires the
sentence id and the contributing user — neither of which could be retrieved.
Inventing them would be fabrication.

**What was done instead.** The eight sentences in `data/sentences.json`, the
three grammar examples in `data/grammar.json`, and the integration passage in
`data/passages.json` are **original text written for this project**, labelled
`bunki-authored-text`. They carry no third-party attribution obligation.

**Smallest operator action to close D-2:** allow `tatoeba.org` and
`downloads.tatoeba.org` through the session egress policy. A follow-up pass can
then add a genuinely-sourced sentence subset alongside the authored ones, each
with its sentence id and contributor recorded in `source_entry_id` and
`attribution`.

---

## 4. Content authored by this project

**Licence: pending operator decision (OD-09).** Original work of this project; no
third-party licence attaches. Provenance sources `bunki-authored-text`,
`bunki-editorial`, `bunki-selection`, `bunki-computed` in `data/provenance.json`.

This covers:

- the permanent A1 source article `source-bunki-graded-n5-morning` (「静かな朝」),
  copied without modification from the repository's existing Bunki v11
  `original` article pool. Its committed body is pinned by sha256
  `cb8535ea848848a58054d17582616abebe52deb5f26320f1af29d04bea1b99b2`;
  no third-party source or attribution obligation attaches;
- the integration passage `pas-bunki-01` (「分かれた道」) — hand-written for the
  §10 screen-5 contextual reuse canvas, explicitly labelled with this project as
  its author. It is not AI-generated bridging material under REQ-SRC-01(5), and
  not adapted from any source;
- the eight example sentences and their translations;
- the three grammar constructions, their explanations and examples;
- readings, senses, parts of speech and kanji meanings (see D-1 above for their
  epistemic status);
- selection decisions: which kanji and words the seed covers.

---

## 5. Retrieval log

Every network retrieval this work package performed, with its outcome.

| Retrieved  | Host                        | URL                                          | Result                                                                               |
| ---------- | --------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| 2026-07-27 | `raw.githubusercontent.com` | KanjiVG `README.md` @ `61e39cf`              | 200 — verified                                                                       |
| 2026-07-27 | `raw.githubusercontent.com` | KanjiVG `COPYING` @ `61e39cf`                | 200 — verified                                                                       |
| 2026-07-27 | `raw.githubusercontent.com` | KanjiVG `kanji/*.svg` @ `61e39cf` (10 files) | 200 — verified                                                                       |
| 2026-07-27 | `github.com` (git)          | `git ls-remote … HEAD`                       | ok — `61e39cfc29724132a6f8823b166296932985a0ff`                                      |
| 2026-07-27 | `www.edrdg.org`             | `/edrdg/licence.html`                        | **403 CONNECT refused** — D-1                                                        |
| 2026-07-27 | `www.csse.monash.edu.au`    | `/~jwb/edict.html`                           | **403 CONNECT refused** — D-1                                                        |
| 2026-07-27 | `tatoeba.org`               | `/en/terms_of_use`                           | **403 CONNECT refused** — D-2                                                        |
| 2026-07-27 | `downloads.tatoeba.org`     | `/exports/`                                  | **403 CONNECT refused** — D-2                                                        |
| 2026-07-27 | `creativecommons.org`       | `/licenses/by-sa/4.0/legalcode`              | **403 CONNECT refused** — D-1                                                        |
| 2026-07-27 | `kanjivg.tagaini.net`       | `/`                                          | **403 CONNECT refused** — not needed; the project's repository served the same texts |

The same 403s were reproduced through the `WebFetch` tool as well as `curl`, so
they are an egress-policy property and not a client misconfiguration.

---

## 6. Deferred items

| Id  | Item                                                               | Status                                             | Smallest operator action                                                                       |
| --- | ------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| D-1 | JMdict / KANJIDIC2 subsets and the verbatim EDRDG attribution text | not shipped; no EDRDG content present              | allow `www.edrdg.org` + `ftp.edrdg.org` through egress policy, then re-run WP-04's source pass |
| D-2 | Tatoeba sentence subset with per-sentence attribution              | not shipped; sentences are original                | allow `tatoeba.org` + `downloads.tatoeba.org`, then add a sourced subset                       |
| D-3 | CC BY-SA 4.0 / CC BY 2.0 FR legal code from `creativecommons.org`  | not shipped; not needed while D-1 and D-2 are open | closes with D-1/D-2                                                                            |

D-1 and D-2 are **content** gaps, not licence exposure: this package ships no
asset whose licence is unresolved.
