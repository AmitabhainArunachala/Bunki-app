# Run from repository root; Anki scripts require a dedicated scratch REVIEW_EVIDENCE_OUT.
import os
import zipfile,sqlite3,tempfile,pathlib,time,json
from anki.collection import Collection
from anki.import_export_pb2 import ImportAnkiPackageRequest, ImportAnkiPackageOptions
base=pathlib.Path(os.environ['REVIEW_EVIDENCE_OUT']);repo=pathlib.Path.cwd();out=[]
for d in ['mine','mcd']:
 src=repo/f'decks/kotoba-mine/release/kotoba-{d}.apkg';z=zipfile.ZipFile(src);db=base/f'changed-{d}.sqlite';db.write_bytes(z.read('collection.anki2'));c=sqlite3.connect(db);row=c.execute('select id,guid,flds from notes order by id limit 1').fetchone();f=row[2].split('\x1f');f[9]+=' [review-import-check]';c.execute('update notes set flds=?,mod=? where id=?',('\x1f'.join(f),int(time.time())+10,row[0]));c.commit();c.close();dest=base/f'changed-{d}.apkg'
 with zipfile.ZipFile(dest,'w') as nz:
  for name in z.namelist():nz.writestr(name,db.read_bytes() if name=='collection.anki2' else z.read(name))
 col=Collection(str(base/f'anki-runtime-{d}.anki2'));nid=col.db.scalar('select id from notes where guid=?',row[1]);card=col.get_card(col.db.scalar('select id from cards where nid=?',nid));before=[card.id,card.nid,card.type,card.queue,card.ivl,card.due,card.reps];log=col.import_anki_package(ImportAnkiPackageRequest(package_path=str(dest),options=ImportAnkiPackageOptions(with_scheduling=False,with_deck_configs=False)));card=col.get_card(card.id);note=col.get_note(nid);out.append({'deck':d,'count':col.db.scalar('select count(*) from notes'),'before':before,'after':[card.id,card.nid,card.type,card.queue,card.ivl,card.due,card.reps],'updated_meaning':note['Meaning'],'updated_log_count':len(log.log.updated)});col.close()
(base/'anki-changed-reimport-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(out,ensure_ascii=False,indent=2))
