# The map — screenshot evidence (Campaign E, lane B1)

Captured by `apps/app/scripts/capture-map.mjs`, which serves the real
`expo export --platform web` output over HTTP and drives `/map` in Chromium
at 1100 px wide, growing the viewport to the screen's own scroll
height so every band is laid out before it is framed. The run fails if the
page throws or logs an error, so these images cannot be of a broken screen.

## The four bands

Three era layers and one state that is not a layer. **街道 and 鉄道 are
photographed empty, and that is the finding rather than a gap.** Lane A2′
measured that 9.8% of the dictionary can be placed and all of it lands on
古道; nothing in the data dates a 漢語 word, so a rule that filled the other
two would be a guess. `unknown` is drawn on no era ground at all.

### 古道 `kodo`

The ancient road. The only layer this dictionary can populate: a single native (訓) morpheme is 和語, the oldest lexical stratum. Base 鳥の子 torinoko by day and 藍海松茶 ai-mirucha by night, under a 白緑 byakuroku mist wash.

| light | dark |
| --- | --- |
| ![kodo light](kodo-light.png) | ![kodo dark](kodo-dark.png) |

### 街道 `kaido`

The Edo highway. Rendered, and empty, and it says so on screen. 漢語 spans all three layers and nothing in this dictionary dates it, so no rule places a word here that would not be a guess.

| light | dark |
| --- | --- |
| ![kaido light](kaido-light.png) | ![kaido dark](kaido-dark.png) |

### 鉄道 `tetsudo`

The rail era. Same situation as 街道: real ground, no members, stated plainly. This is also the only register where emitted light is permitted, which in this build means no lit point can appear — there is nothing here to light.

| light | dark |
| --- | --- |
| ![tetsudo light](tetsudo-light.png) | ![tetsudo dark](tetsudo-dark.png) |

### — `unknown`

Not a road, and drawn on no era ground at all. A node whose era we cannot establish sits on a plain card, because defaulting it onto a layer is the guessed era the whole era module exists to refuse. Over this dictionary it is the largest band.

| light | dark |
| --- | --- |
| ![unknown light](unknown-light.png) | ![unknown dark](unknown-dark.png) |

## The whole screen

| light | dark |
| --- | --- |
| ![map light](map-light.png) | ![map dark](map-dark.png) |

## What the page said when it was photographed

Read out of the loaded DOM rather than retyped from the source, so these are
the strings a learner saw.

- routes offered: **6**
- standing: “0 of 0 contracts have evidence behind them.”
- today: “Today has added nothing yet. What is below is what you had already built.”
- position on the road: “Station 0 of 77”
- scrubber: “Now — every layer, as your memory stands today”

The store is empty on a cold load, so every lens is unmeasured and the road
reads station 0. That is the correct rendering of "no evidence yet" and it is
the state the screenshots show; it is not a failure to read the ledger.

## Measured cost, in this browser

| scheme | cold load to interactive | lens change | scrubber step |
| --- | --- | --- | --- |
| light | 1164 ms | 23.5 ms | 25.1 ms |
| dark | 1068 ms | 21.1 ms | 21.6 ms |

**Cold load to interactive** is navigation start until the road has drawn,
which includes the one-off Atlas build over the whole shipped dictionary
(9,245 nodes). It is paid once per session.

**Lens change** and **scrubber step** are the two interactions that redraw
every node on screen, and they are the ones that would expose a per-frame
index rebuild — the defect lane A2 had to repair. Each is measured in the
page from the click to two animation frames later.

**These are Chromium on a build machine, not a phone.** They are a floor on
what a device will do, not a prediction of it. No device, no Safari, no
Firefox, and no screen reader was used for any of this.

