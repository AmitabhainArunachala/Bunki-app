import {createNode,wordSegments} from './presentation.mjs';
import {applyKinsoku} from './kinsoku.mjs';
import {splitSourceRuby} from './ruby-segments.mjs';
const hasKanji=text=>/\p{Script=Han}/u.test(text);
const sourceReadings=(surface,reading,start)=>{
 const split=splitSourceRuby(surface,reading);
 return split.segments.filter(part=>part.reading).map(part=>({start:start+part.start,end:start+part.end,reading:part.reading,alignment:split.status,reason:split.reason}));
};
/** Keep readings bound to their exact source offsets, never dictionary lemmas. */
function passageReadings(entry,text,field){
 if(field!=='passage'||text!==entry.ja)return [];
 if(Array.isArray(entry.rubySegments)){
  if(entry.rubySegments.map(([surface])=>surface).join('')!==text)return [];
  let offset=0;
  return entry.rubySegments.flatMap(([surface,reading])=>{const start=offset;offset+=surface.length;
   return reading&&hasKanji(surface)?sourceReadings(surface,reading,start):[];});
 }
 // Older cards retain an ordered passage-only ruby list. Do not reuse a
 // homograph's first reading for every later occurrence in the sentence.
 let cursor=0;const spans=[];
 for(const {surface,reading} of entry.ruby??[]){
  const start=text.indexOf(surface,cursor);if(!surface||start<0)continue;cursor=start+surface.length;
  if(reading&&hasKanji(surface))spans.push(...sourceReadings(surface,reading,start));
 }
 if(!spans.length&&entry.reading&&(!entry.form||entry.form===entry.term)){const target=entry.term,start=text.indexOf(target);
  if(start>=0&&hasKanji(target))spans.push(...sourceReadings(target,entry.reading,start));}
 return spans;
}
/** Readings belong to their exact passage. Definition homographs never borrow passage ruby. */
export function renderVocabularyPassage(document,entry,text,{front=false,field='passage',onWord=()=>{},dictionary=null}={}){
 const h=(tag,attrs,...children)=>createNode(document,tag,attrs,...children),node=h('p',{class:'passage','data-passage':field,'data-readings':front?'reserved':'visible',lang:'ja'});
 const target=entry.form||entry.term,at=field==='passage'?text.indexOf(target):-1;
 const indexed=dictionary?.segments(entry,text,field);
 const segments=indexed?.length?indexed.flatMap((s,i)=>{const before=i?indexed[i-1].end:0;return [...(s.start>before?[{surface:text.slice(before,s.start),start:before,end:s.start,isWord:false}]:[]),s,...(i===indexed.length-1&&s.end<text.length?[{surface:text.slice(s.end),start:s.end,end:text.length,isWord:false}]:[])];}):(at<0?wordSegments(text):[...wordSegments(text.slice(0,at)),{surface:target,start:at,end:at+target.length,isWord:true},...wordSegments(text.slice(at+target.length)).map(s=>({...s,start:s.start+at+target.length,end:s.end+at+target.length}))]);
 const readings=passageReadings(entry,text,field),boundaries=[...new Set(segments.flatMap(s=>[s.start,s.end]))].sort((a,b)=>a-b);
 // A source reading can span several dictionary tokens (e.g. 博士号). Its
 // single ruby wraps those lookup buttons rather than inventing split readings.
 let boundaryIndex=0;
 const crossing=readings.filter(r=>{while(boundaryIndex<boundaries.length&&boundaries[boundaryIndex]<=r.start)boundaryIndex++;return boundaries[boundaryIndex]<r.end;});
 let tokenIndex=0,readingIndex=0;
 const content=(start,end,withRuby)=>{
  const children=[];let cursor=start;
  while(readingIndex<readings.length&&readings[readingIndex].end<=start)readingIndex++;
  while(withRuby&&readingIndex<readings.length&&readings[readingIndex].start<end){
   const r=readings[readingIndex];if(r.start<start||r.end>end)break;
   children.push(text.slice(cursor,r.start),h('ruby',{'data-ruby-alignment':r.alignment,'data-ruby-fallback':r.reason},text.slice(r.start,r.end),h('rt',{'aria-hidden':front?'true':null,style:front?'visibility:hidden':null},r.reading)));cursor=r.end;readingIndex++;
  }
  children.push(text.slice(cursor,end));return children;
 };
 const renderRange=(start,end,withRuby=true)=>{
  const children=[];
  while(tokenIndex<segments.length&&segments[tokenIndex].start<end){
   const s=segments[tokenIndex],from=Math.max(start,s.start),to=Math.min(end,s.end);
   if(from<to){
    const parts=content(from,to,withRuby);
    if(!s.isWord)children.push(...parts);
    else children.push(h(front?'span':'button',{type:front?null:'button',class:`word ${field==='passage'&&s.surface===target?'target':''}`,'data-word':front?null:s.surface,'aria-label':!front&&(from!==s.start||to!==s.end)?s.surface:null,tabindex:!front&&from>s.start?-1:null,'data-target-token':field==='passage'&&at>=0&&s.start<at+target.length&&s.end>at,...(!front?{onclick:e=>onWord({surface:s.surface,span:{start:s.start,end:s.end,unit:'utf16-code-unit'},location:field,source:{context:text,field},dictionaryToken:indexed?s:null,isTarget:field==='passage'&&at>=0&&s.start<at+target.length&&s.end>at},e.currentTarget)}:{} )},...parts));
   }
   if(s.end>end)break;tokenIndex++;
  }
  return children;
 };
 let cursor=0;
 for(const r of crossing){node.append(...renderRange(cursor,r.start),h('ruby',{'data-ruby-alignment':r.alignment,'data-ruby-fallback':r.reason},...renderRange(r.start,r.end,false),h('rt',{'aria-hidden':front?'true':null,style:front?'visibility:hidden':null},r.reading)));cursor=r.end;}
 node.append(...renderRange(cursor,text.length));return applyKinsoku(node);
}
/** Compact source-backed relationships; no inferred kanji facts or readings. */
export function renderVocabularyRelated(document,entry,{onWord=()=>{},relatedWords=[],onRelated=()=>{},dictionary=null}={}){
 const h=(tag,attrs,...children)=>createNode(document,tag,attrs,...children),panel=h('div',{class:'kanji-panel'});
 if(entry.collocations?.length){const chips=h('div',{class:'collocation-chips'});for(const text of entry.collocations){const value=typeof text==='string'?text:JSON.stringify(text),passage=renderVocabularyPassage(document,entry,value,{field:'sheet',onWord,dictionary});chips.append(h('span',{class:'collocation-chip','data-collocation':value},...passage.childNodes));}panel.append(h('h3',{'data-interface-copy':''},'よく使う組み合わせ'),chips);}
 const glyphs=[...new Set([...entry.term].filter(c=>/\p{Script=Han}/u.test(c)))];
 for(const glyph of glyphs){const data=entry.kanji?.find(k=>k.c===glyph),words=relatedWords.filter(e=>e.taskKey!==entry.taskKey&&e.term.includes(glyph)).slice(0,6),info=h('div',{class:'kanji-info'});
  if(data)info.append(h('div',{class:'kanji-heading'},data.r?h('p',{class:'reading'},data.r):null,data.m?h('p',{lang:'en'},data.m):null),data.parts?.length?h('p',{class:'secondary'},h('span',{'data-interface-copy':''},'部品'),'：',h('span',{'data-vocabulary-source':''},data.parts.join('・')),data.st?[' · ',h('span',{'data-interface-copy':''},`${data.st}画`)]:null):null,h('p',{class:'source-label','data-interface-copy':''},'配布デッキの漢字データ'));
  else info.append(h('p',{class:'secondary','data-interface-copy':''},'この漢字の詳しい情報はまだありません'));
  if(words.length)info.append(h('div',{class:'related-words'},...words.map(e=>h('button',{type:'button',class:'text-link',onclick:()=>onRelated(e)},e.term))));
  panel.append(h('div',{class:'kanji-row'},h('strong',{class:'kanji'},glyph),info));
 }
 if(!glyphs.length)panel.append(h('p',{class:'secondary','data-interface-copy':''},'この言葉には漢字がありません。'));return panel;
}
/** One entry layout serves the card back, deck lookup, dictionary and phrase lookup. */
export function renderVocabularyEntry(document,entry,{onWord=()=>{},kanjiPanel=null,relatedWords=[],dictionary=null,hideUnavailable=false}={}){
 const h=(tag,attrs,...children)=>createNode(document,tag,attrs,...children),fold=(label,...children)=>h('details',{class:'fold'},h('summary',{'data-interface-copy':''},label),...children);
 const body=h('div',{'data-vocabulary-entry':''},h('div',{class:'term-block'},h('h1',{class:`pos-${entry.posClass||'noun'}`},entry.term),entry.reading?h('p',{class:'reading'},entry.reading):null,entry.pos?h('span',{class:'pos-label'},entry.pos):null));
 if(entry.defJa)body.append(h('div',{class:'definition'},renderVocabularyPassage(document,entry,entry.defJa,{field:'definition',onWord,dictionary})));
 if(entry.meaning)body.append(h('p',{lang:'en',class:'english short-gloss','data-short-gloss':'','data-dictionary-gloss':''},entry.meaning));
 if(entry.note)body.append(h('p',{class:'usage-note',lang:/[A-Za-z]/.test(entry.note)?'en':'ja'},entry.note));
 if(entry.en)body.append(fold('全文の英訳',h('p',{lang:'en',class:'english','data-full-translation':''},entry.en)));
 if(!hideUnavailable||entry.kanji?.length||entry.collocations?.length)body.append(fold('漢字と、つながる言葉',kanjiPanel||renderVocabularyRelated(document,entry,{onWord,relatedWords,dictionary})));
 if(entry.source||dictionary)body.append(fold('出典と確認',entry.source?h('p',entry.sourceIsInterfaceCopy?{'data-interface-copy':''}:{},entry.source):null,dictionary?h('p',{class:'dictionary-attribution','data-interface-copy':''},'JMdict・KANJIDIC2 © ',h('a',{href:'https://www.edrdg.org/',target:'_blank',rel:'noopener noreferrer'},'EDRDG'),' / ',h('a',{href:'https://www.edrdg.org/edrdg/newlic.html',target:'_blank',rel:'noopener noreferrer'},'CC BY-SA 4.0'),' · ',h('span',{'data-interface-copy':''},'語の原形・読みは形態素解析、英語の語義と漢字情報は各辞書に基づきます。')):null,h('p',{class:'secondary','data-interface-copy':''},'読みは機械処理によるものです。ピッチ・音声は未対応。')));
 return body;
}
export function renderVocabularyBack(document,entry,options={}){
 return createNode(document,'div',{'data-vocabulary-back':''},renderVocabularyPassage(document,entry,entry.ja,options),renderVocabularyEntry(document,entry,options));
}
