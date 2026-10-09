"""Behavioral regression checks for frame caps and failing CLI exit status."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("diversity_audit", HERE / "diversity_audit.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def corpus(size, text="", hits=0):
    # Unique bookends prevent unrelated exact-phrase habits in this synthetic corpus.
    return [{"term": f"語{i}", "reading": f"よみ{i}", "deck": "senmon",
             "passage": {"ja": f"{chr(0x4e00+i) * 8}。{text if i < hits else ''}{chr(0x6000+i) * 8}。",
                         "register": "論"}} for i in range(size)]


class FrameAuditTests(unittest.TestCase):
    def run_audit(self, cards):
        with contextlib.redirect_stdout(io.StringIO()):
            return audit.audit(cards, 0.006)

    def test_each_family_at_cap_passes_and_one_more_fails(self):
        for text, allowed, label in (
            ("説明するなら", 2, "meta frame"),
            ("報告を読む", 2, "in a text/article"),
            ("読む際", 2, "when reading"),
            ("と書くと", 1, "if you write"),
            ("試しましょう。", 6, "ending in ましょう"),
        ):
            with self.subTest(label=label):
                queue, report = self.run_audit(corpus(100, text, allowed))
                self.assertEqual(report, [])
                queue, report = self.run_audit(corpus(100, text, allowed + 1))
                self.assertTrue(any(name.endswith(label) for name, _ in report))
                self.assertTrue(any(label in why for item in queue for why in item["why"]))

    def test_multiple_matches_count_once_per_card(self):
        _, report = self.run_audit(corpus(100, "読むとき、読む際、読むとき", 2))
        self.assertFalse(any(name.endswith("when reading") for name, _ in report))

    def test_caps_do_not_round_up_or_have_three_card_minimum(self):
        _, report = self.run_audit(corpus(49, "読む際", 1))
        self.assertIn(("habit [whole deck] when reading", 1), report)

    def test_plain_subject_passages_pass(self):
        self.assertEqual(self.run_audit(corpus(100))[1], [])

    def test_original_exact_habits_still_fail(self):
        cards = corpus(100)
        for c in cards[:4]:
            c["passage"]["ja"] += "共通する結末。"
        _, report = self.run_audit(cards)
        self.assertTrue(any(name.startswith("ending") for name, _ in report))

    def test_cli_fails_and_writes_queue(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "cards.json").write_text(json.dumps({"cards": corpus(50, "読む際", 2)}, ensure_ascii=False))
            out = root / "queue.json"
            result = subprocess.run([sys.executable, str(HERE / "diversity_audit.py"),
                                     "--cards", str(root), "--out", str(out)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1, result.stderr)
            queue = json.loads(out.read_text())
            self.assertEqual([q["term"] for q in queue], ["語1"])
            self.assertIn("when reading", queue[0]["why"][0])

    def test_cli_rejects_empty_input(self):
        with tempfile.TemporaryDirectory() as folder:
            result = subprocess.run([sys.executable, str(HERE / "diversity_audit.py"),
                                     "--cards", folder], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn("no accepted cards", result.stderr)

    def test_new_words_cannot_hide_in_old_corpus(self):
        raw = subprocess.check_output(["git", "show", "3d81031b:prototypes/corridor/decks/senmon/deck.json"], cwd=audit.REPO)
        words = json.loads(raw)["words"][:50]
        cards = corpus(51)
        for c, w in zip(cards, words):
            c.update(term=w["term"], reading=w["reading"])
        cards[-1]["passage"]["ja"] += "読む際"
        self.assertEqual(self.run_audit(cards)[1], [])
        with contextlib.redirect_stdout(io.StringIO()):
            _, report = audit.audit(cards, 0.006, "3d81031b")
        self.assertIn(("habit [new since 3d81031b] when reading", 1), report)


if __name__ == "__main__":
    unittest.main()
