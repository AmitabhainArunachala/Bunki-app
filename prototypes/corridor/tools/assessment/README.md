# Assessment bank authoring

The learner catalog is `data/assessment/catalog.json`. A catalog entry describes an actual authored form; a target of five full forms per level is a goal, not five available tests. An entry becomes available only when its native `FormVersion`, any required media, rights, and independent editorial review are complete.

The N2 inputs are separate forms:

| Mode   | Scored questions | Written time |      Listening time |
| ------ | ---------------: | -----------: | ------------------: |
| Short  |               16 |   15 minutes |           5 minutes |
| Medium |               40 |   45 minutes |          15 minutes |
| Full 1 |              107 |  105 minutes | authored 53 minutes |

Short and medium do not draw questions or passages from the full form. Counts are Bunki's authoring allocations. They are not universal official item counts, official scaled scores, or a calibrated prediction of passing. The revised full form has 32 vocabulary, 22 grammar, 21 reading and 32 listening items across 19 task families. Its allocation follows the inspected 2018 official workbook and the official guidebook's approximate-count table (physical page 8, printed page 7). Reading includes five short passages, three mid passages, one pair of integrated texts, one thematic passage and one information source. Its listening allocation is 5 task, 6 point, 5 gist, 12 response and 4 integrated questions. Its final two listening questions share one stimulus. Four original worked examples and an integrated-task introduction are unscored.

`authoring/n2-full-01` preserves copies of the earlier 96-question original AI draft. `origin.json` records the copied source byte hashes. The originals under `~/.dharma/bunki_audit/2026-09-10/` are never edited or executed. `intent.json` is an editable authoring input, not an admitted full test. The historical 100-question revision and its reviews remain archived. `apply-written-revision.mjs` adds original material to reach the source-backed 107-item allocation, removing one overlapping thematic question and preserving every listening artifact. Its exact new form and presentation require fresh independent review; raw provenance is never an editorial pass.

## Build and verify

```sh
node prototypes/corridor/tools/build-assessment-bank.mjs
node prototypes/corridor/tools/verify-assessment-bank.mjs
```

The builder emits native written review candidates under `~/.dharma/bunki_assessment/2026-09-23/bank-candidates/`. These are useful for early editorial findings. A written candidate's approval cannot approve the eventual full form: adding audio and canonical learning targets changes the exact form hash. A per-form `candidate-status.json` identifies the currently materialized hash or missing audio; older evidence files must not be mistaken for the current candidate. `prepare-originals.mjs` creates the initial short/medium inputs and refuses to overwrite a later listening revision.

### Exact reviewed written section

One separately admitted entry is **N2 written practice · 12 questions**: four vocabulary, four grammar and four reading questions, with a 15-minute authored timer and no listening. It retains the reviewed form ID `kairo-original-jlpt-n2-short-01:written-review` and hash `56d6ea3b6024cd04447a72c36640ee99c672808d93bcd22f7ccdb4c1e2c198a2`. Its questions are the written portion of the pending short mock; `sharesQuestionsWith` makes that overlap explicit. This entry is not an independently distinct mock, a full test, or a calibrated JLPT score.

`publish-reviewed-written-practice.mjs` preserves the exact reviewed form file bytes and verifies saved provider runtime evidence through the current host collector, without model calls. Pass the immutable form, host policy and original runtime directory; output evidence must be under `~/.dharma`. The default is a dry run. Add `--publish` only when admission is authorized.

```sh
node prototypes/corridor/tools/publish-reviewed-written-practice.mjs \
  --form "$FORM" --config "$POLICY" --runs "$RUNS" \
  --evidence "$EVIDENCE"
```

The narrow path checks the exact admitted profile, original-content rights for every artifact, fresh host verification, empty review problems and rejected-runtime lists, and strict absence of listening or media. Its generated delivery has only `schema`, the exact `form` reference, empty `assets`, and empty `units`. Only this media-free case permits the saved review's null presentation hash. There is no corresponding relaxation for native mocks. Transport filenames omit the colon in the immutable form ID. The existing short, medium and full catalog entries remain unchanged; a later native build retains the separately admitted section.

The normal bank verifier exercises this packaging and its rejection paths using isolated fixtures, and validates the public artifact without requiring personal runtime files in CI. Re-admission still requires the actual saved host evidence; fixture checks never supply product approval.

Audio inputs are external manifests, passed with repeatable `--audio-manifest path.json` arguments:

```json
{
  "schema": "kairo-assessment-audio-render/1",
  "assets": [
    {
      "id": "opaque-audio-id",
      "scriptId": "exact authoring unit ID",
      "itemIds": ["exact linked item ID"],
      "path": "rendered/file.wav",
      "bytesSha256": "64 hexadecimal digits",
      "durationMs": 42000,
      "mimeType": "audio/wav",
      "voiceIds": ["configured voice identity"],
      "rightsBasisRef": "configured voice license evidence",
      "sourceTranscriptSha256": "exact audio script transcript hash",
      "sourceVoiceRolesSha256": "SHA-256 of compact JSON voiceRoles with sorted keys"
    }
  ]
}
```

Paths are relative to that manifest. Traversal and symlink escapes fail. The builder checks file hashes, linked items, transcript and voice-role hashes, actual audio decoding and measured duration with `ffprobe`. Per-unit voice roles preserve gender references in questions; a global female speaker-a default is incorrect for several preserved full-form scripts. A valid audio file does not establish intelligibility or pronunciation; actual listening review remains required. Do not use placeholder or silent fixtures as product audio.

Every listening block must accommodate all its delivered audio, including instructions and examples. A shared stimulus counts once. When `listeningTiming` declares a recording length, scheduled deadline and startup/transition allowance, those values must reconcile with measured media and the authored block; the allowance cannot push playback beyond the deadline.

`buildAssessmentBank({ reviewForm })` calls the configured host editorial workflow with `(form, delivery)`. It does not accept a bank's own claim of authority or a CLI flag to trust a JSON approval. Only an eligible review pinned to both the exact form and delivery presentation allows publication. Form, delivery, review and audio paths are immutable and content-addressed. Catalog `formSha256` and `editorialAtStart` pin the admitted version; `deliverySha256` is the repository's `encodeLocalJson(delivery).sha256`. `deliveryPath` contains media mappings and shared stimulus groups. Each unit has `kind: "example" | "question"`; an example is the first media reference on its linked scored item, with no additional score entry. The learner interface must hide the scored prompt/options during it. Spoken-only choices and transcripts stay hidden during scored audio.

Previously admitted catalog entries move to `archivedEntries` when replaced. Their immutable files remain available for saved attempts and received learning cards. Resolve those artifacts by exact form ID and SHA across current and archived entries; never replace an old card's source with the latest form.

Canonical dictionary or grammar identities are incorporated into the final item's `subjects` before its hash is calculated. Only the tested target is mapped. An unresolved target remains available for the app's assessment-card follow-up; distractors are never automatically enrolled.

## Sources and personal study

`data/assessment/sources.json` records actual primary-page fetch hashes and URLs. The official workbooks contain questions selected from real JLPT tests. Their official index identifies third-party reading texts and recordings; being available on the web is not a public redistribution grant. The app links to the official site rather than embedding it.

The same registry contains the rendered-audio rights-basis ledger and visible Ami/JVNV model credits. The Ami voice has custom terms; the JVNV model is CC BY-SA 4.0. Their separate primary terms, pinned model revisions and actual fetch hashes remain explicit. No local model paths or model files belong in the public bank.

The importer accepts bounded local PDF, HTML, image, audio, or JSON answer-key inputs. Network fetching is limited to registered primary publishers, HTTPS, no credential-bearing URLs and no redirects. Its default store is `~/.dharma/bunki_assessment/private-sources/`. It refuses a repository source store. Even public-permission inputs remain private until separate item mapping and release checks are complete.

```sh
node prototypes/corridor/tools/import-assessment-source.mjs --request private-request.json
node prototypes/corridor/tools/assessment/extract-source.mjs --receipt private-receipt.json
```

A request includes `id`, `title`, `edition`, `location`, `kind`, `distribution`, `rightsBasis`, and exactly one of `url` or `file`. `expectedSha256` can pin a known source. `distribution: "public"` additionally requires explicit redistribution-grant evidence; a license label alone is insufficient. Immutable originals, receipts and extracted PDF pages stay in the private store. Mechanical extraction does not prove question boundaries, visual fidelity, answer mapping, or editorial quality.

## Expand the original bank

`prepare-authoring-jobs.mjs` creates bounded task batches. `author-batches.py` calls the existing Dharma model registry and runtime provider factory. It writes prompts, responses and actual model identity under `~/.dharma`; it never edits application files. Incomplete or malformed output is retained as a failure; by default it stops the run. `--continue-on-failure` finishes other bounded jobs without admitting partial output. A fresh run may reuse only identical, hash-verified completed jobs through `--resume-from`, and `--repair-from` supplies rejected candidate data as correction context.

`apply-listening-revision.mjs` verifies the exact baseline, jobs, actual runtime identities and response hashes before replacing stimulus text. It preserves the 96-question baseline, applies explicit editorial patches and assembles the 100-question revision only after all jobs are present. Character budgets guide authoring; final pacing must be measured from real audio. The privately imported official 2018 N2 recordings total about 51m26 including instructions/examples, despite a nominal 50-minute section. Authored audio must not be padded with silence to hit an exact duration.

`assemble-author-batches.mjs` checks runtime evidence, task allocations, item counts and original-form separation before importing a completed authored form into `authoring/`. New content remains unavailable until media and independent review pass. The author model family is recorded and cannot serve as an independent reviewer of its own form. No option shuffling counts as a new form.

The original N2-only 92-batch run is superseded by the expanded manifest: 720 bounded jobs cover 24 further full forms, including 120 jobs for N2 forms 2–5. Each level has its own task allocation and length constraints; the N2 task list is not relabeled N1, N3, N4 or N5.

That private queue was prepared before the full allocation audit. Its draft packets require source-backed allocation reconciliation before native admission: N2 needs the 107-item allocation above, and current N1/N4/N5 references supersede historical counts in affected sections. Completed authoring batches remain usable material; a mechanically complete packet is not evidence of current exam coverage.

The final N2 full recording lasts 51m44.847s. Its authored listening deadline is 53 minutes (recording plus a bounded 60-second transition allowance, rounded up); total written and listening time is 158 minutes. The official approximately 50-minute duration remains a nominal reference. The v1 nominal-listening blueprint binding permits actual recording variation. Final playback assets are content-addressed MP3 derivatives with preserved source-WAV receipts.

`prepare-expanded-bank-jobs.mjs` prepares level-specific private manuscripts for those 24 full forms. `run-expanded-bank.py` runs one subscribed GLM request at a time for at most three passes and stops on quota/rate-limit responses or three consecutive transport failures. `collect-authoring-packets.mjs` writes complete, hash-pinned private manuscripts; no runtime catalog is changed. N3–N5 verbal-expression items include mandatory original illustration briefs, which must be rendered and visually inspected before native admission. A brief never substitutes for a real image.

`complete-spoken-questions.py` supports one narrow host authoring correction: copying an already-written integrated question into an omitted spoken-question field. It preserves all original provider bytes, records the exact two-sided edits and host coauthor, then reruns mechanical validation. The collector reconstructs the patched response from that evidence. The resulting manuscript is still unreviewed, and this correction never consumes an additional provider retry or confers release approval.
