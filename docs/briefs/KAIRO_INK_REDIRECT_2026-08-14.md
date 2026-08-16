# 全墨 ZENBOKU — the living-ink redirect (operator direction, 2026-08-14)

**What this is.** On reviewing P1 of the 八彩 rebuild, the operator redirected
the build to the real vision. This document records that direction verbatim,
fixes the interpretation and the budgets, and re-bases the remaining phases.
It AMENDS `KAIRO_GOSAI_REBUILD_SPEC_2026-08-13.md` §4 — the token/material law
of that spec and of `HASSAI_STANDARD_2026-08-13.md` stands unchanged beneath it.

## §1 The direction (operator, verbatim)

> "I thought the whole app was being rebuilt in the style level and same code
> as the webgpu that the kanji were rendered in before. With clickable options
> for all color schemas on every single screen"

Asked directly, the operator chose:

1. Ink-engine reach: **"Everywhere, all out"** — the phone-heat warning was
   given and accepted (as before: "don't worry about the phone getting warm").
2. World options: **tap on the seal opens the eight world-stones** on every
   screen — no hidden long-press, no cycling through eight.
3. The operator's phone is **iOS 26+**: they review the TRUE WebGPU D2Q9
   lattice. WebGL2 remains a first-class fallback for other devices, and it is
   the only path the CI container can drive (its Chromium has no WebGPU).

## §2 The interpretation (the line this build holds)

Real text stays real DOM. A dictionary must remain readable, tappable,
screen-reader-walkable, and 60fps under the thumb — no one reads JMdict senses
off a fluid simulation. What becomes the engine's:

- **The ground.** Under every screen, the ground is a LIVE fluid-ink
  simulation — the same `createLBM` D2Q9 lattice that wrote the kanji — seeded
  per world with ambient "weather" (kōzo drift, dawn pulses, tannin settling,
  lacquer sheen, star shimmer, sea swells, terminal rain), breathing at 30fps,
  answering the reader's touch with gentle impulses. The P1 static paper
  remains as the boot still, the no-GPU floor, and the reduced-motion choice.
- **The heroes.** The review headword, the kanji node, the 書の間 stroke room,
  and the drift door's pigment pools are WRITTEN in true fluid ink by the
  engine's hand (`makeWriter`).
- **The passage.** Changing worlds floods the substrate with the new world's
  pigment; the tokens swap when the wash settles. Reduced motion swaps
  instantly.

## §3 Budgets and laws

- Engine memory is ~120·N² bytes: substrate N=512 (~31 MB GPU; 384 low tier),
  heroes N=1024 (~126 MB) on WebGPU phones. **MAX_LIVE = 2**, and the
  substrate SLEEPS to its snapshot while a hero is writing.
- Substrate pacing: 30fps cap → 12fps breath after ~10 s quiet →
  sleep-to-snapshot after ~30 s. Frame-time regression steps the ladder down
  (30 → 15 → still). `visibilitychange`/`pagehide` snapshot-then-stop, always
  snapshot FIRST. Wake is a ~300 ms snapshot→live crossfade (the engine has
  no state-restore; the pop is hidden, not denied).
- **The amplitude law becomes two-tier.** Steady state (≥2 s after the last
  weather beat or flood): the presented ground layer — live canvas when live,
  static paper when still — stays within ±3% luminance of `--ground` over the
  text column, measured by the verifier. Transitions (flood, weather bursts)
  are exempt but must SETTLE within a hard deadline (2 s), also measured.
  While the live layer presents, the static `body::before` paper is
  suppressed — the two never stack.
- Physics constants are sacred (tau 0.58, evap 0.006, absorb 0.012,
  D·perm < 0.25). One shared GPUDevice. A claimed canvas context is claimed
  forever. Snapshot before stop.

## §4 The phases (each gates on the full battery + the operator's phone)

- **Z1 一拍の世界** — the seal opens the stones on tap, everywhere; the stroke
  page's pigment row joins the stone language (ringed in the world's red).
- **Z2 生きる地** — `corridor-ink.js` (ENGINE-CORE lifted verbatim, canonical
  from then on); the substrate on every screen; the eight world palettes
  authored (ベロ藍・赤富士の錆・波の泡・燐光 are net-new — validated against the
  reference ink PNGs); grounds grown by the P1 `paintPaper` painters at N×N;
  deploy plumbing (pages-app.yml lists, standalone embedding); the Deno
  physics harness; the live amplitude law; the scroll-perf gate.
- **Z3 潮** — the world-change pigment flood + settle law.
- **Z4 書** — the heroes: KanjiVG→writer adapter (medians sampled ×1024/109,
  stroke width SYNTHESIZED — KanjiVG has no outlines; 448 kanji have no data
  and keep an honest still room), 永 parity render as the acceptance gate;
  ink follows the world.

Then the 八彩 spec's P2–P8 surface walk continues ON the living ground.

## §5 Standing rules carried forward

One integration branch (`claude/app-vision-next-steps-wei73a`); merge nothing
to `main` without the operator's word; suites extended, never weakened;
generated files only via their builders; behaviour untouchable (tap circle,
holds, capture scopes, FSRS, storage keys, rights gate).

**Status: OPEN at Z1 (2026-08-14).**

## §6 Operator feel verdicts (amendments by feel, same day)

- **The always-lacquer sheet is REPEALED** ("too dark, no other theme
  options, too hard to read"): the dictionary sheet wears the WORLD's
  raised paper — light in the day worlds, natively dark at night. The
  `--sheet-*` tokens remain reserved for surfaces that may still want
  lacquer by choice.
- **The gallery law** (supersedes the earlier "pace law", which was a
  misreading — operator verdict "still worse than yesterday" traced to it):
  the engine runs EXACTLY as the design gallery ran it. The hand advances
  on the wall clock (`writer.advance(performance.now())`) and the lattice
  steps once per displayed frame (gl2: twice) — on a 120Hz phone the fluid
  receives twice the simulation per stroke, and that density is the
  interior detail of the original renders. The sheet FREEZES the instant
  the last stroke lands: no drying tail — post-finish steps only diffuse
  the deposits and soften the bristle detail. The room opens writing,
  visibly, as the gallery did on promote; no hidden fast-forward exists.
  ゆっくり dilates the clock (speed 0.7 — more physics per stroke, richer
  ink, never poorer). Same day, also reverted: the 引き締め smoothstep in
  the WebGPU render shader (fallback keeps it) — the GPU pipeline is
  byte-identical to the gallery engine.
- **筆順の番号 fixed**: in the living room the numbers answer the chip
  directly (the classic SVG animation owned their inline opacity — they
  never showed reliably over the ink).
