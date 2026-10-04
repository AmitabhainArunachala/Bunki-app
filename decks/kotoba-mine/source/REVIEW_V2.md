# Review pass — be the strict native editor

You review v2 card files written by another author against `BRIEF_V2.md` (read it first).
The learner complained that earlier example sentences were "confusing, out of context,
abstract, too abbreviated, not standalone". Your job is to make sure none of that
survives. Edit the files in place.

For EVERY sentence, ask:

1. Would a native speaker actually say or write this? Is the grammar and word choice
   natural (particles, collocations, politeness level consistent)? If not, rewrite.
2. Does it make complete sense on its own, with no missing context? If not, rewrite.
3. With the target blanked, does the context point to this word? If several common words
   fit the blank equally well, add a clue (a collocation, an object, a time phrase).
4. Is the level right? Lv1 short and easy, Lv2 a typical situation, Lv3 fuller.
5. Is the English an accurate, plain translation? Fix if not.
   Also check `reading`, `meaning`, `def_ja` and `tip` for accuracy and plain wording.
   (Note: for 係助 (#80), check whether the reading should be かかりじょ — the
   abbreviation of 係助詞 かかりじょし — and fix it if so.)

Keep everything passing `python3 decks/kotoba-mine/tools/check_v2.py <module>`.
Don't change `n`, `term` or the number of sentences. Use a private scratch folder
(/tmp/claude-0/-home-user-Bunki-app/1f9ab262-1298-5ad0-8c76-728a22b4a735/scratchpad/review-<module>/);
other agents share the scratchpad. Do not touch git.

Reply with, per module: number of sentences rewritten, and up to 5 example
before → after pairs (one line each). Nothing else.
