# TTS voices — three styles, five candidates, a samples plan (proposal)

**For:** operator decision sheet OD-6 (RENKAN §5.4) · **Status:** PROPOSAL — the campaign can only prepare. **No voice ships without your ear, and the blinded native panel remains the release gate** (rubric §7.6; constitution §11 lists voice/listening as genuinely open).

## The three user-facing styles (rubric §7.6 — vendor names never surface)

1. **澄 Clear reader** — neutral, intelligible news and essays.
2. **語 Warm storyteller** — fiction and narrative prose.
3. **話 Conversational** — dialogue and everyday pieces.

## Candidate matrix (from the rubric; no candidate is accepted from marketing copy)

| Candidate | Intended role | Main risk |
| --- | --- | --- |
| Human native-Japanese recording | Gold anchor; canonical stories, listening tests | Cost, cadence, retake workflow |
| Google Cloud Chirp 3 HD (Japanese) | 澄 — clear article narration | Voice/model behavior can change under you |
| Azure Japanese Dragon HD / neural | 澄/語 — clear teacher and explanatory voice | Style controls unevenly supported |
| ElevenLabs + consented native-Japanese professional voice | 語 — warm fiction/dialogue | Accent, voice-rights, model drift |
| OpenAI `gpt-4o-mini-tts` | 話 — experimental dynamic conversation | Voices documented as English-optimized; never a Japanese-reading default without blind-test clearance |

## Samples plan — your blind listen (prepared by the campaign, judged by you)

Five gold-set passages from the shelf, chosen to hit the rubric's gold features
(counters, numbers, dates, names, place names, particles, loanwords, N5-N1 prose):

| # | Passage (`data/articles/`) | Level | Gold features exercised |
| --- | --- | --- | --- |
| 1 | `bunki-graded-n5-morning` | N5 | particles, daily register, short-sentence prosody |
| 2 | `bunki-graded-n4-market` | N4 | numbers, counters, prices, times/dates |
| 3 | `bunki-graded-n3-feel-jingu-forest` | N3 | place names (伊勢神宮), proper nouns |
| 4 | `bunki-essay-n2-translation` | N2 | loanwords/katakana, quoted words, meta-language |
| 5 | `bunki-essay-n1-ai` | N1 | abstract prose, polyphonic kanji, long-form consistency |

Note (honest gap): none of the five is verified to carry sustained quoted
dialogue; before synthesis, one is swapped for a dialogue-bearing passage if
inspection confirms one (`bunki-graded-n3-radio` or `bunki-graded-n4-letter` are
the candidates), so 話 gets a fair hearing.

Procedure: 5 passages × 4 neural candidates + the same 5 human-recorded as anchor
(≈ 25 clips), filenames randomized, provider identity concealed, one listening
sheet per clip (correctness / naturalness / effort / prosody / preference). Your
ear picks what proceeds to the panel. The full release gate stays the rubric's:
≥ 24 blinded native listeners, human anchor, confidence intervals, zero
meaning-changing errors in the gold set, mean naturalness ≥ 4.2/5.

## Storage and provenance schema (behind the style, per rubric §7.6)

- Per article: `surface_text` **and** editor-approved `spoken_text`, plus
  pronunciation overrides and sentence timestamps. Canonical dictionary readings
  and scored listening material may not rely on unreviewed TTS.
- Per audio asset: `{style: 澄|語|話, provider, model, voiceId, modelVersion,
  generatedAt, approval: {status, by, at}, disclosure: "human recording" | "neural voice"}`.
  The disclosure is user-visible; the vendor identity lives behind the style, so a
  provider swap is a metadata change, never a product identity change.

## Honest cost ballpark — per 1,000 Japanese characters (ESTIMATES from general knowledge, not quotes; verify before any spend)

| Provider | Est. per 1k chars | Basis (estimate) |
| --- | --- | --- |
| Human native recording | ~$5-20+ | $100-400 per finished hour; 1k chars ≈ 3 min read |
| Google Chirp 3 HD | ~$0.03 | list ~$30 per 1M chars |
| Azure neural / Dragon HD | ~$0.015-0.03 | list ~$16 per 1M chars neural; HD tier higher |
| ElevenLabs | ~$0.10-0.30 (creator tiers); ~$0.05-0.10 at volume | credit-based subscription; consented pro voice adds licence/royalty terms |
| OpenAI gpt-4o-mini-tts | ~$0.04-0.05 | token-priced, ≈ $0.015/min of audio |

Scale illustration (estimate): a ~60k-char shelf read once is roughly $2 on Chirp
vs. $300-1,200+ human — which is why the human voice is the **anchor and the
canonical-story voice**, not the whole-catalog default; and why every generated
asset is cached, versioned, and downloaded, never re-synthesized per play.

## What the campaign does on each answer

- **SAMPLES:** synthesize the 5-passage set per candidate (est. total < $5 in API
  cost + the human-anchor recording arrangement), commit clips + provenance +
  listening sheets to build-evidence, wire nothing into the product. Your blind
  listen then decides who reaches the panel.
- **NARROW:** same, but Google + Azure only (cheapest path to a 澄 verdict; 語/話
  candidates wait).
- **DEFER:** no synthesis; the schema above still lands as data design so the
  reader's audio surfaces stay honestly empty rather than absent.

**Decision requested:** SAMPLES (recommended) · NARROW · DEFER
