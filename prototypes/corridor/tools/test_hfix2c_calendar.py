"""Calendar regression cases independent of the generator's numeric reading tables."""
import importlib.util
from pathlib import Path
import sys
import unittest
ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / 'decks/kotoba-mine/tools'), str(ROOT / 'prototypes/corridor/tools'), str(ROOT / 'corpus/src')]
import build as deck
import build_corridor as bc
from corpus.grading._mecab import get_tagger

class CalendarTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tagger = get_tagger()

    def tokens(self, text):
        tokens = deck.deck_tokens(text, self.tagger, bc)
        self.assertEqual(''.join(t['s'] for t in tokens), text)
        return tokens

    def test_dates_and_width(self):
        for surface, reading in [('11日','じゅういちにち'), ('13日','じゅうさんにち'), ('17日','じゅうしちにち'), ('14日','じゅうよっか'), ('20日','はつか'), ('24日','にじゅうよっか'), ('31日','さんじゅういちにち'), ('２０日','はつか'), ('１０日','とおか'), ('100日','ひゃくにち'), ('10日間','とおかかん')]:
            with self.subTest(surface=surface):
                got = self.tokens(surface)
                self.assertEqual([(t['s'],t['r']) for t in got], [(surface,reading)])

    def test_months_and_same_fullwidth_spelling(self):
        expected = ['いちがつ','にがつ','さんがつ','しがつ','ごがつ','ろくがつ','しちがつ','はちがつ','くがつ','じゅうがつ','じゅういちがつ','じゅうにがつ']
        for n,r in enumerate(expected,1):
            self.assertEqual(self.tokens(f'{n}月')[0]['r'], r)
        self.assertEqual([(t['s'],t['r']) for t in self.tokens('９月２０日')], [('９月','くがつ'),('２０日','はつか')])

    def test_first_day_and_duration(self):
        for text, expected in [('10月1日午前','ついたち'),('1日で終わる','いちにち'),('1日後に終わる','いちにち'),('1日早く','いちにち'),('1日に渡って','いちにち'),('1日間','いちにちかん')]:
            with self.subTest(text=text):
                self.assertEqual(next(t['r'] for t in self.tokens(text) if t['s'].startswith('1日')), expected)

    def test_unrelated_lexemes_and_invalid_numbers(self):
        for text in ['月曜日','一日中','日曜日','1000日','32日','13月','3ヶ月','1月間','1.1日']:
            self.assertFalse(any(t.get('rs') == 'deck-calendar' for t in self.tokens(text)), text)
        night = self.tokens('一晩中')
        self.assertEqual(night[-1]['r'], 'じゅう')

if __name__ == '__main__': unittest.main()
