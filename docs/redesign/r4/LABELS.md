# Plain words: the round-4 label glossary (for every lane)

John, on the tour (T2): *"things like \*Real Sentences read and recall.. is just very confusing, obtuse and way to generic to mean anyhting at all"*; (T5): *"Save and add to list are confusing??? … Open the web?? what does that even mean. \*this sentice, save astk the tutor, practice. very very confusing…"*. And THE BRIEF: *"Not confusing in the least."*

**The rule.** A label says what the thing is, or what the button does, in words a first-time user already knows. A poetic name may stay only as a proper name with a plain line beside it. One action has one name everywhere: **Save** (保存) puts a word into your review cards; **Add to a list** (リストに追加) files a saved word; **Full entry** (全項目) opens the dictionary page.

**How it was made.** The skin lane walked the base build (`345dba92`, 390×844, EN and 日本語) through the door, Today, Read, the reader, the word popup, the full entry, Learn, three deck homes, card fronts and backs, Words and Me, and recorded every visible label (`~/.dharma/bunki_review/2026-10-09/r4/skin/labels-base.json`). Each row below names its file and owner. **Status:** *skin* means the skin lane changes it on `claude/r4-skin-20261009` (the REPORT confirms each one landed); *for <lane>* means the owning lane should use this wording; *pinned* means a verifier asserts the old text, so the change waits for a logged pin edit.

The name is **回廊 KAIRO** (D3). In running English it is **KAIRO**; in running Japanese **回廊**; as a mark or credit, **回廊 KAIRO** (the 回廊 part carries `lang="ja"`). The repository, storage keys and `bunki-*` ids never change.

## Shell and the whole app (skin)

| Where | Old EN | New EN | Old JA | New JA | Status |
|---|---|---|---|---|---|
| `corridor.js` `render()`: `#tray` (bookmark; screen-reader word) | Lists | Lists *(kept: it names the lists that room holds; `verify-corridor` pins `/^Lists N$/`)* | 覚 | リスト | skin |
| `#tray` count | always shown, "0" | the count shows only when you have saved words; at 0 the bookmark is quiet | 0 | (same) | skin (D7) |
| `#chrome-dojo` (Learn cap) | Learn | Learn; a small ink dot appears when cards are due, and its name says how many ("Learn · 3 due") | 学ぶ | 学ぶ・復習 3 | skin (D7) |
| `#theme-seal` and the picker's name | choose a world | Colour theme | 世界を選ぶ | 配色を選ぶ | skin |
| World picker | ten unnamed stones | the stones in two labelled rows, **Day** and **Night**; Night offers both 金 (藍 night) and 殻 (electric); a line beneath names the world in words ("Gold on indigo", "Electric phosphor") | — | 昼 · 夜; ベロ藍・浪 … | skin (D2) |
| Top line crumb on wide screens, in the Today room (`render()`) | lists | Today *(the tray is the Today tab's room)* | リスト | 今日 | skin (`verify-pr77-ports` pin widened, logged) |
| Reader picture credit (`readerPicture`, read lane's function, one string) | Illustration · Bunki | Illustration · 回廊 KAIRO | 挿絵 · Bunki | 挿絵 · 回廊 KAIRO | skin (D3) |
| Shelf sort option | New to Bunki | Newly added | 新着 | 新着 | skin (D3) |
| Grammar that cannot be saved | This grammar pattern is not in Bunki’s list, so it can’t be memorized. | This grammar pattern isn’t in KAIRO’s grammar list yet, so it can’t become a card. | この文法は一覧にないため、覚えられない。 | この文法はまだ一覧にないため、札にできない。 | skin (D3) |
| Guided session eyebrow (`guided-session.mjs`) | Bunki / a living thread | 回廊 KAIRO / guided practice | Bunki / 生きた糸 | 回廊 KAIRO / 案内つきの練習 | skin (D3) |
| Guided session credit | Original Bunki practice | Original KAIRO practice | Bunki オリジナル練習 | 回廊オリジナルの練習 | skin (D3) |
| Guided session, no card | Bunki has no card for this pattern yet. | KAIRO has no card for this pattern yet. | この型の札は、まだ Bunki にない。 | この型の札は、まだ回廊にない。 | skin (D3) |
| Report sheet, empty | …or an idea for Bunki. | …or an idea for KAIRO. | — | — | skin (D3) |
| Exported list, its first line (Markdown file) | # name — 分岐 Bunki | # name — 回廊 KAIRO | (same) | (same) | skin (D3) |
| Reference library note | Bunki groups these entries… | KAIRO groups these entries… | — | — | skin (D3) |
| Deck player notes (`decks/player/mount.js`, two EN strings) | …in Bunki. / Bunki can also save them. | …in KAIRO. / KAIRO can also save them. | 回廊 (already) | (same) | skin (D3; cards lane's file, two strings only) |
| Tab bar | Today · Read · Learn · Words · Me | (kept: plain) | 今日 · 読む · 学ぶ · 辞書 · 私 | (kept) | — |

## Learn (no lane owns it; T7 "carry on", so the skin applies the plain words)

| Where | Old EN | New EN | Old JA | New JA | Status |
|---|---|---|---|---|---|
| Stage eyebrow | Learn · the next sitting | Learn · today | 学ぶ・次の稽古 | 学ぶ・今日 | skin |
| Stage title | The stage | Up next | 舞台 | 次の稽古 | skin |
| Stage card, nothing waiting | No saved card is waiting. | No saved words to review yet. | 待っている札はない。 | 復習を待つ札はまだない。 | skin |
| Stage split | decks · new / decks · due | new today / due today | デッキの新しい札 / デッキの復習 | 今日の新しい札 / 今日の復習 | skin |
| Review door | SRS cards · no cards waiting | Review cards · none waiting | 復習 · 待っている札はない | (kept) | skin |
| Guided door | a guided session · …explanations and word doors | Guided test practice · N2 written · 6 questions · about 15 min · every question explained | 案内つきの稽古 · …解説と語の扉つき | 案内つきの練習 · N2 筆記 6問 · 約15分 · 一問ごとに解説 | skin |
| Guided gloss | An explanation after every question, a door to every word. Start here when unsure. | Every question is explained, and every word opens its meaning. Start here if you’re unsure. | 問いごとに解説と語の扉。迷ったらここから。 | 一問ごとに解説があり、どの語も意味をひらける。迷ったらここから。 | skin |
| Deck row: your own texts | My contexts · personal paragraphs · conversations · connections | Your own texts · paragraphs and conversations you add | 私の文脈 · 自分の段落・会話・つながり | 自分の文章 · 自分で加えた段落や会話 | skin |
| Deck row: context deck | Context cards · one paragraph per word | One word, one paragraph · a short paragraph for each word | 文脈札 · 一語ごとの段落カード | 一語一段落 · 語ごとに短い段落 | skin |
| Deck row: saved words | My saved cards · words you saved · N waiting | Your saved words · N to review | 覚えるの札 · 覚えた語 ・ N 枚 待っている | 保存した語 · 復習 N 枚 | skin |
| Focus heading | Focus sitting | Timed practice | 集中の座 | 時間を決めて練習 | skin |
| Focus gloss | Set a length and sit with the cards. When the time is up, the block ends on its own. | Pick a length and work through your cards. It stops on its own when the time is up. | 時間を決めて、静かに札と向き合う。… | (kept: plain Japanese) | skin (EN) |
| Focus label | what to drill | what to practise | 何を | 何を練習する | skin |
| Focus start | sit for 20 minutes | Start 20 minutes | 20分 座る | 20分 始める | skin |
| Focus mode, due | your due cards · N waiting · after the first lap, practice | proposed: Cards due · N waiting · then extra rounds | — | — | **pinned** (`verify-corridor` filters on "your due cards" and the lap clause) |
| Focus mode, probe | yomi probe · sound out compounds you never took | proposed: Reading check · read compounds you haven’t saved | 読み探査 | 読みの確認 | **pinned** (`verify-corridor`, `verify-learning-record` filter on "yomi probe") |
| Tests door | N written tests · awaiting review | proposed: N written tests · not yet checked by a person | 筆記テスト N組 · 検収前 | 人の確認前 | **pinned** (`verify-assessment-written-section`) |
| Hall note | …your next session with Sensei. | …your next session with the tutor. | 先生 | (kept) | skin |

## The deck names (cards lane owns the deck homes; the skin applies the same words in Learn's list)

| Deck | Old EN | New EN | Old JA | New JA |
|---|---|---|---|---|
| `kotoba-mine` (his 323 words exported from his Japanese app, one real sentence each) | Real sentences · read and recall | Your word list · one real sentence each | 言葉の鉱脈・文 | 単語帳・実例文で一語ずつ |
| `kotoba-mcd` (the same 323 words, a 2–5 sentence passage with the word hidden) | massive-context cloze · real and written passages | Your word list · fill the gap in a passage | 言葉の鉱脈・MCD | 単語帳・長文の穴埋め |
| `n2` | N2 vocabulary · passages | N2 words · in short passages | N2・文章で覚える | N2の語・短い文章で |
| `n1` | N1 vocabulary · passages | N1 words · in short passages | N1・文章で覚える | N1の語・短い文章で |
| `senmon` | Your five fields · master’s level | Your fields · advanced words | 専門・五つの分野 | あなたの分野・上級の語 |

*Status: the two 単語帳 rows are skin (Learn's `DOJO_DECKS`, unpinned). The `n2`, `n1` and `senmon` rows are for cards: `verify-n2n1-decks` pins their Learn titles, so they change together with that pin. For the deck homes, cards sets `decks/<id>/deck.json` `titleEn/titleJa` (title only, never an id) so home and list say the same. John named three fields (D5), so "five" is wrong now. 単語帳 is the name his 323 imported words already carry in the app.*

## The word popup and the reader (read lane)

| Where | Old EN | New EN | Old JA | New JA |
|---|---|---|---|---|
| Popup actions | Save · Add to list… | **Save** first; after saving, the same place offers **Add to a list** | 保存 · リストに追加… | 保存 → リストに追加 |
| Popup link to the web | Open the web › | Kanji & related words › | つながりをひらく › | 漢字と関連語 › |
| Popup sentence row | This sentence: Save · Ask the tutor · Practice | one action: **Practise this sentence** (saving it and asking the tutor live inside) | この文：保存 · 先生に聞く · 練習 | この文を練習する |
| Full entry, sentence chips | save this sentence · discuss this sentence · practice this sentence | Save sentence · Ask the tutor · Practise sentence | — | 文を保存 · 先生に聞く · 文を練習 |
| Reader version note | The simplified version retells the same article in easier Japanese. | Simplified: the same story in easier Japanese. | やさしい版は、同じ記事をやさしい日本語で書き直したものです。 | やさしい版：同じ記事を、やさしい日本語で。 |
| Reader tip | Tap any word to see what it means. Right-click (or press and hold) for more. | Tap a word for its meaning. Press and hold for more. | — | 語をタップで意味。長押しでほかの操作。 |
| Reader audio line | no recording yet · Kore | No audio for this article yet *(the voice name stays in Settings; "Kore" is pinned in several verifiers, so change it with a logged pin edit)* | 音声未収録 · Kore | この記事の音声はまだない |
| Reader place | Reading places · keep this place | Bookmarks · Bookmark this spot | 読書の栞 · ここに栞を置く | 栞 · ここに栞をはさむ |
| Reader chrome capture (`#reader-take`, screen-reader name) | memorize | Save *(one name for one action)* | 覚える | 保存 |
| Shelf seal | 永 (read as 水, T3) | a seal that means reading, e.g. 読 | 永 | 読 |
| Shelf title | bookshelf | Read *(or "Bookshelf", capitalised)* | 本棚 | 読む |

## Today and Me (today lane)

| Where | Old EN | New EN | Old JA | New JA |
|---|---|---|---|---|
| Today's word count | 265 kanji carry it | 265 kanji contain it | この部品の漢字 265 字 | (kept) |
| Today's word door | Follow 日 → | Kanji with 日 → | 日 をたどる | 日 を含む漢字 → |
| Today tally | 1 word walk | 1 word explored | — | 調べた語 1 |
| Empty saved list | No memorizing items yet. The Memorize button on any word, kanji, part, or idiom page adds it — this month’s list fills itself. | No saved words yet. Tap **Save** on any word, kanji or idiom and it appears here. | — | まだ保存した語はない。語・漢字・四字熟語の「保存」でここに入る。 |
| Note to the builder | keep it | Send | — | 送る |
| Me: horizons | Four horizons | Your goals *(N1 · July 2027 and his three fields, D5)* | 四つの地平 | 目標 |
| Me: won-back words | Came home · mended in gold | Words you won back | 戻ってきた言葉 | 取り戻した語 |
| Me: contents | Inside the book / At the back of the book | More / Settings | 目次 / 奥付 | もっと見る / 設定 |
| Me: own texts | Personal collections | Your own texts | 私の文脈 | 自分の文章 |
| Door hint | Touch a word | Tap a word | — | — |

## Cards (cards lane)

| Where | Old EN | New EN | Old JA | New JA |
|---|---|---|---|---|
| Grade buttons (D1) | Again · Recalled | **Again · Hard · Good · Easy**, each with its real interval | 再 もう一度 · 良 思い出せた | もう一度 · 難しい · 良い · 簡単 |
| Back, rule hint | Choose Again if seeing the answer improved your understanding. | If you only knew it after seeing the answer, choose Again. | 答えを見て理解が深まったなら もう一度 | 答えを見てから分かったなら「もう一度」 |
| Back, English | + English | Show English | 英語 | 英語を見る |
| N1 back, zoom | Full passage · Focus | Whole passage · Just the sentence | — | 全文 · この文だけ |

## Words (no lane; T6 "carry on")

| Where | Old EN | New EN | Old JA | New JA |
|---|---|---|---|---|
| Search lens | KKLD number | Kodansha number | Kodansha | 講談社番号 |
| SKIP opener | Find by shape · open SKIP wheel | Find a kanji by its shape | 形から探す · SKIP ホイール | 形から漢字を探す |
| Word web trail | Your walk | Words you visited | たどった道 | たどった語 |

*Proposed for a later pass (pinned or not toured tonight): the crumb's hidden names (galaxy, field, focus, yomi probe, the mirror), which `verify-corridor` and the doors suite pin as a three-way back/crumb contract.*
