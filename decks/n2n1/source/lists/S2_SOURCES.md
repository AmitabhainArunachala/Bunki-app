# S2: vocabulary from past JLPT tests — sources

Built 2026-10-07. Output: `s2-past-tests.jsonl`, with **1,846 unique words** (term + reading). They come from 2,198 tested-word rows across 35 papers (29 old 1級/2級 papers and 6 official jlpt.jp PDFs).

- `level`: **N1 = 1,041**, **N2 = 805**. If a word was tested at both levels (100 words), `level` is "N2", the lower level where it was tested, and `levels` lists both.
- 300 words appear on more than one paper. `count` gives the number of appearances, and `sources` lists every one with its exam, question number, kind and URL.

## What a row contains

The list has only the word each question tested. Distractors are never included. By question type:

| kind                                                   | what was taken                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| reading (読み)                                         | the underlined word; reading = the correct option                                                         |
| orthography (表記)                                     | the correct kanji option; reading = the hiragana in the question                                          |
| same-reading (old 1級 問題Ⅱ)                           | the underlined word **and** the option with the same reading                                              |
| same-kanji (old 1級 問題Ⅳ)                             | the stem word **and** the option that shares its kanji                                                    |
| context (文脈規定)                                     | the correct option                                                                                        |
| paraphrase (言い換え, and old 2級 definition-matching) | the underlined word and the correct option. In the definition-matching sections, only the correct option. |
| usage (用法)                                           | the headword being tested                                                                                 |
| formation (派生語・複合語)                             | the completed word, e.g. 未＋使用 → 未使用                                                                |

Some details of the format:

- Terms are in dictionary form (勧められた → 勧める).
- Readings are in hiragana. Katakana loanwords are converted to hiragana, e.g. ノウハウ → のうはう.
- Glosses are short English written by the extractor. They are not taken from the source.
- Extra fields: `levels`, `kind`, `q` (the question number as printed), `count` and `sources`.

## Sources used

| #   | Source                                                                                                                                                                                                                                                                                                                                            | Papers   | Words                                                         | Trust                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **jlpt.jp 『日本語能力試験公式問題集』 (2012)**: [N1V.pdf](https://www.jlpt.jp/samples/sample2012/pdf/N1V.pdf), [N2V.pdf](https://www.jlpt.jp/samples/sample2012/pdf/N2V.pdf)                                                                                                                                                                     | N1 + N2  | 26 + 33                                                       | **Highest.** These are the official PDFs. jlpt.jp says they are "2010年の改定後実際に出題した試験問題". Answers were checked against the official 正答表 PDFs.                                                                                                                                                                                                                            |
| 2   | **jlpt.jp 『公式問題集 第二集』 (2018)**: [N1V.pdf](https://www.jlpt.jp/samples/sample2018/pdf/N1V.pdf), [N2V.pdf](https://www.jlpt.jp/samples/sample2018/pdf/N2V.pdf)                                                                                                                                                                            | N1 + N2  | 30 + 32                                                       | **Highest**, with the same official provenance and answer key as #1.                                                                                                                                                                                                                                                                                                                      |
| 3   | **jlpt.jp 『新しい「日本語能力試験」問題例集』 (2009)**: [N1-mondai.pdf](https://www.jlpt.jp/samples/pdf/N1-mondai.pdf), [N2-mondai.pdf](https://www.jlpt.jp/samples/pdf/N2-mondai.pdf)                                                                                                                                                           | N1 + N2  | 9 + 12                                                        | Official, but these are **sample questions, not a live test**. The `exam` field says so.                                                                                                                                                                                                                                                                                                  |
| 4   | **jp.tingroom.com, old 1級 文字・語彙, typed transcriptions**: [index](http://jp.tingroom.com/kaoshi/yiji/yjkszt/). Pages: 1991 `1020`, 1992 `1022`, 1993 `1025`, 1994 `1231`+`1232`, 1995 `1235`, 1996 `1564`, 1997 `1568`, 1998 `1571`, 1999 `2608`, 2000 `2611`, 2001 `4525`, 2002 `4528`, 2003 `4531`, 2005 `4818`, 2006 `4821` (all `.html`) | 15 × 1級 | 1,123 rows (75 per paper; 73 for 2003)                        | **Medium-high.** A Chinese study portal reposted the full papers, which were most likely typed from the 『試験問題と正解』 books. The transcriptions have typing slips (ぽ/ぼ, 漠字 for 漢字, a few garbled options). Obvious slips were corrected, and 2 questions were skipped (2003 問題Ⅰ(7)(8) have no text). Only 1999 and 2003 include an answer key. All picks matched those keys. |
| 5   | **jp.tingroom.com, old 1級, page _scans_ of the printed booklet**: 2004 [`4814`](http://jp.tingroom.com/kaoshi/yiji/yjkszt/4814.html)+[`4815`](http://jp.tingroom.com/kaoshi/yiji/yjkszt/4815.html); 2007 [`7013`](http://jp.tingroom.com/kaoshi/yiji/yjkszt/7013.html)–`7015`                                                                    | 2 × 1級  | 53 + 75                                                       | **High.** These are images of the real booklet, so the underlines are visible. Both papers include the answer-key page, and every pick matches it. The 2004 scans are incomplete: 15 of 65 questions are missing (問題Ⅱ 16–20, Ⅲ 30–35, Ⅳ 37–38, Ⅵ 59–60).                                                                                                                                |
| 6   | **jp.tingroom.com, old 2級 文字・語彙, typed transcriptions**: [section](http://jp.tingroom.com/kaoshi/erji/). Pages: 1991 `1037`, 1992 `1040`, 1993 `1043`, 1996 `1686`, 1997 `2437`, 1998 `2440`, 1999 `2443`, 2000 `3265`, 2001 `3511`, 2004 `4901`, 2005 `4904`, 2006 `4907` (all `.html`)                                                    | 12 × 2級 | 805 rows (65 per paper for 1991–99, 70 per paper for 2000–06) | **Medium-high**, with the same caveats as #4. Only 2004 includes a key, and all picks matched it. For 1996–99 and 2004–06, the year comes from the page title.                                                                                                                                                                                                                            |

**Words per source, counting each unique word once for every source it appears in:** tingroom 1級 1,251 · tingroom 2級 805 · jlpt.jp 142. The largest single pages are the tingroom 1級 papers at 75 words each.

### Cross-checks (used for verification only; no rows came from these)

- [cnblogs: 2001年日语能力考试二级真题及答案](https://www.cnblogs.com/honglihua8688/p/3681290.html) is an independent transcription of 2001 2級 with explained answers. 68 of 70 tested words appear verbatim in it. The other 2 differ only by inflection. All 10 問題Ⅲ answers match.
- [sina blog: 2004年日语能力考试2级真题及答案](https://blog.sina.com.cn/s/blog_6075e79d0100dsz8.html) is an independent transcription of 2004 2級. 65 of 70 tested words appear verbatim. The other 5 differ only by inflection or spelling (スケジュール is misspelled on tingroom).

### How the answers were chosen

Most old papers on tingroom have no answer key. For those, the extracting model picked the correct reading, kanji or option from the four choices printed. The word itself was always on the paper; only the pick is inferred. Wherever a key was available, every pick matched it. That covers 1級 1999, 2003, 2004 and 2007, 2級 2004, and the official 2012/2018 PDFs. Papers whose picks have not been checked against a key: 1級 1991–98, 2000–02, 2005–06, and 2級 1991–2001 (2001 partly cross-checked, see above), 2005–06.

## Looked for but not found or not usable

- **Old 1級 2008 and 2009, and old 2級 1994, 1995, 2002, 2003 and 2007–09.** None of these are on tingroom; I probed the ID ranges around the known pages.
  - [koolearn 2009年12月 1級真题及答案](https://language.koolearn.com/20160121/830465_6.html) exists, and its page 5 holds the 文字・語彙 key. Page 1, which has the questions, redirects to the homepage for non-browser clients.
  - [xdf.cn 2003 1級](http://mtoutiao.xdf.cn/riyu/201206/3293067_5.html) timed out. ryjp.com (2003 2級) refused the connection. The Wayback Machine returned 429 (rate limited).
  - A browser session could probably recover koolearn 2009-12 1級.
- **Live N1/N2 papers since 2010, beyond the two 公式問題集.** JLPT does not publish them. Chinese sites carry 回忆版 (memory reconstructions, e.g. on zhihu), but I excluded those because they are neither official nor verifiable.
- **GitHub datasets.**
  - [syu-toutousai/jlpt-n1-question-bank](https://github.com/syu-toutousai/jlpt-n1-question-bank) keeps its questions AES-encrypted, with no plaintext committed.
  - The others I found (OpenJLPT, open-anki-jlpt-decks, jlpt-kanji-dictionary) are JLPT _level lists_. They do not show what appeared on a past paper.
- **Anki decks.** I found none that states past-paper provenance per word. The 1級 decks I saw are built from 完全マスター or similar textbooks.
- **Japanese-language transcriptions of old 1級/2級 papers.** I found none in time. The 『試験問題と正解』 books themselves are not online.
- **2012 and 2009 jlpt.jp PDFs.** These are image-only, so I read them visually. The 2018 PDFs have a text layer.

## Caveats

- Some tested words are basic, for example いつも and 練習 from 2級 paraphrase answers. Filter by `kind` or `level` if you only want the hard ones.
- The usage headwords printed in kana were given their standard kanji, chosen for the sense tested: はかる → 図る, わく → 沸く, かたい → 硬い/堅い. Words usually written in kana were kept in kana.
- Two 1級 fill-in suffix items were stored as the completed word (情報網, 英語圏). 1999 ご恩 was stored as 恩.
- Year labels for old papers follow the tingroom page titles. Before 2009 the old test was held once a year, in December.
- Raw per-paper extraction files are in the session scratchpad and are not kept here. Every row in the JSONL carries its own URL and question number, so each one can be checked against the page.
