const fail=message=>{throw Error(`Offline dictionary: ${message}`);};
const strings=value=>Array.isArray(value)&&value.every(s=>typeof s==='string'&&s.trim());
const hira=s=>(s||'').normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
/** Build-time morphological spans are accepted only for their exact hashed source. */
export async function prepareOfflineDictionary(input,catalog){
 if(input?.format!=='nsrs-offline-dictionary/v1'||!input.entries||!input.passages||!input.kanji||!input.attribution)fail('missing index or provenance');
 const entries=new Map(),forms=new Map(),byText=new Map(),passages=new Map(),decks=new Map();
 for(const [key,raw]of Object.entries(input.entries)){
  if(typeof raw.lemma!=='string'||!raw.lemma||typeof raw.reading!=='string'||!strings(raw.glosses)||!['JMdict','KANJIDIC2','deck'].includes(raw.source))fail('invalid JMdict entry');
  const entry=Object.freeze({...raw,glosses:Object.freeze([...raw.glosses])});entries.set(key,entry);
  for(const form of new Set([entry.lemma,...(entry.forms||[])])){if(typeof form!=='string')fail('invalid dictionary form');const list=forms.get(form)||[];list.push(entry);forms.set(form,list);}
 }
 for(const card of catalog.filter(e=>e.contractId==='vocabulary.read.v1'))for(const form of new Set([card.term,card.form].filter(Boolean))){const list=decks.get(form)||[];if(!list.some(e=>e.noteGuid===card.noteGuid))list.push(card);decks.set(form,list);}
 const sources=new Map();
 for(const e of catalog){for(const [field,text]of [['passage',e.ja],['definition',e.defJa]])if(typeof text==='string')sources.set(`${e.taskKey}|${field}`,text);
  if(e.grammarRecord){for(const text of [e.grammarRecord.pattern,e.grammarRecord.meaning,e.grammarRecord.formation,e.grammarRecord.nuance,...e.grammarRecord.examples.map(x=>x.ja)])if(typeof text==='string')sources.set(`context:${text}`,text);}}
 const texts=new Map();await Promise.all([...new Set(sources.values())].map(async text=>texts.set(await hash(text),text)));
 for(const [key,record]of Object.entries(input.passages)){
  const digest=record.sourceSha256||record.source_sha256,text=sources.get(key)??record.sourceText??texts.get(digest);
  if(typeof text!=='string'||!Array.isArray(record.tokens)||!digest||await hash(text)!==digest)fail(`source mismatch ${key}`);
  const cp=[...text],boundaries=[0];for(const c of cp)boundaries.push(boundaries.at(-1)+c.length);
  let previous=0;const tokens=[];
  for(const token of record.tokens){
   if(!Number.isInteger(token.start)||!Number.isInteger(token.end)||token.start<previous||token.end<=token.start||token.end>cp.length||cp.slice(token.start,token.end).join('')!==token.surface||token.entryKey&&!entries.has(token.entryKey))fail(`invalid token ${key}`);
   const start=boundaries[token.start],end=boundaries[token.end];tokens.push(Object.freeze({...token,start,end,unit:'utf16-code-unit',isWord:/[\p{L}\p{N}]/u.test(token.surface)}));previous=token.end;
  }
  const chunks=[];let chunkEnd=0;
  for(const chunk of record.chunks||[]){if(!Number.isInteger(chunk.start)||!Number.isInteger(chunk.end)||chunk.start<chunkEnd||chunk.end<=chunk.start||chunk.end>cp.length||cp.slice(chunk.start,chunk.end).join('')!==chunk.surface||chunk.entryKey&&!entries.has(chunk.entryKey))fail(`invalid chunk ${key}`);chunkEnd=chunk.end;
   const parts=(chunk.parts||[]).map(part=>{const source=entries.get(part.entryKey);if(part.entryKey&&!source)fail(`missing chunk part ${key}`);return Object.freeze({...part,...(source?{glosses:source.glosses,source:source.source}:{}),deck:chooseDeck(part.lemma,source?.reading||part.reading)});});
   const grammar=chunk.grammarTaskKey?catalog.find(e=>e.taskKey===chunk.grammarTaskKey&&e.contractId.startsWith('grammar.')):null;if(chunk.grammarTaskKey&&!grammar)fail(`missing chunk grammar ${key}`);
   chunks.push(Object.freeze({...chunk,start:boundaries[chunk.start],end:boundaries[chunk.end],parts:Object.freeze(parts),grammar}));}
  const prepared=Object.freeze(tokens),recordOut={text,tokens:prepared,chunks:Object.freeze(chunks)};passages.set(key,recordOut);byText.set(text,recordOut);
 }
 for(const e of catalog)if(e.ja&&!passages.has(`${e.taskKey}|passage`))fail(`missing passage ${e.taskKey}`);
 const kanji=new Map();for(const [glyph,raw]of Object.entries(input.kanji))if([...glyph].length===1&&strings(raw.meanings)&&strings(raw.readings))kanji.set(glyph,Object.freeze({...raw,source:'KANJIDIC2'}));
 function choose(list,reading){if(!list?.length)return null;const exact=reading?list.filter(e=>hira(e.reading)===hira(reading)):list;return exact.length===1?exact[0]:null;}
 function chooseDeck(lemma,reading){return choose(decks.get(lemma),reading);}
 // Explicit reviewed compounds bypass morphological chunks only when the bound
 // dictionary has one exact form/reading match. Ambiguous senses stay unresolved.
 function resolveExact(surface,reading){
  if(typeof surface!=='string'||!surface||typeof reading!=='string'||!reading)return null;
  const entry=choose(forms.get(surface)?.filter(entry=>entry.source!=='deck'),reading);
  return entry?Object.freeze({...entry,kind:'dictionary'}):null;
 }
 function resolve(info){
  const context=byText.get(info.source?.context),tokens=context?.tokens,validSpan=info.source?.context?.slice(info.span?.start,info.span?.end)===info.surface,token=validSpan?tokens?.find(t=>t.start<=info.span.start&&t.end>=info.span.end):null;
  const chunk=validSpan?context?.chunks.find(c=>c.start<=info.span.start&&c.end>=info.span.end):null;
  if(chunk){const entry=entries.get(chunk.entryKey),deck=entry?chooseDeck(entry.lemma,entry.reading):chooseDeck(chunk.surface,null);return Object.freeze({kind:'chunk',...chunk,lemma:chunk.surface,reading:chunk.reading||null,glosses:chunk.contextGloss?[chunk.contextGloss]:chunk.glosses||entry?.glosses||[],deck});}
  const entry=token?.entryKey?entries.get(token.entryKey):choose(forms.get(token?.lemma||info.surface),token?.reading||info.reading);
  const lemma=token?.lemma||entry?.lemma||info.surface,reading=entry?.reading||token?.reading||info.reading;
  const deck=choose(decks.get(lemma),reading)||choose(decks.get(info.surface),reading);
  if(deck)return Object.freeze({kind:'deck',lemma:deck.term,reading:deck.reading,glosses:[deck.meaning],deck,entry});
  const glyph=kanji.get(info.surface);if(glyph&&(!entry||entry.source==='KANJIDIC2'))return Object.freeze({kind:'kanji',lemma:info.surface,...glyph});
  if(entry&&entry.source!=='deck')return Object.freeze({kind:'dictionary',...entry});
  return Object.freeze({kind:'pending',lemma,reading:reading||null});
 }
 return Object.freeze({resolve,resolveExact,segments:(e,text,field)=>{const record=passages.get(`${e.taskKey}|${field}`);return record?.text===text?record.tokens:byText.get(text)?.tokens||null;},attribution:Object.freeze(structuredClone(input.attribution)),entryCount:entries.size});
}
