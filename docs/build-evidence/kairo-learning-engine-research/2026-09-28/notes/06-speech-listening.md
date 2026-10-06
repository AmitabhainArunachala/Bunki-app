# Track 06 — Japanese speech and listening

Research cutoff and access date: **2026-09-28**. Documentation publication dates are **undated** unless specified in the source register. Prices are USD before tax. **DESIGN** is a proposed implementation; **ESTIMATE** is scenario arithmetic, not an observed bill; **UNVERIFIED** is unresolved. Provider quality claims are not learner efficacy evidence. All remote personalized speech processing remains conditional: the owner's export-only egress law permits a deliberate export file, not live microphone or text transmission.

## Takeaway

**DESIGN:** Start with on-device recording, replay, transcript confirmation, dictation and human-recorded listening; use a local Whisper runtime or supported Apple on-device transcription. Keep pronunciation hypotheses separate from measured recall. Add pitch contours as an optional visualization with an explicit uncertainty label, not a native-speaker grade. Choose a cloud benchmark winner only after a rights-cleared Japanese learner-speech evaluation and only for a manually exported file workflow unless the owner changes the egress law.

There is an important difference between recognizing intended words and detecting what a learner actually pronounced. A specialist Japanese assessment paper reduced mora-label error from **12.3% to 7.1%** on CSJ core evaluation sets, an absolute **5.2 percentage-point** and derived **42.3% relative** reduction; it is a recognizer benchmark, not a language-learning intervention. [S20]

## Cited findings

### ASR inventory

| Tool | Verified mechanics / Japanese support | Cost and license | Bunki decision — DESIGN |
|---|---|---|---|
| Open-source Whisper | Multilingual transcription; models include tiny/base/small/medium/large/turbo. `.en` variants are English-only. [S01] | Code and weights MIT; provider fee **$0** for local inference, hardware/energy unmeasured. [S01] | Evaluate multilingual base/small first, not English-only weights. Transcript is a hypothesis. |
| whisper.cpp | C/C++ runtime supports CPU, Apple Metal/Core ML, iOS, Android and WebAssembly; quantization supported. [S02] | MIT runtime; preserve upstream notices. [S02] | Preferred portable local ASR candidate, pinned model/runtime hashes and device benchmarks before release. |
| Faster Whisper | CTranslate2-based Whisper implementation; batching and quantization are implementation choices. [S32] | MIT code; model license separate. [S32] | Desktop/offline benchmark alternative; browser/native feasibility must be tested rather than assumed. |
| ReazonSpeech | Project provides Japanese ASR code/models; repository Apache-2.0. [S03] | **$0** software fee; particular weights/corpus redistribution rights must be checked separately. [S03] | Desktop local benchmark candidate; do not treat repository license as blanket redistribution permission for broadcast training audio. |
| kotoba-whisper-v2.0 | Japanese distilled Whisper; 756M parameters. Model card reports relative speed 6.3× vs large-v3 by reference to distil architecture, not a Bunki phone measurement. [S04] | Apache-2.0 model card; **$0** local provider fee. [S04] | Optional desktop/high-memory pack, after actual device tests. Japanese learner accuracy **UNVERIFIED**. |
| Google Speech-to-Text | Chirp 3 is V2; supported-language/region table includes Japanese capabilities. [S05] | V2 first-tier standard **$0.016/min**, dynamic batch **$0.003/min**, billed in 1-second increments; channel count matters. [S06] | Export-file benchmark option. Dynamic batch cannot support an interactive voice loop. |
| Deepgram | Nova-3 supports `ja`; multilingual routing also includes Japanese. [S07] | PAYG Nova-3 monolingual streaming **$0.0048/min promotional**, crossed-out regular **$0.0077**; prerecorded **$0.0043/min**. Multilingual streaming **$0.0058** promotional / **$0.0092** regular; prerecorded **$0.0052**. [S08] | Conditional live candidate if law changes. Freeze quote and selected model; avoid claiming promotional rate permanence. |
| Azure Speech | Japanese STT and pronunciation-assessment locale listed. [S09] | Current regional dollars **UNVERIFIED**: fetched official price table returned `$-` placeholders. [S10] | Benchmark if regional quote is obtained. Do not publish recalled historical prices as current. |
| Apple SpeechAnalyzer / SpeechTranscriber | Apple describes fully on-device transcription, downloadable language assets, partial/final results and audio time ranges. Runtime language/device checks required. WWDC25 presentation. [S11] | SDK/platform terms; per-minute network fee **$0** by local execution design. Precise Japanese locale support on each target device **UNVERIFIED** until runtime check. | Native Apple candidate with fail-closed local fallback. Never silently fall back to remote SFSpeechRecognizer. |
| Web Speech | `processLocally=true` requires device-local recognition; property is experimental/limited availability. Language packs must be installed; default is false. [S12] | Browser/OS service terms; no verified universal Japanese availability or price. | Never treat ordinary Web Speech as private. Require local capability proof and fail closed; otherwise Whisper or manual transcript. |
| OpenAI hosted ASR | Current docs recommend `gpt-transcribe` for file transcription and `gpt-live-transcribe` for live streaming; older variants remain documented. [S13] | Current estimated rates: `gpt-transcribe` **$0.0045/min**; `gpt-live-transcribe` / `gpt-realtime-whisper` **$0.017/min**; `gpt-4o-transcribe` **$0.006/min**; `gpt-4o-mini-transcribe` **$0.003/min**. [S14] | Export-file quality/cost benchmark. No direct learner microphone upload under current law. |

**UNVERIFIED across all candidates:** comparative CER, particle omission preservation, mora duration, devoiced-vowel handling, code-switching accuracy, battery drain and end-to-end latency on Bunki learner speech. Native-speech WER/CER and provider rankings do not settle these questions. A transcript that silently repairs a dropped particle is especially dangerous as evidence of learner performance.

### TTS inventory and commercial constraints

| Tool | Verified support / price | Licensing and quality consequence |
|---|---|---|
| Google Cloud | Standard and WaveNet **$4 / 1M characters**; Neural2 **$16 / 1M**; Chirp 3 HD **$30 / 1M** after free quotas. Japanese characters count as characters, not their UTF-8 bytes. Gemini 2.5 Flash TTS text **$0.50/MTok**, audio **$10/MTok** at **25 audio tokens/sec**. [S15] | Commercial cloud-service terms, not redistributable model weights. Accent/readings need independent QA. **ESTIMATE:** Flash audio component `25*60*10/1e6=$0.015/min`, plus text tokens. |
| Azure | Japanese voices available in official language table; cloud Neural/HD products. [S09] | Regional price **UNVERIFIED** because official page displayed placeholders. Contract/output terms need asset-specific review before distributing bundled commercial audio. [S10] |
| ElevenLabs | Japanese TTS supported. Paid commercial license; Starter **$6/month**, **30,000 credits**; Creator **$22/month**, **121,000 credits** (first month **$11**); Pro **$99**, **600,000 credits**. Multilingual V2 uses **1 credit/character**, Flash/Turbo V2.5 **0.5–1 credit/character**. [S16,S17] | Commercial outputs require paid plan and rights to input. Provider's Japanese pitch-quality marketing is not independent validation. **ESTIMATE:** fully using Starter on V2 yields `$6/30000=$0.0002/char`, not a universal marginal API rate. |
| OpenAI | `gpt-4o-mini-tts` and dated snapshot are documented; multilingual synthesis includes Japanese. Voices are optimized for English and AI-generated voice must be disclosed. [S18] | Current exact TTS dollar rate **UNVERIFIED**: fetched current pricing/model page did not expose it. Do not substitute the familiar historical $0.015/min quote as current. Commercial output redistribution review remains a launch gate. |
| VOICEVOX | Software allows commercial/noncommercial use, requires credit and adherence to each voice library's conditions. Unauthorized redistribution of the software is prohibited by desktop terms. [S19] | Distinguish open-source engine license, core/model licenses, character terms and output terms. Choose a specifically cleared voice; do not bundle arbitrary desktop software. Local vendor inference fee **$0**. |
| VOICEVOX Nemo | Output may be used commercially with attribution; terms prohibit machine-learning use and other specified uses. [S24] | Useful candidate for prerecorded lesson audio, not an unrestricted speech-training corpus. Check particular release and redistribution permission. |
| Style-Bert-VITS2 | Code AGPL-3.0; `text/user_dict` module LGPL-3.0. Default-model terms are separately linked. [S25] | **$0** local provider fee, but weights/voice permissions and copyleft integration require review. Prefer a separate development content-preparation tool until reviewed; no blanket proprietary embedding assumption. |
| Apple voices | AVSpeechSynthesizer speaks utterances and permits voice selection through available device voices. [S26] | Use for on-device playback only. Redistribution of captured Apple voice audio as a paid content pack **UNVERIFIED**, so do not bundle it without a license. Offline execution must be tested for selected installed voice. |

**DESIGN:** For the first commercial listening pack, commission Japanese recordings with an explicit worldwide commercial distribution/derivative-audio grant and speaker releases. Keep the signed grant ID, script version, pronunciation reviewer and audio hash as content metadata. A human narrator or TTS output must not silently determine the dictionary reading.

### Pronunciation and pitch assessment

Azure's pronunciation assessment can return Japanese scores, but its **prosody assessment is en-US only**. Phoneme-name output is also more restricted than the locale list; Japanese assessment support is not evidence of Japanese lexical pitch-accent assessment. [S21] **DESIGN:** Never relabel Azure's generic score as Tokyo pitch correctness or use it to grade FSRS cards.

Hirata et al. (**2024-09-18**, peer-reviewed, two experiments) studied pitch perception rather than spontaneous production. Experiment 1, **N=66**, found a pre/post effect `β=0.52, SE=0.12, p<.001` (derived odds ratio `exp(.52)=1.68`), without a main training-group effect. Experiment 2, **N=48**, found no significant identification-performance difference between training modalities. Willingness to invest practice hours differed, partial `η²=.164`; days `η²=.158`. Thus preference for a visual/gesture interface cannot be claimed as proven superior learning. [S22] This single paper does not estimate Bunki efficacy or long-term retention.

Kubo et al. (**2025-09-25**, preprint) report the mora-label recognizer improvement stated above. PASQA (**2026-06-18**, preprint) targets accent correctness using synthetic accent-error training and reports better human agreement than general naturalness scoring; a verified numerical learning-effect size is unavailable and learner-speech generalization is **UNVERIFIED**. [S20,S23] Neither is a validated automatic learner grader.

**DESIGN — pitch v1:** show mora boundaries and a reference recording's normalized F0 contour; let the learner replay/compare and request a specific contrast. Explain unvoiced regions, tracking failures, phrase accent and dialect/reference choice. Store F0 estimates and ASR guesses as observed evidence with tool version/confidence, never as measured mastery. A discriminative listening probe can become measured evidence only with an independently validated answer and controlled presentation. A learner-confirmed production rubric may include intelligibility, mora timing, segmental contrast and phrase realization as separate observations; no averaged readiness score.

### Forced alignment and content rights

Montreal Forced Aligner is a local forced-alignment toolkit; code is MIT. The Japanese MFA acoustic model and dictionary v2.0.1a are **CC BY 4.0**. [S27,S28] Aeneas is **AGPL-3.0**. [S29] **DESIGN:** Prefer offline MFA for prepared content, with manual spot-checking; alignment measures time correspondence, not whether the learner produced a phoneme correctly. Learner production should not be force-fit to a correct script and then called correct.

Tatoeba text sentences default to CC BY 2.0 FR, but audio licenses differ by contributor and can include noncommercial/no-derivative or non-reuse restrictions. Its terms explicitly do not guarantee audio fidelity to written text. [S30] **DESIGN:** ingest only explicitly compatible audio rows; preserve sentence ID, contributor, exact license, source URL, download date and text/audio verification. A text license does not license a separately recorded voice.

**DESIGN:** Aozora public-domain text, NHK Easy, podcasts, video subtitles and learner-owned media all need separate text/audio/territory permissions. They are not a blanket commercial listening pack. Until an exact source is cleared, mark it **UNVERIFIED / excluded from distribution**. Learner-imported files remain local and out of the public content bundle.

### Live conversation economics

**DESIGN:** Strict-compliant live stack: microphone → local VAD/ASR → learner transcript confirmation → local retrieval/tutor → Japanese verification → local/prebundled audio. Cost to a cloud provider is **$0/min**; device latency, battery and local-model quality are **UNVERIFIED** pending measurement. Push-to-talk is the initial behavior, not a claim that cross-device full-duplex performance is solved.

**Conditional ESTIMATE if live transport is separately authorized:** Assume a wall-clock minute contains **0.5 min learner speech**, **0.5 min tutor audio**, **150 Japanese output characters**, and **one** Sonnet 5 call with 6,000 cached-prefix tokens + 1,000 new input + 600 billed output tokens. These are planning assumptions, not natural-language constants.

- Nova-3 monolingual promo ASR: `.5*.0048=$0.0024` (regular-rate stress test `.5*.0077=$0.00385`). [S08]
- Google Chirp HD TTS: `150*30/1e6=$0.0045`. [S15]
- Sonnet repeated-prefix hit call: `6000*.2/1e6+1000*2/1e6+600*10/1e6=$0.0092`. First 5-minute cache-write call instead **$0.0230**. Rates from track05 C02.
- Sum per warm wall-clock minute: **$0.01610 promotional** or **$0.01755 regular ASR**, excluding transport, VAD, tool loops, retries, infrastructure and tax. First cold minute **$0.02990 promotional**. Never multiply this by total app time if the speech/activity assumptions differ.

Deepgram's hosted Voice Agent advertises Standard **$0.075/min**, BYO LLM + TTS **$0.050/min**; BYO components have separate bills. Japanese end-to-end tutor voice compatibility for the chosen configuration remains **UNVERIFIED**. [S08] OpenAI's current `gpt-live-1` session price is **$0.05/min plus backend model/tool usage**; current Realtime token prices are **not** fixed per-minute conversation prices. [S14] Neither service is compliant with export-only learner egress as a live path.

## Inferences

1. **Separate transcripts from evidence.** Preserve original local audio, ASR version and learner correction. Do not let a corrected transcript erase the original mistake or let an ASR hallucination become a learner error.
2. **Separate practice modalities.** Shadowing exposures, dictation probes, free production and card recall are different row kinds. Listening without a response is exposure, not measured comprehension.
3. **Treat generated audio as generated teaching.** Verify script words/readings first, then separately audit the waveform. TTS agreement with its own transcript is circular verification.
4. **Use abstention, not false precision.** A low-confidence pitch tracker should display an unscored recording rather than a misleading numerical judgment.
5. **All personal settings are record data.** Accent-reference preference, hearing/accessibility accommodations, desired speaking contexts and microphone calibration belong in learner ledger rows, not individualized build flags.
6. **FSRS boundary remains intact.** The learner chooses card grades; speech tools cannot convert acoustic confidence or rubric suggestions into a grade or due date.

## Gaps and release gates

- **UNVERIFIED:** on-device Japanese performance, battery and memory on the minimum supported iPhone/Android/browser; test each pinned model and browser variant.
- **UNVERIFIED:** comparative ASR precision on learner particles, long vowels, geminates, names, repairs and silence; measure these against manually transcribed recordings before mining.
- **UNVERIFIED:** any vendor's Japanese speech score predicts learning or real-world communicative ability in Bunki; no score is used as mastery evidence without validation.
- **UNVERIFIED:** current Azure regional rates, current OpenAI TTS rate, every chosen voice's redistribution rights, and exact mobile model-pack license obligations.
- **DESIGN release test:** network-disabled full session works after pack installation; network trace contains no learner audio, text, lookup tokens or personal state. Export is a deliberate file action and remote response import is proposal-only.
- **DESIGN evaluation:** teachers independently annotate errors and acceptability, blinded to provider; report CER plus particle/mora error recall, false corrections, abstention, latency and device energy. Sample-size thresholds belong to the evaluation plan, not invented effectiveness claims.

## Source register

All accessed **2026-09-28**. Most are living official docs/repos with publication date **undated**. Prefer short paraphrases; each retrieved webpage carries a 200-word synthesis budget.

- S01 — Whisper upstream code/model license and models: https://github.com/openai/whisper (undated).
- S02 — whisper.cpp runtime/platforms/license: https://github.com/ggml-org/whisper.cpp (undated); browser example https://github.com/ggml-org/whisper.cpp/blob/master/examples/stream.wasm/README.md (undated).
- S03 — ReazonSpeech repository: https://github.com/reazon-research/ReazonSpeech (undated, copyright 2022–2025).
- S04 — kotoba-whisper-v2.0 model card: https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0 (undated snapshot).
- S05 — Google Chirp 3 documentation: https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3 (undated).
- S06 — Google STT pricing: https://cloud.google.com/speech-to-text/pricing (undated).
- S07 — Deepgram models/languages: https://developers.deepgram.com/docs/models-languages-overview (undated).
- S08 — Deepgram pricing: https://deepgram.com/pricing (undated).
- S09 — Azure language support: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support (indexed update 2026-06-19; current page accessed).
- S10 — Azure regional pricing: https://azure.microsoft.com/en-us/pricing/details/speech/ (undated; fetched prices blank).
- S11 — Apple WWDC25 SpeechAnalyzer: https://developer.apple.com/videos/play/wwdc2025/277/ (2025; exact day not displayed).
- S12 — Web Speech on-device property: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally and https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API (undated current docs).
- S13 — OpenAI file/live transcription: https://developers.openai.com/api/docs/guides/speech-to-text and https://developers.openai.com/api/docs/guides/realtime-transcription (undated).
- S14 — OpenAI current pricing: https://developers.openai.com/api/docs/pricing (undated).
- S15 — Google TTS pricing: https://cloud.google.com/text-to-speech/pricing (undated).
- S16 — ElevenLabs Japanese TTS / commercial rights: https://elevenlabs.io/text-to-speech/japanese and https://elevenlabs.io/docs/overview/capabilities/text-to-speech (undated).
- S17 — ElevenLabs price/credits: https://elevenlabs.io/pricing (undated).
- S18 — OpenAI TTS: https://developers.openai.com/api/docs/guides/text-to-speech and https://developers.openai.com/api/docs/models/gpt-4o-mini-tts (undated).
- S19 — VOICEVOX terms: https://voicevox.hiroshiba.jp/term/ (undated).
- S20 — Kubo et al., assessment recognizers: https://arxiv.org/abs/2509.20655 (**2025-09-25**, preprint).
- S21 — Azure pronunciation limitations: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment (indexed update 2026-04-29; current page accessed).
- S22 — Hirata et al., multimodal pitch training: https://www.cambridge.org/core/journals/language-and-cognition/article/multimodal-training-on-l2-japanese-pitch-accent-learning-outcomes-neural-correlates-and-subjective-assessments/AB2195C963F348823C8175220F9F9EA1 (**2024-09-18**, peer-reviewed).
- S23 — PASQA: https://arxiv.org/abs/2606.20137 (**2026-06-18**, preprint).
- S24 — VOICEVOX Nemo terms: https://voicevox.hiroshiba.jp/nemo/term/ (undated).
- S25 — Style-Bert-VITS2 licenses: https://github.com/litagin02/Style-Bert-VITS2 (latest dated release shown 2025-08-24); model terms https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/TERMS_OF_USE.md (living document).
- S26 — Apple synthesizer and voice selection: https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer and https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoice (undated, JavaScript-heavy page).
- S27 — MFA code: https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner (undated).
- S28 — Japanese MFA model: https://mfa-models.readthedocs.io/en/latest/acoustic/Japanese/Japanese%20MFA%20acoustic%20model%20v2_0_1a.html ; dictionary https://mfa-models.readthedocs.io/en/latest/dictionary/Japanese/Japanese%20MFA%20dictionary%20v2_0_1a.html (model version dates not verified; older source deliberately retained for exact license).
- S29 — Aeneas code: https://github.com/readbeyond/aeneas (undated).
- S30 — Tatoeba terms: https://tatoeba.org/en/terms_of_use (undated).
- S32 — Faster Whisper: https://github.com/SYSTRAN/faster-whisper (undated, fetched official repository).
