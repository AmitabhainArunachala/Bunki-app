# 収録の声 — voice licences

Generated 2026-08-20 on the build machine (no cloud API). The roster is
interim and was NOT chosen by the operator: the planned 11-candidate shootout
never ran (docs/build-evidence/tenohira/RUN_STATE.md), and on 2026-09-19 he
said 小春音アミ is not the voice. A real audition decides the roster. All synthesis engines and voice
models are free with attribution; this file is that attribution. The
audio pool is licence-separated from the content pools per the
corridor's rights discipline.

| Voice | Engine · model | Terms |
| --- | --- | --- |
| 小春音アミ (primary — all 8,407 graded words + the curated shelf sentences) | Style-Bert-VITS2 JP-Extra · `litagin/sbv2_koharune_ami` | ACML 1.0 — credit: 小春音アミ（あみたろの声素材工房 https://amitaro.net/） |
| 四国めたん (N5–N3 words) | VOICEVOX ENGINE 0.24.1 | free incl. commercial — credit: VOICEVOX:四国めたん |
| ずんだもん (N5–N3 words) | VOICEVOX ENGINE 0.24.1 | free incl. commercial — credit: VOICEVOX:ずんだもん |
| 玄野武宏 (N5–N3 words) | VOICEVOX ENGINE 0.24.1 | free incl. commercial — credit: VOICEVOX:玄野武宏 |
| Kore (article narration — `narration/kore/`, first clips 2026-10-15) | Google Gemini TTS · `gemini-3.8-flash-tts` via the Generative Language API, rendered by `tools/render-narration-gemini.mjs` | Gemini API Additional Terms of Service (https://ai.google.dev/gemini-api/terms): generated output belongs to the developer, no credit line required. Each narration is an adaptation of its article's text and carries that article's licence and attribution (see `data/articles/index.json`; `jawiki:5294446` is CC BY-SA 4.0). |

Format: AAC 32kbps mono 24kHz (`.m4a`). Every word clip passed a g2p
reading gate against the dictionary reading before shipping; mismatched
readings were synthesized from kana and marked in the manifest.

## Article narration · September 2026

The JVNV F1 narration and F1 word clips were withdrawn on 30 September 2026:
in the blind voice audition of 29 September the operator rated F1 1/5, so no
F1 audio ships or plays. The locked narration voice is Google Gemini TTS
**Kore**, with **Charon** as the second speaker. The first Kore clips shipped
on 15 October 2026 as a one-article probe (`narration/kore/jawiki_5294446-*.m4a`,
AAC 64 kbps mono 24 kHz, one clip per sentence, listed in
`article-narration.json`); `index.html` now raises `__KAIRO_NARRATION__` so the
reader fetches that manifest. An article without clips still shows the pending
line (この記事の収録音声はありません) and nothing plays for it.

Word and sentence clips follow the same lock: only a Kore or Charon recording
may play for a word or a shelf sentence. The interim clips credited above remain
in the repository but no longer play. Until approved word clips exist, the
answer card stays silent and says the Kore voice is on its way; until approved
sentence clips exist, sentence practice offers no listening mode and shows the
same 音声準備中 · Kore state.
