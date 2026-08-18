"""Suspect-reading checker — the furigana-truth gate's scanning half.

RENKAN R3-A (hunt P1): the tokenizer misteaches readings exactly where a
learner trusts them most — deity names in the flagship 検収前 texts rendered
神(しん), classical prose rendered 都(と). This tool is the DETERMINISTIC
scan over every curated shelf body (index.json, archive excluded) that flags
suspect readings; its committed report is the evidence that every flagged
site is either fixed through the reading-override lexicon or explicitly
reviewed correct. verify-native-readings.mjs re-runs the same rules in
JavaScript and fails the battery when any row is open or the committed
report disagrees with the data.

Rules (fixed order, no clock, no rng):

  R1 override-site   a token run matches a lexicon entry's surfaces: every
                     prescribed reading must already be minted (rs:"lexicon")
  R2 kami-on         a standalone 神 token reading anything but かみ
  R3 empty-ruby      a kanji-bearing token with an empty reading (no ruby)
  R4 miyako          a 都 token reading と
  R5 unk-kanji       a kanji-bearing token UniDic downgraded to 記号 — the
                     unknown-word fallback that produces guessed readings

A site covered by a lexicon `accepts` entry (reviewed CORRECT, e.g. 造化|三|
神(しん), 東京|都(と)) is recorded as accepted. Everything else is OPEN and
exits non-zero: fix it through the lexicon + `build_articles.py
--remint-readings`, or review it into `accepts` with a reason.

Usage:
  python check_suspect_readings.py [--report FILE]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_corridor as bc  # noqa: E402

REPO = bc.REPO
ARTICLES = bc.CORRIDOR / "data" / "articles"
DEFAULT_REPORT = REPO / "docs/build-evidence/renkan/furigana-truth/suspect-readings.json"


def sequence_sites(tokens: list[dict], entries: list[dict]) -> list[tuple[int, dict]]:
    """(start index, entry) for every non-overlapping surface-sequence match,
    longest entry first — the same greedy walk the tokenizer's override pass
    uses, so checker and mint see identical sites."""
    ordered = sorted(entries, key=lambda e: -len(e["surfaces"]))
    sites: list[tuple[int, dict]] = []
    i = 0
    while i < len(tokens):
        matched = None
        for entry in ordered:
            surfaces = entry["surfaces"]
            if i + len(surfaces) <= len(tokens) and all(
                tokens[i + j]["s"] == surfaces[j] for j in range(len(surfaces))
            ):
                matched = entry
                break
        if matched is None:
            i += 1
            continue
        sites.append((i, matched))
        i += len(matched["surfaces"])
    return sites


def context(tokens: list[dict], index: int, radius: int = 5) -> str:
    lo = max(0, index - radius)
    return "".join(t["s"] for t in tokens[lo : index + radius + 1])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = ap.parse_args()

    lexicon = json.loads(bc.READING_OVERRIDES_PATH.read_text("utf-8"))
    entries = lexicon["entries"]
    accepts = lexicon.get("accepts", [])

    index = json.loads((ARTICLES / "index.json").read_text("utf-8"))
    curated = [
        row for row in index["articles"] if not str(row.get("file", "")).startswith("archive/")
    ]

    rows: list[dict] = []
    scanned_tokens = 0
    for row in curated:
        body = json.loads((ARTICLES / row["file"]).read_text("utf-8"))
        tokens = body["tokens"]
        scanned_tokens += len(tokens)

        accept_cover: dict[int, dict] = {}
        for start, entry in sequence_sites(tokens, accepts):
            ok = all(
                reading is None or tokens[start + j]["r"] == reading
                for j, reading in enumerate(entry["readings"])
            )
            for j in range(len(entry["surfaces"])):
                if ok:
                    accept_cover[start + j] = entry

        def flag(i: int, rule: str, status: str, note: str = "") -> None:
            rows.append(
                {
                    "article": row["id"],
                    "token": i,
                    "rule": rule,
                    "surface": tokens[i]["s"],
                    "reading": tokens[i]["r"],
                    "status": status,
                    "context": context(tokens, i),
                    **({"note": note} if note else {}),
                }
            )

        # R1 — every lexicon site must be minted through the override pass
        for start, entry in sequence_sites(tokens, entries):
            for j, reading in enumerate(entry["readings"]):
                if reading is None:
                    continue
                tok = tokens[start + j]
                minted = tok["r"] == reading and tok.get("rs") == "lexicon"
                flag(
                    start + j,
                    "override-site",
                    "lexicon-fixed" if minted else "open",
                    entry["word"],
                )

        for i, tok in enumerate(tokens):
            covered = tok.get("rs") == "lexicon"
            accepted = i in accept_cover
            has_kanji = bc.has_kanji(tok["s"])
            # R2 — a standalone 神 must read かみ unless the lexicon or an
            # accepted compound (造化三神) says otherwise
            if tok["s"] == "神" and tok["r"] != "かみ" and not covered:
                flag(
                    i,
                    "kami-on",
                    "accepted" if accepted else "open",
                    accept_cover[i]["word"] if accepted else "",
                )
            # R3 — kanji with no reading renders no ruby at all
            if has_kanji and not tok["r"] and not covered:
                flag(
                    i,
                    "empty-ruby",
                    "accepted" if accepted else "open",
                    accept_cover[i]["word"] if accepted else "",
                )
            # R4 — 都(と) is only ever the administrative suffix
            if tok["s"] == "都" and tok["r"] == "と" and not covered:
                flag(
                    i,
                    "miyako",
                    "accepted" if accepted else "open",
                    accept_cover[i]["word"] if accepted else "",
                )
            # R5 — 記号 on a kanji token is UniDic's unknown-word fallback
            if tok["p"] == "記号" and has_kanji and not covered:
                flag(
                    i,
                    "unk-kanji",
                    "accepted" if accepted else "open",
                    accept_cover[i]["word"] if accepted else "",
                )

    open_rows = [r for r in rows if r["status"] == "open"]
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    report = {
        "kind": "suspect-readings-report",
        "schemaVersion": 1,
        "generatedBy": "prototypes/corridor/tools/check_suspect_readings.py (deterministic — no clock, no rng)",
        "lexicon": "docs/content/reading-overrides.json",
        "scanned": {"articles": len(curated), "tokens": scanned_tokens},
        "statusCounts": counts,
        "openCount": len(open_rows),
        "rows": rows,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", "utf-8")

    print(
        f"· scanned {len(curated)} curated bodies ({scanned_tokens} tokens): "
        f"{counts.get('lexicon-fixed', 0)} lexicon-fixed · "
        f"{counts.get('accepted', 0)} accepted · {len(open_rows)} open"
    )
    for r in open_rows[:20]:
        print(f"  OPEN {r['article']} #{r['token']} {r['surface']}({r['reading']}) [{r['rule']}] …{r['context']}…")
    print(f"report → {args.report}")
    return 1 if open_rows else 0


if __name__ == "__main__":
    raise SystemExit(main())
