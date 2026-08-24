# JMdict sense-tag contract — 2026-08-12

## Baseline contradiction (must be resolved before UI wiring)

The work order says that 半島 sense 2 must carry `abbr+sens`. The pinned source
named by this repository, JMdict-simplified `3.6.2+20260803141815` (JMdict date
2026-08-03, sequence `1479770`), actually carries `misc: ["sens", "col"]`.
It does **not** carry `abbr`. Schema v3 preserves `sens+col`; inventing `abbr`
would violate source-of-truth and fail the verifier.

## Compatibility and authority

- JMdict is authoritative for tag codes and English descriptions. The compact
  index, detail shards, and CORE sidecar are derived data under CC BY-SA 4.0.
- `schemaVersion` is **3** for `dict-v2/index.json`, all 16 detail shards, and
  `dict.json`. Mixing schema 2 and schema 3 is an error, never an implicit
  fallback.
- `sharding.id` remains `fnv1a32-ascii-seq-mask15`; the 16-way assignment and
  all 69,996 entry sequence IDs are unchanged from `ca07a8e`.
- The worker validates schema, row length, gloss boundaries, tag arrays, tag
  vocabulary membership, sharding identity, and CORE schema before it returns
  any row.
- The current `corridor.js` still requires schema 2 at lines 993 and 1241 on
  this baseline. The trunk keeper must update those two validators and teach
  rendering to read this contract. This mission deliberately does not modify
  that forbidden file.

## Exact schema

### Compact index (`dict-v2/index.json`)

Index rows retain cells 0–11 byte-semantically and append cell 12:

```text
0  seq
1  head
2  primaryReading
3  primaryGloss
4  writtenForms
5  kanaForms
6  englishGlosses
7  normalizedGlosses
8  commonFlag
9  readingSummaries
10 glossApplicability
11 readingWrittenScopes
12 senseTagRows
```

`senseTagRows` has exactly one row per JMdict source sense, in source order:

```text
[glossStart, glossCount, misc[], field[], dialect[]]
```

`glossStart` and `glossCount` address a contiguous range in cell 6. Empty tag
arrays are explicit. Tag order is source order. The ranges are contiguous,
start at zero, and cover every flattened English gloss exactly once.

`senseTagVocabulary` is the machine-readable vocabulary, grouped by `misc`,
`field`, and `dialect`, with pinned JMdict English descriptions. The full
unfiltered JMdict tag dictionary remains in `tags`.

### Detail shards (`dict-v2/00.json` … `0f.json`)

The detail layout remains lossless. Each detail sense is:

```text
[partOfSpeech, appliesToKanji, appliesToKana, related, antonym,
 field, dialect, misc, info, languageSources, glosses]
```

Cells 5, 6, and 7 are the exact source arrays. Detail shards also use
`schemaVersion: 3`, making an old/new mix fail loudly.

### CORE (`data/share_alike/dict.json`)

CORE adds:

```json
{
  "schemaVersion": 3,
  "senseTagLayout": ["glossStart", "glossCount", "misc", "field", "dialect"],
  "senseTags": {
    "半島": [
      [0, 1, [], [], []],
      [1, 1, ["sens", "col"], [], []]
    ]
  }
}
```

`senseTags` is keyed by the existing first-wins CORE word. It contains only
entries with at least one tag; absence means that the pinned source has no tag
row for that CORE entry (or the legacy CORE row has no surviving pinned JMdict
sequence). Rows use source sense order and the same layout as index cell 12.
CORE meanings come from an older kotobako snapshot, so renderers must not align
them by ordinal guesswork when wording differs; use sequence-backed index/detail
data for a full sense display.

## Exact emitted vocabulary and display names

The following 152 category memberships are the exact codes present in the
69,996-entry tier. English is the pinned JMdict description. Japanese is the
recommended compact display name; it is UI guidance, not source data.

### Usage and other (`misc`)

| Code           | 日本語           | English                                      |
| -------------- | ---------------- | -------------------------------------------- |
| `abbr`         | 略語             | abbreviation                                 |
| `arch`         | 古語             | archaic                                      |
| `char`         | キャラクター名   | character                                    |
| `chn`          | 幼児語           | children's language                          |
| `col`          | 口語             | colloquial                                   |
| `company`      | 会社名           | company name                                 |
| `creat`        | 生物名           | creature                                     |
| `dated`        | 古めかしい語     | dated term                                   |
| `dei`          | 神名             | deity                                        |
| `derog`        | 蔑称             | derogatory                                   |
| `euph`         | 婉曲表現         | euphemistic                                  |
| `ev`           | イベント名       | event                                        |
| `fam`          | 親しみのある語   | familiar language                            |
| `fem`          | 女性語           | female term or language                      |
| `fict`         | 架空名           | fiction                                      |
| `form`         | 改まった語・文語 | formal or literary term                      |
| `given`        | 名               | given name or forename, gender not specified |
| `group`        | 集団名           | group                                        |
| `hist`         | 歴史用語         | historical term                              |
| `hon`          | 尊敬語           | honorific or respectful (sonkeigo) language  |
| `hum`          | 謙譲語           | humble (kenjougo) language                   |
| `id`           | 慣用表現         | idiomatic expression                         |
| `joc`          | 冗談・ユーモア   | jocular, humorous term                       |
| `leg`          | 伝説             | legend                                       |
| `m-sl`         | 漫画俗語         | manga slang                                  |
| `male`         | 男性語           | male term or language                        |
| `myth`         | 神話             | mythology                                    |
| `net-sl`       | ネットスラング   | Internet slang                               |
| `obj`          | 物の名称         | object                                       |
| `obs`          | 廃語             | obsolete term                                |
| `on-mim`       | 擬音語・擬態語   | onomatopoeic or mimetic word                 |
| `organization` | 組織名           | organization name                            |
| `person`       | 人物のフルネーム | full name of a particular person             |
| `place`        | 地名             | place name                                   |
| `poet`         | 詩語             | poetical term                                |
| `pol`          | 丁寧語           | polite (teineigo) language                   |
| `product`      | 商品名           | product name                                 |
| `proverb`      | ことわざ         | proverb                                      |
| `quote`        | 引用句           | quotation                                    |
| `rare`         | 稀な語           | rare term                                    |
| `sens`         | 配慮を要する語   | sensitive                                    |
| `serv`         | サービス名       | service                                      |
| `ship`         | 船名             | ship name                                    |
| `sl`           | 俗語             | slang                                        |
| `surname`      | 姓               | family or surname                            |
| `uk`           | 通常かな書き     | word usually written using kana alone        |
| `unclass`      | 未分類の固有名   | unclassified name                            |
| `vulg`         | 卑語             | vulgar expression or word                    |
| `work`         | 作品名           | work of art, literature, music, etc. name    |
| `yoji`         | 四字熟語         | yojijukugo                                   |

### Subject field (`field`)

| Code       | 日本語             | English                 |
| ---------- | ------------------ | ----------------------- |
| `Buddh`    | 仏教               | Buddhism                |
| `Christn`  | キリスト教         | Christianity            |
| `MA`       | 武道               | martial arts            |
| `Shinto`   | 神道               | Shinto                  |
| `agric`    | 農業               | agriculture             |
| `anat`     | 解剖学             | anatomy                 |
| `archeol`  | 考古学             | archeology              |
| `archit`   | 建築               | architecture            |
| `art`      | 美術・美学         | art, aesthetics         |
| `astron`   | 天文学             | astronomy               |
| `aviat`    | 航空               | aviation                |
| `baseb`    | 野球               | baseball                |
| `biochem`  | 生化学             | biochemistry            |
| `biol`     | 生物学             | biology                 |
| `bot`      | 植物学             | botany                  |
| `boxing`   | ボクシング         | boxing                  |
| `bus`      | ビジネス           | business                |
| `cards`    | カードゲーム       | card games              |
| `chem`     | 化学               | chemistry               |
| `civeng`   | 土木工学           | civil engineering       |
| `cloth`    | 服飾               | clothing                |
| `comp`     | コンピューター     | computing               |
| `cryst`    | 結晶学             | crystallography         |
| `dent`     | 歯学               | dentistry               |
| `ecol`     | 生態学             | ecology                 |
| `econ`     | 経済学             | economics               |
| `elec`     | 電気・電気工学     | electricity, elec. eng. |
| `electr`   | 電子工学           | electronics             |
| `engr`     | 工学               | engineering             |
| `ent`      | 昆虫学             | entomology              |
| `figskt`   | フィギュアスケート | figure skating          |
| `film`     | 映画               | film                    |
| `finc`     | 金融               | finance                 |
| `fish`     | 漁業・釣り         | fishing                 |
| `food`     | 食・料理           | food, cooking           |
| `gardn`    | 園芸               | gardening, horticulture |
| `genet`    | 遺伝学             | genetics                |
| `geogr`    | 地理学             | geography               |
| `geol`     | 地質学             | geology                 |
| `geom`     | 幾何学             | geometry                |
| `go`       | 囲碁               | go (game)               |
| `golf`     | ゴルフ             | golf                    |
| `gramm`    | 文法               | grammar                 |
| `grmyth`   | ギリシャ神話       | Greek mythology         |
| `hanaf`    | 花札               | hanafuda                |
| `horse`    | 競馬               | horse racing            |
| `internet` | インターネット     | Internet                |
| `jpmyth`   | 日本神話           | Japanese mythology      |
| `kabuki`   | 歌舞伎             | kabuki                  |
| `law`      | 法律               | law                     |
| `ling`     | 言語学             | linguistics             |
| `logic`    | 論理学             | logic                   |
| `mahj`     | 麻雀               | mahjong                 |
| `manga`    | 漫画               | manga                   |
| `math`     | 数学               | mathematics             |
| `mech`     | 機械工学           | mechanical engineering  |
| `med`      | 医学               | medicine                |
| `met`      | 気象学             | meteorology             |
| `mil`      | 軍事               | military                |
| `min`      | 鉱物学             | mineralogy              |
| `mining`   | 鉱業               | mining                  |
| `motor`    | モータースポーツ   | motorsport              |
| `music`    | 音楽               | music                   |
| `noh`      | 能                 | noh                     |
| `pathol`   | 病理学             | pathology               |
| `pharm`    | 薬理学             | pharmacology            |
| `phil`     | 哲学               | philosophy              |
| `photo`    | 写真               | photography             |
| `physics`  | 物理学             | physics                 |
| `physiol`  | 生理学             | physiology              |
| `politics` | 政治               | politics                |
| `print`    | 印刷               | printing                |
| `prowres`  | プロレス           | professional wrestling  |
| `psy`      | 精神医学           | psychiatry              |
| `psyanal`  | 精神分析           | psychoanalysis          |
| `psych`    | 心理学             | psychology              |
| `rail`     | 鉄道               | railway                 |
| `rommyth`  | ローマ神話         | Roman mythology         |
| `shogi`    | 将棋               | shogi                   |
| `ski`      | スキー             | skiing                  |
| `sports`   | スポーツ           | sports                  |
| `stat`     | 統計学             | statistics              |
| `stockm`   | 株式市場           | stock market            |
| `sumo`     | 相撲               | sumo                    |
| `surg`     | 外科学             | surgery                 |
| `telec`    | 電気通信           | telecommunications      |
| `tradem`   | 商標               | trademark               |
| `tv`       | テレビ             | television              |
| `vidg`     | ビデオゲーム       | video games             |
| `zool`     | 動物学             | zoology                 |

### Dialect (`dialect`)

| Code   | 日本語       | English      |
| ------ | ------------ | ------------ |
| `bra`  | ブラジル方言 | Brazilian    |
| `hob`  | 北海道方言   | Hokkaido-ben |
| `ksb`  | 関西方言     | Kansai-ben   |
| `ktb`  | 関東方言     | Kantou-ben   |
| `kyb`  | 京都方言     | Kyoto-ben    |
| `kyu`  | 九州方言     | Kyuushuu-ben |
| `nab`  | 長野方言     | Nagano-ben   |
| `osb`  | 大阪方言     | Osaka-ben    |
| `rkb`  | 琉球方言     | Ryuukyuu-ben |
| `thb`  | 東北方言     | Touhoku-ben  |
| `tsb`  | 土佐方言     | Tosa-ben     |
| `tsug` | 津軽方言     | Tsugaru-ben  |

## Recommended rendering law

1. Preserve the current **first-sense-wins** selection law. Tags describe a
   sense; they must not reorder senses or silently change the selected gloss.
2. Render chips beside the exact sense boundary, never at whole-entry scope.
   Suggested compact chips include `〔略〕` (`abbr`), `〔古〕` (`arch`),
   `〔口語〕` (`col`), `〔俗〕` (`sl`), `〔卑〕` (`vulg`), `〔要配慮〕`
   (`sens`), and localized field/dialect chips.
3. `sens` and `derog` need visible, non-color-only text. Do not use a warning
   icon without its label.
4. `uk` informs kana-first display: prefer the permitted kana form as the
   display head, while retaining written forms as searchable alternatives. It
   does not erase kanji or override reading/applicability restrictions.
5. Show `misc` before `field`, then `dialect`. Preserve source order within a
   category and deduplicate only identical adjacent chips.
6. Unknown future codes must render as the raw code plus the source English
   description, and should fail contract verification before publication.
7. Never infer a tag from gloss wording. In particular, do not infer `abbr`
   for 半島/Korea while the pinned source says `sens+col`.

## Verification command

```sh
node prototypes/corridor/tools/verify-dict-tags.mjs \
  --source-dir /path/to/the/two/pinned/jmdict-assets
```

The verifier checks pin integrity, exact source projection for every selected
sense, every selected `abbr` and `sens` occurrence, the 半島 contradiction,
zero sequence/sense/gloss loss against `ca07a8e`, CORE sidecar agreement, shard
assignment, and two independent byte-identical rebuilds.
