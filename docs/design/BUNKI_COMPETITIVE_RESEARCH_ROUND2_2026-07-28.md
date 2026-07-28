---
title: 'Bunki — Competitive research round 2: the plateau problem, and what pressure should be'
date: 2026-07-28
project: bunki
artifact_type: design_research
status: active
provenance: 'Prompted by the operator, 2026-07-28: study Migaku and Duolingo plus open-ended research; and the stated complaint that Anki and Kanji Garden "just feel like they never end, and hard to sense or feel progress. And easy to plateau." Research and synthesis: Conductor, sourced below.'
companion: docs/design/BUNKI_THE_MAP_AS_VOYAGE_THROUGH_TIME_2026-07-28.md
---

# Round 2 — the problem the operator actually named

Frozen v1 §10 already metabolised Kanji Garden, renzo, Anki, Todaii and 類義漢字.
This round covers what the operator added on 2026-07-28: Migaku, Duolingo, and
open-ended research. But the useful finding is not about any one app. It is about
the sentence the operator wrote about the two tools they already use most:

> "Kanji Garden app and anki… just feel like they never end, and hard to sense or
> feel progress. And easy to plateau."

That is three distinct failures, and they have one structural cause.

---

## 1. "It never ends" is not a feeling. It is arithmetic.

The reviewed material is blunt about this: **new cards always generate future
reviews**, and no scheduler changes that. FSRS makes the queue smaller than SM-2
would, not bounded. Daily load compounds for roughly the first 30 days and then
plateaus, and the single most common reason people abandon spaced repetition
entirely is the **review-debt spike after a missed stretch** — you return to a
backlog that reads as a bill you cannot pay. One source describes the state as a
hobby that "feels like an unpaid internship."

Sources: [Daily Review Load Management](https://smartrecallai.com/blog/daily-review-load-management),
[The Anki Burnout](https://my-senpai.com/insights/ankiburnout.html),
[challenging my relationship with Anki](https://manabumanda.substack.com/p/challenging-my-relationship-with),
[In defense of Anki](https://clairvoyelle.substack.com/p/in-defense-of-anki-a-response-to).

**The deeper diagnosis, which the sources do not quite say:** in Anki the _only
visible quantity is the queue_. The queue is by construction unbounded, always
regenerating, and it goes to zero every day. So the learner's single feedback
signal is a number that (a) never permanently decreases and (b) shows nothing
they have built. You see the bill. You never see the house.

That is why "hard to sense progress" and "never ends" are the same defect.

---

## 2. What Bunki already has, and what has to be true for it to work

Three of the answers are already in the foundation. This section is about not
wasting them.

**(a) Finite sessions — already built.** The domain plans a sitting and _the plan
never grows_ (the e2e case is literally named "the sitting ends explicitly and
the plan never grows"). That bounds the daily bill, which is the half of the
problem an SRS can solve by itself.

**(b) The map is the counter-quantity, and this is its real job.** The queue
empties daily and shows nothing accumulated. The map only ever accumulates. When
the operator asked for the map to be the emotional centre of the app, this is the
mechanism underneath the aesthetics: **it is the only surface that answers "what
have I built" rather than "what do I owe."** Any design decision that makes the
map decorative rather than the home of that answer is a mistake.

**(c) Routes make finitude concrete — which is why the pilgrimage metaphor is
load-bearing, not decorative.** The Tōkaidō has **53 post stations**. The
Nakasendō has **69**. The Shikoku pilgrimage has **88 temples**. A 一里塚 stood
every _ri_ so a traveller always knew how far they had come.

These are **finite, named, ordered, and marked at intervals** — the precise
opposite of an unbounded queue. "It never ends" has a literal answer: _this road
has 53 stations and you are at the 11th._ No app in the operator's list can say a
sentence like that, because none of them has a road.

This is the single most important finding in this document. The era layers were
chosen for cultural depth; they turn out to also solve the retention problem.

**(d) Plateau becomes diagnosable rather than atmospheric.** A plateau is a real
state — everything due is easy and nothing new is entering — and today it is
invisible because a single mastery number hides it. Bunki forbids that number
anyway (REQ-LM-03), and the capability lenses mean a learner can be _durable on
reading and faint on production_ and see exactly that. Noticing a stall and
naming it is a specific job, and §4 of the map document gives it to the 案内人.

---

## 3. Pressure — the operator wants it, and Duolingo's kind is the wrong kind

The operator asked for pressure. The research on the most sophisticated
pressure system ever shipped is unambiguous about what it buys.

Duolingo's streaks, XP, leagues and boosts produce **engagement without
proportional learning**: learners chase XP instead of difficulty, streaks survive
via freezes and trivially easy lessons, and users with 1,000-day streaks report
being unable to hold a basic conversation. The mechanism is named directly in the
cognitive-science framing — **low-effort recall produces the illusion of mastery
rather than durable memory.**

Sources: [Duolingo's Shallow Learning Trap](https://dev.to/yaptech/duolingos-shallow-learning-trap-gamified-streaks-harmful-habits-4134),
[Users report declining quality as gamification is prioritised](https://biggo.com/news/202509301943_Duolingo_Quality_Concerns),
[Gamification, Motivation, and Contradiction (SSRN)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6846283),
[When Gamification Spoils Your Learning (arXiv)](https://arxiv.org/pdf/2203.16175),
[XP Boosts are driving me mad](https://www.androidauthority.com/duolingo-xp-boost-ux-trap-3674572/).

**But do not throw out the finding underneath it.** The fair summary in the same
material: gamification "doesn't teach — but it can make teaching possible," and
it genuinely supports _persistence, practice frequency, and emotional
regulation_, which are prerequisites for any voluntary learning. So the emotional
-regulation job is real and something in Bunki has to do it. Our answer is the
**atmosphere and the guide**, not a points economy — which is also why the
ambient register in the visual-language document is a feature and not garnish.

### The three honest pressures

Bunki's ban on XP/streaks/badges stands. These three are pressure that comes from
truth, and every one of them is already computable from state we hold:

1. **The road ahead is visible and finite.** You can see how far this route goes
   and where you stand on it. Distance is not motivational copy; it is a count.
2. **Decay is real and visible.** Fragile contracts genuinely dim on the map
   because retrievability genuinely fell. Nothing manufactured — the thing you
   are losing is a thing you actually had. This is loss aversion without a lie.
3. **A stumble opens a branch.** A 分岐 is a consequence, not a punishment: the
   scheduler declares it, the guide shows the repair road, and you rejoin. The
   pressure is that the branch is _there_, in front of you, on the map.

None of the three can be gamed by doing something easy, which is the exact
failure mode of the streak.

---

## 4. Migaku — what to take and what it warns about

Migaku's core is an **immersion loop that does not break flow**: hover
translation, sentence mining and SRS _inside_ the video or article you already
wanted to consume — Netflix, YouTube, web pages — turning a several-minute card
into roughly a 30-second one.

**Take:** this validates the reading surface (lane B4) and the Firehose
direction. The design rule to steal is precise — _the lookup and the capture must
happen without leaving the content_. Bunki's advantage is that a capture here
enters through the evidence gate with provenance, so the resulting card is not a
context-free fragment.

**Warning, and it is a pointed one:** Migaku users in 2026 report
**context-dependent kanji readings coming back wrong**, and AI image generation
that renders the _shape_ of a kanji rather than its concept. That is an AI output
presented as fact, in exactly the place Bunki has spent the whole build
defending: the AI proposes, the evidence gate disposes, and no AI output is ever
presented as verified truth. A competitor shipping that defect is confirmation
the guard rail is worth its cost, not a reason to relax it.

Also worth noting for the operator's own decision-making: Migaku is ~$9/month
standard, ~$399 lifetime, with no permanent free tier.

Sources: [Migaku Review 2026 (immit)](https://immit.co/blog/migaku-review-2026-is-it-worth-it-for-japanese-learners),
[Migaku Review 2026 (wordy)](https://wordy.info/blog/migaku-review),
[Sentence Mining Guide](https://migaku.com/blog/language-fun/sentence-mining-guide-learn-vocabulary-faster),
[Japanese immersion — options for sentence mining](https://lucas.art/blog/japanese-immersion-options-for-entence-mining/).

---

## 5. What this changes in Wave B

- **B1 (map).** The map must be able to state position on a route as a count —
  "station 11 of 53" — because that sentence is the answer to "it never ends."
  Not a percentage, not a mastery score: an ordinal position on a named, finite
  road. Distance markers at intervals (一里塚) rather than a continuous bar.
- **B1.** The map must be legibly _accumulative_: the thing that grows must be
  visible without a diff. If a learner cannot tell in one glance that today added
  something, the map is not doing its job.
- **B4 (reading surface).** Lookup and capture must not leave the passage.
  Measure it: if capturing costs a navigation, it is wrong.
- **B6 (the guide).** Detecting and naming a plateau is an explicit
  responsibility, stated per capability lens, never as one number.
- **All lanes.** No streak, no XP, no league, no boost, no freeze — and no
  near-miss of one under a different name. A "days active" counter is a streak.

---

## Sources

- [Daily Review Load Management: Avoiding Anki Burnout](https://smartrecallai.com/blog/daily-review-load-management)
- [The Anki Burnout: Why 80% of Learners Quit SRS](https://my-senpai.com/insights/ankiburnout.html)
- [challenging my relationship with Anki](https://manabumanda.substack.com/p/challenging-my-relationship-with)
- [In defense of Anki, a response to Luca Lampariello](https://clairvoyelle.substack.com/p/in-defense-of-anki-a-response-to)
- [Duolingo's Shallow Learning Trap](https://dev.to/yaptech/duolingos-shallow-learning-trap-gamified-streaks-harmful-habits-4134)
- [Duolingo Users Report Declining Quality](https://biggo.com/news/202509301943_Duolingo_Quality_Concerns)
- [Gamification, Motivation, and Contradiction (SSRN)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6846283)
- [When Gamification Spoils Your Learning (arXiv)](https://arxiv.org/pdf/2203.16175)
- [Duolingo XP Boosts UX trap](https://www.androidauthority.com/duolingo-xp-boost-ux-trap-3674572/)
- [Migaku Review 2026 — immit](https://immit.co/blog/migaku-review-2026-is-it-worth-it-for-japanese-learners)
- [Migaku Review 2026 — wordy](https://wordy.info/blog/migaku-review)
- [Migaku — Sentence Mining Guide](https://migaku.com/blog/language-fun/sentence-mining-guide-learn-vocabulary-faster)
- [Japanese immersion — options for sentence mining](https://lucas.art/blog/japanese-immersion-options-for-entence-mining/)
- [五街道 (Wikipedia)](https://ja.wikipedia.org/wiki/%E4%BA%94%E8%A1%97%E9%81%93) and [東海道五十三次 (Wikipedia)](https://ja.wikipedia.org/wiki/%E6%9D%B1%E6%B5%B7%E9%81%93%E4%BA%94%E5%8D%81%E4%B8%89%E6%AC%A1) for the station counts
