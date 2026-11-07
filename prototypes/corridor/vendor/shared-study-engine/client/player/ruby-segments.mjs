/** Align a supplied reading to its source word. This never consults a lexicon. */
const han = text => /\p{Script=Han}/u.test(text);
const kana = text => /^[\p{Script=Hiragana}\p{Script=Katakana}\p{M}ー]+$/u.test(text);
const normalize = text => text.normalize('NFKC').normalize('NFD')
  .replace(/[\u30a1-\u30f6\u30fd\u30fe]/g, char => String.fromCharCode(char.charCodeAt(0)-0x60)).normalize('NFC');

// Keep combining marks/halfwidth voicing marks attached, while retaining the
// original UTF-16 offsets. Matching normalization never changes displayed text.
function units(text) {
  const result=[];let offset=0;
  for(const char of text){
    if(result.length&&/[\p{M}\uff9e\uff9f]/u.test(char)){
      const last=result.at(-1);last.text+=char;last.end+=char.length;
    }else result.push({text:char,start:offset,end:offset+char.length});
    offset+=char.length;
  }
  return result;
}

/** Each segment's readingStart/End indexes the unchanged supplied reading.
 * A unique kana-anchor alignment splits ruby onto Han runs. Ambiguous or
 * mismatched evidence remains one explicitly labelled source ruby, never a
 * guessed pronunciation. Kana-only bases are always plain. */
export function splitSourceRuby(surface,reading) {
  if(typeof surface!=='string'||typeof reading!=='string')throw new TypeError('Ruby source strings required');
  const part=(start,end,readingStart,readingEnd,annotated)=>({surface:surface.slice(start,end),start,end,
    reading:annotated?reading.slice(readingStart,readingEnd):null,readingStart,readingEnd});
  const whole=(status,reason=null)=>({status,reason,segments:[part(0,surface.length,0,reading.length,Boolean(reading)&&han(surface))]});
  if(!reading||!han(surface))return whole('plain');
  // Hard bounds make adversarial repeated anchors a bounded presentation task.
  if(surface.length>512||reading.length>1024)return whole('fallback','alignment-limit');
  if(/^[\p{Script=Han}\p{M}]+$/u.test(surface))return whole('whole');
  const runs=[];
  for(const unit of units(surface)){
    const kind=han(unit.text)?'han':kana(normalize(unit.text))?'kana':'other',last=runs.at(-1);
    if(last?.kind===kind){last.text+=unit.text;last.end=unit.end;}
    else runs.push({...unit,kind});
  }
  if(runs.length===1&&runs[0].kind==='han')return whole('whole');
  if(runs.some(run=>run.kind==='other'))return whole('fallback','unsupported-surface');
  if(!kana(normalize(reading)))return whole('fallback','unsupported-reading');
  const readingUnits=units(reading),normalized=readingUnits.map(unit=>normalize(unit.text)),bounds=[0];
  for(const unit of readingUnits)bounds.push(unit.end);
  const anchors=runs.map(run=>run.kind==='kana'?normalize(run.text):null),memo=new Map();let work=0;
  const align=(index,at)=>{
    if(++work>16384)throw Error('alignment-limit');
    if(index===runs.length)return at===readingUnits.length?[[]]:[];
    const key=`${index}:${at}`;if(memo.has(key))return memo.get(key);
    const answers=[],anchor=anchors[index];
    if(anchor!==null){
      let value='';
      for(let end=at;end<readingUnits.length;end++){
        value+=normalized[end];if(!anchor.startsWith(value))break;
        if(value===anchor){for(const rest of align(index+1,end+1))answers.push([[at,end+1],...rest]);break;}
      }
    }else{
      const last=index===runs.length-1;
      for(let end=last?readingUnits.length:at+1;end<=readingUnits.length;end++){
        if(end<=at)continue;
        for(const rest of align(index+1,end)){answers.push([[at,end],...rest]);if(answers.length===2)break;}
        if(answers.length===2||last)break;
      }
    }
    memo.set(key,answers);return answers;
  };
  let answers;try{answers=align(0,0);}catch{return whole('fallback','alignment-limit');}
  if(answers.length!==1)return whole('fallback',answers.length?'ambiguous-kana-anchors':'mismatched-kana-anchors');
  return {status:'split',reason:null,segments:runs.map((run,index)=>{
    const [start,end]=answers[0][index];return part(run.start,run.end,bounds[start],bounds[end],run.kind==='han');
  })};
}
