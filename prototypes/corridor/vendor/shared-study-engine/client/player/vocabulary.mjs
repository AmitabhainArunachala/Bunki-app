import {createNode,wordSegments} from './presentation.mjs';
import {applyKinsoku} from './kinsoku.mjs';
/** Readings belong to their exact passage. Definition homographs never borrow passage ruby. */
export function renderVocabularyPassage(document,entry,text,{front=false,field='passage',onWord=()=>{},dictionary=null}={}){
 const h=(tag,attrs,...children)=>createNode(document,tag,attrs,...children),node=h('p',{class:'passage','data-passage':field,lang:'ja'});
 const target=entry.form||entry.term,at=field==='passage'?text.indexOf(target):-1;
 if(front){if(at<0)node.textContent=text;else node.append(text.slice(0,at),h('mark',{class:`target pos-${entry.posClass||'noun'}`},target),text.slice(at+target.length));return applyKinsoku(node);}
 let offset=0;
 const bound=field==='passage'&&entry.rubySegments?entry.rubySegments.flatMap(([surface,reading])=>{const start=offset;offset+=surface.length;return reading?[{surface,reading,start,end:offset,isWord:true}]:wordSegments(surface).map(s=>({...s,start:s.start+start,end:s.end+start}));}):null;
 const indexed=dictionary?.segments(entry,text,field);
 const segments=indexed?indexed.flatMap((s,i)=>{const before=i?indexed[i-1].end:0;return [...(s.start>before?[{surface:text.slice(before,s.start),isWord:false}]:[]),s,...(i===indexed.length-1&&s.end<text.length?[{surface:text.slice(s.end),isWord:false}]:[])];}):bound||(at<0?wordSegments(text):[...wordSegments(text.slice(0,at)),{surface:target,start:at,end:at+target.length,isWord:true},...wordSegments(text.slice(at+target.length)).map(s=>({...s,start:s.start+at+target.length,end:s.end+at+target.length}))]);
 for(const s of segments){if(!s.isWord){node.append(s.surface);continue;}
  const reading=field==='passage'?(s.reading||(s.surface===entry.term?entry.reading:entry.ruby?.find(r=>r.surface===s.surface)?.reading)):null;
  const word=h('button',{type:'button',class:`word ${field==='passage'&&s.surface===target?'target':''}`,'data-word':s.surface,'data-target-token':field==='passage'&&at>=0&&s.start<at+target.length&&s.end>at,onclick:e=>onWord({surface:s.surface,span:{start:s.start,end:s.end,unit:'utf16-code-unit'},location:field,source:{context:text,field},dictionaryToken:indexed?s:null,isTarget:field==='passage'&&at>=0&&s.start<at+target.length&&s.end>at},e.currentTarget)});
  word.append(reading?h('ruby',{},s.surface,h('rt',{},reading)):s.surface);node.append(word);
 }return applyKinsoku(node);
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
