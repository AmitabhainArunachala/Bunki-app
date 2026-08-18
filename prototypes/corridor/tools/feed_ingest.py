"""連環 R2-D — the feed loop: archive stock in, 検収前 shelf candidates out.

One deterministic command closes the loop the campaign spec calls T4/B2+B4:

  select   the next modest tranche (default 6) from committed, rights-clean
           stock — corpus/datasets/wikinews/archive.jsonl rows still listed in
           the minted archive (data/articles/archive-index.json) — balanced
           against the current shelf: the thinnest jreadability band fills
           first (the N5→Kanken spine order breaks ties), freshest date first
           within a band.
  mint     each candidate through the EXISTING build_articles machinery
           (imported, never forked): tokens + furigana + the three-signal
           grading + provenance pool + the LINK-SAFE cleanliness gate (the
           wikinews-1483 lesson: text that lost a link's or template's inner
           text never reaches the shelf).
  queue    every minted candidate lands in docs/content/feed-review-queue.json
           with decision "pending". NOTHING self-approves: candidates enter
           data/articles/ + index.json as review "human-review-pending" with
           検収前 in their sourceLabel, and only the operator's edit of the
           queue file (applied by feed_apply_review.py) ever lifts it.
  curate   docs/content/feed-curation-report.json is rebuilt: every shelf +
           archive item ranked by named grader-signal criteria (no composite —
           the #42 law), with a cull PROPOSAL list. Culling is proposed here,
           decided only in the queue's decision field, never automatic.
  record   a run log (mode, selection trace, output hashes) is appended under
           docs/build-evidence/renkan/feed/ — evidence is append-only.

Live mode: the wikinews adapter is probed once per run (the pinned dump URL).
ja.wikinews is frozen (closed 2026-05; dump pinned 2026-08-04), so "live"
success means verifying the pin is still the upstream latest. When egress is
blocked the run degrades exactly as campaign spec B2 says — this same
operator-runnable script over the committed archive — and the run log records
which mode ran. The selection NEVER depends on the probe, so two runs over the
same repo state pick the same tranche.

English titles are authored, not generated: the mint refuses any candidate
missing from docs/content/feed-titles-en.json (titleEnSource renkan-ai-2026-08).

Usage:
  python feed_ingest.py                 # one full loop, tranche of 6
  python feed_ingest.py --n 8           # bigger tranche (hard cap 10)
  python feed_ingest.py --dry-run       # selection + title check, no writes
  python feed_ingest.py --report-only   # rebuild the curation report only
  python feed_ingest.py --as-of DATE    # pin addedAt/asOf for reproducibility
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_articles as ba  # noqa: E402  (the minting machinery — imported, not forked)
import build_corridor as bc  # noqa: E402

REPO = bc.REPO
CORRIDOR = bc.CORRIDOR
ARTICLES = CORRIDOR / "data" / "articles"
INDEX_PATH = ARTICLES / "index.json"
ARCHIVE_INDEX_PATH = ARTICLES / "archive-index.json"
ARCHIVE_JSONL = REPO / "corpus/datasets/wikinews/archive.jsonl"
QUEUE_PATH = REPO / "docs/content/feed-review-queue.json"
TITLES_PATH = REPO / "docs/content/feed-titles-en.json"
REPORT_PATH = REPO / "docs/content/feed-curation-report.json"
EVIDENCE_DIR = REPO / "docs/build-evidence/renkan/feed"

TITLE_EN_SOURCE = "renkan-ai-2026-08"
TRANCHE_DEFAULT = 6
TRANCHE_CAP = 10  # quality and gate-passing over volume (R2-D brief)
CHAR_MIN = 300
CHAR_MAX = 4500

# The N5→Kanken spine order (Wayfinder map): thinnest band fills first,
# ties break toward the easier band — the shelf grows from the learner's end.
BAND_ORDER = ["初級前半", "初級後半", "中級前半", "中級後半", "上級前半", "上級後半"]

# LINK-SAFE cleanliness: the wikinews-1483 / 1403 lesson. Extraction that
# swallowed a wikilink's or template's inner text leaves dangling particles or
# empty brackets that misteach. Named patterns, each with its reason; a hit
# blocks ingest and raises a cull proposal for stock already minted.
DROPPED_TEXT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"知られる[はがも]、?"), "dangling particle after 知られる — a linked name was dropped in extraction"),
    (re.compile(r"「」|『』|（）|\(\)"), "empty quote/paren pair — bracketed content was dropped in extraction"),
]
# Residual wiki markup — the extractor's own wide net (kept in sync by test).
RESIDUAL_MARKERS = ("{{", "[[", "<ref", "}}", "</", "style=", "align=", "{|")

# Reading-shelf stock is Japanese prose: articles that are one-fifth or more
# Latin/Cyrillic letters (embedded source quotes, spec sheets, race results)
# stay in the archive stack instead. Measured on the 694-item archive: the
# 0.20 line excludes exactly 6 such items.
FOREIGN_LETTER_RE = re.compile(r"[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]")
NON_SPACE_RE = re.compile(r"\S")
FOREIGN_RATIO_MAX = 0.20


def sha256_path(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_queue() -> list[dict]:
    if not QUEUE_PATH.exists():
        return []
    rows = json.loads(QUEUE_PATH.read_text("utf-8"))
    if not isinstance(rows, list):
        raise SystemExit(f"{QUEUE_PATH}: expected a JSON array of review rows")
    return rows


def load_titles() -> dict[str, str]:
    if not TITLES_PATH.exists():
        return {}
    data = json.loads(TITLES_PATH.read_text("utf-8"))
    if data.get("titleEnSource") != TITLE_EN_SOURCE:
        raise SystemExit(f"{TITLES_PATH}: titleEnSource must be {TITLE_EN_SOURCE!r}")
    return dict(data.get("titles", {}))


def write_pretty_json(path: Path, payload) -> None:
    """docs/content lives under prettier: emit its stable JSON shape."""
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", "utf-8")


def quality_flags(text: str, news: bool = True) -> list[str]:
    """Named criteria. The extraction-damage patterns apply to everything;
    the length floor and foreign-script line are NEWS-stock criteria only —
    glossary entries, classical excerpts and graded beginner texts are short
    (or quote-bearing) by design and are never flagged for it."""
    flags: list[str] = []
    for pattern, reason in DROPPED_TEXT_PATTERNS:
        if pattern.search(text):
            flags.append(reason)
    if any(marker in text for marker in RESIDUAL_MARKERS):
        flags.append("residual wiki markup in extracted text")
    if not news:
        return flags
    if len(text) < CHAR_MIN:
        flags.append(f"under {CHAR_MIN} chars — too thin for a news reading")
    foreign = len(FOREIGN_LETTER_RE.findall(text)) / max(1, len(NON_SPACE_RE.findall(text)))
    if foreign > FOREIGN_RATIO_MAX:
        flags.append(
            f"foreign-script letters {foreign:.0%} of the text — weak Japanese-reading stock"
        )
    return flags


# --------------------------------------------------------------- selection
def shelf_band_counts(index: dict) -> dict[str, int]:
    counts = {band: 0 for band in BAND_ORDER}
    for row in index["articles"]:
        if str(row.get("file", "")).startswith("archive/"):
            continue
        band = row["grading"]["signals"]["jreadability"]["band"]
        if band in counts:
            counts[band] += 1
    return counts


def candidate_stock(index: dict, queue: list[dict]) -> list[dict]:
    """Joined archive stock: light grading from archive-index.json, text from
    the committed dataset. Anything on the shelf, in the queue, outside the
    reading length window, or failing the cleanliness gate is out."""
    shelf_ids = {row["id"] for row in index["articles"]}
    queued_ids = {row["id"] for row in queue}
    text_by_id = {rec["id"]: rec for rec in bc.read_jsonl(ARCHIVE_JSONL)}
    archive_index = json.loads(ARCHIVE_INDEX_PATH.read_text("utf-8"))

    stock: list[dict] = []
    for row in archive_index["articles"]:
        rec = text_by_id.get(row["id"])
        if rec is None or row["id"] in shelf_ids or row["id"] in queued_ids:
            continue
        text = rec["text"].replace("\r\n", "\n").strip()
        if not CHAR_MIN <= len(text) <= CHAR_MAX:
            continue
        if quality_flags(text):
            continue
        stock.append(
            {
                "id": row["id"],
                "title": row["title"],
                "text": text,
                "url": row.get("url", ""),
                "date": row.get("date", ""),
                "band": row["grading"]["signals"]["jreadability"]["band"],
                "chars": len(text),
            }
        )
    return stock


def page_number(candidate_id: str) -> int:
    tail = candidate_id.rsplit(":", 1)[-1]
    return int(tail) if tail.isdigit() else 0


def select_tranche(counts: dict[str, int], stock: list[dict], n: int) -> tuple[list[dict], list[dict]]:
    """Thin-band-first, freshest-first, fully deterministic. Returns the picks
    and a per-pick trace for the run log."""
    remaining = {band: sorted((c for c in stock if c["band"] == band), key=lambda c: (c["date"], page_number(c["id"])), reverse=True) for band in BAND_ORDER}
    running = dict(counts)
    picks: list[dict] = []
    trace: list[dict] = []
    while len(picks) < n:
        open_bands = [band for band in BAND_ORDER if remaining[band]]
        if not open_bands:
            break
        band = min(open_bands, key=lambda b: (running[b], BAND_ORDER.index(b)))
        candidate = remaining[band].pop(0)
        picks.append(candidate)
        trace.append(
            {
                "band": band,
                "bandCountBefore": running[band],
                "picked": candidate["id"],
                "date": candidate["date"],
                "chars": candidate["chars"],
            }
        )
        running[band] += 1
    return picks, trace


# --------------------------------------------------------------- live probe
def live_probe(timeout: float = 8.0) -> dict:
    """Try the wikinews adapter's pinned upstream once. The wiki is frozen, so
    a reachable upstream whose Last-Modified matches the pin means the
    committed archive IS the live feed. Never affects selection."""
    from corpus.sources.wikinews import fetch as wikinews_fetch

    try:
        request = urllib.request.Request(wikinews_fetch.DUMP_URL, method="HEAD")
        with urllib.request.urlopen(request, timeout=timeout) as response:
            last_modified = response.headers.get("Last-Modified", "")
        pinned = wikinews_fetch.DUMP_LAST_MODIFIED
        return {
            "mode": "live-probe-reached-upstream",
            "url": wikinews_fetch.DUMP_URL,
            "lastModified": last_modified,
            "pinnedLastModified": pinned,
            "pinCurrent": pinned in last_modified or last_modified == "",
            "note": "ja.wikinews is frozen; the committed archive is the current feed state",
        }
    except Exception as err:  # noqa: BLE001 — every failure degrades the same way
        return {
            "mode": "committed-archive",
            "url": wikinews_fetch.DUMP_URL,
            "error": f"{type(err).__name__}: {err}",
            "note": (
                "egress blocked or upstream unreachable — degraded per campaign "
                "spec B2 to this operator-runnable script over the committed "
                "corpus/datasets/wikinews/archive.jsonl"
            ),
        }


# --------------------------------------------------------------- minting
def mint_candidate(candidate: dict, title_en: str, as_of: str, tagger, jlpt_maps) -> tuple[dict, dict, dict]:
    """One candidate through the build_articles machinery. Returns
    (body record, index row, queue row) in the exact shelf grammar."""
    text = candidate["text"]
    a = {
        "id": candidate["id"],
        "title": candidate["title"],
        "titleEn": title_en,
        "titleEnSource": TITLE_EN_SOURCE,
        "source": "ja.wikinews",
        "sourceLabel": "ウィキニュース · 検収前",
        "pool": "proprietary_safe",
        "licence": "CC BY 2.5",
        "attribution": "ja.wikinews contributors, CC BY 2.5",
        "url": candidate["url"],
        "date": candidate["date"],
        "rubySource": "tokenizer",
        "review": "human-review-pending",
        "addedAt": as_of,
        "file": ba.slugify(candidate["id"]) + ".json",
    }
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
    record["truncated"] = False

    row = dict(a)
    row["chars"] = len(text)
    row["snippet"] = text.replace("\n", " ")[:64]
    row["grading"] = grading
    row["seeds"] = seeds
    row["truncated"] = False

    jr = grading["signals"]["jreadability"]
    jl = grading["signals"]["jlpt_lexicon"]
    coverage = jl["coverage"] if jl["coverage"] is not None else 0.0
    queue_row = {
        "id": candidate["id"],
        "kind": "mint",
        "title": candidate["title"],
        "titleEn": title_en,
        "lane": "news",
        "licence": a["licence"],
        "gradingSummary": f"{jr['band']} · jread {jr['score']:.2f} · JLPT語彙 {coverage:.0%} · {len(text)}字",
        "addedAt": as_of,
        "decision": "pending",
    }
    return record, row, queue_row


# --------------------------------------------------------------- curation
def curation_report(as_of: str) -> dict:
    """Rank shelf + archive stock by named grader-signal criteria; propose
    culls, never perform them. Deterministic over committed bytes."""
    index = json.loads(INDEX_PATH.read_text("utf-8"))
    archive_index = json.loads(ARCHIVE_INDEX_PATH.read_text("utf-8"))
    text_by_id = {rec["id"]: rec["text"].replace("\r\n", "\n").strip() for rec in bc.read_jsonl(ARCHIVE_JSONL)}

    items: list[dict] = []
    for row in index["articles"]:
        body = json.loads((ARTICLES / row["file"]).read_text("utf-8"))
        items.append({"where": "shelf", "row": row, "text": body["text"]})
    for row in archive_index["articles"]:
        items.append({"where": "archive", "row": row, "text": text_by_id.get(row["id"], "")})

    ranked: list[dict] = []
    for item in items:
        row = item["row"]
        signals = row["grading"]["signals"]
        jr = signals["jreadability"]
        coverage = signals.get("jlpt_lexicon", {}).get("coverage")
        flags = quality_flags(item["text"], news=row["id"].startswith("wikinews:"))
        if coverage is not None and coverage < 0.35:
            flags.append("JLPT-lexicon coverage under 35% — name/notation-heavy for any band")
        ranked.append(
            {
                "id": row["id"],
                "where": item["where"],
                "title": row["title"],
                "band": jr["band"],
                "jread": round(jr["score"], 3),
                "jlptCoverage": round(coverage, 4) if coverage is not None else None,
                "chars": row["chars"],
                "date": row.get("date", ""),
                "flags": flags,
            }
        )
    # weakest first: most named flags, then thinnest text; id keeps ties stable
    ranked.sort(key=lambda r: (-len(r["flags"]), r["chars"], r["id"]))

    hard = {
        "dangling particle",
        "empty quote/paren",
        "residual wiki markup",
        f"under {CHAR_MIN} chars",  # news-only by construction of quality_flags
    }
    proposals = [
        {
            "id": r["id"],
            "where": r["where"],
            "title": r["title"],
            "reasons": r["flags"],
        }
        for r in ranked
        if any(any(h in flag for h in hard) for flag in r["flags"])
    ]

    return {
        "kind": "feed-curation-report",
        "asOf": as_of,
        "law": (
            "signals are ranked by the named criteria below, never composited "
            "(#42); culling is PROPOSED here and decided only by the operator "
            "in docs/content/feed-review-queue.json — never automatic"
        ),
        "criteria": {
            "droppedText": "LINK-SAFE patterns (the wikinews-1483/1403 lesson): "
            + " / ".join(reason for _, reason in DROPPED_TEXT_PATTERNS),
            "residualMarkup": "extractor wide-net markers " + ", ".join(RESIDUAL_MARKERS),
            "tooThin": f"news text under {CHAR_MIN} chars — glossary entries, classical excerpts and graded beginner texts have their own natural lengths and are exempt",
            "foreignScript": f"news text over {FOREIGN_RATIO_MAX:.0%} Latin/Cyrillic letters (watchlist, never a cull ground by itself)",
            "lowCoverage": "JLPT-lexicon known-token coverage under 35% (substrate open-anki-jlpt-decks/wbig-6687)",
            "ranking": "most flags first, then fewest chars, then id — no composite score",
        },
        "counts": {
            "shelf": sum(1 for r in ranked if r["where"] == "shelf"),
            "archive": sum(1 for r in ranked if r["where"] == "archive"),
            "flagged": sum(1 for r in ranked if r["flags"]),
            "cullProposals": len(proposals),
        },
        "cullProposals": proposals,
        "weakest": ranked[:20],
    }


def queue_cull_rows(report: dict, queue: list[dict], as_of: str) -> list[dict]:
    """Cull proposals join the queue (decision pending) exactly once each."""
    queued = {row["id"] for row in queue}
    added: list[dict] = []
    for proposal in report["cullProposals"]:
        if proposal["id"] in queued:
            continue
        added.append(
            {
                "id": proposal["id"],
                "kind": "cull",
                "title": proposal["title"],
                "titleEn": "",
                "lane": "news" if proposal["id"].startswith("wikinews:") else "",
                "licence": "CC BY 2.5" if proposal["id"].startswith("wikinews:") else "",
                "gradingSummary": "; ".join(proposal["reasons"]),
                "addedAt": as_of,
                "decision": "pending",
            }
        )
    return added


# --------------------------------------------------------------- the loop
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--n", type=int, default=TRANCHE_DEFAULT, help=f"tranche size (1..{TRANCHE_CAP})")
    ap.add_argument("--as-of", default=date.today().isoformat(), help="ISO date for addedAt/asOf (reproducibility pin)")
    ap.add_argument("--dry-run", action="store_true", help="selection + title check only; nothing written")
    ap.add_argument("--report-only", action="store_true", help="rebuild the curation report and queue culls; no minting")
    args = ap.parse_args()
    if not 1 <= args.n <= TRANCHE_CAP:
        raise SystemExit(f"--n must stay within 1..{TRANCHE_CAP} — modest tranches, gate-passing over volume")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.as_of):
        raise SystemExit("--as-of must be an ISO date (YYYY-MM-DD)")

    queue = load_queue()

    if args.report_only:
        report = curation_report(args.as_of)
        write_pretty_json(REPORT_PATH, report)
        culls = queue_cull_rows(report, queue, args.as_of)
        if culls:
            queue.extend(culls)
            write_pretty_json(QUEUE_PATH, queue)
        print(f"· curation report rebuilt — {report['counts']['flagged']} flagged, "
              f"{report['counts']['cullProposals']} cull proposals ({len(culls)} newly queued)")
        return 0

    index = json.loads(INDEX_PATH.read_text("utf-8"))
    counts = shelf_band_counts(index)
    print("· shelf band balance:", " ".join(f"{band}={counts[band]}" for band in BAND_ORDER))

    stock = candidate_stock(index, queue)
    print(f"· eligible archive stock: {len(stock)} candidates (clean, {CHAR_MIN}–{CHAR_MAX} chars)")

    picks, trace = select_tranche(counts, stock, args.n)
    if not picks:
        print("· no eligible stock — the run is a no-op")
        return 0
    for step in trace:
        print(f"    fill {step['band']} ({step['bandCountBefore']} on shelf) ← {step['picked']}  {step['date']}  {step['chars']}字")

    titles = load_titles()
    missing = [c["id"] for c in picks if not str(titles.get(c["id"], "")).strip()]
    if missing:
        print("REFUSED — these candidates have no authored English title in "
              f"{TITLES_PATH.relative_to(REPO)} (titles are authored, never generated):")
        for cid in missing:
            title = next(c["title"] for c in picks if c["id"] == cid)
            print(f"    {cid}  {title}")
        return 2
    if args.dry_run:
        print("· dry run — selection stands, nothing written")
        return 0

    probe = live_probe()
    print(f"· source mode: {probe['mode']}")

    from corpus.grading._mecab import get_tagger

    tagger = get_tagger()
    jlpt_maps = ba.load_jlpt_lexicon()

    archive_index = json.loads(ARCHIVE_INDEX_PATH.read_text("utf-8"))
    minted_rows: list[dict] = []
    for candidate in picks:
        record, row, queue_row = mint_candidate(candidate, titles[candidate["id"]], args.as_of, tagger, jlpt_maps)
        (ARTICLES / row["file"]).write_text(
            json.dumps(record, ensure_ascii=False, separators=(",", ":")), "utf-8"
        )
        index["articles"].append(row)
        queue.append(queue_row)
        minted_rows.append(queue_row)
        jr = row["grading"]["signals"]["jreadability"]
        print(f"    minted {row['id']:>16}  {row['chars']:>5}字  jread={jr['score']:.2f} ({jr['band']})  検収前")
    # Promoted stock leaves the archive LISTING (curate.py's no-double law; the
    # corridor also dedupes by id at runtime). The archive BODY file stays on
    # disk unreferenced: it was minted where the NINJAL substrate was live, and
    # deleting it would destroy measured signals this environment cannot
    # regenerate. A rejection re-lists it over those original bytes.
    promoted = {row["id"] for row in minted_rows}
    archive_index["articles"] = [r for r in archive_index["articles"] if r["id"] not in promoted]

    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", "utf-8")
    ARCHIVE_INDEX_PATH.write_text(
        json.dumps(archive_index, ensure_ascii=False, separators=(",", ":")), "utf-8"
    )

    report = curation_report(args.as_of)
    write_pretty_json(REPORT_PATH, report)
    queue.extend(queue_cull_rows(report, queue, args.as_of))
    write_pretty_json(QUEUE_PATH, queue)

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    run_number = len(list(EVIDENCE_DIR.glob("run-*.json"))) + 1
    log = {
        "kind": "feed-ingest-run",
        "run": run_number,
        "asOf": args.as_of,
        "trancheRequested": args.n,
        "sourceMode": probe,
        "shelfBandCountsBefore": counts,
        "eligibleStock": len(stock),
        "selectionTrace": trace,
        "minted": minted_rows,
        "cullProposalsQueued": [row["id"] for row in queue if row["kind"] == "cull"],
        "outputSha256": {
            "index.json": sha256_path(INDEX_PATH),
            "archive-index.json": sha256_path(ARCHIVE_INDEX_PATH),
            "feed-review-queue.json": sha256_path(QUEUE_PATH),
            "feed-curation-report.json": sha256_path(REPORT_PATH),
        },
    }
    log_path = EVIDENCE_DIR / f"run-{run_number:03d}.json"
    if log_path.exists():
        raise SystemExit(f"{log_path} already exists — evidence is append-only")
    log_path.write_text(json.dumps(log, ensure_ascii=False, indent=2) + "\n", "utf-8")

    pending = sum(1 for row in queue if row["kind"] == "mint" and row["decision"] == "pending")
    approved = sum(1 for row in queue if row["kind"] == "mint" and row["decision"] == "approved")
    print(f"· queue: {approved}/{approved + pending} minted candidates approved — 検収前 lifts only by operator decision")
    print(f"· run log → {log_path.relative_to(REPO)}")
    print("· next: node tools/build-standalone.mjs && node tools/verify-feed.mjs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
