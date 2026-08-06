# Validate the SEM semantic tier (sem.json) and report coverage.
#
# SEM is the LLM-authored typed-relation layer (design doc §8.11): each headword
# maps to an ordered list of [related_word, type, note]. This checks the
# integrity the lock relies on and reports how far coverage has reached, so a
# partial pass over the lexicon is never mistaken for a complete one.
import json, os, sys

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
TYPES = {"syn", "fam", "col", "thm", "reg", "ant"}

sem = json.load(open(os.path.join(DATA, "sem.json"), encoding="utf-8"))
wbig = json.load(open(os.path.join(DATA, "wbig.json"), encoding="utf-8"))
lex = set(e[0] for e in wbig)

errors, warnings = [], []
rel_total = 0
ghosts = 0  # relations pointing outside the lexicon (rendered as gold satellites)

for head, rels in sem.items():
    if not isinstance(rels, list) or not rels:
        errors.append(f"{head}: relations must be a non-empty list")
        continue
    seen = set()
    for r in rels:
        rel_total += 1
        if not (isinstance(r, list) and len(r) == 3):
            errors.append(f"{head}: malformed relation {r!r} (want [word, type, note])")
            continue
        target, ty, note = r
        if target == head:
            errors.append(f"{head}: relates to itself (invariant: no self-relation)")
        if target in seen:
            errors.append(f"{head}: duplicate relation to {target}")
        seen.add(target)
        if ty not in TYPES:
            errors.append(f"{head}: unknown type {ty!r} on {target} (allowed: {sorted(TYPES)})")
        if not isinstance(note, str) or not note.strip():
            warnings.append(f"{head}->{target}: empty note")
        if target not in lex:
            ghosts += 1
    if len(rels) < 8:
        warnings.append(f"{head}: only {len(rels)} relations (design target >=8-12)")

in_lex = sum(1 for w in sem if w in lex)
print(f"SEM headwords: {len(sem)}  ({in_lex} in lexicon, {len(sem)-in_lex} extra/N1)")
print(f"relations: {rel_total}  (avg {rel_total/max(1,len(sem)):.1f}/word; {ghosts} out-of-lexicon ghosts)")
print(f"lexicon coverage: {in_lex}/{len(lex)} words = {100*in_lex/len(lex):.1f}%")
if warnings:
    print(f"\n{len(warnings)} warning(s):")
    for w in warnings[:12]:
        print("  -", w)
    if len(warnings) > 12:
        print(f"  ... and {len(warnings)-12} more")
if errors:
    print(f"\n{len(errors)} ERROR(s):")
    for e in errors:
        print("  x", e)
    sys.exit(1)
print("\nOK — schema valid, no self-relations, no duplicates.")
