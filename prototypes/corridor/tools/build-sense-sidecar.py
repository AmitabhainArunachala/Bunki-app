"""R3 part 2 · the shelf's sense sidecar (prototypes/corridor/data/articles/senses.json) from models' blind picks.

A task is one token on the shelf whose sense the app's rules do not settle, listed from an in-page probe of every token.
Two models choose blind, through dharma_swarm's runtime_provider subscription lanes (ollama cloud glm-5.2 and
deepseek-v4.1-flash; never a metered API). A sense task shows the sentence with the word in 【】, the word's candidate
senses numbered (entry head, part of speech, glosses) and N for a proper name; a gloss task (a word whose right sense
leads with a misleading gloss: 遺産 "inheritance" in 世界遺産) shows one option per gloss. Where the two agree, that pick
is the token's row. Where they split, kimi_code k3 chooses among the same options, blind to both, and its pick counts
when it sides with one of them; where one model never answered, the third stands in and its agreement with the
other counts. Still split, the token keeps the rules' choice and is listed under splits.

Review: where the models' pick is a sense Grok's audits (0315, 2029) show misleads in its sentence, the config names the
sense that stands and why (source 'review'); the models' picks stay in the receipt. A review may name the gloss the slip
leads with (lead), a reading the text talks about rather than a word (choice R: 「いちちゅう」とは読まない), and a token
no round asked about (its receipt has its sentence and no model's pick).

Rounds: a later round's task for a token replaces an earlier one's; a token a later round supersedes without a task of
its own (its reading changed and one sense is left; it is read whole as an expression) has no row.
Rows: [entry seq, sense index, source], [entry seq, sense index, source, gloss index] (a gloss task: the gloss the
slip leads with), ['name', source], or ['reading', source]. The app reads a row before its rules (corridor.js, R3).
Receipts (prototypes/corridor/tools/sense-sidecar-receipts.json): every task with its sentence and round, every pick
with its gloss and the model's reason, its row's source, the splits, the superseded tokens, and each round's prompt.

usage: python3 -I build-sense-sidecar.py <rounds.json>
rounds.json: {"rounds": [{"name", "kind": "sense"|"gloss", "tasks", "a": [answer files], "b": [...], "c": [...],
"prompt"}, ...], "superseded": <superseded.json>, "review": [{"passage", "index", "choice" ("seq:k" or "R"), "lead"?,
"reason"}], "drop": [{"passage", "index", "surface", "why"}]}. A model's answers may come in several runs (a later run fills only
what an earlier left unanswered).
"""
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
CORRIDOR = HERE.parent
SIDECAR = CORRIDOR / 'data' / 'articles' / 'senses.json'
RECEIPTS = HERE / 'sense-sidecar-receipts.json'
DICT = CORRIDOR / 'data' / 'share_alike' / 'dict-v2'
ARTICLES = CORRIDOR / 'data' / 'articles'


def sense_glosses(seq, k):
    # the served dictionary's glosses for an entry's sense (its detail shard: FNV-1a over the seq's digits, & 15)
    h = 0x811c9dc5
    for ch in str(seq):
        h = ((h ^ ord(ch)) * 0x01000193) & 0xffffffff
    shard = json.loads((DICT / f'{h & 15:02x}.json').read_text('utf-8'))
    entry = next(e for e in shard['entries'] if str(e[0]) == str(seq))
    return [g[0] for g in entry[3][k][10]]


def sentence_of(passage, index):
    # the token's sentence on the shelf, the token in 【】 (as a round's task shows it), with its surface
    files = {row['id']: row['file'] for row in json.loads((ARTICLES / 'index.json').read_text('utf-8'))['articles']}
    tokens = json.loads((ARTICLES / files[passage]).read_text('utf-8'))['tokens']
    stop = {'。', '！', '？', '!', '?'}
    start = index
    while start > 0 and tokens[start - 1]['s'] not in stop:
        start -= 1
    end = index
    while end < len(tokens) - 1 and tokens[end]['s'] not in stop:
        end += 1
    words = [('【' + t['s'] + '】') if i == index else t['s'] for i, t in enumerate(tokens[start:end + 1], start=start)]
    return ''.join(words), tokens[index]['s']


def load(paths):
    if not paths:
        return {'answers': {}, 'provider': None, 'model': None}
    runs = [json.loads(Path(path).read_text('utf-8')) for path in paths]
    merged = {'provider': runs[0]['provider'], 'model': runs[0]['model'], 'answers': {}}
    for run in runs:
        assert (run['provider'], run['model']) == (merged['provider'], merged['model']), 'one model per answer list'
        for key, value in run['answers'].items():
            merged['answers'].setdefault(key, value)
    return merged


def told(task, answer):
    # a pick as the receipt keeps it: the choice, its gloss(es), the model's reason
    if not answer:
        return None
    if answer['choice'] == 'N':
        return {'choice': 'N', 'reason': answer.get('reason', '')}
    option = next((o for o in task['options'] if o['seq'] == answer['seq'] and o['k'] == answer['k'] and o.get('g') == answer.get('g')), {})
    gloss = option.get('gloss') if 'g' in option else '; '.join(option.get('glosses', [])[:3])
    return {'choice': answer['choice'], 'gloss': gloss or '', 'reason': answer.get('reason', '')}


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    config = json.loads(Path(sys.argv[1]).read_text('utf-8'))
    final, prompts, models = {}, {}, None
    for rnd in config['rounds']:
        tasks = json.loads(Path(rnd['tasks']).read_text('utf-8'))['tasks']
        A, B, C = load(rnd.get('a')), load(rnd.get('b')), load(rnd.get('c'))
        prompts[rnd['name']] = Path(rnd['prompt']).read_text('utf-8').strip()
        these = {'a': f"{A['provider']}:{A['model']}", 'b': f"{B['provider']}:{B['model']}",
                 'c': f"{C['provider']}:{C['model']}" if C.get('provider') else None}
        models = models or these
        assert (these['a'], these['b']) == (models['a'], models['b']), 'the same two models in every round'
        for i, task in enumerate(tasks):
            a, b, c = (M['answers'].get(str(i)) for M in (A, B, C))
            pick, source = None, None
            if a and b and a['choice'] == b['choice']:
                pick, source = a, 'agree'
            elif a and b and c and c['choice'] == a['choice']:
                pick, source = a, 'third:a'
            elif a and b and c and c['choice'] == b['choice']:
                pick, source = b, 'third:b'
            elif a and not b and c and c['choice'] == a['choice']:
                pick, source = a, 'pair:ac'
            elif b and not a and c and c['choice'] == b['choice']:
                pick, source = b, 'pair:bc'
            final[(task['passage'], task['index'])] = {
                'round': rnd['name'], 'kind': rnd['kind'], 'task': task, 'pick': pick, 'source': source,
                'state': source or ('split' if a and b else 'unanswered'),
                'receipt': {'passage': task['passage'], 'index': task['index'], 'surface': task['surface'], 'round': rnd['name'],
                            'sentence': task['sentence'], 'rules': f"{task['shown']['seq']}:{task['shown']['k']}" if task.get('shown') else None,
                            'a': told(task, a), 'b': told(task, b), 'c': told(task, c), 'source': source}}
    # a reviewed row: where the models' pick is a sense Grok's audits (0315, 2029) show misleads in its sentence, the
    # reviewer's sense stands, with the reason; the models' picks stay in the receipt. Its glosses are the served
    # dictionary's; a token no round asked about gets a receipt of its own (its sentence, no model's pick)
    for review in config.get('review', []):
        key = (review['passage'], review['index'])
        if key not in final:
            sentence, surface = sentence_of(*key)
            final[key] = {'round': 'review', 'kind': 'sense', 'task': None, 'pick': None, 'source': None, 'state': None,
                          'receipt': {'passage': key[0], 'index': key[1], 'surface': surface, 'round': 'review', 'sentence': sentence,
                                      'rules': None, 'a': None, 'b': None, 'c': None, 'source': None}}
        item = final[key]
        if review['choice'] == 'R':
            item.update(pick={'choice': 'R'}, source='review', state='review', kind='sense')
            item['receipt'].update(source='review', review={'choice': 'R', 'gloss': '', 'reason': review['reason']})
            continue
        seq, k = review['choice'].split(':')
        glosses = sense_glosses(seq, int(k))
        lead = review.get('lead')
        pick = {'choice': review['choice'] if lead is None else f"{review['choice']}:{lead}", 'seq': seq, 'k': int(k)}
        if lead is not None:
            assert 0 < lead < len(glosses), review
            pick['g'] = lead
        item.update(pick=pick, source='review', state='review', kind='sense' if lead is None else 'gloss')
        item['receipt'].update(source='review', review={'choice': pick['choice'],
                                                        'gloss': glosses[lead] if lead is not None else '; '.join(glosses[:3]),
                                                        'reason': review['reason']})
    superseded = json.loads(Path(config['superseded']).read_text('utf-8'))['superseded'] if config.get('superseded') else []
    # a task the app now settles itself (a later rule reads the word whole): no row, listed with the superseded
    for drop in config.get('drop', []):
        if final.pop((drop['passage'], drop['index']), None) is not None:
            superseded.append({'passage': drop['passage'], 'index': drop['index'], 'surface': drop['surface'], 'why': drop['why']})
    for item in superseded:
        key = (item['passage'], item['index'])
        if key in final and final[key]['round'] == config['rounds'][0]['name']:
            del final[key]  # superseded with no later task of its own: no row
    articles, splits, tally = {}, [], Counter()
    for (passage, index), item in sorted(final.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        tally[item['state']] += 1
        pick = item['pick']
        if pick:
            if pick['choice'] == 'N':
                row = ['name', item['source']]
            elif pick['choice'] == 'R':
                row = ['reading', item['source']]
            elif item['kind'] == 'gloss':
                row = [pick['seq'], pick['k'], item['source'], pick['g']]
            else:
                row = [pick['seq'], pick['k'], item['source']]
            articles.setdefault(passage, {})[str(index)] = row
        elif item['state'] == 'split':
            r = item['receipt']
            splits.append({'passage': passage, 'index': index, 'surface': r['surface'], 'round': item['round'],
                           'a': r['a']['choice'], 'b': r['b']['choice'], 'c': r['c']['choice'] if r['c'] else None})
    index = json.loads((CORRIDOR / 'data' / 'share_alike' / 'dict-v2' / 'index.json').read_text('utf-8'))
    sidecar = {
        'schemaVersion': 1,
        'about': ("R3 part 2 (the lead's R3 brief; Grok 0315, 2029): the sense a token's sentence uses, for tokens the app's "
                  "sense rules do not settle. Two models chose blind, through subscription lanes; a row is their agreement, "
                  "or a third model's pick siding with one of them, or (source 'review') a reviewer's sense where Grok's "
                  "audits show the pick misleads, with the reason. A row is [entry seq, sense index, source], [entry seq, "
                  "sense index, source, gloss index] (the gloss the slip leads with), ['name', source] (a proper name in its "
                  "text), or ['reading', source] (a reading the text talks about, not a word). The app reads a row before "
                  "its rules (corridor.js, R3 sense truth); prototypes/corridor/tools/sense-sidecar-receipts.json holds every "
                  "pick and reason."),
        'models': models,
        'pin': index['source']['pin'],
        'articles': {pid: dict(sorted(rows.items(), key=lambda kv: int(kv[0]))) for pid, rows in sorted(articles.items())},
    }
    SIDECAR.write_text(json.dumps(sidecar, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf-8')
    receipts = [item['receipt'] for _, item in sorted(final.items(), key=lambda kv: (kv[0][0], kv[0][1]))]
    head = {'schemaVersion': 1, 'models': models, 'tally': dict(tally),
            'rounds': {rnd['name']: {'kind': rnd['kind'], 'prompt': prompts[rnd['name']]} for rnd in config['rounds']},
            'item': ("each item: the sentence with the word in 【】; the word's surface, reading, dictionary form and the "
                     "tokenizer's part of speech; its options numbered — candidate senses (entry head, JMdict part of speech "
                     "and misc tags, glosses, notes) and N for a proper name, or for a gloss task one gloss each"),
            'superseded': superseded, 'splits': splits}
    lines = [json.dumps(head, ensure_ascii=False, indent=1)[:-2] + ',\n "tasks": [']
    lines += [' ' + json.dumps(r, ensure_ascii=False) + (',' if k < len(receipts) - 1 else '') for k, r in enumerate(receipts)]
    lines += [' ]', '}']
    RECEIPTS.write_text('\n'.join(lines) + '\n', 'utf-8')
    json.loads(RECEIPTS.read_text('utf-8'))
    rows = sum(len(v) for v in articles.values())
    print(json.dumps({'tasks': len(final), 'rows': rows, 'tally': dict(tally), 'splits': len(splits), 'superseded': len(superseded),
                      'articles': len(articles)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
