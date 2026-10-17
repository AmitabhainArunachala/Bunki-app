# The voice lock, and how audio is made under it

Slice V, 2026-10-17. This page describes the lock. The lock itself is `prototypes/corridor/audio/voice-lock.json`.

## The lock
- **What it holds:** `audio/voice-lock.json` is the one value.
  - provider and endpoint;
  - `render.model`: `gemini-3.8-flash-tts`, the lead's decision on John's "for now just anything decent and we can swap later";
  - the voices: **Kore** is the main voice (narrator, word, example); **Charon** is the second voice, for `speaker-b` only;
  - the role law;
  - a separate, unapproved `live` slot for the speaking room.
- **Who reads it:** `tools/voice-lock.mjs` is its only reader. `tools/sync-voice-lock.mjs --check|--write` carries it into the generated `VOICE_LOCK` block in corridor.js. Nothing else in the tree names a model or a voice.
- **Second voice:** Charon is never a fallback. A missing clip is visibly missing; it is never device speech and never another speaker.

## Temporary scope: dialogues are single-voice
- **Which pieces:** the shelf holds two labelled scripts.
  - `bunki-read-n3-honda-quarter`: speakers ユキ and 森;
  - `bunki-read-n3-transistor-class`: speakers 先生, ユウタ and ミサキ.
- **Until John casts their speakers**, both render **narrator-only, in Kore**. The transistor piece has three speakers, so "the second speaker" is his decision.
- **Deferred:** Charon's second-speaker production, which the brief asks for. No Charon clip is made or shipped.
- **Enforced in four places:**
  - `render-corpus.mjs articleCorpus` gives every unit the narrator role;
  - `build-voice-manifest.mjs` declares no article `kind:'dialogue'`;
  - the runtime admits a second voice only inside an article declared a dialogue;
  - `test-voice-render-job` asserts that no second-voice clip is placed.
- **To lift it:** John casts the speakers; the cut gives each line its role; the manifest declares the article a dialogue; the affected articles are re-rendered.

## Swapping the voice or model
1. Edit `audio/voice-lock.json`.
2. Run `node prototypes/corridor/tools/sync-voice-lock.mjs --write`, then commit.
3. Re-render.

Every rendered file is keyed by (model, voice, role, text hash, reading) and its bytes' digest. A swap therefore re-renders, and old audio is never relabelled.

## Rendering (paid; the lead's word only)
1. **Dry run:** `node prototypes/corridor/tools/render-corpus.mjs` is free and prints counts, characters, hours and the price at the published rate.
2. **Authorization:** the lead writes `MISSION/authorizations/V-render.json`:
   `{ "authorized": true, "by": "lead", "head_sha": "<HEAD>", "max_usd": <cap>, "john_words": "<his words>", "time": "<ISO>" }`, plus an optional `job_digest`. The job reads no other path, and never inbox prose.
   - `head_sha` must equal HEAD.
   - The checkout must have no change outside `audio/` and none to `audio/voice-lock.json`.
   - `max_usd` must cover the estimate. Every attempt, retries included, is debited before it is made.
3. **Before the first provider call**, the job writes its ledger (`~/.dharma/bunki_voice/corpus-ledger/<model>.json`) and starts the pronunciation gate (local whisper). Every sentence clip bought outside a mock run must pass that gate.
4. **Render:** `dkeys exec GEMINI_API_KEY -- node prototypes/corridor/tools/render-corpus.mjs --render --confirm`.
5. **Write the manifests:** `node prototypes/corridor/tools/build-voice-manifest.mjs --write`, then `node prototypes/corridor/tools/build-listening-cues.mjs --write`.
6. **After-render gates:**
   - `verify-voice-lock.mjs --require-complete`: coverage, and every listening cue a byte copy of its narration twin;
   - `verify-narration-media.mjs`: real playback in both engines.

## The checks
- **Every run:**
  - `verify-voice-lock`: lock, mirror, manifests against disk, both cue validators executed on 1,388 staged cues;
  - `test-approved-voice`, `test-excerpt-narration`;
  - `adjudicate-voice-mutants`: 12 laws.
- **Before any spend:**
  - `test-voice-render-job`;
  - `adjudicate-render-job-mutants`: 17 laws.
- **In the battery:** `narration-media`, with `KAIRO_BROWSER=all`.
