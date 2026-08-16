# WP4 · English search ranking — exact / primary-gloss priority tiers

Measured in real Chromium (playwright-core, 390×844, touch, iPhone UA) against the
served `prototypes/corridor/index.html` and the real bundled data
(22,934 dict entries · 2,582 kanji · 60 grammar · particles). Lists are the ordered
`data-result` (`t:id`) attributes actually rendered by `renderSearchResults()` —
DOM, not a function return value.

- **before** = `prototypes/corridor/corridor.js` at `f433edf` (change `git stash`ed, re-measured)
- **after**  = the same file with the priority tiers
- raw ordered lists: [`search-capture-before.json`](./search-capture-before.json) · [`search-capture-after.json`](./search-capture-after.json)

## The tier design

`searchResults()` scores an entry per query. The English lane gained two tiers
**above** the pre-existing word-boundary (70) / substring (40) pair and **below**
the romaji-exact (95) tier, so the reading door still wins when a query is genuine
romaji (`go` → 五・ご・碁・語 unchanged at the head):

| score | tier | example |
| --: | --- | --- |
| 100 | kanji / kana exact (untouched) | `開` → 開 |
| 95 | romaji reading exact (untouched) | `sekai` → 世界 |
| **92** | **query IS the entry's PRIMARY (first) gloss** | `world` → 世界 ("the world") |
| **85** | **query IS one of the entry's later glosses** | `world` → 俗 (gloss 4 = "the world") |
| 80 / 75 | kanji-prefix / romaji-prefix (untouched) | |
| 70 | word-boundary substring in the joined glosses (untouched) | |
| 40 | any substring in the joined glosses (untouched) | |

### Gloss normalisation (applied to both the gloss and the query)

`normalizeGloss()` reduces a gloss to its bare head phrase:

1. lowercase;
2. **drop parenthetical qualifiers** — `world (of haiku, art, etc.)` → `world`,
   `water (esp. cool or cold)` → `water`, then collapse the resulting whitespace;
3. **drop one leading `the` / `a` / `an` / `to`** — `the world` → `world`,
   `to eat` → `eat` — only when something survives, so the gloss `a` and the
   query `to` stay themselves.

Because it runs on both sides, typing `the world` or `to eat` lands in the same place.

### Tie-breaking inside a tier

The comparator gained one key between score and the old shorter-headword rule:

```
score desc → tie asc → headword length asc      (tie = 0 for every non-exact match)
tie = (entry is a kanji ? 1000 : 0) + glossIndex * 10 + jlptRank
```

- **word before kanji** — a single kanji's `m` is a one-word mnemonic label
  ("World", "Water", "Eat"), not a translation; without this, 界 (1 char) would
  beat 世界 (2 chars) on the old shorter-first rule. This is the fix's load-bearing part.
- **earlier gloss position** wins.
- **jlptRank** (N5=0 … N1=4, ungraded=5): a graded word is the one a learner means
  — this is what puts 食べる (N5) above 食う (ungraded) for `eat`.

`tie` is set **only** when an entry's final score comes from the 92/85 tiers. Every
other entry keeps `tie = 0`, so `b.score - a.score || 0 || a.w.length - b.w.length`
is exactly the old comparator — the kana, romaji and kanji doors cannot reorder.

## 1–2 · English queries (acceptance)

### `world`  

results: 40 before → 40 after · sha256(ordered t:id) before `90d22a55508c07a8` after `ec895dc746928af4`

| # | before | after | after gloss (first 3) |
| --: | --- | --- | --- |
| 1 | word:園 | word:世界 | the world; society; the universe |
| 2 | word:俗 | word:世 | world; society; public |
| 3 | word:壇 | word:世間 | world; society; people |
| 4 | word:世 | word:ワールド | world |
| 5 | kanji:界 | kanji:界 | World |
| 6 | word:一体 | word:世の中 | society; the world; the times |
| 7 | word:泳ぐ | word:天地 | heaven and earth; the universe; the world |
| 8 | word:下界 | word:社会 | society; public; community |
| 9 | word:外部 | word:俗 | layman (esp. as opposed to a Buddhist monk); laity; man of the world |
| 10 | word:各地 | word:人中 | society; company; the public |

### `eat`  

results: 40 before → 40 after · sha256(ordered t:id) before `1720c016c522563f` after `c77114df6c16451d`

| # | before | after | after gloss (first 3) |
| --: | --- | --- | --- |
| 1 | word:食 | word:食べる | to eat; to live on (e.g. a salary); to live off |
| 2 | kanji:食 | word:召し上がる | to eat; to drink |
| 3 | word:飲食 | word:食う | to eat; to live; to make a living |
| 4 | word:過ぎ | word:喫する | to eat; to drink; to smoke |
| 5 | word:会食 | word:食らう | to eat; to drink; to wolf |
| 6 | word:外食 | kanji:食 | Eat |
| 7 | word:間食 | word:召す | to call; to summon; to send for |
| 8 | word:三時 | word:いただく | to receive; to get; to accept |
| 9 | word:召す | word:食 | food; foodstuff; eating |
| 10 | word:頂戴 | word:飲食 | food and drink; eating and drinking |

### `water`  

results: 40 before → 40 after · sha256(ordered t:id) before `e594e924f70468a8` after `41fa02860071d92f`

| # | before | after | after gloss (first 3) |
| --: | --- | --- | --- |
| 1 | word:海 | word:水 | water (esp. cool or cold); fluid (esp. in an animal tissue); liquid |
| 2 | word:粥 | word:水分 | water; liquid; fluid |
| 3 | word:境 | kanji:水 | Water |
| 4 | word:渚 | kanji:氵 | Water |
| 5 | word:水 | word:注ぐ | to pour (into); to sprinkle on (from above); to water (e.g. plants) |
| 6 | word:藻 | word:海 | sea; ocean; waters |
| 7 | word:袋 | word:粥 | thin rice porridge; watery cooked rice; rice gruel |
| 8 | word:滝 | word:境 | border; boundary; turning point |
| 9 | word:潮 | word:渚 | water's edge; beach; shore |
| 10 | word:壺 | word:藻 | algae; waterweed; seaweed |

### `school`  

results: 40 before → 40 after · sha256(ordered t:id) before `d6b21bb07daaa122` after `724f1f58efa9d8e7`

| # | before | after | after gloss (first 3) |
| --: | --- | --- | --- |
| 1 | word:個 | word:学校 | school |
| 2 | word:塾 | word:スクール | school |
| 3 | word:部 | word:流派 | school (of painting, ikebana, etc.) |
| 4 | word:流 | word:学部 | faculty (of a university); school; college |
| 5 | word:門 | word:学園 | educational institution; school; academy |
| 6 | word:級 | word:門 | gate; branch of learning based on the teachings of a single master; school |
| 7 | kanji:塾 | word:宗派 | sect; denomination; school (e.g. of poetry) |
| 8 | word:医大 | word:国学 | study of classical Japanese literature and culture; provincial school (established under the ritsuryō system for educating children of district governors); school (of a provincial capital during the Xia, Shang and Zhou dynasties) |
| 9 | word:一派 | word:一門 | family; clan; kin |
| 10 | word:一門 | word:群れ | group; crowd; flock |

### `tomorrow`  

results: 5 before → 5 after · sha256(ordered t:id) before `ad96cfb058cb947a` after `26a806042ed57db4`

| # | before | after | after gloss (first 3) |
| --: | --- | --- | --- |
| 1 | word:明朝 | word:明日 | tomorrow; near future |
| 2 | word:明晩 | word:明朝 | tomorrow morning |
| 3 | word:明日 | word:明晩 | tomorrow evening |
| 4 | word:明後日 | word:明後日 | day after tomorrow; wrong (e.g. direction) |
| 5 | word:明々後日 | word:明々後日 | in three days' time; two days after tomorrow |


## 3 · Non-regression: the frozen doors

Every list below is **byte-identical** before → after (full ordered `t:id` array, not just the head).

- `せかい` — 10 results, sha256 `d85b3388ba46ea4d88c08e53a91cd03165976a13213a78d14c6a094c3310b5fd` → `d85b3388ba46ea4d88c08e53a91cd03165976a13213a78d14c6a094c3310b5fd` — **IDENTICAL**
- `sekai` — 10 results, sha256 `d85b3388ba46ea4d88c08e53a91cd03165976a13213a78d14c6a094c3310b5fd` → `d85b3388ba46ea4d88c08e53a91cd03165976a13213a78d14c6a094c3310b5fd` — **IDENTICAL**
- `かいさい` — 1 results, sha256 `59aaaa4fc0391399a0b0315522215559940f6f10f3dcab56028b0ef2d487c809` → `59aaaa4fc0391399a0b0315522215559940f6f10f3dcab56028b0ef2d487c809` — **IDENTICAL**
- `kaisai` — 1 results, sha256 `59aaaa4fc0391399a0b0315522215559940f6f10f3dcab56028b0ef2d487c809` → `59aaaa4fc0391399a0b0315522215559940f6f10f3dcab56028b0ef2d487c809` — **IDENTICAL**
- `開` — 40 results, sha256 `077273e660b9bd70c7a0d7276f1121c73987a20866abd2f523fb820ba7fa44b6` → `077273e660b9bd70c7a0d7276f1121c73987a20866abd2f523fb820ba7fa44b6` — **IDENTICAL**
- `wa` — 40 results, sha256 `f39859369576772b085a86e656640016c8fa5746318f7137339e99519e56c645` → `f39859369576772b085a86e656640016c8fa5746318f7137339e99519e56c645` — **IDENTICAL**
- `bakari` — 2 results, sha256 `de19b4565507e0dd9b0a42ff2bae0d336992fd3e1f3f9ac58caee50d4b176904` → `de19b4565507e0dd9b0a42ff2bae0d336992fd3e1f3f9ac58caee50d4b176904` — **IDENTICAL**

Full lists, unabridged:

`せかい`

    before: word:世界 word:世界一 word:世界的 word:世界観 word:世界中 word:世界大戦 word:世界銀行 word:世界遺産 word:世界各地 word:世界各国
    after : word:世界 word:世界一 word:世界的 word:世界観 word:世界中 word:世界大戦 word:世界銀行 word:世界遺産 word:世界各地 word:世界各国

`sekai`

    before: word:世界 word:世界一 word:世界的 word:世界観 word:世界中 word:世界大戦 word:世界銀行 word:世界遺産 word:世界各地 word:世界各国
    after : word:世界 word:世界一 word:世界的 word:世界観 word:世界中 word:世界大戦 word:世界銀行 word:世界遺産 word:世界各地 word:世界各国

`かいさい`

    before: word:開催
    after : word:開催

`kaisai`

    before: word:開催
    after : word:開催

`開`

    before: kanji:開 word:開く word:開演 word:開花 word:開会 word:開館 word:開業 word:開局 word:開口 word:開校 word:開港 word:開墾 word:開催 word:開始 word:開示 word:開城 word:開場 word:開設 word:開戦 word:開拓 word:開通 word:開廷 word:開店 word:開発 word:開票 word:開封 word:開閉 word:開放 word:開幕 word:開国 word:開き word:開ける word:開業医 word:開拓者 word:開発部 word:開発者 word:開発元 word:開き直る word:開始時刻 word:開発途上国
    after : kanji:開 word:開く word:開演 word:開花 word:開会 word:開館 word:開業 word:開局 word:開口 word:開校 word:開港 word:開墾 word:開催 word:開始 word:開示 word:開城 word:開場 word:開設 word:開戦 word:開拓 word:開通 word:開廷 word:開店 word:開発 word:開票 word:開封 word:開閉 word:開放 word:開幕 word:開国 word:開き word:開ける word:開業医 word:開拓者 word:開発部 word:開発者 word:開発元 word:開き直る word:開始時刻 word:開発途上国

`wa`

    before: word:輪 word:和 word:把 word:わ particle:wa word:１ word:我 word:技 word:私 word:訳 word:脇 word:枠 word:椀 word:湾 word:罠 word:碗 kanji:和 kanji:弯 kanji:惑 kanji:或 kanji:枠 kanji:椀 kanji:歪 kanji:湾 kanji:碗 kanji:腕 kanji:蒦 kanji:話 kanji:賄 word:ワウ word:悪い word:悪さ word:悪気 word:悪者 word:割る word:患う word:災い word:若い word:若さ word:若者
    after : word:輪 word:和 word:把 word:わ particle:wa word:１ word:我 word:技 word:私 word:訳 word:脇 word:枠 word:椀 word:湾 word:罠 word:碗 kanji:和 kanji:弯 kanji:惑 kanji:或 kanji:枠 kanji:椀 kanji:歪 kanji:湾 kanji:碗 kanji:腕 kanji:蒦 kanji:話 kanji:賄 word:ワウ word:悪い word:悪さ word:悪気 word:悪者 word:割る word:患う word:災い word:若い word:若さ word:若者

`bakari`

    before: word:ばかり word:ばかりか
    after : word:ばかり word:ばかりか


## Other English queries that moved (not required, reported for honesty)

### `peninsula`  

results: 3 before → 3 after · sha256(ordered t:id) before `9163d9d76b464397` after `9b778c290724aaa8`

| # | before | after | after gloss (first 3) |
| --: | --- | --- | --- |
| 1 | word:崎 | word:半島 | peninsula; Korea |
| 2 | word:半島 | word:崎 | small peninsula; cape; promontory |
| 3 | word:朝鮮半島 | word:朝鮮半島 | Korean peninsula |

### `house`  

results: 40 before → 40 after · sha256(ordered t:id) before `ff1aec110ecc504d` after `6883027b7e49a0b5`

| # | before | after | after gloss (first 3) |
| --: | --- | --- | --- |
| 1 | word:宝石 | word:家 | house; residence; dwelling |
| 2 | word:法制 | word:宅 | house; home; one's house |
| 3 | word:縫製 | word:家屋 | house; building |
| 4 | word:法制局 | word:宿す | to house; to contain; to harbour (a feeling) |
| 5 | word:家 | word:邸宅 | (large) house; residence; mansion |
| 6 | word:宿 | word:ハウス | house; greenhouse; house music |
| 7 | word:宅 | word:メゾン | house |
| 8 | word:盆 | kanji:家 | House |
| 9 | word:隣 | word:住居 | dwelling; house; residence |
| 10 | word:舎 | word:住まい | dwelling; house; residence |

### `go`  

results: 40 before → 40 after · sha256(ordered t:id) before `69b483e776ab2ddb` after `526a0c63f39408eb`

| # | before | after | after gloss (first 3) |
| --: | --- | --- | --- |
| 1 | word:五 | word:五 | five; 5 |
| 2 | word:ご | word:ご | honorific/polite/humble prefix; honorific suffix |
| 3 | word:碁 | word:碁 | go (board game) |
| 4 | word:語 | word:語 | word; term; language |
| 5 | kanji:娯 | kanji:娯 | Recreation |
| 6 | kanji:碁 | kanji:碁 | Go |
| 7 | word:号 | word:行く | to go; to move (towards); to head (towards) |
| 8 | word:合 | word:まいる | to go; to come; to call |
| 9 | word:壕 | word:囲碁 | go (board game) |
| 10 | word:豪 | word:居らっしゃる | to come; to go; to be (somewhere) |

### `time`  

results: 40 before → 40 after · sha256(ordered t:id) before `d49f928055b9aa7a` after `c39d67b84eaa861a`

| # | before | after | after gloss (first 3) |
| --: | --- | --- | --- |
| 1 | word:知名 | word:時間 | time; hour; period |
| 2 | word:地名 | word:度 | time (three times, each time, etc.); times |
| 3 | word:致命傷 | word:時期 | time; season; period |
| 4 | word:致命的 | word:時刻 | time; (the) hour; favourable time |
| 5 | word:回 | word:手間 | time; labour; labor |
| 6 | word:間 | word:月日 | time; years; days |
| 7 | word:系 | word:～遍 | time |
| 8 | word:兼 | word:時 | time; hour; moment |
| 9 | word:古 | word:歳月 | time; years |
| 10 | word:刻 | word:ころ | (approximate) time; around; about |

### `person`  

results: 40 before → 40 after · sha256(ordered t:id) before `9cbf66b48a2a3d95` after `da13339010c6f4a8`

| # | before | after | after gloss (first 3) |
| --: | --- | --- | --- |
| 1 | word:他 | word:者 | person |
| 2 | word:鬼 | word:人物 | person; character; figure |
| 3 | word:形 | word:～者 | person |
| 4 | word:個 | kanji:人 | Person |
| 5 | word:黒 | word:方 | direction; way; person |
| 6 | word:子 | word:人間 | human being; human; person |
| 7 | word:侍 | word:身体 | body; physical system; (the) person |
| 8 | word:者 | word:法師 | Buddhist priest; bonze; layman dressed like a priest |
| 9 | word:身 | word:人 | -ian (e.g. Italian); -ite (e.g. Tokyoite); -er (e.g. performer, etc.) |
| 10 | word:人 | word:他 | another place; some other place; somewhere else |

### `book`  

results: 40 before → 40 after · sha256(ordered t:id) before `cc53d6c91bffc70f` after `d4e7519b6e104f63`

| # | before | after | after gloss (first 3) |
| --: | --- | --- | --- |
| 1 | word:課 | word:本 | book; volume; script |
| 2 | word:巻 | word:書物 | book; volume |
| 3 | word:冊 | word:書籍 | book; publication |
| 4 | word:帯 | word:冊子 | book; booklet; story book |
| 5 | word:天 | word:ブック | book |
| 6 | word:判 | kanji:本 | Book |
| 7 | word:文 | word:著 | (written) work; book; (written) by |
| 8 | word:本 | word:著作 | writing (a book); book; (literary) work |
| 9 | word:友 | word:著書 | (written) work; book; writings |
| 10 | word:十 | word:文 | letter; note; mail |


Note on `go` and `time`: both are parseable as romaji (`go`→ご, `time`→ちめ).
`go` keeps its entire romaji-exact head (五・ご・碁・語・娯・碁) because 95 > 92 —
the newly-promoted English matches (行く, まいる, …) slot in *below* it and push the
old 40-tier tail off the 40-result cap. `time` had no romaji-**exact** match, only
romaji-**prefix** (75, 知名/地名/致命傷), so the English exact tier legitimately
outranks it and 時間 leads.

## 4 · Suite

```
$ node prototypes/corridor/tools/verify-corridor.mjs
91/91 checks passed
  ok   search · the typed door accepts romaji  — "kaisai" → word:開催
  ok   search · the typed door accepts kana  — "かいさい" → word:開催
  ok   search · the typed door accepts kanji  — "開" → kanji:開
  ok   search · the typed door accepts English  — "peninsula" → word:半島
  ok   search · the typed door accepts grammar  — "ばかり" → grammar:bakari
  ok   particles · the search knows は  — "wa" → particle:wa
  ok   no console errors during the walk  — clean
```

## 5 · Console / page errors

0 across all 18 measured queries in both the before and after captures
(`consoleErrors: []` in both capture JSONs), and 0 in the 91-check walk.

## 6 · Cost of the index

The index is built lazily, once. Measured in Chromium as (first search latency −
warm search latency), same page, same data:

| build | cold − warm |
| --- | --: |
| before | 28.5 ms |
| after, first cut (unconditional regexes) | 107.1 ms |
| **after, shipped (fast-path guard)** | **50.6 ms** |

The shipped `normalizeGloss()` skips the regex work for the ~80% of glosses with no
parenthesis, no doubled space and no exotic whitespace. Verified over all **73,691**
real glosses that the fast path returns **byte-identical output to the naive version
in 0 cases of divergence**. Warm search latency is unchanged (131.7 ms vs 126.1 ms,
both dominated by the 350 ms input debounce and within run-to-run noise).
