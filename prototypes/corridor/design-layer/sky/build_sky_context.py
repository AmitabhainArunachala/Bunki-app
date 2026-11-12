#!/usr/bin/env python3
"""Builds sky-context.json beside sky-data.json: sentences, articles and grammar for the sky.

Reads only; writes sky-context.json beside this script (atomically). Nothing is invented or edited:
sentence text is cut from the stored text exactly, translations are the stored ones or "".

  kept words (indices)                 design/sky/sky-data.json (v2)
  articles, their tokens and levels    data/articles/*.json (bodies), data/articles/index.json (level facet)
  example sentences with English       data/proprietary_safe/examples/ (ex-NN index shards, s-NN sentence shards)
  grammar                              data/original/grammar-v11.json, data/shared-study/grammar.json,
                                       the GRAMMAR list in corridor.js (parsed as a literal, never executed)

How a word is found in a sentence: by the stored tokens (surface, dictionary form, reading), not by
substring. A word of 2 or more characters that holds a kanji occurs where one token, or up to four
adjacent tokens, spell its written form, either as written or with the last token in its dictionary
form (持って counts for 持つ). Where one token spells the word, its reading must agree with the word's stored
reading, so 市場 read しじょう is not listed under いちば (the readings of the pieces of a split word do not
add up, so they are not tested). Only grammar examples and articles whose tokens do not line up with
their text are matched by plain presence (longest word first).

usage: /usr/bin/python3 build_sky_context.py
"""
import bisect
import collections
import datetime
import glob
import json
import os
import re
import time

T0 = time.time()
ROOT = os.path.expanduser('~/worktrees/Bunki-app/everything-on_20261110/prototypes/corridor')
DATA = os.path.join(ROOT, 'data')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'sky-context.json')
MINLEN, MAXLEN = 8, 70
PER_WORD = 3
PER_ARTICLE = 60
CORPUS_CODE = {0: -1, 1: -2, 2: -3}  # examples store source -> the number written where an article index would be


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


# ---- the kept words -------------------------------------------------------------------------
SKY = load(os.path.join(HERE, 'sky-data.json'))
assert SKY['v'] == 2, 'sky-data.json on disk is not v2'
WORDS = SKY['words']
KANJI = re.compile('[㐀-鿿豈-﫿]')
WIDX = {}
for i, row in enumerate(WORDS):
    if len(row[0]) >= 2 and KANJI.search(row[0]):
        WIDX.setdefault(row[0], i)
MAXW = max(len(w) for w in WIDX)
KATA = {chr(c): chr(c - 0x60) for c in range(0x30A1, 0x30F7)}


def norm(r):
    r = ''.join(KATA.get(ch, ch) for ch in (r or ''))
    return r.replace('にっぽん', 'にほん').replace('わたくし', 'わたし')


def is_hira(ch):
    return 'ぁ' <= ch <= 'ゖ'


def tail_kana(w):
    k = 0
    while k < len(w) and is_hira(w[-1 - k]):
        k += 1
    return k


def readings_of(r):
    """A stored reading may give two readings (いく; ゆく) or carry a note (けっこん (する)): every reading it names."""
    r = re.sub(r'[（(][^）)]*[）)]', '', r or '')
    return [x for x in (norm(p.strip()) for p in re.split(r'[;；、,]', r)) if x]


WREAD = [readings_of(row[1]) for row in WORDS]
SAME_READING = {'言う': ('ゆう', 'いう')}   # the tokens give 言う as ゆう
IRREGULAR_STEMS = {'来る': ('く', 'き', 'こ')}
REJECT = collections.Counter()


def reading_ok(wi, reading, known):
    if not known:
        return True
    w = WORDS[wi][0]
    reading = norm(reading)
    if w in SAME_READING and reading.startswith(SAME_READING[w][0]):
        reading = SAME_READING[w][1] + reading[len(SAME_READING[w][0]):]
    if w in IRREGULAR_STEMS:
        return reading.startswith(IRREGULAR_STEMS[w])
    k = tail_kana(w)
    for wr in WREAD[wi]:
        if k:  # ends in kana, which may be inflected away (持って, 際して): the reading up to the last kanji must agree
            stem = wr[:-k] if k < len(wr) else ''
            if not stem or reading.startswith(stem):
                return True
        elif reading == wr:
            return True
    return not WREAD[wi]


def match_tokens(toks):
    """toks: [(surface, dictionary form, reading, start)].  ->  [(wordIdx, start, length)]"""
    out = []
    n = len(toks)
    for i in range(n):
        surf, rd, known = '', '', True
        start = toks[i][3]
        for j in range(i, min(n, i + 4)):
            s, b, r, st = toks[j]
            if st != start + len(surf):
                break
            lit = surf + s
            if len(lit) > MAXW + 3:
                break
            full_r = rd + r
            known = known and r != '' and j == i
            wi = WIDX.get(lit)
            if wi is not None:
                if reading_ok(wi, full_r, known):
                    out.append((wi, start, len(lit)))
                else:
                    REJECT[(lit, norm(full_r))] += 1
            if b and b != s:
                wi = WIDX.get(surf + b)
                if wi is not None:
                    if reading_ok(wi, full_r, known):
                        out.append((wi, start, len(lit)))
                    else:
                        REJECT[(surf + b, norm(full_r))] += 1
            surf, rd = lit, full_r
    return out


def match_plain(text):
    """Plain presence, leftmost and longest first, no overlaps."""
    out, i, n = [], 0, len(text)
    while i < n:
        hit = None
        for ln in range(min(MAXW, n - i), 1, -1):
            wi = WIDX.get(text[i:i + ln])
            if wi is not None:
                hit = (wi, i, ln)
                break
        if hit:
            out.append(hit)
            i += hit[2]
        else:
            i += 1
    return out


# ---- sentences of a text --------------------------------------------------------------------
WS = set(' \t\r\n　')
OPEN, CLOSE, END = '「『（(〈《【［', '」』）)〉》】］', '。！？!?'


def sentence_spans(text):
    """Split on 。！？ and on line breaks.  A line (or its tail) with no sentence end is a heading or a fragment: dropped."""
    spans, n, line_start = [], len(text), 0
    while line_start < n:
        line_end = text.find('\n', line_start)
        if line_end < 0:
            line_end = n
        depth, a, i = 0, line_start, line_start
        while i < line_end:
            ch = text[i]
            if ch in OPEN:
                depth += 1
            elif ch in CLOSE:
                depth = max(0, depth - 1)
            elif ch in END:
                j = i + 1
                while j < line_end and text[j] in END:
                    j += 1
                if depth == 0:
                    while j < line_end and text[j] in CLOSE:
                        j += 1
                    spans.append((a, j))
                    a = i = j
                    continue
                k, d = j, depth
                while k < line_end and text[k] in CLOSE and d > 0:
                    k += 1
                    d -= 1
                if d == 0 and k == line_end:  # the line closes its quote right after the sentence end
                    spans.append((a, k))
                    a = i = k
                    depth = 0
                    continue
            i += 1
        line_start = line_end + 1
    out = []
    for a, b in spans:
        while a < b and text[a] in WS:
            a += 1
        while b > a and text[b - 1] in WS:
            b -= 1
        if MINLEN <= b - a <= MAXLEN:
            out.append((a, b))
    return out


def align(text, tokens):
    """Character position of every token in the stored text; None when they do not line up."""
    pos, out = 0, []
    for t in tokens:
        s = t.get('s') or ''
        if not s.strip(' \t\r\n　'):
            continue
        while pos < len(text) and text[pos] in WS:
            pos += 1
        if text.startswith(s, pos):
            k = pos
        else:
            k = text.find(s, pos, pos + 12 + len(s))
            if k < 0:
                return None
        out.append((s, t.get('b') or s, t.get('r') or '', k))
        pos = k + len(s)
    return out


# ---- articles -------------------------------------------------------------------------------
INDEX = {a['id']: a for a in load(os.path.join(DATA, 'articles', 'index.json'))['articles']}
LEVEL_RE = re.compile(r'^N[1-5]\+?$')
articles = []       # [id, titleJa, titleEn, level, sourceLabel]
article_pool = []   # kept out of the file; counted for the notes
art_matches = []    # per article: Counter(wordIdx -> occurrences in the whole article)
cand_art = collections.defaultdict(list)  # wordIdx -> [(length, articleIdx, text, start, len)]
stats = collections.Counter()
not_aligned = []
for path in sorted(glob.glob(os.path.join(DATA, 'articles', '*.json'))):
    d = load(path)
    if not isinstance(d, dict) or not isinstance(d.get('text'), str) or 'id' not in d or 'title' not in d:
        continue
    stats['article files with a body'] += 1
    text = d['text']
    spans = sentence_spans(text)
    if not spans:
        stats['articles without any sentence of 8 to 70 characters'] += 1
        continue
    toks = align(text, d.get('tokens') or []) if d.get('tokens') else None
    if toks is None:
        not_aligned.append(os.path.basename(path))
        found = []
        for a, b in spans:
            found += [(wi, a + st, ln) for wi, st, ln in match_plain(text[a:b])]
        whole = collections.Counter(wi for wi, _, _ in match_plain(text))
    else:
        found = match_tokens(toks)
        whole = collections.Counter(wi for wi, _, _ in found)
    row = INDEX.get(d['id']) or {}
    level = d.get('authorLevel') if LEVEL_RE.match(str(d.get('authorLevel') or '')) else None
    level = level or (row.get('readingFacets') or {}).get('jlpt') or ''
    ai = len(articles)
    articles.append([d['id'], d['title'], d.get('titleEn') or '', level, d.get('sourceLabel') or ''])
    article_pool.append((d.get('pool') or '?', d.get('licence') or '?'))
    art_matches.append(whole)
    starts = [a for a, _ in spans]
    for wi, st, ln in found:
        k = bisect.bisect_right(starts, st) - 1
        if k < 0:
            continue
        a, b = spans[k]
        if st + ln <= b:
            cand_art[wi].append((b - a, ai, text[a:b], st - a, ln))
    stats['article sentences of 8 to 70 characters'] += len(spans)

# ---- the examples store ---------------------------------------------------------------------
EXDIR = os.path.join(DATA, 'proprietary_safe', 'examples')
MAN = load(os.path.join(EXDIR, 'manifest.json'))
PER_SHARD = MAN['sharding']['sentsPerShard']
ex_index = {}
for path in sorted(glob.glob(os.path.join(EXDIR, 'ex-*.json'))):
    ex_index.update(load(path))
shards = {}


def corpus_sentence(sid):
    k = sid // PER_SHARD
    if k not in shards:
        shards[k] = load(os.path.join(EXDIR, f's-{k:02d}.json'))
    return shards[k][sid % PER_SHARD]


cand_cor = collections.defaultdict(list)  # wordIdx -> [(length, code, text, en, start, len)]
for w, wi in WIDX.items():
    for sid in ex_index.get(w) or []:
        toks_raw, en, src = corpus_sentence(sid)[:3]
        toks, pos = [], 0
        for t in toks_raw:
            toks.append((t[0], t[1] or t[0], t[2] or '', pos))
            pos += len(t[0])
        text = ''.join(t[0] for t in toks)
        if not MINLEN <= len(text) <= MAXLEN:
            stats['example sentences outside 8 to 70 characters'] += 1
            continue
        hits = [(st, ln) for x, st, ln in match_tokens(toks) if x == wi]
        if not hits:
            stats['example sentences listed for a word but not confirmed by tokens and reading'] += 1
            continue
        cand_cor[wi].append((len(text), CORPUS_CODE.get(src, -9), text, en or '', hits[0][0], hits[0][1]))

# ---- up to three sentences per word ----------------------------------------------------------
sentences = []
sent_index = {}
word_sent = {}
word_sent_at = {}


def sid_of(code, text, en):
    key = (code, text)
    if key not in sent_index:
        sent_index[key] = len(sentences)
        sentences.append([code, text, en])
    return sent_index[key]


for wi in sorted(set(cand_art) | set(cand_cor)):
    art = sorted(set(cand_art.get(wi) or []), key=lambda c: (c[0], c[1], c[2], c[3]))
    cor = sorted(set(cand_cor.get(wi) or []), key=lambda c: (c[0], c[2]))
    picked, seen_text, seen_article = [], set(), set()

    def take(c, en=''):
        if c[2] in seen_text:
            return False
        seen_text.add(c[2])
        picked.append((c[0], c[1], c[2], en, c[-2], c[-1]))
        return True

    for c in art:  # first: two sentences from two different articles
        if len(picked) >= 2:
            break
        if c[1] not in seen_article and take(c):
            seen_article.add(c[1])
    for c in cor:  # then: example sentences, which carry English
        if len(picked) >= PER_WORD:
            break
        take(c, c[3])
    for c in art:  # then: more articles, one sentence each
        if len(picked) >= PER_WORD:
            break
        if c[1] not in seen_article and take(c):
            seen_article.add(c[1])
    for c in art:  # last: the same article again
        if len(picked) >= PER_WORD:
            break
        take(c)
    picked.sort(key=lambda c: (c[0], c[2]))
    word_sent[str(wi)] = [sid_of(c[1], c[2], c[3]) for c in picked]
    word_sent_at[str(wi)] = [[c[4], c[5]] for c in picked]

# ---- words of an article, most characteristic first -------------------------------------------
df = collections.Counter()
for whole in art_matches:
    df.update(whole.keys())
article_words = []
for whole in art_matches:
    ranked = sorted(whole, key=lambda wi: (df[wi], -whole[wi], wi))
    article_words.append(ranked[:PER_ARTICLE])


# ---- grammar ----------------------------------------------------------------------------------
def parse_js_literal(src, i=0):
    """A strict reader for a JavaScript array or object literal: strings, numbers, true/false/null, nested
    arrays and objects, comments, trailing commas, 'a' + 'b'.  Anything else raises; nothing is executed."""
    n = len(src)
    ident = re.compile(r'[A-Za-z_$][\w$]*')
    number = re.compile(r'-?\d+(?:\.\d+)?')

    def ws():
        nonlocal i
        while i < n:
            if src[i] in ' \t\r\n':
                i += 1
            elif src.startswith('//', i):
                j = src.find('\n', i)
                i = n if j < 0 else j + 1
            elif src.startswith('/*', i):
                j = src.find('*/', i)
                if j < 0:
                    raise ValueError('unclosed comment')
                i = j + 2
            else:
                break

    def string():
        nonlocal i
        q = src[i]
        i += 1
        out = []
        while True:
            c = src[i]
            if c == '\\':
                e = src[i + 1]
                if e == 'n':
                    out.append('\n')
                elif e == 't':
                    out.append('\t')
                elif e == 'u':
                    out.append(chr(int(src[i + 2:i + 6], 16)))
                    i += 4
                elif e != '\n':
                    out.append(e)
                i += 2
            elif c == q:
                i += 1
                return ''.join(out)
            elif c == '\n' and q != '`':
                raise ValueError('line break inside a string')
            elif q == '`' and c == '$' and src[i + 1] == '{':
                raise ValueError('template expression')
            else:
                out.append(c)
                i += 1

    def value():
        nonlocal i
        ws()
        c = src[i]
        if c == '{':
            i += 1
            obj = {}
            while True:
                ws()
                if src[i] == '}':
                    i += 1
                    return obj
                if src[i] in '\'"':
                    key = string()
                else:
                    m = ident.match(src, i)
                    if not m:
                        raise ValueError(f'object key at {i}: {src[i:i + 30]!r}')
                    key = m.group(0)
                    i = m.end()
                ws()
                if src[i] != ':':
                    raise ValueError(f'no colon at {i}: {src[i:i + 30]!r}')
                i += 1
                obj[key] = value()
                ws()
                if src[i] == ',':
                    i += 1
                elif src[i] != '}':
                    raise ValueError(f'object at {i}: {src[i:i + 30]!r}')
        if c == '[':
            i += 1
            arr = []
            while True:
                ws()
                if src[i] == ']':
                    i += 1
                    return arr
                arr.append(value())
                ws()
                if src[i] == ',':
                    i += 1
                elif src[i] != ']':
                    raise ValueError(f'array at {i}: {src[i:i + 30]!r}')
        if c in '\'"`':
            s = string()
            while True:
                ws()
                if i < n and src[i] == '+':
                    i += 1
                    ws()
                    if src[i] not in '\'"`':
                        raise ValueError(f'+ without a string at {i}')
                    s += string()
                else:
                    return s
        m = number.match(src, i)
        if m:
            i = m.end()
            return float(m.group(0)) if '.' in m.group(0) else int(m.group(0))
        for lit, v in (('true', True), ('false', False), ('null', None)):
            if src.startswith(lit, i):
                i += len(lit)
                return v
        raise ValueError(f'not a literal at {i}: {src[i:i + 40]!r}')

    v = value()
    return v, i


grammar = []
grammar_source = []
seen_id = {}
gstats = collections.Counter()
dup_ids = []
inline_note = ''


def add_pattern(source, gid, pattern, level, m_en, m_ja, form, examples):
    if not gid or not pattern:
        gstats[f'{source}: row without id or pattern, left out'] += 1
        return
    if gid in seen_id:
        dup_ids.append((gid, seen_id[gid], source))
        return
    seen_id[gid] = source
    ex = [[str(e.get('ja') or ''), str(e.get('en') or '')] for e in (examples or []) if e.get('ja')]
    words = []
    for ja, _ in ex:
        for wi, _, _ in match_plain(ja):
            if wi not in words:
                words.append(wi)
    grammar.append([gid, pattern, level or '', m_en or '', m_ja or '', form or '', ex, words])
    grammar_source.append(source)
    gstats[(source, level or '')] += 1


try:
    with open(os.path.join(ROOT, 'corridor.js'), encoding='utf-8') as f:
        js = f.read()
    m = re.search(r'^const GRAMMAR = \[', js, re.M)
    if not m:
        raise ValueError('const GRAMMAR = [ not found')
    inline, end = parse_js_literal(js, m.end() - 1)
    if not js[end:end + 1] == ';':
        raise ValueError('the list does not end with ];')
    if not (isinstance(inline, list) and inline and all(isinstance(x, dict) and x.get('id') and x.get('p') and isinstance(x.get('ex'), list) for x in inline)):
        raise ValueError('unexpected rows')
    for e in inline:
        add_pattern('corridor.js', e.get('id'), e.get('p'), e.get('lv'), e.get('mEn'), e.get('mJa'), e.get('form'), e.get('ex'))
    inline_note = f'{len(inline)} rows parsed from the GRAMMAR literal in corridor.js (line {js.count(chr(10), 0, m.start()) + 1})'
except Exception as err:  # the list is left out rather than guessed
    inline_note = f'the GRAMMAR literal in corridor.js could not be parsed and is left out: {err}'
for e in load(os.path.join(DATA, 'original', 'grammar-v11.json'))['entries']:
    add_pattern('grammar-v11', e.get('id'), e.get('p'), e.get('lv'), e.get('mEn'), e.get('mJa'), e.get('form'), e.get('ex'))
SHARED = load(os.path.join(DATA, 'shared-study', 'grammar.json'))
for r in SHARED['records']:
    add_pattern('shared-study', r.get('guid'), r.get('pattern'), r.get('level'), r.get('meaning'), '', r.get('formation'), r.get('examples'))

# ---- checks ---------------------------------------------------------------------------------
NW = len(WORDS)
for s in sentences:
    assert (0 <= s[0] < len(articles)) or s[0] in (-1, -2, -3), s
    assert MINLEN <= len(s[1]) <= MAXLEN, s
    assert '\n' not in s[1]
assert len(articles) == len(article_words)
for key, ids in word_sent.items():
    wi = int(key)
    w = WORDS[wi][0]
    assert 0 <= wi < NW and 1 <= len(ids) <= PER_WORD and len(set(ids)) == len(ids)
    assert len(word_sent_at[key]) == len(ids)
    for sid, (st, ln) in zip(ids, word_sent_at[key]):
        assert 0 <= sid < len(sentences)
        piece = sentences[sid][1][st:st + ln]
        k = tail_kana(w)  # as written, or (a word ending in kana) the same up to its last kanji: 持っ for 持つ, 際し for 際する
        assert len(piece) == ln and (piece == w or (k and piece.startswith(w[:-k]))), (w, piece, sentences[sid][1])
used = {sid for ids in word_sent.values() for sid in ids}
assert used == set(range(len(sentences))), 'a sentence that no word uses'
for ws_ in article_words:
    assert len(ws_) <= PER_ARTICLE and all(0 <= wi < NW for wi in ws_) and len(set(ws_)) == len(ws_)
for row in grammar:
    assert len(row) == 8 and all(0 <= wi < NW for wi in row[7])
    for wi in row[7]:
        assert any(WORDS[wi][0] in ja for ja, _ in row[6]), (row[0], WORDS[wi][0])
first_of = {}
grammar_twin = []
for gi, g in enumerate(grammar):
    grammar_twin.append(first_of.get(g[1], -1))
    first_of.setdefault(g[1], gi)
assert len(grammar) == len(grammar_source) == len(grammar_twin) == len({g[0] for g in grammar})

# ---- write ----------------------------------------------------------------------------------
pool_sent = collections.Counter()
for code, _, _ in sentences:
    pool_sent[article_pool[code] if code >= 0 else ('proprietary_safe/examples', {-1: 'snow-t15-t23', -2: 'tanaka-corpus', -3: 'ja.wikinews'}[code])] += 1
literal = sum(1 for key, ids in word_sent.items() for sid, (st, ln) in zip(ids, word_sent_at[key]) if sentences[sid][1][st:st + ln] == WORDS[int(key)][0])
total_links = sum(len(v) for v in word_sent.values())
JST = datetime.timezone(datetime.timedelta(hours=9))
counts = {
    'articles': len(articles), 'sentences': len(sentences), 'wordsWithSentence': len(word_sent),
    'sentencesFromArticles': sum(1 for s in sentences if s[0] >= 0), 'sentencesFromExamples': sum(1 for s in sentences if s[0] < 0),
    'sentencesWithEnglish': sum(1 for s in sentences if s[2]), 'wordSentenceLinks': total_links,
    'articleWordLinks': sum(len(x) for x in article_words), 'grammar': len(grammar),
}
data = {
    'v': 1,
    'built': datetime.datetime.now(JST).isoformat(timespec='seconds'),
    'counts': counts,
    'notes': [
        'Word indices point into sky-data.json words (v2, built ' + str(SKY.get('built')) + ').',
        'sentences[i][0] is an index into articles, or a negative number for a sentence from the examples store '
        '(data/proprietary_safe/examples): -1 snow-t15-t23 (CC BY 4.0), -2 tanaka-corpus (CC BY 2.0 FR), -3 ja.wikinews (CC BY 2.5). '
        'Only those carry a stored English sentence; no article stores sentence-level English.',
        'A word is found by the stored tokens (written form, or the last token in its dictionary form: 持って counts for 持つ) and the '
        'reading of a one-token match must agree with the word\'s reading. wordSentAt gives, for each entry of wordSent, [start, length] of the word '
        'as it stands in that sentence, for marking it.',
        'Pools and licences of the sentences (pool, licence: sentences): '
        + '; '.join(f'{p}, {lic}: {n}' for (p, lic), n in sorted(pool_sent.items(), key=lambda t: -t[1])) + '. '
        'Each article\'s pool, licence and attribution stay in its own file in data/articles and must travel with any sentence shown.',
        'grammarSource[i] names the file grammar[i] comes from; grammarTwin[i] is the index of an earlier row with the same pattern text under another id, or -1. shared-study rows carry the label "' + str(SHARED.get('contentLabel'))
        + '" (distribution status: ' + str(SHARED.get('distributionStatus')) + '); grammar-v11 and corridor.js rows are Bunki originals. '
        'Words of a grammar row are found in its example sentences by plain presence, longest word first.',
        inline_note + '.',
    ],
    'articles': articles,
    'sentences': sentences,
    'wordSent': word_sent,
    'wordSentAt': word_sent_at,
    'articleWords': article_words,
    'grammar': grammar,
    'grammarSource': grammar_source,
    'grammarTwin': grammar_twin,
}
with open(OUT + '.tmp', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
os.replace(OUT + '.tmp', OUT)

# ---- report ---------------------------------------------------------------------------------
print('== sky-context.json', data['built'], '| bytes', os.path.getsize(OUT), '| run time', f'{time.time() - T0:.0f} s')
print('counts', counts)
print('stats', dict(stats))
print('articles whose tokens did not line up with the text (matched by plain presence):', len(not_aligned), not_aligned[:8])
print('levels of the articles', dict(collections.Counter(a[3] for a in articles)), '| with an English title', sum(1 for a in articles if a[2]))
print('sentences per word', dict(collections.Counter(len(v) for v in word_sent.values())),
      '| words of 2+ characters', len(WIDX), '| word-sentence links where the word stands as written', literal, 'of', total_links)
no_sent = [w for (w, _), n in REJECT.most_common() if str(WIDX[w]) not in word_sent]
print('words with a refused reading that end with no sentence at all:', len(set(no_sent)), ' '.join(list(dict.fromkeys(no_sent))[:20]))
print('readings refused (word, its stored reading, the tokens\' reading: times), top 16:', ' '.join(f"{w}/{'・'.join(WREAD[WIDX[w]])}≠{r}:{n}" for (w, r), n in REJECT.most_common(16)), '| in all', sum(REJECT.values()), 'over', len({w for w, _ in REJECT}), 'words')
print('grammar by source and level', {f'{s} {lv}': n for (s, lv), n in sorted((k, v) for k, v in gstats.items() if isinstance(k, tuple))},
      '| other', {k: v for k, v in gstats.items() if not isinstance(k, tuple)})
print('grammar ids met twice (first source kept):', dup_ids[:10], '| rows whose pattern text is already listed under another id:',
      sum(1 for t in grammar_twin if t >= 0), dict(collections.Counter((grammar_source[t], grammar_source[i]) for i, t in enumerate(grammar_twin) if t >= 0)))
import random
rs = random.Random(11)
print('twelve article sentences at random:')
for sid in rs.sample([i for i, x in enumerate(sentences) if x[0] >= 0], 12):
    print('   ', sentences[sid][1])
print(inline_note)
print('pools of the sentences', {f'{p} / {lic}': n for (p, lic), n in pool_sent.items()})
for w in ('強烈', '学校', '判断', '持つ', '熾烈'):
    wi = WIDX.get(w)
    key = str(wi)
    if key not in word_sent:
        print('--', w, 'no sentence')
        continue
    print('--', w, WORDS[wi][1], '| articles that hold it:', df.get(wi, 0))
    for sid, (st, ln) in zip(word_sent[key], word_sent_at[key]):
        s = sentences[sid]
        src = articles[s[0]][1] if s[0] >= 0 else {-1: 'SNOW', -2: 'Tanaka', -3: 'wikinews examples'}[s[0]]
        print(f'   [{src}] {s[1][:st]}【{s[1][st:st + ln]}】{s[1][st + ln:]}' + (f'  = {s[2]}' if s[2] else ''))
for gi in (0, len(grammar) - 1):
    g = grammar[gi]
    print('GRAMMAR', grammar_source[gi], json.dumps(g[:6], ensure_ascii=False), 'examples', json.dumps(g[6][:2], ensure_ascii=False),
          'words', [WORDS[wi][0] for wi in g[7]])
a0 = max(range(len(articles)), key=lambda i: len(article_words[i]))
print('ARTICLE', json.dumps(articles[a0], ensure_ascii=False), '| words', ' '.join(WORDS[wi][0] for wi in article_words[a0][:24]))
