ae2d8e83d5abfc28c

The harness's permission handler is stripping the input from **every** tool call in this session — Bash, Glob, Grep, and StructuredOutput all fail with "required parameter missing" even though my inputs are schema-valid (the error itself says "The tool input from the model was valid. This is a configuration issue in your canUseTool callback"). StructuredOutput therefore cannot ever validate; a minimal payload fails identically to a full one. Since the structured channel is broken at the infrastructure level, the complete spec follows as text in the exact field shape the schema requires, so the caller can parse it field-by-field:

---

## design_tokens

```css
/* ZEN-DOJO v2 — paste into :root above existing rules; extends existing --card-* names, never deletes them */
:root {
  /* stage */
  --stage-0: #0A0D10;            /* page background, deepest */
  --stage-1: #10151A;            /* mid vignette */
  --stage-2: #171E24;            /* lifted floor under card */
  --stage-glow: rgba(111,227,208,0.05);
  --hud-ink: #8FA3AD;            /* 4.6:1 on --stage-0 */
  --hud-accent: #6FE3D0;         /* 2335 cyan — HUD + focus rings ONLY, never text on washi */

  /* washi card */
  --card-bg: #F2EDE2;
  --card-bg-deep: #E9E2D3;
  --card-ink: #26221B;           /* 13.9:1 on washi */
  --card-ink-soft: #5C564A;      /* 6.4:1 */
  --card-ink-faint: #8A8271;     /* 4.5:1 exactly — text floor */
  --card-hairline: rgba(94,82,58,0.28);
  --card-radius: 14px;

  /* vermilion (shu-iro) */
  --shu: #A93226;                /* kana red on washi, 5.6:1 */
  --shu-bright: #D65B44;         /* dark stage only, 4.7:1 on #0A0D10 */
  --shu-press: #8C2A20;

  /* brass hairlines */
  --brass: #A8925C;
  --brass-dim: rgba(168,146,92,0.45);

  /* shadows */
  --card-shadow: 0 1px 2px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.45), 0 24px 64px rgba(0,0,0,0.35);
  --card-shadow-lift: 0 2px 3px rgba(0,0,0,0.5), 0 14px 36px rgba(0,0,0,0.5), 0 32px 80px rgba(0,0,0,0.4);
  --bar-shadow: 0 -1px 0 rgba(255,255,255,0.04), 0 -8px 24px rgba(0,0,0,0.4);

  /* type — self-host Noto Serif JP 400/600 for PWA; Google Fonts acceptable for web deploy */
  --font-jp: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
  --font-serif: "Iowan Old Style", "Palatino", "Noto Serif", Georgia, serif;
  --font-mono: "SF Mono", ui-monospace, "Roboto Mono", monospace;
  --fs-word-front: clamp(44px, 12vw, 56px);
  --fs-word-back: 22px;
  --fs-reading: 30px;
  --fs-sense: 17px;
  --fs-example: 15.5px;
  --fs-hud: 11px;

  /* spacing */
  --sp-1: 8px; --sp-2: 16px; --sp-3: 24px; --sp-4: 32px;
  --tap-min: 44px;

  /* motion */
  --ease-zen: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-press: cubic-bezier(0.34, 1.56, 0.64, 1);
  --t-reveal: 420ms;
  --t-press: 120ms;
  --t-breathe: 9s;
}
```

## answer_face

Exact top-to-bottom order (fixes "crowded back" by demoting the word, giving the reading a full breath line, folding example #2):

Card: `max-width:400px; width:calc(100vw - 32px); padding:28px 24px 24px; min-height:62vh` — content floats, never packs.

1. `.card-word-anchor` — reviewed word at TOP, small: `font: 600 var(--fs-word-back)/1.2 var(--font-jp); color:var(--card-ink); text-align:center; margin-bottom:6px`. Context now, not hero.
2. `.card-hairline` — 1px brass rule, width 56px centered, `margin:0 auto var(--sp-3)`: `height:1px; background:linear-gradient(90deg,transparent,var(--brass-dim),transparent)`.
3. `.card-reading-row` — `display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:var(--sp-3)`:
   - `.card-reading` — kana, THE hero of the back: `font:400 var(--fs-reading)/1.3 var(--font-jp); color:var(--shu); letter-spacing:0.04em`.
   - `.audio-door` — 44px voice button inline right of kana (see audio_door). One row = reading + sound.
4. `.card-senses` — `font: italic 400 var(--fs-sense)/1.55 var(--font-serif); color:var(--card-ink-soft); text-align:center`, max 3 lines via `-webkit-line-clamp:3`. Senses joined by " · " interpunct, NOT numbered lists. `margin-bottom:var(--sp-3)`.
5. `.card-example` — ONE example visible: JP line `var(--font-jp) 15.5px/1.7 var(--card-ink)`; EN below `italic 13.5px/1.5 var(--font-serif) var(--card-ink-faint)`. Left-aligned in centered block, `padding-left:14px; border-left:2px solid var(--brass-dim)` — reads as quiet quotation.
6. `.card-fold` — quiet fold hiding example #2 (rendered only when it exists): full-width 44px tap zone, single centered "…" glyph in `var(--card-ink-faint)` 18px over an 8px hairline. Toggles `aria-expanded`; on open, example #2 slides in via grid-rows animation and glyph swaps to "—". The fold is the only expansion on the card; nothing scrolls.

Grade seals — NOT on the card. Fixed bottom action bar: 4 buttons 再 難 良 易 as circular hanko seals, 52px diameter (>44px), `space-evenly` at 390px. Each: `background:transparent; border:1.5px solid var(--shu-bright); color:var(--shu-bright); border-radius:50%; font:600 20px var(--font-jp)`. 易 alone gets filled treatment (`background:var(--shu-bright); color:#0A0D10`) as the affirmative seal. Interval hints ("3d") under each seal: `font:400 10px var(--font-mono); color:var(--hud-ink)`, faded in with the answer.

Front face: word alone, `var(--fs-word-front)`, dead-center flex; only extra is bottom-center "tap to reveal" hint (`var(--card-ink-faint)` 12px) that stops rendering after 3 reviews (localStorage flag).

## audio_door

Placement: inline flex item immediately right of `.card-reading`, vertically centered on the kana midline. Size: 44×44px tap target, visible ring 36px (hit-slop via padding), `flex:0 0 44px`.

```html
<button class="audio-door" aria-label="Listen" aria-pressed="false">
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M11 5.5 6.5 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.5L11 18.5z" fill="currentColor" stroke="none"/>
    <path class="wave wave-1" d="M15 9.5a4 4 0 0 1 0 5"/>
    <path class="wave wave-2" d="M17.5 7.5a7.5 7.5 0 0 1 0 9"/>
  </svg>
</button>
```

Idle: `border:1px solid var(--brass-dim); border-radius:50%; background:transparent; color:var(--shu); display:grid; place-items:center; position:relative` — a small brass port, the one visibly "device" element on the paper (1600 washi, 2335 speaker grille).

Tap: fires `SpeechSynthesisUtterance` (lang `ja-JP`) or cached blob with the reading; sets `aria-pressed="true"` + `.speaking` for utterance duration, then reverts. Re-tap while speaking = cancel.

Speaking: `.audio-door.speaking { color:var(--shu-press); border-color:var(--brass); }` + wave-flow animation + one ripple: `.audio-door.speaking::after { content:""; position:absolute; inset:-1px; border-radius:50%; border:1px solid var(--brass); animation:door-ripple 1.4s var(--ease-zen) infinite; }`

Reduced-motion speaking: no ripple/waves; steady fill `background:rgba(169,50,38,0.10)` — state still legible.

Autoplay OFF by default; per-session HUD toggle (top-right) enables auto-speak on flip; never before first user gesture (iOS).

## motion

All keyframe assignments live inside one `@media (prefers-reduced-motion: no-preference)` block; only transform+opacity animate.

```css
/* 1. CARD REVEAL — ink-settle crossfade, not a 3D flip; faces absolutely stacked */
@keyframes face-out { from { opacity:1; transform:translateY(0) scale(1);} to { opacity:0; transform:translateY(-8px) scale(0.992);} }
@keyframes face-in  { from { opacity:0; transform:translateY(12px) scale(0.988);} to { opacity:1; transform:translateY(0) scale(1);} }
.card-face.leaving  { animation: face-out 260ms var(--ease-zen) forwards; }
.card-face.entering { animation: face-in var(--t-reveal) var(--ease-zen) 120ms backwards; }
/* stagger answer-face children: face-in 380ms var(--ease-zen) backwards; delays 120/170/220/270/320ms
   (word, hairline, reading-row, senses, example). Total <=700ms. Reduced: animation:none, instant swap. */

/* 2. STAGE BREATH — the hypnotic layer */
@keyframes stage-breathe { 0%,100% { opacity:0.05; transform:translate(-50%,-50%) scale(1);} 50% { opacity:0.11; transform:translate(-50%,-50%) scale(1.06);} }
.stage::before { animation: stage-breathe var(--t-breathe) ease-in-out infinite; will-change:opacity; }
/* Reduced: animation:none; opacity:0.07 fixed. */

/* 3. SEAL PRESS — hanko stamp */
.seal { transition: transform 180ms var(--ease-zen), background-color 180ms linear; }
.seal:active { transform:scale(0.92); transition:transform var(--t-press) var(--ease-press); }
@keyframes seal-confirm { 0%{transform:scale(0.92);} 55%{transform:scale(1.05);} 100%{transform:scale(1);} }
.seal.graded { animation: seal-confirm 240ms var(--ease-press); }
/* Reduced: :active { opacity:0.7; } only. */

/* 4. CARD ADVANCE */
@keyframes card-exit { to { opacity:0; transform:translateY(-18px) scale(0.97);} }
@keyframes card-enter { from { opacity:0; transform:translateY(24px) scale(0.985);} }
.card.exiting { animation: card-exit 240ms var(--ease-zen) forwards; }
.card.entering { animation: card-enter 360ms var(--ease-zen) 160ms backwards; }

/* 5. AUDIO */
@keyframes door-ripple { from { opacity:0.6; transform:scale(1);} to { opacity:0; transform:scale(1.45);} }
@keyframes wave-flow { 0%,100% { opacity:0.35;} 50% { opacity:1;} }
.audio-door.speaking .wave-1 { animation: wave-flow 900ms ease-in-out infinite; }
.audio-door.speaking .wave-2 { animation: wave-flow 900ms ease-in-out 300ms infinite; }

/* 6. FOLD OPEN */
.card-fold-panel { display:grid; grid-template-rows:0fr; transition:grid-template-rows 320ms var(--ease-zen); }
.card-fold-panel > div { overflow:hidden; }
.card-fold[aria-expanded="true"] + .card-fold-panel { grid-template-rows:1fr; }

/* 7. PROGRESS — scaleX, never width */
.progress-fill { transition: transform 500ms var(--ease-zen); transform-origin:left; }
```

## textures

```css
/* WASHI GRAIN — inline feTurbulence data URI, ~350 bytes, zero network */
.card::before {
  content:""; position:absolute; inset:0; border-radius:var(--card-radius); pointer-events:none;
  opacity:0.5; mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='w'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.55 0 0 0 0 0.51 0 0 0 0 0.42 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23w)'/%3E%3C/svg%3E");
}
.card { background:linear-gradient(178deg, var(--card-bg) 0%, var(--card-bg) 55%, var(--card-bg-deep) 100%);
  box-shadow:var(--card-shadow); border-radius:var(--card-radius); position:relative; }
/* pressed-paper inner edge */
.card::after { content:""; position:absolute; inset:0; border-radius:var(--card-radius); pointer-events:none;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(94,82,58,0.18), inset 0 0 0 1px rgba(94,82,58,0.10); }

/* STAGE GRAIN */
.stage-grain { position:fixed; inset:0; pointer-events:none; z-index:0; opacity:0.35;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.04 0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23s)'/%3E%3C/svg%3E"); }

/* HAIRLINES — never 1px solid borders on dark */
.hairline-brass  { height:1px; background:linear-gradient(90deg, transparent, var(--brass-dim), transparent); }
.hairline-device { height:1px; background:linear-gradient(90deg, transparent, rgba(111,227,208,0.35), transparent); } /* HUD only */

/* ACTION BAR — lacquered tray; keep backdrop-filter on ONE element total for 60fps mobile Safari */
.action-bar { background:linear-gradient(180deg, rgba(23,30,36,0.88), rgba(13,17,21,0.95));
  backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
  box-shadow:var(--bar-shadow); border-top:1px solid rgba(255,255,255,0.05); }
```

## stage

Layer order back→front: body gradient → `.stage::before` breath glow → `.stage-grain` → progress + HUD → card → action bar. Three cheap layers, no images, ONE animated node.

- **body/.stage**: `background: radial-gradient(120% 90% at 50% -10%, var(--stage-2) 0%, var(--stage-1) 45%, var(--stage-0) 100%); min-height:100dvh; overflow:hidden` (review room never scrolls; only the fold expands).
- **`.stage::before`** (the breath — the ONLY infinite animation): `content:""; position:fixed; left:50%; top:52%; width:130vw; aspect-ratio:1; transform:translate(-50%,-50%); background:radial-gradient(circle, var(--stage-glow) 0%, rgba(214,91,68,0.03) 40%, transparent 70%); will-change:opacity; z-index:0`. Cyan core + faint vermilion halo = 2335 device warming 1600 lantern light.
- **Progress hairline** (replaces counter chrome): `.progress { position:fixed; top:0; left:0; right:0; height:2px; background:rgba(255,255,255,0.06); z-index:30; }` `.progress-fill { height:100%; background:linear-gradient(90deg, var(--shu-bright), var(--brass)); transform:scaleX(var(--session-ratio,0)); }` — JS sets `--session-ratio = done/total` after each grade.
- **HUD** — two corners only, `padding:max(12px, env(safe-area-inset-top)) 16px`: top-left `.hud-count` remaining count "残 14" (`font:500 var(--fs-hud) var(--font-mono); color:var(--hud-ink); letter-spacing:0.14em`); top-right `.hud-audio-toggle` auto-speak toggle, 44×44, speaker SVG 16px, enabled `var(--hud-accent)`, disabled `var(--hud-ink)` with rotated 1px `::after` strike. No timer, no streak — HUD earns two data points max.
- **Card well**: `.card-well { display:flex; align-items:center; justify-content:center; padding:56px 16px calc(96px + env(safe-area-inset-bottom)); min-height:100dvh; }` — the 56/96 asymmetry floats the card optically above center.
- **Action bar**: `position:fixed; bottom:0; left:0; right:0; z-index:20; padding:14px 20px calc(14px + env(safe-area-inset-bottom)); display:flex; justify-content:space-evenly; align-items:flex-start`. Front-face state: seals rendered at `opacity:0.25; pointer-events:none` until flip, then fade to 1 over 240ms with the answer stagger — the bar never reflows (zero layout shift, stable thumb memory). Seal order preserved: 再 難 良 易.

## must_not_break

1. Existing `--card-*` custom property NAMES keep working: redefine values, add tokens, never delete/rename any property current CSS/JS reads (audit `getPropertyValue`/`setProperty` calls before shipping).
2. Grade buttons: keep existing element type, ids/classes, dataset attributes, and DOM order (再難良易) the SRS JS binds to — restyle via added classes only; never re-create the nodes (drops listeners).
3. Card-flip trigger keeps its selector and event type; the reveal animation wraps the state logic, never replaces it.
4. Front/back face containers stay in the DOM as queried today; crossfade via `.leaving`/`.entering` class toggles — no `display:none` if JS reads offsetHeight/text from a hidden face.
5. All 4 seals, audio door, HUD toggle ≥ 44×44px tap targets including safe-area edges.
6. Every `@keyframes` usage wrapped in `@media (prefers-reduced-motion: no-preference)`; reduced path still communicates state (audio steady fill, instant swap).
7. WCAG AA: `#A93226` on `#F2EDE2` = 5.6:1; `#8A8271` is the text floor (4.5:1); `#D65B44` and `#8FA3AD` only on stage darks (≥4.5:1 on `#0A0D10`); any theme override of `--card-bg` must re-pass these pairs.
8. Zero runtime network requests: system font fallbacks (Hiragino/Yu Mincho) or self-hosted Noto Serif JP; grain textures are inline data URIs.
9. Animate only transform/opacity; exactly one infinite animation (`.stage::before`) and one backdrop-filter (`.action-bar`) on screen; never animate box-shadow or filter.
10. `overflow:hidden` must not clip the card at small heights: `@media (max-height:660px) { .card-well { align-items:flex-start; padding-top:48px; } }`.
11. iOS audio: never call `speechSynthesis`/`audio.play()` before a user gesture; auto-speak activates only after the first manual audio-door tap.
12. Progress fill uses `transform:scaleX`, never width.

## implementation_notes

Build order (each step ships independently; verify at 390px in mobile Safari + Chrome after each):
1. **Tokens** — paste `:root` block above existing rules; grep JS for hardcoded hex to convert to `var()` (esp. kana red, card background).
2. **Stage** — body gradient, `.stage-grain` div (last child of body), `.stage::before` breath, progress hairline. Verify Safari timeline shows only the `::before` compositing while idle.
3. **Card material** — gradient + grain `::before` + inner-edge `::after` + shadows. If `.card::before/::after` are already occupied, move grain to a `.card-grain` child div (same CSS, `position:absolute; inset:0`).
4. **Answer-face reorder** (highest-risk) — pure render-order change in the card template: word anchor, hairline, reading-row (kana + audio door), senses joined with " · ", example 1, fold, fold-panel(example 2). Keep every class the SRS JS queries.
5. **Audio door** — SpeechSynthesis wiring (`lang='ja-JP'`, pick + cache a ja voice from `getVoices()`; hide the door entirely if no ja voice — never render a dead button). Verify on real iOS: first play must be gesture-initiated.
6. **Action bar** — restyle existing seal buttons in place; append interval-hint `<span>` with `pointer-events:none`. Four 52px circles fit at 390px with space-evenly (4×52 = 208px).
7. **Motion pass** — all keyframe assignments inside one `@media (prefers-reduced-motion: no-preference)` block; test with OS toggle on.
8. **QA gates** — Lighthouse a11y ≥ 95; axe contrast scan of both faces; 60fps via Safari Rendering → Frame rate during breath + flip simultaneously; offline PWA reload proves zero network.

Risks: (a) `mix-blend-mode:multiply` on grain inside an animated card can force extra compositing on old iPhones — if flip jank appears, drop the blend mode and halve the grain alpha (0.07 → 0.035). (b) `backdrop-filter` + `position:fixed` has known Safari repaint bugs — if the bar shimmers during card-exit, replace blur with solid `rgba(13,17,21,0.96)`. (c) Decks with 3+ senses or long examples: the senses line-clamp and single-visible-example rule are the crowding firewall — never relax them; overflow goes behind the fold.