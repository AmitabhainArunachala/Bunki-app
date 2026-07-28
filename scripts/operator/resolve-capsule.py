#!/usr/bin/env python3
"""Resolve an append-only CAPSULE.md merge by keeping BOTH sides, in order.

CAPSULE.md is the multi-agent evidence log: every lane appends its own appendix
and nothing is ever rewritten. So a conflict in it is never a real disagreement —
it is two lanes having appended at the same offset — and the correct resolution is
always "keep ours, then keep theirs".

Exits non-zero if any conflict marker survives, so a caller can never stage a
half-resolved file. That check is line-anchored: a substring test for '<<<<<<<'
false-positives on prose that quotes a conflict marker, which is exactly how
markers reached an integration branch on this project once already.
"""
import re
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else 'docs/build-evidence/CAPSULE.md'
MARKER = re.compile(r'^(<<<<<<< |=======$|>>>>>>> )')

lines = open(PATH).read().split('\n')
out, i, regions = [], 0, 0
while i < len(lines):
    if lines[i].startswith('<<<<<<< '):
        j = i + 1
        ours = []
        while j < len(lines) and lines[j] != '=======':
            ours.append(lines[j])
            j += 1
        if j >= len(lines):
            sys.exit(f'unterminated conflict region starting at line {i + 1}')
        j += 1
        theirs = []
        while j < len(lines) and not lines[j].startswith('>>>>>>> '):
            theirs.append(lines[j])
            j += 1
        if j >= len(lines):
            sys.exit(f'unterminated conflict region starting at line {i + 1}')
        out.extend(ours)
        out.append('')
        out.extend(theirs)
        i = j + 1
        regions += 1
    else:
        out.append(lines[i])
        i += 1

text = '\n'.join(out)
survivors = [n for n, line in enumerate(text.split('\n'), 1) if MARKER.match(line)]
if survivors:
    sys.exit(f'markers survive at lines {survivors[:5]} — refusing to write')

open(PATH, 'w').write(text)
print(f'{PATH}: kept both sides of {regions} region(s), 0 markers remain')
