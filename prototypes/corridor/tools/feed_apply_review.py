"""連環 R2-D — apply the operator's decisions from the feed review queue.

The queue (docs/content/feed-review-queue.json) is the ONLY door out of
検収前. The operator edits a row's "decision" — from a phone, in any editor —
and this command applies exactly what was decided, nothing more:

  mint + approved   the article's review flips human-review-pending →
                    approved and 検収前 leaves its sourceLabel (index + body).
  mint + rejected   the candidate leaves the shelf (index row + body file)
                    and is restored to the minted archive it came from; its
                    queue row remains as the tombstone that stops re-minting.
  cull + approved   the item leaves the minted artifacts (archive or shelf).
                    The committed dataset row in archive.jsonl is untouched —
                    datasets are source, artifacts are product.
  cull + rejected   nothing happens; the tombstone stops re-proposing.
  rights + approved the source's terms have been VERIFIED by the operator:
                    the queue row's own licence text is copied onto the shelf
                    row and its body, 検収前 lifts, pendingVerification clears.
                    Edit the queue row's "licence" first — this command copies
                    what you wrote; it never invents terms.
  rights + rejected the material leaves the shelf (index row + body file); the
                    tombstone stops it being re-proposed.
  legacy + approved the pre-feed 検収前 original is accepted: review flips to
                    approved and 検収前 leaves its sourceLabel (index + body).
  legacy + rejected the original leaves the shelf (index row + body file);
                    its provenance source in docs/content/ stays untouched
                    and the queue row remains as the tombstone.
  anything pending  untouched. This command NEVER decides — deciding is the
                    operator's; unknown kinds or decisions fail the whole run.

Idempotent: applying the same queue twice changes nothing the second time.

Usage:
  python feed_apply_review.py            # apply every decided row
  python feed_apply_review.py --dry-run  # say what would happen
"""

from __future__ import annotations

import argparse
import bisect
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_articles as ba  # noqa: E402
import build_corridor as bc  # noqa: E402
from feed_ingest import (  # noqa: E402
    ARCHIVE_INDEX_PATH,
    ARCHIVE_JSONL,
    ARTICLES,
    INDEX_PATH,
    QUEUE_PATH,
    REPO,
    TITLE_EN_SOURCE,
    load_titles,
    page_number,
)

KINDS = {"mint", "cull", "legacy", "rights"}
DECISIONS = {"pending", "approved", "rejected"}


def restore_to_archive(candidate_id: str, archive_index: dict, tagger, jlpt_maps) -> bool:
    """A rejected shelf candidate returns to the minted archive: its light
    index row AND its body are rebuilt from the committed dataset through the
    same machinery that minted it, so the restored copy carries today's
    reading lexicon. Only the NINJAL pair — which needs a substrate this
    environment cannot fetch — is carried across from an older copy."""
    if any(row["id"] == candidate_id for row in archive_index["articles"]):
        return False
    source = next((rec for rec in bc.read_jsonl(ARCHIVE_JSONL) if rec["id"] == candidate_id), None)
    if source is None:
        raise SystemExit(f"{candidate_id}: not in {ARCHIVE_JSONL} — cannot restore")
    meta = source.get("meta", {})
    # The English title travels with the row. A rejected mint used to come
    # back without one — the single row out of 683 with no titleEn, so the
    # shelf's `if (bi() && a.titleEn)` silently dropped it in bilingual mode
    # and that one article read Japanese-only for no reason a learner could
    # see (E3 round-D, data-licence lens). It is the same map the mint used,
    # carried across with its provenance rather than re-derived.
    title_en = load_titles().get(source["id"], "")
    a = {
        "id": source["id"],
        "title": source["title"],
        "text": source["text"].replace("\r\n", "\n").strip(),
        "source": "ja.wikinews",
        "sourceLabel": "ウィキニュース",
        "pool": "proprietary_safe",
        "licence": "CC BY 2.5",
        "attribution": "ja.wikinews contributors, CC BY 2.5",
        "url": meta.get("url", ""),
        "date": meta.get("date", ""),
        "rubySource": "tokenizer",
        "file": "archive/" + ba.slugify(source["id"]) + ".json",
    }
    if title_en:
        a["titleEn"] = title_en
        a["titleEnSource"] = TITLE_EN_SOURCE
    tokens, para_starts = ba.tokenise_paragraphs(a["text"], tagger)
    grading = ba.grade_article(a["text"], tokens, tagger, jlpt_maps)
    # The body is ALWAYS rewritten from a fresh tokenisation. A pre-promotion
    # copy may still be lying around, and trusting it silently undid the R3
    # reading lexicon: a rejected 藤田譲瑠チマ came back reading ゆずる with
    # empty ruby beside it (E3 round-A, data-licence lens). What genuinely
    # cannot be regenerated here is the NINJAL pair, which needs a substrate
    # this environment's egress cannot fetch — so that, and only that, is
    # carried across from the older copy.
    existing = None
    if (ARTICLES / a["file"]).exists():
        try:
            existing = json.loads((ARTICLES / a["file"]).read_text("utf-8"))
        except (OSError, ValueError):
            existing = None
    if existing:
        old_signals = (existing.get("grading") or {}).get("signals") or {}
        new_signals = grading.get("signals") or {}
        for key in ("lexical_coverage", "tmr"):
            old = old_signals.get(key)
            new = new_signals.get(key)
            if old is not None and (new is None or new.get("unavailable")):
                new_signals[key] = old
    record = dict(a)
    record["tokens"] = tokens
    record["paras"] = para_starts
    record["grading"] = grading
    record["truncated"] = False
    (ARTICLES / a["file"]).write_text(
        json.dumps(record, ensure_ascii=False, separators=(",", ":")), "utf-8"
    )

    row = {k: v for k, v in a.items() if k != "text"}
    row["chars"] = len(a["text"])
    row["snippet"] = a["text"].replace("\n", " ")[:64]
    jl = grading["signals"]["jlpt_lexicon"]
    row["grading"] = {
        "signals": {
            "jreadability": grading["signals"]["jreadability"],
            "jlpt_lexicon": {"coverage": jl["coverage"], "substrate": jl.get("substrate")},
        }
    }
    row["truncated"] = False
    order = [page_number(r["id"]) for r in archive_index["articles"]]
    archive_index["articles"].insert(bisect.bisect_left(order, page_number(candidate_id)), row)
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dry-run", action="store_true", help="report what would be applied; write nothing")
    args = ap.parse_args()

    queue = json.loads(QUEUE_PATH.read_text("utf-8"))
    if not isinstance(queue, list):
        raise SystemExit(f"{QUEUE_PATH}: expected a JSON array")
    for row in queue:
        if row.get("kind") not in KINDS or row.get("decision") not in DECISIONS:
            raise SystemExit(
                f"{QUEUE_PATH}: row {row.get('id')!r} has kind={row.get('kind')!r} "
                f"decision={row.get('decision')!r} — refusing the whole run (fail closed)"
            )

    index = json.loads(INDEX_PATH.read_text("utf-8"))
    archive_index = json.loads(ARCHIVE_INDEX_PATH.read_text("utf-8"))
    by_id = {row["id"]: row for row in index["articles"]}
    archive_ids = {row["id"] for row in archive_index["articles"]}

    tagger = jlpt_maps = None
    applied: list[str] = []
    changed = False
    for row in queue:
        rid, kind, decision = row["id"], row["kind"], row["decision"]
        if decision == "pending":
            continue
        if kind == "rights" and decision == "approved":
            target = by_id.get(rid)
            if target is None or not target.get("review"):
                continue  # already applied
            body_path = ARTICLES / target["file"]
            body = json.loads(body_path.read_text("utf-8"))
            licence = str(row.get("licence") or "").strip()
            if not licence or "未検証" in licence:
                raise SystemExit(
                    f"{rid}: approved as rights-verified, but the queue row's licence is still "
                    f"{licence!r} — write the verified terms in the queue row first"
                )
            for record in (target, body):
                record["licence"] = licence
                record["review"] = None
                record.pop("review", None)
                record.pop("pendingVerification", None)
                record["sourceLabel"] = record["sourceLabel"].replace(" · 検収前", "")
            if not args.dry_run:
                body_path.write_text(
                    json.dumps(body, ensure_ascii=False, separators=(",", ":")), "utf-8"
                )
            applied.append(f"rights-verified {rid} — terms {licence}, 検収前 lifted")
            changed = True
        elif kind == "rights" and decision == "rejected":
            target = by_id.get(rid)
            if target is None:
                continue  # already applied
            index["articles"] = [r for r in index["articles"] if r["id"] != rid]
            if not args.dry_run:
                (ARTICLES / target["file"]).unlink(missing_ok=True)
            applied.append(f"rights-rejected {rid} — off the shelf")
            changed = True
        elif kind in ("mint", "legacy") and decision == "approved":
            target = by_id.get(rid)
            if target is None:
                raise SystemExit(f"{rid}: approved in the queue but not on the shelf")
            if target.get("review") == "approved":
                continue  # already applied
            body_path = ARTICLES / target["file"]
            body = json.loads(body_path.read_text("utf-8"))
            for record in (target, body):
                record["review"] = "approved"
                record["sourceLabel"] = record["sourceLabel"].replace(" · 検収前", "")
            if not args.dry_run:
                body_path.write_text(
                    json.dumps(body, ensure_ascii=False, separators=(",", ":")), "utf-8"
                )
            applied.append(f"approved mint {rid} — 検収前 lifted by the operator")
            changed = True
        elif kind == "mint" and decision == "rejected":
            target = by_id.get(rid)
            if target is None and rid in archive_ids:
                continue  # already applied
            if target is None:
                raise SystemExit(f"{rid}: rejected but neither on the shelf nor in the archive")
            if tagger is None:
                from corpus.grading._mecab import get_tagger

                tagger = get_tagger()
                jlpt_maps = ba.load_jlpt_lexicon()
            index["articles"] = [r for r in index["articles"] if r["id"] != rid]
            if not args.dry_run:
                (ARTICLES / target["file"]).unlink(missing_ok=True)
                restore_to_archive(rid, archive_index, tagger, jlpt_maps)
            applied.append(f"rejected mint {rid} — off the shelf, restored to the archive")
            changed = True
        elif kind == "legacy" and decision == "rejected":
            target = by_id.get(rid)
            if target is None:
                continue  # already applied
            index["articles"] = [r for r in index["articles"] if r["id"] != rid]
            if not args.dry_run:
                (ARTICLES / target["file"]).unlink(missing_ok=True)
            applied.append(f"rejected legacy {rid} — off the shelf; docs/content source untouched")
            changed = True
        elif kind == "cull" and decision == "approved":
            if rid in archive_ids:
                target = next(r for r in archive_index["articles"] if r["id"] == rid)
                archive_index["articles"] = [r for r in archive_index["articles"] if r["id"] != rid]
                if not args.dry_run:
                    (ARTICLES / target["file"]).unlink(missing_ok=True)
                applied.append(f"approved cull {rid} — removed from the minted archive")
                changed = True
            elif rid in by_id:
                target = by_id[rid]
                index["articles"] = [r for r in index["articles"] if r["id"] != rid]
                if not args.dry_run:
                    (ARTICLES / target["file"]).unlink(missing_ok=True)
                applied.append(f"approved cull {rid} — removed from the shelf")
                changed = True
            # else: already applied
        # cull + rejected: the tombstone itself is the whole effect

    if args.dry_run:
        print("· dry run — decided rows and their effects:")
    for line in applied:
        print(f"    {line}")
    if not applied:
        print("· nothing decided — every row pending or already applied")
    if changed and not args.dry_run:
        INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", "utf-8")
        ARCHIVE_INDEX_PATH.write_text(
            json.dumps(archive_index, ensure_ascii=False, separators=(",", ":")), "utf-8"
        )
        print("· next: node tools/build-standalone.mjs && node tools/verify-feed.mjs")
        print("        python tools/feed_ingest.py --report-only  (refresh the curation report)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
