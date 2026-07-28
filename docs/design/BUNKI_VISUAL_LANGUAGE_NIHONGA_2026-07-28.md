---
title: "Bunki — Visual Language: Nihonga palette, era registers, and the animation reference"
date: 2026-07-28
project: bunki
artifact_type: design_research
status: active
provenance: "Direction: operator, 2026-07-28 (Nihonga colour chart, Ghibli-meets-Akira, voyage through time). Research and synthesis: Conductor, sourced below."
supersedes_partially: "Frozen v1 §8 / REQ-UI-08 'ink-and-paper palette, one vermilion accent' — see §5, Reconciliation. This is an operator override of the palette clause only; every other clause of §8 stands."
---

# Visual language — the real reference

The operator asked for the actual thing, not a vibe: *"find out the real nihonga
colour chart and nihonga art and use it for reference so we have depth, colour,
variety and layered aesthetic that is rich and complex but also spacious and
simple where it needs to be."* This document is that reference, with hex values
that come from a published chart rather than from me.

---

## 1. What nihonga colour actually is

Nihonga is not a palette, it is a **material process**, and the material is why
it looks the way it does. Getting this right matters because it tells us what to
imitate and what to skip.

- Pigments are **岩絵具 iwa-enogu** — ground mineral. 群青 *gunjō* from azurite,
  緑青 *rokushō* from malachite, 朱 *shu* from cinnabar, 胡粉 *gofun* from
  calcined oyster shell.
- They are **graded by particle size**, roughly 1 (coarsest) to 15 (finest).
  **Coarse particles read vivid and dark; fine particles read pale and chalky.**
  The finest grade of azurite has its own name — 白群 *byakugun*; the finest
  malachite is 白緑 *byakuroku*. This is the single most important fact for us:
  *one pigment yields a whole tonal ramp, and the ramp is a physical property,
  not a tint slider.*
- They are bound with **膠 nikawa** (hide glue) and laid in **translucent
  layers**. Colour is not mixed on a palette — it is **built by superposition**.
  Depth comes from stacked veils.
- **胡粉 gofun** is the ground coat: an opaque shell-white primer that makes
  everything above it luminous.
- **Gold, silver and platinum leaf** — and 砂子 *sunago*, sprinkled leaf powder —
  are surfaces, not colours.

Sources: [Pigment Tokyo on iwa-enogu](https://pigment.tokyo/en/blogs/article/mineral-pigment),
[Musubi Kiln, "Nihonga: The Art of Japanese Painting"](https://musubikiln.com/blogs/journal/nihonga-the-art-of-japanese-painting),
[Urchins Home, guide to nihonga and mineral pigments](https://urchinshome.com/blogs/stories/not-your-typical-watercolor-set-guide-nihonga-mineral-pigments),
[Nakagawa Gofun catalogue (PDF)](https://www.nakagawa-gofun.co.jp/english/img/catalog_en.pdf).

**Three design rules fall straight out of the material, before any hex value:**

1. **Ramps come from one pigment, not from five hues.** A nihonga-honest ramp is
   群青 → 白群: the same mineral, coarse to fine. Not blue → teal → green.
2. **Depth is layered translucency, not shadow.** Build a surface from washes
   that let the one below show through. No drop shadows, no glows.
3. **The white is a ground, not a highlight.** 胡粉 goes *under*, and everything
   reads luminous because of what is beneath it.

---

## 2. The palette, with real hex values

Values below are the published 日本の伝統色 chart (the *NIPPON COLORS* set,
250 colours, itself taken from the reference book *日本の伝統色 The Traditional
Colors of Japan*), transcribed from the machine-readable copy at
[lcat/nippon-colors](https://github.com/lcat/nippon-colors/blob/master/nipponcolor.json).
Cross-checks against [和色大辞典 colordic](https://www.colordic.org/w) and
[I-IRO 色彩アトラス](https://www.i-iro.com/dic/category/jpn) are noted where the
sources disagree.

### 2.1 Blues — azurite 群青 and the indigo family

| Colour | Reading | Hex | Note |
|---|---|---|---|
| 白群 | byakugun | `#78C2C4` | finest-ground azurite; pale blue-green |
| 瓶覗 | kamenozoki | `#A5DEE4` | "a glance into the vat" — the palest indigo dip |
| 水 | mizu | `#81C7D4` | |
| 浅葱 | asagi | `#33A6B8` | |
| 錆浅葱 | sabi-asagi | `#6699A1` | the muted, aged version |
| 群青 | gunjō | **`#4C6CB3`** | ⚠ see note below |
| 瑠璃 | ruri | `#005CAF` | lapis |
| 縹 | hanada | `#006284` | |
| 藍 | ai | `#0D5661` | |
| 紺青 | konjō | `#113285` | |
| 紺 | kon | `#0F2540` | |
| 褐 | kachi | `#08192D` | near-black blue |
| 鉄紺 | tetsukon | `#261E47` | |

> ⚠ **群青 discrepancy — resolved deliberately.** The NIPPON COLORS set gives
> 群青 as `#51A8DD`, a bright sky blue. colordic gives 群青色 as `#4C6CB3`, a
> deep violet-blue. Both are attested: the first is the *dye/textile* reading,
> the second is the *mineral* reading. Bunki is committing to **nihonga**, which
> is the mineral, so we take **`#4C6CB3`**. Recording the conflict rather than
> silently picking is the point — a later reader will otherwise assume our value
> came from the same table as everything else.

### 2.2 Greens — malachite 緑青

| Colour | Reading | Hex |
|---|---|---|
| 白緑 | byakuroku | `#A8D8B9` |
| 裏柳 | urayanagi | `#B5CAA0` |
| 若竹 | wakatake | `#5DAC81` |
| 緑青 | rokushō | `#24936E` |
| 青竹 | aotake | `#00896C` |
| 木賊 | tokusa | `#2D6D4B` |
| 松葉 | matsuba | `#42602D` |
| 青丹 | aoni | `#516E41` |
| 苔 | koke | `#838A2D` |
| 千歳緑 | chitose-midori | `#36563C` |
| 老竹 | oitake | `#6A8372` |
| 錆青磁 | sabi-seiji | `#86A697` |
| 海松 | miru | `#5B622E` |
| 藍海松茶 | ai-mirucha | `#0F4C3A` |

### 2.3 Reds — cinnabar 朱, iron oxide 弁柄, plant lakes

| Colour | Reading | Hex | Source |
|---|---|---|---|
| 洗朱 | arai-shu | `#FB966E` | thinned vermilion |
| 珊瑚朱 | sangoshu | `#F17C67` | |
| 猩々緋 | shōjōhi | `#E83015` | the loudest red in the set |
| 銀朱 | ginshu | `#C73E3A` | cinnabar |
| 真朱 | shinshu | `#AB3B3A` | cinnabar, deep |
| 鉛丹 | entan | `#D75455` | red lead |
| 弁柄 | bengara | `#9A5034` | iron oxide — the *torii* and post-town red |
| 蘇芳 | suō | `#8E354A` | sappanwood |
| 燕脂 | enji | `#9F353A` | lac/cochineal |
| 代赭 | taisha | `#A36336` | red ochre |
| 紅 | kurenai | `#CB1B45` | safflower |

### 2.4 Earths, ochres, browns — the 茶 family

| Colour | Reading | Hex |
|---|---|---|
| 砥粉 | tonoko | `#D7B98E` |
| 鳥の子 | torinoko | `#DAC9A6` |
| 白茶 | shiracha | `#BC9F77` |
| 黄土 | ōdo | `#B68E55` |
| 利休白茶 | rikyū-shiracha | `#B4A582` |
| 利休茶 | rikyūcha | `#897D55` |
| 媚茶 | kobicha | `#876633` |
| 黄櫨染 | kōrozen | `#7D532C` |
| 煎茶 | sencha | `#855B32` |
| 煤竹 | susutake | `#6E552F` |
| 焦茶 | kogecha | `#563F2E` |
| 憲法染 | kenpōzome | `#43341B` |
| 灰汁 | aku | `#877F6C` |

### 2.5 Yellows

| Colour | Reading | Hex |
|---|---|---|
| 黄蘗 | kihada | `#FBE251` |
| 菜の花 | nanohana | `#F7D94C` |
| 刈安 | kariyasu | `#E9CD4C` |
| 梔子 | kuchinashi | `#F6C555` |
| 山吹 | yamabuki | `#FFB11B` |
| 鬱金 | ukon | `#EFBB24` |
| 蒸栗 | mushikuri | `#D9CD90` |

### 2.6 Whites — 胡粉 gofun and the paper family

| Colour | Reading | Hex |
|---|---|---|
| 胡粉 | gofun | `#FFFFFB` |
| 白練 | shironeri | `#FCFAF2` |
| 鳥の子 | torinoko | `#DAC9A6` |
| 灰桜 | haizakura | `#D7C4BB` |
| 白鼠 | shironezumi | `#BDC0BA` |

### 2.7 Blacks and greys — 墨 sumi and the 鼠 family

| Colour | Reading | Hex |
|---|---|---|
| 銀鼠 | ginnezumi | `#91989F` |
| 素鼠 | sunezumi | `#787D7B` |
| 利休鼠 | rikyūnezumi | `#707C74` |
| 鈍 | nibi | `#656765` |
| 青鈍 | aonibi | `#535953` |
| 消炭 | keshizumi | `#434343` |
| 藍墨茶 | ai-sumicha | `#373C38` |
| 檳榔子染 | binrōjizome | `#3A3226` |
| 墨 | sumi | `#1C1C1C` |
| 黒橡 | kurotsurubami | `#0B1013` |
| 呂 | ro | `#0C0C0C` |

### 2.8 Purples — 二藍 and the murasaki family

| Colour | Reading | Hex |
|---|---|---|
| 藤 | fuji | `#8B81C3` |
| 藤鼠 | fujinezumi | `#6E75A4` |
| 二藍 | futaai | `#70649A` |
| 桔梗 | kikyō | `#6A4C9C` |
| 江戸紫 | edo-murasaki | `#77428D` |
| 深紫 | kokimurasaki | `#4A225D` |
| 紫紺 | shikon | `#3C2F41` |
| 鳩羽鼠 | hatoba-nezumi | `#72636E` |

---

## 3. The animation reference — and the fact that makes it one reference

The operator asked for **"Ghibli meets Akira, late 80's early 90's animation
style and background."** That is not a mash-up of two opposed things. It is one
lineage, and there is a person at the joint.

**Hiroshi Ohno (大野広司)** painted backgrounds in *Akira*'s art department under
art director Toshiharu Mizutani. Midway through production he got a call from
Studio Ghibli — at Kazuo Oga's request — inviting him to be **art director on
*Kiki's Delivery Service* (1989)**. He left *Akira* and took it.
([Riekeles Gallery / Stefan Riekeles](https://twitter.com/reallyriekeles/status/1526582564839776256),
[Halcyon Realms, *Ono Hiroshi Background Art* review](https://halcyonrealms.com/animation/ono-hiroshi-background-art-book-review/),
[It's Nice That, *Akira: The Architecture of Neo Tokyo*](https://www.itsnicethat.com/news/akira-the-architecture-of-neo-tokyo-exhibition-illustration-080622).)

So "Ghibli meets Akira" is 1988–89, one hand, two films. That is the target
register, and it is historically real.

### 3.1 Method — Kazuo Oga

Oga is art director on *Totoro*, *Only Yesterday*, *Pom Poko*, *Mononoke*,
*Kaguya*. His working method is directly transferable to UI:

- **Poster colour** (Nicker gouache), ~24 tubes. Opaque, cheap, fast. He is
  explicit about why: *"Because we have to paint much, we can't use expensive
  paint. Poster colours can show brightness or depth of colour and, above all,
  it is easy to use."*
- **Wets both sides of the paper**, drops pigment into the wet surface, blends
  while wet. A soft atmospheric ground comes first.
- **Large soft passages first, details last.**
- And the sentence that is the whole brief: the result, for all its complexity,
  is **"quite simple in tonal and coloristic design, an important consideration
  for animation backgrounds, which must be understood quickly."**

Sources: [Open Culture](https://www.openculture.com/2021/01/a-look-inside-the-painting-process-of-the-studio-ghibli-artist-kazuo-oga.html),
[Gurney Journey — Demo by Kazuo Oga](https://gurneyjourney.blogspot.com/2017/03/demo-by-kazuo-oga.html),
[Animation Obsessive — *What Kazuo Oga Thinks About When He Thinks About Backgrounds*](https://animationobsessive.substack.com/p/what-kazuo-oga-thinks-about-when).

**That paragraph is the operator's brief in someone else's words.** "Rich and
complex but also spacious and simple where it needs to be" *is* "complex, but
quite simple in tonal design, because it must be understood quickly." We are not
choosing between rich and legible. Oga's answer is: put the richness in the
ground, keep the tonal design simple, and the eye reads it in a beat.

### 3.2 Subject — *Akira*

*Akira*'s backgrounds give us the other half: **density, infrastructure, night,
signage, elevated rail, decay under sodium light.** Production backgrounds were
built in **two layers — a base painted on paper and an upper layer painted on
cel** — which is, again, superposition.
([Colossal](https://www.thisiscolossal.com/2022/06/akira-architecture-neo-tokyo/),
[KGDA press](https://www.kgd-a.org/press/en/explore-akiras-neo-tokyo-through-rare-artworks-by-the-legendary-animes-art-directors).)

### 3.3 The synthesis rule

> **Oga's method, Ohno's subject.**
> A wet, atmospheric, layered ground with a simple tonal design — carrying dense
> infrastructure, rail, and signage. Emissive light is rationed: a handful of
> saturated points against a deep ground, never a glowing interface.

---

## 4. Era registers — colour as the map's time axis

The operator's direction is a **voyage through time**: pilgrimage routes, old
walking trails, *and* train lines. Colour is how time is felt. Three registers,
each drawn from the palette above, each tied to a map layer (§5 of the campaign
brief).

### 4.1 古道 — the ancient road (Nara / Heian)

Kumano Kodō, the Shikoku pilgrimage, cedar, moss, stone steps, fog, lamplight.

| Role | Colour | Hex |
|---|---|---|
| ground | 藍海松茶 ai-mirucha | `#0F4C3A` |
| ground (light) | 鳥の子 torinoko | `#DAC9A6` |
| mid | 緑青 rokushō | `#24936E` |
| mist | 白緑 byakuroku | `#A8D8B9` |
| earth | 黄土 ōdo | `#B68E55` |
| deep | 千歳緑 chitose-midori | `#36563C` |
| ink | 墨 sumi | `#1C1C1C` |

### 4.2 街道 — the Edo highway (post-station era)

Tōkaidō and Nakasendō. Flat planes and hard horizon gradients — Hiroshige's
*bokashi* skies, bengara-red posts, snow, 一里塚 markers.

| Role | Colour | Hex |
|---|---|---|
| sky (upper) | 縹 hanada | `#006284` |
| sky (lower) | 瓶覗 kamenozoki | `#A5DEE4` |
| ground | 砥粉 tonoko | `#D7B98E` |
| structure | 弁柄 bengara | `#9A5034` |
| accent | 鉛丹 entan | `#D75455` |
| snow / paper | 胡粉 gofun | `#FFFFFB` |
| ink | 檳榔子染 binrōjizome | `#3A3226` |

### 4.3 鉄道 — the rail era (Meiji → now)

Elevated track, platform light, concrete, signage. **The only register where
emissive colour is permitted**, and it is rationed.

| Role | Colour | Hex |
|---|---|---|
| night ground | 褐 kachi | `#08192D` |
| structure | 消炭 keshizumi | `#434343` |
| concrete | 素鼠 sunezumi | `#787D7B` |
| rail blue | 群青 gunjō | `#4C6CB3` |
| signal | 銀朱 ginshu | `#C73E3A` |
| platform light | 山吹 yamabuki | `#FFB11B` |
| far light | 白群 byakugun | `#78C2C4` |

---

## 5. Reconciliation with the frozen spec — stated, not smuggled

Frozen v1 §8 / REQ-UI-08 says **"ink-and-paper palette, one vermilion accent."**
Lane A1 built exactly that, correctly, and its `color.ts` is a disciplined
one-hue system. The operator's 2026-07-28 direction asks for depth, colour and
variety. These conflict on their face.

**They are reconciled by splitting the palette into two layers that never do each
other's job** — which is also, exactly, how Oga works.

| | **Ground (atmosphere)** | **Figure (semantics)** |
|---|---|---|
| What it is | the era register: terrain, sky, route, weather, time of day | nodes, marks, controls, text, state |
| Palette | the full nihonga range in §2/§4 | the disciplined system A1 already built |
| Carries meaning? | **Never.** It says *when and where*, never *how well you know it* | **Always.** Hue = attention, luminance = recall, form = fragility/uncertainty |
| Changes with | the era layer, the route, the hour | your memory state only |

**The one-accent rule survives intact, because it was never a rule about
prettiness — it was a rule about semantics.** The ban is on encoding learner
state in hue (the Todaii "global JLPT rainbow" failure the frozen spec rejects
by name). Nothing in §2 or §4 encodes learner state. A malachite hillside is not
a claim about your recall of 山.

**What lane A1 keeps** (all of it, unchanged): the three-channel semantic model,
`RECALL_BANDS`, `EDGE_PATTERNS`, `RECALL_BAND_MARKS`, `CONTRAST_PAIRS`, the
"no hex literal in a component" test, the WCAG 1.4.1 non-colour-encoding rule.

**What changes:** `Palette` gains a ground layer; there is no longer one
`paper`, there are era grounds; and — the load-bearing consequence —
**`CONTRAST_PAIRS` must now be checked against every ground a token can land
on**, not against one paper and one card. That is more test surface, not less.
The existing machinery is what makes it affordable.

### 5.1 Hard constraints on the ground layer

1. Ground colours are declared in a **separate module** from semantic tokens and
   are typed distinctly. A component cannot pull a semantic value out of a ground
   or vice versa.
2. Every era ground declares a **luminance band**, and the semantic ramp is
   resolved *against the active ground*. A token that fails 3:1 or 4.5:1 on any
   reachable ground fails the build.
3. **Emissive/saturated colour is capped** — at most a small fixed count of
   saturated points on screen, only in the 鉄道 register, only for real signals.
4. **Text never sits directly on an era ground.** It sits on a 胡粉/墨 card that
   floats over it. This is the "museum card, not a spreadsheet row" rule doing
   double duty as a contrast guarantee.
5. **No glow, no drop shadow, no confetti.** Depth is superposition — stacked
   translucent washes — because that is what the material does.

---

## Sources

- [Pigment Tokyo — Iwa-Enogu, an Essential Coloring Material for Nihonga](https://pigment.tokyo/en/blogs/article/mineral-pigment)
- [Musubi Kiln — Nihonga: The Art of Japanese Painting](https://musubikiln.com/blogs/journal/nihonga-the-art-of-japanese-painting)
- [Urchins Home — A Guide to Nihonga and Mineral Pigments](https://urchinshome.com/blogs/stories/not-your-typical-watercolor-set-guide-nihonga-mineral-pigments)
- [Nakagawa Gofun — Japanese Painting Catalog vol.1 (PDF)](https://www.nakagawa-gofun.co.jp/english/img/catalog_en.pdf)
- [lcat/nippon-colors — nipponcolor.json (250 colours, hex)](https://github.com/lcat/nippon-colors/blob/master/nipponcolor.json)
- [NIPPON COLORS — 日本の伝統色](https://nipponcolors.com/)
- [和色大辞典 colordic — 群青色 #4c6cb3](https://www.colordic.org/colorsample/2066) and [緑青色 #47885e](https://www.colordic.org/colorsample/2108)
- [I-IRO 色彩アトラス — 日本の伝統色一覧](https://www.i-iro.com/dic/category/jpn)
- [Open Culture — Inside the Painting Process of Kazuo Oga](https://www.openculture.com/2021/01/a-look-inside-the-painting-process-of-the-studio-ghibli-artist-kazuo-oga.html)
- [Gurney Journey — Demo by Kazuo Oga](https://gurneyjourney.blogspot.com/2017/03/demo-by-kazuo-oga.html)
- [Animation Obsessive — What Kazuo Oga Thinks About When He Thinks About Backgrounds](https://animationobsessive.substack.com/p/what-kazuo-oga-thinks-about-when)
- [Halcyon Realms — Ono Hiroshi Background Art book review](https://halcyonrealms.com/animation/ono-hiroshi-background-art-book-review/)
- [Stefan Riekeles on Hiroshi Ohno leaving AKIRA for Kiki's Delivery Service](https://twitter.com/reallyriekeles/status/1526582564839776256)
- [It's Nice That — Akira: The Architecture of Neo Tokyo](https://www.itsnicethat.com/news/akira-the-architecture-of-neo-tokyo-exhibition-illustration-080622)
- [Colossal — Rare Production Drawings from Neo Tokyo](https://www.thisiscolossal.com/2022/06/akira-architecture-neo-tokyo/)
- [KYOTO GLOBAL DESIGN AWARDS — Akira's Neo Tokyo art directors](https://www.kgd-a.org/press/en/explore-akiras-neo-tokyo-through-rare-artworks-by-the-legendary-animes-art-directors)
