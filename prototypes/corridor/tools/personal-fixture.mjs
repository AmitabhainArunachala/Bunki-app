// Synthetic public test content, unrelated to any learner or conversation.
import {digest} from '../decks/personal/schema.mjs';
export async function fixture() {
  const data = {
    format:'john-personal-japanese',version:1,id:'public-test-collection',title:'検証用の文脈',
    scope:'Synthetic test fixture. Not a learner history.',level:'Test content only.',
    worlds:[{id:'books',ja:'本',en:'Books',about:'Synthetic library examples.'},{id:'city',ja:'町',en:'City',about:'Synthetic town examples.'}],
    sources:[{id:'original',title:'Synthetic original passage',url:'',scope:'Written solely for automated tests.'}],threads:[],routes:[],lessons:[],
  };
  for (let i=0;i<8;i++) {
    const l = {id:`passage-${i}`,title:`検証の段落 ${i+1}`,world:i%2?'city':'books',sequence:i,ordinal:i+1,
      ja:'町の図書館では、読者が落ち着いて本を読めるように、静かな部屋を用意している。新しい本を選ぶにあたっては、表紙だけで判断せず、目次や最初の数ページにも目を通すことが大切だ。気になった言葉を一つだけ手帳に書いておけば、翌日にその言葉の意味を自分で思い出す練習ができる。',
      en:'The library provides a quiet room. Look beyond the cover when choosing a book. Note one word and recall it tomorrow.',
      term:'図書館',reading:'としょかん',acceptedReadings:['としょかん'],gloss:'library',
      grammar:'にあたって',grammarAnswer:'On the occasion of; when undertaking an activity.',
      conceptQuestion:'How could you select a book thoughtfully?',conceptAnswer:'Read the contents and a few pages.',
      sources:['original'],connections:[i%2?'books':'city'],assessmentVersion:1,origin:'original_composition',editorialStatus:'Synthetic test fixture',jlptLevel:null};
    l.contentHash = await digest(l); data.lessons.push(l);
  }
  data.routes = [{title:'A public test route',ids:['passage-0','passage-1']}];
  data.contentDigest = await digest({edition:data.id,lessons:data.lessons});
  return data;
}
