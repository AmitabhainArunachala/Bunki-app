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


## Fix r3 read (2026-10-08, cloud): the popup has one Save; the voice placeholder is a mark in the instrument line

Review round 2 #13 found three ways to save in the popup. The sentence row's "Save" (`#reader-context-save`, which keeps the sentence on the tutor page) is gone from the popup, and the word's Save is the popup's only Save. Keeping the sentence stays one press away in the word menu ("Save the sentence", `data-menu-action="save-sentence"`, pinned by `verify-reader-lookup`). Review round 2 #7 moved "no recording yet · Kore" (the pending `.listen-row`) from a fixed strip at the phone's foot into the reader's instrument line. That is under the popup, so the step that pressed it to put the popup away needed another outside point.

| File / assertion | Before | After | Why / retained requirements |
| --- | --- | --- | --- |
| `prototypes/corridor/tools/verify-design-reader-shelf.mjs` G6 (≈l.881) | row text `'This sentence: Save · Ask the tutor · Practice'` | `'This sentence: Ask the tutor · Practice'` | Label pin only. G6 still requires no sentence bar outside the popup, and that Ask the tutor opens the tutor with that exact sentence as the active context. |
| `prototypes/corridor/tools/verify-reader-lookup.mjs` (named-known and particle steps) | `page.locator('.listen-row').click({position:{x:2,y:2}})` to put the popup away | `tapOutside(page)`: asserts that the fixed chrome's top-left corner is a blank point outside the popup, clicks it, then waits for `#mini` to detach | Click target only. It is still a real pointer press outside the popup, now with an added check that the popup closed. Every lookup, keyboard and menu assertion is unchanged, and `open()` still asserts `.listen-row[data-passage]`. |

## Round 4, read lane (2026-10-09, Mac): T4's one-line explainer and T5's one path

John's T4 and T5 change two things the suites pin.
- **The help line (T4).** "the explanaiton (that is too verbose and.. confusing)": the first-visit tip is now one plain line.
- **The popup's paths (T5).** "Save and add to list are confusing??? ... click save and then add to list from there?" and "*this sentice, save astk the tutor, practice. very very confusing".
  - The popup offers a list only once the word is saved: "Add to a list" appears beside "Saved ✓".
  - The sentence row is one named door, "Study this sentence ›". It opens the sentence in the card with two choices, Ask the tutor and Practice it.

Two kinds of pin change follow:
- **Label pins:** the tip's text, and G6's row text.
- **Path pins:** the clicks a suite makes to reach a control. "Save" comes before "Add to a list", and one tap on `#mini-sentence-open` comes before `#reader-teacher` or `#reader-sentence-practice`.

Every assertion about what a control does is unchanged: list membership, one card per word, context scopes, drafts, protected-record recovery, the tutor's active context and the practice return focus. No storage, SRS, ledger, offline, hit-size or contrast assertion changed.

| File / assertion | Before | After | Why / retained requirements |
| --- | --- | --- | --- |
| `prototypes/corridor/tools/verify-design-reader-shelf.mjs` P1 (≈l.601) | tip text `'Tap any word to see what it means. Right-click (or press and hold) for more.'` | `'Tap any word for its meaning.'` | Label pin only (T4). P1 still requires all of these: the tip is in the page's flow; it ends above the first word; it covers no word at four depths; the first tap hides it without moving the text; it is remembered; and its × dismisses it for good. The longer form, with press and hold, stays in the text settings' hint (`tapLadderHint`). |
| `verify-design-reader-shelf.mjs` G5 (both widths) | clicks `#mini #mini-lists` straight after the tap | asserts `#mini-lists` is not visible before Save, presses `#mini-take`, waits for `aria-pressed="true"`, then clicks `#mini-lists` | Path pin, plus one added assertion (the one path). The popover's shape (compact beside its link at 1368, a short foot sheet at 390), the new list holding 郊外 with exactly one card, and unticking keeping the card are unchanged. |
| `verify-design-reader-shelf.mjs` G6 (≈l.873) | row text `'This sentence: Ask the tutor · Practice'`, then `#mini #reader-teacher` | the door's label is `'Study this sentence'` and its quote starts `ダマスカス郊外`; a click on `#mini-sentence-open` shows the pane with 郊外 marked and the choices `['Ask the tutor', 'Practice it']`; then `#mini #reader-teacher` | Label and path pin. The requirements stay: no sentence action shows outside the popup, and Ask the tutor opens the tutor with that exact sentence (ARTICLE, quote `ダマスカス郊外…`, target 郊外) as its active context. |
| `verify-annotation-lookup.mjs` `chooser()` and the exact-entry case | `#mini #mini-lists` on a word not yet saved | `saveInPopup()` first, only when `#mini-take` is not already pressed, then `#mini #mini-lists` | Path pin. Save and the list used the same capture (`toggleTaken(node, label)` with the same node), so the card identity assertions (one 電車 card; `entrySeq 1580400`, `cueReading うわて`) still test the capture. The list popover's own guard for a held homograph is still driven directly (`openVocabularyListPopover`), unchanged. |
| `verify-vocabulary-chooser.mjs` `openChooser()` | `#mini-lists` straight away | asserts `#mini-lists` is not visible before Save, then Save and `saved()`, then `#mini-lists`; skipped when the word is already saved | Path pin, plus one assertion. |
| `verify-vocabulary-chooser.mjs` popup-cancel-direct-save-and-three-context-scopes | open lists, "Opening optional lists is not capture", close, then Save | Save first ("One Save captures directly without opening lists", sent context, no SRS, revlog or list change, one card); then open lists, "Opening optional lists is not another capture", close, "no learning roots change", popup preserved | Reordered for the one path; the same five properties are asserted. "Lists on an unsaved word are not a capture" cannot arise any more, because the popup offers no list before Save; the case asserts that instead. |
| `verify-vocabulary-chooser.mjs` native-write-failures-preserve-draft-and-retry, first half | `taken` fault while a list created from an unsaved word captures it; the popover's status; the typed name kept across the protected reload | `taken` fault on Save itself: the toast says "Could not save", `#record-reload` shows, the fault fired, the record is unchanged, Save is not pressed, no list is offered, and the protected reload keeps the record; then lists open and "Retry vocabulary" is created | Path pin. The capture failure's honesty and recovery are asserted on the path that now captures. A list-name draft can no longer exist before the capture. Draft survival across a protected reload is still asserted by the unchanged second half (the `lists` fault, "List-only recovery also preserves the unsaved list name"). The list sheet's capture-before-membership branch is unchanged in the code and is still reached by the personal deck's "Add to list…". Its failure path, which this case used to reach from the popup, is now driven directly by a new `verify-annotation-lookup` case (below). |
| `verify-corridor.mjs` R2-B (≈l.2730) | opens lists on the unsaved word ("opening the lists does not enroll the word"), then saves with `#reader-take` | saves with `#reader-take` (same capture check, `taken + 1`, sentence ctx), reopens the popup if it closed, then `#mini-lists`: "the popup offers lists only after Save; they open as a small popover, not a window, and enroll nothing more" (asserts the lists were not visible before Save, `taken` unchanged by opening them, not modal, `role=dialog`, a new-list field) | Reordered for the one path. The number of checks is unchanged and the same properties are asserted; "enrolls nothing" now means no second card. Afterwards a second Escape puts the popup away, as the old order's last press (覚える, outside the popup) did, so the next step (`holdWord`, which taps the word to open its popup) starts from the same state. |
| `verify-assessment-written-section.mjs` (≈l.1672) | `#mini-lists` straight after Space opens the popup | `#mini-take`, wait for `aria-pressed="true"`, then `#mini-lists` | Path pin. Esc in the popover closes only the popover and hands focus back to "Add to a list", and Esc in the popup returns to the same occurrence. Both are unchanged. |
| `verify-ai-adaptation.mjs` (≈l.414, l.428), `verify-teacher-drafts.mjs` (≈l.147) | `#reader-teacher` straight after the tap | `#mini-sentence-open`, then `#reader-teacher` | Path pin. The tutor and draft assertions are unchanged. |
| `verify-bundled-practice.mjs` (≈l.140), `verify-bundled-listening.mjs` (≈l.172, l.314), `verify-listening-failures.mjs` (≈l.97), `verify-later-encounters.mjs` (≈l.227, l.251), `verify-sentence-drafts.mjs` (≈l.239), `verify-reference-connections.mjs` (≈l.262) | `#reader-sentence-practice` straight after the tap | `#mini-sentence-open`, then `#reader-sentence-practice` | Path pin. The practice assertions are unchanged. That includes the return: back from practice, the popup reopens on its sentence pane with `#reader-sentence-practice` focused (`focusLearningSourceCaller` opens the pane). |
| `verify-design-reader-shelf.mjs` G7 (≈l.913) | caption `'The simplified version retells the same article in easier Japanese.'` | `'Simplified: the same story in easier Japanese.'` | Label pin only (T4: the explanation was "too verbose"). The wording is the glossary's (`docs/redesign/r4/LABELS.md`, read lane rows). G7 still requires that each side of the switch names itself and its level, that the switch flips the article, and that an article without a simplified version shows no switch. |
| `verify-annotation-lookup.mjs` **new case** `failed-capture-inside-a-list-is-honest-and-recoverable` | (none) | opens the list sheet for an unsaved 電車 through the app's own `openVocabularyListPopover`, arms a native `taken` quota fault and creates a list. It asserts that the fault fired, that the status says the save failed, that the record is exactly as before (no card, no list) and that the typed name stays | Added coverage, not a pin change. It restores the one scenario the popup can no longer produce, a capture failing inside a list creation, on the path that still has it (the personal deck's "Add to list…" uses the same sheet). |
## Round 4 skin (2026-10-09, Mac): D2, both night looks are public; the picker is two named rows

John, on the tour: **D2 (The night look): "Offer both"**. `kaku` (殻, the electric phosphor night) joins `PUBLIC_THEME_IDS` beside `yoru` (金, the 藍 night). The picker now draws two labelled rows, Day (昼) and Night (夜); each row keeps the reference strip's order, so the DOM order of the stones changes from the old ten to: 墨 朱 柿 藍 赤 板 · 漆 金 殻 浪 雷. Saved theme ids are unchanged and a saved `kaku` still loads.

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/verify-experience.mjs` E04-palette-roster | exact ten `['墨','朱','柿','漆','金','藍','赤','浪','板','雷']` → exact eleven `['墨','朱','柿','藍','赤','板','漆','金','殻','浪','雷']`; description "Ten public palettes in constitution order" → "Eleven public palettes: the day row, then the night row (D2)" | Roster pin only. It is still an exact, ordered `deepEqual`, so a dead or extra stone still fails. |
| `verify-experience.mjs` E04 writing segment, E16 settings (3 places) | `.world-stone` `.nth(4)` → `.world-stone` `{ hasText: '金' }` | Selector only. Index 4 was 金 (`yoru`) in the old order; the same world is now chosen by its seal, so E18-palette-reload still requires `data-theme === 'yoru'` after reload. |
| `verify-experience.mjs` (2 places) | `.world-stone` `.nth(5)` → `{ hasText: '藍' }` | Selector only. Index 5 was 藍, the default world the journey returns to; it is still 藍. |
| `verify-experience.mjs` shot captions | "Exactly ten public worlds in consistent order" → "Exactly eleven public worlds, day row then night row" | Screenshot caption only. |
| `prototypes/corridor/tools/verify-writing-room.mjs` `PUBLIC_WORLDS` and its check | the ten in the old order → the eleven in the new order; description updated | Roster pin only. The ordered `JSON.stringify` equality, the one-named-dialog check, the act/persist/re-ink loop over `shu` and `hakuu` are unchanged. |
| `verify-writing-room.mjs` legacy check description | "the retired public 殻 world still loads as an internal saved theme" → "a saved 殻 preference still loads (殻 is public again, D2)" | Description only; the assertion (stored `kaku` → `data-theme=kaku` after reload) is unchanged. |
| `prototypes/corridor/tools/verify-theme-consistency.mjs` `WORLDS` | ten worlds → eleven (adds `kaku`) | **Strengthened**: the new public world is swept through shelf → tray → review front/back → sheet like the others. |

`verify-corridor-accessibility.mjs` already measured `kaku` (quiet-label contrast and the living-paper law) and is unchanged.

## Round 4 skin: the tray's crumb says Today

The tray is the Today tab's room; Review #8 already renamed its way back "Back to Today / 今日へ" ("Lists" is the old name of Today). On wide screens the top line's crumb still read "lists / リスト" beside Back. It now reads "Today / 今日".

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/verify-pr77-ports.mjs` quiz-crumb (ea8252a9) | `/リスト\|lists/` → `/リスト\|lists\|今日\|Today/` | Label only. The crumb must still name the tray, and `backTo === 'tray'` is unchanged. |
| `verify-pr77-ports.mjs` crumb-origin (d9f0b984), plain review | `/(リスト\|lists).*(復習\|review)/` → `/(リスト\|lists\|今日\|Today).*(復習\|review)/` | Label only. The order (tray, then review) and `reviewBack === 'tray'` are unchanged. |

## Round 4 skin: the personal collections' theme row follows the public roster

The private collections player draws one theme button per public world (`PUBLIC_THEME_IDS`, passed in by `corridor.js`). D2 made the roster eleven.

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/verify-personal-collections.mjs` (settings, "Every palette comes from Bunki's existing public roster") | `.pc [data-theme]` count `10` → `11` | Roster count only. The `yoru` (金) click, the night screenshot, the no-horizontal-overflow assertion at 390px and every storage, backup and offline assertion are unchanged. |

## Round 4 skin, review and refine: the crumb pin names Today only; the personal page's station is Learn

The independent review asked for the crumb pin to be replaced rather than widened, so a return of the old "lists" crumb fails again. And the personal collections page ("Your own texts") is a deck: Learn lists it, its back button now reads "← Learn" and leads to Learn, so the Line marks Learn there instead of Me.

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/verify-pr77-ports.mjs` quiz-crumb (ea8252a9) | `/リスト\|lists\|今日\|Today/` → `/今日\|Today/`; description "names the lists tray its 戻る reopens" → "names Today, the tray its 戻る reopens" | **Tightened**: the old crumb word now fails. `backTo === 'tray'` is unchanged. |
| `verify-pr77-ports.mjs` crumb-origin (d9f0b984), plain review | `/(リスト\|lists\|今日\|Today).*(復習\|review)/` → `/(今日\|Today).*(復習\|review)/`; description as above | **Tightened** the same way. The order (Today, then review) and `reviewBack === 'tray'` are unchanged. |
| `tools/verify-redesign-foundation.mjs` (the private-deck route, ~l.291) | `#tab-me` `aria-current="page"` → `#tab-learn` `aria-current="page"` | Shell label pin (which station the Line marks for one room, `PRIMARY_TABS`). The journey still enters from `#tab-learn`, still requires `ui` to survive the full-document route and `data-room="personal"`, still clicks `#tab-me` and reaches `#me-settings`, then Back to the shelf. Exactly one tab is current (l.88) everywhere else, unchanged. |
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
| same file, the delete-and-restore check a) (both decks) | `/1 cards/.test(home)` and `/^1 cards \(Remove 1\)$/.test(counted)` | `/^Begin — 1 card$/.test(home)` and `/^1 card \(Remove 1\)$/.test(counted)` | Label pin (English number agreement), stricter: the start button is now matched whole. The delete, undo, reload, restore and record-unchanged assertions are untouched, and `/2 cards/` after the restore still holds. Found by the refine run itself (2 failures on the first run, both this wording). |
| same file, the T2 tiles check | each tile number matches `/^\d+$/`; the start button's number read by `/\d+/` | each tile number matches `/^\d{1,3}(,\d{3})*$/` and is read without its separators; the start button's number is read the same way | Label pin: figures now carry a thousands separator (`2,435`). Due + new must still equal the start button's number; one row, at most 72px, the four colours are unchanged. |
| same file, the passage pilot's chip check (`?deck=mcd`, the pilot card and two full-run cards) | the front's chip row holds the register chip (`Lecture` …) and the topic chip; the register chip's label is `Register: Lectures and book summaries (Original composition)`; no group chip; one row | the front's chip row holds the topic chip and neither a register chip nor a source chip (`front.reg === ''`, no `Lecture` …); no group chip, no `Original composition`; one row. A new check after the reveal: the back's 出典 fold reads `Style Lectures and book summaries` (each card's own register, in full) | Layout and label pin moved with the contract amendment (`CARD_CONTRACT_V2.md` §9, 2026-10-09). The register is still asserted, by its full name, now where it is shown. |

Not changed: the backup and restore messages in 設定 still print `1 cards · 1 answers` (verify-kotoba-mine pins `Backup: 1 cards · 1 answers`). That is the same class of defect, outside this round's screens, and is listed as open in `docs/redesign/r4/cards/REPORT.md`.
## Round 4 · today lane (T1, D5), 2026-10-08

No existing verifier, assertion, selector or label pin changed. One behavioural verifier was added.

| File | Assertion | Before → after | Why / retained requirements |
| --- | --- | --- | --- |
| `tools/verify-today-sky.mjs` (new) | 32 checks, EN and 日本語, 390×844 | none → new | A fresh Today's sky holds real words (all learned Japanese, none overlapping); a word opens its own entry; open sky and the labelled "Explore all words" door (keyboard) rise into the universe; the door's foot carries one way down named Today and lands on Today; the universe's level rail speaks the interface language; Me leads with N1 · July 2027 and a countdown equal to an independently computed day count to the July test, then his three fields by name. Negative control: a touch on the day's word's hook stays on Today; it fails against the build before the fix, as it should. |
| `verify-srs-today.mjs` cap-50 home pill, `verify-pr77-ports.mjs` crumb-origin | unchanged | — | The door's `#home-review` now always shows and reads `Today · N due` (was `Review · N due`, shown only with saved words). Both pins hold unchanged: the count is still the pill's first number, and the pill still opens the tray with the galaxy as its origin. |

### Round 4 · today lane · review and refine, 2026-10-09

The independent review's fixes changed this lane's own new verifier. No other verifier, assertion, selector or label pin changed.

| File | Assertion | Before → after | Why / retained requirements |
| --- | --- | --- | --- |
| `tools/verify-today-sky.mjs` | the sky's count | `≥ 8 stars` → `6 to 10 stars` | The review capped the sky at about 8–10 words. The floor stays: a fresh sky is never empty. |
| `tools/verify-today-sky.mjs` | new: header band, touch areas | none → every star sits below the header band (title bottom + 12px), and the four corners of a 44 × 44 box around each star reach that star | Review fix 1 (no star on the date's or the title's line) and fix 3 (44px touch areas). Both fail on the round-4 build before the fix (`site`, artifact `4af6421c`). |
| `tools/verify-today-sky.mjs` | negative controls | the hook only → date, title, the day's word's label, the hook, both margins beside the word, the skyline: each stays on Today; straight under the word's door: never rises into the universe | Review fix 3. Each probe starts from a fresh Today. Under the door, WebKit gives a touch about 13px away to the door itself (its own meaning), so that probe asks only what the review's defect was: no rise into the universe. |
| `tools/verify-today-sky.mjs` | the level rail | "its 自 label reads auto in English at rest" → "the rail shows no scale at rest (`#lvlLabels` opacity 0); releasing on 自 keeps the level, the handle returns, and the hint says the level is not measured yet, in the interface language" | Review fix 5. The old check pinned a behaviour the review asked to remove (labels at rest). |
| `tools/verify-today-sky.mjs` | new: the explainer's language | none → the visible halves of `#radoc` are all the interface language | Review fix 4. |
| `tools/verify-today-sky.mjs` | the countdown | "equal to the verifier's own first-Sunday formula" → fixed clocks (Asia/Tokyo): 9 Oct 2026 shows 268 days and the literal `Test expected Sun 4 Jul 2027` / `試験日 2027年7月4日（日）の見込み`; 4 Jul 2027 shows `The test is today`; 10 Jul 2027 shows that it has passed, with no count | Review fix 10: the countdown no longer agrees with itself by construction. |
| `tools/verify-today-sky.mjs` | new: the door in every world | none → in all 11 worlds every word ink holds 3:1 on the universe's ground, and by day the universe's ground is not the page's flat ground | Review fix 2. On the build before the fix, 岩 iwa fails (2.81:1 on `#ddb083`) and all six day worlds wear the page's ground. |
| `tools/verify-today-sky.mjs` | new: Me's fields say "not begun" once | none → one group note, no per-field line, while the fields deck is unopened | Review fix 9. |
| `tools/verify-today-sky.mjs` | engines | Chromium only in the logged run → Chromium and WebKit (the runner's `KAIRO_BROWSER=chromium` still limits a battery run; the WebKit run is logged separately) | Review fix 10: his phone runs iOS Safari. After a word's sheet opens, the walk waits for its example fetches before it navigates, because WebKit reports an aborted fetch as a page error. |
| `tools/verify-today-sky.mjs` | new: the Today pill and the universe's card | none → while `#drift-layer #card` is open the door's `#home-review` has opacity 0 and takes no touch, and both come back when it closes | Found in this pass's own evidence: verify-drift-hunt's card photos showed the always-present pill over the card's last row. The check sets the card's `open` class directly, so it guards the style contract; the hunt's photos show the real card. |

## Round 5 · fields expansion, 2026-10-10

| File | Assertion | Before → after | Why / retained requirements |
| --- | --- | --- | --- |
| `prototypes/corridor/tools/verify-n2n1-decks.mjs` | `deck.titleJa` equality for `senmon` | `専門・五つの分野` → `専門・あなたの分野` | John named three fields; the requested deck name describes his fields without asserting five. The exact-title assertion, deck id and all data validation remain. |
| `prototypes/corridor/tools/verify-n2n1-decks.mjs` | dojo deck title equality for `senmon` (`chromeTitles`) | `Your five fields · master’s level` → `Your fields · master's level` | The exact English title follows the requested rename in the single `DOJO_DECKS` line. Deck-list equality, card integrity, furigana, definitions, English disclosure, tap-to-define and offline checks are unchanged. |

This verifier has no pinned word or card totals; its totals are measured from the built decks. No count assertion or behavioural check was changed.

## Lead, 2026-10-10: verify-dojo-door, timing only
- **File:** `prototypes/corridor/tools/verify-dojo-door.mjs`, the reader step.
- **Before → after:** `page.$('#shelf-body [data-passage]')` sampled the instant `#tray` appeared → `page.waitForSelector('#shelf-body [data-passage]', { timeout: 10000 })`. The failure message and the requirement (a passage card must be on the shelf) are unchanged.
- **Why:** the chrome's `#tray` can paint up to about 150 ms before the shelf's cards. Measured in one session over 14 loads: 2 of 14 loads had no card yet at `#tray`, on the build before the new fields cards (751d700b) and on the build after (dd25b9cd) alike. The check failed twice in a row on dd25b9cd and passed on 751d700b by timing alone.
- **Not changed:** no assertion was removed or loosened; a shelf without a passage card still fails after 10 s.
- **Also, the same file:** its five `page.goto('?entry=shelf')` calls go through `gotoShelf()`, which goes again (up to twice) when the navigation is aborted with `net::ERR_ABORTED` or "interrupted by another navigation". This is the flake the cloud run and Astra both reported. No assertion changed.


## Round 4 read: review and refine (2026-10-10, Codex Sol)

**Correction to the first-pass record above.** The sentence “Every assertion about what a control does is unchanged” and its “No storage … assertion changed” claim were incorrect for the first pass. `verify-vocabulary-chooser` lost the capture-failure assertions “A failed native write protects the host until reload” (disabled create button) and “The required recovery reload preserves the unsaved list name”. Its initial replacement annotation case asserted neither. The final annotation case restores both on the real capture-before-list path, plus recovery and retry; no product storage code changes are needed. This is an append-only correction; both prior lane logs and merged skin/cards/today logs remain intact.

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-vocabulary-chooser.mjs` native-write-failures-preserve-draft-and-retry (capture fault) | Initial first pass tested failed Save and reload, without a list-name draft. Final keeps those assertions and identifies the complementary annotation case. | The popup now requires Save before lists. The personal deck still permits capture inside a list, so its protected form and draft recovery are covered there. The list-only fault in this suite still preserves its draft across reload. |
| `verify-annotation-lookup.mjs` failed-capture-inside-a-list-is-honest-and-recoverable | Initial first pass stopped after failed capture, unchanged record and typed name. Final asserts read-only host, disabled submit, reload instruction, required recovery with `Capture first` preserved and record unchanged, then successful retry with 電車 in the list and exactly one card. | Restores the lost behavioural protection and completes recovery/retry; `list-form-reenabled-before-reload` negative control now includes this capture case. |
| `verify-design-reader-shelf.mjs` G7 | No hit-size assertion → measures each version choice at 390 and 320 and requires height ≥44px. | Added behavioural coverage for the regressed segmented control. Existing version/level, caption, switching and no-switch assertions remain. |
| `verify-design-reader-shelf.mjs` G6 | Two choices after the door → same choices plus a quiet Save the sentence action; saves the exact quote on the tutor page without activating it. | Added coverage for discoverability while keeping the one-line tip and exact tutor context assertions. |
| `verify-corridor.mjs` reader pending audio | Exact visible `no recording yet · Kore` → exact `No audio for this article yet`, plus exact `aria-description="Approved voices: Kore (main), Charon (second)."`. | Glossary copy authorised by the finish brief's fix 6. No play control/picker and forbidden device/F1 checks remain; forbidden names are checked in both visible text and description. |
| `verify-playback.mjs` pending observations | Same article copy change; locked voice moves from visible-text match to exact accessible-description assertion in shipped pending state and every final pending observation. | Synthetic Kore lifecycle, silence, no device voice, record invariants and layout checks remain. |
| `verify-bundled-listening.mjs`, `verify-listening-failures.mjs`, `verify-sentence-drafts.mjs` pending sentence checks | Exact `no recording yet · Kore` → exact contextual `No audio for this sentence yet`, plus exact approved Kore/Charon description. | No offered listening control or requested sentence recording; armed fault silence, record invariants and Ami negative control remain. Receipt `pendingKoreVisible` becomes `pendingKoreDescribed` to name the evidence accurately. |
| `test-approved-voice.mjs` executable fixture extraction and pending copy | Bar slice starts at `voicePendingNote` (formerly `buildListenRow`, missing the called helper); controls end at existing `/* Save is one tap` (formerly removed `/** Lists are chosen`). Pending assertions use exact contextual text and exact voice description in EN and JA, for every stale saved voice preference. | Repairs an inherited unrunnable fixture without removing tests; all eleven cases retain silence, unchanged storage, voice roster and playback checks. The answer-card Kore copy remains pinned in both languages. |
| `verify-design-reader-shelf.mjs` G6 at 390/320 | No phone pane-seat/save coverage → requires the settled sentence popup top to stay within 1px of the word popup, remain in the viewport, hide word Save, keep exactly one tutor context without activating it or leaving the reader, and restore the word view on Back. | Added behavioural coverage for fix 5 and the discoverable sentence action. |
| `verify-design-reader-shelf.mjs` G8 at 390/320 | No motion property assertion → checks computed positive-duration transitions and named animation keyframes, including pseudo-elements, with reduced motion disabled; only transform/opacity allowed. | Added runtime coverage for the hard motion rule; checks both word and sentence views and proves it observed motion. |
| `verify-design-reader-shelf.mjs` G9 at 390/320 | No Japanese punctuation/word line assertion → compares painted glyph lines to keep openings with following glyphs and closings with preceding glyphs, prevents splitting title lookup words, and asserts exact source title/article text preservation. | Added rendering coverage for fix 7 without coupling to wrapper classes. |
| `verify-design-reader-shelf.mjs` receipt count | First pass 37; draft added two checks but left 37 → final expects 45 per engine. | Accurate receipt completeness, including eight added checks; no case is removed or reduced. |
| `verify-design-reader-shelf.mjs` G6 keyboard/Practice return at 390/320 | Seat checks alone → initial focused control wholly visible inside the popup, Tab to Ask/Practice visible, article scroll unchanged; repeat on the short `その` popup (token 12), which exposed the tall-pane regression, and require Practice return focus to remain visible in the reopened pane. | Strengthens focus visibility while pinning the pane. Initial focus lands on Back so the sentence opens at its top; internal card scrolling reveals subsequent controls without moving the article. Count remains 45 cases per engine. |
| `verify-design-reader-shelf.mjs` G6 clipped phone popup | No header-gap assertion → when the word card is height-constrained above its token, its top meets the fixed chrome bottom within 1px. | The 320px photographs exposed a 9px strip of cut title glyphs above the card. Closing that strip strengthens fix 5; all seat, focus, save and return checks remain. |


## Round 4 read: gate review (2026-10-10)

The gate's review of `890cd522` (product code `40806a26`, artifact `34cf6d10…`) found four defects. Each got a runtime check that fails on that build and passes on the fix. These rows add to the section above; nothing above is edited. Its last two G6 rows say "45 cases per engine": the count is 48 from here. No existing case or assertion was removed, reduced or reworded.

The checks were first run, unchanged, against a rebuild of `890cd522` (same digest, `34cf6d10501d730cc305142a83d392cbcb3a0aa5d95d049f51d574541e07d449`), in Chromium: 43/48, the five failures being exactly the five cases named below. They then ran against a build of the fixed worktree (`sourceDirty: true`, digest `67d67bed253ceae11a17b0d33c73c214b531b2677af129f0569e8b33ffb928e6`): 48/48 in Chromium and 48/48 in WebKit. Logs and receipts: `~/.dharma/bunki_review/2026-10-10/r4-finish/review-fix-01M4GJ26/`. That dirty-source build is a regression build only. It is not the final artifact, and the final battery and photographs recorded above still describe `40806a26`.

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-design-reader-shelf.mjs` G5, new case `G5-galaxy-one-path` (390) | No case opened the popup in the galaxy → real taps climb the galaxy's ladder to a word's entry over the sky (`data-view="drift"`), a word of an example sentence opens the popup, and it must show no list and the "to review" note before Save; "Add to a list" and no note after Save, with exactly one card; and no list again after the toast's Undo, with the card gone. | Review finding 1: the rule that honours the path's `hidden` attribute excluded the galaxy, so "Add to a list" stood beside an unsaved Save there. On `890cd522` the case fails with `list: true` on 動画 before Save. The two existing G5 cases are unchanged. |
| `verify-design-reader-shelf.mjs` G6, new cases `G6-sentence-return-motion-390` and `-320` | Return from Practice was checked on その only, with reduced motion → with motion enabled, for の (a particle), ダマスカス (a lookup word, whose popup opens after its dictionary rows load) and その (a content word): after Practice and its Back, Practice is focused, inside the popup and wholly visible, the sentence pane is open, the article has not scrolled, and the returned card's top is within 1px of the word card's top after "Back to the word". Then その's sentence is opened by a second tap while the card is still rising, and its top must be within 1px of the settled word card's. The case lists every word that fails, not only the first. | Review findings 3 and 4. On `890cd522` both cases report the same four faults: ダマスカス lands on the word with its pane closed; the returned の and その cards sit exactly 10px below the seat; and その opened while rising sits 10px below it. の's Practice was already visible on return in this fixture, so the focus reveal the particle popup now shares with the word popup is covered here but was not shown failing. All existing G6 cases, including the reduced-motion ones, are unchanged. |
| `verify-design-reader-shelf.mjs` G8 node set | `.reader-card button, .reader-card summary, #reader button, #mini, #mini *` → `#app` and everything in it (top bar, tab bar, title card, bookmarks, play bar, article, footer, text settings), `#reader-word-menu`, `#mini`, `#reader-toast` and `#vocabulary-list-popover`, each with its descendants and `::before` / `::after`. | Review finding 2: the rule was enforced on a narrower set than "all reader and popup motion". Measured nodes rise from 966 to 3,957. Left out on purpose, as not the reader's controls: `#drift-layer` (the galaxy's own layer, hidden under the reader) and `#bunki-reports-root` (the report rail). |
| `verify-design-reader-shelf.mjs` G8 stages | Word popup and sentence pane → the same two, then: after Save (the toast, and "Add to a list" entering), after Add to a list (the sheet and its Add), with text settings open, and with the word menu open. Every stage must have no violation. | The list sheet is reached by the public Save, then Add to a list. On `890cd522` both G8 cases fail on the top bar, the 日本語 / EN switch, the tab bar, the bookmark and finished chips; the sheet's Add and the settings choices animate colour there too. |
| `verify-design-reader-shelf.mjs` G8 coverage | "nodes > 100, transitions > 0, animations > 0" → the same, plus each named group must be among the measured nodes when its stage is measured: top bar, tab bar, title card, bookmark, play bar, words, finished, popup; then toast, list Add, settings, menu. | So the wider rule cannot pass by not finding a control. The two original assertion messages are retained. |
| `verify-design-reader-shelf.mjs` receipt count | 45 per engine → 48 per engine. | Three added cases. |

| `verify-design-reader-shelf.mjs` G6 hidden sentence door | Logical pane/door state alone → also assert `#mini-sentence-open` is not visible while the pane is open, at 390 and320. | The gate fix removed a specificity component from the shared hidden rule. A real320px probe on its `67d67bed…` regression build finds `hidden:true`, `display:grid`, and a painted door. `body[data-view]` restores the original strength while matching every app view. No case or existing assertion is removed; count stays48 per engine. |


## Round 4 read: final verified release (2026-10-10, Codex Sol)

The preceding gate entries describe intermediate builds. Final product code is clean `76c40528c724008b6a7321cc6026f6779f466ed4`, artifact `0ef8374974d6085151484c96074b6437af9fc88defe38ebdf2596c09022ee570`. The full finish battery and new photographs now use this build, including the gate fixes and the hidden-rule specificity follow-up. Reader design passes 48/48 in Chromium and 48/48 in WebKit. No additional verifier source changed in this final documentation round.

An external motion observer adds day-en/night-en/day-ja at 320, 390 and 1368 widths across the six existing G8 stages: 54/54, zero disallowed properties, with reduced motion disabled. A separate public-flow/native-abort audit passes 18 runtime and seven protected-byte assertions. These receipts supplement the executable repository verifiers; no existing behavioural floor or assertion is removed. Runtime receipts live under `~/.dharma/bunki_review/2026-10-10/r4-finish/`, not in the repository.


## Round 4 read: second gate review (2026-10-10)

The gate's review of `7a48cd77` (product code `76c40528`, artifact `0ef83749…`) found one defect: the popup's word band was laid out in every room except the galaxy. These rows add to the sections above; nothing above is edited. The count stays 48 per engine, because the assertions were added inside the existing `G5-galaxy-one-path` case. No case or assertion was removed, reduced or reworded.

The check was first run, unchanged, against the final site (`0ef8374974d6085151484c96074b6437af9fc88defe38ebdf2596c09022ee570`) in Chromium: 47/48, the one failure being `G5-galaxy-one-path`. It then ran against a build of the fixed worktree (`sourceDirty: true`, digest `ddaf53700a17269b9141a63178514953801eb5cff4e8a3952fc8830859c547d7`): 48/48 in Chromium. In WebKit, a first run that shared the machine with the Chromium run and the photograph probe gave 47/48: `G6-sentence-pane-seat-320` failed its focus reveal, a case this change does not touch. Run again alone, as the brief allows once for a timing failure, WebKit gave 48/48. Logs, receipts and before/after photographs of the galaxy popup: `~/.dharma/bunki_review/2026-10-10/r4-finish/review-fix-01M4GQMR/`. That dirty-source build is a regression build only. It is not a final artifact, and the "final verified release" section above describes `76c40528`, which predates this change.

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-design-reader-shelf.mjs` G5, `G5-galaxy-one-path` (390) | The case checked only the Save and list path of the galaxy popup → before Save it also measures the painted boxes of the popup's word, reading and meaning, and of "Full entry". Each line must start at or below the bottom of the line before it, within 1px. "Full entry" must be at least 44px wide and 44px tall, carry its name, be the element on top at its own centre, lie inside the card and the screen, stand beside the word on the word's row, and be nearer the card's right edge than its left. | Review finding read-r5-1: the rules that lay out the popup's new word band excluded the galaxy, so 動画, どうが and "video (esp. digital)" ran together on one line there and "Full entry" stood alone on a row at the left. On `0ef83749…` the case fails on exactly that: the reading and the meaning start 24px above the word's bottom edge, on its own line. The case's earlier assertions (no list before Save, the list and one card after it, none after Undo) are unchanged and still run. |


## Round 4 read: third gate review (2026-10-10)

The gate's review of `b0104ffc` found a race in this suite, not in the product. This row adds to the sections above; nothing above is edited. The section above calls the one WebKit failure of its round a timing failure; its cause is the race described here. No product file changed in this round. No case, assertion, floor or tolerance was removed, reduced or reworded, and the count stays 48 per engine.

The popup reveals a newly focused control one animation frame after `focusin` (it scrolls inside the pinned card, never the article). `G6-sentence-pane-seat` pressed Tab and measured the focused control at once, so a measurement could land before that frame. That is the failure logged in `review-fix-01M4GQMR/logs/fix-webkit.log`: "Ask the tutor" was focused at 386.7 to 444.7px while the card ended at 326.6px, so the card had not yet scrolled. A probe now shows the window directly, with a real Tab press in the same place (320 wide, その, the sentence pane open). It records the focused control at `focusin`, before any frame, and again two frames later. In WebKit "Ask the tutor" stands at 386.7 to 444.7px at `focusin`, with the card ending at 326.6px and not yet scrolled, the same figures as the logged failure; two frames later it stands at 260.7 to 318.7px, inside the card. In Chromium it is already inside the card at `focusin`, because that engine scrolls a focused control into view at once, which is why only WebKit showed the race. With the wait in place the suite ran in Chromium and in WebKit at the same time, the condition under which the failure was logged: 48/48 in Chromium and 48/48 in WebKit. Logs, receipts and the probe: `~/.dharma/bunki_review/2026-10-10/r4-finish/review-fix-r6-1/`. The build there (`sourceDirty: true`, on `b0104ffc`, digest `ddaf53700a17269b9141a63178514953801eb5cff4e8a3952fc8830859c547d7`) is a regression build only, not a final artifact.

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-design-reader-shelf.mjs` G6, `G6-sentence-pane-seat-390` and `-320`, the three Tab presses | Tab, then measure the focused control → Tab, then two animation frames, then measure. The frames are the page's own `requestAnimationFrame`, not a fixed sleep. | Review finding read-r6-1. The product's reveal is queued for the frame after `focusin`; the first of the two frames runs after it and the second is the paint. Every assertion after the wait is as it was: the focused control must be the expected one, inside the popup, wholly inside its painted box within 1px, with the article's scroll unchanged. The fourth Tab press in the suite belongs to the paragraph-stop count, which measures no position, and is unchanged. |


## Round 4 read: below-word sentence seat (2026-10-10)

The next review identified a below-word placement path that the existing G6 cases did not exercise. This entry appends to the prior record. All 48 existing cases, their assertions and tolerances, and the three two-animation-frame waits after Tab are unchanged. The suite adds one public case and now requires 49 results per engine.

| File / case | Added assertions | Why / retained requirements |
| --- | --- | --- |
| `verify-design-reader-shelf.mjs`, `G6-sentence-below-seat-390` | At 390×844, use the public shelf to open やまなし (`aozora:046605`), scroll to 4716, and click token 816. Require its popup word to be 大丈夫, its initial view to be the word view at that scroll, and its painted card to stand below the token. Open Study this sentence; require the sentence view with `大丈夫だ、安心しろ。`, a card still below the token and within 1px of its earlier top, exactly unchanged article scroll and token anchor rectangle, and no page errors. These are 11 assertion statements. | The public path on clean `98f2905933f2a36f04f1989959b9573c3b719fb3`, artifact `ddaf53700a17269b9141a63178514953801eb5cff4e8a3952fc8830859c547d7`, moves the Chromium card from below at 394.578125px to above at 57.953125px: −336.625px with unchanged token and scroll. WebKit keeps its below seat at 395.203125px. The new case uses the existing suite context and real clicks, with no learner-data or style injection. Side is measured from the painted card and anchor rectangles; the suite does not require a particular numeric cache, dataset field or CSS serialization. |
| `verify-design-reader-shelf.mjs` receipt count / scope | 48 → 49 results per engine; add the public below-word sentence seat to the scope. | No prior case is replaced. The external causal probe and cross-engine public regression receipts are preserved under `~/.dharma/bunki_review/2026-10-10/r4-finish/below-seat-audit/`. The fixture was also checked in the suite's existing reduced-motion, desktop-at-390 context; Chromium reproduces the same −336.625px jump. |

Before-fix verification: the actual updated 49-case Chromium suite was run alone against that clean `98f29059` / `ddaf5370…` artifact, with the verifier source unchanged during the run. It exits 1 with 48/49: every previous case passes and only `G6-sentence-below-seat-390` fails, recording the same below-to-above move of −336.625px with the token and article scroll unchanged. Its receipt and failure photograph are in `~/.dharma/bunki_review/2026-10-10/r4-finish/below-seat-audit/before-suite-98f29059-1791568250/`. The updated verifier's syntax check passes. No fixed-build suite result is claimed by this entry; that check belongs to the next clean candidate.


## Round 4 read: exact final candidate verified (2026-10-10, Codex Sol)

The pending fixed-build result in the previous entry is now complete. Clean product commit `6ca33a4e3203906611ac211cc0c0e338a8ac1f1c`, artifact `cb8d61c82b83194a5ae059803949a6f75752c337283b81817f0976e2e429578c`: reader design passes **49/49 Chromium and 49/49 WebKit**, retaining all prior 48 cases and their assertions. The new below-word case passes; the independent public probe passes 15/15 with 0px movement in both engines and unchanged scroll/anchor. No additional verifier source changes were made in this documentation round.

All 29 required finish checks are complete: 27 pass, corridor-doors fails only accepted T13, and pr77-ports fails the same four accepted checks (52/56). Exact baseline-name comparisons pass. All five supplementary checks pass. Dojo's first shelf-start failure is preserved; one unchanged isolated retry passes all 30 journeys. Fresh motion audit passes 54/54 stages, protected scope passes seven assertions over the full storage prefix and 536 files, and photographs complete 36/36 supplied plus 48/48 supplemental frames. Runtime evidence and full final table are under `~/.dharma/bunki_review/2026-10-10/r4-finish/`; prior intermediate receipts remain historical. No behavioural floor, tolerance or protection was removed or weakened.

## Round 5: ready practice replaces the unbuilt mock promise (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/verify-assessment-written-section.mjs`, `dojoPracticeLabel` in `public-catalog-and-dojo-practice-labels` | `${sections.length} practice set(s) · mock tests in preparation` → `${sections.length} practice set(s) · practice sets available` | Strict check 11 removes the future-feature placeholder and names the real available practice. The exact catalog-derived section count and singular/plural suffix stay required. Published machine-checked written tests still require their unchanged exact count and “awaiting review” label; all public catalog, delivery, answer, scoring and record assertions remain unchanged. |

## Round 5: Focus dims context while keeping its actual ink readable (2026-10-10)

The former opacity pin forced nonfocus sentences below 0.5 opacity. That cosmetic value conflicts with check 8's contrast floor, especially for small ruby. Both assertions still require visibly dimmed context (`opacity < 1`) and now also require the measured foreground, after all ancestor opacity is applied over the painted card colour, to reach 4.5:1. The browser measurement samples every nonblank context text node and each reading, uses WCAG relative luminance, and rejects opacity masks that would make that colour calculation incomplete. It does not modify app styles or record data.

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs`, “a new passage card opens 全文 … 焦点 … dims the other sentences” | Every nonfocus sentence `opacity < 0.5` → every nonfocus sentence `opacity < 1`, actual text and ruby contrast both ≥4.5:1, at least one text and ruby sample, no ancestor mask | A deliberate cosmetic opacity correction for the strict contrast blocker. Default Full, one focus sentence, focus opacity exactly 1, unchanged sentence count and complete source text, nonrebuilding switch, open translation fold, remembered Focus setting and exact pressed states remain required. |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs`, longest passage `km-298-m02` Focus context groups | Each context group `opacity < 0.5` → `opacity < 1`, every group's actual text and any ruby ≥4.5:1, at least one ruby sample across groups, no ancestor mask | The dimming remains visible and readable. The two-line height, block layout, exact clipping/⋯ equivalence, a real expandable group, aria-expanded/opened height, full source text equality in both modes, and Full's display-contents/no-⋯/opacity-1 requirements remain unchanged. |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs`, `RESTING` before longest-passage geometry and context-contrast observations | Six unchanged-scroll frames → six unchanged-scroll frames **and** no running finite animation in the revealed card; explicit 5-second failure bound | The new ruby contrast assertion initially sampled the authored opacity entrance before its 180ms reveal completed (3.82:1 during the fade; 5.13:1 once settled). These cases explicitly judge the card at rest. They now require its ink as well as its scroll to have settled; infinite ambient motion cannot block completion. No geometry assertion, line clamp, reading, source text or contrast threshold changes. |

## Round 5: navigation VM loads the real transition dependency (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/test-navigation-returns.mjs`, actual-function VM assembly | `openPassage` without its new transition dependency → provide `roomTransitionUpdating=false`, `activeRoomTransition=null`, and extract/run the actual `roomTransition` function from corridor.js | The article opener now uses the real room-transition helper. The harness has no `document.startViewTransition` and no ready state, so that actual helper chooses its ordinary synchronous fallback. No helper is stubbed. All four tests and every original assertion remain unchanged: exact live review caller/token/scroll, learner roots, replaced-epoch/session rejection, and pending-collection retirement/preservation. |

## Round 5: reduced-motion cards use the required short crossfade (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs`, reduced-motion reveal/grade case and `MOTION` observation | Require zero-duration/no-running-animation/no-arrival-class → require duration >0 and ≤120ms, actual animation keyframes only opacity, arrival class present for the next card's crossfade | VISION check 6 explicitly requires a short reduced-motion crossfade. `MOTION` now records the real animation properties instead of assuming every animation is spatial movement. Original card-node identity, zero transformed elements, no swipe dragging, swipe edge feedback, exactly one committed grade, next-card count, zero slide-out ghosts, and untransformed plain-width progress rail with the original geometry tolerance remain required. The class now names opacity arrival, not a slide. No card content, scheduling, storage, hit-size or contrast check changes. |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs`, `REACH` observation before the passage tap-height assertion | Sample one-rectangle token centres between 80px and the grade bar → wait for the existing `RESTING` condition, then also require the centre and both ±21px test points to lie inside actual overflow clipping windows | Final immediate passage positioning revealed that the old filter sampled tokens whose layout boxes lay above the scroll window and whose painted pixels were clipped. The earlier smooth scroll could expose those tokens during the sample. The cap of 12 sampled tokens, minimum of five, exact ±21px `elementFromPoint` ownership checks, no underline at rest, and dotted underline on hover remain unchanged. No hit-size floor or geometry tolerance changes. `RESTING` is shared with the existing resting-card observations, with its same five-second failure bound. |

## Round 5: visible capture door and the existing Tools lookup (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-corridor.mjs`, R2-B reader-header capture; `verify-reader-gloss.mjs`, the seal preparation and `pressSeal` helper | Press the reader header Save while its word popup is open → dismiss that popup with a real Escape and wait for detachment before measuring or pressing the header | The open popup now owns the one visible Save; the reserved header slot hides its duplicate. The selected word survives dismissal. All exact source-context, durable single-capture, learning-root equality, disabled/held-door reason, focus/hit ownership, and subsequent popup/list assertions remain unchanged. The mini, entry-bar and entry-foot capture paths remain independently exercised. |
| `tools/verify-redesign-foundation.mjs`, reader capture geometry | Require a visible header Save while the popup is open → require that header hidden, its reserved box still ≥44×44px, the actual visible popup Save ≥44×44px and owning its centre, then a visible header Save ≥44×44px after dictionary Escape | The original header/article movement limit of 1px and all original 44px geometry floors remain unchanged. The check now measures the currently visible action and also checks both the reserved slot and restored action. No touch-size floor is reduced. |
| `tools/verify-redesign-foundation.mjs`, Learn section order and Settings/Me room assertions | Read immediately after a room click → wait for the actual Learn focus section to attach, and for the expected Settings/Me state before reading | Native room transitions mount the requested room in their asynchronous callback. The first dirty-candidate run read an empty Learn section list before that callback. The exact three-section order, room identity and Settings-to-Me return assertions remain unchanged, with the existing timeout still bounding the waits. |
| `verify-shelf-search.mjs`; `verify-corridor.mjs`; `verify-kotoba-mine.mjs` main-app lookup; `verify-pr77-ports.mjs`; `verify-writing-room.mjs`; `verify-corridor-ai.mjs`; `verify-journey.mjs`; `verify-corridor-performance.mjs`; `verify-experience.mjs` lookup/recovery | Directly use the shelf's always-visible `#search` → open its actual existing Tools panel with the shared idempotent `openShelfTools` helper before focusing or editing the same input | Search is a secondary task in Tools. No input is substituted. All query/result identities, trusted typing, exact node retention, caret/focus, immediate clears, current-generation replies, stale held-worker delivery, latency ceilings, persistence, context and capture assertions remain unchanged. Performance boot samples still precede Tools opening; only the subsequent lookup setup opens it. Recovery reaches the real panel before clearing its existing field. |
| `verify-design-reader-shelf.mjs`, O1 at 320, 390 and1368 | Require lookup-placeholder fit in both arrival and Tools-open states, even for a hidden field → require the field hidden at arrival and visible after real Tools opening, then require the original exact placeholder-width fit when visible | Both original served/tools-open audits still require zero crossing rows, zero sideways scrolling and zero horizontal page overflow. The original placeholder fit and its width calculation remain required for the actual visible field, with no tolerance change. Hidden input width is not a painted layout measurement. |

## Round 5: one visible Close at the first entry depth (2026-10-10)

The product's first-depth `#sheet-back` keeps its existing return handler and now reads Close / 閉じる; its duplicate `#sheet-close` is hidden. Nested entries still expose Back (one step) and Close (all entries). The verifier-only `sheet-navigation-support.mjs` helper selects the actual visible Close: `#sheet-close` when visible, otherwise the first-depth `#sheet-back`. It waits for the actual entry and door to be visible and preserves the caller's click or synthetic-dispatch method. It never pops a nested Back when the fixture intends close-all.

Each changed file and action is recorded below. All existing return branches, bounded-route limits, article/reading scroll, source context, captured identity, query retention, durable records and learner-root comparisons remain unchanged. The separate personal-app dictionary Close in `tools/lint-ui-language.mjs` does not use this corridor header and remains unchanged. Presence-only `#sheet-close` observations also remain unchanged because the reserved duplicate node still exists.

| File | Before → after action |
| --- | --- |
| `verify-personal-reading.mjs` | Wait for and click `#sheet-close` after a word near the reading's end → wait for and click the visible Close selected by the helper; preserve exact reading/scroll return assertions. |
| `verify-teacher-context.mjs` | Click `#sheet-close` in its two entry exits → click the visible Close; preserve teacher context and captured-token assertions. |
| `verify-reference.mjs` | Click `#sheet-close` in five reference/entry returns, including the separate `p` page → click the visible Close on that same page; preserve collection, filter and navigation assertions. |
| `verify-file-intake.mjs` | Dismiss only when `#sheet-close` is visible → detect the actual visible entry and press its visible Close before the existing intake return. |
| `verify-corridor.mjs` | Direct Close clicks and synthetic dispatches → choose the visible Close, retaining click versus dispatch; measure that visible door's rectangle in `sheetViewportGeometry`, with every original viewport/touch-size tolerance unchanged. |
| `verify-reader-gloss.mjs` | `closeIfOpen` presses `#sheet-close` → its existing real press uses the visible Close, preserving entry detachment and all capture/held-door assertions. |
| `verify-search-fallback.mjs` | Close dictionary via `#sheet-close` before Review → press the visible Close, retaining the same saved-word review assertions. |
| `verify-personal-collections.mjs` | Click `#sheet-close` and require entry detachment → click the visible Close and retain that exact detachment/collection return requirement. |
| `verify-source-inbox.mjs` | Shelf/inbox recovery checks and presses `#sheet-close` → detect the actual visible entry and press its visible Close; preserve the 12-step bound and full source-record assertions. |
| `verify-experience.mjs` | Recovery and `closeSheet` click `#sheet-close` → their same real click helper presses the selected visible Close, preserving all continuous-journey observations. |
| `verify-reference-connections.mjs` | Two `#sheet-close` exits → two visible Close presses, preserving exact typed-query and collection/context return assertions. |
| `verify-source-processing.mjs` | Shelf/inbox recovery checks and presses `#sheet-close` → detect the actual visible entry and press its visible Close, retaining bounded returns and processing-authority assertions. |
| `verify-timed-transcript.mjs` | Shelf/inbox recovery checks and presses `#sheet-close` → detect the actual visible entry and press its visible Close, retaining bounded returns and timed-transcript assertions. |
| `verify-listening-intake.mjs` | Shelf/inbox recovery checks and presses `#sheet-close` → detect the actual visible entry and press its visible Close, retaining bounded returns and listening-intake assertions. |
| `verify-corridor-ai.mjs` | Click `#sheet-close` to leave its entry → click the visible Close, retaining all conversation/record assertions. |
| `verify-design-reader-shelf.mjs` | G2 first-depth entry clicks `#sheet-close` → click the visible Close, retaining exact article scroll and all reader design assertions. |
| `verify-source-learning.mjs` | Four `#sheet-close` exits → four visible Close presses, preserving source-link, exact captured identity and list/learning-state assertions. |
| `verify-record-live.mjs` | Four `#sheet-close` entry returns → four visible Close presses, retaining all live-record/import/concurrency assertions. |
| `verify-skip-ui.mjs` | Three `#sheet-close` exits → three visible Close presses, preserving code/filter/context return assertions. |
| `verify-ai-adaptation.mjs` | Two optional `#sheet-close` checks/clicks → check the actual visible entry and press its visible Close, preserving eligibility, provider-request and adaptation record assertions. |

Before this fixture commit, the dirty priority-three candidate (`9f50b476`, artifact `06087c4c7619aff3a01f9eae8d1f9957f1bf8d179207cc299e18950c6f3ff388`) passes reader design **49/49 Chromium**, foundation **6/6 Chromium** width/language cases, and seven independent real Close/capture paths. The independent paths cover first-depth Close, nested Back, nested close-all and all four exact durable core capture doors with unchanged learner roots. Reader-gloss rejects this same candidate at its unchanged clean-source identity gate before any behavior runs; no gate is relaxed. Its full clean-artifact result belongs to the final assembly. Receipts are under `~/.dharma/bunki_review/2026-10-10/r5-strict/owned-stage3-*`. The first foundation transition race and O1 receipt-metadata failure remain preserved in the original logs; the explicit sequencing/metadata corrections above pass on the same immutable artifact.

## Round 5: guided external returns await the actual room (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-guided-session.mjs`, D1 Hall door, D4 Back to exams, S15 Back to guided | Read immediately after external navigation → wait for `hallDoor`, `.exam-levels`, and the actual `room(page)` respectively to be visible, each bounded at 20 seconds | Native room navigation paints its destination in the scheduled snapshot callback. All original D1/D4/S15 assertions remain unchanged. Internal guided J12/J13 branch-return/focus assertions remain immediate and unchanged; their source behavior is fixed instead of delaying those checks. |

## Round 5: accurate singular backup labels (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-kotoba-mine.mjs`, smaller-backup confirmation | `Backup: 1 cards · 1 answers` → `Backup: 1 card · 1 answer` | Strict check 13 requires natural count grammar. The exact one-card/one-answer backup and two-card/two-answer current-record counts, unchanged first-tap ledger, explicit second Replace tap, exact resulting ledger sizes, preserved before-restore ledger bytes and successful restore remain required. The app also fixes its one-card/one-answer success label; that existing assertion still requires “Restored.” Japanese and record formats are unchanged. |


## Round 5: header bookmark names its Today destination (2026-10-10)

The quiet header bookmark remains `#tray` and opens the same Today room. John kept this icon in D7; the strict brief requires its visible name to describe that destination. All other `#tray` journeys retain their existing selector and behavior. These are the only two assertions pinning the former visible name; numeric patterns are identical apart from the word.

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/verify-corridor.mjs`, “any node can be taken into study” | `/^Lists\s+[1-9][0-9]*$/u` → `/^Today\s+[1-9][0-9]*$/u` | Name the existing Today destination. The exact anchored label, whitespace, positive integer count, Save action and real record/collection observations remain required. |
| `prototypes/corridor/tools/verify-corridor.mjs`, default English `biChrome.trayEn` | `/^Lists [0-9]+$/u` → `/^Today [0-9]+$/u` | The default-English header is labelled Today. Exactly one separating space, a numeric count, English-language purity, active EN state and the later Japanese toggle assertions remain unchanged. |

## Round 5: plain labels and present-tense recording absence (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-corridor.mjs`, reading-check selector; `verify-learning-record.mjs`, its two reading-check selectors; `verify-report-entries.mjs`, reading-check regex | `yomi probe` / `読み探査` → `Reading check` / `読みの確認` | Name the same existing sampling activity plainly. The queue, stratified coverage, exact card identities, authored readings, observation ledger, timing, return and report-entry assertions remain unchanged. |
| `verify-corridor.mjs`, two due-mode selectors and subtitle check | `your due cards` → `Cards due`; `稽古|practice` subtitle → `追加の練習|then extra rounds` | The same initial two due cards and extra practice rounds are named plainly. The exact subtitle count `2`, committed versus ephemeral-grade behavior, undo history and grade/scheduler assertions remain unchanged. |
| `verify-playback.mjs`, `PENDING` and missing-Kore card assertion | `No audio for this article yet` → `No recording for this article`; promised Kore voice → `No Kore recording` / `Kore の収録音声はありません` | State the actual recording absence without a future promise. The anchored exact article text, approved Kore/Charon accessible description, zero device-voice calls, no playback of retired voices, untouched stored preference, native playback/error/interrupt and learner-record invariants remain unchanged. |
| `verify-bundled-listening.mjs`, exact pending sentence text | `No audio for this sentence yet` → `No recording for this sentence` | Preserve the same exact absence observation and every cue/source/record assertion. |
| `verify-listening-failures.mjs`, exact pending sentence text | `No audio for this sentence yet` → `No recording for this sentence` | Preserve exact absence and all native failure/retry/cleanup and learner-state assertions. |
| `verify-sentence-drafts.mjs`, exact pending sentence text | `No audio for this sentence yet` → `No recording for this sentence` | Preserve exact absence and all sentence capture/draft/practice/source assertions. |
| `verify-experience.mjs`, optional SKIP segment | Search for absent `.kdx-lens` text `by its shape` after the earlier room return → open the actual `#chrome-search` door and select its `[data-search-lens=skip]` | The old combined journey could skip this segment because the prior return was to the shelf. This real path exercises the integrated search lens. Existing real candidate tap, canonical `1-3-8` query, exact code preservation after entry Back and unchanged learner-record assertions remain required. Dedicated Kanji-finder `by its shape` pins remain unchanged because that separate visible label is unchanged. |
| `verify-n2n1-decks.mjs`, exact deck and chrome title arrays | `N2/N1・文章で覚える` → `N2/N1の語・短い文章で`; `N2/N1 vocabulary · passages` → `N2/N1 words · in short passages` | These are the accepted tour's plain Japanese/English titles. The exact array positions, deck IDs, specialist title, full deck validation, card/token identity equality, Japanese definitions, ruby, single focus span, offline answer and explicit saved-look assertions remain unchanged. |
| `verify-kotoba-mine.mjs`, fresh host sentence-deck look | Require the data default `dark` → require host look `world` when no look was saved | Fresh app cards now inherit the selected room world. The same real marked sentence and zero blank count remain required. All explicit saved-look cases and standalone deck-default metadata assertions remain unchanged; no learner preference or theme is discarded. |
| `tools/verify-redesign-docks.mjs`, exact palette control census | Require eight `.kp-swatch` controls → require nine | The existing eight explicit card looks remain available, and the app's world choice is the ninth actual control. All nine controls must retain the original 44-pixel size, five-point hit ownership, visible in-control text and scroll checks. The explicit eight stored-look cases remain unchanged. |

## Round 5: truthful absence and optional topic controls (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-reader-lookup.mjs`, polite-ending identity; `test-japanese-lookup.mjs`, two exact unresolved-spelling gloss assertions | `(no gloss yet)` → `No dictionary entry for this spelling.` | State the actual dictionary absence without a future promise. Exact original token spelling and reading, refusal to borrow an unrelated kanji gloss, disabled Save/Full entry, resolved save identities and lookup/prose behavior remain required. |
| `verify-reader-gloss.mjs`, G2 generic-absence rejection; `verify-native-readings.mjs`, resolved-gloss candidate guard | Reject old `no gloss yet` / `語釈なし` → also reject the new exact English/Japanese unresolved-spelling absence | A generic absence must still fail a requirement for a real sense or the specific quick-dictionary miss. The exact authored quick-dictionary miss and all token/entry/reading assertions remain unchanged. This preserves the guards after the copy change. |
| `verify-kotoba-mine.mjs`, deck-home count and twelve topics | Require twelve topic controls on home → require no topic wall on home, open actual Settings, require all twelve original topic IDs and exact `0/source-word-count` values, and return home | Optional topic selection now lives with deck settings. The original Begin count `15` stays required. Added checks preserve exact source group order/counts, original Begin text on return, and byte-identical deck ledger/preferences. No topic toggle, queue/grade/count behavior, tile or front assertion is removed. |
| `test-japanese-lookup.mjs`, actual-function extraction harness | Extract `showMini` and its earlier helpers → also extract actual `paintMiniPath` and `revealFloatingFocus` dependencies | The popup now paints its one visible Save/list path and its focused floating control through these helpers. The unit seam executes the real helpers instead of failing on undefined dependencies; none of its seven lookup/save/prose tests or assertions is changed. |

## Round 5: final fixture paths retain their assertions (2026-10-10)

The first clean final artifact (`59b6278b`, `66633d2a…`) retains each original failure receipt. These changes follow visible controls and observe actual destination completion; app geometry and hit-testing failures are repaired in production instead.

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `tools/lint-ui-language.mjs`, personal dictionary exit in the full 230-state tour | Direct hidden first-depth `#sheet-close` click → existing `entryCloseSelector` and a real click | First depth exposes Close on `#sheet-back`; nested close-all remains `#sheet-close`. Both language runs, every personal screen capture and the complete language-purity census stay required. |
| `shelf-tools-support.mjs`; `verify-relief.mjs`, shelf-to-lookup path | Leave Tools open and click its hidden duplicate header Search → close the actual Tools toggle idempotently, require the panel hidden, then click header Search | The shelf edge/rule measurements remain before this exit. All search, SKIP, study-door, reader-edge and record assertions remain unchanged. |
| `verify-bundled-listening.mjs`, return from Reading preferences | Read the Shelf item count before the scheduled room arrival → wait up to 20 seconds for the actual named item to be visible | Still require exactly one `静かな朝` item, its exact passage ID and every native listening, cue, source and unchanged-record assertion. No loading state counts as arrival. |
| `verify-experience.mjs`, E02 literal markup-looking input | Require zero `main img` including the legitimate masthead → require exactly one owned masthead image with exact class, fixed asset path, empty alt, 640×640 attributes, hidden semantics and exact parent; require every unexpected image count to be zero | The newly visible shelf masthead is authored decoration. Exact malformed input remains required; an injected image or altered decoration still fails. The complete continuous learner journey is unchanged. |

| `verify-corridor-doors.mjs`, T13 failure/retry and T14 two stale downloads | Wrong `data/mock/n1-02/03/04.json` interception → actual public `data/mock/sets/n1-02/03/04.json` paths | The original harness never held or failed a real set request: a read-only diagnostic recorded zero intercepted requests and a real attempt starting within 400 ms. Require exact actual T13 request counts (one abort, then second retry) and affirmative actual T14 held-request URL observations before leaving/releasing. All original visible failure, exact-set start, late no-start/no-pullback and leave-return no-replay assertions remain unchanged. An inherited T13 failure corrected by this route repair is a harness fix, not a product fix. |

The four earlier fixture repairs pass syntax and diff checks. On the same immutable first final artifact, Relief now passes; bundled listening reaches the original exact-one-item check and then aborts later on the native return/Today path. That second failure is retained for the production motion repair and final rerun. No broad transition-completion waits are added to raw pointer/reader regressions.

With these scoped fixture changes, the immutable first final artifact passes Experience **42/42**, Relief, and corridor doors **68/68** (including the new actual-request assertions). The corridor run explicitly pins that artifact’s existing commit and digest; a separate R4-runner attempt that expected the newer workspace HEAD correctly rejects the old artifact before behavior, and its gate failure is preserved. Receipts: `~/.dharma/bunki_review/2026-10-10/r5-strict/verify/fixture-repairs/` and `verify/doors-fixture-pinned/`. The full language census remains for the clean final rerun.

No G6 geometry pin is changed. Production popup repair `4b9ae1af` reserves the actual measured expanded sentence pane before the word’s initial seat; the word retains its own boundary before the token anchor. A fitting sentence keeps its exact saved top and return focus; genuine overflow uses the natural full-page flow with no inner popup scroll. The six original G6 case bodies/assertions pass unchanged in the scoped dirty candidate, and 24 supplemental width/world/language/height cases preserve full text, actual 44-pixel controls, real hit ownership and exact article-scroll return. This is production evidence, not final clean-assembly verification; receipts are under `~/.dharma/bunki_review/2026-10-10/r5-strict/cards-tail/`.

## Round 5: exact reduced dialog crossfades (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-corridor-accessibility.mjs`, reduced sheet/scrim observation | Require all dialog animation names `none` or duration zero → require exactly one `feel-fade` for each sheet and scrim, exactly 80 ms, finite single iteration, total including delay ≤80 ms, and every keyframe property solely opacity | The strict brief explicitly requires a short opacity crossfade under reduced motion. This exact authored response replaces an obsolete cosmetic expectation. Ruby stays nonanimated, active infinite ambient animations must be zero, all three surfaces retain zero transition duration and exact auto scrolling. No modal name, focus containment/return, contrast, touch target, keyboard or other accessibility assertion is removed. |

## Round 5: final core cosmetic pins (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-corridor.mjs`, variant D field arrival | Require `.note.placeholder` present → require it absent | The strict review removes the placeholder note. The actual field, more than eight drifting words, exact shelf count and one-gesture field-to-shelf path remain required. |
| `verify-corridor.mjs`, missing approved article recording | Exact `No audio for this article yet` → exact `No recording for this article` | Actual recording absence is stated in the present. Zero play controls, exact approved Kore/Charon description and no-device-voice rejection remain required. |
| `verify-corridor.mjs`, selected reader Save control census | Measure only header buttons → include the actual `#mini-take` only when the reader header Save is hidden and its popup is open | Save belongs to the visible word popup. Require hidden header Save, visible actual popup Save, real own-center hit and ≥44 pixels; retain the original ≥7 control predicate, every viewport/size/hit/nonoverlap requirement, unselected header census and the original narrowing mutant. No count threshold is lowered. |

| `verify-reader-gloss.mjs`, default `ui=bi` chooser title | Require simultaneous Japanese title and `.en-inline` English title → require exact active English `CHOOSER_TITLE.en` and absent English duplicate (`titleEn === null`) | All three chooser fixtures use the default English query. Six actual language snapshots (three fixtures × English/Japanese) prove exact active English or Japanese and no inline duplicate; every other original predicate remains true. Exact candidate identities/order, native buttons, no auto-open, selected senses, held/disabled Save, visible reason, Back/focus and all five controls/kills/witness assertions remain unchanged. Evidence: `~/.dharma/bunki_review/2026-10-10/r5-strict/reader-gloss-diagnostic/choosers.json`. |

## Round 5: bundled Close observes its exact destination (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-bundled-listening.mjs`, finite-review Close before reopening the saved practice | Start the existing Shelf return helper immediately after pressing Back to Today → observe `document.body.dataset.view === 'tray'` first | The passive final-v2 trace records Close at 2002 ms, its Today arrival at 2038 ms, then stale helper reads causing actual Today Back at 2103 ms and Shelf Back at 2253 ms. The helper returns from a stale Shelf sample before that last Back reaches the door, where its following Today click times out. Waiting for the exact Close destination prevents those unintended extra Back presses. All twelve helper iterations, existing user clicks, exact-one-item count, cue/source identities, finite grade and durable-record assertions remain unchanged. This is neither a native-transition-finished wait nor a generic delay. Raw evidence: `~/.dharma/bunki_review/2026-10-10/r5-strict/bundled-navigation-final-v2/chromium-1440/navigation-trace.json`. |

## Round 5: exact Save visibility measurement (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-corridor.mjs`, relocated Save ownership guard | Assume default `checkVisibility()` rejects `visibility:hidden` → explicitly require header Save computed visibility `hidden`, and require popup Save `checkVisibility({ visibilityProperty: true })` | Default browser `checkVisibility()` does not test CSS visibility unless requested. The final-v3 trace has seven/eight actual controls, all original 44-pixel, own-center reach and nonoverlap checks passing, but this new guard falsely reads the reserved hidden header box as visible. This corrects the measurement API without changing the requirement: hidden header Save, visible actual popup Save, original ≥7 census, all size/viewport/hit/nonoverlap predicates and narrowing mutant remain required. |

## Round 5: inherited PR77 active-English label pins (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `verify-pr77-ports.mjs`, human-review marker, rights-review marker and approved negative control | Test Japanese `未確認` while explicitly opening `ui=bi` → test exact English `Unreviewed` in all three predicates | Actual final-v3 snapshots show Unreviewed on the two pending articles and no such marker on the approved Bunki article. The human-review explanation, exact rights/terms explanation, rejection of the unrelated archive-freeze story, and approved no-pending-note negative control remain unchanged. Correcting this inherited language pin is a verifier fix, not a production fix. |
| `verify-pr77-ports.mjs`, four Kanji-finder chip groups in `ui=bi` | Click Japanese 画数/部首/頻度/漢検 labels → click their exact rendered English by strokes/by radical/by frequency/by level | Each actual second chip is still clicked through its unchanged `data-kdx-st/rad/freq/kk` selector. All four groups must still contain exactly one `aria-pressed=true`, with no missing/invalid pressed states. The original four-group census and all chip/focus assertions remain unchanged. Actual label/state evidence: `~/.dharma/bunki_review/2026-10-10/r5-strict/pr77-language-final-v3/labels.json`. |

## Round 5: recovered gate label pins (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/verify-skip-ui.mjs`, exact ten-lens label array | Final label `by KKLD number` → exact active-English `Kodansha number` | Recover the plain label already present in production. The array still requires all ten lenses in their original order, the exact Kanji finder heading, actual shape-lens entry, canonical query/result counts, wheel/keyboard geometry, alternate ordering, entry return, capture and learner-record assertions. No lens or behavior check is removed. |
| `prototypes/corridor/tools/verify-assessment-written-section.mjs`, `dojoPracticeLabel` written branch | `${machineWritten} written tests · awaiting review` → `${machineWritten} written tests · not yet checked by a person` | Recover the actual human-check description. The existing fixture is active English; the production Japanese equivalent is `筆記テスト ${machineWritten}組 · 人の確認前`. The exact ready-written count, fallback practice-set count/grammar, destination heading, admitted pack identities and all original delivery/form/answer/assistance/storage assertions remain unchanged. Narrow verification covers the public-catalog/Dojo-label case and a separate real EN/JA door observation on the pinned temporary artifact. |
| `prototypes/corridor/tools/test-approved-voice.mjs`, checked-in article absence and answer-card absence | `No audio for this article yet` / `この記事の音声はまだない` → `No recording for this article` / `この記事の収録音声はありません`; promised Kore copy → `No Kore recording` / `Kore の収録音声はありません` | Recover present-tense recording absence in both active languages. Exact pending status, approved Kore/Charon accessible description, no listen controls, no doomed narration fetch, zero interim media/device-voice calls, unchanged saved preferences and zero storage writes remain required. |
| `prototypes/corridor/tools/test-approved-voice.mjs`, absent-word fixture matrix and test description | Promised Kore/Charon copy → exact `No Kore recording`, `Kore の収録音声はありません`, and `No Charon recording`; “voice being prepared” description → “absent recording” | The same preference/language cases still require matching visible note and button title, exact `not-recorded` state, and zero media/device-voice calls. The no-manifest branch still requires `This build has no recorded voices` and `no-recordings`; approved/rejected manifest identities, replay/failure cleanup and all other behavior tests are unchanged. These VM contract tests observe the recovered actual source; simulated approved fixtures do not establish actual recording availability or voice quality. |

The recovery run is scoped to the pre-existing temporary `gate-fonts/site-b` artifact, with its exact digest and `sourceDirty=true` receipt. It makes no clean new-HEAD or final-publication claim. Runtime outputs are under `~/.dharma/bunki_review/2026-10-10/r5-strict/verify/gate-pins-v5`; the later final frozen artifact must be verified separately.

Recovery verification: the temporary-artifact SKIP tour passes all 58 checks (16.73 seconds); the actual-source approved-voice contracts pass 11/11. The written public-catalog case stops before the repaired label predicate because its initial 320-pixel Shelf fixture presses hidden `#chrome-dojo`; that route failure is preserved in `logs/assessment-dojo-label.log` and its failure screenshot. An independent real 320-pixel EN/JA Learn-door observation passes the exact `26 written tests · not yet checked by a person` / `筆記テスト 26組 · 人の確認前` labels and zero overflow (`dojo-bilingual.json` plus two stills). This does not mark the aborted written-case journey as passed.

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/verify-assessment-written-section.mjs`, initial actor in `public-catalog-and-dojo-practice-labels` | Click hidden `#chrome-dojo` from the 320-pixel Shelf → click the actual visible `#tab-learn` | The Learn header duplicates the existing Learn tab and is hidden on this actual Shelf fixture. `PRIMARY_TABS` uses `id: 'learn'`, so the generated visible owner is `#tab-learn`. Use this real control to reach the same Learn destination. This is a trusted user click; every original exact door count/label, title, destination, pack/form/delivery, geometry and learner-record assertion remains unchanged. No animation wait, synthetic dispatch, count relaxation or assertion removal is added. The failed prior consumer trace and an intermediate agent error using nonexistent `#tab-dojo` remain preserved; that wrong-ID attempt is not a product failure. |

After the visible-owner actor correction, the unchanged `public-catalog-and-dojo-practice-labels` case passes on the same pinned temporary artifact (2.98 seconds). The successful receipt is `assessment-visible-learn-tab-result.json` and its independent case artifacts are under `evidence/assessment-visible-learn-tab`; both earlier abort receipts remain intact. This narrow pass does not claim the entire written-section suite or the later clean final artifact passed.

## Round 5: recovered synchronous navigation dependency (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/test-navigation-returns.mjs`, actual-function VM fixture | Load `roomTransition` without its new helper → also extract and load the actual `withoutRoomTransition` function | The production Retry repair factors the synchronous branch into this helper. The v5 fixture failed two cases with a ReferenceError before their behavioral assertions. Loading the actual dependency preserves all four tests, exact caller identity, selected token, storage-root references, replaced-epoch/session rejection, abandoned-collection retirement and reversible-return assertions. It adds no fake transition, weaker predicate, wait or removed assertion. The failed v5 receipt remains preserved. |

## Round 5: gate review repairs R5-14 and R5-16 (2026-10-10)

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs`, both Focus dimming pins (the new passage card and the longest passage `km-298-m02`) | `opacity < 1` → `opacity <= 0.8` | R5-14. The earlier entry above called `< 1` "visibly dimmed"; that was too loose, since it passes at 0.99. Both pins now enforce the shipped 0.8 attenuation. The text and ruby contrast floors, mask rejection and every other predicate are unchanged. |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs`, `REACH` token selection | Centre in the viewport band plus the ancestor overflow-clipping exclusion → the pre-R5 selection exactly (one client rectangle, centre between 80px and the grade bar) | R5-16. The clipping exclusion removed sampled centres and so weakened the check. The cap of 12, the minimum of five and the ±21px `elementFromPoint` ownership assertions are unchanged. The existing `RESTING` wait before the sample is kept. |

Result of the restored `REACH` on the repaired gate build (`sourceDirty: true`, on `0612ef26`): it FAILS, 12 sampled, 9 misses (世 ↑↓, 時代 ↑↓, フランス ↑↓, 重なる ↑, 戦争 ↑, 特に ↑). The product geometry is not repaired in this round, so R5-16 stays open: the collapsed Focus group clips these words, and the fix belongs in the player's fold geometry, not in this fixture. In the same run check "5) at the resting position after the reveal no fold row is cut by the pinned bar" also failed; the machine was running a build and a second browser probe at the time, and its cause is not established. 156 other checks passed. Log: `~/.dharma/bunki_review/2026-10-10/r5-strict/gate-room-repair-v8/fix-095146/logs/verify-kotoba-mine.log`.

R5-12 is a production fix with no verifier pin changed. Its probe samples main and child opacity every frame for at least 1200 ms after arrival, for Read→Me, Me→Today and Today→Learn, in normal and reduced motion, with and without `document.startViewTransition`: 12/12 with zero resets on the repaired build (`~/.dharma/bunki_review/2026-10-10/r5-strict/gate-room-repair-v8/fix-095146/room-continuity-after-2.json`). The first repair attempt, which retired the markers only when the arrival mask was removed, still failed Read→Me in normal motion (2/12), because the mask deferred the Me book's own entrance; that receipt is kept as `room-continuity-after.json`.

## Round 5: resolve the failures exposed by the restored pins

No assertion, sample, wait, threshold or selector changed in this follow-up. The
original viewport-centre `REACH`, minimum of five, exact ±21px ownership, both
0.8 Focus ceilings and the complete resting-position predicates remain intact.

The nine misses above were reproduced in **Full**, not collapsed Focus: words
above the internal passage clip still had glyph rectangles below the header.
The reading window now seats below the chrome; settling protects the actual
target sentence, or its marked word when the sentence cannot fit. The page can
clear a fold row without lowering the clip onto those hidden rectangles. The
window, text, target, inner scrolling and two-line Focus groups remain. The
read-only five-case and exact gate-fixture demonstrations retain every original
predicate and trusted marked-word lookup/return. They are under
`~/.dharma/bunki_review/2026-10-10/r5-strict/kotoba-restored-reach-diagnosis/`.

The resting-position failure also exposed a separate reproducible race: late
token loading replaced the sentence without restoring its reading window. The
real word/definition bottoms moved from 588/627px to 1371/1411px under a 640px
bar. `upgradeTaps` now restores the same revealed card's window and reading seat.
The actual public-interface regression holds only the unchanged token response:
it fails on the previous build and passes after the repair, with word/definition
still at 588/627px and unchanged text, card and ledger. Receipts are in
`~/.dharma/bunki_review/2026-10-10/r5-strict/late-token-repair-v9/`.

After these production repairs the complete, restored `verify-kotoba-mine`
passes (exit 0, 84s); the preserved dirty-source candidate receipt is
`~/.dharma/bunki_review/2026-10-10/r5-strict/verify/card-seat-v10/`. This supersedes
the claim above that the geometry was not repaired. The original two failures
and all intermediate unsuccessful demonstrations remain preserved. A new clean
build and full verifier run follow; this narrow receipt is not their substitute.

## Round 5: plain Undo label and bundled-glyph miss

The settled v7 and fresh c14 response receipts exposed a missed hard rule: the
Undo label's U+21B6 arrow was drawn by native Apple SD Gothic Neo, even with the
font set loaded (13 prior samples; 17 fresh samples). A declared unicode range
in bundled Noto Serif did not prove that its actual cmap contained this glyph;
a real isolated-span probe still used the native face. Earlier settled world
and 52-state font probes did not cover this revealed Undo state. Their zero
native counts remain bounded observations, not proof of every control.

Production now uses plain `ひとつ戻す` / `Undo last answer` in both actual Undo
consumers. The button ID, callback and scheduling behavior remain. It also has
44px minimum dimensions: the live diagnostic exposed a 41.59375px height.
Removing the decorative symbol keeps every remaining EN/JA label glyph in the
existing bundled Noto Sans JP. No font bytes, fallback guess or substitute asset
is introduced.

| File / assertion | Before → after | Why / retained requirements |
| --- | --- | --- |
| `prototypes/corridor/tools/verify-kotoba-mine.mjs`, F37 description and two comments | “keeps ↶ ひとつ戻す” → “keeps ひとつ戻す” | Cosmetic description only, matching the actual plain label. The expression is exactly unchanged: one Undo, Recall rate still present, restored count 2/2 and exactly one remaining log. No selector, wait, threshold or behavior predicate changed. |

Runtime proof is under `cards-final-v11/responses/undo-plain-label-diagnostic.json`:
four trusted EN/JA grade/remove Undo actions restore the exact prior card and
ledger and leave zero native glyphs. This diagnostic changes only live text;
the following candidate and clean-source checks verify production separately.

The additional min44-only diagnostic exposed a real removal-state occlusion:
Undo was below the sticky Reveal button and, at 320, also below the tabs. That
failed receipt remains. The mobile front now seats Undo above Reveal with the
existing 16px gap, only where that actual direct-child Reveal exists. The live
docked diagnostic passes all40 real centre/corner clicks across EN/JA ×320/390
×grade/remove, at scrollY0, with exact card/ledger restoration and zero native
glyphs/overflow. It retains the running reduced-motion fades. Actual candidate
and final clean-source receipts follow separately; CSS minimum size alone is
not treated as evidence of a working target.

Production candidate verification: `undo-production-v12/summary.json` reports
40/40 owned points, trusted callbacks and exact card/ledger restorations at
scrollY0; minimum actual height44px, gap16px, native glyphs0, overflow0. The
runner performs no text or CSS injection. Candidate source is c14 dirty,
source/assets `4d0609348043656cd46317f44d3b99c87e852a6c21c300c0a3ddd36fb6691cdd`,
artifact `c9bf8817b4f74c6c109f20048b2acb60311ab347e58435d8406c03b91743747e`.
The complete restored Kotoba suite passes84s on that candidate. Both earlier
min44-only and first plain-label candidate receipts remain; the final clean
build must pass independently.
