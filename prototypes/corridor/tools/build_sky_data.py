#!/usr/bin/env python3
"""Builds the data of the first screen's sky (宙, prototypes/corridor/sky/) from the app's own data.

Reads only the app's data files; writes one file per licence pool, because the pools are never merged into one record
set (prototypes/corridor/README.md, "Licence pools"):

  data/share_alike/sky.json             words, kanji, parts, sound families, the layout; made from share_alike files only
  data/proprietary_safe/sky-sem.json    the meaning links, made from proprietary_safe/sem.json only, by word

The app's mount (sky/mount.mjs, joinSkyData) joins the two in memory into the one object the engine reads, with each
link's two words turned into row numbers of the share_alike file. Nothing is invented: every relation is stored in a
source file or is a plain equality over stored fields (same kanji, same stored part, same stored on-reading). The only
hand-written content is the table of standard radical names and meanings below (RAD_NAME, RAD_GLOSS), used for parts
that are not kanji in the app's kanji table.

  words, readings, glosses, level, kanji of a word   share_alike/words.json
  glosses the word list leaves empty                 share_alike/dict.json (same reading only)
  kanji keyword, on/kun, strokes, parts, radical no. share_alike/kanji.json
  radical forms and names                            share_alike/radicals214.json, kanji.json radicals
  meaning links with notes                           proprietary_safe/sem.json
  the attributed 戠 family                           share_alike/kanji-family.json
  glosses still empty; characters outside the table  share_alike/reference-extra.json (extraWords, kanjiMetadata, kanjiFacts)

Built first for the 18841 preview (PROGRAM/design/sky-v1-20261111-1458/build_sky_data.py, one combined file); the
selection, layout and checks are unchanged here, so the two files join to that approved data. Not run in CI.

usage: /usr/bin/python3 prototypes/corridor/tools/build_sky_data.py [--out DIR]
       (needs numpy; about one minute; prints a sanity report. --out writes DIR/share_alike/sky.json and
       DIR/proprietary_safe/sky-sem.json instead of the files in data/)
"""
import collections
import datetime
import hashlib
import json
import math
import os
import random
import re
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
SRC = os.path.normpath(os.path.join(HERE, '..', 'data'))
OUT_DIR = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else SRC
OUT_SKY = os.path.join(OUT_DIR, 'share_alike', 'sky.json')
OUT_SEM = os.path.join(OUT_DIR, 'proprietary_safe', 'sky-sem.json')
SKY_INPUTS = [('words', 'share_alike/words.json'), ('kanji', 'share_alike/kanji.json'),
              ('radicals214', 'share_alike/radicals214.json'), ('dict', 'share_alike/dict.json'),
              ('kanji-family', 'share_alike/kanji-family.json'), ('reference-extra', 'share_alike/reference-extra.json')]
SEM_INPUTS = [('sem', 'proprietary_safe/sem.json')]
SEED = 20261111
L, YMAX = 16000, 520
ZOF = {5: [360, 560], 4: [600, 820], 3: [860, 1100], 2: [1140, 1400], 1: [1440, 1760], 0: [1440, 1760]}
ALPHA = 0.01  # a sound part is kept only when the shared reading would be a coincidence less than 1 time in 100


def load(p):
    with open(os.path.join(SRC, p), encoding='utf-8') as f:
        return json.load(f)


W = load('share_alike/words.json')['words']
KJ = load('share_alike/kanji.json')
K = KJ['kanji']
RAD = KJ['radicals']
R214 = load('share_alike/radicals214.json')
DICT = load('share_alike/dict.json').get('words') or {}
SEM = load('proprietary_safe/sem.json')['edges']
FAM = load('share_alike/kanji-family.json')
REF = load('share_alike/reference-extra.json')
EXTRA_W = {}  # (word, reading) -> meanings, first row that has any
for row in REF['extraWords']:
    if row[2] and (row[0], row[1]) not in EXTRA_W:
        EXTRA_W[(row[0], row[1])] = row[2]
KMETA = {row[0]: row for row in REF['kanjiMetadata']}
KFACT = {row[0]: row for row in REF['kanjiFacts']}
T0 = time.time()

# ---- hand-written: standard names of radical variants, standard radical meanings ------------
RAD_NAME = {'亻': 'にんべん', '刂': 'りっとう', '忄': 'りっしんべん', '扌': 'てへん', '攵': 'のぶん', '氵': 'さんずい',
            '灬': 'れっか', '爫': 'つめかんむり', '犭': 'けものへん', '礻': 'しめすへん', '⺮': 'たけかんむり',
            '罒': 'あみがしら', '⺼': 'にくづき', '艹': 'くさかんむり', '衤': 'ころもへん', '⻊': 'あしへん',
            '辶': 'しんにょう', '飠': 'しょくへん'}
RAD_GLOSS = {
    '亻': 'person', '刂': 'blade', '忄': 'heart', '扌': 'hand', '攵': 'strike', '攴': 'strike', '氵': 'water', '氺': 'water',
    '灬': 'fire', '爫': 'claw', '犭': 'beast', '礻': 'altar', '⺮': 'bamboo', '罒': 'net', '网': 'net', '⺼': 'flesh',
    '艹': 'grass', '艸': 'grass', '衤': 'clothing', '⻊': 'foot', '辶': 'walk', '辵': 'walk', '飠': 'food',
    '宀': 'roof', '冖': 'cover', '厂': 'cliff', '广': 'building', '疒': 'sickness', '尸': 'corpse', '彳': 'step',
    '夂': 'go', '殳': 'weapon', '廾': 'two hands', '廴': 'long stride', '囗': 'enclosure', '匚': 'box', '勹': 'wrap',
    '冫': 'ice', '亠': 'lid', '儿': 'legs', '凵': 'open box', '几': 'table', '卩': 'seal', '厶': 'private',
    '歹': 'death', '气': 'steam', '癶': 'footsteps', '禸': 'track', '禾': 'grain', '耒': 'plough', '聿': 'brush',
    '虍': 'tiger', '豕': 'pig', '邑': 'town', '阜': 'mound', '釆': 'distinguish', '隹': 'bird', '髟': 'hair',
    '丨': 'line', '丶': 'dot', '丿': 'slash', '亅': 'hook', '匕': 'spoon', '卜': 'divination', '屮': 'sprout',
    '巛': 'river', '幺': 'short thread', '彐': 'snout', '戈': 'halberd', '糹': 'thread', '訁': 'speech', '釒': 'metal',
    '牜': 'cow', '⺩': 'jewel', '頁': 'head', '示': 'altar', '酉': 'wine', '金': 'metal', '韋': 'tanned leather', '鬥': 'fight', '鬲': 'cauldron', '黍': 'millet',
}
AMBIGUOUS = {'阝', '月', '王'}  # 阝 hill or town; 月 moon or flesh; 王 king or jewel: no gloss as a part

VAR = {}  # variant form -> list of base forms (阝 has two)
BASE_VAR = {}  # base form -> variant
for e in R214.values():
    if e.get('var'):
        VAR.setdefault(e['var'], []).append(e['c'])
        BASE_VAR[e['c']] = e['var']
R214_NAME = {e['c']: e.get('name') or '' for e in R214.values()}
RSET = {p: set(v.get('kanji') or []) for p, v in RAD.items()}
HOLDERS = collections.defaultdict(set)  # part -> every kanji in the table that stores it as a part (any depth)
for c, e in K.items():
    for p in e.get('parts') or []:
        if p != c:
            HOLDERS[p].add(c)
ON_COUNT = collections.Counter(r for e in K.values() for r in set(e.get('on') or []))
NK_ALL = len(K)


def short(g):
    g = re.sub(r'\s*\([^)]*\)', '', str(g or ''))
    parts = [p.strip() for p in re.split(r'[;,]', g) if p.strip()]
    out = parts[0] if parts else ''
    if len(parts) > 1 and len(out) + len(parts[1]) < 26:
        out += ', ' + parts[1]
    return out[:44]


# ---- words ----------------------------------------------------------------------------------
def kanji_in_order(w, ks):
    seen, out = set(), []
    for ch in w:
        if ch in ks and ch not in seen:
            seen.add(ch)
            out.append(ch)
    for ch in ks:  # a listed kanji that is not written in the headword (not expected)
        if ch not in seen:
            seen.add(ch)
            out.append(ch)
    return out


kept = [w for w, e in W.items() if e.get('r') and e.get('k') and all(c in K for c in e['k'])]
src_order = {w: i for i, w in enumerate(W)}
LEVEL_RANK = {5: 0, 4: 1, 3: 2, 2: 3, 1: 4, 0: 5}
kept.sort(key=lambda w: (LEVEL_RANK[W[w].get('jlpt') or 0], src_order[w]))
widx = {w: i for i, w in enumerate(kept)}

gloss_stats = collections.Counter()
word_k = []  # ordered kanji per word
for w in kept:
    word_k.append(kanji_in_order(w, set(W[w]['k'])))


def gloss_of(w):
    e = W[w]
    g = short(e.get('g'))
    if g:
        gloss_stats['from the word list'] += 1
        return g
    d = DICT.get(w)
    if d and d.get('m') and not (d.get('r') and d['r'] != e['r']):
        g = short('; '.join(d['m'])[:120])
        if g:
            gloss_stats['from the dictionary'] += 1
            return g
    m = EXTRA_W.get((w, e['r']))
    if m:
        g = short('; '.join(str(x) for x in m)[:120])
        if g:
            gloss_stats['from the extra word list'] += 1
            return g
    gloss_stats['none stored: left empty'] += 1
    return ''


# ---- kanji, parts, sound parts ----------------------------------------------------------------
kanji = []
for ks in word_k:
    for c in ks:
        kanji.append(c)
kanji = list(dict.fromkeys(kanji))
kidx = {c: i for i, c in enumerate(kanji)}
n_words_of = collections.Counter(c for ks in word_k for c in ks)
words_of = collections.defaultdict(list)
for i, ks in enumerate(word_k):
    for c in ks:
        words_of[c].append(i)


def contains(q, p):
    """Does part q hold part p?  Stored hierarchy first; else kanji-set inclusion (never for a part seen in one kanji)."""
    if q == p:
        return False
    qparts = (K.get(q) or {}).get('parts') or []
    if qparts:
        return p in qparts
    sq, sp = HOLDERS.get(q), HOLDERS.get(p)
    if not sq or not sp or len(sq) < 2:
        return False
    return sq < sp


VAR_ST = {'亻': 2, '刂': 2, '忄': 3, '扌': 3, '攵': 4, '氵': 3, '灬': 4, '爫': 4, '犭': 3, '礻': 4, '⺮': 6, '罒': 5,
          '⺼': 4, '艹': 3, '衤': 5, '⻊': 7, '辶': 3, '阝': 3, '飠': 8}
stroke_fix = {}
stroke_unsolved = set()


def strokes(c):
    return (K.get(c) or {}).get('st') or (RAD.get(c) or {}).get('st') or VAR_ST.get(c)


def top_parts(a):
    parts = [p for p in (K[a].get('parts') or []) if p != a]
    pset = set(parts)
    drop = {b for b, v in BASE_VAR.items() if b in pset and v in pset}  # base and variant both listed: keep the variant
    out = []
    for p in parts:
        if p in drop:
            continue
        if any(contains(q, p) for q in parts if q != p and q not in drop):
            continue
        if p not in out:
            out.append(p)
    total0 = K[a].get('st') or 0
    for x in list(out):
        if x in K or x not in out:
            continue
        si = parts.index(x)
        if si + 1 >= len(parts):
            continue
        o = parts[si + 1]
        if o not in K or o not in out or not K[o].get('st'):
            continue
        kids = set(K[o].get('parts') or [])
        rest = [y for y in out if y not in (x, o) and y not in kids]
        if total0 and all(strokes(y) for y in rest):
            room = total0 - sum(strokes(y) for y in rest)
            if room > 0 and K[o]['st'] >= room:
                out = [y for y in out if y != o and y not in kids]
                ORIG_PRE.setdefault(a, {})[o] = x
    # the stored lists sometimes name a part twice over (令 and 卩 in 領); when the strokes of the top-level
    # parts overshoot the kanji's own count, keep the fewest parts whose strokes add up exactly.
    total = K[a].get('st') or 0
    st = [strokes(p) for p in out]
    if total and len(out) > 1 and len(out) <= 10 and all(st) and sum(st) > total:
        best = None
        for mask in range(1, 1 << len(out)):
            pick = [i for i in range(len(out)) if mask >> i & 1]
            if sum(st[i] for i in pick) == total:
                key = (len(pick), -max(st[i] for i in pick), 0 if 0 in pick else 1, -sum(pick))
                if best is None or key < best[0]:
                    best = (key, pick)
        if best:
            stroke_fix[a] = (''.join(out), ''.join(out[i] for i in best[1]))
            out = [out[i] for i in best[1]]
        else:
            stroke_unsolved.add(a)
    return out


TOP = {}
ORIG_PRE = {}
ORIG = {}  # kanji -> {older form: the written top-level part it stands behind}


def older_forms(a):
    """A top-level part that is not a kanji in the table is sometimes followed, in the stored list, by its
    older full form, which is (浅: 戋 then 戔). The follower counts as that older form only when it is a kanji
    in the table and has at least as many strokes as the room the written part takes in this kanji; a part's
    own first child always has fewer."""
    stored = [p for p in (K[a].get('parts') or []) if p != a]
    top = TOP[a]
    out = dict(ORIG_PRE.get(a) or {})
    total = K[a].get('st') or 0
    for x in top:
        if x in K or x not in stored:
            continue
        i = stored.index(x)
        if i + 1 >= len(stored):
            continue
        o = stored[i + 1]
        if o not in K or o in top or not K[o].get('st'):
            continue
        others = [strokes(y) for y in top if y != x]
        if not total or not all(others):
            continue
        room = total - sum(others)
        if room > 0 and K[o]['st'] >= room:
            out[o] = x
    return out




def dec_parts(a):
    return TOP[a][:4] if len(TOP[a]) > 1 else []


def poisson_tail(n, lam):
    """P(X >= n) for a Poisson count with mean lam."""
    if n <= 0:
        return 1.0
    term, s = math.exp(-lam), 0.0
    for k in range(n):
        s += term
        term *= lam / (k + 1)
    return max(0.0, 1.0 - s)


FAMILY_TEST = {}


def family_test(p, r):
    """Kanji that store part p and carry on-reading r, against what chance alone would give."""
    key = (p, r)
    if key not in FAMILY_TEST:
        holders = HOLDERS.get(p, set())
        n = sum(1 for c in holders if r in (K[c].get('on') or []))
        lam = len(holders) * ON_COUNT[r] / NK_ALL
        FAMILY_TEST[key] = (n, len(holders), lam, poisson_tail(n, lam))
    return FAMILY_TEST[key]


SPECIAL = {}
fam = FAM.get('family') or {}
if (fam.get('center') or {}).get('id') == '戠':
    for m in fam.get('members') or []:
        SPECIAL[m['id']] = '戠'
SPECIAL_ON = {'職': 'ショク', '織': 'ショク', '識': 'シキ'}
sound_stats = collections.Counter()
via_older = {}
plain_rule = {}


def sound_part(a):
    """Sound part = a TOP-LEVEL written part of the kanji that is itself a kanji, is not the kanji's classical
    radical, and carries one of the kanji's on-readings by exact equality.  Most strokes wins."""
    ons = K[a].get('on') or []
    if a in SPECIAL:
        r = SPECIAL_ON[a]
        assert r in ons, (a, r, ons)
        sound_stats['attributed family (戠)'] += 1
        return SPECIAL[a], r
    anyc = []
    for p in K[a].get('parts') or []:
        if p == a or p not in K:
            continue
        shared = [r for r in ons if r in (K[p].get('on') or [])]
        if shared:
            anyc.append((p, shared))
    if not anyc:
        return None, ''
    best_plain = max(anyc, key=lambda t: K[t[0]].get('st') or 0)
    plain_rule[a] = (best_plain[0], best_plain[1][0])
    rad = R214.get(str(K[a].get('rad') or '')) or {}
    rad_forms = {rad.get('c'), rad.get('var')} - {None}
    if a in rad_forms:
        sound_stats['refused: the kanji is itself a radical'] += 1
        return None, ''
    top = set(TOP[a]) | set(ORIG[a])
    cands = [(p, sh) for p, sh in anyc if p in top and p not in rad_forms]
    if not cands:
        sound_stats['refused: the sharing part is nested or is the radical'] += 1
        return None, ''
    p, sh = max(cands, key=lambda t: K[t[0]].get('st') or 0)
    sound_stats['sound part kept'] += 1
    if p in ORIG[a]:
        sound_stats['kept through the older form of a written part'] += 1
        via_older[a] = (ORIG[a][p], p, sh[0])
    if (p, sh[0]) != plain_rule[a]:
        sound_stats['kept, but another part than the plain most-strokes rule'] += 1
    return p, sh[0]


def rad_part(a):
    e = R214.get(str(K[a].get('rad') or ''))
    if not e:
        return None
    v = e.get('var')
    if v and v in (K[a].get('parts') or []):
        return v
    return e['c']


parts = []
pindex = {}
PART_KIDX = None  # set to the table kanji index below, later to the index that includes outside characters


def part_name(c):
    n = (RAD.get(c) or {}).get('name') or ''
    if n:
        return n
    if c in RAD_NAME:
        return RAD_NAME[c]
    return R214_NAME.get(c, '')


def part_gloss(c):
    if c in AMBIGUOUS:
        return ''
    if c in RAD_GLOSS:
        return RAD_GLOSS[c]
    if c in K and K[c].get('m') and not re.search(r'radical', str(K[c]['m']), re.I):
        return str(K[c]['m']).lower()
    return ''


def pidx(c):
    if c is None:
        return -1
    if c not in pindex:
        pindex[c] = len(parts)
        parts.append([c, part_name(c), part_gloss(c), PART_KIDX.get(c, -1)])
    return pindex[c]


for c in K:
    TOP[c] = top_parts(c)
for c in K:
    ORIG[c] = older_forms(c)
PART_KIDX = kidx
kanji_rows = []
sound_of = {}
for c in kanji:
    e = K[c]
    dec = [pidx(p) for p in dec_parts(c)]
    sp, son = sound_part(c)
    sound_of[c] = (sp, son)
    kanji_rows.append([c, str(e.get('m') or '').lower(), e.get('on') or [], e.get('kun') or [], e.get('st') or 0,
                       dec, pidx(sp) if sp else -1, son, pidx(rad_part(c)), n_words_of[c]])

# ---- characters outside the kanji table (appended: no existing kanji or part index moves) --------
HAN = re.compile('[\u3400-\u9fff\uf900-\ufaff\U00020000-\U0002fa1f]')
outside = []
left_out = collections.Counter()
word_full = []  # per word: its characters in written order, table kanji and outside characters together
for w, ks in zip(kept, word_k):
    kset, seen, lst = set(ks), set(), []
    for ch in w:
        if ch in seen:
            continue
        if ch in kset:
            seen.add(ch)
            lst.append(ch)
        elif HAN.match(ch) and ch not in K:
            if ch in KMETA:
                seen.add(ch)
                lst.append(ch)
                if ch not in outside:
                    outside.append(ch)
            else:
                left_out[ch] += 1
    for ch in ks:
        if ch not in seen:
            seen.add(ch)
            lst.append(ch)
    word_full.append(lst)
NOUT = len(outside)
kidx_full = dict(kidx)
for n, c in enumerate(outside):
    kidx_full[c] = len(kanji) + n
n_words_out = collections.Counter(ch for lst in word_full for ch in set(lst) if ch in kidx_full and ch not in kidx)
first_word_of = {}
for i, lst in enumerate(word_full):
    for ch in lst:
        if ch not in kidx and ch not in first_word_of:
            first_word_of[ch] = i
N_PARTS_TABLE = len(parts)
PART_KIDX = kidx_full  # part rows made from here on may point at an outside character
for c in outside:
    meta, fact = KMETA[c], KFACT.get(c)
    meanings = meta[3] or (fact[1] if fact else [])
    radc = (R214.get(str(fact[2])) or {}).get('c') if fact and fact[2] else None
    kanji_rows.append([c, str(meanings[0]).lower() if meanings else '', meta[1] or [], meta[2] or [], meta[4] or 0,
                       [], -1, '', pidx(radc), n_words_out[c], 1])

# ---- sound families ---------------------------------------------------------------------------
groups = collections.defaultdict(list)
for c in kanji:
    sp, son = sound_of[c]
    if sp:
        groups[(sp, son)].append(c)
sound_rows = []
for (sp, son), members in groups.items():
    if len(members) < 2:
        continue
    mem = list(members)
    if sp in kidx and son in (K[sp].get('on') or []) and sp not in mem:
        mem.insert(0, sp)
    for m in mem:
        assert son in (K[m].get('on') or []), ('sound family member without the reading', sp, son, m)
    sound_rows.append([pidx(sp), son, [kidx[m] for m in mem]])
sound_rows.sort(key=lambda r: (-len(r[2]), r[0]))

# ---- meaning links ----------------------------------------------------------------------------
sem_rows = []
sem_skipped = 0
for head, edges in SEM.items():
    for e in edges:
        if head in widx and e['w'] in widx and e.get('rel') in ('syn', 'ant', 'reg', 'fam', 'col', 'thm'):
            sem_rows.append([widx[head], widx[e['w']], e['rel'], e.get('note') or ''])
        else:
            sem_skipped += 1

# ---- layout: kanji --------------------------------------------------------------------------
NKJ = len(kanji)
link_w = collections.Counter()
for ks in word_k:
    for a, b in zip(ks, ks[1:]):
        i, j = kidx[a], kidx[b]
        if i != j:
            link_w[(min(i, j), max(i, j))] += 1
links = {k: float(min(v, 6)) for k, v in link_w.items()}
for _, _, mem in sound_rows:
    for x in range(len(mem)):
        for y in range(x + 1, len(mem)):
            key = (min(mem[x], mem[y]), max(mem[x], mem[y]))
            links[key] = links.get(key, 0.0) + 0.5
LI = np.array([k[0] for k in links], dtype=np.int64)
LJ = np.array([k[1] for k in links], dtype=np.int64)
LW = np.array([links[k] for k in links], dtype=np.float64)


def force_layout(rounds=300):
    rng = np.random.default_rng(SEED)
    x = rng.uniform(0, L, NKJ)
    y = rng.uniform(-YMAX, YMAX, NKJ)
    kk = math.sqrt(L * 2 * YMAX / NKJ)
    for it in range(rounds):
        t = 1200.0 * (0.003 ** (it / (rounds - 1)))
        dx = x[:, None] - x[None, :]
        dx -= L * np.round(dx / L)
        dy = y[:, None] - y[None, :]
        f = kk * kk / (dx * dx + dy * dy + 1.0)
        np.fill_diagonal(f, 0.0)
        fx = (dx * f).sum(1)
        fy = (dy * f).sum(1)
        ex = x[LI] - x[LJ]
        ex -= L * np.round(ex / L)
        ey = y[LI] - y[LJ]
        fa = LW * np.sqrt(ex * ex + ey * ey) / kk
        np.add.at(fx, LI, -ex * fa)
        np.add.at(fx, LJ, ex * fa)
        np.add.at(fy, LI, -ey * fa)
        np.add.at(fy, LJ, ey * fa)
        fl = np.sqrt(fx * fx + fy * fy) + 1e-9
        s = np.minimum(fl, t) / fl
        x = (x + fx * s) % L
        y = np.clip(y + fy * s, -YMAX, YMAX)
    return x, y


fx0, fy0 = force_layout()

# even use of the sheet: a brick lattice, rows 61 apart, filled by a double sort of the force layout,
# then improved by swaps that shorten the links.
ROWS = 17
COLS = int(math.ceil(NKJ / ROWS))
CW, CH = L / COLS, 2 * YMAX / ROWS


def cell_xy(col, row):
    return ((col + (0.25 if row % 2 == 0 else 0.75)) * CW) % L, -YMAX + (row + 0.5) * CH


# cut the ring where the force layout is thinnest
hist = np.histogram(fx0, bins=160, range=(0, L))[0]
cut = (int(np.argmin(np.convolve(np.concatenate([hist, hist[:4]]), np.ones(5), 'valid'))) + 2.5) * (L / 160)
order = sorted(range(NKJ), key=lambda i: ((fx0[i] - cut) % L, fy0[i]))
cell_of = {}
occ = {}
base, extra = divmod(NKJ, COLS)
pos_in = 0
for col in range(COLS):
    m = base + (1 if col < extra else 0)
    chunk = sorted(order[pos_in:pos_in + m], key=lambda i: fy0[i])
    pos_in += m
    for rank, i in enumerate(chunk):
        row = int(round(rank * (ROWS - 1) / (m - 1))) if m > 1 else ROWS // 2
        while (col, row) in occ:
            row = (row + 1) % ROWS
        occ[(col, row)] = i
        cell_of[i] = (col, row)
nbrs = collections.defaultdict(list)
for (i, j), w in links.items():
    nbrs[i].append((j, w))
    nbrs[j].append((i, w))


def dist_cells(ca, cb):
    xa, ya = cell_xy(*ca)
    xb, yb = cell_xy(*cb)
    dx = xa - xb
    dx -= L * round(dx / L)
    return math.hypot(dx, ya - yb)


def cost_at(i, cell, other=None, other_cell=None):
    s = 0.0
    for j, w in nbrs[i]:
        cj = other_cell if j == other else cell_of[j]
        s += w * dist_cells(cell, cj)
    return s


def total_cost():
    return sum(w * dist_cells(cell_of[i], cell_of[j]) for (i, j), w in links.items())


cost_before = total_cost()
rnd = random.Random(SEED)
for sweep in range(160):
    moved = 0
    ids = [i for i in range(NKJ) if nbrs[i]]
    rnd.shuffle(ids)
    for i in ids:
        ci = cell_of[i]
        xi, yi = cell_xy(*ci)
        sw = sx = sy = 0.0
        for j, w in nbrs[i]:
            xj, yj = cell_xy(*cell_of[j])
            dx = xj - xi
            dx -= L * round(dx / L)
            sx += w * dx
            sy += w * (yj - yi)
            sw += w
        tx, ty = (xi + sx / sw) % L, yi + sy / sw
        trow = min(ROWS - 1, max(0, int((ty + YMAX) / CH)))
        tcol = int(tx / CW) % COLS
        best, best_cell = -1e-6, None
        for dc in (-2, -1, 0, 1, 2):
            for dr in (-2, -1, 0, 1, 2):
                row = trow + dr
                if row < 0 or row >= ROWS:
                    continue
                cell = ((tcol + dc) % COLS, row)
                if cell == ci:
                    continue
                j = occ.get(cell)
                before = cost_at(i, ci) + (cost_at(j, cell) if j is not None else 0.0)
                after = cost_at(i, cell, j, ci) + (cost_at(j, ci, i, cell) if j is not None else 0.0)
                if after - before < best:
                    best, best_cell = after - before, cell
        if best_cell is not None:
            j = occ.get(best_cell)
            occ[best_cell] = i
            cell_of[i] = best_cell
            if j is not None:
                occ[ci] = j
                cell_of[j] = ci
            else:
                del occ[ci]
            moved += 1
    sweeps_done = sweep + 1
    if moved < NKJ * 0.002:
        break
cost_mid = total_cost()
sweeps2 = 0
for sweep in range(30):
    moved = 0
    ids = [i for i in range(NKJ) if nbrs[i]]
    rnd.shuffle(ids)
    for i in ids:
        ci = cell_of[i]
        best, best_cell = -1e-6, None
        seen_cells = set()
        for nb, _ in sorted(nbrs[i], key=lambda t: -t[1])[:8]:
            cn = cell_of[nb]
            for dc in (-1, 0, 1):
                for dr in (-1, 0, 1):
                    row = cn[1] + dr
                    if row < 0 or row >= ROWS:
                        continue
                    cell = ((cn[0] + dc) % COLS, row)
                    if cell == ci or cell == cn or cell in seen_cells:
                        continue
                    seen_cells.add(cell)
                    j = occ.get(cell)
                    before = cost_at(i, ci) + (cost_at(j, cell) if j is not None else 0.0)
                    after = cost_at(i, cell, j, ci) + (cost_at(j, ci, i, cell) if j is not None else 0.0)
                    if after - before < best:
                        best, best_cell = after - before, cell
        if best_cell is not None:
            j = occ.get(best_cell)
            occ[best_cell] = i
            cell_of[i] = best_cell
            if j is not None:
                occ[ci] = j
                cell_of[j] = ci
            else:
                del occ[ci]
            moved += 1
    sweeps2 = sweep + 1
    if moved < NKJ * 0.003:
        break
cost_after = total_cost()

rj = random.Random(SEED + 1)
kx = np.zeros(NKJ)
ky = np.zeros(NKJ)
for i in range(NKJ):
    x, y = cell_xy(*cell_of[i])
    kx[i] = (x + rj.uniform(-4, 4)) % L
    ky[i] = y + rj.uniform(-0.5, 0.5)

# ---- layout: words ----------------------------------------------------------------------------
NW = len(kept)
rw = random.Random(SEED + 2)
wx = np.zeros(NW)
wy = np.zeros(NW)
wz = np.zeros(NW)
wl = np.array([W[w].get('jlpt') or 0 for w in kept])
for i, ks in enumerate(word_k):
    ids = [kidx[c] for c in ks]
    x0, y0 = kx[ids[0]], ky[ids[0]]
    offs = [(kx[j] - x0) - L * round((kx[j] - x0) / L) for j in ids]
    x = x0 + sum(offs) / len(ids)
    y = sum(ky[j] for j in ids) / len(ids)
    if len(ids) == 1:
        r, a = rw.uniform(40, 90), rw.uniform(0, 2 * math.pi)
        x += r * math.cos(a)
        y += r * math.sin(a)
        if abs(y) > YMAX:
            y -= 2 * r * math.sin(a)
    else:
        x += rw.uniform(-22, 22)
        y += rw.uniform(-12, 12)
    wx[i] = x % L
    wy[i] = min(YMAX, max(-YMAX, y))
    lo, hi = ZOF[int(wl[i])]
    wz[i] = rw.randint(lo, hi)

DX, DY = 60.0, 26.0


def relax_level(ids, rounds=500):
    left = 0
    for _ in range(rounds):
        grid = collections.defaultdict(list)
        for i in ids:
            grid[(int(wx[i] // DX), int((wy[i] + YMAX) // DY))].append(i)
        ncx = int(L // DX) + 1
        left = 0
        for i in ids:
            cx, cy = int(wx[i] // DX), int((wy[i] + YMAX) // DY)
            for ox in (-1, 0, 1):
                for oy in (-1, 0, 1):
                    for j in grid.get(((cx + ox) % ncx, cy + oy), ()):
                        if j <= i:
                            continue
                        dx = wx[i] - wx[j]
                        dx -= L * round(dx / L)
                        dy = wy[i] - wy[j]
                        if abs(dx) < DX and abs(dy) < DY:
                            left += 1
                            px, py = DX - abs(dx), DY - abs(dy)
                            if px / DX <= py / DY:
                                s = (1 if dx >= 0 else -1) * (px / 2 + 0.6)
                                wx[i] = (wx[i] + s) % L
                                wx[j] = (wx[j] - s) % L
                            else:
                                s = (1 if dy >= 0 else -1) * (py / 2 + 0.3)
                                wy[i] = min(YMAX, max(-YMAX, wy[i] + s))
                                wy[j] = min(YMAX, max(-YMAX, wy[j] - s))
        if left == 0:
            break
    return left


def place_rest(ids):
    """Whatever the relaxation left overlapping is moved to the nearest free spot (a spiral search)."""
    ncx = int(L // DX) + 1
    grid = collections.defaultdict(list)

    def cell(i):
        return (int(wx[i] // DX) % ncx, int((wy[i] + YMAX) // DY))

    def clash(i, x, y):
        cx, cy = int(x // DX) % ncx, int((y + YMAX) // DY)
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                for j in grid.get(((cx + ox) % ncx, cy + oy), ()):
                    if j == i:
                        continue
                    dx = x - wx[j]
                    dx -= L * round(dx / L)
                    if abs(dx) < DX and abs(y - wy[j]) < DY:
                        return True
        return False

    for i in ids:
        grid[cell(i)].append(i)
    moved = 0
    for i in ids:
        if not clash(i, wx[i], wy[i]):
            continue
        grid[cell(i)].remove(i)
        x0, y0 = wx[i], wy[i]
        done = False
        for ring in range(1, 80):
            best = None
            for sx in range(-ring, ring + 1):
                for sy in range(-ring, ring + 1):
                    if max(abs(sx), abs(sy)) != ring:
                        continue
                    x, y = (x0 + sx * 21.0) % L, y0 + sy * 9.0
                    if abs(y) > YMAX or clash(i, x, y):
                        continue
                    d = (sx * 21.0) ** 2 + (sy * 9.0 * 2.3) ** 2
                    if best is None or d < best[0]:
                        best = (d, x, y)
            if best:
                wx[i], wy[i] = best[1], best[2]
                done = True
                break
        grid[cell(i)].append(i)
        moved += 1 if done else 0
    left = sum(1 for i in ids if clash(i, wx[i], wy[i]))
    return moved, left


left_by_level = {}
placed_by_level = {}
for lv in (5, 4, 3, 2, 1, 0):
    ids_lv = [i for i in range(NW) if wl[i] == lv]
    relax_level(ids_lv)
    placed_by_level[lv], left_by_level[lv] = place_rest(ids_lv)

kz = np.zeros(NKJ)
for c, i in kidx.items():
    kz[i] = sum(wz[j] for j in words_of[c]) / len(words_of[c])


ro = random.Random(SEED + 4)
ox = np.zeros(NOUT)
oy = np.zeros(NOUT)
oz = np.zeros(NOUT)
for n, c in enumerate(outside):
    i = first_word_of[c]
    r, a = ro.uniform(24, 44), ro.uniform(0, 2 * math.pi)
    ox[n] = (wx[i] + r * math.cos(a)) % L
    oy[n] = min(YMAX, max(-YMAX, wy[i] + r * math.sin(a)))
    oz[n] = wz[i]


def ints(xs, ys, zs):
    out = []
    for x, y, z in zip(xs, ys, zs):
        xi = int(round(float(x))) % L
        out += [xi, int(max(-YMAX, min(YMAX, round(float(y))))), int(round(float(z)))]
    return out


# ---- write ----------------------------------------------------------------------------------
JST = datetime.timezone(datetime.timedelta(hours=9))
BUILT = datetime.datetime.now(JST).isoformat(timespec='seconds')
words_rows = [[w, W[w]['r'], gloss_of(w), W[w].get('jlpt') or 0, [kidx_full[c] for c in word_full[i]]] for i, w in enumerate(kept)]
data = {
    'v': 2,
    'built': BUILT,
    'counts': {'words': NW, 'kanji': len(kanji_rows), 'parts': len(parts), 'sem': len(sem_rows), 'sound': len(sound_rows),
               'outside': NOUT},
    'world': {'L': L, 'yMax': YMAX, 'zOf': {str(k): v for k, v in ZOF.items()}},
    'notes': [
        '戠 family (kanji-family.json): ' + str(fam.get('scope') or ''),
        'Sound part: a top-level written part of the kanji that is itself a kanji, is not the kanji\'s classical radical, '
        'and carries one of the kanji\'s on-readings by exact string equality. A sound family lists kanji that share one such part and reading.',
        'Part meanings for parts that are not kanji in the table are standard radical meanings written by hand in build_sky_data.py.',
        'Characters outside the app\'s character table (11th element 1) and the third source of word glosses come from '
        'share_alike/reference-extra.json: kanjiMetadata and kanjiFacts for the characters, extraWords for the glosses.',
    ],
    'words': words_rows,
    'kanji': kanji_rows,
    'parts': parts,
    'sem': sem_rows,
    'sound': sound_rows,
    'pos': {'w': ints(wx, wy, wz), 'k': ints(kx, ky, kz) + ints(ox, oy, oz)},
}
# checks before the file on disk is replaced
NKALL = len(kanji_rows)
assert NKALL == NKJ + NOUT and len(data['pos']['k']) == 3 * NKALL and len(data['pos']['w']) == 3 * NW
for row in words_rows:
    assert row[4] and all(0 <= k < NKALL for k in row[4]), ('word with a kanji index that does not resolve', row[0])
    assert [kanji_rows[k][0] for k in row[4]] == [ch for ch in dict.fromkeys(row[0]) if ch in kidx_full and kanji_rows[kidx_full[ch]][0] == ch and kidx_full[ch] in row[4]], ('kanji not in written order', row[0])
for row in kanji_rows[:NKJ]:
    assert len(row) == 10
for row in kanji_rows[NKJ:]:
    assert len(row) == 11 and row[10] == 1 and row[5] == [] and row[6] == -1 and row[7] == '' and -1 <= row[8] < len(parts)
for _, on, mem in sound_rows:
    assert all(m < NKJ for m in mem)
prev_note = 'no earlier file on disk'
if os.path.exists(OUT_SKY):
    with open(OUT_SKY, encoding='utf-8') as f:
        old = json.load(f)
    for i, row in enumerate(old['kanji']):
        assert kanji_rows[i][0] == row[0], ('kanji index moved', i, row[0], kanji_rows[i][0])
    for i, row in enumerate(old['parts']):
        assert parts[i][0] == row[0], ('part index moved', i, row[0], parts[i][0])
    same_k = sum(1 for i, row in enumerate(old['kanji']) if kanji_rows[i] == row)
    same_p = sum(1 for i, row in enumerate(old['parts']) if parts[i] == row)
    same_pos_k = old['pos']['k'] == data['pos']['k'][:len(old['pos']['k'])]
    same_pos_w = old['pos']['w'] == data['pos']['w']
    prev_note = (f"against the file on disk (v{old.get('v')}, {len(old['kanji'])} kanji, {len(old['parts'])} parts): no kanji or part index moved; "
                 f"{same_k} kanji rows and {same_p} part rows identical; kanji positions identical: {same_pos_k}; word positions identical: {same_pos_w}")


# one file per pool: each names its pool and the files it is made from (path, sha256, bytes), as kanji-family.json
# records its retained files; each source file states its own licences
def retained(ident, path):
    with open(path, 'rb') as f:
        raw = f.read()
    return {'id': ident, 'kind': 'retained-file', 'path': os.path.relpath(path, REPO).replace(os.sep, '/'),
            'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}


generator = retained('generator', os.path.abspath(__file__))
sky_file = {
    'v': data['v'],
    'built': BUILT,
    'pool': 'share_alike',
    'sources': [retained(i, os.path.join(SRC, p)) for i, p in SKY_INPUTS] + [generator],
    'scope': 'The sky of the first screen (prototypes/corridor/sky/), less its meaning links, which are a '
             'proprietary_safe record set of their own (proprietary_safe/sky-sem.json). sky/mount.mjs joins the two in memory.',
    'counts': {k: v for k, v in data['counts'].items() if k != 'sem'},
    **{k: data[k] for k in ('world', 'notes', 'words', 'kanji', 'parts', 'sound', 'pos')},
}
sem_file = {
    'v': data['v'],
    'built': BUILT,
    'pool': 'proprietary_safe',
    'sources': [retained(i, os.path.join(SRC, p)) for i, p in SEM_INPUTS] + [generator],
    'scope': 'The meaning links of the first screen\'s sky: each stored link of sem.json whose two words are both words of '
             'the sky (share_alike/sky.json), as [word, linked word, relation, note]. sky/mount.mjs turns the words into '
             'row numbers of share_alike/sky.json in memory.',
    'counts': {'sem': len(sem_rows)},
    'sem': [[words_rows[a][0], words_rows[b][0], rel, note] for a, b, rel, note in sem_rows],
}
for path, body in ((OUT_SKY, sky_file), (OUT_SEM, sem_file)):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(body, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
    os.replace(path + '.tmp', path)

# ---- sanity report --------------------------------------------------------------------------
P = parts


def pdesc(i):
    return '-' if i < 0 else f"{P[i][0]}({P[i][1] or '?'}; {P[i][2] or '?'})"


print('== sky.json + sky-sem.json', data['built'])
print('counts', data['counts'], '| bytes', os.path.getsize(OUT_SKY), '+', os.path.getsize(OUT_SEM))
print('glosses', dict(gloss_stats))
print(prev_note)
print('outside characters', NOUT, ''.join(outside), '| in neither file (left out):', dict(left_out) or 'none')
i = widx.get('熾烈')
if i is not None:
    print('ROW word', json.dumps(words_rows[i], ensure_ascii=False), 'pos', data['pos']['w'][3 * i:3 * i + 3])
    for k in words_rows[i][4]:
        kr = kanji_rows[k]
        print('ROW kanji', k, json.dumps(kr, ensure_ascii=False), 'pos', data['pos']['k'][3 * k:3 * k + 3])
        for pi in sorted(set(kr[5] + [kr[6], kr[8]]) - {-1}):
            print('    ROW part', pi, json.dumps(parts[pi], ensure_ascii=False), '(new in v2)' if pi >= N_PARTS_TABLE else '')
print('run time', f'{time.time() - T0:.0f} s')
print('sound parts', dict(sound_stats), '| plain most-strokes rule alone would give', len(plain_rule))
rejected = [a for a in plain_rule if a in kidx and not sound_of[a][0]]
print('  examples the chance test refused:', ' '.join(f"{a}<-{plain_rule[a][0]}{plain_rule[a][1]}" for a in rejected[:28]))
print('meaning links kept', len(sem_rows), 'not kept (a word is outside the kept list)', sem_skipped)
ld = sorted(dist_cells(cell_of[i], cell_of[j]) for (i, j) in link_w)
print('kanji lattice', f'{COLS} columns x {ROWS} rows, cell {CW:.1f} x {CH:.1f}; weighted link length before swaps {cost_before:.0f}, after centroid swaps {cost_mid:.0f} ({sweeps_done} sweeps), after partner swaps {cost_after:.0f} ({sweeps2} sweeps);',
      f'word-pair links {len(ld)}: median distance {ld[len(ld)//2]:.0f}, mean {sum(ld)/len(ld):.0f}, within 300 units {sum(1 for d in ld if d <= 300)/len(ld):.0%}, within 1000 {sum(1 for d in ld if d <= 1000)/len(ld):.0%}')
print('written part stands for an older form that carries the reading:', len([a for a in via_older if a in kidx]), 'kept kanji; examples', ' '.join(f'{a}:{v[0]}={v[1]}{v[2]}' for a, v in list(via_older.items())[:24] if a in kidx))
print('part lists that overshoot the stroke count with no exact subset (left as stored top-level, may name a part twice):', len([a for a in stroke_unsolved if a in kidx]), ' '.join(f"{a}:{''.join(TOP[a])}" for a in list(stroke_unsolved)[:16] if a in kidx))
print('top-level parts trimmed by the stroke sum:', len([a for a in stroke_fix if a in kidx]), 'kept kanji; examples', ' '.join(f'{a}:{v[0]}>{v[1]}' for a, v in list(stroke_fix.items())[:14] if a in kidx))
print('words moved by the last placing pass, by level', placed_by_level, '| words still closer than 60 x 26 to another of their level', left_by_level)
pk = data['pos']['k']
mind = 1e9
for i in range(NKJ):
    for j in range(i + 1, NKJ):
        if abs(pk[3 * i + 1] - pk[3 * j + 1]) < 60:
            dx = abs(pk[3 * i] - pk[3 * j])
            dx = min(dx, L - dx)
            if dx < mind:
                mind = dx
print('smallest x gap between two kanji within 60 in y:', mind)
for w in ('熾烈', '強烈', '大統領', '組織', '持つ', '学校'):
    if w not in widx:
        print('--', w, 'NOT KEPT')
        continue
    row = words_rows[widx[w]]
    print('--', w, row[1], '|', row[2] or '(no gloss stored)', '| level', row[3])
    for ki in row[4]:
        kr = kanji_rows[ki]
        fam_words = sorted(words_of[kr[0]], key=lambda j: (LEVEL_RANK[words_rows[j][3]], len(words_rows[j][0]), j))
        print(f"   {kr[0]} {kr[1]} on {'・'.join(kr[2])} | parts {' + '.join(pdesc(p) for p in kr[5]) or '(none stored)'}"
              f" | sound {pdesc(kr[6])} {kr[7]} | radical {pdesc(kr[8])} | {kr[9]} words:"
              f" {' '.join(words_rows[j][0] + '(' + str(words_rows[j][3]) + ')' for j in fam_words[:8])}")
    for a, b, rel, note in sem_rows:
        if a == widx[w] or b == widx[w]:
            print(f"   sem {words_rows[a][0]} -{rel}- {words_rows[b][0]}: {note}")
print('-- 12 largest sound families')
for pi, on, mem in sound_rows[:12]:
    print(f"   {P[pi][0]} {on}: {' '.join(kanji[m] for m in mem)}")
print('-- 寺')
for pi, on, mem in sound_rows:
    if P[pi][0] == '寺':
        print(f"   寺 {on}: {' '.join(kanji[m] for m in mem)}")
        assert not ({'待', '詩', '特'} & {kanji[m] for m in mem})
print('   待 詩 特 sound parts:', {c: sound_of.get(c) for c in '待詩特'})
print('-- occupancy, kanji per cell (16 columns of x, 4 rows of y)')
gridc = [[0] * 16 for _ in range(4)]
for i in range(NKJ):
    gridc[min(3, int((pk[3 * i + 1] + YMAX) / (2 * YMAX / 4)))][min(15, int(pk[3 * i] / (L / 16)))] += 1
for r in gridc:
    print('   ' + ' '.join(f'{v:3d}' for v in r))
print('-- five kanji and their six nearest on the sheet (* = they form a word together)')
rs = random.Random(SEED + 3)
for i in rs.sample(range(NKJ), 5):
    ds = []
    for j in range(NKJ):
        if j != i:
            dx = abs(pk[3 * i] - pk[3 * j])
            dx = min(dx, L - dx)
            ds.append((math.hypot(dx, pk[3 * i + 1] - pk[3 * j + 1]), j))
    ds.sort()
    print(f"   {kanji[i]} ({kanji_rows[i][1]}): " + ' '.join(
        kanji[j] + ('*' if (min(i, j), max(i, j)) in link_w else '') + f'{d:.0f}' for d, j in ds[:6]))
