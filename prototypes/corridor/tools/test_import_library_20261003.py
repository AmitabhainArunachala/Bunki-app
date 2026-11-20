"""Pure source controls. Synthetic computation is labelled and never an approval."""
import copy
import json
import unittest
from unittest.mock import patch

import import_library_20261003 as lib


class LibraryImport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows, cls.selection = lib.load_inputs()
        cls.rule = json.loads(lib.read_pin(cls.selection["earRule"]))
        cls.rule["rows"] += json.loads(lib.read_pin(cls.selection["additionalEarRule"]))["rows"]
        cls.original = [r["candidate"] for r in cls.rows]
        cls.index, cls.archive, cls.pins = lib.baseline()

    def test_all_110_exact_source_hashes_and_original_metadata(self):
        self.assertEqual(len(lib.validate_manifest(self.rows, self.original, self.rule)), 110)

    def test_existing_156_and_686_untouched(self):
        self.assertEqual(len(self.index["articles"]), 156)
        self.assertEqual(len(self.archive["articles"]), 686)
        self.assertEqual(lib.baseline()[2], self.pins)
        self.assertTrue(all("picture" in row for row in self.index["articles"]))

    def test_unknown_duplicate_and_empty_selection_refused(self):
        for ids in [[], [self.rows[0]["id"]] * 2, ["unknown"]]:
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                lib.selected_rows(self.rows, ids, self.index, self.archive)

    def test_existing_id_and_slug_collision_refused(self):
        row = self.rows[0]
        for old in [{"id": row["id"], "file": "different.json"}, {"id": "different", "file": lib.slug(row["id"])}]:
            with self.subTest(old=old), self.assertRaises(ValueError):
                lib.selected_rows(self.rows, [row["id"]], {"articles": [old]}, {"articles": []})

    def test_all110_selected_in_source_order(self):
        actual = lib.selected_rows(self.rows, [r["id"] for r in reversed(self.rows)], self.index, self.archive)
        self.assertEqual(actual, self.rows)

    def test_source_text_metadata_level_and_admission_mutations_rejected(self):
        changes = [lambda r: r[0]["sourceText"].update(text="changed"),
                   lambda r: r[0]["admittedText"].update(editMap=[{"before": "a", "after": "b"}]),
                   lambda r: r[0]["candidate"].update(attribution="invented"),
                   lambda r: r[0]["level"].update(originalLabel="N5"),
                   lambda r: r[0]["admission"].update(humanApproval={"authority": "John"}),
                   lambda r: r[0]["admission"].update(titleReceipts=[{"approved": True}]),
                   lambda r: r[0]["admission"].update(contentReviews=[{"family": "invented"}])]
        for change in changes:
            rows = copy.deepcopy(self.rows); change(rows)
            with self.subTest(change=change), self.assertRaises(ValueError):
                lib.validate_manifest(rows, self.original, self.rule)

    def test_production_activation_always_refuses_current_key(self):
        with self.assertRaisesRegex(ValueError, "activation held"):
            lib.generate(lib.OUTPUT / "must-not-exist", [self.rows[0]["id"]], activate=True)
        self.assertFalse((lib.OUTPUT / "must-not-exist").exists())

    def test_output_and_relative_traversals_refuse(self):
        for path in [lib.REPO, lib.OUTPUT, lib.OUTPUT / "../escape", lib.ARTICLES, "/tmp/library"]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                lib.output_path(path)
        for path in ["../escape.json", "/absolute", "archive/../../escape", "a//b"]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                lib.safe_relative(path)

    def test_stale_input_pin_refuses(self):
        ref = dict(self.selection["inputPins"][0]); ref["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "stale input"):
            lib.read_pin(ref)

    def test_stale_parent_refuses(self):
        with patch.object(lib.subprocess, "check_output", return_value="0" * 40), self.assertRaisesRegex(ValueError, "stale source parent"):
            lib.load_inputs()

    def test_hiding_exclusions_and_output_scope_are_exactly_keyed(self):
        key = json.loads(lib.read_pin({"path": str(lib.KEY), "sha256": lib.KEY_SHA}))
        for change in [lambda s: s["visibility"]["hideIds"].pop(),
                       lambda s: s["visibility"]["keepIds"].clear(),
                       lambda s: s["proposedWeakExclusions"].clear(),
                       lambda s: s.update(outputRoot=str(lib.ARTICLES)),
                       lambda s: s.update(missingInputs=[])]:
            value = copy.deepcopy(self.selection); change(value)
            with self.subTest(change=change), self.assertRaises(ValueError):
                lib.validate_selection(value, key)

    def test_unicode_and_independent_numeric_grading(self):
        row = next(r for r in self.rows if r["id"] == "aozora:000424")
        calls = []
        def compute(text, *_):
            calls.append(text)
            return [{"s": "𤄃", "b": "𤄃", "c": True}], [], {"signals": {"jreadability": {"score": 1.23456789}, "jlpt_lexicon": {"coverage": .123456789}}}, {"forms": ["𤄃"]}
        index, body = lib.assemble(row, compute)
        self.assertEqual(body["text"], row["sourceText"]["text"])
        self.assertIn("𤄃", body["text"])
        self.assertEqual(index["chars"] + 1, index["textMetrics"]["utf16Length"])
        self.assertEqual(index["grading"]["signals"]["jreadability"]["score"], 1.23456789)
        self.assertEqual(index["authorLevel"], row["level"]["authorLevel"])
        self.assertEqual(calls, [body["text"]])
        self.assertEqual(lib.assemble(row, compute), (index, body))

    def test_wikipedia_keeps_version_pool_credit_and_held_status(self):
        row = next(r for r in self.rows if r["id"] == "jawiki:526109")
        item, body = lib.assemble(row, lambda *_: ([], [], {"signals": {}}, {}))
        self.assertEqual(item["pool"], "share_alike")
        self.assertIn("oldid=", item["url"])
        self.assertEqual(body["provenance"], row["candidate"])
        self.assertFalse(body["libraryCandidate"]["installable"])
        self.assertEqual(body["admission"]["contentReviews"], [])


if __name__ == "__main__":
    unittest.main()
