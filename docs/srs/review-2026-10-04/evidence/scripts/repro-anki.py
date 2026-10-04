# Run from repository root; Anki scripts require a dedicated scratch REVIEW_EVIDENCE_OUT.
import os
from anki.collection import Collection
from anki.import_export_pb2 import ImportAnkiPackageRequest, ImportAnkiPackageOptions
import pathlib,json
base=pathlib.Path(os.environ['REVIEW_EVIDENCE_OUT']);repo=pathlib.Path.cwd(); results=[]
for d in ['mine','mcd']:
 p=base/f'anki-runtime-{d}.anki2'; p.unlink(missing_ok=True);col=Collection(str(p));req=ImportAnkiPackageRequest(package_path=str(repo/f'decks/kotoba-mine/release/kotoba-{d}.apkg'),options=ImportAnkiPackageOptions(with_scheduling=False,with_deck_configs=False));first=col.import_anki_package(req); ids=col.find_cards('');card=col.get_card(ids[0]); before=(card.id,card.nid);card.type=2;card.queue=2;card.ivl=30;card.due=500;card.reps=7;col.update_card(card);r=col.import_anki_package(req);new=col.get_card(ids[0]);q=new.question();a=new.answer();(base/f'anki-render-{d}-front.html').write_text(q);(base/f'anki-render-{d}-back.html').write_text(a);results.append({'deck':d,'first_count':len(ids),'after_count':len(col.find_cards('')),'ids_preserved':before==(new.id,new.nid),'schedule_after':[new.type,new.queue,new.ivl,new.due,new.reps],'qfmt_render':q,'afmt_render':a,'reimport_log':str(r)});col.close()
(base/'anki-runtime-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps([{k:v for k,v in x.items() if k not in ['qfmt_render','afmt_render']} for x in results],ensure_ascii=False,indent=2))
