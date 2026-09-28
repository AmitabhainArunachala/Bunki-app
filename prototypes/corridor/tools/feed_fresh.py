"""Fresh shelf — this week's Japanese news-like texts, fetched live, minted
through the EXISTING build_articles machinery, dated, and queued for review.

Usage (run from anywhere; the corpus grading stack must be importable —
`pip install './corpus[grading]'` into the interpreter you use):

  python prototypes/corridor/tools/feed_fresh.py
      fetch everything published since the last run (first run: the last 14
      days), stage it, mint every staged item that has an authored English
      title, update index.json + the review queue, and log the run
  python feed_fresh.py --since 2026-09-14      explicit window start (JST date)
  python feed_fresh.py --sources kantei,env    only these adapters
  python feed_fresh.py --stage-only            fetch + stage; mint nothing
  python feed_fresh.py --mint-only             no network: mint staged items
                                               whose titles were authored since
  python feed_fresh.py --dry-run               fetch + gates + report; write nothing
  python feed_fresh.py --allow-untitled        operator choice: also mint staged
                                               items that have no English title yet
  python feed_fresh.py --list-untitled         print the staged items still waiting
                                               for an English title, as a JSON stub
  python feed_fresh.py --verbose               also print every skipped item and why
  python feed_fresh.py --restage --since D     re-fetch with today's adapters; an item still
                                               PENDING review whose text changed is replaced
                                               in the dataset (its previous content hash kept)
                                               and re-minted in place. Approved or rejected
                                               items are never touched.

It installs no schedule. Running it daily is the operator's decision.

What one run does
  terms    every source's terms page is opened and must still name its
           licence (公共データ利用規約 第1.0版 / CC BY-SA 4.0 / CC BY); a source
           whose check fails is skipped for the run, and the evidence (URL,
           sha256, matched wording) is logged. See tools/fresh_sources.py.
  fetch    adapters return dated items with navigation and boilerplate
           stripped, paragraphs kept, long texts cut at paragraph boundaries.
  gate     window (since ≤ date ≤ today), dedupe (dataset, shelf, queue
           tombstones), the feed's own cleanliness gate (feed_ingest.quality_flags:
           LINK-SAFE patterns, residual markup, ≥300 chars, ≤20% Latin), and
           rubric T1 (no grim-incident reading).
  stage    passing items are appended to corpus/datasets/fresh/items.jsonl —
           the committed source text every mint (and any later re-mint) reads.
  mint     build_articles.tokenise_paragraphs + grade_article (tokens,
           furigana with the reading-override lexicon, the three signals kept
           apart — the #42 law), the provenance pool of the source licence.
           English titles are authored, never generated: they come from
           docs/content/feed-fresh-titles-en.json (titleEnSource names who
           wrote them). Every mint enters the shelf as review
           "human-review-pending" with 検収前 in its sourceLabel, and gets a
           kind:"fresh" row in docs/content/feed-review-queue.json; only the
           operator's decision there (applied by feed_apply_review.py) lifts it.
  record   docs/build-evidence/renkan/feed-fresh/run-NNN.json (append-only):
           window, terms evidence, per-source counts, every skip with its
           reason, what was minted, output hashes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_articles as ba  # noqa: E402  (the minting machinery — imported, not forked)
import build_corridor as bc  # noqa: E402
import fresh_sources as fs  # noqa: E402
from feed_ingest import (  # noqa: E402
    ARTICLES,
    INDEX_PATH,
    QUEUE_PATH,
    REPO,
    load_queue,
    quality_flags,
    sha256_path,
)

DATASET = REPO / "corpus/datasets/fresh/items.jsonl"
TITLES_PATH = REPO / "docs/content/feed-fresh-titles-en.json"
EVIDENCE_DIR = REPO / "docs/build-evidence/renkan/feed-fresh"
DEFAULT_DAYS = 14
QUEUE_KIND = "fresh"
PENDING_MARK = " · 検収前"


def today_jst() -> date:
    return datetime.now(fs.JST).date()


def read_dataset() -> list[dict]:
    if not DATASET.exists():
        return []
    return [json.loads(line) for line in DATASET.read_text("utf-8").splitlines() if line.strip()]


def load_titles() -> dict:
    data = json.loads(TITLES_PATH.read_text("utf-8")) if TITLES_PATH.exists() else {}
    return {
        "titleEnSource": data.get("titleEnSource", ""),
        "titles": dict(data.get("titles", {})),
        "topics": dict(data.get("topics", {})),
        "skip": dict(data.get("skip", {})),
    }


def write_json_keeping_indent(path: Path, payload) -> None:
    """Rewrite a committed JSON file in the indentation it already has, so a
    run's diff shows the rows it added and nothing else."""
    indent = 2
    if path.exists():
        lines = path.read_text("utf-8").splitlines()
        if len(lines) > 1:
            indent = len(lines[1]) - len(lines[1].lstrip(" ")) or 2
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=indent) + "\n", "utf-8")


def run_logs() -> list[Path]:
    return sorted(EVIDENCE_DIR.glob("run-*.json")) if EVIDENCE_DIR.exists() else []


def default_since() -> date:
    """Since the last FETCH: the previous fetching run's window end (the
    overlap is harmless — ids dedupe; mint-only runs fetch nothing and do not
    move the window). First run: the last DEFAULT_DAYS days."""
    for path in reversed(run_logs()):
        window = json.loads(path.read_text("utf-8")).get("window") or {}
        if window.get("until"):
            return date.fromisoformat(window["until"])
    return today_jst() - timedelta(days=DEFAULT_DAYS)


# --------------------------------------------------------------- fetch + gate
def fetch(since: date, until: date, only: set[str] | None, known: set[str]) -> tuple[list[dict], dict]:
    report: dict = {"terms": [], "sources": {}, "skipped": []}
    passed: list[dict] = []
    checked: dict[str, dict] = {}
    for adapter in fs.adapters():
        key = adapter.key
        if only and key not in only:
            continue
        source = fs.SOURCES[key]
        entry = {"discovered": 0, "extracted": 0, "passed": 0, "error": None}
        report["sources"][key] = entry
        # one terms check per terms page (the two Wikipedia adapters share one)
        evidence = checked.get(source.terms_url) or fs.verify_terms(source)
        checked[source.terms_url] = evidence
        report["terms"].append(dict(evidence, source=key))
        if not evidence.get("ok"):
            entry["error"] = "terms check failed — source skipped for this run"
            continue
        try:
            stubs = adapter.discover(since, until)
        except Exception as err:  # noqa: BLE001 — one source failing never stops the run
            entry["error"] = f"discover: {type(err).__name__}: {err}"
            continue
        entry["discovered"] = len(stubs)
        for stub in stubs:
            try:
                item = adapter.extract(stub)
            except Exception as err:  # noqa: BLE001
                adapter.skipped.append({"url": str(stub.get("url", stub))[:200], "reason": f"extract: {type(err).__name__}: {err}"})
                continue
            if item is None:
                continue
            entry["extracted"] += 1
            reason = gate(item, since, until, known)
            if reason:
                adapter.skipped.append({"url": item.url, "id": item.id, "reason": reason})
                continue
            known.add(item.id)
            record = item.record()
            record["termsCheckedAt"] = evidence.get("checkedAt")
            record["termsSha256"] = evidence.get("termsSha256")
            passed.append(record)
            entry["passed"] += 1
        report["skipped"].extend(dict(s, source=key) for s in adapter.skipped)
        if getattr(adapter, "report", None):
            entry["reader"] = adapter.report
    return passed, report


def gate(item: "fs.Item", since: date, until: date, known: set[str]) -> str | None:
    if item.id in known:
        return "already staged, on the shelf, or decided in the queue"
    day = date.fromisoformat(item.date)
    if not since <= day <= until:
        return f"dated {item.date}, outside the window {since}…{until}"
    flags = quality_flags(item.text)
    if flags:
        return "quality gate: " + "; ".join(flags)
    if fs.GRIM_RE.search(item.title) or fs.GRIM_RE.search(item.paragraphs[0]):
        return "rubric T1 — grim-incident subject"
    return None


# --------------------------------------------------------------- mint
def mint(row: dict, title_en: str, title_source: str, topic: str, as_of: str, tagger, jlpt_maps) -> tuple[dict, dict, dict]:
    """One staged item through the build_articles machinery, in the exact
    shelf grammar feed_ingest.mint_candidate writes."""
    text = row["text"]
    source = fs.SOURCES[row["sourceKey"]]
    truncated = bool(row.get("excerpt") and row["excerpt"].get("keptChars"))
    a = {
        "id": row["id"],
        "title": row["title"],
        "titleEn": title_en,
        "titleEnSource": title_source,
        "source": row["source"],
        "sourceLabel": source.label + PENDING_MARK,
        "pool": row["pool"],
        "licence": row["licence"],
        "licenceUrl": row["licenceUrl"],
        "termsUrl": row["termsUrl"],
        "attribution": row["attribution"],
        "url": row["url"],
        "date": row["date"],
        "publishedAt": row["publishedAt"],
        "fetchedAt": row["fetchedAt"],
        "rubySource": "tokenizer",
        "review": "human-review-pending",
        "addedAt": as_of,
        "lane": "news",
        "feed": QUEUE_KIND,
        "topic": topic,
        "file": ba.slugify(row["id"]) + ".json",
    }
    if row.get("excerpt"):
        a["excerpt"] = row["excerpt"]
    tokens, para_starts = ba.tokenise_paragraphs(text, tagger)
    grading = ba.grade_article(text, tokens, tagger, jlpt_maps)

    seeds: list[str] = []
    for tok in tokens:
        if tok["c"] and len(tok["s"]) > 1 and tok["b"] not in seeds:
            seeds.append(tok["b"])
        if len(seeds) >= 6:
            break

    record = dict(a)
    record["text"] = text
    record["tokens"] = tokens
    record["paras"] = para_starts
    record["grading"] = grading
    record["truncated"] = truncated

    index_row = dict(a)
    index_row["chars"] = len(text)
    index_row["snippet"] = text.replace("\n", " ")[:64]
    index_row["grading"] = grading
    index_row["seeds"] = seeds
    index_row["truncated"] = truncated

    jr = grading["signals"]["jreadability"]
    jl = grading["signals"]["jlpt_lexicon"]
    coverage = jl["coverage"] if jl["coverage"] is not None else 0.0
    queue_row = {
        "id": row["id"],
        "kind": QUEUE_KIND,
        "title": row["title"],
        "titleEn": title_en,
        "lane": "news",
        "licence": row["licence"],
        "gradingSummary": f"{jr['band']} · jread {jr['score']:.2f} · JLPT語彙 {coverage:.0%} · {len(text)}字",
        "addedAt": as_of,
        "decision": "pending",
        "source": row["source"],
        "date": row["date"],
        "url": row["url"],
        "topic": topic,
    }
    return record, index_row, queue_row


def ensure_sources(index: dict, keys: set[str]) -> None:
    """The shelf's 出典と licence panel lists every source a row cites."""
    for key in sorted(keys):
        s = fs.SOURCES[key]
        pool = index["sources"].setdefault(s.pool, [])
        if any(entry.get("name") == s.name for entry in pool):
            continue
        pool.append({"name": s.name, "licence": s.licence, "attribution": s.publisher, "url": s.terms_url})


def untitled_stub(rows: list[dict]) -> str:
    return json.dumps({row["id"]: f"<English title for: {row['title']}>" for row in rows}, ensure_ascii=False, indent=2)


# --------------------------------------------------------------- the run
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--since", help="window start, JST date YYYY-MM-DD (default: the last run's end, else 14 days ago)")
    ap.add_argument("--sources", help="comma-separated adapter keys: " + ",".join(fs.SOURCES))
    ap.add_argument("--as-of", default=None, help="ISO date stamped as addedAt (default: today, JST)")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--stage-only", action="store_true")
    mode.add_argument("--mint-only", action="store_true")
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--list-untitled", action="store_true")
    mode.add_argument("--restage", action="store_true", help="re-extract still-pending items with the current adapters and re-mint the changed ones")
    ap.add_argument("--allow-untitled", action="store_true", help="mint staged items that have no authored English title (operator choice)")
    ap.add_argument("--verbose", action="store_true", help="print every skipped item with its reason")
    args = ap.parse_args()

    until = today_jst()
    since = date.fromisoformat(args.since) if args.since else default_since()
    as_of = args.as_of or until.isoformat()
    only = set(args.sources.split(",")) if args.sources else None
    if only and not only <= set(fs.SOURCES):
        raise SystemExit(f"unknown source keys: {sorted(only - set(fs.SOURCES))}")

    index = json.loads(INDEX_PATH.read_text("utf-8"))
    queue = load_queue()
    dataset = read_dataset()
    titles = load_titles()
    shelf_ids = {row["id"] for row in index["articles"]}
    staged_ids = {row["id"] for row in dataset}
    queued_ids = {row["id"] for row in queue}

    if args.list_untitled:
        waiting = [r for r in dataset if r["id"] not in shelf_ids and r["id"] not in titles["titles"] and r["id"] not in titles["skip"]]
        print(untitled_stub(waiting))
        return 0

    started = datetime.now(timezone.utc).isoformat(timespec="seconds")
    fetched: list[dict] = []
    restaged: list[dict] = []
    report: dict = {"terms": [], "sources": {}, "skipped": []}
    # only a reading nobody has decided on may be re-extracted
    pending_fresh = {row["id"] for row in queue if row.get("kind") == QUEUE_KIND and row.get("decision") == "pending"}
    if not args.mint_only:
        print(f"· window {since} … {until} (JST)")
        known = staged_ids | shelf_ids | queued_ids
        if args.restage:
            known -= pending_fresh
        fetched, report = fetch(since, until, only, known)
        if args.restage:
            by_id = {row["id"]: row for row in dataset}
            fresh_rows = []
            for row in fetched:
                old = by_id.get(row["id"])
                if old is None:
                    fresh_rows.append(row)
                elif any(old.get(k) != row.get(k) for k in ("text", "title", "url", "date", "attribution")):
                    restaged.append(dict(row, stagedAt=old.get("stagedAt"), restagedAt=started,
                                         previousContentSha256=old.get("contentSha256")))
            fetched = fresh_rows
        for key, entry in report["sources"].items():
            print(f"    {key:>14}: discovered {entry['discovered']:>3} · extracted {entry['extracted']:>3} · passed {entry['passed']:>3}"
                  + (f" · {entry['error']}" if entry["error"] else ""))
        if args.verbose:
            for skipped in report["skipped"]:
                print(f"      skip {skipped['source']:>12}  {skipped['reason'][:80]}  {str(skipped.get('id') or skipped.get('url'))[:90]}")
        if args.dry_run:
            for row in fetched:
                print(f"    {row['date']}  {row['id']:<48} {len(row['text']):>5}字  {row['title'][:40]}")
            print(f"· dry run — {len(fetched)} items would be staged; nothing written")
            return 0
        if fetched:
            DATASET.parent.mkdir(parents=True, exist_ok=True)
            with DATASET.open("a", encoding="utf-8") as fh:
                for row in fetched:
                    fh.write(json.dumps(dict(row, stagedAt=started), ensure_ascii=False) + "\n")
            dataset.extend(fetched)
        print(f"· staged {len(fetched)} new items → {DATASET.relative_to(REPO)}")
        if restaged:
            # a pending reading's source text is replaced in place; the run log
            # and the row keep the hash of what it replaced
            replacement = {row["id"]: row for row in restaged}
            dataset = [replacement.get(row["id"], row) for row in dataset]
            DATASET.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in dataset), "utf-8")
            first_added = {row["id"]: row.get("addedAt") for row in queue if row["id"] in replacement}
            index["articles"] = [row for row in index["articles"] if row["id"] not in replacement]
            queue = [row for row in queue if row["id"] not in replacement]
            shelf_ids -= set(replacement)
            for row in restaged:
                row["_addedAt"] = first_added.get(row["id"])
            print(f"· restaged {len(restaged)} pending items whose text changed: " + ", ".join(sorted(replacement)))

    minted: list[dict] = []
    untitled: list[dict] = []
    retitled: list[str] = []
    if not args.stage_only:
        # an authored title changed after its reading was minted: carry it to
        # the queue row, the shelf row and the body while the row is pending
        by_file = {row["id"]: row for row in index["articles"]}
        for qrow in queue:
            title_en = str(titles["titles"].get(qrow["id"], "")).strip()
            if qrow.get("kind") != QUEUE_KIND or qrow.get("decision") != "pending" or not title_en or qrow.get("titleEn") == title_en:
                continue
            shelf_row = by_file.get(qrow["id"])
            if shelf_row is None:
                continue
            body_path = ARTICLES / shelf_row["file"]
            body = json.loads(body_path.read_text("utf-8"))
            for record in (qrow, shelf_row, body):
                record["titleEn"] = title_en
            for record in (shelf_row, body):
                record["titleEnSource"] = titles["titleEnSource"]
            body_path.write_text(json.dumps(body, ensure_ascii=False, separators=(",", ":")), "utf-8")
            retitled.append(qrow["id"])
        if retitled:
            print("· retitled " + ", ".join(retitled))
        rejected = {row["id"] for row in queue if row.get("kind") == QUEUE_KIND and row.get("decision") == "rejected"}
        candidates = [r for r in dataset if r["id"] not in shelf_ids and r["id"] not in rejected and r["id"] not in titles["skip"]]
        if only:
            candidates = [r for r in candidates if r["sourceKey"] in only]
        ready = []
        for row in candidates:
            title_en = str(titles["titles"].get(row["id"], "")).strip()
            if title_en:
                ready.append((row, title_en, titles["titleEnSource"]))
            elif args.allow_untitled:
                ready.append((row, "", "untitled-pending"))
            else:
                untitled.append(row)
        if ready or retitled:
            INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", "utf-8")
            write_json_keeping_indent(QUEUE_PATH, queue)
        if ready:
            from corpus.grading._mecab import get_tagger

            tagger = get_tagger()
            jlpt_maps = ba.load_jlpt_lexicon()
            first_added = {row["id"]: row["_addedAt"] for row in restaged if row.get("_addedAt")}
            for row, title_en, title_source in sorted(ready, key=lambda r: (r[0]["date"], r[0]["id"])):
                topic = titles["topics"].get(row["id"], "")
                record, index_row, queue_row = mint(row, title_en, title_source, topic,
                                                    first_added.get(row["id"], as_of), tagger, jlpt_maps)
                (ARTICLES / index_row["file"]).write_text(
                    json.dumps(record, ensure_ascii=False, separators=(",", ":")), "utf-8"
                )
                index["articles"].append(index_row)
                queue.append(queue_row)
                minted.append(queue_row)
                jr = index_row["grading"]["signals"]["jreadability"]
                print(f"    minted {row['date']}  {row['id']:<46} {index_row['chars']:>5}字  {jr['band']}  検収前")
            ensure_sources(index, {row["sourceKey"] for row, _, _ in ready})
            INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", "utf-8")
            write_json_keeping_indent(QUEUE_PATH, queue)
        print(f"· minted {len(minted)}; {len(untitled)} staged items wait for an authored English title"
              + (" (python feed_fresh.py --list-untitled)" if untitled else ""))

    if args.mint_only and not minted and not retitled:
        print("· nothing to mint — no run log written")
        return 0
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    run_number = len(run_logs()) + 1
    log_path = EVIDENCE_DIR / f"run-{run_number:03d}.json"
    if log_path.exists():
        raise SystemExit(f"{log_path} already exists — evidence is append-only")
    log = {
        "kind": "feed-fresh-run",
        "run": run_number,
        "startedAt": started,
        "asOf": as_of,
        "mode": "mint-only" if args.mint_only else "stage-only" if args.stage_only else "restage" if args.restage else "fetch+mint",
        "window": None if args.mint_only else {"since": since.isoformat(), "until": until.isoformat(), "timezone": "Asia/Tokyo"},
        "terms": report["terms"],
        "sources": report["sources"],
        "staged": [{"id": r["id"], "date": r["date"], "chars": len(r["text"]), "url": r["url"]} for r in fetched],
        "restaged": [{"id": r["id"], "chars": len(r["text"]), "contentSha256": r["contentSha256"],
                      "previousContentSha256": r.get("previousContentSha256")} for r in restaged],
        "skipped": report["skipped"],
        "minted": minted,
        "untitled": [r["id"] for r in untitled],
        "retitled": retitled,
        "allowUntitled": bool(args.allow_untitled),
        "outputSha256": {
            "index.json": sha256_path(INDEX_PATH),
            "feed-review-queue.json": sha256_path(QUEUE_PATH),
            **({"items.jsonl": sha256_path(DATASET)} if DATASET.exists() else {}),
        },
    }
    log_path.write_text(json.dumps(log, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"· run log → {log_path.relative_to(REPO)}")
    if minted:
        print("· next: node tools/verify-feed.mjs && npm run bunki:web:build -- --out ~/.dharma/<fresh dir>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
