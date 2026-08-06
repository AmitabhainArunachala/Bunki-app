"""Three-signal Japanese difficulty grader (Wayfinder #42).

Three signals, stored separately, disagreement SURFACED, never averaged:

1. ``jread``    — jreadability 1.1.5 (Lee & Hasebe readability formula).
2. ``lexical``  — lexical coverage vs the NINJAL 国語研教育基本語彙 substrate.
3. ``tmr``      — Token Miss Rate, reimplemented from arXiv:2506.04072.

There is NO composite verdict: no combination rule has been ratified in #42,
so none is invented here. ``grade()`` returns the three signals plus a
``disagreement`` block that flags when they pull apart.
"""

from corpus.grading.grade import grade, grade_segments

__all__ = ["grade", "grade_segments"]
