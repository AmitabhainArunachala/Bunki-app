import {KANJI_FAMILIES,KANJI_CONTRASTS,KANJI_MEMORY_CUES} from './families.mjs';

const text=value=>typeof value==='string'?value:'';
const strings=value=>Array.isArray(value)?value.filter(x=>typeof x==='string'&&x.trim()):text(value).trim()?[value]:[];
const glyphs=value=>[...new Set([...text(value)].filter(c=>/^\p{Script=Han}$/u.test(c)&&!['々','〻'].includes(c)))];
const wordKey=entry=>JSON.stringify([text(entry?.term),text(entry?.reading)]);
const sourceLabel={en:'Packaged kanji data',ja:'デッキの漢字データ'};

/** Pure view model over existing content. No guesses, writes, scheduler, or remote lookup.
 * A word's complete reading is never divided among its constituent kanji.
 * Dictionary fallback is accepted only when its resolver identifies this exact glyph.
 */
export function buildKanjiModel(entry={}, {relatedWords=[],dictionary=null,learningReport=null,maxRelated=12}={}) {
 entry=entry&&typeof entry==='object'?entry:{};
 const term=text(entry?.term),selected=glyphs(term),selectedSet=new Set(selected);
 const catalog=Array.isArray(relatedWords)?relatedWords:[];
 const limit=Number.isSafeInteger(maxRelated)?Math.min(40,Math.max(0,maxRelated)):12;
 const related=new Map(selected.map(g=>[g,new Map()]));
 // One catalog traversal, including with a multi-character target. Existing IDs remain intact.
 for(const candidate of catalog){
  if(!candidate||typeof candidate.term!=='string'||candidate.contractId&&candidate.contractId!=='vocabulary.read.v1'||wordKey(candidate)===wordKey(entry))continue;
  const key=wordKey(candidate);
  for(const glyph of glyphs(candidate.term)){
   if(!selectedSet.has(glyph))continue;
   const matches=related.get(glyph);
   if(!matches.has(key))matches.set(key,{term:candidate.term,reading:text(candidate.reading),meaning:text(candidate.meaning),definitionJa:text(candidate.defJa),entry:candidate});
  }
 }
 const details=selected.map(glyph=>{
  const raw=Array.isArray(entry.kanji)?entry.kanji.find(k=>k?.c===glyph):null;
  let dictionaryEntry=null;
  if(typeof dictionary?.resolveKanji==='function'||typeof dictionary?.resolve==='function'){
   try{const value=typeof dictionary.resolveKanji==='function'?dictionary.resolveKanji(glyph):dictionary.resolve({surface:glyph});if(value?.kind==='kanji'&&value.lemma===glyph)dictionaryEntry=value;}catch{/* Missing enrichment must not prevent a card from being studied. */}
  }
  const family=KANJI_FAMILIES.find(f=>f.phonetic===glyph||f.members.some(m=>m.glyph===glyph))??null;
  const allRelated=[...related.get(glyph).values()];
  const contrasts=KANJI_CONTRASTS.filter(c=>c.glyphs.includes(glyph)).map(c=>{
   const other=c.glyphs.find(g=>g!==glyph),word=c.words.find(w=>w[0]===other);
   return {glyph:other,distinction:c.distinction,term:word?.[1]??'',reading:word?.[2]??''};
  });
  const rawMeanings=strings(raw?.m),rawReadings=strings(raw?.r),components=[...new Set(strings(raw?.parts))];
  const validCount=value=>Number.isSafeInteger(value)&&value>0;
  const count=validCount(raw?.st)?raw.st:dictionaryEntry?.strokes;
  const meanings=rawMeanings.length?rawMeanings:strings(dictionaryEntry?.meanings);
  const readings=rawReadings.length?rawReadings:strings(dictionaryEntry?.readings);
  const packaged=!!(rawMeanings.length||rawReadings.length||components.length||validCount(raw?.st));
  const dictionaryUsed=!!(dictionaryEntry&&(!rawMeanings.length&&meanings.length||!rawReadings.length&&readings.length||!validCount(raw?.st)&&validCount(count)));
  const provenance=dictionaryUsed?{en:`${packaged?'Packaged kanji data + ':''}KANJIDIC2 · EDRDG · CC BY-SA 4.0`,ja:`${packaged?'デッキの漢字データ + ':''}KANJIDIC2 · EDRDG · CC BY-SA 4.0`}:packaged?sourceLabel:{en:'No character record yet',ja:'この漢字の詳しい情報はまだありません'};
  return {
   glyph,meanings,readings,
   strokeCount:validCount(count)?count:null,
   components,sourceLabel:provenance,
   related:allRelated.slice(0,limit),relatedTotal:allRelated.length,
   family,contrasts,mnemonic:KANJI_MEMORY_CUES[glyph]??null
  };
 });
 return {
  term,reading:text(entry?.reading),meaning:text(entry?.meaning),definitionJa:text(entry?.defJa),
  collocations:Array.isArray(entry?.collocations)?entry.collocations.map(c=>typeof c==='string'?c:JSON.stringify(c)).filter(Boolean):[],
  glyphs:details,coverage:{characters:details.length,totalEnriched:details.filter(g=>g.family||g.meanings.length||g.components.length).length},
  learningReport
 };
}
