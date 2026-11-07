/** Learner-authored card data, never AI/dictionary/translation verification. */
import {payloadHash} from '../schema/event.mjs';
export function manualCardData(value={}){
 const data={version:1,word:typeof value.word==='string'?value.word.normalize('NFKC').trim():'',reading:typeof value.reading==='string'?value.reading.normalize('NFKC').trim():'',meaning:typeof value.meaning==='string'?value.meaning.trim():'',example:typeof value.example==='string'?value.example.trim():'',note:typeof value.note==='string'?value.note.trim():''};
 if(['word','reading','meaning','example'].some(k=>!data[k])||Object.entries(data).some(([key,v])=>typeof v==='string'&&(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uD800-\uDFFF]/u.test(v)||[...v].length>(['word','reading'].includes(key)?128:4000))))throw Error('invalid-manual-card');
 return data;
}
export function manualEntry(event,at=event.ts){
 const data=manualCardData(event.data),identity=payloadHash({learner:event.learner,eventId:event.id}),noteGuid=`nsrs-manual-${identity}`,passageId=`${noteGuid}:example:1`,contractId='vocabulary.read.v1';
 return {taskKey:JSON.stringify([noteGuid,contractId,passageId]),noteGuid,passageId,contractId,module:'kotoba',term:data.word,form:data.word,reading:data.reading,meaning:data.meaning,defJa:'',defEn:'',ja:data.example,en:'',note:data.note,manual:true,source:'learner-authored',contentReady:true,contentRevision:payloadHash(data),createdAt:new Date(at).toISOString(),lexemeId:`manual:${payloadHash([event.learner,data.word,data.reading])}`};
}
