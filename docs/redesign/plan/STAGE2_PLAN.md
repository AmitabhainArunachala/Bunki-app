# Bunki redesign: overnight plan (lead: Claude; the whole estate)

**North star:** `vision/VISION.md` (holistic; his brief is the core) and `vision/JOHN_10-08_VERBATIM.md` (his words; message 9 is THE BAR).

**Never:** merge to main, deploy, force-push, weaken a behavioural verifier, or touch the storage markers, card ids or ledger keys.

## Lanes
| Lane | Who | Where | Owns |
|---|---|---|---|
| Vision | Claude workflow wf_a643fb52-423 (11 agents) | `redesign/vision/` | VISION.md, VISION-ONE-PAGE.md |
| Concepts | Claude workflow wf_c4c6c1b5-32e (relaunched after the vision, with VISION.md as its frame) | `redesign/concept-*/` | 4 concepts (3 evolutions + 白紙 from scratch); SPEC.md, motion.webm and motion-frames.png per concept; 4 judges, including THE BAR panel |
| Foundation | Codex **Sol** (gpt-6.1-sol), `briefs/SOL_FOUNDATION_BRIEF.md` | worktree `redesign_20261008`, branch `claude/redesign-20261008` | F1 baseline, F2 language law and lint, F3 tokens v2, F4 the tab-bar nav (Today · Read · Learn · Words · Me), F5 room stamps, F6 verify and draft PR |
| Content | Codex **Astra** (gpt-6-astra) | worktree `n2n1_20261007`, branch `claude/n2n1-decks-20261007` (PR #124) | top-2,000 coverage, the diversity pass to zero habits, deck rebuild |
| Card judge | DeepSeek V4 Pro (ollama) | via `process_batch.py` | every card |

## Stage 2 (after the judges, about 03:00): build the chosen evolution
1. **Choose.** Read the four judges. Pick the best EVOLUTION plus its grafts, and log why in NIGHT_LOG. Keep 白紙 (from scratch) as a full prototype for the morning comparison ("show me both").
2. **Wait for Sol's foundation** (tokens v2, tab bar, room stamps, language law) to be committed on `claude/redesign-20261008`.
3. **Modular room files, so parallel work can't collide.** Register `prototypes/corridor/rooms/{today,read,learn,words,me,cards}.css` once, in index.html, sw.js SHELL, scripts/corridor-assets.mjs, tools/build-standalone.mjs and tools/sw-shell.test.mjs. Each room lane owns its file and its render functions only.
4. **Parallel room lanes,** each a worktree branch off the redesign branch, merged in order:
   - **Read:** shelf, reader, the word popup; the woodblock pictures at their natural crop; no "coming soon".
   - **Learn:** split 集中道場 into clear sections; decks, JLPT and guided entries with live counts.
   - **Words:** the word web as a new module (word ↔ kanji ↔ components ↔ siblings ↔ passages ↔ grammar) on existing data (dict, kanji anatomy, deck tokens, gloss_ja, the grammar tables).
   - **Today and Me:** the daily loop; honest, beautiful progress.
   - **Cards:** Codex Astra, after content. The deck players (`decks/player`, `personal`, `context-dense`) in the concept's language; the zero-leak guards hold.
   - **The skin:** apply the concept's tokens to tokens v2. The front-door word sky is evolved only if the concept and VISION demand it, and gently.
5. **Integrate:** merge the room branches in order, build, and serve on 57085.
6. **Verify, in two rounds:**
   - the F1 verifier subset, verify-n2n1-decks, sw-shell, `lint-ui-language`, and storage integrity before and after;
   - every verifier change logged in `docs/redesign/VERIFIER_CHANGES.md` and audited by **Grok 4.7** (`~/.grok/bin/grok -m grok-4.7`, a different family): cosmetic or label pins only, never behaviour;
   - a 390×844 tour, day and night, EN and 日本語, every room;
   - an aesthetic review against VISION.md and THE BAR, then fixes;
   - repeat once.
7. **Ship:**
   - a draft PR "[DRAFT · DO NOT MERGE] Bunki: the 100x evolution", with before/after tours and the verifier table;
   - the 白紙 prototype linked;
   - the morning Lavish page: VISION-ONE-PAGE, the four concepts with motion frames, before → after per room, the live preview at 57085, the PR, and the open decisions;
   - delete the cron.
