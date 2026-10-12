#!/usr/bin/env python3
"""Build js/data.js for concept C (Living Shelf) from REAL repo data only.

Sources (read-only):
  docs/redesign/concepts/_kit/content.json          12 cards, 6 articles
  prototypes/corridor/decks/{n1,n2,senmon}/deck.json all words + passages
  prototypes/corridor/data/share_alike/kanji.json    KANJIDIC2/KanjiVG derived (CC BY-SA)
  prototypes/corridor/data/share_alike/strokes.json  KanjiVG stroke paths (CC BY-SA 3.0)

Run:  python3 -I docs/redesign/concepts/c-living-shelf/tools/gen-data.py
"""
import json, re, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../..'))
OUT = os.path.join(os.path.dirname(__file__), '..', 'js', 'data.js')
J = lambda p: json.load(open(os.path.join(ROOT, p), encoding='utf-8'))

kit = J('docs/redesign/concepts/_kit/content.json')
kj = J('prototypes/corridor/data/share_alike/kanji.json')
KANJI, RADS = kj['kanji'], kj['radicals']
STROKES = J('prototypes/corridor/data/share_alike/strokes.json')['strokes']

# English names for components that are not standalone kanji (hand-checked, conventional names)
PART_EN = {
    '扌': 'hand', '亻': 'person', '辶': 'road, movement', '氵': 'water', '忄': 'heart', '彳': 'step',
    '夂': 'walk slowly', '攵': 'strike', '宀': 'roof', '艹': 'grass', '⺣': 'fire', '灬': 'fire',
    '冫': 'ice', '阝': 'mound / village', '刂': 'knife', '礻': 'altar', '衤': 'garment', '糹': 'thread',
    '罒': 'net', '亠': 'lid', '冖': 'cover', '疒': 'sickness', '厂': 'cliff', '广': 'house on cliff',
    '尸': 'body', '彡': 'hair strokes', '丿': 'stroke', '乂': 'cross', '幵': 'level', '开': 'open',
    '圣': 'sage (old form)', '斉': 'equal', '齊': 'equal (old form)', '复': 'return (old form)',
    '隹': 'short-tailed bird', '卜': 'divination', '其': 'that, basket', '包': 'wrap', '台': 'pedestal',
    '相': 'mutual', '正': 'correct', '矢': 'arrow', '豆': 'bean', '甘': 'sweet', '八': 'eight',
    '門': 'gate', '日': 'sun, day', '心': 'heart', '立': 'stand', '十': 'ten', '石': 'stone',
    '一': 'one', '口': 'mouth', '木': 'tree', '糸': 'thread', '又': 'again, right hand', '目': 'eye',
}
VARIANT_DROP = {'扌': '手', '亻': '人', '氵': '水', '忄': '心'}

# ---- all deck words -------------------------------------------------------------
WORDS, PASS = [], []
deckmeta = {}
for deck in ('n1', 'n2', 'senmon'):
    d = J(f'prototypes/corridor/decks/{deck}/deck.json')
    deckmeta[deck] = {g['id']: g['titleEn'] for g in d['groups']}
    for w in d['words']:
        term = w['term']
        cards = w.get('cards', [])
        ja = cards[0]['ja'] if cards else ''
        WORDS.append({'t': term, 'r': w.get('reading', ''), 'm': w.get('meaning', ''), 'dj': w.get('defJa', ''),
                      'd': deck, 'g': w.get('group', ''), 'pos': w.get('pos', ''),
                      'k': [k['c'] for k in w.get('kanji', [])],
                      'kp': {k['c']: [p for p in k.get('parts', [])] for k in w.get('kanji', [])}})
        for c in cards:
            PASS.append({'term': term, 'deck': deck, 'ja': c['ja'], 'reg': c.get('register', ''), 'topic': c.get('topic', '')})

def sentences(txt):
    return [s for s in re.split(r'(?<=[。！？])', txt) if s.strip()]

def passages_for(term, limit=3):
    """Sentences from OTHER cards' passages that contain the term (the compounding web)."""
    out = []
    for p in PASS:
        if p['term'] == term or term not in p['ja']:
            continue
        for s in sentences(p['ja']):
            if term in s and len(s) <= 90:
                out.append({'s': s, 'from': p['term'], 'd': p['deck']}); break
        if len(out) >= limit: break
    return out

own = {}
for w in WORDS:
    s = ''
    for p in PASS:
        if p['term'] == w['t']:
            for sen in sentences(p['ja']):
                if w['t'] in sen or (w['k'] and w['k'][0] in sen):
                    s = sen; break
            if not s: s = sentences(p['ja'])[0]
            break
    w['s'] = s[:90]

# kanji used anywhere
used = []
for w in WORDS:
    for c in w['k']:
        if c not in used: used.append(c)
for c in '反復':
    if c not in used: used.append(c)

def parts_of(c):
    deck_parts = None
    for w in WORDS:
        if c in w['kp'] and w['kp'][c]:
            deck_parts = w['kp'][c]; break
    ps = deck_parts if deck_parts is not None else (KANJI.get(c, {}).get('parts') or [])
    ps = [p for p in ps if p != c]
    for keep, drop in VARIANT_DROP.items():
        if keep in ps and drop in ps: ps.remove(drop)
    # KanjiVG lists sub-components too; a part already inside another listed part is dropped
    CONTAINED = {'隹': ['亻', '人'], '复': ['日', '夂', '人', '亻'], '齊': ['斉'], '幵': [], '开': ['幵']}
    for big, smalls in CONTAINED.items():
        if big in ps:
            ps = [p for p in ps if p not in smalls]
    return ps[:4]

KOUT = {}
for c in used:
    k = KANJI.get(c)
    if not k: continue
    KOUT[c] = {'on': k.get('on', [])[:2], 'kun': k.get('kun', [])[:2], 'm': k.get('m', ''), 'st': k.get('st'),
               'kk': k.get('kk', ''), 'p': parts_of(c)}

word_kanji = set(used)
POUT = {}
allparts = sorted({p for c in KOUT for p in KOUT[c]['p']})
for p in allparts:
    r = RADS.get(p, {})
    members = [c for c in r.get('kanji', []) if c in word_kanji]
    # also kanji whose parts (deck) include p
    for c in KOUT:
        if p in KOUT[c]['p'] and c not in members: members.append(c)
    m = PART_EN.get(p) or (KANJI.get(p, {}).get('m', '') or '').lower()
    POUT[p] = {'n': r.get('name', ''), 'm': m, 'k': members[:24], 'kt': r.get('kanjiCount') or len(r.get('kanji', [])),
               'st': r.get('st') or (KANJI.get(p, {}) or {}).get('st')}

# strokes for every kanji + part we have (KanjiVG centrelines)
SOUT = {}
for c in list(KOUT) + allparts:
    if c in STROKES: SOUT[c] = STROKES[c]

# passages for words that are likely centres (cards + walk + their siblings)
centres = [c['term'] for c in kit['cards']] + ['反復', '推測', '促進', '類推', '主権', '権威', '傀儡政権', '進化', '精進', '推敲']
POUT_PASS = {t: passages_for(t) for t in centres}

# trim words
for w in WORDS:
    w.pop('kp', None)

data = {
    'cards': kit['cards'], 'articles': kit['articles'], 'words': WORDS, 'kanji': KOUT, 'parts': POUT,
    'strokes': SOUT, 'passages': POUT_PASS, 'groups': deckmeta,
}
js = '/* generated by tools/gen-data.py from real repo data: do not edit */\nwindow.BUNKI = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(OUT, 'w', encoding='utf-8').write(js)
print('wrote', OUT, len(js.encode('utf-8')) // 1024, 'KB', len(WORDS), 'words', len(KOUT), 'kanji', len(POUT), 'parts', len(SOUT), 'strokes')
print('passages', {k: len(v) for k, v in POUT_PASS.items()})
