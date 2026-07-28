---
title: "Bunki — The map as a voyage through time; cultural weaving; the guide"
date: 2026-07-28
project: bunki
artifact_type: design_direction
status: active
provenance: "Direction: operator, 2026-07-28 (voyage through time; pilgrimage routes and old walking trails as well as train lines; AI as constant-presence guide; assessment-driven planning with SRS-dictated bifurcation). Synthesis and the answers in §3 and §4: Conductor, at the operator's explicit request to go deeper."
companion: docs/design/BUNKI_VISUAL_LANGUAGE_NIHONGA_2026-07-28.md
---

# The map as a voyage through time

## 1. Where the metro map came from — the honest provenance

The operator asked whether the map idea was mine or theirs. It is theirs, and it
is in the frozen spec in their own words.

Frozen v1 §1 defines the product's name:

> **Bunki (分岐, "branch point" — a railway term; gifts the visual language of a
> branching metro map)**

Frozen v1 §8 already asks for a **constellation / metro map where brightness IS
FSRS retrievability**, with a **time scrubber**.

So: the railway metaphor, the branching, the map, brightness-as-retrievability
and the time scrubber are all operator-authored and frozen. What I added on top
was stations carrying depth, 分岐 as the repair-routing metaphor, and the 案内人.
What the operator added on 2026-07-28 — and it is better than my version — is
that **the rail layer is only the newest layer**. Underneath it are the old
walking roads.

---

## 2. Three route layers, one continuous road

The map is not a diagram of one network. It is **one country seen at three
depths of time**, and you can scrub between them.

| Layer | Era | The real thing | What it carries |
|---|---|---|---|
| **古道** | Nara / Heian → medieval | Kumano Kodō; the Shikoku 88-temple pilgrimage; mountain paths, stone steps, cedar | The oldest stratum: 訓読み, native vocabulary, the first Chinese imports, Buddhist vocabulary |
| **街道** | Edo | The 五街道 from Nihonbashi — Tōkaidō (53 post stations), Nakasendō (69), Nikkō, Ōshū, Kōshū; 一里塚 every *ri*; 宿場 towns | The literate-commoner stratum: 漢語 in daily use, trade and craft vocabulary, the vocabulary of travel and place |
| **鉄道** | Meiji → now | The rail network laid over the old roads; the Tōkaidō line follows the Tōkaidō | The modern stratum: 和製漢語 (Meiji translation coinages), katakana loans, signage, contemporary registers |

Sources for the historical layer: [五街道 (Wikipedia)](https://ja.wikipedia.org/wiki/%E4%BA%94%E8%A1%97%E9%81%93),
[東海道五十三次 (Wikipedia)](https://ja.wikipedia.org/wiki/%E6%9D%B1%E6%B5%B7%E9%81%93%E4%BA%94%E5%8D%81%E4%B8%89%E6%AC%A1),
[nippon.com on the Tōkaidō's 400th](https://www.nippon.com/ja/japan-topics/g02415/),
[中山道六十三次 overview](https://nomichi.me/whats-nakasendo/).

**The scrubber does double duty, and this is the design's best single idea:**

- Pulled one way it is **your** history — the event-sourced replay of your own
  memory state, already built, already honest.
- Pulled the other way it is **the language's** history — the era layers above.

One control. Two times. They are the same gesture because they are the same
question: *how did this get here?*

---

## 3. The cultural weaving — my answer, since you asked for it

The operator's own words: *"That's a good question because I don't have a clean
answer. So maybe go deeper into what you think… or how you think this should
work."* So here is my actual position, and the reason for it.

### 3.1 Culture is not a content type. It is the coordinate system.

Every Japanese-learning app that has tried "culture" has shipped it as a tab: a
notes section, a trivia card, an article feed. It is always the first thing
abandoned, because it is *beside* the learning rather than *under* it.

The alternative: **every word and kanji has a when and a road.** Not as a fun
fact appended to a card — as its **position on the map**. Where a node sits is
which era it entered the language in and by what route it came. The cultural
layer is not content laid on top of the map. It **is** the map's coordinate
system.

That gives us something no flashcard app has: a word's *place* is meaningful
before you read a single word of prose about it. You see 電話 sitting on the rail
layer and you already know, wordlessly, that it is a Meiji coinage. You see 山 on
the ancient road and you know it was always here.

### 3.2 駅 is the proof, and it is the operator's own example

The operator listed 駅 as one of the kanji whose cultural depth they want. It is
the keystone, because **駅 is the only character that exists on all three layers
at once, and travelled between them for real:**

- Under the 律令 system, a **駅家 (うまや)** was a post-station placed along the
  official roads — by the code, roughly every 30 *ri* — holding horses, lodging
  and provisions for government couriers. The character takes 馬 as its radical
  for exactly that reason. → **古道 layer.**
- In the Edo period the same function is the **宿場** of the 五街道, with 一里塚
  marking the distance. → **街道 layer.**
- When the railways were laid in the Meiji era, **the old word 駅 was taken back
  up** to name the new stations. → **鉄道 layer.**
- And the old sense is still alive in **駅伝** — the long-distance relay race,
  which is literally the post-horse relay system's name.

Sources: [駅 (Wikipedia)](https://ja.wikipedia.org/wiki/%E9%A7%85),
[駅家 — Hyōgo Prefectural Museum of Archaeology](https://www.hyogo-koukohaku.jp/modules/guidance/index.php?action=PageView&parent_category_id=3&language=ja&number=28),
[コトバンク 駅](https://kotobank.jp/word/%E9%A7%85-441405),
[漢字ペディア 駅](https://www.kanjipedia.jp/kanji/0000419400).

That is the whole thesis in one character: the map's three layers are not a
metaphor imposed on the language. **The language actually travelled that road.**

### 3.3 空海 — the origin node, also the operator's example

空海 (Kūkai) is where the ancient layer begins, and he is a route rather than a
person-fact: he sailed with the 遣唐使 mission to Tang China, brought back
esoteric Buddhism, and is the founder-figure of the Shikoku 88-temple pilgrimage
— which is a **literal walking route on the 古道 layer**. His name is 空 sky + 海
sea. A learner who taps 空 or 海 can walk to him; from him they can walk the
pilgrimage; on that pilgrimage sit the Buddhist-import vocabulary nodes.

### 3.4 奥さん — culture as the character's own spatial sense

奥 is *interior, depth, the back of a space*. 奥さん is "the person of the inner
rooms." The social history is not a trivia note bolted on — it is **the
character's core meaning applied to a house**. Which is also why 奥深い means
profound and 奥義 means an inner secret. One node, one meaning, three registers.

**This is the model for every cultural note in the app**: the note is *the
character explaining itself*, never an encyclopedia paragraph.

And it explains the operator's stated impatience with Heisig: Heisig invents a
private story to make a character stick. This does the opposite — it gives you
**the character's real story**, which is more memorable *and* true, and which
connects to other characters instead of being a disposable mnemonic.

### 3.5 The rule that keeps it from becoming a lecture

> **Ambient in the environment. On-demand in the text.**

The operator asked what I thought about ambient-vs-explicit, and offered
*"between the animation and the lessons it could be a gentle ambient vibe that
can deepen and be a selling point."* I agree, with one sharpening:

- **The atmosphere is always on and never asks anything of you.** The era
  register you are in, the road under your feet, the light, the season — all
  continuous, all wordless. This is the selling point, and it costs the learner
  nothing.
- **Words are never on unless you reach for them.** A cultural note is *one
  line* on the museum card. Tapping opens the thread. Nothing cultural ever
  interrupts a review, blocks a session, or is graded.
- **It never becomes a claim about your knowledge.** Reading about 駅 is exposure,
  not retrieval — the existing evidence rule already forbids it counting.

That is what makes culture a deepening rather than a tax: it is felt
continuously and read voluntarily.

---

## 4. The guide — 案内人

The operator's direction: *"整理: 案内人 か 先輩 か 導く人"*, a **constant
presence**, but *"let's hold off on defining a fixed character."* And: *"most of
it should revolve around the AI's intuitive assessment of the user's use and
current understanding, and base guidance and long-term and short-term plans both
off of that conversation style, as well as traditional static elements where the
SRS system helps dictate where the learning bifurcates to."*

Character is deferred. **These four things can be committed now without deciding
character**, and they are what make it a guide rather than a chatbot:

### 4.1 It has a position on the map

The guide is not a bubble in the corner. It is **somewhere on the road, ahead of
you**. It walks. When you branch, it is at the branch. This one decision does
more for "constant presence" than any amount of personality writing, and it
means the guide can be redesigned later without re-architecting anything.

### 4.2 Assessment is conversation, not a placement test

No level quiz. The guide talks; from the conversation it forms an estimate of
where the learner actually is — which is the operator's stated original wound:
*"nothing could actually map the particular gaps that developed over the years."*

The estimate produces two things:

- a **long-term route** — which era layers and which domains this learner is
  walking toward, in months;
- a **short-term plan** — the next few stations, in days.

Both are **visible, editable, and revisable**, and both are written down as
records with provenance, so a learner can see what the guide believed and when.

### 4.3 SRS dictates the bifurcation — and the guide does not get a vote

This is the division of labour, and it is a **hard boundary**, not a style
preference:

| | Decides | Never does |
|---|---|---|
| **FSRS / evidence gate** | when a contract is due, when it is fragile, when a stumble becomes a **分岐** | speak, motivate, explain |
| **案内人** | route, plan, framing, explanation, what to talk about next | mint evidence, write a memory state, override the scheduler, mark anything known |

A branch point is **caused by the data** — a stumble, a fragile contract, a
capability lens that lags the others. The guide *narrates and routes*; it does
not decide. That preserves REQ-ARCH-04 (the evidence gate is the sole factory
for accepted evidence) and the AI no-write rule exactly as they stand, while
still giving the operator what they asked for: a presence that is always there
and always has an opinion about where to go next.

Being the one who *notices* the branch and *offers the road* is a bigger role
than being the one who scores you. It is also the only version that stays honest.

### 4.4 Why 分岐 finally means something

The product is named for a branch point. Until now that was a name. With three
route layers and a guide standing at the fork, 分岐 becomes the actual central
verb of the app: **you stumble, the scheduler declares a branch, the guide shows
you the road that repairs it, you walk it, and you rejoin.** The frozen spec
already specifies dimmed untaken rails and evidence-defined rejoin. It was
always a railway word.

---

## 5. What this changes in the build

- **Lane A1 (design system)** keeps its whole semantic architecture and gains a
  ground layer — see the companion document, §5. This is an extension, not a
  rewrite.
- **Lane A2 (projections)** gains an **era/route attribute** per node, so the
  map can lay nodes on the right layer. Sourcing that attribute honestly (from
  dictionary metadata where it exists, marked as unknown where it does not) is
  part of the work, not a placeholder.
- **Wave B's map lane** builds the three layers and the dual-reading scrubber,
  not a single metro diagram.
- **A new lane** owns the guide: position on the map, conversation-driven
  assessment, the long/short plan records, and the hard boundary in §4.3 —
  enforced by a test, not by a promise.
