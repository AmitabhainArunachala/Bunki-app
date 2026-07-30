# Bunki v11 — Mobile Interaction Recovery and Product-Design Takeover

## Copy-paste executor prompt

You are taking over the usability, interaction design, and end-to-end functionality
of **Bunki**, an AI-native Japanese learning environment.

This is a recovery assignment, not a cosmetic refinement pass. The current
prototype contains substantial code and many nominal features, but it has repeatedly
been declared “working” based on builds, unit tests, API probes, and source inspection
while the real mobile experience remained confusing or broken. Your primary job is to
make Bunki coherent, calm, self-explanatory, and dependable under actual interaction.

Do not trust any previous completion claim—including this prompt’s description—until
you reproduce it yourself in a real browser.

## Immutable starting receipts

- Canonical product repository: `AmitabhainArunachala/Bunki-app`
- Last observed human-merged GitHub `main`:
  `b42eb31cd537618aa7d87d851bdb7c6d94a9ba31`
- Existing public Sites prototype:
  `https://bunki-living-japanese.amitabha1982.chatgpt.site`
- Sites slug: `bunki-living-japanese`
- Exact prototype source commit tested by the operator:
  `4ab7d293dc5c89a4b55f44995e6225fe1a2e0440`
- Immutable Sites checkpoint: version `11`
- Version-11 message: `Make every immersion article open reliably`

Treat every SHA as stale until fetched and verified. The GitHub product repository and
the Sites prototype are **two distinct source histories**. Do not silently pretend the
prototype is already integrated into GitHub. Begin by recovering both, reading their
governing documents, checking live branches and PRs, and producing a short reconciliation
note that says which source will govern the interaction-recovery work and why. Preserve
both histories.

If you have access to the Sites lifecycle, recover the exact prototype with:

```text
sites edit --slug bunki-living-japanese
```

Use the actual lifecycle command required by the installed Sites skill rather than
copying this shorthand literally.

## Product vision that must remain intact

Bunki is not merely a flashcard app or an article list. It is one interconnected
Japanese-learning organism for a learner starting from zero, N5, or N1:

1. A Japanese–English dictionary with deep word lookup.
2. A kanji dictionary with recursive drill-down from words to individual kanji.
3. A living, FSRS/Anki-like SRS system.
4. Sentence mining from readings, dictionary lookups, transcripts, and AI conversations.
5. A calm article reader similar in usefulness to Todai, supporting real and graded texts.
6. An AI language teacher whose conversations reintroduce the learner’s own vocabulary,
   kanji, grammar, sources, and known/unknown frontier.
7. Transcript ingestion for YouTube, podcasts, and other immersion material.
8. Cross-pollination: material encountered in one context should return later in new
   sentences, conversations, kanji study, and review.
9. The learner’s “known / unknown / n+1 edge” should update from evidence and guide
   recommendations without becoming mysterious or authoritarian.
10. Every complex capability must open from a clean, minimal, almost meditative surface.
    Complexity appears progressively through deliberate taps; it must never overwhelm the
    default screen.

Do not delete this vision merely to simplify the UI. Simplify the *journey through it*.

## Operator’s current verdict

The present experience is unacceptable. Confirm or refute each observation yourself:

- Many article cards do not open at all.
- Some cards say “Read here” or “Read in Zen” but tapping them produces no dependable
  reader transition.
- When a reader does open, the composition appears left-shifted or tilted, with visibly
  unbalanced margins on iPhone.
- The simple Back control works inconsistently and does not reliably restore the prior
  shelf position or context.
- The immersion organization is difficult to understand.
- “Find the edge” is vague. It unexpectedly opens a staged SRS-like packet whose purpose,
  consequences, selection state, and next action are unclear.
- The interface contains controls whose labels do not explain what will happen.
- Fixed navigation, floating actions, and content can overlap on mobile.
- Previous agents relied too heavily on unit tests, source assertions, and isolated API
  checks instead of operating the application like a learner.

The supplied operator screenshots show:

- a dense live-article grid with very small controls and uncertain tap behavior;
- a reading shelf with a headline clipped beneath the header;
- Short / Medium / Full controls that appear to change selection but show the same
  “1 min” result;
- content extending under fixed bottom navigation;
- an unexplained “Learning edge” packet with seven cards preselected and a large
  “Admit 7 to review” action.

These are evidence, not a full bug list. Look for additional failures.

## Governing priority

For this phase:

```text
actual interaction reliability
> comprehensibility
> mobile composition
> calm progressive disclosure
> feature breadth
> test-count optics
```

Do not add another major feature until the existing primary journeys are operable and
understandable.

## Non-negotiable method

### 1. Test the product as a person

Use a real browser automation tool—prefer Playwright through the project’s supported
preview/browser workflow—and exercise the rendered application. Do not substitute:

- source-code grep;
- DOM snapshots without clicking;
- API calls alone;
- unit tests alone;
- screenshots generated without interaction; or
- statements such as “the handler exists.”

Run at minimum these viewports:

- iPhone portrait near `390 × 844`;
- narrow mobile near `375 × 667`;
- tablet portrait near `768 × 1024`;
- desktop near `1440 × 900`.

On touch-sized viewports, perform actual click/tap sequences. Capture screenshots before
and after important transitions. Collect console errors, failed network requests,
uncaught exceptions, focus state, URL/history behavior, scroll restoration, and visible
loading/error feedback.

If the official preview browser is unavailable, follow its documented bounded
troubleshooting path. Do not claim interaction verification. Create a clearly labelled
blocker/evidence note and use the next supported real-browser environment. Do not invent
a Playwright success.

### 2. Build a button and journey inventory

Before editing, inventory every visible actionable element on the five primary tabs:

- Today
- Immerse
- Review
- Coach
- Library

For every button, link, tappable card, segmented control, close control, Back control,
floating action, word token, kanji tile, and grade action, record:

- visible label or accessible name;
- screen and state;
- intended result in plain language;
- actual result;
- pass, fail, ambiguous, or intentionally disabled;
- mobile hit-target size;
- whether progress/loading/error feedback exists;
- whether Back returns to the correct prior state.

The phase cannot close while a visible control is untested or while a dead control remains
visible.

### 3. Repair journeys, not isolated components

Test and repair these complete paths:

#### A. Article discovery → reader → lookup → return

1. Open Immerse.
2. Understand the first screen without documentation.
3. Choose difficulty and length.
4. Tap the title or body of an article card.
5. See an immediate loading state.
6. Land in a centered, balanced, readable article.
7. Tap a word repeatedly through:
   - reading/furigana;
   - simple meaning;
   - full dictionary;
   - memorize.
8. From the word definition, tap each kanji and open its full kanji page.
9. Return to the exact word, exact sentence, exact article, and prior scroll position.
10. Return to the shelf and prior scroll position.

Required article gate:

- Test at least 30 current articles across at least 10 independent publisher domains.
- Record full-text success, labelled-summary fallback, publisher refusal, timeout, and
  parser failure separately.
- A publisher summary must never masquerade as a full article.
- A card must never appear normally tappable and then do nothing.
- An unavailable article must explain the problem and provide a working original-source
  action.
- Titles, main card bodies, and the primary “Read” action must have one consistent result.

#### B. Reader composition

On every mobile viewport:

- equal visual left and right margins;
- no clipped title beneath the global header;
- no left tilt caused by sidebar/grid width, transforms, or fixed elements;
- comfortable Japanese line length and line height;
- no content hidden behind the bottom navigation;
- no accidental horizontal scroll;
- reader chrome collapses completely in Zen mode;
- one faint appearance control may reveal brightness, tone, font size, and font style;
- audio controls appear only when audio exists and actually plays;
- annotation marks appear only when they have an understandable function.

#### C. Back and history

Define one navigation contract and apply it everywhere:

- Back from kanji → exact word definition.
- Back from word definition → exact article sentence.
- Back from reader → exact shelf and scroll position.
- Back from staged learning packet → the exact screen that launched it.
- Browser Back and in-app Back must not fight each other.
- Repeated Back must never strand the user in a blank or inconsistent state.

Write Playwright coverage for these chains, including repeated open/close cycles.

#### D. “Find the edge”

Do not preserve this label merely because it exists.

First identify the actual user job. The likely job is:

> “Show me a small, understandable set of things from what I just encountered that are
> worth learning next.”

Either rename and redesign it around plain language or remove it until it can be explained.
It must not jump unexpectedly into SRS admission.

A coherent version should explain, before showing cards:

- what Bunki noticed;
- why each item is being suggested;
- what selecting an item means;
- what “add to review” will do;
- how many items will be added;
- that nothing is added without explicit approval;
- how to skip, edit, or postpone;
- how this connects to the learner’s article, conversation, or lookup.

Prefer a small recommendation such as three items, not seven preselected items. Default
selection must be conservative. Replace terms such as “staged learning packet,” “admit,”
“acquire,” “known frontier,” and “promotion” in the learner-facing UI unless a normal
person can understand them instantly.

The packet is not itself the review session. After approval, show a short confirmation and
let the learner choose “Review now” or “Return to reading.”

#### E. Review

The actual review screen should be its own minimal experience:

- front;
- reveal;
- back;
- four clear grades: Again/Soon, Hard, Good/Medium, Easy;
- visible next-interval meaning;
- no dashboard noise;
- dependable keyboard and touch behavior;
- Back/Exit that preserves session state intentionally.

Do not mix the card-admission editor with the actual review experience.

#### F. Dictionary and kanji recursion

From any readable Japanese text:

- word lookup is dependable;
- individual kanji in a word are visibly tappable;
- each kanji page includes meaning, on/kun readings, strokes, useful vocabulary, examples,
  and SRS/mining actions;
- returning preserves the exact source context;
- recursive drill-down never traps the user.

## Information architecture target

The user should be able to predict where things live:

- **Today:** one calm next step, current review count, and resume reading.
- **Immerse:** Continue, For You, Live, Saved, and Add/Import.
- **Review:** due cards and review history—not mining setup.
- **Coach:** conversation and corrections grounded in learner memory.
- **Library:** saved articles, mined sentences, dictionary history, transcripts, and
  source memory.

Advanced filters should be secondary or collapsible. The first viewport should not begin
with an abstract slogan, a clipped heading, or a configuration wall.

## Interaction rules

- Entire cards may be tappable only when nested secondary actions are handled accessibly
  and do not trigger the card accidentally.
- Every tap receives immediate visible feedback.
- No loading operation may silently fail.
- No primary action uses 9–10 px text on mobile.
- Touch targets are at least 44 × 44 CSS pixels.
- Fixed elements account for iOS safe areas.
- A disabled control explains why when the reason is not obvious.
- Never show a play icon without a working audio source.
- Never show dotted annotations whose meaning is undiscoverable.
- Never change a length or difficulty selection without visibly changing the resulting
  content, estimate, or explanation.
- Avoid nested click handlers whose propagation creates double actions.
- Preserve focus and screen-reader names.

## Verification artifacts required

Add an interaction test suite that fails for the defects above. Keep unit tests, but do
not use them as the acceptance gate.

The final evidence packet must include:

1. the action inventory with 100% disposition;
2. Playwright journeys for all six paths above;
3. screenshots at all required viewports;
4. before/after screenshots for the reported imbalance and clipping;
5. article-open matrix for 30 articles / 10 domains;
6. console and network-error report;
7. Back/history repetition test;
8. mobile overflow scan;
9. accessibility scan and touch-target audit;
10. exact deployed commit and deployment receipt.

For each claimed fixed journey, provide the exact automated command and its result.
“All tests pass” is insufficient without naming which user behavior the tests performed.

## Work sequencing

1. Recover and reconcile GitHub main and Sites v11.
2. Read all vision, goal, design, architecture, and interaction documents.
3. Run the untouched prototype and create the interaction inventory.
4. Reproduce the operator’s failures.
5. Freeze a short P0/P1 repair list.
6. Fix article opening, reader balance, and Back first.
7. Redesign or temporarily remove “Find the edge.”
8. Repair review, dictionary, and kanji recursion.
9. Simplify the information architecture.
10. Run the full browser evidence matrix.
11. Only then run unit, type, build, and data-integrity tests.
12. Deploy a new immutable checkpoint only after the browser gate is green.
13. Ask John to test a small named set of journeys; do not ask him to rediscover basic
    failures that automation should have found.

## Scope and change discipline

- Preserve the current build before editing.
- Work on one explicit branch.
- Do not merge or self-approve.
- Do not overwrite the public deployment with a knowingly broken intermediate state.
- Do not create another parallel Bunki implementation.
- Do not hide failures by deleting the relevant UI unless the feature is deliberately
  deferred and the deferral is documented.
- Do not populate tens of thousands of synthetic entries as a substitute for interaction
  quality.
- Do not add new architecture merely to make the task appear sophisticated.

## Definition of done for this recovery phase

This phase is complete only when a new learner can, on an iPhone-sized viewport:

1. understand the first screen;
2. open a real article by tapping its title or card;
3. read it in a visually balanced Zen reader;
4. inspect a word and its individual kanji;
5. return through every layer without losing context;
6. understand and deliberately approve a small learning recommendation;
7. complete a minimal SRS review session;
8. exit or go Back reliably;
9. encounter no dead visible buttons; and
10. repeat those journeys across reloads without console errors or corrupted state.

Passing unit tests, compiling, returning HTTP 200, or having handlers in source does not
satisfy this definition.

Begin with evidence. Do not begin by adding features.

