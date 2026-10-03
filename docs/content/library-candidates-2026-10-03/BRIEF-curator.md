# Content curator: a library a learner WANTS to read (stage 1: choose, don't import)
Owner (John) on 2026-10-03, reading the shelf: "the articles… are mostly shit. bad content, bad for a learner, too short. too poor quality. not all but most so far."

## What the numbers say (data/articles/index.json in ~/worktrees/Bunki-app/round1_20261002, 126 rows)
- 59 of 126 are under 600 characters; the median is 684. Most are fragments, not reads.
- 40 are government press releases: env.go.jp 14, mhlw 9, gov-online 7, kantei 5, mext 5. Dry and bureaucratic.
- 30 "Bunki originals" are ALL one niche theme, Shinto theology (造化三神, 古事記, 中今, むすひ, 天之御中主神…).
- 10 rows are glossary word definitions of 6–71 characters, not articles.
- 12 Wikinews items, several from 2005–2008, plus idol and celebrity filler.
- The good material is tiny: 3 complete Aozora stories (2,300–4,900 characters) and 2 Global Voices stories.

## The target library (about 110 pieces)
- Varied, human and interesting: everyday life, food, travel, work, family, seasons, nature, science curiosities, culture, true stories from around the world, and real Japanese literature. NOT weeb, NOT niche, NOT bureaucratic.
- Every level, roughly N5 15, N4 20, N3 30, N2 25, N1 20.
- Long enough to be a real read, complete pieces not fragments: N5 400–900 characters; N4 700–1,500; N3 1,200–2,500; N2 and N1 2,000–5,000 (a longer work may be split into chapters that each stand alone).
- Licence-safe for a PUBLIC repo, and recorded per piece:
  - Aozora Bunko (public domain; complete short works by Miyazawa Kenji, Niimi Nankichi, Akutagawa, Dazai, Natsume such as 夢十夜, Terada Torahiko essays, Okamoto Kidō, Hayashi Fumiko and others);
  - Global Voices 日本語 (CC BY 3.0; current human stories);
  - Japanese Wikinews only if current and genuinely interesting (CC BY 2.5);
  - Japanese Wikipedia only for everyday-culture topics (CC BY-SA: note the share-alike duty);
  - new graded originals for N5–N4, where free sources are thin.
- Graded originals: natural Japanese a native would write, about daily life, at the stated level. Each is checked by a second model family for naturalness and level, using the routing in ~/.dharma/agent_keys.env through a parser. Never print or shell-read that file.
- Use the repo's own level signal: the `grading` block that tools/build_articles.py and feed_ingest.py compute (jreadability and JLPT lexicon coverage). Find how to run it on a candidate and report the band.

## Cut list
For every current row, say keep / cut / replace and give one line of reason. Keep at most the 3 best of the Shinto series. Glossary rows leave the shelf (they stay in the dictionary). Government releases go unless one is genuinely interesting to a learner.
Also find which article ids the tests reference (for example `global-voices:2026-09-28-65726` in harnesses and verify-*.mjs), and mark those keep, or note the test that would need updating.

## Output (stage 1, NO repo changes)
Write `~/.dharma/bunki_review/2026-10-03/content/candidates.json`: one entry per candidate with title, source, URL, licence, estimated level and grading band, length, a one-line reason a learner would want it, and the first 2–3 sentences in Japanese. Also write `cuts.json`.
Then write a Lavish page `~/.dharma/bunki_review/2026-10-03/content/page/index.html` John can scan and tick: grouped by level, each candidate a card with its title, a short English gloss, the opening lines, length, source and a keep checkbox. Put the proposed cuts in a separate section. Light, crisp, readable, with dark-mode tokens. Don't open it; Claude opens it.
Final message: plain language, at most 30 lines: counts by level and source, the 5 best finds, any licence doubts, and the test-referenced ids.
