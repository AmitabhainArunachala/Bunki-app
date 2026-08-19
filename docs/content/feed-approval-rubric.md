# Feed approval rubric — rubric-v1 (2026-08-19)

**Authority:** TENOHIRA Decision 4 (operator, 2026-08-19): _"Feed: delegate
with criteria — a rubric distilled from the operator's culls; AI approves
against it with provenance; operator spot-checks."_ This file is the
criteria; every decision it produces is stamped `decidedBy: rubric-v1` with
the rule it applied, in `docs/content/feed-review-queue.json` — the audit
trail. **The operator's own decision always outranks a rubric decision**:
edit any queue row (or say the word) and the rubric yields. Amending this
file bumps the version; decisions are never re-litigated silently.

## Where the rules come from

- The operator's lived complaint (2026-08-19, real-phone month): the
  selection machinery balanced readability bands but was taste-blind — a
  child-murder investigation sat beside football squad numbers as "next
  reading". The named grievance: article selection quality.
- The operator's own prior culls and repairs (OD-16's broken-grammar
  finding; the wikinews-1403 repair; the LINK-SAFE gate) — quality defects
  are cullable, provenance is sacred.
- The app's own authored catalog (the 古事記 / 中今 / 伊勢 graded texts and
  essays) — the operator's editorial spine, written for this shelf.

## The rules

**T1 · No grim-incident reading.** Reject any candidate whose subject is
the death, killing, or bodily harm of a person, or an active criminal
investigation into such. A learner's daily reading is not a police blotter.

**T2 · Courts-and-politics cap.** Civic-institutional news (a cabinet
forming, a party electing a leader) is fine in moderation; court verdicts,
prosecutions, and dissolution orders read heavy and same-shaped. At most
one-third of any approved tranche may be politics/courts, and plain civic
formation outranks litigation when the cap forces a choice.

**T3 · Variety and delight.** Prefer sports, culture, science, nature,
food, human interest, and the operator's editorial lanes over a monotone of
hard news. Easier bands (初級) are scarce and precious: an approvable easy
candidate is never displaced by a harder one.

**Q1 · Machinery defects are cullable.** A candidate the gates convicted
(empty quote pairs, dangling particles, LINK-SAFE residue) may be culled by
the rubric — unless the item is already typed to the operator's decision
sheet (e.g. OD-16's wikinews:1483), in which case it stays pending there.

**L1 · The authored catalog is approved.** Bunki-original graded texts and
essays were written for this shelf by its own editorial hand; their 検収前
marks were retroactive feed-era bookkeeping, not doubt about the content.

**R · Rights are never the rubric's.** Licence verification (kind:
`rights`) requires the operator's own confirmation of terms (OD-24); the
rubric leaves every such row pending, whatever the provenance files say.

**OD · The decision sheet outranks the rubric.** Any item named on
`docs/build-evidence/renkan/DECISION_SHEET.md` stays pending until the
operator rules there.

## Application record

- **rubric-v1 first pass, 2026-08-19** — 55 queue rows: 7 mints approved
  (T2/T3), 5 mints rejected (3 × T1 — the Nantan case; 2 × T2 — court
  verdicts), 1 cull approved (Q1 — wikinews:5991), 1 cull left pending
  (OD-16 — wikinews:1483), 30 legacy originals approved (L1), 10 rights
  left pending (R / OD-24), and **wikinews:45227 left pending**: its
  final-revision caveat is editorial *verification*, not taste — the feed
  gate convicted the first attempt to approve it and the rubric yielded,
  the correct outcome. Verification states are never the rubric's to lift.
  Applied by `feed_apply_review.py`; per-row reasons in the queue file.
