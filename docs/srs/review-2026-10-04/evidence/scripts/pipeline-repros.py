# Run from repository root; Anki scripts require a dedicated scratch REVIEW_EVIDENCE_OUT.
import os
import collections,json,sys
from pathlib import Path
root=Path.cwd()
sys.path.insert(0,str(root/'decks/kotoba-mine/tools'))
import rank,fugashi
tagger=fugashi.Tagger()
result={'false_matches':[],'decks':{},'missing_export_inputs':[]}
for ja,key in [('率直に言うと無理だ。','率'),('素直なお願いです。','なお'),('子供は風邪をひきがちだ。','がち'),('一日ごとに増える。','ごとく'),('彼はひらめきを書いた。','ひらめく')]:
 tokens=list(tagger(ja))
 result['false_matches'].append({'ja':ja,'key':key,'span':rank.match_span(tokens,ja,[key]),'tokens':[(x.surface,x.feature.orthBase) for x in tokens]})
for key in ['kotoba-mine','kotoba-mcd']:
 deck=json.loads((root/f'prototypes/corridor/decks/{key}/deck.json').read_text())
 cards=[(w,c) for w in deck['words'] for c in w['cards'] if c.get('type')!='kanji']
 counts=collections.Counter(c['ja'] for w,c in cards)
 result['decks'][key]={'multiple_target':[{'id':c['id'],'term':w['term'],'form':c['form'],'occurrences':c['ja'].count(c['form']),'ja':c['ja']} for w,c in cards if c['ja'].count(c['form'])!=1], 'duplicates':[{'ja':ja,'count':n} for ja,n in counts.items() if n>1],'real_count':sum(c['kind']!='original' for w,c in cards),'real_missing_url':sum(c['kind']!='original' and not c.get('src',{}).get('url') for w,c in cards)}
for rel in ['decks/kotoba-mine/mining/ranked.json','decks/kotoba-mine/mining/passages_ranked.json']:
 if not (root/rel).exists():result['missing_export_inputs'].append(rel)
print(json.dumps(result,ensure_ascii=False,indent=2))
