# The nihonga ground layer — screenshot evidence (Campaign E, lane A1′)

Captured by `apps/app/scripts/capture-ground.mjs` from the real
`expo export --platform web` output, in Chromium, at
1100 px wide, with the viewport grown to the specimen's own
scroll height so every register is laid out before it is framed.

## Fonts that actually loaded in the photographed page

Read out of `document.fonts` in the page itself, so this is evidence that
the self-hosted faces registered rather than a claim that they were bundled.

- `Noto Sans JP 400`
- `Noto Sans JP 700`
- `Shippori Mincho 400`

These faces are **subsets** — `src/theme/fonts/coverage.mjs` is the contract
and jōyō is the line it draws. So "the fonts loaded" is not the same claim as
"every glyph here is self-hosted", and the second one is the one worth
checking. The characters below were read out of the era section's own
`innerText` in the photographed page and are outside the subset; they render,
in whatever the host stack supplies, not in Shippori Mincho or Noto Sans JP:

`ō` `胡`

Every **headword** on these cards is jōyō and therefore self-hosted; what
falls back is chrome — a macron in a romanisation, and the odd character in
a period note. The pigment names themselves (檳榔子染, 瓶覗) are *not* on
this page at all: `GroundField` renders no text, which is the museum-card
rule, so they live only in the source and in this README.

## What to look for

- The three grounds are three different places. That is the whole point of
  the redirect: the ground carries **when and where**, and says nothing at
  all about the learner.
- Every ground is a **stack**, not a flat colour — an opaque mineral base, a
  translucent atmospheric wash, and a 胡粉/墨 mat under the content. There
  is no drop shadow anywhere; depth is superposition, because that is what
  iwa-enogu does.
- **Text is always on a card**, never on the ground. That is the museum-card
  rule doing double duty as the contrast guarantee, and it is enforced by a
  scan rather than by convention (`test/theme-ground.test.ts`).
- The marks above each card are the **figure** layer, unchanged from lane A1:
  hue reserved for the one accent, luminance for recall strength, form for
  fragility. Each clears 3:1 against the mat it sits on, in all six
  combinations, and `test/theme-ground.test.ts` is what says so.
- The same band appears twice per card, in two registers: a bare mark on the
  ground, where a map node has no room for a word, and the bounded meter on
  the card, where it arrives with its capability and its word attached. Only
  the three bands that clear 3:1 bare can reach a ground at all — the prop
  type is narrowed, so the two meter-only steps cannot be handed to a field.
- Emitted light appears **only** in 鉄道, and one plan lights at most three
  points however many signals are offered. The cap is **per field**, not per
  screen: two fields side by side would be six, and nothing stops that.
- The three lit points are **one colour and three shapes**. Hue carries no
  state here — all three kinds are 銀朱 ginshu — and the disc, the bar and
  the hollow ring are what tell them apart, which is the same WCAG 1.4.1
  rule that gives every edge state a dash pattern and every band a shape.
  Measured in the photographed page: the lamp is rgb(199, 62, 58) on a field
  of rgb(236, 240, 236) by day (4.37:1) and rgb(26, 34, 43) at night
  (3.16:1). Both clear the 3:1 floor; a first version used 山吹 yamabuki for
  one of the kinds and was 1.58:1 by day, which is the defect this replaces.
- The signals the ration turned down are **printed under the field**, by
  their own basis line. The sentence above them is computed from the plan
  the field renders, not written beside it.
- The era placement of each word is the **specimen's own arrangement**, and
  every card says so. The seed carries no era field yet.

## kodo-light.png — 古道

- Scheme: light
- Nara / Heian → medieval. Base 鳥の子 torinoko by day and 藍海松茶 ai-mirucha by night, under a 白緑 byakuroku mist wash — coarse-to-fine malachite is the same mineral as 緑青 rokushō, which is why the road recedes rather than changes colour.

![古道, light scheme](./kodo-light.png)

## kaido-light.png — 街道

- Scheme: light
- Edo. 砥粉 tonoko ground under a 瓶覗 kamenozoki bokashi sky; at night the register falls back on its own ink, 檳榔子染 binrōjizome, under 縹 hanada. The chart gives no dark ground for the highway, so the darkest value it does give is the one used, and that choice is recorded rather than smuggled.

![街道, light scheme](./kaido-light.png)

## tetsudo-light.png — 鉄道

- Scheme: light
- Meiji → now. 素鼠 sunezumi concrete by day, 褐 kachi night ground under 消炭 keshizumi structure after dark. The only register where emitted light is permitted: four real signals are offered, three are lit and the fourth is named in prose under the field. Every lit point is 銀朱 ginshu — one lamp, so hue says only that a signal is lit — and the three kinds are told apart by form: a filled disc, a semaphore bar, a hollow ring. 山吹 yamabuki is in the register and is not a lamp; it is 1.58:1 against this daylight field, which is below the 3:1 a meaningful graphic owes WCAG 1.4.11.

![鉄道, light scheme](./tetsudo-light.png)

## style-guide-light.png — the whole specimen

- Scheme: light
- The era section in the context of the rest of the vocabulary.

![the whole specimen, light](./style-guide-light.png)

## kodo-dark.png — 古道

- Scheme: dark
- Nara / Heian → medieval. Base 鳥の子 torinoko by day and 藍海松茶 ai-mirucha by night, under a 白緑 byakuroku mist wash — coarse-to-fine malachite is the same mineral as 緑青 rokushō, which is why the road recedes rather than changes colour.

![古道, dark scheme](./kodo-dark.png)

## kaido-dark.png — 街道

- Scheme: dark
- Edo. 砥粉 tonoko ground under a 瓶覗 kamenozoki bokashi sky; at night the register falls back on its own ink, 檳榔子染 binrōjizome, under 縹 hanada. The chart gives no dark ground for the highway, so the darkest value it does give is the one used, and that choice is recorded rather than smuggled.

![街道, dark scheme](./kaido-dark.png)

## tetsudo-dark.png — 鉄道

- Scheme: dark
- Meiji → now. 素鼠 sunezumi concrete by day, 褐 kachi night ground under 消炭 keshizumi structure after dark. The only register where emitted light is permitted: four real signals are offered, three are lit and the fourth is named in prose under the field. Every lit point is 銀朱 ginshu — one lamp, so hue says only that a signal is lit — and the three kinds are told apart by form: a filled disc, a semaphore bar, a hollow ring. 山吹 yamabuki is in the register and is not a lamp; it is 1.58:1 against this daylight field, which is below the 3:1 a meaningful graphic owes WCAG 1.4.11.

![鉄道, dark scheme](./tetsudo-dark.png)

## style-guide-dark.png — the whole specimen

- Scheme: dark
- The era section in the context of the rest of the vocabulary.

![the whole specimen, dark](./style-guide-dark.png)
