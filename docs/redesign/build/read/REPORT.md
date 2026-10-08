# Read room: lane report (written by the lead from the lane's hand-back; the lane's Write call was blocked)

Branch `claude/redesign-lane-read`, final commit `57a1fb90`, merged.

## Before → after
- **Shelf:**
  - The lead story is a full-bleed woodblock at its own 3:2, with registration marks. Under it is an instrument line: a 朱 hairline level seal, the topic, the real character count, and "N of your words" (shown only when above 0). Then the whole title in Shippori 800, with phrase-aware breaks and 禁則.
  - The rest of the shelf is an index of rows: thumbnail, whole title, English line, date.
  - 今日の６本 are living spines: whole vertical titles, never clamped.
  - All door ids, the 未確認 note, the tools panel and the counts are kept.
- **Reader:**
  - The woodblock is a hero whose foot fades into the paper, sized so the first sentence still fits on the first screen. A's double rule is kept.
  - The type is unchanged: 19/22px, furigana at 0.63×.
  - At night: the darkened print, breathing lamplight and diagonal rain. Motion uses transform/opacity only and is off under reduced motion.
  - The play bar follows B's scan-line. It now reads "no recording yet · Kore" / 「音声未収録 · Kore」 instead of "coming soon": 6 label pins changed, logged in VERIFIER_CHANGES.md.
- **Quick look:**
  - It rises with a spring.
  - The headword is in Shippori 800.
  - Each kanji shows its parts, from `D.kanji`/`D.radicals`.
  - "Also in your cards".
  - "Open the web ›" calls `window.openWordWeb`.

## Verifiers (clean build, Chromium)
- **Pass:** verify-design-reader-shelf 37/37, relief, storage-integrity, theme-consistency, corridor-accessibility, lint-ui-language --core-only, redesign-foundation, reader-doors 93/93, annotation-lookup, playback, reader-lookup.
- **Docks:** the Chromium half passes. WebKit can't launch here.
- **verify-reader-gloss:** 76/85. The same 8 sheet-chooser failures occur on the untouched Skin build, so they are inherited.
- **Found and fixed by the lane:** the popup's rise scaled the box 2px too wide (accessibility). It now uses translate only.

## Honest limits
- The shelf head (look-up field, title, note, chips and search) takes about 380px before the lead story.
- The lamplight glows sit at fixed positions, not on each print's real lanterns.
- The popup shows no word family; that is in the web.
- The phone hero is about 144px tall, because the first-screen pin forced the crop.
