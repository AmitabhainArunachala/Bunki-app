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

export async function enrichmentFixture(data) {
  const segments = [
    ['町','まち'],['の'],['図書館','としょかん'],['では、'],['読者','どくしゃ'],['が'],
    ['落ち着いて','おちついて','落ち着く'],['本','ほん'],['を'],['読める','よめる','読む'],['ように、'],
    ['静かな','しずかな','静か'],['部屋','へや'],['を'],['用意','ようい'],['している。'],
    ['新しい','あたらしい'],['本','ほん'],['を'],['選ぶ','えらぶ'],['にあたって'],['は、'],
    ['表紙','ひょうし'],['だけで'],['判断','はんだん'],['せず、'],['目次','もくじ'],['や'],['最初','さいしょ'],
    ['の'],['数','すう'],['ページにも'],['目','め'],['を'],['通す','とおす'],['ことが'],['大切','たいせつ'],['だ。'],
    ['気','き'],['になった'],['言葉','ことば'],['を'],['一つ','ひとつ'],['だけ'],['手帳','てちょう'],['に'],
    ['書いて','かいて','書く'],['おけば、'],['翌日','よくじつ'],['にその'],['言葉','ことば'],['の'],['意味','いみ'],
    ['を'],['自分','じぶん'],['で'],['思い出す','おもいだす'],['練習','れんしゅう'],['ができる。'],
  ].map(([text,reading,lemma])=>({text,...(reading?{reading}:{}),...(lemma?{lemma}:{})}));
  const value = {
    format:'bunki-personal-enrichment',version:1,collectionId:data.id,contentDigest:data.contentDigest,revision:1,
    provenance:{authorshipJa:'検証用に書いた日本語の説明。辞書からの引用ではない。',readingMethodJa:'検証用の段落に読みを付け、原文と照合した。'},
    lessons:data.lessons.map(l=>({id:l.id,contentHash:l.contentHash,
      explanationJa:'本や資料を集め、読む人が利用できるようにした施設。本文では、静かに本を選んだり読んだりする場所として描かれている。',
      grammarJa:'「動詞の辞書形＋にあたって」は、何かを始める場面を示す。ここでは、本を選ぶ際の注意を述べている。',
      usageJa:'「図書館で本を読む」「図書館から本を借りる」のように使う。',
      applicationJa:'表紙だけで決めず、目次や数ページを読んで、自分に合う本かどうかを確かめる。',
      contrastJa:'「書店」は本を売る店。「図書館」は本や資料を利用するための施設で、役割が異なる。',
      relations:[{term:'書店',reading:'しょてん',explanationJa:'本を売る店。図書館との違いは、主な役割が販売にあること。'}],segments,
    })),
  };
  value.enrichmentHash=await digest(value);
  return value;
}
