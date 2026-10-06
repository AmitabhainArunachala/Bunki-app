# Speech, Listening and Pronunciation Tooling for a Japanese-Learning Product (as of 2026-09-28)

Method note for the report writer: this session's web-search budget was exhausted mid-task and the egress proxy blocked most vendor domains (learn.microsoft.com, developers.openai.com, platform.openai.com, ai.google.dev, cloud.google.com pricing pages [truncated], docs.cloud.google.com, huggingface.co, elevenlabs.io, deepgram.com, assemblyai.com, arxiv.org, aozora.gr.jp, voicevox.hiroshiba.jp, coeiroink.com, gavo.t.u-tokyo.ac.jp, note.com, techcrunch.com, youtube.com). Where a figure comes from a search-engine snippet of a vendor page rather than a page I could open, it is tagged **[snippet, unverified]**. Figures from pages I opened directly (mostly GitHub mirrors and repos) are tagged **[fetched]**. Everything is Japanese-specific unless stated.

---

## Key Question 1: ASR for Japanese learner speech

### Takeaway
For open-weights Japanese ASR the strongest documented options in 2026 are Whisper large-v3 (best out-of-domain CER on JSUT/CommonVoice), kotoba-whisper v2.x (distilled, ~6x faster, best on ReazonSpeech-domain broadcast audio) and Qwen3-ASR 1.7B (Apache-2.0, streaming via vLLM, ships a Japanese-capable forced aligner). Apple's iOS 26 SpeechAnalyzer now does fully on-device Japanese at 38-125x real time. No source I found benchmarks any engine on **non-native** Japanese; the one industry account of learner-speech ASR (Lacuna/Tiptree) had to build a custom multitask model to get mora-label error from 12.3% to 7.1%.

### Cited Findings

**Open-weights models and benchmark numbers (native-speaker test sets)**
- kotoba-whisper GitHub README CER table (fetched 2026-09-28, table undated in the extract): CommonVoice 8.0 / JSUT Basic5000 / ReazonSpeech-test CER — kotoba-whisper v2.1: 9.3 / 8.4 / 11.3; v2.0: 9.2 / 8.4 / 11.6; v1.1: 9.5 / 8.5 / 12.2; v1.0: 9.4 / 8.5 / 12.2; whisper-large-v3: 8.5 / 7.1 / 15.1; whisper-medium: 11.4 / 10 / 33.3; whisper-small: 15.7 / 14.2 / 40.8; whisper-base: 28.2 / 25 / 69.4; whisper-tiny: 58 / 37.6 / 142.2 — [kotoba-tech/kotoba-whisper](https://github.com/kotoba-tech/kotoba-whisper) [fetched]
- Kotoba-Whisper is "6.3x faster than large-v3, while retaining as low error rate as the large-v3"; v2.0 was trained on all subsets of ReazonSpeech (7,203,957 clips after removing transcripts with >10 WER); ReazonSpeech is "the largest speech-transcription paired dataset in Japanese extracted from Japanese TV audio recordings" — [kotoba-tech/kotoba-whisper-v2.0 model card](https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0) [snippet, unverified — huggingface.co blocked]
- openai/whisper README model table: tiny 39M (~10x rel. speed, ~1 GB VRAM), base 74M (~7x), small 244M (~4x), medium 769M (~2x), large 1550M (1x, ~10 GB), turbo 809M (~8x, ~6 GB); "the turbo model is not trained for translation tasks"; "Whisper's code and model weights are released under the MIT License" — [openai/whisper](https://github.com/openai/whisper) [fetched]
- Qwen3-ASR (released 2026-01-29; native Transformers support added 2026-06-26): Qwen3-ASR-1.7B and Qwen3-ASR-0.6B, Apache-2.0, "52 languages and dialects" incl. Japanese; "streaming inference is only available with the vLLM backend"; the repo's benchmarks give no isolated Japanese CER. Companion Qwen3-ForcedAligner-0.6B is a non-autoregressive forced aligner for 11 languages incl. Japanese, giving "word or character level timestamps" — [QwenLM/Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR) [fetched]
- A Feb 2026 third-party benchmark of Japanese ASR recommended "qwen3-asr-1.7b or whisper-large-v3-turbo" for maximum accuracy on transcripts/subtitles and "reazonspeech-espnet-v2" for Japanese media/broadcast — [Neosophie, 2026-02-26](https://neosophie.com/en/blog/20260226-japanese-asr-benchmark) [snippet, unverified — page blocked]
- ReazonSpeech repo (fetched 2026-09-28): packages k2-asr (159M params, includes a bilingual ja-en model), nemo-asr (619M), espnet-asr (120M); code "Licensed under the Apache License, Version 2.0" — [reazon-research/ReazonSpeech](https://github.com/reazon-research/ReazonSpeech) [fetched]. The per-package README (CER numbers, streaming) returned 404 at the paths tried.
- A fine-tuned whisper-large-v3 variant reports "approximately 4% CER on the JSUT-5000 test set" — [AkitoP/whisper-large-v3-japense-phone_accent, via search](https://huggingface.co/AkitoP/whisper-large-v3-japense-phone_accent) [snippet, unverified]. Note the model name suggests phone/accent-aware output; worth a direct look because it may emit accent-annotated kana (Gap below).
- Whale (multilingual w2v-BERT/E-Branchformer) reports 11.7% CER on CommonVoice Japanese — [arXiv 2506.01439, via search](https://arxiv.org/pdf/2506.01439) [snippet, unverified]

**Learner (non-native) speech**
- Lacuna (Tiptree Systems) case study "Building Tailored Speech Recognizers for Japanese Speaking Assessment": multitask learning + lattice-fusion decoding that jointly predicts text, phonemes and pitch, "reducing mora-label error rates from 12.3% to 7.1%" — [Lacuna](https://lacuna.tiptreesystems.com/work/building-tailored-speech-recognizers-for-japanese-speaking-assessment/wrk_9f7d0506e9b44a7ca43d9535e4cec5aa) [snippet, unverified — page blocked; client, dataset and date not visible]
- A learner-app vendor claims most ASR engines' "training data heavily skewed toward American-accented Japanese learners" and that ASR "still struggles heavily with pitch accent detection" — [Yapr blog](https://www.yapr.ca/a/learn-japanese-by-speaking) [snippet, unverified; vendor marketing, treat as opinion]

**Cloud ASR (Japanese support, price, streaming)**
- Deepgram Nova-3 Multilingual "supports code-switching across 10 languages including Japanese"; Pay-As-You-Go Nova-3 Multilingual $0.0058/min; Nova-3 monolingual streaming shown at a promotional $0.0048/min vs struck-through $0.0077/min — [ConvertAudioToText / Cekura / HappyRobot summaries of Deepgram pricing, 2026](https://convertaudiototext.com/blog/deepgram-nova-3-explained) [snippet, unverified — deepgram.com blocked]
- Google Cloud Speech-to-Text: Chirp 3 (STT) "released on May 5, 2026"; "24 GA languages and 77+ preview languages"; standard real-time recognition $0.016/min, Dynamic Batch $0.004/min — [Toolworthy / Brass Transcripts summaries](https://www.toolworthy.ai/tool/google-cloud-speech-to-text) and [Google STT pricing page](https://cloud.google.com/speech-to-text/pricing) [snippet, unverified — the pricing page fetched but was truncated before the table; docs.cloud.google.com blocked]. Whether ja-JP is in Chirp 3's GA list could not be confirmed.
- OpenAI: pricing page blocked. The Realtime/transcription figures below (Q4) come from secondary sources.
- Azure: pronunciation assessment "costs the same as speech to text for Standard or commitment tier pricing" — [MicrosoftDocs azure-ai-docs mirror](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/how-to-pronunciation-assessment.md) [fetched]. Azure STT per-minute price itself not retrieved (Gap).
- AssemblyAI: docs blocked; no verified Japanese/streaming or price data (Gap).

**On-device: Apple**
- iOS 26 `SpeechAnalyzer`/`SpeechTranscriber` is "an on-device-only framework. It does not have a server-side path"; requires iOS 26+; per-locale model assets are downloaded via `AssetInventory`; one locale per transcriber instance, no mid-stream language switching — [Callstack blog](https://www.callstack.com/blog/on-device-speech-transcription-with-apple-speechanalyzer) and [Anton Gubarenko iOS 26 guide](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide) [snippet]
- Independent verification on macOS 26 (2026-09-20): `supportedLocales` returned 30 locales, "ja-JP を含む"; RTF 0.011-0.026 (38-125x real time) on 10-s and 3-min Japanese/English wav/m4a; recognition "概ね正確" but keyword hit-rate below the project's threshold (4 of 6 keywords on the 10-s Japanese clip) — [goofmint/offline_stt PR #72](https://github.com/goofmint/offline_stt/pull/72) [fetched]
- As of Aug 2026 `SpeechTranscriber.supportedLocales` "returns 42 locales covering 22 languages, including Japanese" — [yrocaz/mac-transcriber research note 2026-07-27, via search](https://github.com/yrocaz/mac-transcriber/blob/main/docs/research/2026-07-27-apple-speechanalyzer-docs.md) [snippet; the fetched doc itself did not list locales]. Locale-object equality is fragile; normalise with `SpeechTranscriber.supportedLocale(equivalentTo:)` — [same](https://github.com/yrocaz/mac-transcriber/blob/main/docs/research/2026-07-27-apple-speechanalyzer-docs.md) [fetched]
- Gigazine (2026-07-14) reports Apple SpeechAnalyzer "surpasses Whisper Small in English benchmarks" — [Gigazine](https://gigazine.net/gsc_news/en/20260714-apple-speech-analyzer-benchmark/) [snippet, unverified; English only]

**On-device: browser**
- whisper-web (Transformers.js + ONNX Runtime Web) runs Whisper in-browser; main branch is WASM, "Experimental WebGPU support has been added" on a branch; MIT — [xenova/whisper-web](https://github.com/xenova/whisper-web) [fetched]. Transformers.js: `device: 'webgpu'` is available but "The WebGPU API is still experimental in many browsers"; quantised dtypes fp16/q8/q4 recommended — [huggingface/transformers.js](https://github.com/huggingface/transformers.js) [fetched]
- Community reports that WebGPU Whisper demos are "only properly supported by the Chrome browser" — [DEV Community tutorial](https://dev.to/proflead/real-time-audio-to-text-in-your-browser-whisper-webgpu-tutorial-j6d) [snippet]
- Hugging Face Space "Real-time Whisper WebGPU" exists — [Xenova/realtime-whisper-webgpu](https://huggingface.co/spaces/Xenova/realtime-whisper-webgpu) [snippet; blocked, so model size and Japanese quality not checked]

### Inferences
- For a learner product, the cheapest robust path is Whisper large-v3 / v3-turbo or Qwen3-ASR self-hosted (both permissive licences), with kotoba-whisper only if broadcast-style audio dominates: on JSUT/CommonVoice (read, clean speech closer to learner drills) whisper-large-v3 beats kotoba (7.1 vs 8.4 CER).
- No engine here is validated on non-native Japanese; expect CER well above the ~7-9% native numbers and plan for a "known-text" (scripted) mode where forced alignment replaces free recognition.
- On iOS 26+, Apple's free, offline SpeechTranscriber is fast enough for live feedback, but the 4/6-keyword result suggests accuracy is below Whisper-large; use it for latency-sensitive UI and a server model for scoring.
- Browser on-device Whisper is realistic only for small/base-size models on Chrome/WebGPU; not a dependable primary path for Japanese in 2026.

### Gaps
- No benchmark of any engine on non-native (learner) Japanese speech was found; the Lacuna numbers lack dataset/date and the page was unreachable.
- Could not verify Whisper large-v3-turbo's Japanese CER on JSUT/CommonVoice (the Whisper Notes Mac benchmark and Neosophie pages were blocked).
- ReazonSpeech per-model CER and streaming support (package READMEs 404'd at guessed paths).
- Azure STT and AssemblyAI Japanese pricing/streaming, Google Chirp 3 ja-JP GA status.
- Apple SpeechTranscriber accuracy on Japanese vs Whisper: no quantitative comparison found.
- ReazonSpeech corpus licence (commonly cited as CDLA-Sharing-1.0) not verified this session.

---

## Key Question 2: Pronunciation and pitch-accent scoring

### Takeaway
Azure Pronunciation Assessment supports ja-JP for accuracy/fluency/completeness, but prosody scoring is en-US only and Japanese phoneme/syllable strings have been reported empty, so it cannot score 高低アクセント. No commercial API scores Japanese pitch accent; shipping apps either train perception (Migaku Pitch Trainer, Japanese Pitch Accent Trainer) or do DIY F0-contour comparison (onsei, onchou, Aomi-style). The research-grade recipe is forced alignment (Julius/MFA) + mora-level F0 (Praat/pyworld/CREPE) + rule/ML classification of H/L per mora, with OJAD/Suzuki-kun or pyopenjtalk supplying the target pattern.

### Cited Findings

**Azure Pronunciation Assessment**
- Scores: scripted = Accuracy, Fluency, Completeness, Prosody (optional), overall PronScore; unscripted = Accuracy, Fluency, Prosody (no Completeness); content assessment via Azure OpenAI = Vocabulary, Grammar, Topic. "Prosody Assessment: Limited to 'en-US locale only'". Phoneme alphabets: IPA supported in en-US, SAPI in en-US and zh-CN, "Other locales receive phoneme scores without naming conventions". Billed "the same as speech to text" — [azure-ai-docs how-to (GitHub mirror)](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/how-to-pronunciation-assessment.md) [fetched]
- ja-JP is listed among the 33 pronunciation-assessment locales — [azure-ai-docs language-support include (GitHub mirror)](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/includes/language-support/pronunciation-assessment.md) [fetched; the mirror shows only language/locale columns, not per-feature columns]
- GitHub issue #2237 (opened 2024-01-24, SDK 1.34.0, JavaScript): with `Granularity.Phoneme` on ja-JP, "phoneme and syllable fields return empty strings" in both Speech Studio and SDK; labelled "in-review"/"pending close" with no resolution shown — [Azure-Samples/cognitive-services-speech-sdk #2237](https://github.com/Azure-Samples/cognitive-services-speech-sdk/issues/2237) [fetched]
- Microsoft Q&A guidance: assessment is robust to East-Asian-accented English, but "extreme deviations in intonation, consonant sounds ... and syllable timing may result in lower-than-expected scores" — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/2337244/does-azure-pronunciation-assessment-handle-hong-ko) [snippet; about English, not Japanese]

**Research systems for pitch-accent assessment**
- Standard pipeline: "forced alignment of the text the learner read with the microphone input, extracting fundamental frequency (F0) from the input, and then carrying out recognition based on the phoneme-aligned F0"; one implementation used PRAAT for F0 and Julius for alignment "to align the F0 by mora" — [SLaTE 2011 rule-based pitch-level classification](https://www.isca-archive.org/slate_2011/short11_slate.pdf) [snippet, unverified — PDF blocked]
- 2013 CALL paper derives classification equations by associating word F0 with native-speaker *perceptual* judgements of accent, noting earlier systems "have not previously mapped F0 values to perceptual thresholds of native speakers" — [Speech Communication (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/S0167639313000927) [snippet, unverified]
- 2013-ish "A system for learning the pronunciation of Japanese pitch accent" — [Academia.edu](https://www.academia.edu/50430225/A_system_for_learning_the_pronunciation_of_Japanese_pitch_accent) [snippet only; not opened]
- Lacuna multitask ASR (text + phoneme + pitch) reached 7.1% mora-label error (from 12.3%) — [Lacuna](https://lacuna.tiptreesystems.com/work/building-tailored-speech-recognizers-for-japanese-speaking-assessment/wrk_9f7d0506e9b44a7ca43d9535e4cec5aa) [snippet, unverified]

**Target-pattern sources (what the learner should have said)**
- OJAD (Univ. of Tokyo, Minematsu/Saito lab) Suzuki-kun: takes arbitrary Japanese text and "(1) estimates and displays the position of accent nuclei, and (2) estimates and displays the pitch pattern when the text is read aloud", using morphological analysis, accent-phrase-boundary and accent-nucleus estimation; "accuracy is not 100%"; pattern assumes neutral focus, not questions/surprise — [OJAD Suzuki-kun page](https://www.gavo.t.u-tokyo.ac.jp/ojad/jpn/phrasing/index) [snippet, unverified — site blocked]. Effectiveness for L1-Chinese learners' prosodic naturalness reported — [Journal of the Phonetic Society of Japan 23 (2019)](https://www.jstage.jst.go.jp/article/onseikenkyu/23/0/23_6/_pdf) [snippet]
- pyopenjtalk (MIT; bundles Open JTalk under modified BSD; optional `marine` accent estimator Apache-2.0) exposes full-context labels via `extract_fullcontext()` that encode accent nucleus / accent-phrase information (see its lab_format.pdf) — [r9y9/pyopenjtalk](https://github.com/r9y9/pyopenjtalk) [fetched]
- Kanjium `accents.txt`: "pitch accent mora locations for 124,137 words", whole package CC BY-SA 4.0, attribute to "Uros O."; original source of the accent data not stated — [mifunetoshiro/kanjium](https://github.com/mifunetoshiro/kanjium) [fetched]

**Open-source learner-facing tools**
- onsei (MIT): extracts pitch, aligns learner vs teacher audio with DTW "based on phoneme detection or speech intensity", normalises and computes a distance metric, produces comparison graphs; Voila web UI, REST API (used by an Anki add-on), CLI; "experimental work in progress", ~40 stars — [itsupera/onsei](https://github.com/itsupera/onsei) [fetched]
- onchou: browser-only (plain HTML/JS, no server, no ML) trainer that shows the target H/L pattern, plays built-in TTS, records the mic, extracts pitch client-side and compares the H/L pattern; accent data vendored from Kanjium via kanji-data with a licensing caveat — [bagustris/onchou](https://github.com/bagustris/onchou) [fetched]. PRs show handling of geminates/devoiced vowels as silent morae — [PR #2](https://github.com/bagustris/onchou/pull/2) [snippet]
- Building blocks: pyworld (MIT) exposes DIO, Harvest (better at low SNR) and StoneMask F0 refinement — [Python-Wrapper-for-World-Vocoder](https://github.com/JeremyCCHsu/Python-Wrapper-for-World-Vocoder) [fetched]; CREPE (MIT) with tiny/small/medium/large/full capacities, "significantly faster ... on GPU", no CPU real-time claim — [marl/crepe](https://github.com/marl/crepe) [fetched]
- MFA Japanese acoustic model v3.0.0 (CC BY 4.0): trained on ~154.37 h (Common Voice ja 71.54 h/1,364 spk, GlobalPhone 33.88 h, MS SLT 9.85 h, JVS 30.25 h, TEDxJP-10K 8.85 h); "MFA phone set for Japanese"; training-set WER/CER 0% (not a held-out measure); a v2.0.1a also exists — [mfa-models japanese v3.0.0 README](https://github.com/MontrealCorpusTools/mfa-models/blob/main/acoustic/japanese/mfa/v3.0.0/README.md) [fetched]
- Qwen3-ForcedAligner-0.6B gives character-level Japanese timestamps and claims to surpass E2E aligners — [QwenLM/Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR) [fetched]

**What shipping apps actually do**
- Migaku Pitch Trainer: perception training only — "practice training their ears to distinguish between different types of pitch accents", audio for "over 5000 words recorded by a native speaker", adaptive difficulty, free + paid tiers — [Tofugu review](https://www.tofugu.com/japanese-learning-resources-database/migaku-pitch-trainer/) and [Migaku demo](https://pitch-demo.migaku.io/) [snippet]
- "Japanese Pitch Accent Trainer" (App Store, id 6760803133): "structured listening training based on standard Tokyo pronunciation" — perception, not production — [App Store](https://apps.apple.com/us/app/japanese-pitch-accent-trainer/id6760803133) [snippet]
- JAccent: dictionary with pitch-accent display — [App Store](https://apps.apple.com/us/app/jaccent-japanese-dict-with-ai/id1252200087) [snippet]
- Aomi: "Japanese speaking practice with pitch-accent recognition and visualization" — [LiveLingo roundup 2026](https://www.livelingo.io/guides/speak-japanese-app) [snippet; vendor-level claim, mechanism unknown]
- Yapr claims a "speech-to-speech" approach that processes pitch contours to judge accent patterns — [Yapr](https://www.yapr.ca/a/learn-japanese-by-speaking) [snippet; marketing]
- Speak and Praktika give AI-conversation feedback "on grammar and pronunciation" (no pitch-accent claim) — [Migaku comparison](https://migaku.com/blog/language-fun/language-learning-apps-comparison) [snippet]
- Kanshudo shows pitch accent in its dictionary — [Kanshudo](https://www.kanshudo.com/howto/pitch) [snippet; data source not confirmed, page blocked]

### Inferences
- There is no buy-able Japanese pitch-accent scorer; Azure gives segmental scores only. A practical MVP is: scripted prompt -> target H/L pattern from pyopenjtalk/OJAD-style estimation or Kanjium lexicon -> record -> forced-align (MFA ja v3 or Qwen3-ForcedAligner) -> mora-level F0 (pyworld Harvest) -> H/L classification with a downstep/initial-rise rule -> visual contour overlay vs TTS reference. This is exactly what onsei/onchou prototype and what the 2011-2013 CALL papers formalise.
- Because Azure returns empty phoneme strings for ja-JP (issue unresolved as far as visible), phoneme-level feedback in Japanese should not be built on Azure without re-testing in the current SDK.
- Perception-first training (Migaku-style minimal pairs) is the only widely shipped and reviewed approach; production scoring is still prototype-grade across the market.

### Gaps
- Could not open the SLaTE 2011 / Speech Communication 2013 papers to record accuracy figures or learner-corpus sizes.
- OJAD terms of use / any API or commercial-use policy not verifiable (site blocked).
- Whether Azure ever fixed issue #2237 for ja-JP phonemes (mirror doc says nothing; issue shows no resolution).
- Aomi/Yapr internal technology unverified; no third-party evaluation of any app's pitch-scoring accuracy exists in what I found.
- naist-jdic dictionary licence (pyopenjtalk) not confirmed.

---

## Key Question 3: TTS with natural Japanese and pitch-accent correctness

### Takeaway
Japanese-speaking reviewers in 2026 rate ElevenLabs (v3) highest for naturalness/intonation but still imperfect on kanji readings and proper-noun accent; Gemini TTS is strong at text understanding but inconsistent in tone across chunks; VOICEVOX is the only option with explicit per-mora accent editing (and is free), at the cost of a character-voice aesthetic and per-character credit rules. Cloud list prices per 1M characters (secondary sources, Mar-Sep 2026): Azure Neural HD $22, Google Chirp 3 HD $30 (1M chars/month free), ElevenLabs Flash/Turbo ~$50-equivalent.

### Cited Findings

**Japanese-language reviewer findings**
- GMO tech blog (OpenAI vs ElevenLabs vs Gemini): Japanese "読み上げの自然さ" favours ElevenLabs, "文章理解の精度" favours Gemini; ElevenLabs v3 scored 5.00 on "自然な抑揚の変化"; Gemini TTS's tone is "一貫していない" across chunks — [One Tech Blog (GMO)](https://tech.gmogshd.com/ai-tts-comparison/) [snippet, unverified — blocked]
- ElevenLabs Japanese narration has intonation, but "漢字の読み分けや固有名詞のアクセントなど、日本語特有の難所は依然として完璧ではない（2026年6月時点）" — [AI PICKS, ElevenLabs vs Gemini 2026](https://aipicks.jp/mag/elevenlabs-gemini-guide-2026) [snippet, unverified]
- VOICEVOX's strength is the "アクセント調整機能" (pitch/speed/intonation per mora, GUI waveform editing); "日本語に特化した読み上げを作るならVOICEVOXが向いており、ElevenLabsも日本語に対応していますが、英語ほど完璧ではない" — [AI PICKS, ElevenLabs vs VOICEVOX](https://aipicks.jp/mag/elevenlabs-vs-voicevox) and [Crystal Method VOICEVOX comparison 2026](https://crystal-method.com/blog/voicevox-comparison/) [snippet, unverified]
- A 5-vendor Japanese TTS spec/cost comparison (OpenAI, Google, Azure, ElevenLabs, VOICEVOX) exists on note.com — [そよ風 note](https://note.com/soyokaze2/n/naa6b71385492) [not opened — blocked]
- Google "Gemini 3.8 TTS" announced with voice creation and per-script acting direction — [XenoSpectrum](https://xenospectrum.com/gemini-tts-voice-model-comparison/) [snippet, unverified; Japanese quality not stated]

**English-language comparisons (not Japanese-specific)**
- ElevenLabs 81.97% words pronounced correctly vs Google TTS 77.30%; prosody accuracy 64.57% vs 45.83%; TTFA 150 ms vs 200 ms — [Aloa comparison](https://aloa.co/ai/comparisons/ai-voice-comparison/elevenlabs-vs-google-cloud-tts) [snippet; language of test unstated]

**Pricing (per 1M characters unless noted)**
- "Azure Neural HD costs $22 (reduced from $30 in March 2026), Google Chirp 3 HD costs $30 with a 1M-character/month free tier, and ElevenLabs Flash/Turbo costs approximately $50 per 1M characters equivalent via API" — [ttsforfree comparison 2026](https://ttsforfree.com/en/blogs/google-vs-azure-vs-elevenlabs-tts-comparison/) [snippet, unverified — page blocked; vendor pages blocked]
- Gemini TTS is billed separately from the Live API "with audio output priced well above text" — [Gemini API pricing (via search)](https://ai.google.dev/gemini-api/docs/pricing) [snippet, unverified]
- OpenAI TTS and Amazon Polly prices: not retrieved (Gap).

**Open-source / self-host engines and licences**
- VOICEVOX editor: "LGPL v3 と、ソースコードの公開が不要な別ライセンスのデュアルライセンス"; alternative licence "ヒホに求めてください" (@hiho_karuta) — [VOICEVOX/voicevox README](https://github.com/VOICEVOX/voicevox/blob/main/README.md) [fetched]. voicevox_engine: dual LGPL v3 + alternative commercial licence from the author — [VOICEVOX/voicevox_engine](https://github.com/VOICEVOX/voicevox_engine) [fetched]. voicevox_core: MIT ("versions 0.16 and earlier have different licensing terms"); C/Python APIs with community Flutter/Swift wrappers; iOS/Android/WASM "not mentioned"; the voice libraries are governed separately by "VOICEVOX 音声ライブラリ 利用規約" — [VOICEVOX/voicevox_core](https://github.com/VOICEVOX/voicevox_core) [fetched]. voicevox_resource: non-script files are "for VOICEVOX development use only" unless a different licence is obtained from ヒホ; ~50 character folders — [VOICEVOX/voicevox_resource](https://github.com/VOICEVOX/voicevox_resource) [fetched]
- VOICEVOX commercial use: "ソフトウェア本体・エンジン・音声ライブラリのすべてが無料で公開されており、商用利用についても原則として追加費用は発生しません" but each character has its own terms and most require credit in the form "VOICEVOX:キャラクター名"; some characters allow omitting credit under special contracts; TTS of others' copyrighted text can still infringe — [Crystal Method guide](https://crystal-method.com/blog/voicevox-commercial/), [Blue-R Dec 2025](https://blue-r.co.jp/blog-voicevox-commercial-use/), [YukkuriGen 2026](https://yukkurigen.com/blog/voicevox-how-to-use-guide) [snippet, unverified — official term pages blocked]
- COEIROINK: software usable commercially and non-commercially subject to per-content rules in the official terms — [COEIROINK terms](https://coeiroink.com/terms) [snippet only — blocked]
- Style-Bert-VITS2: code AGPL-3.0 (inherits Bert-VITS2); `text/user_dict/` is LGPL-3.0 (from VOICEVOX engine) — [litagin02/Style-Bert-VITS2](https://github.com/litagin02/Style-Bert-VITS2) [snippet]. TERMS_OF_USE (fetched): prohibited = unlawful, political, harmful, impersonation/deepfake; JVNV models (jvnv-F1/F2/M1/M2-jp) are CC BY-SA 4.0 with share-alike inheritance; koharune-ami / amitaro models require the amitaro.net guidelines (no adult/religious/political/defamatory use, no passing off as the original speaker) and visible credit "Style-BertVITS2モデル: [voice name], あみたろの声素材工房 (https://amitaro.net/)"; model merging needs rights-holder permission and amitaro rules apply if >=25% of the merge — [Style-Bert-VITS2 TERMS_OF_USE](https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/TERMS_OF_USE.md) [fetched]
- GPT-SoVITS: MIT licence — [RVC-Boss/GPT-SoVITS LICENSE](https://github.com/RVC-Boss/GPT-SoVITS/blob/main/LICENSE) [snippet]; copyright questions about cloned voices raised in [issue #690](https://github.com/RVC-Boss/GPT-SoVITS/issues/690) [snippet]
- Apple on-device voices (Kyoko, Otoya, Siri) and Web Speech `speechSynthesis`: no sources retrieved this session (Gap).

### Inferences
- For pitch-accent-correct reference audio, VOICEVOX (or Style-Bert-VITS2 with its accent controls) is the only engine where a product can *guarantee* the accent the learner is drilled on, because the accent phrase can be set programmatically; commercial neural voices produce natural intonation but the reviewers explicitly flag accent errors on proper nouns and kanji readings, which is unacceptable for a pitch-accent drill even if fine for listening content.
- Licensing shape for a shipped app: voicevox_core (MIT) can be embedded; the *voices* are the constraint (per-character credit, some characters restrict use), and the resource repo says character assets are for VOICEVOX development unless separately licensed — negotiate with the author before bundling voices in a commercial app. Style-Bert-VITS2's AGPL makes server-side use a source-disclosure trigger unless you only ship inference through a separately licensed path; its bundled voices carry CC BY-SA or amitaro.net terms.
- Cloud TTS is cheap at drill scale: a 10-character sentence is ~$0.0003 at $30/1M chars; caching generated audio makes per-user cost negligible.

### Gaps
- No verified vendor price for ElevenLabs Japanese TTS, OpenAI TTS (tts-1/gpt-4o-mini-tts or successors), Amazon Polly Japanese (Takumi/Kazuha/Tomoko), Azure ja-JP Neural/HD voices, Google Chirp 3 HD ja-JP voice count or Gemini TTS per-token rate.
- No MOS-style Japanese quality ranking with methodology; all reviewer findings are blog-level and were only visible as snippets.
- VOICEVOX official terms page and per-character policy.md files could not be opened (blocked / 404 at guessed path).
- Apple Kyoko/Otoya/Siri voice quality and licensing for in-app playback; Web Speech synthesis Japanese voice availability by browser.

---

## Key Question 4: Live voice conversation

### Takeaway
Speech-to-speech tutors cost roughly $0.02-$0.08 per minute at the model layer (Gemini Live ~$0.005 in / $0.018 out per minute; OpenAI gpt-realtime ~$0.019 heard / $0.077 spoken per minute; mini tier ~$0.016/min), plus $0.01/min for LiveKit/Pipecat orchestration or $0.05/min platform fee on Vapi, or $0.08-$0.10/min all-in-except-LLM on ElevenLabs Agents. Anthropic exposes no realtime voice API: Claude voice mode exists in the consumer apps and Claude Code, and the Claude API reference (skill snapshot 2026-06-24) lists no audio input modality.

### Cited Findings

**OpenAI Realtime**
- "GPT Realtime 2.1 costs $32 per million audio input tokens and $64 per million audio output tokens, while the mini model costs $10 and $20"; ~600 tokens/min of input audio and ~1,200 tokens/min of output audio -> "$0.019 per minute heard" and "$0.077 per minute spoken"; overall "roughly $0.05 per conversation minute on gpt-realtime-2.1 ... near $0.016 on the mini model, before context growth and after sensible caching" — [Layer3 Labs guide](https://www.layer3labs.io/guides/openai-realtime-api-pricing) and [Forasoft](https://www.forasoft.com/blog/article/openai-realtime-api-pricing) [snippet, unverified — OpenAI pricing page blocked]. Note the same search summary elsewhere quoted "$20/1M vs $10/1M" for output/input on the mini tier, consistent with the mini figures.
- A HackerNoon analysis of "4,000 measured sessions" exists for real-world Realtime cost — [HackerNoon 2026](https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions) [not opened — blocked]

**Gemini Live**
- Live API audio: $3 per 1M input tokens, $12 per 1M output tokens; "about $0.005 in / $0.018 out" per minute on Gemini 3.1 Flash Live preview; "Gemini 3.8 Live models are stable API models released September 15, 2026" — [Gemini API pricing (via search)](https://ai.google.dev/gemini-api/docs/pricing), [API Pulse on Gemini 3.8 Live](https://www.getapipulse.com/blog-gemini-3-8-live-api.html) [snippet, unverified]

**ElevenLabs Agents (Conversational AI)**
- Calls "start at 10 cents per minute for Creator and Pro plans, and 8 cents per minute on annual business plans"; overage $0.08/min, burst $0.16/min over concurrency; "LLM and telephony provider are not included and bill separately"; included minutes: Free 15, Starter 75, Creator 275, Pro 1,238, Scale 3,738, Business 12,375; a price cut on 2026-05-07 brought Speech-Engine agent pricing to ~$0.08/min — [ElevenLabs Agents pricing](https://elevenlabs.io/pricing/agents), [UsagePricing change log 2026-05-07](https://www.usagepricing.com/blueprint/activity/elevenlabs-2026-05-07-price-change), [HappyRobot](https://www.happyrobot.ai/hub/elevenlabs-pricing) [snippet, unverified — elevenlabs.io blocked]

**Orchestration stacks**
- "Pure orchestration platforms (Pipecat Cloud, LiveKit Cloud Agents) charge $0.01/min and pass model costs through at vendor cost"; Vapi $0.05/min, Retell $0.07, Bland $0.09 are platform fees only; all-in managed cost "between $0.11 and $0.25 a minute"; self-assembled LiveKit "$0.05 to $0.22"; LiveKit wins past ~1,000 min/month ($50 base + $0.01/min); at 10,000 min/month Vapi ~$800 vs LiveKit self-hosted ~$420; self-host breakeven ~5,000-8,000 min/month — [Cekura Vapi pricing](https://www.cekura.ai/blogs/vapi-ai-pricing), [Cekura LiveKit vs Vapi](https://www.cekura.ai/blogs/livekit-vs-vapi), [Inworld Vapi vs Pipecat vs LiveKit](https://inworld.ai/resources/vapi-vs-pipecat-vs-livekit), [Samcom](https://www.samcomtechnologies.com/blog/vapi-vs-livekit-for-ai-voice-agents-in-2026-a-developer-head-to-head) [snippet]
- Pipecat: BSD-2-Clause; STT plugins incl. Deepgram, Google, Azure, OpenAI; TTS incl. Deepgram, Google, Azure, OpenAI, ElevenLabs; speech-to-speech via Gemini Multimodal Live and OpenAI Realtime; transports Daily, LiveKit, SmallWebRTC, WebSocket, Vonage, WhatsApp — [pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat) [fetched]
- LiveKit Agents: Apache-2.0 (turn-detection models under "LiveKit Model License"); plugins for Deepgram nova-3, Cartesia sonic-3, ElevenLabs, OpenAI, Google incl. Gemini Live, OpenAI Realtime; "semantic turn detection" — [livekit/agents](https://github.com/livekit/agents) [fetched]

**Anthropic**
- The Claude API reference loaded in this session (claude-api skill, models cached 2026-06-24) documents text, image, PDF/document and file inputs, tool use, batches, Managed Agents — no audio input block type, no realtime/WebSocket audio endpoint, no speech model IDs — [claude-api skill / platform docs](https://platform.claude.com/docs/en/about-claude/models/overview) [fetched via skill]
- Consumer product: Anthropic updated Claude voice mode (July 2026) to let users pick Opus/Sonnet/Haiku; voice mode launched the previous year on Haiku — [TechCrunch 2026-07-23](https://techcrunch.com/2026/07/23/anthropic-updates-claude-voice-mode-with-more-capable-models/) [snippet]. Claude Code got voice mode (March 2026, ~5% rollout initially) — [TechCrunch 2026-03-03](https://techcrunch.com/2026/03/03/claude-code-rolls-out-a-voice-mode-capability/) [snippet]. Claude Code's dictation "is only available when you authenticate with a Claude.ai account, and is not available when configured to use an Anthropic API key directly" — [Claude Code docs](https://code.claude.com/docs/en/voice-dictation) [snippet]
- A third-party blog asserts a Claude "/v1/audio/stream API" with WebSocket PCM streaming and roadmap items ("Offline Voice Packs Q1 2026", "Custom Voice Cloning ... partnerships with ElevenLabs") — [DataStudios](https://www.datastudios.org/post/claude-voice-features-explained-current-status-and-upcoming-real-time-updates) [snippet; **contradicted** by the official API reference above, which has no such endpoint — treat as unreliable]
- Picovoice shows the workaround pattern: local STT/TTS around Claude text — [Picovoice](https://picovoice.ai/blog/add-voice-to-claude/) [snippet]

**Latency**
- No source I could open gives measured end-to-end latency for Japanese speech-to-speech. Sources cited above for the "voice agents in production 2026" comparison (Reactify) and the Softcery calculator were blocked.

### Inferences
- Tutor-call budget at 2026 prices: a 10-minute daily call on Gemini Live costs ~$0.20-0.25/month/user at the model layer, ~$0.50 on gpt-realtime, ~$0.60 with LiveKit Cloud orchestration added; ElevenLabs Agents would be ~$0.80-1.00 before the LLM. Speech-to-speech models (Gemini Live, OpenAI Realtime) are the cheapest and lowest-latency path; a cascaded STT->Claude->TTS stack is needed only if the pedagogy requires Claude's text reasoning, at the cost of extra hops.
- If Claude must be the tutor brain, the only route is cascade (Deepgram/Whisper STT -> Claude Messages API streaming -> ElevenLabs/Google TTS) inside Pipecat or LiveKit; there is no Anthropic speech modality to remove that hop.
- A latency target of sub-1 s voice-to-voice is the industry convention for these stacks, but I could not source a Japanese-specific measurement; treat it as unverified.

### Gaps
- Exact current OpenAI Realtime, transcription (gpt-4o-transcribe successors) and TTS prices from the primary page.
- Measured latency (TTFB / turn latency) for Japanese on Gemini Live, OpenAI Realtime, ElevenLabs Agents.
- Gemini Live / OpenAI Realtime Japanese speech quality and pitch-accent correctness in their spoken output (no reviewer evidence found).
- Whether Anthropic has announced any developer voice/audio API after the 2026-06-24 reference snapshot (search budget exhausted before this could be re-checked).

---

## Key Question 5: Listening-comprehension content and forced alignment

### Takeaway
Free, legally clean listening sources are thinner than they look: NHK NEWS WEB EASY has per-article audio but it is machine-generated and NHK's reuse terms could not be verified; Aozora Bunko text is public domain and Aozora Roudoku offers ~1,370 free human readings, but the audio's own redistribution terms were not verifiable; YouTube subtitle scraping is prohibited by YouTube's ToS regardless of copyright arguments. For syncing your own or licensed audio to text, MFA's Japanese v3 model (CC BY 4.0) and Qwen3-ForcedAligner (Apache-2.0) are the two open aligners with Japanese support.

### Cited Findings
- NHK NEWS WEB EASY offers an audio option per article, "though the audio is machine-generated rather than read by a person" — [Tofugu review](https://www.tofugu.com/japanese-learning-resources-database/nhk-news-web-easy/) [snippet]. Multiple third-party scrapers/apps exist (e.g. [Frederick-S/nhk-easy](https://github.com/Frederick-S/nhk-easy), [TianyiShi2001/nhk-easy](https://github.com/TianyiShi2001/nhk-easy)) [snippet] — their existence is not evidence of permission. Official site: [NEWS WEB EASY](https://news.web.nhk/news/easy/) [blocked]. NHK reuse terms: not found (Gap).
- Aozora Bunko: 17,840 works, 17,352 with no copyright restrictions; rules for 朗読配信 are on the guide page — [青空文庫 朗読配信について](https://www.aozora.gr.jp/guide/roudoku.html) [snippet only — blocked]. Aozora Roudoku: ~1,370 titles of free readings, streamable or downloadable, usable "for Japanese language learner listening practice" — [青空朗読](https://aozoraroudoku.jp/) and [YOMUDAKE](https://yomudake.com/aozoraroudoku/), [inapro 2025-09-18](https://inapro.main.jp/20250918/4198/) [snippet]. The 青空 in Browsers work list is CC BY 4.0 — [aozora.binb.jp](https://aozora.binb.jp/) [snippet; applies to the list metadata, not audio].
- YouTube: "YouTube's Terms of Service explicitly ban all forms of scraping unless you're a public search engine, use YouTube's official APIs, or have obtained written permission"; "Embedding YouTube videos is generally allowed, but downloading subtitles may violate YouTube's terms of service"; courts have sometimes sided with scraping of public data but "it will likely be years before the legal questions ... are fully answered" — [ScrapeOps 2026](https://scrapeops.io/websites/youtube/), [JustAnswer IP-law thread](https://www.justanswer.com/intellectual-property-law/q7pnj-want-develop-language-learning-website-student.html), [DEV Community scraping write-up](https://dev.to/qcrao/how-i-scraped-50k-youtube-subtitles-in-2-weeks-for-7-and-the-legal-gray-zones-4b16) [snippet; YouTube ToS page itself blocked]. Big-tech use of scraped YouTube subtitles for AI training drew public criticism in 2024 — [Plagiarism Today 2024-07-18](https://www.plagiarismtoday.com/2024/07/18/youtube-ai-and-the-age-of-content-laundering/) [snippet]
- Forced alignment: MFA Japanese v3.0.0 (CC BY 4.0, ~154 h training data, see Q2) — [mfa-models](https://github.com/MontrealCorpusTools/mfa-models/blob/main/acoustic/japanese/mfa/v3.0.0/README.md) [fetched]; Qwen3-ForcedAligner-0.6B, Japanese character-level timestamps, Apache-2.0 — [QwenLM/Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR) [fetched]; Whisper itself provides segment timestamps (word-level via community forks) — [openai/whisper](https://github.com/openai/whisper) [fetched, timestamps not detailed in extract]
- ReazonSpeech corpus (TV broadcast, source of kotoba-whisper training) — corpus licence not verified this session (Gap); repo code Apache-2.0 — [reazon-research/ReazonSpeech](https://github.com/reazon-research/ReazonSpeech) [fetched]

### Inferences
- The lowest-risk content strategy is: (a) generate your own audio with a licensed TTS (cloud voices or VOICEVOX with credit) over your own or public-domain text (Aozora), aligned with MFA/Qwen3-ForcedAligner; (b) embed YouTube via the official player rather than pulling captions; (c) treat NHK Easy as a link-out, not an ingest, until NHK's terms are confirmed.
- Because Aozora text is public domain, alignment of *your own TTS or licensed narration* to Aozora text has no rights problem; the human Aozora Roudoku recordings likely have their own terms, so do not redistribute them without checking.

### Gaps
- NHK NEWS WEB EASY / NHK site terms for audio and text reuse (site blocked; no search budget left).
- Aozora Roudoku audio redistribution terms (site blocked).
- Learner podcasts with transcripts (e.g. Nihongo con Teppei, YUYU Nihongo) — search not executed before budget ran out; no citations.
- YouTube API caption-download permissions (captions.download requires owner auth in the Data API — not verified this session).

---

## Key Question 6: Licensing and rights pitfalls per engine (cross-cutting)

### Takeaway
Permissive: Whisper (MIT), Qwen3-ASR (Apache-2.0), ReazonSpeech code (Apache-2.0), voicevox_core (MIT), GPT-SoVITS (MIT), pyopenjtalk (MIT), pyworld/CREPE (MIT), MFA models (CC BY 4.0). Copyleft/contractual: VOICEVOX editor/engine (LGPL v3 or paid alternative), Style-Bert-VITS2 (AGPL-3.0 + LGPL component), VOICEVOX and Style-Bert-VITS2 *voices* (per-character credit and use restrictions; some for development only), Kanjium (CC BY-SA 4.0), JVNV voices (CC BY-SA 4.0). Cloud vendors add voice-cloning consent rules that I could not read this session.

### Cited Findings
- Whisper: MIT (code and weights) — [openai/whisper](https://github.com/openai/whisper) [fetched]
- Qwen3-ASR / ForcedAligner: Apache-2.0 — [QwenLM/Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR) [fetched]
- ReazonSpeech code: Apache-2.0 — [reazon-research/ReazonSpeech](https://github.com/reazon-research/ReazonSpeech) [fetched]; corpus licence unverified.
- voicevox_core: MIT (0.16 and earlier differ); voices under separate 音声ライブラリ利用規約 — [VOICEVOX/voicevox_core](https://github.com/VOICEVOX/voicevox_core) [fetched]; voicevox / voicevox_engine: LGPL v3 or a source-disclosure-free licence from ヒホ — [voicevox README](https://github.com/VOICEVOX/voicevox/blob/main/README.md), [voicevox_engine](https://github.com/VOICEVOX/voicevox_engine) [fetched]; character assets in voicevox_resource "for VOICEVOX development use only" absent a separate licence — [voicevox_resource](https://github.com/VOICEVOX/voicevox_resource) [fetched]; credit "VOICEVOX:キャラクター名" required by most characters — [secondary guides](https://crystal-method.com/blog/voicevox-commercial/) [snippet]
- Style-Bert-VITS2: AGPL-3.0 code, LGPL-3.0 `text/user_dict`; JVNV voices CC BY-SA 4.0; amitaro voices need visible credit and forbid adult/political/religious/defamatory use and passing off; no impersonation/deepfakes — [TERMS_OF_USE](https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/TERMS_OF_USE.md) [fetched]
- GPT-SoVITS: MIT — [LICENSE](https://github.com/RVC-Boss/GPT-SoVITS/blob/main/LICENSE) [snippet]; cloned-voice rights are the user's problem (issue #690) [snippet]
- Kanjium accent data: CC BY-SA 4.0 — [kanjium](https://github.com/mifunetoshiro/kanjium) [fetched]; onchou flags a "licensing/attribution caveat" for that data — [onchou](https://github.com/bagustris/onchou) [fetched]
- MFA Japanese acoustic model: CC BY 4.0 — [mfa-models](https://github.com/MontrealCorpusTools/mfa-models/blob/main/acoustic/japanese/mfa/v3.0.0/README.md) [fetched]
- pyopenjtalk MIT / Open JTalk modified BSD / marine Apache-2.0 — [pyopenjtalk](https://github.com/r9y9/pyopenjtalk) [fetched]; pyworld MIT — [pyworld](https://github.com/JeremyCCHsu/Python-Wrapper-for-World-Vocoder) [fetched]; CREPE MIT — [crepe](https://github.com/marl/crepe) [fetched]
- Pipecat BSD-2-Clause — [pipecat](https://github.com/pipecat-ai/pipecat) [fetched]; LiveKit Agents Apache-2.0 with separately licensed turn-detection models — [livekit/agents](https://github.com/livekit/agents) [fetched]
- Azure Pronunciation Assessment: billed as STT; no licensing restriction beyond Azure terms noted — [azure-ai-docs mirror](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/how-to-pronunciation-assessment.md) [fetched]
- YouTube ToS bans scraping incl. subtitles absent API/permission — [ScrapeOps](https://scrapeops.io/websites/youtube/) [snippet]

### Inferences
- A commercial mobile app can legally embed voicevox_core, but shipping VOICEVOX *voices* inside the app needs either per-character compliance (credit in-app, respect each character's restrictions) or a negotiated licence from ヒホ, since the resource repo restricts character assets to VOICEVOX development. Budget legal time here.
- AGPL on Style-Bert-VITS2 means any server-side synthesis endpoint must publish its modified source; the safe pattern is to keep it out of the product or use only for offline pre-generation with permissively licensed voices, honouring CC BY-SA on outputs where it applies.
- Kanjium's CC BY-SA on the accent lexicon would make a derived accent database share-alike; prefer pyopenjtalk/marine (MIT/Apache) for runtime accent prediction if you need to keep data proprietary, and verify naist-jdic's licence.

### Gaps
- ElevenLabs, Google (Chirp 3 Instant Custom Voice), Azure (Custom/Personal Voice), OpenAI voice-cloning and TOS restrictions — vendor pages blocked; not verified.
- COEIROINK full terms (site blocked).
- JSUT corpus licence (relevant if you evaluate on it; commonly non-commercial) — not verified.
- ReazonSpeech corpus licence and whether models trained on it carry restrictions.
