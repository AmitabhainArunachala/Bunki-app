"""Behavior checks for the reviewed 何 rules shared by article and deck tokenization.

python3 prototypes/corridor/tools/test_reading_overrides.py
Requires the existing pinned fugashi and unidic-lite; no article/deck build.
"""
from copy import deepcopy
import unittest

import fugashi
import build_corridor as bc


class ReadingOverrides(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tagger = fugashi.Tagger()

    def without_nani(self, text):
        original = bc.load_reading_overrides()
        bc._READING_OVERRIDES = [entry for entry in original
                                if entry["surfaces"] not in [["何", "を"], ["何", "が"]]]
        try:
            return bc.tokenise(text, self.tagger)
        finally:
            bc._READING_OVERRIDES = original

    def test_actual_tokenizer_reads_nani_before_the_two_particles(self):
        for text in ["何を読みますか。", "何が起きたのか。", "自分の名が何を意味するのか。"]:
            with self.subTest(text=text):
                before = self.without_nani(text)
                after = bc.tokenise(text, self.tagger)
                self.assertEqual("".join(row["s"] for row in after), text)
                self.assertEqual(len(before), len(after))
                matched = 0
                for index, row in enumerate(after):
                    if row["s"] == "何" and after[index + 1]["s"] in ["を", "が"]:
                        matched += 1
                        self.assertEqual(row["r"], "なに")
                        self.assertEqual(row["f"], [{"t": "何", "r": "なに"}])
                        self.assertEqual(row["rs"], "lexicon")
                        for key in ["s", "b", "p", "c"]:
                            self.assertEqual(row[key], before[index][key])
                        self.assertEqual(after[index + 1], before[index + 1])
                    else:
                        self.assertEqual(row, before[index])
                self.assertEqual(matched, 1, "fixture must exercise exactly one target rule")

    def test_other_contexts_keep_the_existing_tokenizer_behavior(self):
        for text in ["何で行くの。", "何の本ですか。", "何と言いましたか。", "何人いますか。",
                     "何度も聞く。", "何かしらある。", "何より大事です。"]:
            with self.subTest(text=text):
                self.assertEqual(bc.tokenise(text, self.tagger), self.without_nani(text))

    def test_null_particle_is_untouched_and_the_pass_is_idempotent(self):
        original = [{"s": "何", "b": "何", "p": "代名詞", "c": True, "r": "なん",
                     "f": [{"t": "何", "r": "なん"}], "extra": "retain"},
                    {"s": "を", "b": "を", "p": "助詞", "c": False, "r": "を",
                     "f": [{"t": "を", "r": None}], "extra": "guard"}]
        after = bc.apply_reading_overrides(deepcopy(original))
        self.assertEqual(after[0], {**original[0], "r": "なに",
                                   "f": [{"t": "何", "r": "なに"}], "rs": "lexicon"})
        self.assertEqual(after[1], original[1])
        self.assertEqual(bc.apply_reading_overrides(deepcopy(after)), after)


if __name__ == "__main__":
    unittest.main()
