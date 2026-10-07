# Baton → Codex Astra (gpt-6-astra) and Codex Sol (gpt-6.1-sol): finish the N2/N1 decks

From the Claude lead, 2026-10-07 ~06:10 JST. John's Claude credits are nearly exhausted; the Claude writers are stopped. **You two finish the job.**

## The goal
John's words, 2026-10-07:
> "the highest quality cards possible, rich, real Japanese that is very natural sounding, compounds, fascinating topics, written in a variety of styles … JLPT 1 and 2 word lists, kanji and grammar points … cards that reinforce themselves in a variety of different ways and contexts and forms."

- Target for now: **about 2,000 cards.**
- The plan, with the definition of done: `~/.claude/plans/wild-cooking-wigderson.md`.
- The learner's vision: `docs/srs/LEARNER_VISION_2026-10-04.md`.
- **Report progress only as "cards live on your phone: X of 2,000."** Plans and docs never count.

## Where things are
**Worktree:** `~/worktrees/Bunki-app/n2n1_20261007`, branch `claude/n2n1-decks-20261007`, draft PR #124. Python with fugashi: `~/.dharma/bunki_review/2026-10-05/gates/venv312/bin/python` (below, `$PY`).

**Judged, accepted cards:** `decks/n2n1/source/cards/*.json`. That's about 1,430 so far, plus whatever the DeepSeek judge runs started at ~06:00 add. Those runs cover wf-032..039; their logs are at `~/.dharma/bunki_review/2026-10-07/n2n1/judge-wf-0*.log`.

**Not yet judged:** on branches `origin/claude/n2n1-remote-{a,b,c,d,e}`, under `decks/n2n1/source/cards-unjudged/<batch>.json` and `drafts/<batch>-draft.json`. They passed the mechanical check only.

**Inputs:**
- `decks/n2n1/source/targets.json`: 7,431 ranked words.
- `decks/n2n1/source/batches/wf-001..039.json`: the top 1,932 not yet written, 50 per batch, each with register, preferTopic, deck, field and a `weave` list.
- `decks/n2n1/source/grammar-n2n1.txt`: 141 N2/N1 patterns.

**Prompts:** `decks/n2n1/prompts/writer.md` (rules plus the card JSON schema; follow it exactly) and `judge.md`.

**Tools** (all in `decks/n2n1/tools/`):
- `check_cards.py FILE`: the mechanical rules. 4–5 sentences, 180–300 characters, the target exactly once, the English with the same sentence count, defJa/tipJa/sense limits.
- `process_batch.py BATCH [--rewrite]`: reads `drafts/BATCH-draft.json`, runs the mechanical check and the **DeepSeek V4 Pro judge** (ollama cloud, `deepseek-v4-pro:cloud`, a different family from the writer), and writes accepted cards to `source/cards/` and failures to `drafts/BATCH-fix.json`. `--rewrite` reads `drafts/BATCH-rewrite.json` and runs one round; what fails again is dropped.
- `run_batches.py`: the same loop with the GLM-5.3 writer (ollama, no Claude). For example: `$PY decks/n2n1/tools/run_batches.py --pass 1 --batches 10 --lanes 8 --size 10`. It covers top targets that have no card yet.
- `build_n2n1.py [--cards DIR]`: builds `prototypes/corridor/decks/<deck>/deck.json` + `tokens.json` for the `n2`, `n1` and `senmon` decks from `source/cards/`.

## ASTRA: content (you own `decks/n2n1/source/**`)
1. **Judge everything unjudged.** For each batch on the remote branches without an accepted card file, copy `drafts/<b>-draft.json` from that branch into the worktree, then run `$PY decks/n2n1/tools/process_batch.py <b>`.
2. **Rewrite every failure once.** Write fresh cards yourself for the terms in `drafts/<b>-fix.json`, fixing each stated reason and following writer.md. Save them to `drafts/<b>-rewrite.json`, then run `process_batch.py <b> --rewrite`.
3. **Make sure each of the top 2,000 targets (by `priority`, not linked) has at least one accepted card.** For any that don't, write cards in writer.md's format (you, or `run_batches.py`), then process them.
   - A word with two accepted passages keeps both; they become passage 1 and 2.
   - Spot-read 20 cards yourself for naturalness and variety.
4. **Commit as you go** (the global git identity is a placeholder; don't change it), and push the branch after every few batches.

## SOL: build and wire up (you own the deck outputs and the app wiring)
1. **Build** with `$PY decks/n2n1/tools/build_n2n1.py` once Astra has pushed (and again at the end). Splitting decks into 600-word blocks is only needed if one goes over 15 MB.
2. **Wire the three decks** `n2` (N2・文章で覚える), `n1` (N1・文章で覚える) and `senmon` (専門・五つの分野) into:
   - `DOJO_DECKS` in `prototypes/corridor/corridor.js`. Replace the `n2n1-sample` entry, and edit **within the same line**: the corridor.js line pins must hold, and the line count must not change.
   - `scripts/corridor-assets.mjs`: the deck.json and tokens.json of each deck.
   - The `sw.js` precache: deck.json only (tokens are fetched on first use, per A52).
   - The `ci.yml` served-path list.
   - Then remove `prototypes/corridor/decks/n2n1-sample` and its asset lines.
3. **Update** the pinned 集中道場 deck-list check in `prototypes/corridor/tools/verify-kotoba-mine.mjs` to the new list.
4. **Run, and paste the outputs into the PR:**
   - `node scripts/build-corridor-site.mjs --out <dir under ~/.dharma>`;
   - `verify-kotoba-mine.mjs` against it (with `KAIRO_SITE_DIR` and `KAIRO_ARTIFACT_SHA256` set);
   - `npx vitest run tools/sw-shell.test.mjs tools/kotoba-deck-*.test.mjs`;
   - `verify-corridor-storage-integrity.mjs`;
   - a headless 390×844 tour. Open 道場 › デッキ, open each new deck, start it, reveal a card, and check the furigana, defJa and English folds. Take screenshots in 藍 and 和紙 and look at them.
5. **Serve** the build on `127.0.0.1:57072` for John: `KAIRO_SITE_DIR=… KAIRO_ARTIFACT_SHA256=… node scripts/serve-corridor-dev.mjs --port 57072`.
6. **Push** to PR #124 and update its body with the counts. **Do NOT merge.** Merging is John's.

## Hard rules
- No merges to main, no force-pushes, no history rewrites, no bare `git stash`.
- Never touch these: `data/fsrs-pin.json`, the engine unlock constants, existing card ids or Anki ids, the `bunki-cloze:*` keys, the corridor.js storage-ledger line pins.
- Leave PR #123 (the CI rebuild) and #122 alone.
- Never shell-read `~/.dharma/agent_keys.env`.

**The deploy is still blocked.** Every 3-hour battery run fails on one random WebKit flake (`~/.dharma/bunki_review/2026-10-06/ci/FLAKES-OBSERVED.md`). PR #123 is the fix, and John merges it. So "live on his phone" waits on that. Say so honestly.

## Lead's quality notes (2026-10-07, after 1,856 cards)
- **Grammar endings:** 「〜にほかならない」 closes 28 cards. Cap any one pattern at about 1 in 100. Rotate through grammar-n2n1.txt instead of reaching for the same few.
- **The 語 register:** it keeps the 「発表で〜を扱うときは」 presentation-tips frame. Vary it: editing a sentence, choosing a word, explaining a nuance to a friend, a translator's dilemma.
- **The `other` topic was never used.** Give roughly 1 in 8 of the remaining cards a wider-interest subject (science, art, food, nature, cities, craftsmanship).
- **Remaining work:** the 137 of the top 2,000 without a card get the notes above.
