# Deliberate verifier changes

Only chrome language and room-material selector pins change. Storage, SRS, ledgers, offline behavior, deck-front concealment, hit-size and contrast assertions remain intact.

| File                                                  | Assertion                  | Before → after                                                        | Reason                                                                                                                       |
| ----------------------------------------------------- | -------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `prototypes/corridor/tools/verify-guided-session.mjs` | J3 attempt chrome material | `html.dataset.room === attempt` → `html.dataset.register === attempt` | F5 gives `data-room=guided` a stable room identity while preserving the exact stage-sensitive register and chrome assertion. |

| `verify-design-reader-shelf.mjs` | T1 tools name | `^学習ツール` → `^Tools` | F2 selects the English button label; title placement and visibility stay required. |
| `verify-design-reader-shelf.mjs` | M1 unreviewed note | `未確認` → `Unreviewed` | F2 selects English; both numeric counts, single line and explanation control remain required. |
| `verify-corridor-accessibility.mjs` | Quiet kanji dialog locator and sampled eyebrow | `この語の漢字` → `kanji in this word` | F2 selects English; dialog behavior, geometry and contrast are unchanged. |
| `verify-experience.mjs` | E11 stroke and parts buttons | `画数 by strokes`, `部品 by its parts` → `by strokes`, `by its parts` | F2 removes the leaking Japanese label; the same shape-filter journey remains. |
| `verify-experience.mjs` | E16 shelf title selector | `.shelf-mast-title .en-inline` → `.shelf-mast-title .view-title` | The active English title is now the heading itself; language-cycle and pressed-state assertions remain. |
| `verify-n2n1-decks.mjs` | UI deck title equality | Three Japanese titles → their explicit English UI titles | F2 changes chrome; original `titleJa` data assertions stay Japanese and unchanged. |
| `verify-design-reader-shelf.mjs` | T1 tool tile names | Requires Japanese `.l-ja` plus `.en-sub` in accessible name → requires CJK-free active English label equal to accessible name | F2 deliberately selects one language. All tiles, containment, viewport fit and one-line checks stay required. |

## Corridor language pins

| Assertion / selector                                              | Before → after                                                                                                             | Reason                                                                                                                                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Glossary kicker census, line 689                                  | `.story-kicker .l-ja` equals `用語集` → equals `Glossary`                                                                  | `storyTopic()` supplies the exact English kicker through the language law; the complete census/tally equality assertions are retained.                                                        |
| Glossary check description, line 700                              | `rows wear 用語集` → `rows wear Glossary`                                                                                  | Describe the actual EN label being checked.                                                                                                                                                   |
| NINJAL signal-row identity, line 783                              | name includes `国語研` → name equals `NINJAL pair`                                                                         | `renderSignals()` now selects the explicit English instrument name. All measured/unmeasured truth checks remain unchanged.                                                                    |
| Kanji Kentei tag existence and diagnostic filter, lines 1140–1141 | tag includes `漢検` → includes `Kanji Kentei`                                                                              | The catalogue level tag is now English. Its required presence is retained.                                                                                                                    |
| Idiom-heading count, line 1196                                    | heading contains `熟語` → matches `^\d+ idioms and set phrases$`                                                           | Kanji-page idiom headings explicitly preserve the count in the English label. `idiomHeading > 0` remains.                                                                                     |
| Kanji-to-word header selector, line 1204                          | `よく使う語` or `含む語` → exact `common compounds` or `words that contain it`                                             | Select the same two translated compound sections; the real word hop assertion remains.                                                                                                        |
| Kanji-to-radical header selector, line 1226                       | header contains `部品` → exact `main components`                                                                           | Select the same translated component section; radical identity and family-size assertions remain.                                                                                             |
| Radical-to-kanji header selector, line 1257                       | header contains `含む字` → exact `kanji that contain this part`                                                            | Select the same translated radical-family section; real kanji-hop assertion remains.                                                                                                          |
| Saved-node chrome count, line 1278                                | `覚\s*[1-9]` → `^Lists\s+[1-9][0-9]*$`                                                                                     | EN chrome must retain a positive numeric count. This requires the source to restore `Lists N`; it does not accept a count-free label.                                                         |
| Locked-audio pending label, line 1652                             | `音声準備中` → exact `audio coming soon · Kore`                                                                            | Existing approved-voice pending copy is now English. Zero playback/voice controls, Kore identity and forbidden-device-voice checks remain.                                                    |
| Variant non-ticket row identity, line 1669                        | `E 奥行`, `F 触れの段`, `G 衛星の触れ` → `E depth`, `F tap ladder`, `G satellite tap`                                      | The same three A–G identities have English labels. The four ticket marker counts remain unchanged; F4 later adds one named navigation row to the exact census (eight total), as logged below. |
| Default EN tray label, line 1688                                  | contains `lists` → exact `Lists N` with numeric count                                                                      | Preserve the tray count as well as its translated name.                                                                                                                                       |
| Default EN chrome language observation, line 1689                 | requires `覚` in tray → observes CJK across back and tray                                                                  | English mode deliberately removes Japanese from chrome; the later condition now rejects CJK and still requires the active EN toggle and back/lists controls.                                  |
| Default language assertion and diagnostic, lines 1694–1696        | bilingual-default title/condition and Japanese tray presence → English-default title/condition, no CJK, numeric tray label | The intentional language-law behavior supersedes the old bilingual chrome contract. The subsequent Japanese toggle assertions remain unchanged.                                               |
| D23 held-card management door, line 2023                          | exact `そのカードを開く` → exact `open that card`                                                                          | Same card-management action, translated label; all retained-entry identity, held-state and ledger assertions remain unchanged.                                                                |
| Probe dojo mode selector, line 2174                               | `読み探査` → `yomi probe`                                                                                                  | Select the same translated mode before asserting zen glass and missed-probe record effects.                                                                                                   |
| Taken-kanji dojo mode selector, line 2223                         | `漢字だけ` → `kanji only`                                                                                                  | Select the same translated mode; honest intervals, FSRS and ledger assertions remain unchanged.                                                                                               |
| Examples-gesture heading selector, line 2359                      | heading contains `用例` → exact `examples — tap a word for its meaning`                                                    | Select the same translated gesture instruction. Example counts/token-door behavior and gesture wording assertions remain unchanged.                                                           |
| Unstarted-kanji dojo mode selector, line 3992                     | `漢字だけ` → `kanji only`                                                                                                  | Select the same translated mode; no invented FSRS/revlog/new-card-slot assertions remain unchanged.                                                                                           |
| Lesson Kanji Kentei breadth assertion, line 4045                  | heading includes `漢検` → includes `Kanji Kentei`                                                                          | The lesson-lane heading is translated. Required JLPT breadth and required Kentei section remain.                                                                                              |
| Due-card mode-copy selector, line 4144                            | `覚えるの札` → `your due cards`                                                                                            | Find the same translated due-card mode before checking refill/practice copy and count.                                                                                                        |
| Due-card mode activation selector, line 4150                      | `覚えるの札` → `your due cards`                                                                                            | Activate the same translated due-card mode. First-lap schedule effects and second-lap byte-stable ledger assertions remain unchanged.                                                         |

## Deck language and navigation pins

1. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 298; occurrences: 1.
   Before: `after.text.includes('保存できませんでした')`
   After: `after.text.includes('Could not save.')`
   Reason: EN save-failure chrome; unchanged card, grade controls and ledger-byte checks.

2. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 375; occurrences: 1.
   Before: `empty.msg.includes('入っていません') && !empty.msg.includes('復元しました') && empty.button === '復元'`
   After: `empty.msg.includes('This backup has no card records.') && !empty.msg.includes('Restored') && empty.button === 'Restore'`
   Reason: EN empty-backup notice and Restore label; unchanged ledger-byte preservation and negative-success assertion.

3. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 386; occurrences: 1.
   Before: `first.msg.includes('このバックアップ：1枚・1回答') && first.msg.includes('いまの記録：2枚・2回答') && first.msg.includes('いまより少ない') && first.button === '置き換える'`
   After: `first.msg.includes('Backup: 1 cards · 1 answers') && first.msg.includes('Current record: 2 cards · 2 answers') && first.msg.includes('fewer records') && first.button === 'Replace'`
   Reason: EN restore-preview counts, warning and confirmation label; identical numeric counts and confirmation workflow.

4. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 386; occurrences: 1.
   Before: `done.includes('復元しました')`
   After: `done.includes('Restored')`
   Reason: EN successful restore status; all backup quarantine, record-count and acknowledgment checks retained.

5. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 395; occurrences: 1.
   Before: `home.includes('別に保管しました')`
   After: `home.includes('kept separately')`
   Reason: EN quarantine notice; exact quarantined bytes still required.

6. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 465; occurrences: 1.
   Before: `two.labels === 'もう一度/思い出せた' && two.hint.includes('思い出せた')`
   After: `two.labels === 'Again/Recalled' && two.hint.includes('Recalled')`
   Reason: EN two-grade labels and swipe hint; still exactly two buttons, fixed dock and ignored keys 2/4.

7. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 493; occurrences: 1.
   Before: `document.getElementById('kp-persist')?.textContent.includes('：')`
   After: `document.getElementById('kp-persist')?.textContent.includes('Device storage:')`
   Reason: Wait for the localized storage-status chrome rather than the retired Japanese colon.

8. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 495; occurrences: 1.
   Before: `/記録を消す|消えます/.test(b.textContent)`
   After: `/記録を消す|消えます|erase.*record|delete.*record|reset.*record|clear.*record/i.test(b.textContent)`
   Reason: Retain Japanese reset-deny strings and add English equivalents; reset prohibition is strengthened, not removed.

9. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 498; occurrences: 1.
   Before: `settings.label === 'バックアップの文字列'`
   After: `settings.label === 'Backup text'`
   Reason: EN backup textarea label; label association and axe checks unchanged.

10. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 498; occurrences: 1.
    Before: `/^端末の保存領域：(確保済み|未確保|不明)$/.test(settings.persist)`
    After: `/^Device storage: (persistent|not persistent|unknown)$/.test(settings.persist)`
    Reason: EN storage-status strings; the same three exhaustive statuses remain required.

11. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 499; occurrences: 1.
    Before: `settings.backup.join() === 'コピー,復元'`
    After: `settings.backup.join() === 'Copy,Restore'`
    Reason: EN backup actions in the same exact order; reset absence still required.

12. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 520; occurrences: 1.
    Before: `done.text.includes('思い出せた割合')`
    After: `done.text.includes('Recall rate')`
    Reason: EN completion summary label; Undo still restores the exact card count and review log.

13. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 531; occurrences: 1.
    Before: `kanji.chip === '字'`
    After: `kanji.chip === 'Kanji'`
    Reason: EN card-kind chrome; kanji blank text, no-choice rule, reveal and two-grade behavior retained.

14. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 543; occurrences: 1.
    Before: `const FOLD_ORDER = ['英語', '英訳', '漢字の形と意味', '類語', 'この語の他の文', '出典'];`
    After: `const FOLD_ORDER = ['English', 'Translation', 'Kanji form and meaning', 'Related words', 'Other sentences for this word', 'Source'];`
    Reason: EN disclosure labels; same six disclosure slots and strict ordering, with explicit passage-name normalization below.

15. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 544; occurrences: 1.
    Before: `const RULE_TEXT = '答えを見て理解が深まったなら もう一度';`
    After: `const RULE_TEXT = '答えを見て理解が深まったなら もう一度';
const UI_RULE_TEXT = 'Choose Again if seeing the answer improved your understanding.';`
    Reason: Keep Japanese source/bundle parity pin intact; add exact EN visible instruction for runtime chrome.

16. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 750; occurrences: 1.
    Before: `const TOPICS = { mind: '心と学び', india: 'インド・仏教', ai: 'AI・半導体', history: '世界史', language: '日本語' };`
    After: `const TOPICS = { mind: '心と学び', india: 'インド・仏教', ai: 'AI・半導体', history: '世界史', language: '日本語' };
const UI_REGISTERS = { 講: 'Lecture', 報: 'Reporting', 論: 'Essay', 話: 'Conversation', 学: 'Learning', 語: 'Expression' };
const UI_REGISTER_NAMES = { 講: 'Lectures and book summaries', 報: 'News and commentary', 論: 'Essays and ideas', 話: 'Spoken language', 学: 'Study and learning', 語: 'Speaking and writing' };
const UI_TOPICS = { mind: 'Mind and learning', india: 'India and Buddhism', ai: 'AI and semiconductors', history: 'World history', language: 'Japanese' };`
    Reason: Keep original Japanese source-data dictionaries intact; add exact EN presentation dictionaries solely for chrome assertions.

17. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 879; occurrences: 1.
    Before: `front.chips.includes(REGISTERS[card.register]) && front.chips.includes(TOPICS[card.topic]) && !front.chips.includes(deck.groups.find((g) => g.id === card.word.group)?.titleJa) && !front.chips.includes('書き下ろし') && front.reg === `文体：${REGISTER_NAMES[card.register]}（書き下ろし）``
   After: `front.chips.includes(UI_REGISTERS[card.register]) && front.chips.includes(UI_TOPICS[card.topic]) && !front.chips.includes(deck.groups.find((g) => g.id === card.word.group)?.titleEn) && !front.chips.includes('Original composition') && front.reg === `Register: ${UI_REGISTER_NAMES[card.register]} (Original composition)``
    Reason: EN register/topic chips and complete aria name; continue forbidding duplicated group/source chips and retaining 390px one-line assertion.

18. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1078; occurrences: 1.
    Before: `self.indeck === 'このデッキにあります'`
    After: `self.indeck === 'Already in this deck'`
    Reason: EN own-deck note; exact learned term, dictionary key, absence of take/full/stop and definition-token assertions retained.

19. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1086; occurrences: 1.
    Before: `deep.stop === 'ここで止めよう'`
    After: `deep.stop === 'Pause here'`
    Reason: EN recursive lookup stop note; lookup depth, token absence, definition, deck membership and Back behavior retained.

20. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1226; occurrences: 1.
    Before: `const at = summaries.map((t) => FOLD_ORDER.findIndex((k) => t.startsWith(k)));`
    After: `const at = summaries.map((t) => FOLD_ORDER.findIndex((k) => t.replace(/^Other passages for this word/, 'Other sentences for this word').startsWith(k)));`
    Reason: Explicitly recognize both localized passage and sentence disclosures in the original shared ordering slot; strict order and recognized-label requirement unchanged.

21. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1279; occurrences: 1.
    Before: `b.summaries[0] === '英語' && b.summaries.at(-1) === '出典'`
    After: `b.summaries[0] === 'English' && b.summaries.at(-1) === 'Source'`
    Reason: EN first/last fold labels; native disclosure type, exact positions, order and closed English gloss assertions retained.

22. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1285; occurrences: 1.
    Before: `b.src.text.includes(`文章${c.passage}`)`
   After: `b.src.text.includes(`Passage ${c.passage}`)`
    Reason: EN passage-number chrome inside source fold; learned source metadata, URLs, licence and closed-fold checks retained.

23. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1290; occurrences: 1.
    Before: `b.others?.summary === `この語の他の文章（${sibs.length}）``
   After: `b.others?.summary === `Other passages for this word (${sibs.length})``
    Reason: EN sibling-passage fold title and same exact count; sibling answer text remains forbidden.

24. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1302; occurrences: 1.
    Before: `const ja = [...ans.querySelectorAll('.kp-folds summary, .kp-tip-label')].every((n) => n.closest('[lang]').lang === 'ja');`
    After: `const chrome = [...ans.querySelectorAll('.kp-folds summary, .kp-tip-label')].every((n) => n.closest('[lang]').lang === 'en');`
    Reason: Fold labels are EN chrome and must use EN screen-reader language; translated content keeps its independent language checks.

25. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1304; occurrences: 1.
    Before: `return { ja, en, details:`
    After: `return { chrome, en, details:`
    Reason: Report localized chrome-language result under a descriptive property; retain English-content and native-details checks.

26. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1305; occurrences: 1.
    Before: `check('c) screen readers: the fold summaries read as Japanese, only the English text inside carries lang="en"', lang.ja && lang.en && lang.details`
    After: `check('c) screen readers: EN fold summaries and English content carry lang="en", while native details add no language override', lang.chrome && lang.en && lang.details`
    Reason: Update the localized speech-language assertion and its description without dropping any language or native-details requirement.

27. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1330; occurrences: 1.
    Before: `bar.rule?.includes(RULE_TEXT)`
    After: `bar.rule?.includes(UI_RULE_TEXT)`
    Reason: Exact EN grade instruction; fixed dock dimensions, hit testing, dismissal, stored preference and preserved open fold unchanged.

28. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1343; occurrences: 1.
    Before: `b.summaries[1] === '英訳' && b.en?.text.includes('未対応')`
    After: `b.summaries[1] === 'Translation' && b.en?.text.includes('unavailable')`
    Reason: EN unmatched-translation disclosure and honest unavailable notice; still prohibit the full passage translation.

29. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1556; occurrences: 1.
    Before: `first.front === '意味を思い出してからタップ'`
    After: `first.front === 'Recall the meaning, then tap'`
    Reason: EN front gesture instruction; sitting counts, third/fourth visit retirement and swipe-hint behavior unchanged.

30. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1612; occurrences: 1.
    Before: `b.summaries.at(-1) === '出典'`
    After: `b.summaries.at(-1) === 'Source'`
    Reason: EN final source-disclosure label in the sentence-deck assertion; same open gloss, source metadata and zero-zoom checks.

31. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1613; occurrences: 1.
    Before: `b.others?.summary === `この語の他の文（${w.cards.length - 1}）``
   After: `b.others?.summary === `Other sentences for this word (${w.cards.length - 1})``
    Reason: EN sentence sibling-disclosure name and exact original sibling count.

32. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1613; occurrences: 1.
    Before: `!/文章\d/.test(b.src.text)`
    After: `!/(?:文章|Passage )\d/.test(b.src.text)`
    Reason: Preserve Japanese passage-number deny pattern and add EN counterpart; sentence-source numbering prohibition strengthened.

33. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1836; occurrences: 1.
    Before: `tools.label === '削除'`
    After: `tools.label === 'Remove'`
    Reason: EN removal control label; exact 44px hit, top-bar placement, FSRS identity and reversible removal checks retained.

34. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1836; occurrences: 1.
    Before: `/削除しました/.test(gone.toast)`
    After: `/Card removed/.test(gone.toast)`
    Reason: EN reversible removal toast; all suspension, repair-log and undo assertions retained.

35. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1843; occurrences: 1.
    Before: `/1枚/.test(home) && /^1枚（削除 1）$/.test(counted) && after.text === 'ありません'`
    After: `/1 cards/.test(home) && /^1 cards \(Remove 1\)$/.test(counted) && after.text === 'None'`
    Reason: EN queue/card count, paused-removal reason and empty state; identical numeric counts and restored-record checks retained.

36. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1843; occurrences: 1.
    Before: `/2枚/.test(homeAfter)`
    After: `/2 cards/.test(homeAfter)`
    Reason: EN queue-size units after restoring suspended card; exact original numeric queue size retained.

37. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1873; occurrences: 1.
    Before: `ladder.head === 'この文で5回つまずいています'`
    After: `ladder.head === 'Difficulty on this sentence: 5 times'`
    Reason: EN five-lapse explanation; exact lapse count retained.

38. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1873; occurrences: 1.
    Before: `ladder.labels.join('/') === '別の文に替える/ヒントを付ける/保留'`
    After: `ladder.labels.join('/') === 'Use another sentence/Add a hint/Pause'`
    Reason: EN repair-step labels in identical swap/hint/suspend order.

39. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1873; occurrences: 1.
    Before: `ladder.swapTo.startsWith(`文章${swapOf('km-064-m01').passage}へ`)`
   After: `ladder.swapTo.startsWith(`Passage ${swapOf('km-064-m01').passage} `)`
    Reason: EN swap destination label; exact selected passage identity and unchanged repair workflow retained.

40. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1904; occurrences: 1.
    Before: `f1.hint === 'ヒントざ○○○'`
    After: `f1.hint === 'Hintざ○○○'`
    Reason: Only the hint caption changes to EN; Japanese stored reading hint remains byte-identical and confined to its repaired card.

41. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1928; occurrences: 1.
    Before: `/別の文に替えました/.test(now.toast)`
    After: `/Changed to another sentence/.test(now.toast)`
    Reason: EN sentence-swap status; unchanged suspension reason, preserved FSRS state, repair log and reload identity.

42. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1948; occurrences: 1.
    Before: `swapTo.startsWith('例文2へ')`
    After: `swapTo.startsWith('Example 2 ')`
    Reason: EN sentence-example destination caption; same exact example number.

43. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1948; occurrences: 1.
    Before: `/保留にしました/.test(now.toast)`
    After: `/Card paused/.test(now.toast)`
    Reason: EN suspension status; leech reason, suspend log and original lapse count retained.

44. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1966; occurrences: 1.
    Before: `ji.why === '替えられる文がありません' && ji.hint === '表に「貝＋才」'`
    After: `ji.why === 'No alternative sentence available' && ji.hint === 'Show “貝＋才” on the front'`
    Reason: EN no-alternative explanation and hint instructions; learned kanji parts remain identical, swap still disabled and keep log checked.

45. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1999; occurrences: 1.
    Before: `list.title === '語の一覧'`
    After: `list.title === 'Word list'`
    Reason: EN word-list heading; exact opened word, revealed-card return and details preserved.

46. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 2042; occurrences: 1.
    Before: `see.labels.join() === '参照,文法'`
    After: `see.labels.join() === 'See also,Grammar'`
    Reason: EN see-also/grammar captions; exact lexical items, IDs, grammar entry, positioning and word-list route retained.

47. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 2174; occurrences: 1.
    Before: `set.summary === 'このデッキのしくみ'`
    After: `set.summary === 'How this deck works'`
    Reason: EN method disclosure label; same deck-method line count, four settings groups and home-panel prohibitions retained.

48. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 2191; occurrences: 1.
    Before: `front.kindChip === '語'`
    After: `front.kindChip === 'Word'`
    Reason: EN whole-word kind chip; unchanged card type, hue axes, edge/color equality and visual invariants.

49. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 2217; occurrences: 1.
    Before: `ji.kindChip === '字'`
    After: `ji.kindChip === 'Kanji'`
    Reason: EN kanji kind chip; unchanged edge/type/state colors and all contrast requirements.

50. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 2218; occurrences: 1.
    Before: `s.kindChip === '語'`
    After: `s.kindChip === 'Word'`
    Reason: EN sentence-word kind chip; unchanged hue, level and no progress-counter assertion.

51. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1151; occurrences: 1.
    Before: `/覚える/.test(x.pop.note)`
    After: `x.pop.note === 'Save to your review cards in Bunki.'`
    Reason: Exact EN standalone save note; still one line, no save control, no sheet, no schedule change, same lookup record and close behavior.

52. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1586; occurrences: 1.
    Before: `/今日はここまで/.test(read.start) && modeRead === 'true' && /1枚/.test(self)`
    After: `read.start === 'Done for today' && modeRead === 'true' && self === 'Begin — 1 cards'`
    Reason: Exact EN disabled done label and one-card start label; unchanged due kanji, read/self mode, FSRS stability and no-suspension requirements.

53. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 2193; occurrences: 1.
    Before: `front.levelLabel === 'N1相当（公開リストによる目安）'`
    After: `front.levelLabel === 'N1 equivalent (estimated from public lists)'`
    Reason: EN level-chip aria description; unchanged N1 level, monochrome colors, kind/target styling and underline checks.

54. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1206; occurrences: 1.
    Before: `rest.querySelectorAll('.kp-chips, .kp-sentence').forEach((n) => n.remove());`
    After: `rest.querySelectorAll('.kp-chips, .kp-sentence').forEach((n) => n.remove());
rest.querySelectorAll('.kp-taphint').forEach((n) => { if (['Recall the meaning, then tap', 'Tap to reveal the answer'].includes(n.textContent)) n.textContent = ''; });
rest.querySelectorAll('.kp-rhint-label').forEach((n) => { if (n.textContent === 'Hint') n.textContent = ''; });`
    Reason: The existing front detector excludes metadata chrome. Ignore only the exact translated instruction strings and exact Hint caption in their original chrome nodes; every other Latin character still fails, learned repaired hints remain checked, and gloss/translation/tip/front-reading leakage checks are unchanged.

55. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1326; occurrences: 1.
    Before measurement: `const hit = document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2); return { position: getComputedStyle(document.querySelector('.kp-grades')).position, bottom: Math.round(b.bottom), top: Math.round(b.top), hit: !!hit?.closest('#kp-grade-good'), rule: document.getElementById('kp-rule')?.textContent ?? null };`
    After measurement: `const hit = document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2); const t = document.getElementById('primary-tabs')?.getBoundingClientRect(); const tabs = t?.height > 0 ? t : null; return { position: getComputedStyle(document.querySelector('.kp-grades')).position, bottom: Math.round(b.bottom), top: Math.round(b.top), expectedBottom: Math.round(tabs?.top ?? innerHeight), tabsBottom: tabs ? Math.round(tabs.bottom) : null, viewport: innerHeight, noOverlap: b.bottom <= (tabs?.top ?? innerHeight), hit: !!hit?.closest('#kp-grade-good'), rule: document.getElementById('kp-rule')?.textContent ?? null };`
    Before assertion: `bar.position === 'fixed' && bar.bottom === 844 && bar.hit`
    After assertion: `bar.position === 'fixed' && bar.bottom === bar.expectedBottom && bar.viewport === 844 && (bar.tabsBottom === null || bar.tabsBottom === 844) && bar.noOverlap && bar.hit`
    Reason: F4 deliberately docks the grading controls above visible primary tabs. Require the exact tabs top (or viewport bottom standalone), retain the exact 844px viewport/bottom pin for tabs, add explicit no-overlap, and keep actual grade-button hit checks and the full existing behavior/scroll assertions. Parent authorized this moved-dock assertion change.

56. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1529; occurrences: 1.
    Before measurement: `const top = await o.page.evaluate(`(() => { const b = document.querySelector('.kp-grades').getBoundingClientRect(); const g = document.getElementById('kp-grade-again').getBoundingClientRect(); return { bottom: Math.round(b.bottom), inView: g.top >= 0 && g.bottom <= innerHeight, hit: !!document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2)?.closest('#kp-grade-again') }; })()`);`
    After measurement: `const top = await o.page.evaluate(`(() => { const b = document.querySelector('.kp-grades').getBoundingClientRect(); const g = document.getElementById('kp-grade-again').getBoundingClientRect(); const t = document.getElementById('primary-tabs')?.getBoundingClientRect(); const tabs = t?.height > 0 ? t : null; return { bottom: Math.round(b.bottom), expectedBottom: Math.round(tabs?.top ?? innerHeight), tabsBottom: tabs ? Math.round(tabs.bottom) : null, viewport: innerHeight, noOverlap: b.bottom <= (tabs?.top ?? innerHeight), inView: g.top >= 0 && g.bottom <= innerHeight, hit: !!document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2)?.closest('#kp-grade-again') }; })()`);`
    Before assertion: `top.bottom === 844 && top.inView && top.hit`
    After assertion: `top.bottom === top.expectedBottom && top.viewport === 844 && (top.tabsBottom === null || top.tabsBottom === 844) && top.noOverlap && top.inView && top.hit`
    Reason: F4 deliberately docks the grading controls above visible primary tabs. Require the exact tabs top (or viewport bottom standalone), retain the exact 844px viewport/bottom pin for tabs, add explicit no-overlap, and keep actual grade-button hit checks and the full existing behavior/scroll assertions. Parent authorized this moved-dock assertion change.

57. File: `prototypes/corridor/tools/verify-kotoba-mine.mjs`; assertion/source line(s) at edit: 1151; occurrences: 1.
    Before: `x.pop.note === 'Save to your review cards in Bunki.'`
    After: `/覚える/.test(x.pop.note)`
    Reason: Supersedes edit 51 after actual run showed this assertion serves unchanged repository release/study*.html, not the redesigned built corridor. Restore its original Japanese expected save note; every standalone behavior check remains exactly as before. This is a correction of an overly broad label expectation change.

## Navigation variant census

| File                  | Assertion                     | Before → after                                                                                            | Reason                                                                                                               |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `verify-corridor.mjs` | Variant non-ticket row census | Three named non-ticket rows, seven total → four named non-ticket rows including `navigation`, eight total | F4 deliberately adds the nav variant. Exact total, every named row, and exactly four ticket markers remain required. |

## Older JLPT door labels

# Doors verifier language-law pin changes

Owned file: `prototypes/corridor/tools/verify-corridor-doors.mjs`.

| Location                                    | Before → after                                                                         | Reason and retained checks                                                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T10 explanatory comment, line179            | `each marked 未確認` → `each marked Unreviewed`                                        | Describe the default EN label accurately.                                                                                                                                                               |
| T10 explanatory comment, line197            | Japanese-only label/history description → `Unreviewed in English (未確認 in Japanese)` | Name the translated label; no behavior changes.                                                                                                                                                         |
| T10 exact-label comment, line199            | `exactly 未確認` → `exactly Unreviewed`                                                | Document the exact EN pin.                                                                                                                                                                              |
| T10 marked-chip predicate, line203          | trimmed chip equals `未確認` → equals `Unreviewed`                                     | The product explicitly translates the status to Unreviewed. Visible client rects, non-hidden visibility, positive opacity, exact label, section/row marking and required set presence remain unchanged. |
| T10 reworded negative control, line215      | test replacement `確認済` → `Reviewed`                                                 | The semantic opposite remains the negative control in English. The control must leave every set unmarked and the original text is restored afterwards. The hidden-chip control also remains.            |
| T10 control assertion description, line219  | `未確認` → `Unreviewed` in both label mentions                                         | State the actual exact label under test. Original chip count, nonempty set count, zero hidden marks and zero reworded marks remain unchanged.                                                           |
| T10 all-sets assertion description, line229 | `marked 未確認` → `marked Unreviewed`                                                  | Describe the translated status. Nonempty listed sets and all rows pending remain required.                                                                                                              |
| T11 progress parser, line254                | `(N) / (total) 問` → `Question (N) of (total)`                                         | Match the exact English question counter. Both numeric captures are retained; the started-run condition, real set ID and data-derived total-question equality remain unchanged.                         |

## Label audit

The complete file was read. These are the only exact Japanese UI-label pins in behavioral predicates. Japanese references in comments and route descriptions do not select product text. Existing bilingual fallback regexes for no-listening and loading-state observations remain unchanged. T0 identity, T1 record-lock/visible-title checks, T3 injected renderer fault/retry, all viewport/route variants, set IDs/question counts, T9 stalled-catalog control, T8 late-rejection control and T6 route behavior are retained.

T13/T14 fixture interception URLs and behavior assertions remain byte-for-byte unchanged, as directed. Their baseline fixture failures are reported independently; this pass does not repair or relax them.

## Verification

- `node --check prototypes/corridor/tools/verify-corridor-doors.mjs`: passed.
- `git diff --check -- prototypes/corridor/tools/verify-corridor-doors.mjs`: passed.
- T12/T13/T14 block comparison against HEAD: byte-identical, including fixture intercepts and all behavior assertions.
- Interim immutable v3 attempt refused behavioral testing at the unchanged T0 clean-build gate (`sourceDirty=true`); exact digest and file-manifest checks passed. Log: `doors-language-v3.log`.
- Runtime recheck against parent clean rebuilt artifact: pending.

| `verify-design-reader-shelf.mjs` | G7 exact version-switch labels | `原文 Original · N1`, `やさしい版 Simplified · N3` → `Original · N1`, `Simplified · N3` | F2 selects English; both version identities, levels, pressed states and retelling explanation remain required. |

| `verify-design-reader-shelf.mjs` | G7 active version wait | active label contains `やさしい` → contains `Simplified` | F2 selects the English version label. The switch must still complete, show the alternate article and retain its level/caption checks. |

| `verify-guided-session.mjs` | J19 ready-card count | button matches `復習する · 6` → matches `review what is ready · 6` | F2 changes the active English label. The exact six ready cards remain mandatory; the product restores the count in its EN label rather than relaxing the assertion. |

Numeric boundaries in the two deck swap labels remain required: the space after `Passage N` / `Example 2` rejects `Passage 10` as passage1 and `Example 20` as example2, matching the original Japanese boundary before `へ`. Actual next-card/target identity, FSRS and repair-ledger assertions stay unchanged.

## CI language-pin follow-through

The written-section public-catalog receipt now returns its measured `catalogHeading` (`lang`, active first-text-node title, subtitle language), replacing fabricated `catalogTitleJa`/`catalogSubtitleEn` observations. The exact heading assertion remains; reported observations now match the deliberately translated UI.

The broader release battery retains its behavioral assertions. Its old English-mode chrome pins are updated below. Japanese learning text, numeric boundaries, timing, storage, ledgers, offline, voice/control restrictions, lookup focus, hit sizes and contrast remain required.

### Mock provenance census

| File / location                                                            | Before → after                                            | Rationale and retained assertions                                                                                                                                |
| -------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prototypes/corridor/tools/verify-mock.mjs`, comment line224               | `未確認 is said once` → `Unreviewed is said once`         | Describe the current English status label.                                                                                                                       |
| `prototypes/corridor/tools/verify-mock.mjs`, chip selector line228         | exact trimmed `.status-chip` text `未確認` → `Unreviewed` | F2 translates UI status chrome. Keep the same status-chip elements, page-vs-row ancestry measurement, exact 25 papers, exactly one page mark and zero row marks. |
| `prototypes/corridor/tools/verify-mock.mjs`, assertion description line233 | `未確認 is said once` → `Unreviewed is said once`         | Match the translated label under test; the full predicate is unchanged.                                                                                          |

### Dictionary, listening, tutor and writing chrome

| File and assertion/selector                                                      | Before                                                                                   | After                                                                                                                                               | Reason                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify-skip-ui.mjs:59`, dictionary accessible name with count exactly 1         | `/^字引/u`                                                                               | `/^kanji by shape$/u`                                                                                                                               | The shelf dictionary door now has the exact English name; retain the single-button accessibility assertion.                                                                                                                                                                                                                                                                  |
| `verify-skip-ui.mjs:81`, initial lens selection                                  | `hasText: 'SKIP'`                                                                        | `hasText: 'by its shape'`                                                                                                                           | The same SKIP lens has an English descriptive label.                                                                                                                                                                                                                                                                                                                         |
| `verify-skip-ui.mjs:83`, heading equality                                        | `'字引'`                                                                                 | `'Kanji finder'`                                                                                                                                    | Assert the exact English dictionary heading.                                                                                                                                                                                                                                                                                                                                 |
| `verify-skip-ui.mjs:85`, ordered full lens census                                | `['部品', 'SKIP', '手書き', '音訓', '意味', '画数', '部首', '頻度', '漢検', 'Kodansha']` | `['by its parts', 'by its shape', 'draw it', 'by reading', 'by meaning', 'by strokes', 'by radical', 'by frequency', 'by level', 'by KKLD number']` | Retain exact ten-lens equality and order with deliberately translated labels.                                                                                                                                                                                                                                                                                                |
| `verify-skip-ui.mjs:178`, dark world selection                                   | `.world-stone[aria-label="紺紙金泥"]`                                                    | `.world-stone[aria-label="Gold on indigo"]`                                                                                                         | The yoru world's accessible name is deliberately English; retain the following exact `data-theme='yoru'` and reduced-motion assertions.                                                                                                                                                                                                                                      |
| `verify-skip-ui.mjs:279`, failure/retry lens selection                           | `hasText: 'SKIP'`                                                                        | `hasText: 'by its shape'`                                                                                                                           | Drive the identical lens during the unchanged recovery probe.                                                                                                                                                                                                                                                                                                                |
| `verify-skip-standalone.mjs:75`, dictionary accessible name with count exactly 1 | `/^字引/u`                                                                               | `/^kanji by shape$/u`                                                                                                                               | Match the bundled English door and retain the exact accessibility count.                                                                                                                                                                                                                                                                                                     |
| `verify-skip-standalone.mjs:78`, lens selection                                  | `hasText: 'SKIP'`                                                                        | `hasText: 'by its shape'`                                                                                                                           | Reach the same standalone SKIP grid through its translated label.                                                                                                                                                                                                                                                                                                            |
| `verify-skip-standalone.mjs`, initial document URL                               | `?entry=shelf&ui=bi`                                                                     | `?entry=shelf&ui=ja`                                                                                                                                | Baseline's first inline-prose target was the Japanese shelf heading `本棚`. F2 translates that chrome to English and legitimately leaves zero incidental Japanese lookup words on the English shelf. Exercise the identical, unchanged inline display/border/background/padding/min-size assertions on the actual Japanese shelf instead. No artificial content is inserted. |
| `verify-skip-standalone.mjs`, language transition after prose assertions         | No explicit transition, because the initial document was already English                 | Click `#lang [data-lang="bi"]`; assert its `aria-pressed` equals `'true'`                                                                           | Add a real UI transition and exact selection assertion before the existing English dictionary journey. All prior style and behavioral assertions remain intact.                                                                                                                                                                                                              |
| `verify-skip-standalone.mjs`, personal-route URL                                 | Inherits initial `ui=bi`                                                                 | Explicit `personalURL.searchParams.set('ui', 'bi')`                                                                                                 | Keep the existing personal-route fallback and zero-network assertions in English after the initial Japanese-only prose check.                                                                                                                                                                                                                                                |
| `verify-sentence-drafts.mjs:218`, pending text                                   | `/音声準備中 · Kore/u`                                                                   | `/^audio coming soon · Kore$/u`                                                                                                                     | Pin the exact English pending line; all absent-listening-control and durable draft/record assertions stay intact.                                                                                                                                                                                                                                                            |
| `verify-bundled-listening.mjs:63`, pending text                                  | `/音声準備中 · Kore/u`                                                                   | `/^audio coming soon · Kore$/u`                                                                                                                     | Pin exact English chrome; retain the voice roster, zero controls, zero sentence-audio requests and Ami negative control.                                                                                                                                                                                                                                                     |
| `verify-listening-failures.mjs:105`, pending text                                | `/音声準備中 · Kore/u`                                                                   | `/^audio coming soon · Kore$/u`                                                                                                                     | Pin exact English chrome; retain the armed corrupt-transport fixture, zero controls/requests and unchanged records.                                                                                                                                                                                                                                                          |
| `verify-playback.mjs:194`, reusable pending-line expression                      | `/音声準備中 · Kore/u`                                                                   | `/^audio coming soon · Kore$/u`                                                                                                                     | The same reader lock checks now require its exact English line; lifecycle, approved voice, no-device-TTS and negative controls remain intact.                                                                                                                                                                                                                                |
| `verify-corridor-ai.mjs:345`, ordinary word tutor selector                       | `hasText: '先生に聞く'`                                                                  | `hasText: 'ask the tutor'`                                                                                                                          | Reach the deliberately translated tutor button; transport/archive checks are unchanged.                                                                                                                                                                                                                                                                                      |
| `verify-corridor-ai.mjs:359`, example generation selector                        | `hasText: '例文をつくる'`                                                                | `hasText: 'write examples at my level'`                                                                                                             | Reach the same translated example action; retain exact output/ledger checks.                                                                                                                                                                                                                                                                                                 |
| `verify-corridor-ai.mjs:677`, delayed tutor selector                             | `hasText: '先生に聞く'`                                                                  | `hasText: 'ask the tutor'`                                                                                                                          | Run the unchanged abort-budget behavior through its English button.                                                                                                                                                                                                                                                                                                          |
| `verify-ai-adaptation.mjs:169`, word-tutor request selector                      | `hasText: '先生に聞く'`                                                                  | `hasText: 'ask the tutor'`                                                                                                                          | Reach the same translated tutor action; provenance/teaching/archive assertions remain intact.                                                                                                                                                                                                                                                                                |
| `verify-ai-adaptation.mjs:249`, examples request selector                        | `hasText: '例文をつくる'`                                                                | `hasText: 'write examples at my level'`                                                                                                             | Reach the translated example action; source classification and record restrictions remain intact.                                                                                                                                                                                                                                                                            |
| `verify-writing-room.mjs:505`, first reading label                               | `'音読み'`                                                                               | `'on'`                                                                                                                                              | Match the English on-reading label; keep exactly two rows, Japanese values and `lang='ja'`.                                                                                                                                                                                                                                                                                  |
| `verify-writing-room.mjs:506`, second reading label                              | `'訓読み'`                                                                               | `'kun'`                                                                                                                                             | Match the English kun-reading label; retain Japanese reading values, punctuation and spoken accessibility checks.                                                                                                                                                                                                                                                            |

### Assessment, history and reading chrome

| File / assertion                              | Before                                                           | After                                                               | Preserved meaning                                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| private-import, first task heading prefix     | `/^問題 1\u3000/u`                                               | `/^Question 1\u3000/u`                                              | exact first question number                                                                                                                     |
| private-import, listening task heading        | `問題 1\u3000聴解`                                               | `Question 1\u3000Listening`                                         | restarted first listening number and section                                                                                                    |
| private-import, scale warning                 | `/換算できません/u`                                              | `/can’t be converted/u`                                             | raw counts cannot be scaled into official scores                                                                                                |
| private-import, absent question Sensei action | `getByText('先生にこの問題を聞く').count() === 0`                | `getByText('Ask Sensei about this question').count() === 0`         | forbidden private-paper external-AI action still absent                                                                                         |
| written-section, card timing                  | `言語知識（文字・語彙） 30 min / 言語知識（文法）・読解 70 min`  | `Language knowledge (vocabulary) 30 min / Grammar · Reading 70 min` | both official paper durations remain exactly 30 and 70                                                                                          |
| written-section, first confirmation paper     | `言語知識（文字・語彙） 30 min · ${vocabulary} questions`        | `Language knowledge (vocabulary) 30 min · ${vocabulary} questions`  | same vocabulary count and duration                                                                                                              |
| written-section, second confirmation paper    | `言語知識（文法）・読解 70 min · ${grammar + reading} questions` | `Grammar · Reading 70 min · ${grammar + reading} questions`         | same grammar+reading count and duration                                                                                                         |
| written-section, first paper skill            | `言語知識（文字・語彙）`                                         | `Language knowledge (vocabulary)`                                   | same first booklet                                                                                                                              |
| written-section, first paper number           | `問題１`                                                         | `Question 1`                                                        | exact first question number                                                                                                                     |
| written-section, second paper skill           | `言語知識（文法）・読解`                                         | `Grammar · Reading`                                                 | same second booklet                                                                                                                             |
| written-section, second paper number          | `問題１`                                                         | `Question 1`                                                        | number restarts in the second booklet                                                                                                           |
| written-section, study heading text           | `問題１\u3000漢字読み`                                           | `Question 1問題１\u3000Kanji reading漢字読み`                       | English chrome plus exact original Japanese learning fragments; lookup `numberWords >= 1`, `nameWords >= 1`, and `stops === 1` remain unchanged |
| written-section, active room title shape      | `{lang:'ja', title:'JLPT 模試・練習', subtitleLang:'en'}`        | `{lang:'en', title:'JLPT tests & practice', subtitleLang:null}`     | active English h1 and one-language chrome                                                                                                       |
| written-section, inline subtitle              | `.en-inline.textContent() === 'JLPT tests & practice'`           | `.en-inline.count() === 0`                                          | inactive language shadow is absent; translated title remains checked by preceding exact object assertion                                        |
| practice-history, status chip                 | `未確認`                                                         | `Unreviewed`                                                        | same unreviewed provenance status                                                                                                               |
| journey, incomplete reading tag               | `includes('途中')`                                               | `includes('in progress')`                                           | same saved mid-article progress                                                                                                                 |
| native-readings, English review-note branch   | `未確認 · ([0-9]+) of (?:these )?([0-9]+)`                       | `Unreviewed · ([0-9]+) of (?:these )?([0-9]+)`                      | exact pending-story and total counts; Japanese branch `このうち ([0-9]+) 本は未確認` remains unchanged                                          |

The standalone prose assertion retains every original display/border/background/padding/min-size condition. It samples the real Japanese shelf heading in Japanese mode, then explicitly switches to English and adds an exact pressed-state assertion before the English dictionary/offline journey. All 20 original assertions remain; the new language assertion brings the total to 21.

The written practice heading keeps its original Japanese number and task name as quiet learning text beneath the active English labels. Its `numberWords >= 1`, `nameWords >= 1` and exactly one Tab stop assertions remain unchanged. Imported raw review marks and printed Japanese question instructions remain unchanged.

The new `tools/verify-redesign-foundation.mjs` acceptance adds width/view/room/layer/font and visible-element diagnostics on horizontal overflow. Its exact `scrollWidth <= innerWidth` assertion, 44px bounds, dock/return/language behavior and no-error checks remain unchanged. Diagnostics reproduced the Linux DejaVu Sans shelf overflow at 320px; the product row now wraps rather than reducing the button target or hiding overflow.

| `verify-kotoba-mine.mjs` | Standalone popup save note, line1151 | `/覚える/` → exact `/^Save to your review cards in Bunki\.$/u` | F2 now reaches the four regenerated study exports. Retain both files, zero front targets, furigana, exact lookup/card keys, English closed by default, one-line note, zero save controls, viewport bounds, exactly one lookup, unchanged schedule and close behavior. |

## Final CI fixture follow-ups

| File / assertion or fixture                                            | Before                                                                | After                                                                                                     | Why / retained requirements                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test-word-saved-answer.mjs`, S9 dictionary-entry title                | `['辞書の項目', 'Dictionary entry']`                                  | `['Dictionary entry']`                                                                                    | F2 selects one English chrome label. Exact single homograph door, entry/reading/pressed/active values, click identity and all saved-answer guards remain unchanged.                                                                                                    |
| `verify-learning-record.mjs`, extracted renderer dependencies          | Does not extract `kankenGradeLabel`                                   | Extract the actual `kankenGradeLabel` declaration                                                         | The F2 probe renderer now calls this English grade-label helper. Include its real declaration in the existing VM seam; no stub, renderer substitute, persistence or evidence assertion changes.                                                                        |
| `verify-annotation-lookup.mjs`, assistance paragraph placement         | Append a synthetic paragraph after `#app` with natural flow placement | Place that same paragraph at fixed `left:120px;top:150px`, matching the existing synthetic anchor pattern | The added tabs cover this fixture's old scrolled-to position. Preserve actual pointer clicks and every pending, rejected, committed and replacement-anchor/retarget assertion. No product lookup path or assistance result is substituted.                             |
| `verify-offline.mjs`, first cold offline style-fixture URL             | `?entry=shelf&ui=bi`                                                  | `?entry=shelf&ui=ja`                                                                                      | The original inline lookup word was the Japanese shelf heading. F2 translates that chrome in English. Sample the same real Japanese heading in Japanese mode; keep every display, border, background, padding, minimum-size, stylesheet, art and cache-byte assertion. |
| `verify-offline.mjs`, language transition after those style assertions | No explicit transition because the initial document was English       | Click `#lang [data-lang="bi"]`                                                                            | Return through the real UI before the remaining English/offline journey.                                                                                                                                                                                               |
| `verify-offline.mjs`, transition verification                          | No explicit pressed-state assertion                                   | Require the English button's `aria-pressed` to equal `'true'`                                             | Adds verification of the active language; no offline or storage condition is removed.                                                                                                                                                                                  |

The final Linux reference walk exposed a real writing-room collision: the wider English stroke-number label covered the wake button. Product CSS now bounds that corner and wraps the label; the unchanged writing and reference assertions are retained. The publisher entrance also exposed fractional DOMRect rounding just below 44px. Its controls receive a scoped one-pixel minimum-height reserve in product CSS; the exact `width >= 44 && height >= 44` verifier remains unchanged, with no tolerance or extra wait.

| File / assertion                                | Before                       | After                                | Why / retained requirements                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ---------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify-experience.mjs`, E13 SKIP lens selector | `.kdx-lens` with text `SKIP` | `.kdx-lens` with text `by its shape` | F2 intentionally selects the English lens label. Preserve required SKIP coverage, real candidates, exact `1-3-8` search code, Back/input retention, unchanged learning debt and frozen-asset assertions. The Linux run found the stale label, so this selector reaches the same existing SKIP lens. |

## Read lane (2026-10-08): the unrecorded voice no longer says "coming soon"

The redesign brief forbids "coming soon" anywhere in the product. No article narration ships, so every reader showed `audio coming soon · Kore` (JA `音声準備中 · Kore`). The pending play bar now says `no recording yet · Kore` (JA `音声未収録 · Kore`): the same honest state, the same locked voice, no promise. Only the exact label strings changed (cosmetic, class C); every behavioural assertion around them (no play control, no picker, no device voice, no F1 audio request, Kore named) is unchanged.

| File / assertion | Before | After | Why / retained requirements |
| --- | --- | --- | --- |
| `prototypes/corridor/tools/verify-playback.mjs:194` `PENDING` | `/^audio coming soon · Kore$/u` | `/^no recording yet · Kore$/u` | Label only. The pending row still has no toggle, no picker and names Kore. |
| `prototypes/corridor/tools/verify-playback.mjs:286` | `/audio coming soon/u`, "says, in English, that audio is coming" | `/no recording yet/u`, "says, in English, that no recording exists yet" | Label only; still asserts an English pending line. |
| `prototypes/corridor/tools/verify-corridor.mjs:1652` | `/^audio coming soon · Kore$/u` | `/^no recording yet · Kore$/u` | Label only; zero toggles and the Kore check retained. |
| `prototypes/corridor/tools/verify-bundled-listening.mjs:63` | `/^audio coming soon · Kore$/u` | `/^no recording yet · Kore$/u` | Label only. |
| `prototypes/corridor/tools/verify-listening-failures.mjs:105` | `/^audio coming soon · Kore$/u` | `/^no recording yet · Kore$/u` | Label only. |
| `prototypes/corridor/tools/verify-sentence-drafts.mjs:218` | `/^audio coming soon · Kore$/u` | `/^no recording yet · Kore$/u` | Label only. |
| `prototypes/corridor/tools/test-approved-voice.mjs:136–137` | `/音声準備中 · Kore/`, `/voice in preparation\|audio coming soon/` | `/音声未収録 · Kore/`, `/voice in preparation\|no recording yet/` | Label only, in both languages. |

## Integration (2026-10-08, cloud): the 3-key Good check waits for the commit, not a fixed 250 ms

CI's whole-corridor walk failed 258/259 on `9de77237`: `R3-C · the 3 key commits Good as itself — {}`. The last revlog row was read 250 ms after the key press, before the asynchronous native-host commit had landed. The next check, whose undo appears only after card 1 is graded, passed, so the grade did commit. The sister check "Again commits Again" already waits with `waitForAppRecord(… revlog.length === before + 1)`.

| File / assertion | Before | After | Why / retained requirements |
| --- | --- | --- | --- |
| `prototypes/corridor/tools/verify-corridor.mjs` R3-C (c) | `page.waitForTimeout(250)` after pressing `3` | `waitForAppRecord(page, r => r.revlog.length === before + 1)` (10 s timeout; times out = failure) | Timing only. The assertion is unchanged: the newest revlog row must be `word:学校` with rating 3. A commit that never lands still fails, now with a timeout. |

## Integration (2026-10-08, cloud): report-entries R5 finds the probe door in either interface language

Under the foundation's EN/JA law, the focus-mode door reads `yomi probe` in English. `verify-report-entries.mjs` R5 waited for the Japanese text and timed out. This was already true at Sol's head `53a7b934`, and this verifier is not in the release battery.

| File / assertion | Before | After | Why / retained requirements |
| --- | --- | --- | --- |
| `prototypes/corridor/tools/verify-report-entries.mjs:212` | `.focus-mode` `{ hasText: '読み探査' }` | `{ hasText: /読み探査\|yomi probe/u }` | Label selector only. R5 still opens the probe as a learner does, requires `.review-front` and `body.zen`, and checks the page entry sits after the stage. |

## Fix round 2 (2026-10-08, cloud): the deck back's part-of-speech badge is chrome in the interface language

REVIEW.md #12: in EN the card back's part-of-speech chip read 名詞, Japanese chrome in EN (the EN/JA law). It now reads the interface's name for it (EN `noun`, `lang="en"`; 日本語 `名詞`). The tier-one check read the whole `.kp-word` row's text, badge included, against `/[A-Za-z]/`, so an English chrome label would have failed "no English in tier one".

| File / assertion | Before | After | Why / retained requirements |
| --- | --- | --- | --- |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs` `BACK` (≈1219) and check "b) tier one under the passage…" (≈1276) | tier-one text = `textContent` of `.kp-word`, `.kp-def`, `.kp-note` | the same with the `.kp-posbadge` element left out of the text; the check additionally requires the badge (EN run) to read an English name, `lang="en"`, with no kana or kanji | The badge is interface chrome, not answer text. Every other tier-one requirement is unchanged: the headword, reading, definition and note must still carry no Latin (no English meaning before the 英語 fold), the row must still be `kp-term,kp-reading,kp-posbadge`, and the badge is now also pinned to the interface language. |

## Fix lane rooms (2026-10-08, cloud): the shelf's filters fold into the Tools sheet; the close's way back is "Back to Today"

Review #6 folded the four shelf filters (`#shelf-filter-*`) and the article search (`#shelf-reading-search`) into the existing Tools sheet (`#shelf-tools-panel`), so the shelf opens on its lead woodblock. Review #8 renamed the session close's way back from "back to lists / リストへ" ("Lists" is the old name of Today) to "Back to Today / 今日へ" and made the next door the close's primary. Every id, class and behaviour is kept; only where a control is drawn, and one label, changed.

| File / assertion | Before | After | Why / retained requirements |
| --- | --- | --- | --- |
| `prototypes/corridor/tools/verify-design-reader-shelf.mjs` T1 (`between`) | anchor = `#shelf-body .shelf-chipbar` | anchor = the chip bar when it is drawn, else `#shelf-body .shelf-masthead` | Anchor only. T1 still requires no visible control between the anchor's foot and the first story, the Tools button in the title, closed on arrival, every door hidden until pressed, then every door in the panel, on one line, in view. With the filters folded the anchor is the title block, which is stricter (it covers the space where the chip bar stood). |
| `verify-corridor.mjs` (editorial search, ~l.704) | fills `#shelf-reading-search` directly | `await openShelfTools(page)` first | Flow only, the same helper the suites already use for the tool doors. The empty-filter and restore-collection assertions are unchanged. |
| `verify-reader-lookup.mjs` `open()` | fills `#shelf-reading-search` directly | `await openShelfTools(page)` first | Flow only; every lookup assertion unchanged. |
| `verify-annotation-lookup.mjs` (shelf facet round trip) | focuses `#shelf-filter-topic` directly | `await openShelfTools(page)` first | Flow only; topic/sort/text results and the round-trip retention asserts are unchanged (the panel stays open across the round trip, as for the tool doors). |
| `verify-vocabulary-chooser.mjs` `reader()` and the shelf-tally check | fills `#shelf-reading-search` directly | `await openShelfTools(page)` first | Flow only; tallies and results unchanged. |
| `verify-experience.mjs:165`, `verify-journey.mjs:363`, `verify-skip-ui.mjs:229` | button name `/back to lists\|リストへ/` | `/back to lists\|リストへ\|Back to Today\|今日へ/` | Label only. The button is still `.close-doors .take` (pinned by class in many suites), still returns to the tray, and every assertion after the press is unchanged. |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs` (~l.1561) | check 6, swipe hint in the third sitting | `third.swipe` (the swipe hint under the grade pads shows in the first three sittings) → `!third.swipe` (it shows on the first back of the first sitting only); description updated | Visibility only (fix round 3, deck: no help in prime space). The tap-hint pins for three sittings, `first.swipe` on the first back, the gone-from-the-fourth pins on both decks, `prefs.sittings` counting and the gesture itself (swipe grading checks) are unchanged. `contrast-kotoba.mjs` only gained rows: a `dock` pair for every look and the `ai·night` / `ai·night·study` variants. |

## Integration (2026-10-08, cloud): kotoba-mine reads the list drawer after it redraws

`the sheet then says where the word went` read `#sheet .list-picker .fold-sub` straight after `waitForAppRecord` saw the new list's membership. The app commits first and then re-renders the sheet (`tryMake` → `commitStorePatch` → `render()`), so reading the DOM in the gap between those two steps showed the old "saved to: daily review" line. With the redesigned rooms that gap is wider, and CI failed on `1f1787af`.

| File / assertion | Before | After | Why / retained requirements |
| --- | --- | --- | --- |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs` (one-tap save, list drawer) | read `.fold-sub` immediately | first `waitForFunction` (≤5 s) for the drawer to include the list name, then read it | Timing only. The assertion is unchanged: the drawer must say `経済ニュース`. A drawer that never updates still fails. |

| `verify-pr77-ports.mjs` crumb-origin (~l.205, r3-rooms) | presses `#back` on the finished plain review | presses `#back` when it is visible, else the close's own `.close-doors .take` | Flow only. With the tab bar the session close hides the chrome Back (REVIEW round 2, new defect 6: three routes to Today). The crumb assertion and `reviewBack === 'tray'` are unchanged; the press goes to whichever control is the way back. |

## Round 4 cards lane (2026-10-09, Mac): four grade buttons (D1), a deliberate contract change

He answered D1 on the 2026-10-08 tour: "Four (Again · Hard · Good · Easy) — and color coded". The grade bar is now four pads, one per FSRS rating 1–4, with keys 1–4 (`docs/srs/CARD_CONTRACT_V2.md` §4, amendment 2026-10-09; `STANDARD.md` A53). The pins below asserted the old two-button contract, so they change on purpose. Each replacement asserts more than the pin it replaces. Storage, SRS, ledger, offline, front-concealment, hit-size and contrast assertions are kept or strengthened. None is relaxed.

| File / assertion | Before | After | Why / retained requirements |
| --- | --- | --- | --- |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs` grade-bar check (first back, `?deck=kotoba`) | a stored `grades: 'four'` pref; exactly 2 `.kp-grade`, labels `Again/Recalled`, no `#kp-grade-hard`/`#kp-grade-easy`, swipe hint names Recalled, bar fixed, keys 2 and 4 leave the log empty | a stored `grades: 'two'` pref; exactly 4 pads, ids `kp-grade-again,…-hard,…-good,…-easy`, labels `Again/Hard/Good/Easy`, `aria-keyshortcuts` `1,2,3,4`, each with an interval in the player's format, swipe hint names Good, bar fixed, nothing graded by opening the bar | D1. The button set is still fixed: no stored setting changes it, as before. "Keys 2 and 4 do nothing" is replaced by the new check below, which proves that each key does exactly its own grade. |
| same file, new check after the 4択 字 check | (none) | keys 1–4 on four new cards each write `[cardId, key]` for the card on screen, and the stored `due − review time` lies inside the range the pad's text names (`1 min`, `6 min`, `10 min`, `8 days` …) | New behavioural check: the label is the real interval, read from what was stored, not mirrored from the formatter. |
| same file, new check after it | (none) | a hand-written two-button ledger (ratings 1 and 3 only, two review records) loads with its due card counted, no quarantine and no notice; a Hard (key 2) adds exactly one `[km-064-1, 2, …]` row after the five old rows, the other record byte-identical, reps +1 | New storage-compatibility check for the contract change. |
| same file, swipe check | a sideways swipe grades (log 1) | the same, and the row's rating is 3 (Good) | Strengthened; the cancelled and vertical gestures still never grade. |
| same file, 4択 字 card check | `grades === 2` | `grades === 4` | D1 census. A 字 card still never shows choices; the hint, 答えを見る and the bar stay required. |
| same file, reveal-keeps-the-card check (e) | `kept.grades === 2` | `kept.grades === 4` | D1 census. The kept card node, chips, screen, ≤180 ms motion and the rail stay required. |
| same file, light-theme contrast probe (`CONTRAST`) | 17 text tokens on card, panel-2, page, the tinted Good button and the accent wash | the same plus `--kp-blue` (Easy) | Strengthened: the new hue must clear 4.5:1 on every surface. |
| same file, visual check b) "the grades are red and green" | `#kp-grade-again b` = red, `#kp-grade-good b` = green | also `#kp-grade-hard b` = amber and `#kp-grade-easy b` = blue, and the four are distinct | Strengthened to cover the four hues. |
| same file, method-text check | the MCD method names 「もう一度／思い出せた」 and the sentence deck names 「思い出せた」; never 覚えた | the MCD method names 「もう一度・難しい・正解・簡単」 and the sentence deck names all four; neither names the retired 「思い出せた」 button; never 覚えた | A05: the method, the bar and the keys describe one button set. The deck text changed with the bar (`build.py` and both `deck.json`). |
| same file, check descriptions and comments | 思い出せた (the retired Good label) | 正解 (Good) | Wording only. |
| `prototypes/corridor/tools/contrast-kotoba.mjs` `ROWS` state row and `KIND_JI_OTHERS` | state = red, green, amber; the 字 hue kept ΔE ≥ 10 from 12 hues | state = red, amber, green, blue; the 字 hue kept ΔE ≥ 10 from 13 hues (blue added) | Strengthened. It caught one real clash (黒板's Easy blue sat ΔE 5.9 from the 字 hue), and the blue was moved to `#89a6ff` (ΔE 13.5). |
| `tools/verify-redesign-docks.mjs` `grades-after-rule` census | `{ count: 2 }` | `{ count: 4 }` | D1 census. Every pad must still be visible, hit by a real tap, on screen and clear of the tab bar and the report rail. |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs`, new check after "the deck home shows today's count and the 12 topics" (T2) | (none) | the MCD deck home shows four tiles in one row, `Due,New,Known,Difficult`, each number an integer, due + new equal to the start button's number, each tile at most 72px tall, the numbers in `--kp-amber`, `--kp-ink`, `--kp-green` and `--kp-red` | New check for his T2 ("the four windows but maybe not so big", in the old colours). The labels are English chrome; the counts are the queue's own. |
| same file, the new tiles check (the line above) | read the tiles as soon as `#kp-start` shows | first wait (≤5 s) until the player's own stylesheet lays the tiles out as a grid, then read | Timing only, for the lane's own new check. The player injects player.css when it mounts, and the check had read the tiles before that sheet applied (stacked, uncoloured). A sheet that never applies still fails the check. |

The kotoba-mine reduced-motion check (e) failed on the base build (`345dba92`, a run and a re-run). The cause was not the deck: under reduced motion, the report button's 200 ms colour transition (`maintenance/report-client.css`) was the one animation still running. No verifier was changed for this. The fix is in the app: under `prefers-reduced-motion: reduce` that transition is now `none`, and the check passes unchanged.

## Round 4 cards lane, review and refine (2026-10-09, Mac)

An independent review of the lane found three label defects that native iOS never shows: four pads now print real intervals, so `1 days`, `1 months` and `1.0 years` would show routinely; the deck home printed `2435 cards` and `Begin — 1 cards`; and the front's bare chips `Examples` and `Lecture` named nothing to a first-time reader (T2). The player now prints `1 day`, `2 days`, `1 year`, `1.5 years`, `2,435 cards`, `Begin — 1 card`, and the front's chip row is kind · topic · level · state (`CARD_CONTRACT_V2.md` §9, amendment 2026-10-09). The pins below asserted the old wording, so they change on purpose. Each one still fails on the old output, and none is relaxed.

| File / assertion | Before | After | Why / retained requirements |
| --- | --- | --- | --- |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs` four-pad check (first back, `?deck=kotoba`) | each pad's wait matches `/^[\d.]+ (min\|hr\|days\|months\|years)$/` | each wait passes `waitOk`: a number and a unit, the unit singular exactly when the number is 1, no `.0` (`1 day`, `8 days`, `1 year`, `1.5 years`) | Label pin, strengthened: `1 days`, `2 day`, `1.0 years` and `1 years` now fail (checked against those strings). The other conditions (4 pads, ids, labels, keys, fixed bar, nothing graded) are unchanged. |
| same file, `holds()` (keys 1–4 against the stored interval) | parses `/^([\d.]+) (min\|hr\|days\|months\|years)$/` | parses the same units in either number through `WAIT`, refuses any text `waitOk` refuses, and reads a singular unit as its plural's length; the years tolerance (±0.05) is unchanged | Label pin. The behavioural assertion is the same: the stored `due − review time` must lie in the range the pad's text names, for each key's own card and rating. |
| same file, the "Done for today / Begin" mode check | `self === 'Begin — 1 cards'` | `self === 'Begin — 1 card'` | Label pin (English number agreement). The rest of the check is unchanged. |
| same file, the T2 tiles check | each tile number matches `/^\d+$/`; the start button's number read by `/\d+/` | each tile number matches `/^\d{1,3}(,\d{3})*$/` and is read without its separators; the start button's number is read the same way | Label pin: figures now carry a thousands separator (`2,435`). Due + new must still equal the start button's number; one row, at most 72px, the four colours are unchanged. |
| same file, the passage pilot's chip check (`?deck=mcd`, the pilot card and two full-run cards) | the front's chip row holds the register chip (`Lecture` …) and the topic chip; the register chip's label is `Register: Lectures and book summaries (Original composition)`; no group chip; one row | the front's chip row holds the topic chip and neither a register chip nor a source chip (`front.reg === ''`, no `Lecture` …); no group chip, no `Original composition`; one row. A new check after the reveal: the back's 出典 fold reads `Style Lectures and book summaries` (each card's own register, in full) | Layout and label pin moved with the contract amendment (`CARD_CONTRACT_V2.md` §9, 2026-10-09). The register is still asserted, by its full name, now where it is shown. |

Not changed: the backup and restore messages in 設定 still print `1 cards · 1 answers` (verify-kotoba-mine pins `Backup: 1 cards · 1 answers`). That is the same class of defect, outside this round's screens, and is listed as open in `docs/redesign/r4/cards/REPORT.md`.
