/** Small, attributed enrichment set. This is not an exhaustive kanji curriculum.
 * Readings below belong to whole example words, never an inferred kana alignment.
 * Formation accounts and invented memory cues are deliberately separate fields.
 */
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const source=(glyph,id)=>({title:`漢字ペディア · ${glyph}`,url:`https://www.kanjipedia.jp/kanji/${id}`,publisher:'日本漢字能力検定協会 / 角川新字源'});

export const KANJI_FAMILIES=freeze([
 {
  id:'sei-ao',phonetic:'青',readingHint:'セイ',
  explanation:{
   en:'The cited dictionary identifies 青 as a sound component in these characters. These example words share せい. Other readings exist: a family is a clue, and each word still has its own reading.',
   ja:'漢字ペディアでは、これらの字の青を音符としています。下の語では「せい」と読みます。ほかの読みもあるので、音のつながりを手がかりに、語ごとの読みを覚えましょう。'
  },
  members:[
   {glyph:'清',term:'清潔',reading:'せいけつ',meaning:'cleanliness',semantic:'氵'},
   {glyph:'晴',term:'晴天',reading:'せいてん',meaning:'clear weather',semantic:'日'},
   {glyph:'精',term:'精神',reading:'せいしん',meaning:'mind; spirit',semantic:'米'},
   {glyph:'請',term:'請求',reading:'せいきゅう',meaning:'request; claim',semantic:'言'}
  ],
  sources:[source('清','0003887800'),source('晴','0003900400'),source('精','0003915000'),source('請','0003928300')],
  provenance:{kind:'dictionary-formation-accounts',accessed:'2026-11-08',scope:'Four selected members. No historical-form reconstruction or complete reading rule.'}
 },
 {
  id:'shiki-shoku',phonetic:'戠',readingHint:'ショク・シキ',
  explanation:{
   en:'The existing Bunki family graph connects 職, 識 and 織 through the sound component 戠, with dictionary evidence for each connection. Notice しょく in 職業 and しき in 知識 and 組織. The left component helps distinguish the forms; it does not by itself define the word.',
   ja:'Bunkiの出典付きの字族データでは、職・識・織を音符「戠」で結んでいます。職業の「しょく」、知識・組織の「しき」に注目しましょう。左側の部品は字形を見分ける手がかりですが、それだけで語の意味が決まるわけではありません。'
  },
  members:[
   {glyph:'職',term:'職業',reading:'しょくぎょう',meaning:'occupation',semantic:'耳'},
   {glyph:'識',term:'知識',reading:'ちしき',meaning:'knowledge',semantic:'言'},
   {glyph:'織',term:'組織',reading:'そしき',meaning:'organization; structure',semantic:'糸'}
  ],
  sources:[source('職','0003558300'),source('識','0002903800'),source('織','0003557300')],
  provenance:{kind:'retained-bunki-family',repository:'AmitabhainArunachala/Bunki-app',commit:'5c4d9fef079dfa85f369e01dc7025adba5f03bf4',path:'prototypes/corridor/data/share_alike/kanji-family.json',scope:'Reuses the existing attributed family and exact example readings; no geometry or corpus sentences copied.'}
 }
]);

/** Visual comparison descriptions, not historical formation accounts. */
export const KANJI_CONTRASTS=freeze([
 {glyphs:['末','未'],distinction:{en:'末 has the longer upper horizontal line; 未 has the longer second horizontal line.',ja:'末は上の横画が長く、未は二本目の横画が長い字です。'},words:[['末','週末','しゅうまつ'],['未','未来','みらい']]},
 {glyphs:['土','士'],distinction:{en:'土 has the longer lower horizontal line; 士 has the longer upper horizontal line.',ja:'土は下の横画が長く、士は上の横画が長い字です。'},words:[['土','土地','とち'],['士','武士','ぶし']]},
 {glyphs:['日','目'],distinction:{en:'日 has one inner horizontal line; 目 has two.',ja:'日には内側の横画が一本、目には二本あります。'},words:[['日','休日','きゅうじつ'],['目','目的','もくてき']]},
 {glyphs:['持','待'],distinction:{en:'持 has 扌 on the left; 待 has 彳. Both contain 寺.',ja:'持の左側は扌、待の左側は彳です。右側はどちらも寺です。'},words:[['持','維持','いじ'],['待','期待','きたい']]},
 {glyphs:['清','晴'],distinction:{en:'清 has 氵 on the left; 晴 has 日. Both contain 青.',ja:'清の左側は氵、晴の左側は日です。右側はどちらも青です。'},words:[['清','清潔','せいけつ'],['晴','晴天','せいてん']]},
 {glyphs:['職','識'],distinction:{en:'職 has 耳 on the left; 識 has 言. Both contain 戠.',ja:'職の左側は耳、識の左側は言です。右側はどちらも戠です。'},words:[['職','職業','しょくぎょう'],['識','知識','ちしき']]},
 {glyphs:['識','織'],distinction:{en:'識 has 言 on the left; 織 has 糸. Both contain 戠.',ja:'識の左側は言、織の左側は糸です。右側はどちらも戠です。'},words:[['識','知識','ちしき'],['織','組織','そしき']]}
]);

export const KANJI_MEMORY_CUES=freeze({
 晴:{kind:'invented',text:{en:'Picture the sun 日 breaking into a blue 青 sky. Use the picture to recover 晴, then say 晴天（せいてん）. This is an invented memory cue.',ja:'日が青い空に現れる場面を思い浮かべ、晴を思い出してから「晴天（せいてん）」と言ってみましょう。これは学習用に作ったイメージです。'}},
 織:{kind:'invented',text:{en:'Imagine threads 糸 woven into the fabric of an organization 組織（そしき）. This invented cue is for remembering; the cited formation account is in Sound family.',ja:'糸で組織（そしき）のつながりを織り上げる場面を思い浮かべましょう。これは学習用のイメージです。字の成り立ちの出典は「音のつながり」にあります。'}}
});
