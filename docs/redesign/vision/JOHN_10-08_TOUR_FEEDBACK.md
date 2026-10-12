## John's feedback on the side-by-side tour, word for word (2026-10-08 22:31 JST)

He compared the live app (`c56cfc8e`) with this branch at `e1e45a6c`, room by room, at 390×844 in day, night and 日本語, and said "send now". He answered T1–T5, T8, T9 and D1–D7; he gave no answer on T6 (the word web), T7 (Learn), T10 (Me), T11 (the cards) or T12 (the door).

- **T1 (Today: a real home): Close, needs work** — how can we blend these togehter and use both nice? i do like it but also want to polish it more.  My main go to app for japanese is the Japnaese app by renzo, where the opening screen has words and kanji floating by. This was the inspiration for the drift window.  Which i do like, evne htough i think we could clean it up a lot.  It gives a whole explorable UNIVERSE of japanse words and the entire language that i think is a really beautiful feature and becuae it represents all possiblity i like it.  Also, i understand and see teh beneift of a clean Today and stable entry point.
- **T2 (English means English): Close, needs work** — this is nice, but things like *Real Sentences read and recall.. is just very confusing, obtuse and way to generic to mean anyhting at all...   the english is clean though and more understanaalbe, I did like the color of the other side an dthe four windows but maybe not so big.  also, this new build could even be sharper and cleaner.  why do i feel that native ios expeirnce is alreayd way smoother and tighter and crisper than almost everythign we have?
- **T3 (Read: a woodblock magazine): Close, needs work** — Why is the Water kanji the marker for bookshelf?
- **T4 (The reader): Close, needs work** — Still needs to be more clear, more polished, have more contrast, depth, tesxture an clarity. the color theme all blends together too much and looks sloppy and slilghlty confusing.  the top header, the background of the picture, th etitle, the subtitle, the explanaiton (that is too verbose and.. confusing) and the artile itslef, and the bottom are all the exact same make me wanna puke beige that is overused....
- **T5 (Tap any word): Close, needs work** — Not close, needs a lot of work.  THe same thing, it all bledns together! It lacks modularity, it lacks contrast, texture, depth, separtion, user ease, emotional depth, sharp contrast, and stand out clarity. Save and add to list are confusing???  shouldn:t they be one or the other? or click save and then add to list from there?   Open the web?? what does that even mean.  *this sentice, save astk the tutor, practice. very very confusing... "
- **T8 (Cards: the front): Close, needs work** — More sharp, more depth, more contrast, more distinction.
- **T9 (Cards: the back): Close, needs work** — same as above, needs more clarity, more crispness, more tightness.
- **D1 (Grade buttons on a card): Four (Again · Hard · Good · Easy)** — and color coded
- **D2 (The night look): Offer both**
- **D3 (The name): 回廊 KAIRO**
- **D4 (The samurai on a wrong answer): Blood**
- **D5 (Your N1 date and your four fields):** July 2027.    Learning Psychology (neurplasticity, learning about learning, human potential), Yoga and Buddhism and Jain and Hindu history rooted in Japanese history and tied in to moden neuroscience,   Semiconductors and AI and investiing and Hofstatder and recursion and computer science and tech
- **D6 (Price): Different (say in the note)** — lay off the price for now. not there yet
- **D7 (Retire the header's duplicate Learn / Lists icons): Keep them for now** — figure out the smartest way to work with this

---
**Notes from the Mac lead session (Claude). These are mine, not John's; his words above are the authority.**
- **One thread runs through all of it.** Contrast, separation and depth instead of one uniform beige; native-iOS crispness (tight type, hairlines, spacing); plain labels instead of coined phrases. He named "Real sentences · read and recall", "Open the web" and "this sentence · save · ask the tutor · practice".
- **T3:** the shelf seal is 永, which he reads as 水. Either make the marker instantly meaningful or replace it, and answer his question in the PR.
- **T5:** make Save → Add to list one clear path.
- **D1 (four grade buttons):** the deck contract and its verifiers pin two today. If this changes `docs/srs/CARD_CONTRACT_V2.md` or `STANDARD.md`, say so in the PR body, per the standing rule.
- **D3:** rename the app's visible name (wordmark, titles, PWA manifest), not the repo.
- **D4:** note the age-rating effect in the PR.
- **D6:** take the price out of the PR body.
- **Standing rules still hold:** draft PR only, no merge, no deploy, and never weaken a behavioural verifier.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

