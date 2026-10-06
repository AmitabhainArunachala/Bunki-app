# Japanese NLP tooling and open data assets for a learning product (as of 2026-09-28)

Method note: Web search budget for this session was exhausted mid-task and the egress proxy blocked several primary sites (edrdg.org, tatoeba.org, clrd.ninjal.ac.jp, huggingface.co, nhk.or.jp, gavo.t.u-tokyo.ac.jp/OJAD, bunpro.jp, wadoku.de, nlp.stanford.edu/JESC, phontron.com/KFTT, aozora.gr.jp, tanos.co.uk, jiten.moe, kanjivg.tagaini.net, anila.me). Where a fact comes from a search-engine snippet of a blocked primary page it is cited to that page URL and marked "(snippet)". Anything drawn from prior knowledge rather than a fetched/snippeted source is marked **UNVERIFIED** and should be checked before being relied on. License names are given exactly as the source states them.

---

## 1. Morphological analysis (tokenizers, dictionaries, browser feasibility)

### Takeaway
Every mainstream Japanese tokenizer is permissively licensed (MeCab: GPL/LGPL/BSD triple; Sudachi/sudachi.rs/SudachiDict: Apache License 2.0; Vibrato: Apache 2.0 or MIT; Lindera/lindera-wasm: MIT; Kuromoji.js: Apache License 2.0; Juman++: Apache-2.0; GiNZA: MIT) and the dictionaries they need (UniDic BSD 3-Clause; NEologd Apache 2.0; SudachiDict Apache 2.0 with BSD/Apache sub-components) are commercial-use-friendly; the real constraint for browser/phone use is dictionary payload (Lindera IPADIC ~13 MB WASM download and ~1 s load; sudachi-wasm >50 MB gzipped; f3liz-dev sudachi-wasm loads a ~71 MB system dictionary separately).

### Cited Findings

**MeCab + IPADIC / UniDic / NEologd**
- MeCab is "released under any of the GPL (see the file GPL), the LGPL (see the file LGPL), or the BSD License (see the file BSD)"; copyright Taku Kudo and Nippon Telegraph and Telephone Corporation — [taku910/mecab COPYING](https://github.com/taku910/mecab/blob/master/mecab/COPYING)
- The taku910/mecab repository ships the core engine plus the mecab-ipadic and mecab-jumandic dictionaries (1.1k stars, 239 forks); the fetched page did not expose version/maintenance dates — [taku910/mecab](https://github.com/taku910/mecab)
- The modern Japanese UniDic (NINJAL) is available under the GPL, LGPL, or BSD license (snippet of polm/unidic-py README) — [polm/unidic-py README](https://github.com/polm/unidic-py/blob/master/README.md)
- unidic-py and unidic-lite bundle UniDic "under the terms of the BSD License"; the wrapper code is MIT or WTFPL; unidic-py "takes up 770MB on disk after installation", unidic-lite is the small alternative — [polm/unidic-py](https://github.com/polm/unidic-py); [unidic-lite LICENSE](https://github.com/polm/unidic-lite/blob/master/LICENSE)
- SudachiDict's LEGAL file records the UniDic components it embeds (small_lex.csv, matrix.def) as "BSD 3-Clause (custom disclaimer included)", copyright The UniDic Consortium (2011-2013) — [SudachiDict LEGAL](https://github.com/WorksApplications/SudachiDict/blob/develop/LEGAL)
- mecab-ipadic-NEologd uses the Apache License, Version 2.0; a frozen seed (v0.0.7, 2020-08-20) is kept "for reproducible research", while the master branch continued after 2020; copyright Toshinori Sato (@overlast) 2015-2019 — [neologd/mecab-ipadic-neologd](https://github.com/neologd/mecab-ipadic-neologd); [releases](https://github.com/neologd/mecab-ipadic-neologd/releases/)

**Sudachi family**
- SudachiDict is licensed under the Apache License, Version 2.0 and "includes UniDic and a part of NEologd" — [WorksApplications/SudachiDict](https://github.com/WorksApplications/SudachiDict)
- SudachiDict third-party sources and their terms: UniDic (BSD 3-Clause); NEologd (mecab-unidic-neologd, copyright Toshinori Sato); Hatena Keyword List (copyright Hatena Corporation); Japan Post postal-code data (Japan Post "explicitly does not assert copyright"); station-name database (copyright Sunafukin, "usage permitted with no liability guarantee"); personal-name kanji entries from Taku Kudo (Mozc-related); web-crawled terms limited to combinations matching the above — [SudachiDict LEGAL](https://github.com/WorksApplications/SudachiDict/blob/develop/LEGAL)
- sudachi.rs: three split modes A (short) / B (middle) / C (named-entity), normalized forms (e.g. 打込む -> 打ち込む, vintage -> ビンテージ), three dictionaries — Small (UniDic vocabulary only), Core (default), Full (adds misc. proper nouns); v0.7 introduced a new dictionary format (V1) and "is marked as unstable with potential breaking changes between patch versions"; Python bindings included — [WorksApplications/sudachi.rs](https://github.com/WorksApplications/sudachi.rs)
- SudachiPy versions 0.6+ are developed as sudachi.rs — [WorksApplications/SudachiPy](https://github.com/WorksApplications/SudachiPy)
- Sudachi is described in an LREC 2018 paper, "Sudachi: a Japanese Tokenizer for Business" — [ACL Anthology L18-1355](https://aclanthology.org/L18-1355.pdf)
- Browser port 1: hata6502/sudachi-wasm — Apache 2.0; a WebAssembly distribution of sudachi.rs; bundles SudachiDict (UniDic under BSD, mecab-ipadic-neologd under Apache 2.0, Hatena keywords, Japan Post data); "the gzipped script exceeds 50 MB", so the README recommends gzip encoding and Service Worker caching; supports browser and Node.js (npm package "sudachi"); 522 commits on develop — [hata6502/sudachi-wasm](https://github.com/hata6502/sudachi-wasm)
- Browser port 2: f3liz-dev/sudachi-wasm exposes a Tokenizer class to JS/TS; the dictionary file (~71 MB) is not bundled in the .wasm and is fetched/loaded at runtime (snippet) — [f3liz-dev/sudachi-wasm](https://github.com/f3liz-dev/sudachi-wasm)

**Vibrato**
- Vibrato is "a Rust reimplementation of the fast tokenizer MeCab", dual-licensed Apache 2.0 and MIT; supports MeCab IPADIC (v2.7.0 example) and UniDic-CWJ (noting its 459 MiB matrix for UniDic-CWJ-3.1.1); precompiled dictionaries on the Releases page; MeCab-compatible flags (-S, -M) reproduce identical tokenization; tokenizes spaces by default unlike MeCab; a WASM demo exists at vibrato-demo.pages.dev that "takes a little time to load the model" — [daac-tools/vibrato](https://github.com/daac-tools/vibrato)

**Lindera / lindera-wasm**
- lindera-wasm is MIT licensed; supports IPADIC and UniDic (Japanese), ko-dic, CC-CEDICT and a combined CJK build; Web and Node.js packages on npm; requires WASM init before TokenizerBuilder, Vite optimizeDeps exclusion, and `wasm-unsafe-eval` CSP in browser extensions; the standalone repo is archived, with development continuing in the Lindera monorepo — [lindera/lindera-wasm](https://github.com/lindera/lindera-wasm); [lindera/lindera](https://github.com/lindera/lindera)
- For browser use, Lindera IPADIC has a 13 MB download and loads in approximately 1 second; built with wasm-pack web target, works with Vite/Webpack 5 (snippet from a JS wrapper README) — [higumachan/lindera-js](https://github.com/higumachan/lindera-js)
- A third-party blog benchmarks Japanese morphological analyzers and their trade-offs (page blocked; content not verified) — [anila.me benchmark post](https://anila.me/en/blog/benchmarks-and-trade-offs-for-japanese-morphological-analyzer)

**Kuromoji.js**
- Kuromoji.js: Apache License 2.0; based on IPADIC; dictionary shipped as gzipped files in `dict/`; browser build via Browserified `build/kuromoji.js`; Node via npm; 163 commits, 8 open PRs, 15 issues at fetch time; the README does not state dictionary byte sizes — [takuyaa/kuromoji.js](https://github.com/takuyaa/kuromoji.js)

**Juman++**
- Juman++ is Apache-2.0; version 2 claims "better accuracy and greatly (>250x) improved analysis speed" over v1; uses an RNN language model for semantic plausibility; the download package including the pretrained model is approximately 300 MB (git source alone lacks the model) — [ku-nlp/jumanpp](https://github.com/ku-nlp/jumanpp)

**GiNZA / spaCy Japanese**
- GiNZA is "distributed under the MIT License" for library and models; latest release GiNZA 5.2.1 (September 1, 2026) is described as the final version supporting Python 3.9 or earlier; tokenization by SudachiPy with SudachiDict-core; models: ja_ginza (speed-oriented) and ja_ginza_electra (transformer, needs >=16 GB memory, ELECTRA pretrained on mC4 Japanese); trained on UD Japanese BCCWJ r2.8 and GSK2014-A (2019) BCCWJ edition for NER; no quantitative accuracy table in README — [megagonlabs/ginza](https://github.com/megagonlabs/ginza)

### Inferences
- Browser/phone feasibility ranking (by payload): Lindera IPADIC WASM (~13 MB, ~1 s load) and Kuromoji.js (IPADIC, gzipped dict; exact size not stated in README) are the lightest options; Sudachi WASM ports are 50-71 MB and need Service Worker caching, so they suit desktop PWAs more than mobile web; Vibrato's WASM demo shows feasibility but with noticeable model load time; Juman++ (300 MB) and GiNZA (Python/spaCy, transformer variant 16 GB RAM) are server-side only.
- Because SudachiDict (Apache 2.0) already merges UniDic (BSD) and NEologd (Apache 2.0) with documented provenance, it is the lowest-friction commercially usable dictionary for a product; MeCab's BSD option plus UniDic's BSD option is equally permissive. IPADIC's own license text could not be fetched (see Gaps).
- Learner-facing apps that need "dictionary-form + reading + POS" per token get all three from any MeCab/UniDic, Sudachi or Lindera-UniDic pipeline; Sudachi's split mode A/B/C is uniquely useful for showing both short-unit words and compound words to learners.
- Accuracy comparisons: no source fetched in this session gives head-to-head F1 numbers for the current versions; treat any accuracy ranking as unverified (Gap).

### Gaps
- mecab-ipadic (IPADIC) license text could not be fetched; **UNVERIFIED** recollection is that IPADIC carries its own permissive notice-style license originating from ICOT/NAIST that permits commercial use with notice. Verify from the ipadic COPYING file before shipping.
- No fetched source gave current speed/accuracy benchmarks across MeCab, Sudachi, Vibrato, Lindera, Kuromoji.js, Juman++ (anila.me post blocked).
- Kuromoji.js dictionary byte size and last release date not exposed in README fetch.
- UniDic official page (clrd.ninjal.ac.jp) blocked; latest UniDic version number and release date unverified.

---

## 2. Dictionaries and lexical data (JMdict/JMnedict, KANJIDIC2, RADKFILE, KanjiVG, Kanji alive, jmdict-simplified, JLPT lists, frequency lists, pitch accent, onomatopoeia/collocations)

### Takeaway
The EDRDG files (JMdict, JMnedict, KANJIDIC2, RADKFILE/KRADFILE) are under Creative Commons Attribution-ShareAlike Licence (V4.0) with explicit attribution/URL and documentation requirements and share-alike on derivatives; KanjiVG is CC BY-SA 3.0; Kanji alive is CC BY 4.0; Kanjium (the main open pitch-accent set, 124k+ words) is CC BY-SA 4.0 with commercial use explicitly allowed; OJAD is educational/academic-only; JLPT vocabulary lists are all unofficial and trace to tanos.co.uk-derived Anki decks; the most used frequency lists are jpdb (scraped, high coverage) and BCCWJ (NINJAL), whose redistribution terms could not be verified.

### Cited Findings

**EDRDG files (JMdict, JMnedict, KANJIDIC2, RADKFILE/KRADFILE)**
- The EDRDG dictionary files "are made available under a Creative Commons Attribution-ShareAlike Licence (V4.0)"; software using them must acknowledge usage and source "in the documentation, publicity material, WWW site of the package/server, etc." and provide copies of the documentation and licence files; the URLs to quote are https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project and https://www.edrdg.org/wiki/index.php/KANJIDIC_Project (snippet; primary page blocked) — [EDRDG licence statement](https://www.edrdg.org/edrdg/licence.html)
- On the JMdict mailing list, converting JMdict to JSON is confirmed to require keeping the same license on the derived files (snippet) — [EDRDG list thread 2022](https://www.edrdg.org/jmdict_edict_list/2022/msg00003.html)
- jmdict-simplified (weekly automated releases "every Monday") provides JSON for JMdict (full, common-only, per-language: English, German, Russian, Hungarian, Dutch, Spanish, French, Swedish, Slovenian, plus a Tanaka-corpus example-sentence variant), JMnedict (English only), Kanjidic, and Kradfile/Radkfile; license statement: JMdict/JMnedict are property of EDRDG under their license, Kanjidic under Creative Commons Attribution-ShareAlike 4.0, Kradfile/Radkfile under the EDRDG License, NPM packages MIT, other project files CC BY-SA 4.0 — [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified)
- Jitendex publishes a legal page listing its EDRDG/Kanjium/other sources (blocked; not verified) — [Jitendex Legal](https://jitendex.org/pages/legal.html)
- The Yomitan project's license-clarification issue records that it uses EDICT/KANJIDIC files "in conformance with the Group's license" and Kanjium-provided pitch/particle additions; the issue had no resolution at fetch time — [yomidevs/yomitan #540](https://github.com/yomidevs/yomitan/issues/540)

**Kanji stroke data**
- KanjiVG: "Creative Commons Attribution-Share Alike 3.0", copyright Ulrich Apel; distributed as main SVG set (non-variants), complete edition (with variants), stripped SVGs (custom attributes removed), and a legacy single-XML build; includes Python utilities; releases are dated YYYYMMDD — [KanjiVG/kanjivg](https://github.com/KanjiVG/kanjivg)
- AnimCJK: dual license — "Arphic Public License" for graphics/SVG files representing kanji, hanja, hanzi, and "GNU Lesser General Public License" for all other files (kana/bopomofo/stroke SVGs are LGPL because not Arphic-derived); svgsJa covers approximately 7,007 characters including 2,136 jōyō, 863 jinmeiyō, hyōgai kanji, components and 38 basic strokes — [parsimonhi/animCJK](https://github.com/parsimonhi/animCJK)
- Kanji alive data/media: "Creative Commons Attribution 4.0 International License" except two fonts (Japanese Radicals font: Apache 2.0; M+ kanji font: M+ FONTS LICENSE); covers 1,235 kanji and 247 radicals; ~10,187 audio files (Opus/AAC/Ogg/MP3, 32 kHz mono), kanji animations as MP4 (H.264, 248x248) and WebM, stroke images as SVG, radical animations as SVG, fonts in OTF/TTF/EOT/WOFF/WOFF2, plus CSV language data — [kanjialive/kanji-data-media](https://github.com/kanjialive/kanji-data-media)

**Kanjium (pitch accent + kanji DB)**
- Kanjium provides pitch-accent entries for "over 124,000 words with pitch accent mora locations", data on 6,355+ kanji (stroke orders, etymologies, readings), verb-particle data built on Tatoeba sentences, frequency analysis from 5,000+ novels and Wikipedia, variants and names; primary format is `kanjidb.sqlite` plus text files; everything is "Creative Commons Attribution-ShareAlike 4.0 International license" and "Users may freely modify and use the data commercially or non-commercially"; required attribution: "The pitch accent notation, verb particle data, phonetics, homonyms and other additions or modifications to EDICT, KANJIDIC or KRADFILE were provided by Uros O. through his free database." — [mifunetoshiro/kanjium README](https://github.com/mifunetoshiro/kanjium/blob/master/README.md)
- The Kanjium author states the accent data's source "is not listed due to potential copyright issues, but it's from 2-3 legitimate sources" (snippet of issue #13) — [kanjium issue #13](https://github.com/mifunetoshiro/kanjium/issues/13)
- A script exists to build a Yomichan/Yomitan pitch-accent dictionary from Kanjium data — [toasted-nutbread/yomichan-pitch-accent-dictionary](https://github.com/toasted-nutbread/yomichan-pitch-accent-dictionary)

**OJAD (University of Tokyo)**
- OJAD covers Tokyo-dialect accent for approximately 9,000 nouns and ~42,300 accent forms of ~3,500 predicates across 12 conjugations; its terms state it "can only be used for educational and academic research activities" and commercial use by companies for R&D is discouraged (snippet; page blocked) — [OJAD notes page](https://www.gavo.t.u-tokyo.ac.jp/ojad/pages/notes); [OJAD](https://www.gavo.t.u-tokyo.ac.jp/ojad/)

**JLPT vocabulary lists (unofficial)**
- elzup/jlpt-word-list (MIT) traces its data to tanos.co.uk via chyyran and jamsinclair forks; it ships N1-N5 files, a combined list (~505k rows) and a "minimum" version (~162k); the data derives from community Anki decks rather than any official JLPT publication — [elzup/jlpt-word-list](https://github.com/elzup/jlpt-word-list)
- Other community JLPT datasets: AnchorI/jlpt-kanji-dictionary (kanji + vocabulary JSON by level, EN/RU), kananinirav/jlptbenkyo (vocab/kanji/grammar), gauravhq/JLPTSuccess (N5 grammar/vocab/kanji static PWA), naghim/Awesome-Japanese-Study-Materials — [AnchorI](https://github.com/AnchorI/jlpt-kanji-dictionary); [jlptbenkyo](https://github.com/kananinirav/jlptbenkyo); [JLPTSuccess](https://github.com/gauravhq/JLPTSuccess); [awesome list](https://github.com/naghim/awesome-japanese-study-materials)

**Frequency lists**
- Yomitan's docs describe JPDB as "a frequency list made from jpdb.io, which has analyzed many light novels, visual novels, anime and j-drama" and BCCWJ as long-unit-word frequencies from the Balanced Corpus of Contemporary Written Japanese (snippets) — [Yomitan dictionaries page](https://yomitan.wiki/dictionaries/); [TheMoeWay setup](https://learnjapanese.moe/yomichan/)
- Kuuuube's JPDB v2.2 frequency dictionary claims coverage "99.99% up to 25000, 99.5% up to 70000, and 98.6% up to 100000" (quality: High; Standard/Kana/Kana-display-only variants); also "BCCWJ SUW LUW Combined" (High), an "H Frequency" list from 13,000 voice scripts (Medium), and a JMdict-frequency list rated Low ("their frequency data is terrible") — [Kuuuube/yomitan-dictionaries README](https://github.com/Kuuuube/yomitan-dictionaries/blob/main/README.md)
- MarvNC's collection lists JPDB v2.1, Jiten Frequency (Global), Frequency CC100, and BCCWJ-LUW as a starter set; per-list licenses are not stated in the README — [MarvNC/yomitan-dictionaries](https://github.com/MarvNC/yomitan-dictionaries); [MarvNC/yomitan-dict-stats](https://github.com/MarvNC/yomitan-dict-stats)
- Jiten frequency lists are built from "anime, drama, movies, novels, visual novels, manga and more", with word frequency lists from 3,267,466,639 characters across 16,461 titles, including a global list, per-media-type lists and a kanji list (snippet; page blocked) — [jiten.moe frequency dictionaries](https://jiten.moe/frequency-dictionaries)
- Older Yomichan frequency-list documentation (Anacreon DJT) — [anacreondjt freq docs](https://anacreondjt.gitlab.io/docs/freq/)

### Inferences
- License-compatibility matrix for a commercial app: JMdict/JMnedict/KANJIDIC2/RADKFILE (CC BY-SA 4.0: commercial OK, attribution + share-alike on derived data files), KanjiVG (CC BY-SA 3.0: commercial OK, share-alike), Kanji alive (CC BY 4.0: commercial OK, attribution only), Kanjium (CC BY-SA 4.0: commercial OK, share-alike), AnimCJK graphics (Arphic Public License: copyleft-style font license; verify obligations before embedding in a closed app), OJAD (educational/academic only: do not scrape or embed in a commercial product), jpdb frequency (scraped from a commercial site, no license: legal status unclear), BCCWJ frequency (NINJAL terms unverified).
- Share-alike applies to the *data files*, not necessarily the app code, per the EDRDG mailing-list reading; but a product that bundles a modified JMdict must publish the modified data under the same license.
- Because Kanjium's underlying accent sources are undisclosed, a risk-averse product should treat Kanjium accent data as CC BY-SA in form but with provenance risk; the NHK accent dictionary itself is proprietary (**UNVERIFIED**, prior knowledge; NHK terms not fetched).
- No official JLPT vocabulary list exists since the 2010 test revision; community lists all inherit tanos.co.uk's pre-2010 spec-based lists, so level assignments for post-2010 vocabulary are approximations (the tanos site itself was blocked; **UNVERIFIED** detail).

### Gaps
- KANJIDIC2 entry count, JMdict entry count, RADKFILE specifics, and KanjiVG character count could not be verified (edrdg.org and kanjivg.tagaini.net blocked).
- BCCWJ short/long-unit frequency list download terms (NINJAL) not fetched; commercial redistribution status unknown.
- jpdb frequency list: no license found; it is scraped from jpdb.io (a commercial service).
- Wadoku pitch-accent/dictionary license not verified (wadoku.de blocked); **UNVERIFIED** recollection: Wadoku data is CC BY-SA and includes accent marks.
- NHK accent dictionary terms not fetched.
- No open onomatopoeia dataset or open collocation resource (e.g. NINJAL-LWP/NLB) was found before the search budget ran out; awesome-japanese-nlp-resources (1,200+ entries) is the recommended place to look — [taishi-i/awesome-japanese-nlp-resources](https://github.com/taishi-i/awesome-japanese-nlp-resources).

---

## 3. Sentence banks and parallel corpora

### Takeaway
Tatoeba (text CC-BY 2.0 FR, subset CC0; audio per-contributor) and Tadoku free readers (CC BY-NC 4.0, non-commercial) are the clearest sentence/reader sources; JParaCrawl is research-only (contact NTT for commercial use); NAIST Lang-8 is research/educational only; cLang-8 excludes Japanese; NHK NEWS WEB EASY has no fetched reuse permission and community scrapers add copyright caveats; JESC/KFTT/Aozora/WikiMatrix licenses could not be fetched this session.

### Cited Findings
- Tatoeba: default license for textual sentences is "Creative Commons Attribution 2.0 France license (CC-BY 2.0 FR)", the only condition being attribution; "a part of sentences are also available under CC0 1.0"; audio license is chosen per contributor and shown on their audio page, may be other CC licenses, and "exceptionally... other licenses than Creative Commons"; CC0 cannot be applied to audio because recordings are derivative of the text (snippets; site blocked) — [Tatoeba terms of use](https://tatoeba.org/en/terms_of_use); [Tatoeba downloads](https://tatoeba.org/en/downloads); [Tatoeba wiki: using the corpus](https://en.wiki.tatoeba.org/articles/show/using-the-tatoeba-corpus); [CC0 contributions](https://en.wiki.tatoeba.org/articles/show/cc0-contributions)
- ManyThings.org hosts Tatoeba-derived bilingual sentence pairs — [ManyThings Tatoeba](https://www.manythings.org/corpus/tatoeba.html)
- jmdict-simplified offers a JMdict variant with example sentences from the Tanaka corpus — [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified)
- JParaCrawl (NTT): "For commercial use of JParaCrawl, please contact the developers"; data "can only be used for research purposes involving information analysis, and is not available for commercial use, including the sale of translators trained using this data" (snippet) — [JParaCrawl](https://www.kecl.ntt.co.jp/icl/lirg/jparacrawl/); [JParaCrawl LREC 2020](https://aclanthology.org/2020.lrec-1.443.pdf); [JParaCrawl v3.0 paper](https://www.anlp.jp/proceedings/annual_meeting/2022/pdf_dir/PT4-11.pdf); [JParaCrawl v4.0 paper](https://www.anlp.jp/proceedings/annual_meeting/2024/pdf_dir/P8-16.pdf)
- A filtered JParaCrawl derivative is on Hugging Face (license inherits JParaCrawl's) — [Verah/JParaCrawl-Filtered](https://huggingface.co/datasets/Verah/JParaCrawl-Filtered-English-Japanese-Parallel-Corpus)
- Laboro-ParaCorpus provides scripts for building a JA-EN parallel corpus and NMT models — [laboroai/Laboro-ParaCorpus](https://github.com/laboroai/Laboro-ParaCorpus)
- NAIST Lang-8 Learner Corpora: distributed "for research or educational purposes only" without warranty; covers English, Japanese, Romanized Japanese, Korean; suitable for training GEC systems but "not suitable as an evaluation dataset because the corrected sentences sometimes include inappropriate sentences" (snippets) — [NAIST Lang-8 README-en](https://sites.google.com/site/naistlang8corpora/home/readme-en); [NAIST Lang-8 home](https://sites.google.com/site/naistlang8corpora)
- cLang-8 (Google) covers English (2,372,119), German (114,405), Russian (44,830) — not Japanese; "released under CC BY-NC-SA 4.0 license" for research/educational use; code Apache 2.0; requires obtaining raw Lang-8 via a Google Form — [google-research-datasets/clang8](https://github.com/google-research-datasets/clang8)
- Tadoku free graded readers: "licensed under Creative Commons 4.0 (CC BY-NC 4.0)"; ~200 PDFs by NPO Tadoku Supporters volunteers; an April-2024 collection is mirrored on the Internet Archive (snippets) — [Tadoku free books](https://tadoku.org/japanese/en/free-books-en/); [Tadoku graded readers](https://tadoku.org/japanese/en/graded-readers-en/); [Internet Archive mirror](https://archive.org/details/japanese-graded-readers-level-0-5-tadoku-ask)
- NHK NEWS WEB EASY: no terms page could be fetched; community scrapers state the script is "for educational purposes only" and users "should follow the copyright laws and regulations applicable in their country" — [KORINZ/nhk-news-scraper-gui](https://github.com/KORINZ/nhk-news-scraper-gui); PyPI wrapper [easyjapanese](https://pypi.org/project/easyjapanese/0.1.1); NHK Global Media Services' site-usage page exists but is for a subsidiary, not NEWS WEB EASY — [nhk-g.co.jp copyright](https://www.nhk-g.co.jp/copyright/)
- Kanjium's sentence table is built from Tatoeba — [Kanjium README](https://github.com/mifunetoshiro/kanjium/blob/master/README.md)

### Inferences
- For a commercial learning product, the safe sentence sources are Tatoeba (CC-BY 2.0 FR / CC0 subset; attribute each sentence's contributor per Tatoeba practice) and self-authored or LLM-generated sentences; Tadoku readers are usable only in a non-commercial context or for internal evaluation; JParaCrawl and NAIST Lang-8 are research-only and must not be shipped inside a paid app.
- NHK NEWS WEB EASY content should be treated as all-rights-reserved (link out, do not cache text in the product) unless NHK terms are obtained.

### Gaps
- JESC license/size, KFTT license/size, WikiMatrix license, Aozora Bunko usage rules, Japanese Wikipedia/Wikinews terms: primary pages blocked; **UNVERIFIED** recollection: JESC is CC BY-SA 4.0 (~2.8M subtitle pairs), KFTT is CC BY-SA 3.0 (Kyoto Wikipedia articles), WikiMatrix and Wikipedia are CC BY-SA, Aozora works are largely public-domain with per-work notes and some under CC.
- NHK NEWS WEB EASY official terms not fetched.
- Tatoeba Japanese sentence count and CC0 share not retrieved.

---

## 4. Grammar inventories and machine-readable grammar annotators

### Takeaway
No fetched source provides an open, machine-readable Japanese grammar-point annotator; GrammarTagger (the only open "grammar profiler" found) supports English and Chinese only with CC BY-NC-ND 4.0 models. Grammar-point inventories exist as community GitHub datasets (jlptbenkyo, JLPTSuccess, hanabira.org) and commercial taxonomies (Bunpro, page blocked), so an app must build its own annotator (e.g. rules over UniDic/Sudachi tokens) or use LLM tagging.

### Cited Findings
- GrammarTagger: code Apache-2.0; pretrained models "CC BY-NC-ND 4.0 for academic/personal uses" with commercial licensing available; supports English and Chinese only ("Japanese is not supported"); English model 387 MB, Chinese 363 MB; outputs span labels with difficulty probabilities (A1-C2 / HSK 1-6); runs on AllenNLP 2.1.0+ — [octanove/grammartagger](https://github.com/octanove/grammartagger); [paper arXiv 2104.03190](https://arxiv.org/pdf/2104.03190)
- Hanabira.org is a free, open-source, self-hostable Japanese learning portal with a JLPT grammar dashboard (N5-N1) — [hanabira.org grammar dashboard](https://hanabira.org/japanese/grammar_dashboard/JLPT_N1/25)
- kananinirav/jlptbenkyo provides structured vocabulary, kanji and grammar lessons for N5-N1; gauravhq/JLPTSuccess includes N5 grammar patterns as a static PWA — [jlptbenkyo](https://github.com/kananinirav/jlptbenkyo); [JLPTSuccess](https://github.com/gauravhq/JLPTSuccess)
- UniDic2UD and SuPar-UniDic (tokenizer/POS/lemmatizer/dependency parser for modern and contemporary Japanese, BERT-based variants) are listed as Japanese parsing tools that could underpin rule-based grammar detection — [awesome-japanese-nlp-resources](https://github.com/taishi-i/awesome-japanese-nlp-resources)
- A 2024 study on Japanese lexical complexity ("Difficult for Whom?") addresses learner-vs-native difficulty annotation — [arXiv 2410.18567](https://arxiv.org/pdf/2410.18567)

### Inferences
- The practical route is: (1) adopt a taxonomy (Bunpro's ~N5-N1 point list or a GitHub JSON list) as an ID space, (2) implement pattern matching over lemmatized UniDic/SudachiDict token streams (e.g. verb-te + いる), (3) fall back to LLM classification for ambiguous points. Any taxonomy copied verbatim from Bunpro/Tofugu/imabi is their copyrighted editorial content; use titles as reference points, not copied explanations.

### Gaps
- Bunpro grammar point counts per level and any terms for the public list: bunpro.jp blocked.
- Tofugu and imabi licenses not checked (search budget exhausted); both are commercial/editorial sites and should be assumed all-rights-reserved.
- No open Japanese grammar-point annotator model was found; this appears to be a genuine gap in the ecosystem, not just in this search.

---

## 5. Readability and level estimation for Japanese text

### Takeaway
The jReadability formula (Lee & Hasebe) is the only openly reimplemented, learner-oriented readability model found: a 5-feature linear regression over UniDic tokens, MIT-licensed as a Python package (fugashi + UniDic 2.1.2), scoring 0.5-6.4 in six bands; JLPT "N-level" estimation in apps is otherwise done via vocabulary/kanji profiling against unofficial JLPT lists.

### Cited Findings
- jReadability formula: readability = mean words per sentence x -0.056 + % kango x -0.126 + % wago x -0.042 + % verbs x -0.145 + % particles x -0.044 + 11.724; developed by regression over 100 textbooks and BCCWJ; bands: 5.5-6.4 very easy, 4.5-5.4 easy, 3.5-4.4 neutral, 2.5-3.4 a little difficult, 1.5-2.4 difficult, 0.5-1.4 very difficult; intended for non-native learners, not native grade levels (snippets) — [joshdavham/jreadability](https://github.com/joshdavham/jreadability); [Hasebe & Lee 2015 CASTEL/J](https://jreadability.net/file/hasebe-lee-2015-castelj.pdf); [Lee & Hasebe, Semantic Scholar](https://www.semanticscholar.org/paper/Readability-measurement-of-Japanese-texts-based-on-Lee-Hasebe/234157e44922f85253c9e78c28d308a624dcc212); [researchmap entry](https://researchmap.jp/yohasebe/works/31535089?lang=en)
- The jreadability Python package is MIT; depends on fugashi and UniDic 2.1.2; scores may differ slightly from jreadability.net, which uses UniDic 2.2.0; bands labelled Upper-advanced [0.5,1.5) through Lower-elementary [5.5,6.5) — [joshdavham/jreadability](https://github.com/joshdavham/jreadability)
- An LLM fine-tune ("sarashina2-7b-jreadability") exists on Hugging Face for readability prediction (model card not fetched) — [ronantakizawa/sarashina2-7b-jreadability](https://huggingface.co/ronantakizawa/sarashina2-7b-jreadability)
- An older Japanese machine-scoring readability formula is documented in the literature — [A Computer Readability Formula of Japanese Texts for Machine Scoring](https://www.semanticscholar.org/paper/083a06aa6f7b9a3dedc76e944082e70387dc97b8)
- jReadability has been used in applied readability studies (e.g. vaccination messages) — [PMC5328916](https://pmc.ncbi.nlm.nih.gov/articles/PMC5328916/)

### Inferences
- Because jReadability runs on top of fugashi/UniDic, a browser port would need a UniDic-backed tokenizer in WASM (Lindera-UniDic or sudachi-wasm) plus reimplementation of the five features; the formula itself is trivial to port.
- An "N-level" estimator for an app is best built as: tokenize with UniDic/SudachiDict -> map lemmas to an unofficial JLPT list (tanos-derived) and kanji to a JLPT/jōyō grade list -> report coverage per level (vocabulary profiling), optionally combined with jReadability band. This is how community tools work (**UNVERIFIED** generalization).

### Gaps
- "Sakai's JLPT level estimator" could not be located before the search budget ran out; no source found.
- No open vocabulary-profiler tool for Japanese was verified in this session.
- No validation data comparing jReadability bands to JLPT levels was found.

---

## 6. Embeddings and semantic tools for Japanese

### Takeaway
On JMTEB (now hosted within the MTEB leaderboard, 28 datasets / 5 task types), the strongest reported open models are Ruri-v3-310m (77.24 avg), Ruri-v3-130m (76.55), PLaMo-Embedding-1B (76.10), Ruri-v3-70m (75.48) and Sarashina-Embedding-v2-1B (claimed SOTA July 2025); Ruri v3 (ModernBERT-Ja, 100K vocab) has community ONNX exports at 30m/130m/310m for transformers.js, making the 30m/70m variants the realistic in-browser choice. Model licenses could not be verified because huggingface.co was blocked.

### Cited Findings
- JMTEB v2.0 integrates with the MTEB framework; 28 datasets across Classification (7), Clustering (3), STS (2: JSTS, JSICK), Retrieval (11), Reranking (5: ESCI, JQaRA, MIRACL, ...); "The leaderboard is now hosted on the MTEB Leaderboard" — [sbintuitions/JMTEB](https://github.com/sbintuitions/JMTEB); [MTEB leaderboard models](https://leaderboard.mteb.org/models)
- Reported JMTEB averages: Ruri-v3-310m 77.24; Ruri-v3-130m 76.55; PLaMo-Embedding-1B 76.10 (top-class as of early April 2025); Ruri-v3-70m 75.48; Sarashina-Embedding-v2-1B claims SOTA average across 28 datasets (benchmarked July 28, 2025) (snippets of model cards) — [cl-nagoya/ruri-v3-310m](https://huggingface.co/cl-nagoya/ruri-v3-310m); [cl-nagoya/ruri-v3-130m](https://huggingface.co/cl-nagoya/ruri-v3-130m); [cl-nagoya/ruri-v3-70m](https://huggingface.co/cl-nagoya/ruri-v3-70m); [pfnet/plamo-embedding-1b](https://huggingface.co/pfnet/plamo-embedding-1b); [sbintuitions/sarashina-embedding-v2-1b](https://huggingface.co/sbintuitions/sarashina-embedding-v2-1b)
- Ruri v3 is built on ModernBERT-Ja with a 100K-token vocabulary (vs 32K in v1/v2) and FlashAttention (snippet) — [ruri-v3-30m-ONNX README](https://huggingface.co/onnx-community/ruri-v3-30m-ONNX/blob/main/README.md)
- ONNX exports exist for ruri-v3-30m, -130m, -310m (sirasagi62 collection; also onnx-community and Japan-AI-Consulting repos), enabling use in transformers.js for browser/Node — [sirasagi62 ruri-v3-onnx collection](https://huggingface.co/collections/sirasagi62/ruri-v3-onnx); [sirasagi62/ruri-v3-30m-ONNX](https://huggingface.co/sirasagi62/ruri-v3-30m-ONNX); [Japan-AI-Consulting/ruri-v3-310m-onnx](https://huggingface.co/Japan-AI-Consulting/ruri-v3-310m-onnx)
- A blog documents serverless inference of Ruri v3 on Cloudflare Containers — [oshiteku post](https://posts.oshiteku.app/ruri-v3-on-cloudflare/)
- General 2025-2026 MTEB roundups (secondary/commercial blogs; not authoritative for Japanese) — [CodeSOTA MTEB 2026](https://www.codesota.com/benchmarks/mteb); [Modal MTEB article](https://modal.com/blog/mteb-leaderboard-article)

### Inferences
- For on-device semantic search over learner sentences, ruri-v3-30m (int8/q4 ONNX) is the only Japanese-specialised model small enough for phones/browsers; 130m is borderline for desktop browsers with WebGPU; 310m and the 1B models are server-side.
- **UNVERIFIED** (prior knowledge, HF blocked): Ruri v3 models are Apache-2.0; PLaMo-Embedding-1B is Apache-2.0; multilingual-e5 (Microsoft) and BGE-M3 (BAAI) are MIT; Sarashina-Embedding-v1-1B used a "Sarashina Model NonCommercial License" (v2 license must be checked before commercial use). Verify each model card.
- OpenAI/Voyage/Cohere commercial embeddings score competitively on Japanese but were not found on the JMTEB snippets fetched; treat their Japanese scores as unverified.

### Gaps
- ONNX file sizes per quantization for ruri-v3-30m/130m/310m: model card blocked.
- Exact JMTEB scores for multilingual-e5-large, BGE-M3, OpenAI text-embedding-3, Voyage, Cohere embed-v4: not retrieved (JMTEB leaderboard.md returned 404; MTEB leaderboard not fetched).
- Licenses of all embedding models unverified this session.

---

## 7. Kanji stroke data and handwriting recognition

### Takeaway
Stroke-order data is fully open (KanjiVG CC BY-SA 3.0; AnimCJK Arphic Public License + LGPL; Kanji alive CC BY 4.0 with 1,235-kanji MP4/WebM/SVG animations and audio). For recognition, the open option is Tegaki (GNU General Public License, copyleft, aging), while Google's ML Kit Digital Ink Recognition offers on-device recognition for 300+ languages including Japanese via a proprietary SDK; the inputtools.google.com handwriting endpoint is undocumented/unofficial.

### Cited Findings
- KanjiVG: Creative Commons Attribution-Share Alike 3.0; SVG with stroke order/numbering; variant and stripped editions — [KanjiVG/kanjivg](https://github.com/KanjiVG/kanjivg)
- AnimCJK: Arphic Public License for kanji/hanja/hanzi SVGs, GNU Lesser General Public License for code and kana/stroke SVGs; ~7,007 Japanese characters — [parsimonhi/animCJK](https://github.com/parsimonhi/animCJK)
- Kanji alive: CC BY 4.0; 1,235 kanji, 247 radicals; stroke animations in MP4 (H.264) and WebM, stroke images SVG, ~10,187 audio files — [kanjialive/kanji-data-media](https://github.com/kanjialive/kanji-data-media)
- Tegaki: "GNU General Public License"; Python stack with recognition engines, trainer, DB, IBus/SCIM integration; Japanese character models included; 299 stars, 11 open issues; homepage tegaki.org — [tegaki/tegaki](https://github.com/tegaki/tegaki)
- Google ML Kit Digital Ink Recognition recognizes handwritten text in 300+ languages / 25+ writing systems; recognition can happen on device (default) or in the cloud, cloud "usually producing more accurate results" (snippet) — [ML Kit Digital Ink Recognition](https://developers.google.com/ml-kit/vision/digital-ink-recognition)
- Google Input Tools handwriting supports 50+ languages and, for Japanese, kanji/hiragana/katakana; no public API documentation for inputtools.google.com was found (snippet) — [Google Input Tools handwriting](https://www.google.com/inputtools/services/features/handwriting.html); [Google Handwriting Input help](https://support.google.com/faqs/faq/6188721?hl=en)
- A standalone "Kanji Recognizer" site exists (unverified engine/license) — [Kanji Recognizer](https://sites.google.com/site/kanjirecognizer/)

### Inferences
- KanjiVG + AnimCJK together cover essentially all jōyō/jinmeiyō kanji with stroke order; Kanji alive adds audio and radical metadata but only for 1,235 kanji.
- Shipping Tegaki inside a proprietary mobile app would trigger GPL obligations; ML Kit is the pragmatic on-device recognizer on Android/iOS, and browser handwriting would need a custom model (e.g. a small CNN trained on KanjiVG-synthesised strokes) since no open browser-ready recognizer was found.
- **UNVERIFIED**: iOS Scribble (Apple Pencil) supports Japanese handwriting on iPadOS, and Apple's Vision framework text recognition includes Japanese; check Apple docs for current language lists.

### Gaps
- KanjiVG total character count and latest release date not fetched (site blocked).
- Zinnia/Wagomu engine licenses within Tegaki not confirmed from a fetched page.
- Details of the undocumented inputtools.google.com handwriting request format not found; using it commercially would violate the spirit of an unofficial endpoint.
- Learner-corpus error patterns beyond Lang-8: NINJAL I-JAS covers 1,000 learners from 12 L1s with written and spoken data, and C-JAS transcripts are "Creative Commons Attribution – Non-Commercial – No Derivative Works 4.0 International" (snippets), but I-JAS's own license and the TEC-JL (Koyama et al., LREC 2020) evaluation-corpus license were not verified — [I-JAS materials](https://www2.ninjal.ac.jp/jll/lsaj/ijas-document-en.html); [C-JAS](https://mmsrv.ninjal.ac.jp/c-jas/en/index.html); [Koyama et al. 2020](https://aclanthology.org/2020.lrec-1.26/)
