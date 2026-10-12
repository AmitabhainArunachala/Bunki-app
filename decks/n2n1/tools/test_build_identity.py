"""Build real passages to verify editorial replacements keep review identities."""
import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_n2n1 as builder
import fugashi


class CardIdentityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tagger = fugashi.Tagger()
        source = sorted((builder.SRC / "cards").glob("*.json"))[0]
        cls.card = json.loads(source.read_text())["cards"][0]

    def build(self, cards):
        return builder.build("senmon", cards, self.tagger, {})[0]

    def test_legacy_card_keeps_content_key(self):
        c = copy.deepcopy(self.card)
        c.pop("cardId", None)
        word = self.build([c])["words"][0]
        self.assertEqual(word["id"], "nn-" + builder.sha(f"{c['term']}|{c['reading']}", 10))
        self.assertEqual(word["cards"][0]["id"], word["id"] + "-" + builder.sha(c["passage"]["ja"], 8))

    def test_replacement_keeps_id_and_builds_new_text(self):
        c = copy.deepcopy(self.card)
        before = self.build([c])["words"][0]
        c["cardId"] = before["cards"][0]["id"]
        c["passage"]["ja"] += "視点が変わる。"
        c["passage"]["en"] += " The perspective changes."
        after = self.build([c])["words"][0]
        self.assertEqual(after["id"], before["id"])
        self.assertEqual(after["cards"][0]["id"], before["cards"][0]["id"])
        self.assertEqual(after["cards"][0]["ja"], c["passage"]["ja"])
        self.assertNotEqual(after["cards"][0]["ja"], before["cards"][0]["ja"])

    def test_cross_word_and_malformed_ids_rejected(self):
        for cid in ("nn-0000000000-12345678", "bad", None, 10):
            with self.subTest(cid=cid):
                c = copy.deepcopy(self.card)
                c["cardId"] = cid
                with self.assertRaisesRegex(SystemExit, "unchanged word identity"):
                    self.build([c])

    def test_duplicate_ids_rejected(self):
        c = copy.deepcopy(self.card)
        with self.assertRaisesRegex(SystemExit, "duplicate card ID"):
            self.build([c, c])


if __name__ == "__main__":
    unittest.main()
