# ADR-005: Versioned assessment evidence and AI editorial review

Status: accepted for implementation, 2026-09-23.

The assessment prototype contained short generated exercises, while the product
needs full listening-inclusive mocks and durable follow-up into learning.
The operator selected independent AI editorial review without a human-review
prerequisite. Existing v1 records explicitly require human editorial authority;
changing that meaning would misrepresent previously stored evidence.

Add v2 attempts, editorial receipts and learning operations alongside the
unchanged v1 content and legacy record formats. A separate delivery manifest
pins the audio sequence and what is printed for each listening task. Review
binds this presentation, exact content and actual independent model families.
Blind solvers do not receive the answer key. Conflicting answers, uninspected
media, stale hashes or missing rights keep a form out of the released catalog.
AI-reviewed original practice is labeled as such; it does not imply official
JLPT endorsement, psychometric calibration or a predicted scaled score.

A finished sitting and its deterministic learning follow-up share the owned
record transaction. Incorrect answers and flagged uncertainty can propose
learning targets. Unanswered or unreached items describe pacing, and an abandoned
sitting does not create weakness evidence. Existing FSRS grades, due dates,
suspensions and user removals remain authoritative. Sensei reads a projection
of the same durable evidence, without maintaining another learner database.

Named command producers capture the latest record revision inside the existing
write queue. Uncertain acknowledgements retain the exact original request for
retry. Replicated result transport and learning reconciliation are separate
durable stages, with pending reconciliation visible and retryable. Remote Undo
preserves cards studied locally; explicit removal remains authoritative. Result
tombstones also exclude retained local attempts from history and Sensei evidence.

Source clozes use the exact form and item version as their stable identity.
Repeating a sitting adds evidence to the existing target and cannot recreate a
removed card or replace an existing review schedule. Unmapped learning work
remains saved for later enrichment rather than being treated as a recall grade.
Verified received results remain available to Sensei while a dictionary target
is pending. Canonical cards added by an assessment also retain their exact test
sentence and rationale on the revealed answer face, so a dictionary's first
sense cannot silently replace the sense assessed. This context is resolved from
the current bound source and disappears when that evidence is deleted or stale;
it neither changes the dictionary nor records an additional review.

Official and publisher references are separate from permission to redistribute
their content. Personal imports stay private. Public builds accept only explicit
public content and media permissions.

When a reviewed mistake has neither a canonical learning target nor an exact
source cloze, a distinct `question` card retains the admitted question, passage,
recording, and explanation. Its identity binds the exact form, item, and delivery
presentation. Repeated sittings deduplicate the card. An unresolved dictionary
mapping remains pending; it is not replaced by a question card. These cards
measure recall of a previously seen question, not general language mastery.

The `assessmentQuestionPractice` sidecar belongs to a v2 learner record. Sync
carries only its question identity; another device reconstructs the plan from
its independently trusted exact source. Automatic enrollment creates no FSRS
grade. A later actual response is recorded first; a subsequent grade and its
single scheduler journal row commit together. Wrong answers, an explicit
“I don’t know” with no fabricated response, replays, and interrupted audio all
require another pass. Native playback uses the verified media bytes and remains
available across offline transitions. Historical records survive source deletion,
but new responses and grades require a currently visible matching result.

Prospective question commands resolve source visibility from the transaction's
confirmed snapshot, not the screen's last published view. A patch changing the
question sidecar also carries that snapshot's revision into the host reducer.
A journal-only receive between source authorization and dispatch therefore
rejects the patch before any record write. Ordinary unrelated patch semantics
remain unchanged. Undo retains the original grade and appends a revocation;
session history identifies the actual graded card even when intervening cards
were skipped without grading.
