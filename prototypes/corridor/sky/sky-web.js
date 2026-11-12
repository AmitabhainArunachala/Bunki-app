/* 宙 — a word opened: the constellation.
 * A word opens into its own characters. Each character says what it means and what it is made of, and gathers
 * only the words that carry it, with that character marked in each. Words linked by meaning carry the stored
 * note that says how. Nothing arrives or leaves on a timer: the family stays until the learner lets go.
 * Every relation shown is stored in the app's data or is a plain equality over stored fields. */
(function () {
  'use strict';
  const T = window.BunkiSky.tools, clamp = T.clamp, lerp = T.lerp, spring = T.spring, smooth = T.smooth;
  const pl = (n, one, many) => n + ' ' + (n === 1 ? one : many);   // "1 character", "2 characters"
  const HAN = /[㐀-鿿豈-﫿]/;
  const TXT = {
    ja: { sky: '宙', lensStar: '星：漢字は星、部首の家族は星座、言葉は星と星を結ぶ線', hintStar: '星に触れると、その字の言葉が灯る　・　ドラッグで回す　・　スクロールで近づく', hintStarTouch: '星に触れると、その字の言葉が灯る　・　なぞって回す　・　ピンチで近づく', starOwn: '金の線はあなたの言葉', starLit: (ch, n, all) => ch + ' の言葉 ' + (n < all ? n + ' / ' + all + '　・　星にもう一度触れると続きが出る' : all) + '　・　言葉に触れると読める、もう一度で線を飛ぶ', sayStar: (ch, m, n) => ch + '、' + m + '、言葉 ' + n, sayAlong: (w, ch) => w + '：' + ch + ' の星へ', starFar: '星座の全体を見る', starNear: '近くへ戻る', open: 'ページを開く', more: (n) => 'ほか ' + n, hint: 'ドラッグで見回す　・　スクロールで奥へ　・　言葉に触れると開く', hintOver: '輪に触れると、そこへ降りる。横に引くと回り、縦に引くと傾く。', hintOverTouch: '輪に触れると降りる。横になぞると回り、縦で傾く。', lensMean: '部：部首の家族（部首は多くの場合、字の意味の手がかり）', hubMean: ['部首の家族', '多くの場合、字の意味の手がかり'], headLegend: '筆書きの一字は、その字が最初の漢字である言葉の見出し', famFly: 'スクロールで奥の字へ　・　ドラッグで回す', famChars: (c) => c + '字', famCount: (c, w, s) => 'これらの字をもつ言葉 ' + w + '語' + (s ? '　·　うち ' + s + '語がここに立つ' : ''), carriers: (c) => 'この部品をもつ字 ' + c + '字', door: (k, n) => n + '字のうち ' + k + '字　·　家族をすべて見る', doorAll: (n) => '全' + n + '字　·　家族をすべて見る', doorPart: (k, n) => n + '字のうち ' + k + '字　·　すべて見る', doorShort: (n) => '全' + n + '字', radOf: (r, name, n) => '部首 ' + r + (name ? '（' + name + '）' : '') + '　·　' + n + '字　·　家族をすべて見る', radLone: (r, name) => '部首 ' + r + (name ? '（' + name + '）' : '') + '　·　この部首の字はこの一字', isRad: (n) => 'この字は部首　·　' + n + '字　·　家族をすべて見る', place: '宙のその場所へ', noLevel: '級なし', seeFamily: '家族をすべて見る', sayFamily: (name, n) => name + '：' + n + '字。家族をすべて見る', sayOpenFam: (name, n) => name + ' の家族を開いた。' + n + '字。', overNames: '縁の名前に触れると、その部首の家族がすべて見える。', asRad: (name, n) => '部首「' + name + '」として ' + n + '字　·　家族をすべて見る', moonOrFlesh: 'つき、または にくづき（体）', ownLegend: 'いちばん大きな言葉はあなたの言葉。いつもそばにある', pathLegend: '赤い糸は、開いた言葉の道', overLegend: '赤い線は、立っていた場所と、そこから見えていた範囲。', legendParts: 'この字の部品', legendOwn: 'この字をもつ言葉と、同じ部品をもつ字', legendEx: '例文の言葉', legendCarry: 'この部品をもつ字', skyLabel: '言葉の宙。Tab で見えている言葉へ進む。', reach: '見えているもの', reachOver: '降りる場所', sayOpen: (w, parts, n) => w + ' を開いた。' + (parts ? '字：' + parts + '。' : '') + (n ? 'つながる言葉 ' + n + '。' : ''), sayBack: '宙へ戻った。', sayDown: (w) => w + ' のあたりへ降りる', hintTouch: 'なぞって見回す　・　指を広げて奥へ　・　言葉に触れると開く', hintTurn: 'ドラッグで回す　・　宙か空に触れると放す', over: '上から見る', down: '中へ降りる', front: '正面へ戻る', lensForm: '形：字の家族の順', gram: '文法を見上げる', gramWords: 'この例文の言葉', ctxMore: '次の文', seenIn: '出典', lensSound: '音：よみの順', lensRead: '読：出会った文章ごと', out: 'この字は字の表にまだありません', both: (p) => 'どちらも「' + p + '」をもつ', sound: '音', rad: '部首', homo: '同じ音', legendCord: 'この言葉の字', legendFam: '同じ字をもつ言葉', legendSem: '意味のつながり', legendTurn: 'ドラッグで回す', words: (n) => n + ' 語', strokes: (n) => n + ' 画', back: '宙へ戻る',
      rel: { syn: '類義', ant: '対義', reg: '語感', fam: '同族', col: '共起', thm: '主題' } },
    en: { sky: '宙', lensStar: '星: every kanji is a star, a constellation is a radical family, a word is the line between its stars', hintStar: 'Touch a star and its words light up　・　drag to turn　・　scroll to come nearer', hintStarTouch: 'Touch a star and its words light up　・　drag to turn　・　pinch to come nearer', starOwn: 'gold lines are your own words', starLit: (ch, n, all) => (n < all ? n + ' of ' + all + ' words with ' + ch + '　・　touch the star again for more' : all + (all === 1 ? ' word with ' : ' words with ') + ch) + '　・　touch a word to read it, again to fly along it', sayStar: (ch, m, n) => ch + ': ' + m + ', ' + n + (n === 1 ? ' word' : ' words'), sayAlong: (w, ch) => w + ': to the star ' + ch, starFar: 'See all the constellations', starNear: 'Come back near', open: 'Open the page', more: (n) => n + ' more', hint: 'Drag to look around　・　scroll to go deeper　・　touch a word to open it', hintOver: 'Touch the ring to come down there. Drag sideways to turn it, up or down to tilt it.', hintOverTouch: 'Touch the ring to come down. Drag sideways to turn it, up or down to tilt it.', lensMean: 'Radical families: the radical usually hints at the meaning', hubMean: ['Radical families', 'the radical usually hints at the meaning'], headLegend: 'a brush-written character heads the words whose first kanji it is', famFly: 'scroll to fly in among them　・　drag to turn', famChars: (c) => pl(c, 'character', 'characters'), famCount: (c, w, s) => pl(w, 'word uses', 'words use') + (c === 1 ? ' it' : ' one of them') + (s ? '　·　' + s + (s === 1 ? ' begins' : ' begin') + ' here' : ''), carriers: (c) => pl(c, 'character carries', 'characters carry') + ' this part', door: (k, n) => k + ' of ' + n + '　·　see the whole family', doorAll: (n) => 'all ' + n + ' characters　·　see the whole family', doorPart: (k, n) => k + ' of ' + n + '　·　see all', doorShort: (n) => 'all ' + n, radOf: (r, name, n) => 'radical ' + r + (name ? ' ' + name : '') + '　·　' + pl(n, 'character', 'characters') + '　·　see the whole family', radLone: (r, name) => 'radical ' + r + (name ? ' ' + name : '') + '　·　the only character of its radical', isRad: (n) => 'this character is a radical　·　' + pl(n, 'character', 'characters') + '　·　see the whole family', place: 'Go to its place in the sky', noLevel: 'no level', seeFamily: 'see the whole family', sayFamily: (name, n) => name + ': ' + pl(n, 'character', 'characters') + '. See the whole family', sayOpenFam: (name, n) => 'Opened the family of ' + name + '. ' + pl(n, 'character', 'characters') + '.', overNames: 'Touch a name on the rim to see its whole family.', asRad: (name, n) => 'as the radical ' + name + ': ' + pl(n, 'character', 'characters') + '　·　see the whole family', moonOrFlesh: 'moon, or flesh written 月', ownLegend: 'the largest words are your own and stay near you', pathLegend: 'the red thread joins the words you opened', overLegend: 'The red lines show where you stood and what you saw from there.', legendParts: 'the parts of this character', legendOwn: 'words that carry it, and characters that share a part', legendEx: 'words in its examples', legendCarry: 'characters that carry this part', skyLabel: 'The sky of words. Tab reaches the words in view.', reach: 'In view', reachOver: 'Places to come down', sayOpen: (w, parts, n) => 'Opened ' + w + '. ' + (parts ? 'Characters: ' + parts + '. ' : '') + (n ? pl(n, 'related word', 'related words') + ' shown.' : ''), sayBack: 'Back in the sky.', sayDown: (w) => 'Come down near ' + w, hintTouch: 'Drag to look around　・　spread two fingers to go deeper　・　touch a word', hintTurn: 'Drag to turn it　・　touch 宙 or the sky to let go', over: 'See it from above', down: 'Come down', front: 'Face front again', lensForm: 'Form: by families of characters', gram: 'Look up at the grammar', gramWords: 'words in these examples', ctxMore: 'next sentence', seenIn: 'from', lensSound: 'Sound: by reading', lensRead: 'Read: by the article each word comes from', out: 'This character is not in the character table yet', both: (p) => 'Both carry ' + p, sound: 'sound', rad: 'radical', homo: 'same sound', legendCord: 'the characters of this word', legendFam: 'words that carry the same character', legendSem: 'linked by meaning', legendTurn: 'drag to turn it', words: (n) => n + ' words', strokes: (n) => n + ' strokes', back: 'Back to the sky',
      rel: { syn: 'near in meaning', ant: 'opposite', reg: 'same sense, other tone', fam: 'same family', col: 'goes with', thm: 'same theme' } },
  };
  const REL_ORDER = { syn: 0, ant: 1, reg: 2, col: 3, fam: 4, thm: 5 };

  window.BunkiSky.css(`
  .ui { font-feature-settings: 'palt'; }
  .cap { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform, opacity; text-align: center; white-space: nowrap; color: var(--sky-text); pointer-events: none; opacity: 0; }
  .cap .rd { font-size: 15px; letter-spacing: 0.14em; opacity: 0.86; }
  .cap .rd.small { font-size: 12.5px; letter-spacing: 0.1em; margin-top: 3px; opacity: 0.78; }
  .cap .gl { font-family: 'Noto Serif', 'Shippori Mincho B1', serif; font-style: italic; font-size: 16px; letter-spacing: 0.01em; opacity: 0.92; }
  .cap.hub { width: 224px; white-space: normal; line-height: 1.5; }
  .cap.hub.side { text-align: left; width: 200px; }
  .cap.hub .kw { font-family: 'Noto Serif', serif; font-style: italic; font-size: 15px; }
  .cap.hub .yo { font-size: 12px; letter-spacing: 0.08em; opacity: 0.78; }
  .cap.hub .pt { font-size: 12.5px; margin-top: 3px; opacity: 0.96; }
  .cap.hub .pt b { font-family: 'Yuji Syuku', 'Shippori Mincho B1', serif; font-weight: 400; font-size: 17px; color: var(--sky-mark); margin-right: 3px; }
  .cap.hub .pt i { font-family: 'Noto Serif', serif; font-size: 12px; opacity: 0.85; }
  .cap.hub .pt .plus { opacity: 0.5; margin: 0 5px; }
  .tag { display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; padding: 0 4px 0 5px; margin-right: 5px; border: 1px solid currentColor; border-radius: 2px; color: var(--sky-mark); line-height: 15px; vertical-align: 1px; opacity: 0.9; }
  .cap.hub .kin { font-size: 12px; margin-top: 4px; }
  .cap.hub .kin button, .cap .act { pointer-events: auto; cursor: pointer; font: inherit; color: inherit; background: none; border: 0; padding: 0 2px; }
  .cap.hub .kin button { font-family: 'Yuji Syuku', 'Shippori Mincho B1', serif; font-size: 17px; margin: 0 1px; border-bottom: 1px solid transparent; }
  .cap.hub .kin button:hover { color: var(--sky-mark); border-bottom-color: currentColor; }
  .cap .act { margin-top: 12px; font-size: 13px; letter-spacing: 0.1em; padding: 6px 15px 7px; border: 1px solid color-mix(in srgb, var(--sky-text) 46%, transparent); border-radius: 2px; background: color-mix(in srgb, var(--sky-deep) 55%, transparent); transition: background 160ms, border-color 160ms, color 160ms; }
  .cap .act:hover, .cap .act:focus-visible { background: var(--sky-text); color: var(--sky-deep); border-color: var(--sky-text); outline: none; }
  .cap.note { font-size: 11.5px; line-height: 1.45; max-width: 148px; white-space: normal; }
  .cap.count { font-size: 12px; letter-spacing: 0.08em; opacity: 0.82; }
  .cap.note .nt { font-family: 'Noto Serif', serif; font-style: italic; opacity: 0.86; }
  .cap.bond { font-size: 12px; letter-spacing: 0.06em; color: var(--sky-mark); }
  .cap .door { margin-top: 5px; font-size: 12px; letter-spacing: 0.05em; white-space: nowrap; }
  .cap .door button { pointer-events: auto; cursor: pointer; font: inherit; color: var(--sky-mark); background: none; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--sky-mark) 55%, transparent); padding: 1px 2px 2px; }
  .cap .door button:hover { color: var(--sky-text); border-bottom-color: currentColor; }
  .cap .door button:focus-visible { outline: 2px solid var(--sky-mark); outline-offset: 3px; border-radius: 2px; }
  .cap.fam { white-space: normal; width: min(92vw, 640px); line-height: 1.5; text-shadow: 0 0 8px var(--sky-deep), 0 0 2px var(--sky-deep); }
  .cap.fam .ttl b { font-family: 'Yuji Syuku', 'Shippori Mincho B1', serif; font-weight: 400; font-size: 34px; letter-spacing: 0.1em; margin-right: 12px; vertical-align: -3px; }
  .cap.fam .ttl .nm { font-size: 15px; letter-spacing: 0.08em; opacity: 0.94; }
  .cap.fam .ttl .nm.it { font-family: 'Noto Serif', 'Shippori Mincho B1', serif; font-style: italic; font-size: 16px; letter-spacing: 0.02em; }
  .cap.fam .cnt { font-size: 12.5px; letter-spacing: 0.06em; opacity: 0.88; margin-top: 2px; }
  .cap.fam .door { margin-top: 3px; white-space: normal; }
  @media (pointer: coarse) { .cap .door button { padding: 8px 8px 9px; } }
  @media (max-width: 719px) { .cap.fam .ttl b { font-size: 28px; } .cap.fam .cnt { font-size: 11.5px; } }
  .tip.plate .rd, .tip.plate .gl { background: color-mix(in srgb, var(--sky-deep) 92%, transparent); padding: 2px 8px 3px; border-radius: 2px; }
  .cap.more button { pointer-events: auto; cursor: pointer; font: inherit; font-size: 12px; letter-spacing: 0.08em; color: var(--sky-text); background: none; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--sky-text) 40%, transparent); padding: 1px 2px; opacity: 0.8; }
  .cap.more button:hover { opacity: 1; color: var(--sky-mark); border-bottom-color: currentColor; }
  .cap .cx { margin: 13px auto 0; width: 430px; white-space: normal; font-size: 14.5px; line-height: 1.62; letter-spacing: 0.03em; }
  .cap .cx b { color: var(--sky-mark); font-weight: 800; }
  .cap .cx .en { display: block; font-family: 'Noto Serif', serif; font-style: italic; font-size: 12.5px; letter-spacing: 0; opacity: 0.8; }
  .cap .cx .src { display: block; margin-top: 3px; font-size: 11px; letter-spacing: 0.06em; opacity: 0.66; }
  .cap .cx button { pointer-events: auto; cursor: pointer; font: inherit; font-size: 11px; color: inherit; background: none; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--sky-text) 40%, transparent); padding: 0 1px; margin-left: 8px; opacity: 0.8; }
  .cap .cx button:hover { opacity: 1; color: var(--sky-mark); }
  .cap.gram { width: 560px; white-space: normal; line-height: 1.6; }
  .cap.gram .fm { font-size: 13px; letter-spacing: 0.04em; opacity: 0.88; margin-top: 2px; }
  .cap.gram .exj { font-size: 15.5px; margin-top: 12px; letter-spacing: 0.03em; }
  .cap.gram .exe { font-family: 'Noto Serif', serif; font-style: italic; font-size: 13px; opacity: 0.8; }
  .cap.gram .exj b { color: var(--sky-mark); font-weight: 800; }
  @media (max-width: 719px) { .cap .cx { display: none; } .cap.gram { width: 300px; } .cap.gram .exj { font-size: 14px; } }
  .tip { position: absolute; left: 0; top: 0; pointer-events: none; text-align: center; white-space: nowrap; opacity: 0; transition: opacity 140ms; color: var(--sky-text); }
  .tip .rd { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); font-size: 13px; letter-spacing: 0.12em; }
  .tip .gl { position: absolute; left: 50%; top: 0; transform: translateX(-50%); font-family: 'Noto Serif', serif; font-style: italic; font-size: 13.5px; }
  .trail { position: absolute; left: 26px; top: 58px; display: flex; align-items: center; gap: 2px; pointer-events: auto; font-size: 14px; opacity: 0; transition: opacity 240ms; }
  .trail.on { opacity: 1; }
  .trail button { font: inherit; color: var(--sky-text); background: none; border: 0; padding: 4px 6px; cursor: pointer; opacity: 0.66; letter-spacing: 0.04em; }
  .trail button:hover, .trail button[aria-current] { opacity: 1; }
  .trail button[aria-current] { color: var(--sky-mark); }
  .trail .sep { width: 18px; height: 1px; background: var(--sky-cord); opacity: 0.8; }
  .trail .knot { width: 7px; height: 7px; border-radius: 50%; background: var(--sky-cord); margin-right: 2px; }
  .hint { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--sky-foot, 0px) + 13px); font-size: 12.5px; letter-spacing: 0.14em; white-space: nowrap; opacity: 0; transition: opacity 600ms; color: var(--sky-ink); pointer-events: none; text-shadow: 0 0 7px var(--sky-paper), 0 0 2px var(--sky-paper); }
  .hint.on { opacity: 0.86; }
  .hint { white-space: pre; text-align: center; line-height: 1.75; }
  .hint.line { letter-spacing: 0.07em; }
  .hint.top { bottom: auto; top: 60px; left: 30px; transform: none; text-align: left; white-space: normal; width: 232px; line-height: 1.75; letter-spacing: 0.08em; color: var(--sky-text); text-shadow: 0 0 8px var(--sky-deep), 0 0 3px var(--sky-deep); }
  .legend { position: absolute; left: 30px; top: 98px; display: flex; flex-direction: column; gap: 5px; letter-spacing: 0.06em; font-size: 11.5px; white-space: nowrap; opacity: 0; transition: opacity 600ms; color: var(--sky-text); pointer-events: none; }
  .legend.on { opacity: 0.72; }
  .legend span { display: inline-flex; align-items: center; gap: 8px; opacity: 0; }
  .legend i { display: inline-block; width: 26px; height: 0; border-top: 2px solid var(--sky-cord); }
  .legend i.f { border-top: 1px solid var(--sky-line); }
  .legend i.s { border-top: 1px dashed var(--sky-text); opacity: 0.8; }
  .legend i.t { border: 0; height: auto; font-style: normal; text-align: center; font-size: 13px; line-height: 1; }
  .legend i.o { box-sizing: border-box; width: 13px; height: 13px; margin: 0 6px 0 7px; border: 1px solid var(--sky-line); border-radius: 50%; }
  .reach, .say { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .reach button { pointer-events: auto; }
  .ring { position: absolute; left: 0; top: 0; border: 2px solid var(--sky-mark); border-radius: 3px; box-shadow: 0 0 0 2px color-mix(in srgb, var(--sky-deep) 72%, transparent); opacity: 0; pointer-events: none; }
  .tools { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 9px; pointer-events: auto; }
  .tools .gap { height: 10px; }
  .tools.away { opacity: 0; pointer-events: none; }
  .tools button { position: relative; width: 34px; height: 34px; padding: 0; font: 400 17px/1 'Yuji Syuku', 'Shippori Mincho B1', serif; color: var(--sky-text); background: color-mix(in srgb, var(--sky-deep) 95%, transparent); border: 1px solid color-mix(in srgb, var(--sky-text) 46%, transparent); border-radius: 3px; cursor: pointer; transition: background 160ms, color 160ms, border-color 160ms, opacity 240ms; }
  .tools button:hover { border-color: var(--sky-text); }
  .tools button[aria-pressed='true'] { background: var(--sky-text); color: var(--sky-deep); border-color: var(--sky-text); }
  .tools button[hidden] { display: none; }
  .tools button.front { position: absolute; left: 0; top: calc(100% + 9px); }   /* the way back stands under the column, outside its flow: when it comes or goes no other seal changes place */
  .tools button.front[hidden] { display: block; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 240ms, visibility 0s 240ms; }
  .tools button:active { transform: scale(0.96); }
  .tools button::after { content: attr(data-tip); position: absolute; right: calc(100% + 10px); top: 50%; transform: translateY(-50%); white-space: nowrap; font: 500 12px/1 'Shippori Mincho B1', serif; letter-spacing: 0.06em; color: var(--sky-ink); background: var(--sky-paper); padding: 7px 10px 8px; border-radius: 2px; box-shadow: 0 1px 0 color-mix(in srgb, var(--sky-ink) 22%, transparent); opacity: 0; pointer-events: none; transition: opacity 140ms cubic-bezier(0.23, 1, 0.32, 1); }
  @media (hover: hover) and (pointer: fine) { .tools button:hover::after { opacity: 1; } }
  .tools button:focus-visible::after { opacity: 1; }
  .tools button:focus-visible { outline: 2px solid var(--sky-mark); outline-offset: 2px; }
  @media (pointer: coarse) { .tools { gap: 6px; } .tools button { width: 44px; height: 44px; font-size: 19px; } }
  @media (max-width: 719px) { .cap.hub { width: 172px; line-height: 1.38; } .cap.hub .yo { display: none; } .cap.hub .kw { font-size: 14px; } .cap.hub .pt { font-size: 11.5px; margin-top: 1px; } .cap.hub .pt b { font-size: 15px; } .cap.hub .kin { font-size: 11px; margin-top: 2px; } .cap.hub .kin button { font-size: 15px; }
    .cap.hub.tight { width: 112px; } .cap.hub.tight .kin, .cap.hub.tight .plus ~ i:nth-of-type(n+3) { display: none; } .cap.note.wrap { width: 172px; white-space: normal; } .cap .gl { font-size: 15px; } .cap .act { margin-top: 8px; padding: 5px 13px 6px; font-size: 12.5px; } .legend { display: none; } }
  @media (max-width: 700px) { .tools { right: 8px; } .hint { font-size: 11px; letter-spacing: 0.04em; white-space: normal; width: 92%; text-align: center; line-height: 1.5; } .hint.top { left: 14px; top: 58px; width: 190px; text-align: left; } .legend { left: 14px; top: 84px; font-size: 10.5px; } .trail { left: 12px; top: 52px; font-size: 13px; } }
  `);

  window.BunkiSkyWeb = function (api, opt) {
    const { S, wrap, ui } = api, W = api.W, L = TXT[opt.lang === 'ja' ? 'ja' : 'en'];
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const web = W.web = { taken: new Set(), items: new Map(), leaving: [], lines: [], linesOut: [], caps: [], cur: null, trail: [], page: 0, walk: [] };
    const tip = el('div', 'tip'); tip.append(el('div', 'rd'), el('div', 'gl')); ui.append(tip);
    const trailEl = el('nav', 'trail'); ui.append(trailEl);
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; const HINT = coarse ? L.hintTouch : L.hint;
    const hint = el('div', 'hint', HINT); ui.append(hint);
    const legend = el('div', 'legend'); ui.append(legend); let legendRows = [];
    /* the legend is built for what is open and lists only the kinds of line that are on the screen */
    function buildLegend(kind, lines) {
      legend.textContent = ''; legendRows = []; const has = (k) => lines.some((l) => l.kind === k), rows = [];
      if (has('cord')) rows.push(['', 'cord', kind === 'k' ? L.legendParts : L.legendCord]);
      if (has('fam')) rows.push(['f', 'fam', kind === 'k' ? L.legendOwn : kind === 'g' ? L.legendEx : kind === 'p' ? L.legendCarry : L.legendFam]);
      if (has('sem')) rows.push(['s', 'sem', L.legendSem]);
      if (S.W >= 720) rows.push(['t', 'turn', kind === 'r' || kind === 'p' ? L.famFly : L.legendTurn]);
      for (const [c, k, t] of rows) { const s = el('span'); s.append(el('i', c, c === 't' ? '⟲' : null), document.createTextNode(t)); legend.append(s); legendRows.push({ k, node: s }); }
    }
    /* reach: the words in view, and the pieces of an opened word, are real buttons for the keyboard and for a screen
     * reader. They are not drawn (the sky draws them); the one that holds the focus carries a ring, at once. */
    wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', L.skyLabel); api.canvas.setAttribute('aria-hidden', 'true');
    const reach = el('div', 'reach'); reach.setAttribute('role', 'group'); reach.setAttribute('aria-label', L.reach); ui.append(reach);
    const ring = el('div', 'ring'); ui.append(ring);
    const say = el('div', 'say'); say.setAttribute('aria-live', 'polite'); ui.append(say);
    let reachSig = '', focused = null;
    const wordLabel = (i) => { const w = W.D.words[i]; return w[0] + (W.rd[i] ? '、' + W.rd[i] : '') + (w[2] ? ': ' + w[2] : ''); };
    function setReach(list, label) {
      const sig = label + '#' + list.map((x) => x.key).join('|'); if (sig === reachSig) return; const had = !!focused; if (focused && focused.blur) focused.blur(); reachSig = sig; focused = null; W.kbFocus = false; ring.style.opacity = '0'; reach.textContent = ''; reach.setAttribute('aria-label', label);   // (the entry that held the focus is told it has lost it: its button is about to be removed and would never say so itself)
      for (const x of list) { const b = el('button', '', x.label); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); x.act(); }); b.addEventListener('focus', () => { focused = x; W.kbFocus = true; if (x.focus) x.focus(); }); b.addEventListener('blur', () => { if (x.blur) x.blur(); if (focused === x) { focused = null; W.kbFocus = false; ring.style.opacity = '0'; } }); reach.append(b); }
      if (had && reach.firstChild) reach.firstChild.focus();
    }
    function refreshReach(force) {
      if (!W.ready) return;
      if (web.cur) { const order = { centre: 0, hub: 1, fam: 2, own: 2, sem: 3, homo: 4, kin: 5, ring: 5 }, its = [...web.items.values()].filter((it) => it.kind !== 'a' && it.kind !== 'l' && !(it.kind === 'x')).sort((a, b) => order[a.role] - order[b.role] || (a.delay - b.delay));
        setReach(its.map((it) => ({ key: it.key + ':' + it.role, label: it.kind === 'w' ? wordLabel(it.id) : it.kind === 'k' ? W.D.kanji[it.id][0] + ': ' + W.D.kanji[it.id][1] : it.kind === 'g' ? it.text : it.kind === 'r' ? it.text + ': ' + L.seeFamily : it.text + (W.D.parts[it.id] ? ': ' + (W.D.parts[it.id][2] || W.D.parts[it.id][1] || '') : ''), act: () => web.tap({ t: 'i', item: it }), pos: () => (web.items.get(it.key) === it && it.born ? { x: it.x.x, y: it.y.x, w: it.w || it.s.x, h: it.s.x * 1.24 } : null) })), L.reach); return; }
      if (focused && !force) return;   // the list never changes under the focus (letting a family go is the one exception: the focus moves to the nearest word)
      if (W.tgt && W.tgt.ov > 0.5 && W.lens === 'mean' && W.mOrder) {   // the radical groups from above: each realm is a place to come down; each group that carries a sign is a door to its whole family. The wheel turns to bring the one in focus to the top, where its name always shows
        const mo = W.mOrder, fresh = (b) => (b && b.f >= S.frame - 1 ? b : null), list = mo.realms.filter((rm) => rm.th0 != null).map((rm) => ({ key: 'realm' + rm.i, label: L.sayDown(rm.mark + ' ' + rm.name), act: () => { const g0 = mo.live.find((g) => g.realm === rm.i); W.cam.aTo = g0 ? g0.mid : rm.th0; W.setOver(false); }, focus: () => { W.cam.aTo = rm.mid; }, pos: () => fresh(rm.box) }));
        for (const g of mo.groups) if (g.big && g.words.length && !g.none) list.push({ key: 'grp' + g.i, label: L.sayFamily(g.label + ' ' + g.name, g.chars.length), act: () => web.openFamily(g.i), focus: () => { W.cam.aTo = g.mid; W.overFocus = g.i; }, blur: () => { if (W.overFocus === g.i) W.overFocus = -1; }, pos: () => fresh(g.box) });
        setReach(list, L.reachOver); return; }
      if (W.tgt && W.tgt.ov > 0.5) { setReach(W.sectors().filter((s) => s.name !== '…').map((s) => ({ key: 'sec' + s.name, label: L.sayDown(s.name + (s.sub ? ' ' + s.sub : '')), act: () => { W.cam.aTo = s.th; W.setOver(false); }, pos: () => null })), L.reachOver); return; }
      if (W.lens === 'star' && W.star && W.star.ok) { const st = W.star, list = [];   // among the stars: the words of the touched star, then the largest stars in view, then the constellations named in view
        for (const h of st.wHits.slice(0, 16)) list.push({ key: 'sw' + h.wi, label: wordLabel(h.wi), act: () => web.tap({ t: 'sw', i: h.wi, k: h.k }), pos: () => { const q = st.wHits.find((z) => z.wi === h.wi); return q ? { x: q.x, y: q.y, w: q.w, h: q.h } : null; } });
        for (const k of st.hits.slice().sort((a, b) => st.cs[b] - st.cs[a]).slice(0, 14)) list.push({ key: 's' + k, label: L.sayStar(W.D.kanji[k][0], W.D.kanji[k][1] || '', (st.words[k] || []).length), act: () => web.tap({ t: 's', i: k }), pos: () => (st.ss[k] > 0 ? { x: st.sx[k], y: st.sy[k], w: Math.max(14, st.cs[k]) * 1.1, h: Math.max(14, st.cs[k]) * 1.24 } : null) });
        for (const h of st.nHits.slice(0, 10)) { const c = st.cons[h.ci]; list.push({ key: 'sc' + h.ci, label: L.sayFamily(c.label + ' ' + c.name, c.n), act: () => W.starFrame(h.ci), pos: () => { const q = st.nHits.find((z) => z.ci === h.ci); return q ? { x: q.x, y: q.y, w: q.w, h: q.h } : null; } }); }
        if (W.river && W.river.ok) for (const h of W.river.hits.slice().sort((a, b) => b.h - a.h).slice(0, 8)) { const w = W.river.w[h.i]; list.push({ key: 'kw' + h.i, label: w[0] + (w[1] ? ', ' + w[1] : ''), act: () => web.tap({ t: 'kw', i: h.i }), pos: () => { const q = W.river.hits.find((z) => z.i === h.i); return q ? { x: q.x, y: q.y, w: q.w, h: q.h } : null; } }); }   // and the largest words of the river of kana that are written in view
        setReach(list, L.reach); return; }
      const top = W.hits.slice().sort((a, b) => W.vis[b * 5 + 2] - W.vis[a * 5 + 2]).slice(0, 14);
      const list = top.map((i) => ({ key: 'w' + i, label: wordLabel(i), act: () => open('w', i), pos: () => (W.visAt[i] >= S.frame - 1 ? { x: W.vis[i * 5], y: W.vis[i * 5 + 1], w: W.vis[i * 5 + 4], h: W.vis[i * 5 + 2] * 1.3 } : null) }));
      if (W.lens === 'mean' && W.mOrder && W.sHits) for (const h of W.sHits) { if (h.gi == null || !h.on || !h.big || h.nd || list.some((x) => x.key === 'sign' + h.gi)) continue; const g = W.mOrder.groups[h.gi];   // the names of the radical groups on the horizon: each a door to its whole family
        list.push({ key: 'sign' + g.i, label: L.sayFamily(g.label + ' ' + g.name, g.chars.length), act: () => open('r', g.i), focus: () => { W.signFocus = g.i; }, blur: () => { if (W.signFocus === g.i) W.signFocus = -1; }, pos: () => { const q = W.sHits.find((z) => z.gi === g.i); return q ? { x: q.x, y: q.y + q.b / 2, w: q.w, h: q.s * 1.5 + q.b } : null; } }); }
      if (W.lens === 'mean' && W.hHits) for (const h of W.hHits.filter((x) => x.on).sort((a, b) => b.s - a.s).slice(0, 6)) { const k = W.D.kanji[h.k];   // the largest heads in view: each a door to its character
        list.push({ key: 'head' + h.k, label: k[0] + ': ' + k[1], act: () => open('k', h.k), pos: () => { const q = W.hHits.find((z) => z.k === h.k); return q ? { x: q.x, y: q.y, w: q.s * 1.1, h: q.s * 1.24 } : null; } }); }
      setReach(list, L.reach);
    }
    let hinted = false, marginKey = '', starSeen = false;
    W.onTouch = () => { hinted = true; };
    /* the line on the paper margin: first how to move; after the first touch, what the present order is, that the
     * words in gold are his own, and what the red thread is. From above it stands at the top left with the red lines
     * explained. Each arrives only when the thing it speaks of is on the screen. */
    const GLYPH = { star: '星', form: '形', sound: '音', read: '読', mean: '部' };
    /* why a line exists, in one line of type: the word, its reading, its gloss, and its make-up from the first sense of each of its kanji */
    const whyLine = (wi) => {   // what a word is made of, said truly: how each kanji is read in it (the checked reading table, sky-stars.json readIn), never a sum of dictionary meanings; a word read as a whole or written for its sound says so
      const D = W.D, w = D.words[wi], ja = opt.lang === 'ja', gl = (W.glossFix && W.glossFix[wi]) || w[2], head = w[0] + '　' + (W.rd[wi] || w[1] || '') + (gl ? '　' + gl : ''), ri = W.readIn && W.readIn[wi];
      if (!ri) return head;
      const kind = ri[0], pcs = ri[1] || [];
      if (kind === 'word' || pcs.some((x) => x[2] === 'whole')) return head + '　·　' + (ja ? '全体でひとつの読み（熟字訓）' : 'read as a whole');
      if (kind === 'sound') return head + '　·　' + (ja ? '音を借りた書き方（当て字）' : 'written for its sound');
      if (pcs.length >= 2 && (kind === 'on' || kind === 'kun' || kind === 'mixed')) return head + '　·　' + pcs.map((x) => x[0] + ' ' + String(x[1]).replace('.', '')).join(' ＋ ');
      return head; };
    /* a word of the river of kana: the word and what it means (its reading is the word itself) */
    const kanaLine = (i) => { const w = W.river && W.river.w[i]; return w ? w[0] + (w[1] ? '　' + w[1] : '') + '　·　' + (opt.lang === 'ja' ? '天の川 · 仮名で書く言葉' : 'the river of kana · written in kana only') : ''; };
    function margin() {
      const over = S.view ? S.view.over : 0, above = W.tgt && W.tgt.ov > 0.5, wide = S.W >= 720; let text = '', cls = '';
      if (web.cur) text = '';
      else if (W.lens === 'star' && W.star && W.star.ok) { const st = W.star; if (st.kk > 0.9 && W.fonts && st.fzS < 0.25) {   // the stars: one short line that says what a touch does, until he has touched a star in this visit; with a star touched, what its lines are; with a line touched, what that word is made of
          if (st.sel >= 0 && st.why >= 0) { text = whyLine(st.why); cls = 'line'; } else if (st.sel >= 0) { const cn = W.starCount(); text = L.starLit(W.D.kanji[st.sel][0], cn[0], cn[1]); cls = 'line'; } else if (st.word >= 0) { text = whyLine(st.word); cls = 'line'; } else if (W.river && W.river.sel >= 0) { text = kanaLine(W.river.sel); cls = 'line'; } else if (!starSeen && !hinted) {   /* (the line that says how to move leaves at his first drag, scroll, key or touch and does not come back in this visit: he has acted) */ text = coarse ? L.hintStarTouch : L.hintStar; cls = 'line'; } } }
      else if (above) { if (over > 0.84) { text = (coarse || !wide ? L.hintOverTouch : L.hintOver) + (W.lens === 'mean' ? ' ' + L.overNames : '') + (wide ? ' ' + L.overLegend : ''); cls = 'top'; } }
      else if (over < 0.12 && W.fieldAlpha && W.fieldAlpha() > 0.9 && S.view.fwd[1] > -0.2 && S.view.fwd[1] < 0.05 && Math.abs(S.view.eye[1]) < 130) {   // only while the paper margin is what lies at the foot of the view
        /* from the first moment: what the order is and which words are his; until the first touch, also how to move */
        let line = GLYPH[W.lens] + '　' + W.lensCaption(W.lens).replace(/^.[：:]\s*/, ''); if (wide) { if (W.lens === 'mean' && S.W >= 1500) line += '　・　' + L.headLegend; line += '　・　' + L.ownLegend; if (web.walk.length > 1) line += '　・　' + L.pathLegend; }
        if (!hinted) { text = wide ? HINT + '\n' + line : HINT; } else { text = line; cls = 'line'; }
      }
      const key = cls + '|' + text; if (key === marginKey) return; marginKey = key;
      if (text) { hint.textContent = text; hint.className = 'hint on' + (cls ? ' ' + cls : ''); } else hint.classList.remove('on');
    }
    /* seals on the right edge: the orders of the sky, the view from above, the way back to the front */
    const tools = el('div', 'tools'); ui.append(tools);
    const seal = (glyph, tip, fn) => { const b = el('button', '', glyph); b.type = 'button'; b.dataset.tip = tip; b.setAttribute('aria-label', tip); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); tools.append(b); return b; };
    const lensBtn = {}; if (W.setLens) { lensBtn.star = seal('星', L.lensStar, () => W.setLens('star')); lensBtn.star.hidden = true; lensBtn.form = seal('形', L.lensForm, () => W.setLens('form')); lensBtn.sound = seal('音', L.lensSound, () => W.setLens('sound')); lensBtn.mean = seal('部', L.lensMean, () => W.setLens('mean')); lensBtn.read = seal('読', L.lensRead, () => W.setLens('read')); (lensBtn[W.lens] || lensBtn.form).setAttribute('aria-pressed', 'true'); lensBtn.sound.hidden = true; lensBtn.mean.hidden = true; lensBtn.read.hidden = true; tools.append(el('div', 'gap')); }
    W.lensCaption = (name) => ({ star: L.lensStar, form: L.lensForm, sound: L.lensSound, read: L.lensRead, mean: L.lensMean })[name] || '';
    W.hubLines = (name) => (name === 'mean' ? L.hubMean : null);   // the same caption in two short lines, for the hub of the chart
    const overBtn = W.setOver ? seal('俯', L.over, () => W.setOver(W.lens === 'star' && W.star && W.star.ok ? !W.star.far : !(W.tgt.ov > 0.5))) : null;
    const frontBtn = W.resetView ? seal('正', L.front, () => W.resetView()) : null; if (frontBtn) { frontBtn.classList.add('front'); frontBtn.hidden = true; }
    W.onOver = (on) => { if (overBtn) { const inStar = W.lens === 'star' && W.star && W.star.ok; overBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); overBtn.dataset.tip = inStar ? (on ? L.starNear : L.starFar) : on ? L.down : L.over; overBtn.setAttribute('aria-label', overBtn.dataset.tip); } };
    let gramBtn = null; W.onContext = () => { if (!gramBtn && W.gram && W.gram.length) { gramBtn = seal('文', L.gram, () => W.lookUp()); tools.insertBefore(gramBtn, overBtn); gramBtn.hidden = W.lens === 'star'; } };   // (the grammar stands in the sky of the other orders; among the stars its seal is put away)
    if (W.gram && W.gram.length) W.onContext();
    W.onLens = (name) => { for (const k of Object.keys(lensBtn)) lensBtn[k].setAttribute('aria-pressed', k === name ? 'true' : 'false'); if (gramBtn) gramBtn.hidden = name === 'star'; if (W.onOver && W.tgt) W.onOver(name === 'star' ? !!(W.star && W.star.far) : W.tgt.ov > 0.5); if (!web.cur) drawTrail(); reachSig = ''; };
    W.onStar = () => { if (!web.cur) drawTrail(); reachSig = ''; if (W.star.sel >= 0) { starSeen = true; const k = W.D.kanji[W.star.sel]; say.textContent = L.sayStar(k[0], k[1] || '', (W.star.words[W.star.sel] || []).length); hinted = true; } };
    W.lensReady = (name) => { if (lensBtn[name]) lensBtn[name].hidden = false; };

    /* ---------------------------------------------------------------- data helpers */
    let partKanji = null;
    web.onData = () => { const D = W.D; partKanji = Array.from({ length: D.parts.length }, () => []); D.kanji.forEach((k, ki) => { for (const p of k[5]) partKanji[p].push(ki); if (k[6] >= 0 && !k[5].includes(k[6])) partKanji[k[6]].push(ki); }); for (const a of partKanji) a.sort((x, y) => D.kanji[y][9] - D.kanji[x][9]); };
    if (W.D) web.onData();
    const scaleU = () => clamp(Math.min(S.W / 1728, S.H / 1084), 0.5, 1.14);
    const centreXY = () => (S.W < 720 ? [S.W / 2, Math.max(150, S.H * 0.2)] : [S.W / 2, S.H * 0.44]);
    const kun = (s) => String(s).replace('.', '·');

    /* ---------------------------------------------------------------- building a constellation */
    const HUBS = { 1: [[-335, 0]], 2: [[-345, 0], [345, 0]], 3: [[-405, 36], [0, -236], [405, 36]], 4: [[-435, 54], [-152, -238], [152, -238], [435, 54]] };
    const DIRS = { 1: [Math.PI], 2: [Math.PI, 0], 3: [Math.PI, -Math.PI / 2, 0], 4: [Math.PI - 0.12, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42, 0.12] };
    const TOP = [[0, -306], [-178, -258], [178, -258], [-318, -160], [318, -160]];   // on an arc: the lines run out like rays and never cross, each note has its own room, and nothing reaches into a character's family
    const BOT = [[0, 344], [-182, 290], [182, 290], [-322, 212], [322, 212]];   // the same arc below, clear of the sentence under the word
    /* places for a character's family, nearest first; they keep clear of the note under the character */
    /* (the outer places stand on rays that pass between the inner ones, so no line to an outer word runs through an inner word) */
    const SIDE = [[182, -14, 25], [152, -98, 25], [178, 76, 25], [304, -99, 20], [316, 53, 20], [222, -230, 20], [256, 193, 20], [112, -208, 20], [142, 226, 20]];
    const UPW = [[0, -142, 24], [-104, -118, 22], [104, -118, 22], [-214, -92, 20], [214, -92, 20]];
    function fanSlots(hx, hy, dir, up) { return up ? UPW.map(([x, y, sz]) => [hx + x, hy + y, sz]) : SIDE.map(([x, y, sz]) => [hx + (Math.cos(dir) < 0 ? -x : x), hy + y, sz]); }
    /* an opened family is a thing in space: each piece has its own depth, and the hand can turn the whole of it */
    const DZ = { centre: 0, hub: -70, fam: 70, sem: 120, homo: 130, kin: 140, own: 95 };
    const rot = { yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, toYaw: 0, toPitch: 0 };
    web.turn = (dx, dy) => { const ly = fam.on ? 0.17 : 0.52, lp = fam.on ? 0.09 : 0.32; rot.toYaw = clamp(rot.toYaw + dx * (fam.on ? 0.0016 : 0.0046), -ly, ly); rot.toPitch = clamp(rot.toPitch - dy * (fam.on ? 0.0012 : 0.0036), -lp, lp); };   // (a whole family is deep: a small turn already carries its near rows far past its far ones, and no character leaves the screen)
    web.turnEnd = () => {};
    const mk = (o) => Object.assign({ x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, s: { x: 0, v: 0 }, a: { x: 0, v: 0 }, delay: 0, depth: 600, marks: null, w: 0, h: 0, born: false, zz: 0 }, o);
    function build(kind, id) {
      const D = W.D, items = [], lines = [], caps = [], used = new Set();
      const add = (o) => { const it = mk(o); it.dz = o.dz != null ? o.dz : (DZ[it.role] || 0) + (it.role === 'fam' && it.size <= 21 ? 85 : 0); items.push(it); if (it.kind === 'w') used.add(it.id); return it; };
      const wordMarks = (wi, ch) => { const out = []; Array.from(D.words[wi][0]).forEach((c, n) => { if (c === ch) out.push(n); }); return out; };
      if (kind === 'w') {
        const w = D.words[id], chars = Array.from(w[0]), hubsCh = []; for (const c of chars) if (HAN.test(c) && !hubsCh.includes(c)) hubsCh.push(c);
        const n = clamp(hubsCh.length, 1, 4), cs = chars.length <= 3 ? 70 : chars.length === 4 ? 58 : 46;
        const centre = add({ key: 'w' + id, kind: 'w', id, text: w[0], font: 'w', role: 'centre', tx: 0, ty: 0, size: cs, depth: 520 });
        caps.push({ of: centre, dy: -cs * 0.60 - 26, cls: 'cap', wait: 0.34, build: (n2) => n2.append(el('div', 'rd', W.rd[id])) });
        caps.push({ of: centre, dy: cs * 0.60 + 8, cls: 'cap', wait: 0.46, build: (n2) => { if (w[2]) n2.append(el('div', 'gl', w[2])); if (canOpen('w', id)) { const b = el('button', 'act', L.open + '  →'); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); openPage('w', id); }); n2.append(b); } sentenceBlock(n2, id); } });
        /* linked by meaning: the stored relation and its note */
        const sem = (W.sem.get(id) || []).slice().sort((a, b) => REL_ORDER[a.rel] - REL_ORDER[b.rel]).slice(0, 5), semSlots = n >= 3 ? BOT : TOP;
        sem.forEach((e, q) => { const it = add({ key: 'w' + e.w, kind: 'w', id: e.w, text: D.words[e.w][0], font: 'w', role: 'sem', q, tx: semSlots[q][0], ty: semSlots[q][1], size: 24, depth: 640, delay: 0.62 + q * 0.05, from: centre });
          lines.push({ a: centre, b: it, kind: 'sem', delay: 0.60 + q * 0.05 });
          caps.push({ of: it, dy: semSlots === TOP ? -27 : 27, up: semSlots === TOP, cls: 'cap note', wait: 0.9 + q * 0.05, build: (n2) => { n2.append(el('span', 'tag', L.rel[e.rel])); if (e.note) n2.append(el('span', 'nt', e.note)); } }); });   // above the word when the word stands above: its line arrives from below and never crosses the note
        /* its characters, each with its own family */
        const hubItems = [];
        hubsCh.slice(0, 4).forEach((ch, h) => { const ki = W.byKanji.get(ch), [hx, hy] = HUBS[n][h], dir = DIRS[n][h], up = Math.abs(Math.sin(dir)) > 0.6, hs = [98, 98, 84, 76][n - 1];
          const hub = add({ key: (ki != null ? 'k' + ki : 'x' + ch), kind: ki != null ? 'k' : 'x', id: ki != null ? ki : ch, text: ch, font: 'k', role: 'hub', tx: hx, ty: hy, size: hs, depth: 470, delay: 0.24 + h * 0.07, glyph: { of: centre, at: chars.indexOf(ch) - (chars.length - 1) / 2 } }); hubItems.push(hub);
          lines.push({ a: centre, b: hub, kind: 'cord', delay: 0.24 + h * 0.07 });
          if (ki == null) { caps.push({ of: hub, dy: hs * 0.58 + 4, cls: 'cap hub', wait: 0.62 + h * 0.07, build: (n2) => n2.append(el('div', 'yo', L.out)) }); return; }
          caps.push(up ? { of: hub, dx: hs * 0.60 + 6, dy: -hs * 0.46, left: true, cls: 'cap hub side', wait: 0.62 + h * 0.07, build: (n2) => hubCaption(n2, ki) } : { of: hub, dy: hs * 0.58 + 2, cls: 'cap hub', wait: 0.62 + h * 0.07, build: (n2) => hubCaption(n2, ki) });
          const fam = W.fam[ki].filter((wi) => wi !== id && !used.has(wi)), slots = fanSlots(hx, hy, dir, up), shown = fam.slice(0, slots.length);
          shown.forEach((wi, q) => { const it = add({ key: 'w' + wi, kind: 'w', id: wi, text: D.words[wi][0], font: 'w', role: 'fam', q, tx: slots[q][0], ty: slots[q][1], size: slots[q][2], depth: 610, marks: wordMarks(wi, ch), delay: 0.52 + h * 0.06 + q * 0.04, from: hub });
            lines.push({ a: hub, b: it, kind: 'fam', delay: 0.50 + h * 0.06 + q * 0.04 }); });
          if (fam.length > shown.length) { const r = 392, pin = add({ key: 'a' + h, kind: 'a', id: h, text: '', font: 'w', role: 'fam', tx: hx + (up ? 300 : Math.cos(dir) * r), ty: hy + (up ? -150 : Math.sin(dir) * r - 8), size: 12, depth: 610, delay: 0.9 }); caps.push({ of: pin, dy: -8, cls: 'cap more', build: (n2) => { const b = el('button', '', L.more(fam.length - shown.length)); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); open('k', ki); }); n2.append(b); } }); } });
        /* two characters of one word that share a meaning part: say so */
        for (let a = 0; a < hubItems.length; a += 1) for (let b = a + 1; b < hubItems.length; b += 1) { const A = hubItems[a], B = hubItems[b]; if (A.kind !== 'k' || B.kind !== 'k') continue; const ro = W.radicalOrder(), gi = ro.groupOfK[A.id]; if (gi !== ro.groupOfK[B.id] || ro.groups[gi].none) continue; const ca = W.radForm(A.id), cb = W.radForm(B.id);   // (the same radical group, each in the form the character carries)
          lines.push({ a: A, b: B, kind: 'bond', delay: 0.5, bow: -150 }); centre.bondTop = cs * 0.60 + 112; const g = opt.lang === 'ja' ? ro.groups[gi].nameJa : ro.groups[gi].gloss; caps.push({ of: centre, dy: -cs * 0.60 - 96, cls: 'cap bond', build: (n2) => n2.append(document.createTextNode(L.both(ca === cb ? ca : ca + ' ・ ' + cb) + (g ? '　·　' + g : ''))) }); }
        /* the same sound, another word */
        if (n <= 2) { const homo = (W.rd[id] ? W.byReading.get(W.rd[id]) || [] : []).filter((wi) => wi !== id && !used.has(wi)).slice(0, 3);
          homo.forEach((wi, q) => { const it = add({ key: 'w' + wi, kind: 'w', id: wi, text: D.words[wi][0], font: 'w', role: 'homo', tx: BOT[q][0], ty: BOT[q][1] + 26 + (W.ctx && W.ctx.wordSent && W.ctx.wordSent[id] ? 78 : 0), size: 21, depth: 660, delay: 0.78 + q * 0.05, from: centre });
            lines.push({ a: centre, b: it, kind: 'homo', delay: 0.76 + q * 0.05 });
            caps.push({ of: it, dy: 25, cls: 'cap note', build: (n2) => { n2.append(el('span', 'tag', L.homo)); if (D.words[wi][2]) n2.append(el('span', 'nt', D.words[wi][2])); } }); }); }
      } else if (kind === 'k') {
        const k = D.kanji[id], ro = W.radicalOrder(), grp = ro.groups[ro.groupOfK[id]], rpI = W.radPart[id], thin = S.W < 720, ja = opt.lang === 'ja', lone = grp.chars.length < 2;
        /* one radical, one name, one door. The stored part that is this character's radical stands for it: 月 beside a flesh character is the flesh radical,
         * 肉 beside a moon character is the moon. A second stored part that is the same radical is left out. The radical is drawn in the form the character carries. */
        const isRadP = (p) => !grp.none && (p === rpI || (grp.key === '肉' && D.parts[p][0] === '月') || (grp.key === '月' && D.parts[p][0] === '肉')), radP = k[5].find(isRadP), parts = k[5].filter((p) => p === radP || !isRadP(p)).slice(0, 4), n = parts.length;
        const form = W.radForm(id), rName = ja ? grp.nameJa + (grp.hintJa ? '（' + grp.hintJa + '）' : '') : grp.gloss;
        const ownDoor = radP == null && !grp.none;   // its radical is not among the parts shown beside it (or it is a radical itself): the door to the whole family stands under the character
        const ownRows = !ownDoor ? 0 : lone && grp.words.length ? 2 : 1;
        const centre = add({ key: 'k' + id, kind: 'k', id, text: k[0], font: 'k', role: 'centre', tx: 0, ty: -4, size: 132, depth: 520, capH: 58 + (canOpen('k', id) ? 46 : 0) + ownRows * 26 });
        caps.push({ of: centre, dy: 132 * 0.56 + 2, cls: 'cap', build: (n2) => { n2.append(el('div', 'gl', k[1] + (k[4] ? '  ·  ' + L.strokes(k[4]) : ''))); n2.append(el('div', 'rd small', [k[2].slice(0, 3).join('・'), k[3].slice(0, 2).map(kun).join('・')].filter(Boolean).join('　'))); if (ownDoor && lone) { n2.append(el('div', 'door', L.radLone(form, thin ? '' : rName))); if (grp.words.length) n2.append(doorRow(L.place, () => { W.goRadical(grp.i); close(); })); }   // (a radical with one character has no family to show: its place in the sky instead)
          else if (ownDoor) n2.append(doorRow(thin ? L.rad + ' ' + form + '　·　' + L.doorShort(grp.chars.length) : form === k[0] ? L.isRad(grp.chars.length) : L.radOf(form, rName, grp.chars.length), () => open('r', grp.i))); if (canOpen('k', id)) { const b = el('button', 'act', L.open + '  →'); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); openPage('k', id); }); n2.append(b); } } });
        const famAll = W.fam[id], page = web.page % Math.max(1, Math.ceil(famAll.length / 10)), mine = famAll.slice(page * 10, page * 10 + 10), slots = TOP.concat(BOT);
        mine.forEach((wi, q) => { const it = add({ key: 'w' + wi, kind: 'w', id: wi, text: D.words[wi][0], font: 'w', role: 'own', q, tx: slots[q][0] * 1.06, ty: slots[q][1] + (q < 5 ? -16 : 40), size: 25, depth: 610, marks: wordMarks(wi, k[0]), delay: 0.40 + q * 0.04, from: centre });
          lines.push({ a: centre, b: it, kind: 'fam', delay: 0.38 + q * 0.04 }); });
        if (famAll.length > 10) caps.push({ of: centre, dx: 0, dy: mine.length > 5 ? 428 : 132 * 0.56 + 62 + (canOpen('k', id) ? 46 : 0) + ownRows * 26, cls: 'cap more', wait: 0.9, build: (n2) => { const b = el('button', '', L.words(famAll.length) + '  ·  ' + (page + 1) + ' / ' + Math.ceil(famAll.length / 10) + '  →'); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); web.page += 1; open('k', id, true); }); n2.append(b); } });
        parts.forEach((p, h) => { const part = D.parts[p], isRad = p === radP, asK = isRad ? -1 : part[3], [hx, hy] = (n === 1 ? [[-470, 0]] : n === 2 ? [[-470, 0], [470, 0]] : n === 3 ? [[-480, -150], [480, -30], [-480, 180]] : [[-480, -150], [480, -150], [-480, 180], [480, 180]])[h], out = hx < 0 ? -1 : 1;
          /* beside its radical stand characters of that radical's group (the ones written with the same form first); beside any other part, characters that carry the part. Where more exist than are shown, the count says so and a door leads to all of them */
          const pool = isRad ? grp.chars.filter((x) => W.radPart[x] === rpI).concat(grp.chars.filter((x) => W.radPart[x] !== rpI)) : partKanji[p] || [], spare = pool.filter((x) => x !== id && !items.some((it) => it.kind === 'k' && it.id === x)), sib = spare.slice(0, n >= 3 ? 3 : 4), all = pool.length, shown = sib.length + (pool.includes(id) ? 1 : 0);   // (the count of those shown includes the opened character where it is one of them)
          const hub = add({ key: asK >= 0 ? 'k' + asK : isRad ? 'r' + grp.i : 'p' + p, kind: asK >= 0 ? 'k' : isRad ? 'r' : 'p', id: asK >= 0 ? asK : isRad ? grp.i : p, text: isRad ? form : part[0], sayAs: isRad ? rName : ja ? part[1] || part[2] || '' : part[2] || part[1] || '', font: 'k', role: 'hub', tx: hx, ty: hy, size: 66, depth: 470, delay: 0.24 + h * 0.07, glyph: { of: centre, at: 0, k: 0.5 } });
          lines.push({ a: centre, b: hub, kind: 'cord', delay: 0.24 + h * 0.07 });
          caps.push({ of: hub, dy: 66 * 0.58 + 2, cls: 'cap hub', wait: 0.62 + h * 0.07, build: (n2) => { const row = el('div', 'pt'); if (p === k[6]) row.append(el('span', 'tag', L.sound + ' ' + k[7])); if (isRad) row.append(el('span', 'tag', L.rad)); row.append(el('i', '', hub.sayAs)); n2.append(row);
            if (isRad) { if (!lone) n2.append(doorRow(thin ? L.doorShort(all) : sib.length ? L.door(shown, all) : L.doorAll(all), () => open('r', grp.i))); } else if (spare.length > (thin ? 0 : sib.length)) n2.append(doorRow(thin ? L.doorShort(all) : L.doorPart(shown, all), () => open('p', p))); } });
          sib.forEach((x, q) => { const ang = [78, 46, 14, 110][q] * Math.PI / 180, it = add({ key: 'k' + x, kind: 'k', id: x, text: D.kanji[x][0], font: 'k', role: 'kin', tx: hx + out * Math.sin(ang) * 190, ty: hy - Math.cos(ang) * 168, size: 38, depth: 640, delay: 0.56 + h * 0.06 + q * 0.045, from: hub });
            lines.push({ a: hub, b: it, kind: 'fam', delay: 0.54 + h * 0.06 + q * 0.045 }); }); });
      } else if (kind === 'g') {
        const g = W.gramById.get(id), len = Array.from(g.p).length, cs = len <= 5 ? 62 : len <= 9 ? 46 : 34;
        const centre = add({ key: 'g' + id, kind: 'g', id, text: g.p, font: 'w', role: 'centre', tx: 0, ty: -150, size: cs, depth: 520, capH: 150 });
        caps.push({ of: centre, dy: -cs * 0.6 - 28, cls: 'cap', build: (n2) => { n2.append(el('span', 'tag', g.lvName)); n2.append(el('span', 'gl', opt.lang === 'ja' && g.mJa ? g.mJa : g.mEn)); } });
        caps.push({ of: centre, dy: cs * 0.6 + 6, cls: 'cap gram', build: (n2) => { if (g.form) n2.append(el('div', 'fm', g.form)); for (const ex of g.ex.slice(0, 2)) { const row = el('div', 'exj'), linked = g.words.slice(0, 8).map((wi) => D.words[wi][0]).filter((w2) => ex[0].includes(w2)).sort((a, b) => b.length - a.length); let rest = ex[0];   // the words the lines lead to are marked where they stand in the sentence
            while (rest) { let at = -1, hit = ''; for (const w2 of linked) { const k = rest.indexOf(w2); if (k >= 0 && (at < 0 || k < at)) { at = k; hit = w2; } } if (at < 0) { row.append(document.createTextNode(rest)); break; } if (at > 0) row.append(document.createTextNode(rest.slice(0, at))); row.append(el('b', '', hit)); rest = rest.slice(at + hit.length); }
            n2.append(row); if (ex[1]) n2.append(el('div', 'exe', ex[1])); } } });
        g.words.slice(0, 8).forEach((wi, q) => { const x = (q - (Math.min(8, g.words.length) - 1) / 2) * 150, it = add({ key: 'w' + wi, kind: 'w', id: wi, text: D.words[wi][0], font: 'w', role: 'own', q, tx: x, ty: 250 + (q % 2) * 46, size: 23, depth: 610, delay: 0.14 + q * 0.04 }); lines.push({ a: centre, b: it, kind: 'fam', delay: 0.1 + q * 0.04, under: true }); });
      } else return family(kind, id, add, items, lines, caps);
      if (S.W < 720 && kind !== 'g') return narrow(kind, { kind, id, items, lines, caps });
      /* a line between a character and one of its words bends round any other word that stands in its way */
      { const boxes = items.filter((it) => it.kind !== 'a').map((it) => ({ it, x: it.tx, y: it.ty, hw: (it.kind === 'w' || it.kind === 'g' ? Array.from(it.text).length * it.size * 0.52 : it.size * 0.56) + 7, hh: it.size * 0.62 + 6 }));
        for (const l of lines) { if (l.kind !== 'fam') continue; const A = l.a, B = l.b, x0 = A.tx, y0 = A.ty, x1 = B.tx, y1 = B.ty, len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / len, ny = (x1 - x0) / len, plain = (x1 - x0) * (y1 - y0) > 0 ? 9 : -9;
          const hits = (bend) => { const cx = (x0 + x1) / 2 + nx * bend, cy = (y0 + y1) / 2 + ny * bend; for (let q = 1; q < 14; q += 1) { const t = q / 14, mt = 1 - t, X = mt * mt * x0 + 2 * mt * t * cx + t * t * x1, Y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1; for (const b of boxes) { if (b.it === A || b.it === B) continue; if (Math.abs(X - b.x) < b.hw && Math.abs(Y - b.y) < b.hh) return true; } } return false; };
          l.bend = plain; for (const bend of [plain, -plain, 24, -24]) if (!hits(bend)) { l.bend = bend; break; } } }   // a gentle bend only: a line never loops
      if (kind === 'w' && items.filter((it) => it.role === 'hub').length === 1 && !items.some((it) => it.role === 'sem' || it.role === 'homo')) for (const it of items) it.tx += 160;
      return { kind, id, items, lines, caps };
    }
    /** A narrow screen (a phone held upright): the word at the top, its characters in a row beneath, each family
     * hanging in a column under its character. Same pieces, same rules, laid out to be read with one thumb. */
    function narrow(kind, c) {
      const U = scaleU(), P = (v) => v / U, centre = c.items.find((it) => it.role === 'centre'), hubs = c.items.filter((it) => it.role === 'hub'), n = hubs.length, drop = new Set();
      const capOf = (it) => c.caps.filter((cp) => cp.of === it);
      if (kind === 'w') {
        const cs = centre.size >= 70 ? 52 : centre.size >= 58 ? 44 : 36, HX = { 1: [0], 2: [-92, 92], 3: [-118, 0, 118], 4: [-138, -46, 46, 138] }[n] || [0], hs = [60, 60, 50, 42][Math.max(0, n - 1)], fs = [19, 19, 17, 15][Math.max(0, n - 1)], ch = n <= 2 ? 70 : 54, top = 172, col0 = top + hs * 0.58 + ch + 18;
        centre.size = P(cs); centre.tx = 0; centre.ty = 0; centre.capH = P(92);
        const cc = capOf(centre); if (cc[0]) cc[0].dy = -P(cs * 0.6 + 22); if (cc[1]) cc[1].dy = P(cs * 0.6 + 6); if (cc[2]) { cc[2].dy = P(cs * 0.6 + 76); }
        hubs.forEach((hub, h) => { hub.tx = P(HX[h]); hub.ty = P(top); hub.size = P(hs); hub.capH = P(ch + 4); hub.dz = -40; for (const cp of capOf(hub)) { cp.dy = P(hs * 0.58 + 2); cp.dx = 0; cp.left = false; cp.cls = 'cap hub' + (n >= 3 ? ' tight' : ''); } });
        for (const it of c.items) {
          if (it.kind === 'a') { const hub = hubs[it.id]; if (!hub) { drop.add(it); continue; } it.tx = hub.tx; it.ty = P(col0 + 4 * 32 + 2); it.dz = 110; }
          else if (it.role === 'fam') { if (it.q > 3) { drop.add(it); continue; } it.tx = it.from.tx; it.ty = P(col0 + it.q * 32); it.size = P(fs); it.dz = 50 + it.q * 16; }
          else if (it.role === 'sem') { if (it.q > 1) { drop.add(it); continue; } it.tx = P(it.q ? 94 : -94); it.ty = P(col0 + 4 * 32 + 58); it.size = P(19); it.dz = 100; for (const cp of capOf(it)) { cp.dy = P(15); cp.cls = 'cap note wrap'; } }
          else if (it.role === 'homo') drop.add(it);
        }
        c.fit = () => { hubs.forEach((hub, h) => { const cp = capOf(hub)[0], hgt = cp && cp.node ? cp.node.offsetHeight : ch, start = top + hs * 0.58 + hgt + 34; hub.capH = P(hgt + 10);
          for (const it of c.items) { if (it.kind === 'a' && it.id === h) it.ty = P(start + 4 * 32 + 2); else if (it.role === 'fam' && it.from === hub) it.ty = P(start + it.q * 32); } });
          const low = Math.max(...c.items.filter((it) => it.role === 'fam' || it.kind === 'a').map((it) => it.ty), P(col0)); for (const it of c.items) if (it.role === 'sem') it.ty = low + P(56); };
        c.lines = c.lines.filter((l) => l.kind === 'cord');   // under each character its words hang in a plain column: the place says the tie, no line is needed
        for (const l of c.lines) l.under = true;
      } else if (kind === 'k') {
        const HX = { 1: [0], 2: [-80, 80], 3: [-110, 0, 110], 4: [-132, -44, 44, 132] }[n] || [0], top = 214, row0 = top + 40 * 0.58 + 52 + 40;
        centre.size = P(96); centre.tx = 0; centre.ty = 0; let cc = capOf(centre); if (!cc[1] && W.fam[c.id] && W.fam[c.id].length) { const cnt = W.fam[c.id].length; c.caps.push({ of: centre, dy: 0, cls: 'cap count', wait: 0.9, build: (n2) => n2.append(document.createTextNode(L.words(cnt))) }); cc = capOf(centre); }
        if (cc[0]) cc[0].dy = P(96 * 0.56 + 2); if (cc[1]) cc[1].dy = P(row0 - 30);
        hubs.forEach((hub, h) => { hub.tx = P(HX[h]); hub.ty = P(top); hub.size = P(40); hub.dz = -30; for (const cp of capOf(hub)) { cp.dy = P(40 * 0.58 + 2); cp.cls = 'cap hub tight'; } });
        for (const it of c.items) { if (it.role === 'kin') drop.add(it); else if (it.role === 'own') { if (it.q > 7) { drop.add(it); continue; } it.tx = P(it.q % 2 ? 84 : -84); it.ty = P(row0 + Math.floor(it.q / 2) * 34); it.size = P(19); it.dz = 70; } }
        c.lines = c.lines.filter((l) => l.kind === 'cord'); c.lines.forEach((l, q) => { l.drop = true; if (q === 0) l.span = [hubs[0], hubs[hubs.length - 1]]; }); centre.capH = P(112);
        c.fit = () => { const h0 = cc[0] && cc[0].node ? cc[0].node.offsetHeight : 92, base0 = 96 * 0.56 + 2 + h0; const top2 = base0 + 62, hubH = Math.max(40, ...hubs.map((hub) => { const cp = capOf(hub)[0]; return cp && cp.node ? cp.node.offsetHeight : 40; })), head = top2 + 40 * 0.58 + hubH + 12, row2 = head + 62; if (cc[1]) cc[1].dy = P(head); centre.capH = P(h0 + 8);
          hubs.forEach((hub) => { hub.ty = P(top2); }); for (const it of c.items) if (it.role === 'own') it.ty = P(row2 + Math.floor(it.q / 2) * 34); };
      }
      c.items = c.items.filter((it) => !drop.has(it)); c.lines = c.lines.filter((l) => !drop.has(l.a) && !drop.has(l.b)); c.caps = c.caps.filter((cp) => !drop.has(cp.of) && cp.cls !== 'cap bond');
      return c;
    }
    /** A whole family as a place in the sky. Every character of a radical group (kind 'r'), or every character that
     * carries a part (kind 'p'), stands on a field that runs away from the eye: depth is level, as it is everywhere
     * else in this sky. The commonest characters (N5) stand nearest, at the foot of the view, largest and brightest;
     * each rarer level stands farther off, smaller and fainter, up toward the family's name. A character's level is
     * that of the easiest word that carries it. The five levels always stand, an empty one as a fine rule, so the
     * same distance means the same level in every family. The sky behind is not dimmed: the moon stays lit, the
     * words of the sky fall back to points of light (the family's own a little brighter), and for a radical the eye
     * goes to the family's own place, so its pool of light and its radical written in light stand behind it.
     * Near characters carry two of their own words beneath them; the wheel flies in along the field and each row
     * gets its words as it comes near; the hand turns the field, and the near rows pass the far ones.
     * Nothing is cut: the characters shrink until every one of them stands clear, from a phone to the widest window. */
    const fam = { on: false, z: { x: 0, v: 0 }, zTo: 0, zMax: 0, lk: [0], ly: [0], pivot: 0, xc: 0, s0: 40, eye: 0 };
    /* the field's line across the screen: how low a row stands when it is seen at scale k (1 = the nearest row at rest). Rows slide along it as the eye flies in. */
    const famY = (k) => { const lk = fam.lk, ly = fam.ly, n = lk.length, x = Math.log(Math.max(k, 1e-3)); if (n < 2) return ly[0] + x * fam.s0 * 2.2; if (x >= lk[0]) return ly[0] + (x - lk[0]) / (lk[0] - lk[1]) * (ly[0] - ly[1]) * 1.15; for (let q = 1; q < n; q += 1) if (x >= lk[q]) return ly[q] + (x - lk[q]) / (lk[q - 1] - lk[q]) * (ly[q - 1] - ly[q]); return ly[n - 1] + (x - lk[n - 1]) / (lk[n - 2] - lk[n - 1]) * (ly[n - 2] - ly[n - 1]); };
    function family(kind, id, add, items, lines, caps) {
      const D = W.D, ro = W.radicalOrder(), g = kind === 'r' ? ro.groups[id] : null, part = g ? null : D.parts[id], ja = opt.lang === 'ja', U = scaleU(), [cx, cy] = centreXY(), thin = S.W < 720;
      const members = g ? g.chars : (partKanji[id] || []).slice().sort(ro.common), bands = []; for (const l of [5, 4, 3, 2, 1, 0]) { const m = members.filter((x) => ro.kLvl[x] === l); if (m.length || l > 0) bands.push({ l, m }); }
      const lvName = (l) => (l ? 'N' + l : L.noLevel), N = members.length;
      /* the family's name at the far end of the field: its forms, its name, what its numbers count, and its doors */
      const flesh = !g && part[0] === '月' ? ro.groups.find((x) => x.key === '肉') : null, rads = g ? [] : ro.groups.filter((x) => !x.none && (x.formIds.includes(id) || x === flesh));
      const head = (n2) => { const t = el('div', 'ttl'); t.append(el('b', '', g ? g.label : part[0]));
        const nm = g ? (ja ? g.nameJa + (g.hintJa ? '（' + g.hintJa + '）' : '') : [g.nameJa, g.gloss].filter(Boolean).join('  ·  ')) : flesh ? (ja ? L.moonOrFlesh : [part[1], L.moonOrFlesh].filter(Boolean).join('  ·  ')) : ja ? part[1] || part[2] || '' : [part[1], part[2]].filter(Boolean).join('  ·  ');
        t.append(el('span', ja ? 'nm' : 'nm it', nm)); n2.append(t);
        const cnt = g ? [L.famChars(N)].concat(L.famCount(N, g.carry, g.words.length).split('　·　')) : [L.carriers(N)]; if (thin) { n2.append(el('div', 'cnt', cnt.slice(0, 2).join('　·　'))); if (cnt[2]) n2.append(el('div', 'cnt', cnt[2])); } else n2.append(el('div', 'cnt', cnt.join('　·　')));   // (what each number counts; on a narrow screen the second count has a line of its own)
        if (g && g.words.length) n2.append(doorRow(L.place, () => { W.goRadical(g.i); close(); }));
        for (const x of rads) n2.append(doorRow(L.asRad(x.ch + ' ' + (ja ? x.nameJa : x.gloss), x.chars.length), () => open('r', x.i))); };
      /* the room: from under the name to just above the sea of clouds (a phone: above the app's own corner buttons), between the two sides */
      const topY = thin ? 82 : 66, footY = thin ? (S.clear || []).reduce((y, q) => (q[1] > S.H * 0.6 && q[1] - 10 < y ? q[1] - 10 : y), S.H - S.foot - 18) : Math.min(S.H - S.foot - 22, S.H * 0.855) - 30, lab = thin ? 40 : 50, hw = Math.max(60, thin ? (S.W - 24 - lab) / 2 : Math.min(cx - 46 - lab, S.W - 72 - cx)), xc = thin ? cx + lab / 2 - 2 : cx;
      const centre = add({ key: 'f' + kind + id, kind: 'a', id, text: '', font: 'k', role: 'centre', tx: 0, ty: (topY - cy) / U, size: 12, depth: 620, dz: 0 }); caps.push({ of: centre, dy: 0, cls: 'cap fam', first: true, build: head });
      const pieces = new Map(members.map((x) => [x, add({ key: 'k' + x, kind: 'k', id: x, text: D.kanji[x][0], font: 'k', role: 'ring', tx: 0, ty: 0, size: 30, depth: 620, dz: 0, fx: 0, dz0: 0, delay: 0.1, ws: ((g ? W.fam[x].filter((wi) => ro.homeK[wi] === x) : []).concat(W.fam[x])).filter((wi, q, a) => a.indexOf(wi) === q).slice(0, 2) })]));   // (beneath a character: two of its words, those that begin with it first)
      const marks = bands.map((bd, q) => add({ key: 'lv' + bd.l, kind: 'l', id: bd.l, text: lvName(bd.l), font: 'w', role: 'ring', tx: 0, ty: 0, size: 11, depth: 620, dz: 0, fx: 0, dz0: 0, delay: 0.1 + q * 0.03, empty: !bd.m.length }));
      /* the largest characters that let every row stand between the name and the foot of the view. Rows are equally many characters wide in the field's own measure, so a far row is
       * a narrow one; from row to row the scale falls by one ratio, to 15 px or two fifths at the farthest; a near row keeps room beneath it for its words */
      const lay = (headH) => { const y1 = topY + headH + (thin ? 16 : 26); let f = null;
        for (const s0 of [60, 54, 48, 44, 40, 36, 33, 30, 27, 24, 22, 20, 18]) { const cap = Math.max(3, Math.floor((2 * hw + 0.42 * s0) / (1.42 * s0))), rows = [];
          for (const bd of bands) { if (!bd.m.length) { rows.push({ l: bd.l, m: [], first: true }); continue; } const nr = Math.ceil(bd.m.length / cap), per = Math.ceil(bd.m.length / nr); for (let q = 0; q < nr; q += 1) rows.push({ l: bd.l, m: bd.m.slice(q * per, q * per + per), first: q === 0 }); }
          const R = rows.length, kf = Math.max(0.42, Math.min(0.8, 15 / s0)), r = R > 1 ? Math.max(0.8, Math.pow(kf, 1 / (R - 1))) : 1, ks = rows.map((_, q) => Math.pow(r, q)), wr = (q) => (rows[q].m.length && s0 * ks[q] >= 39 ? 0.76 * s0 * ks[q] : 0), gaps = []; let total = 0;
          for (let q = 0; q + 1 < R; q += 1) { const gp = 0.66 * s0 * (ks[q] + ks[q + 1]) + wr(q + 1) + (rows[q + 1].l !== rows[q].l ? 0.22 * s0 * ks[q] : 0); gaps.push(gp); total += gp; }
          const need = total + 0.62 * s0 + wr(0) + 0.62 * s0 * ks[R - 1]; f = { s0, cap, rows, ks, gaps, total, y0: footY - 0.62 * s0 - wr(0), slack: footY - y1 - need }; if (f.slack >= 0 || s0 === 18) break; }
        const st = f.total > 0 ? Math.min(1.45, 1 + Math.max(0, f.slack) / f.total) : 1, ys = [f.y0]; for (const gp of f.gaps) ys.push(ys[ys.length - 1] - gp * st);   // (room left over opens the rows a little; the rest stays sky, under the name)
        /* a small family: every character keeps a column of its own, so characters of different levels never stand in one line */
        const p0 = 1.42 * f.s0, small = N <= f.cap, spread = small ? Math.min(2 * hw / (N + 1), 2.6 * f.s0) : 0; let at = 0;
        f.rows.forEach((row, q) => { const c = row.m.length, off = !small && q % 2 && c < f.cap ? 0.5 * p0 : 0, dz0 = 1500 * (1 / f.ks[q] - 1); let x0 = 0;
          row.m.forEach((x, j) => { const it = pieces.get(x); it.fx = small ? (at - (N - 1) / 2) * spread : (j - (c - 1) / 2) * p0 + off; if (j === 0) x0 = it.fx; it.dz0 = dz0; it.size = f.s0 / U; it.row = q; it.delay = 0.10 + q * 0.035 + j * 0.0008; at += 1; });
          if (row.first) { const mk2 = marks[bands.findIndex((bd) => bd.l === row.l)], wide = Array.from(mk2.text).reduce((t, ch) => t + (ch.charCodeAt(0) > 0x2e7f ? 11.5 : 6), 0); mk2.dz0 = dz0; mk2.row = q; mk2.fx = c ? x0 - 0.5 * f.s0 : -0.5 * p0; mk2.mo = -(10 + wide / 2); mk2.up = xc + mk2.fx - 12 - wide < 6 ? f.s0 * 0.62 + 8 : 0; if (mk2.up) mk2.mo = wide / 2 - 0.3 * f.s0; } });   // a level's name: a fine mark at the left of its first row (where that would leave the screen: above the row's left end)
        fam.lk = f.ks.map((k) => Math.log(k)); fam.ly = ys; fam.s0 = f.s0; fam.xc = xc; fam.eye = S.py + S.F * Math.tan(W.famLift()); fam.zMax = 1500 * (1 / f.ks[f.ks.length - 1] - 1); fam.pivot = fam.zMax * 0.45; return { top: ys[ys.length - 1] - 0.62 * f.s0 * f.ks[f.ks.length - 1], y1 }; };
      const put = () => { for (const it of items) place1(it, 0, U, cx, cy); };
      lay(thin ? 132 : 148); fam.z.x = 0; fam.z.v = 0; fam.zTo = 0; put();
      return { kind, id, items, lines, caps, fam: true, count: N, fit: () => { const cp = caps[0], h = cp && cp.node ? cp.node.offsetHeight : 0; if (h) { lay(h); put(); } } };   // (laid out again once the name's true height is known: the farthest row never stands in it)
    }
    /* where a character of an opened family stands this frame: its row's depth less how far the eye has flown in, on the field's line */
    function place1(it, z, u, cx, cy) { if (it.fx == null) return; const dzz = it.dz0 - z, k = 1500 / (1500 + dzz); if (!(k > 0) || k > 2.4) { it.out = true; return; }
      const X = fam.xc + it.fx * k + (it.mo || 0), Y0 = famY(k) - (it.up || 0) * k, dx = fam.xc + it.fx * k - S.px, Y = Y0 + (Y0 - fam.eye) * dx * dx / (2 * S.F * S.F); /* (a row is an arc round the eye, as the horizon is: below eye level its ends hang a little, above it they rise) */ it.dz = dzz; it.tx = (X - cx) / (k * u); it.ty = (Y - cy) / (k * u); it.kk = k; it.out = Y0 > fam.ly[0] + 0.45 * fam.s0 || k < 0.2;   /* (a row that has come past the place of the nearest row has been passed: it leaves before it reaches the horizon) */ if (it.kind === 'l') it.size = 11 / (k * u); }
    const doorRow =(text, fn) => { const row = el('div', 'door'), b = el('button', '', text + '  →'); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); row.append(b); return row; };
    /** A sentence from the app's own reading that holds this word, as stored, with the word marked and its source named. */
    function sentenceBlock(node, id) {
      const C = W.ctx, list = C && C.wordSent ? C.wordSent[id] : null; if (!list || !list.length) return; const w = W.D.words[id][0], box = el('div', 'cx'); let at = 0;
      const marks = C.wordSentAt ? C.wordSentAt[id] : null;
      const show = () => { box.textContent = ''; const row = C.sentences[list[at]], text = row[1], m = marks && marks[at], k = m ? m[0] : text.indexOf(w), len = m ? m[1] : w.length;   // the stored place of the word, so a bent form (持って for 持つ) is marked too
        if (k < 0) box.append(document.createTextNode(text)); else box.append(document.createTextNode(text.slice(0, k)), el('b', '', text.slice(k, k + len)), document.createTextNode(text.slice(k + len)));
        if (row[2] && row[0] !== -1) box.append(el('span', 'en', row[2]));   // one source stores its English in pieces and lower case: left out rather than shown badly
        const art = row[0] >= 0 ? C.articles[row[0]] : null, src = el('span', 'src', L.seenIn + '　' + (art ? art[1] : ({ '-1': 'SNOW T15 / T23', '-2': 'Tanaka Corpus', '-3': 'ja.wikinews' })[String(row[0])] || '')); if (list.length > 1) { const b = el('button', '', (at + 1) + ' / ' + list.length + '  →'); b.type = 'button'; b.title = L.ctxMore; b.addEventListener('click', (e) => { e.stopPropagation(); at = (at + 1) % list.length; show(); }); src.append(b); } box.append(src); };
      show(); node.append(box);
    }
    function hubCaption(node, ki) {
      const D = W.D, k = D.kanji[ki];
      node.append(el('div', 'kw', k[1]));
      node.append(el('div', 'yo', [k[2].slice(0, 2).join('・'), k[3].slice(0, 1).map(kun).join('・')].filter(Boolean).join('　')));
      if (k[5].length) { const row = el('div', 'pt'); k[5].slice(0, 4).forEach((p, n) => { if (n) row.append(el('span', 'plus', '＋')); const part = D.parts[p]; row.append(el('b', '', part[0]), el('i', '', part[2] || part[1] || '')); }); node.append(row); }
      const si = W.soundOf.get(ki); if (si != null && k[6] >= 0) { const fam = D.sound[si], row = el('div', 'kin'); row.append(el('span', 'tag', L.sound + ' ' + fam[1])); for (const x of fam[2]) { if (x === ki) continue; const b = el('button', '', D.kanji[x][0]); b.type = 'button'; b.title = D.kanji[x][1]; b.addEventListener('click', (e) => { e.stopPropagation(); open('k', x); }); row.append(b); } node.append(row); }
    }

    /* ---------------------------------------------------------------- opening, moving on, letting go */
    function start(it, prev) {
      const old = prev && prev.get(it.key);
      if (old) { it.x.x = old.x.x; it.y.x = old.y.x; it.s.x = old.s.x; it.a.x = old.a.x; it.born = true; return; }
      if (it.kind === 'w' && W.visAt[it.id] >= S.frame - 2) { const o = it.id * 5; it.x.x = W.vis[o]; it.y.x = W.vis[o + 1]; it.s.x = W.vis[o + 2]; it.a.x = Math.min(1, W.vis[o + 3] + 0.2); it.born = true; }
    }
    function open(kind, id, samePlace) {
      if (!W.ready) return;
      if (kind === 'r') { const g = W.radicalOrder().groups[id]; if (!g || g.none) return;   // (the arc of words with no character, or of characters with no radical, is not a family)
        if (g.chars.length === 1) { kind = 'k'; id = g.chars[0]; }   // a family of one is its one character
        else if (g.words.length && !(web.cur && web.cur.kind === 'r' && web.cur.id === id)) W.goRadical(id); }   // a family is a place: the eye goes there, and the family opens in its own light
      const prev = web.items; if (!samePlace) { if (!(web.cur && web.cur.kind === kind && web.cur.id === id)) web.page = 0; }
      rot.toYaw = 0; rot.toPitch = 0; W.signFocus = -1; W.overFocus = -1;
      const c = build(kind, id), next = new Map(); fam.on = !!c.fam; if (c.fam) W.famG = kind === 'r' ? id : -1;
      for (const it of c.items) { start(it, prev); next.set(it.key, it); }
      for (const [key, it] of prev) if (!next.has(key)) { it.leavingAt = S.t; web.leaving.push(it); }
      for (const cap of web.caps) cap.node.remove();
      web.caps = c.caps.map((cp) => { const node = el('div', cp.cls); cp.build(node); if (cp.first) ui.insertBefore(node, reach); else ui.append(node); return Object.assign(cp, { node }); });   // (a family's name and its doors come before the list of its characters for the keyboard)
      if (c.fit) c.fit(); tools.classList.toggle('away', S.W < 720);
      for (const l of web.lines) if (!next.has(l.a.key) || !next.has(l.b.key) || next.get(l.a.key) !== l.a) web.linesOut.push(l);
      web.items = next; web.lines = c.lines.map((l) => Object.assign(l, { p: { x: 0, v: 0 } })); web.cur = { kind, id, t0: S.t };
      web.taken = new Set(); for (const it of next.values()) if (it.kind === 'w') web.taken.add(it.id); for (const it of web.leaving) if (it.kind === 'w') web.taken.add(it.id);
      web.takenG = new Set(); for (const it of next.values()) if (it.kind === 'g') web.takenG.add(it.id);
      if (kind === 'w' && web.walk[web.walk.length - 1] !== id) { web.walk.push(id); if (web.walk.length > 60) web.walk.shift(); }
      const label = kind === 'w' ? W.D.words[id][0] : kind === 'k' ? W.D.kanji[id][0] : kind === 'g' ? W.gramById.get(id).p : kind === 'r' ? W.radicalOrder().groups[id].ch : W.D.parts[id][0], at = web.trail.findIndex((t) => t.kind === kind && t.id === id);
      if (at >= 0) web.trail.length = at + 1; else web.trail.push({ kind, id, label }); if (web.trail.length > 7) web.trail.splice(0, web.trail.length - 7);
      drawTrail(); buildLegend(kind, c.lines); legend.classList.add('on'); hinted = true; setTip(null);
      for (const cp of web.caps) if (cp.of.role === 'hub' && !cp.left && S.W >= 720) cp.of.capH = cp.node.offsetHeight / scaleU() + 6;   // a line to a word below a character starts under that character's note, never through it
      refreshReach(); { const hubs = c.items.filter((it) => it.role === 'hub').map((it) => it.text + (it.sayAs ? ' ' + it.sayAs : it.kind === 'k' ? ' ' + W.D.kanji[it.id][1] : '')).join(', '), nRel = c.items.filter((it) => it.kind === 'w' && it.role !== 'centre').length; say.textContent = kind === 'r' || kind === 'p' ? L.sayOpenFam(kind === 'r' ? W.radicalOrder().groups[id].label + ' ' + W.radicalOrder().groups[id].name : label, c.count) : L.sayOpen(label + (kind === 'w' && W.D.words[id][2] ? ' (' + W.D.words[id][2] + ')' : ''), hubs, nRel); }
      if (opt.onState) opt.onState({ open: true, kind, id, label });
    }
    function close() {
      if (!web.cur) return; for (const it of web.items.values()) { it.leavingAt = S.t; it.home = true; web.leaving.push(it); }
      web.takenG = new Set(); web.items = new Map(); for (const l of web.lines) web.linesOut.push(l); web.lines = []; fam.on = false; W.signFocus = -1; W.overFocus = -1; for (const cap of web.caps) cap.node.remove(); web.caps = []; web.cur = null; web.trail = []; drawTrail(); legend.classList.remove('on'); tools.classList.remove('away');
      reachSig = ''; refreshReach(true); say.textContent = L.sayBack;
      if (opt.onState) opt.onState({ open: false });
    }
    function drawTrail() {
      trailEl.textContent = '';
      if (!web.trail.length && W.lens === 'star' && W.star && W.star.ok && (W.star.trail.length || W.star.con1 >= 0)) {   // among the stars: the stars he has touched, in order; each is one step back, the first knot lets the sky go
        const st = W.star, home = el('button', '', L.sky); home.type = 'button'; home.title = L.back; home.addEventListener('click', (e) => { e.stopPropagation(); W.starLetGo(); }); trailEl.append(el('span', 'knot'), home);
        if (st.con1 >= 0 && !st.trail.length) { trailEl.append(el('span', 'sep')); const b = el('button', '', st.cons[st.con1].label); b.type = 'button'; b.setAttribute('aria-current', 'true'); b.addEventListener('click', (e) => { e.stopPropagation(); W.starFrame(st.con1); }); trailEl.append(b); }
        st.trail.forEach((k, n) => { trailEl.append(el('span', 'sep')); const b = el('button', '', W.D.kanji[k][0]); b.type = 'button'; if (n === st.trail.length - 1) b.setAttribute('aria-current', 'true'); b.addEventListener('click', (e) => { e.stopPropagation(); W.starGo(k); }); trailEl.append(b); });
        trailEl.classList.add('on'); return; }
      if (!web.trail.length) { trailEl.classList.remove('on'); return; }
      const home = el('button', '', L.sky); home.type = 'button'; home.title = L.back; home.addEventListener('click', (e) => { e.stopPropagation(); close(); }); trailEl.append(el('span', 'knot'), home);
      web.trail.forEach((t, n) => { trailEl.append(el('span', 'sep')); const b = el('button', '', t.label); b.type = 'button'; if (n === web.trail.length - 1) b.setAttribute('aria-current', 'true'); b.addEventListener('click', (e) => { e.stopPropagation(); open(t.kind, t.id); }); trailEl.append(b); });
      trailEl.classList.add('on');
    }
    const target = (kind, id) => (kind === 'g' ? { kind: 'grammar' } : kind === 'w' ? { kind: 'word', word: W.D.words[id][0], reading: W.D.words[id][1] } : { kind: 'kanji', char: W.D.kanji[id][0] });
    function canOpen(kind, id) { if (kind !== 'w' && kind !== 'k') return false; return opt.canOpen ? !!opt.canOpen(target(kind, id)) : !!opt.onOpen; }
    function openPage(kind, id) { if (!canOpen(kind, id)) return; const D = W.D; if (opt.onOpen) opt.onOpen(kind === 'w' ? { kind: 'word', word: D.words[id][0], reading: D.words[id][1] } : { kind: 'kanji', char: D.kanji[id][0] }); }
    web.isOpen = () => !!web.cur; web.open = open; web.close = close; web.famOpen = () => !!web.cur && fam.on;
    web.openFamily = (gi) => { if (W.tgt.ov > 0.5) W.setOver(false); open('r', gi); };   // from the chart: the eye comes down at the group's place, and its whole family opens
    /* a whole family opened: the wheel (or the arrow keys) flies in along the field, as far as its farthest row */
    web.fly = (d) => { if (!web.cur || !fam.on) return false; fam.zTo = clamp(fam.zTo + d * 0.9, 0, fam.zMax); if (S.reduced) { fam.z.x = fam.zTo; fam.z.v = 0; } return true; };
    let conTap = { ci: -1, t: 0 };
    web.tap = (h) => {
      if (!h) { if (web.cur) close(); else if (W.lens === 'star' && W.star && W.star.ok) W.starLetGo(); return; }   // a touch on the empty sky lets go of what was touched
      if (h.t === 's') { if (W.star.sel === h.i && W.star.selA > 0.9) { if (!W.starMore()) open('k', h.i); } else W.starGo(h.i); return; }   // a star: it is framed with the nearest layers of its words; touched again, its next layer comes; after the last, its character opens
      if (h.t === 'sw') { if (W.starWhy(h.i)) { say.textContent = whyLine(h.i); return; }   // a lit word, first touch: it says what it is and what it is made of
        if (h.k >= 0) { say.textContent = L.sayAlong(W.D.words[h.i][0], W.D.kanji[h.k][0]); W.starAlong(h.i, h.k); } else open('w', h.i); return; }   // second touch: the eye flies along it to the star at its other end
      if (h.t === 'sc') { const now = performance.now(); if ((conTap.ci === h.i && now - conTap.t < 480) || (W.star.sel >= 0 && W.star.con[W.star.sel] === h.i)) { W.starFrame(h.i); conTap.ci = -1; } /* (with a star touched, the name of its own family is the door to its radical: one touch frames the whole figure) */ else { conTap = { ci: h.i, t: now }; W.starCon(h.i); } return; }   // the name of a constellation: it brightens; touched twice, the eye frames the whole figure
      if (h.t === 'w') { if (!web.cur && W.lens === 'star' && W.star && W.star.ok && W.starWord(h.i)) { say.textContent = whyLine(h.i); starSeen = true; return; }   // among the stars a word's first touch lights its own line, both its stars and both their families, and says what it is made of; the second opens it
        open('w', h.i); return; }
      if (h.t === 'kw') { if (W.starKana && W.starKana(h.i)) { say.textContent = kanaLine(h.i); starSeen = true; } return; }   // a word of the river of kana: it says what it means in the line at the foot, and nothing more
      if (h.t === 'g') { open('g', h.i); return; }
      if (h.t === 'r') { open('r', h.i); return; }   // the sign of a radical group
      if (h.t === 'h') { open('k', h.i); return; }   // the head of a family: its character
      if (h.t === 'i') { const it = h.item; if (it.role === 'centre') { if (it.kind === 'w' || it.kind === 'k') openPage(it.kind, it.id); return; } if (it.kind === 'x') return; open(it.kind, it.id); }
    };
    web.pick = (px, py, slop) => { let best = null; for (const it of web.items.values()) { if (it.a.x < 0.5 || it.kind === 'a' || it.kind === 'l' || it.kind === 'x' && it.role !== 'centre') continue; if (Math.abs(px - it.x.x) <= it.w / 2 + slop && Math.abs(py - it.y.x) <= it.s.x * 0.62 + slop) { if (!best || it.zz < best.zz) best = it; } } return best ? { t: 'i', item: best, id: best.key } : null; };

    /* ---------------------------------------------------------------- frame */
    web.update = (dt) => {
      if (!W.ready) return; const u = scaleU(), [cx, cy] = centreXY(), t = web.cur ? S.t - web.cur.t0 : 0, pk = 0.35 * S.F;
      const sway = S.reduced ? 0 : fam.on ? 0.22 : 1; spring(rot.yaw, rot.toYaw + sway * 0.05 * Math.sin(S.t * 0.33), 6, dt); spring(rot.pitch, rot.toPitch + sway * 0.022 * Math.sin(S.t * 0.26 + 1.1), 6, dt);
      const cyw = Math.cos(rot.yaw.x), syw = Math.sin(rot.yaw.x), cpt = Math.cos(rot.pitch.x), spt = Math.sin(rot.pitch.x), D0 = 1500;
      const famOn = fam.on && !!web.cur, pv = famOn ? fam.pivot - fam.z.x : 0; if (famOn) { if (S.reduced) { fam.z.x = fam.zTo; fam.z.v = 0; } else spring(fam.z, fam.zTo, 6, dt); }   // (a family turns about the middle of its depth, so its near rows and its far rows pass each other)
      for (const it of web.items.values()) {
        if (famOn) place1(it, fam.z.x, u, cx, cy); const flat = famOn && it.kind === 'a';   // (the family's name does not turn with its field)
        const dzr = it.dz - pv, x1 = flat ? it.tx : it.tx * cyw + dzr * syw, z1 = flat ? 0 : -it.tx * syw + dzr * cyw, y1 = flat ? it.ty : it.ty * cpt - z1 * spt, z2 = flat ? 0 : it.ty * spt + z1 * cpt + pv, k = D0 / (D0 + z2); it.zz = z2;
        const X = cx + x1 * k * u - S.parS.x.x * pk / it.depth, Y = cy + y1 * k * u + S.parS.y.x * pk / it.depth, Sz = it.kind === 'l' ? 11 : Math.max(it.size * u * k, it.role === 'centre' ? 30 : it.fx != null ? 8 : 12);
        if (!it.born) { const f = it.from, g = it.glyph; if (t < it.delay || (g && !g.of.born)) continue; it.born = true;
          if (S.reduced) { it.x.x = X; it.y.x = Y; it.s.x = Sz; }
          else if (g) { it.x.x = g.of.x.x + g.at * g.of.s.x; it.y.x = g.of.y.x; it.s.x = g.of.s.x * (g.k || 1); }   // on its own glyph inside the word
          else if (f) { it.x.x = f.x.x + (X - f.x.x) * 0.35; it.y.x = f.y.x + (Y - f.y.x) * 0.35; it.s.x = Sz * 0.9; } else { it.x.x = X; it.y.x = Y + 10; it.s.x = Sz * 0.94; } it.a.x = 0; }
        const om = it.glyph ? 6.2 : 7.5; spring(it.x, X, om, dt); spring(it.y, Y, om, dt); spring(it.s, Sz, om, dt); spring(it.a, it.out ? 0 : 1, it.out ? 10 : 6, dt); it.rest = Math.abs(it.x.v) + Math.abs(it.y.v) + Math.abs(it.s.v) < 0.6;
      }
      for (let n = web.leaving.length - 1; n >= 0; n -= 1) { const it = web.leaving[n]; let gone = false;
        if (S.reduced) { spring(it.a, 0, 14, dt); if (it.a.x < 0.03) gone = true; }
        else if (it.glyph && it.glyph.of && it.glyph.of.leavingAt) { const g = it.glyph, c = g.of; spring(it.x, c.x.x + g.at * c.s.x, 9.5, dt); spring(it.y, c.y.x, 9.5, dt); spring(it.s, c.s.x * (g.k || 1), 9.5, dt); spring(it.a, 0, 7.5, dt); if (it.a.x < 0.03) gone = true; }
        else if (it.from && it.from.leavingAt && it.kind !== 'w') { spring(it.x, it.from.x.x, 9, dt); spring(it.y, it.from.y.x, 9, dt); spring(it.a, 0, 9, dt); if (it.a.x < 0.03) gone = true; }
        else if (it.home && it.kind === 'w') { const p = W.project(it.id), on = p && p.x > -80 && p.x < S.W + 80 && p.y > -40 && p.y < S.H * S.hor; if (on) { spring(it.x, p.x, 8.2, dt); spring(it.y, p.y, 8.2, dt); spring(it.s, p.size, 8.2, dt); spring(it.a, 0.85, 5, dt); if (S.t - it.leavingAt > 0.75 && Math.abs(it.x.x - p.x) + Math.abs(it.y.x - p.y) < 2.5) gone = true; } else { spring(it.a, 0, 8, dt); spring(it.s, it.s.x * 0.9, 5, dt); if (it.a.x < 0.03) gone = true; } }
        else { spring(it.a, 0, 9, dt); if (it.a.x < 0.03) gone = true; }
        if (gone || S.t - it.leavingAt > 2.2) { web.leaving.splice(n, 1); if (it.kind === 'w' && !web.items.has(it.key)) web.taken.delete(it.id); } }
      for (const l of web.lines) spring(l.p, t >= l.delay && l.a.born && l.b.born ? 1 : 0, 5.2, dt);
      for (let n = web.linesOut.length - 1; n >= 0; n -= 1) { const l = web.linesOut[n]; spring(l.p, 0, 15, dt); if (l.p.x < 0.03) web.linesOut.splice(n, 1); }
      spring(wake.k, wake.i >= 0 && !web.cur ? 1 : 0, 8, dt); W.kinK = wake.k.x; if (wake.k.x < 0.01 && wake.i < 0) { W.kin = null; wake.lines = []; }
    };
    function edge(it, tx, ty, pad) { const dx = tx - it.x.x, dy = ty - it.y.x, hw = it.w / 2 + pad, hh = it.s.x * 0.58 + pad, k = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh, 1e-6); return k >= 1 ? [it.x.x, it.y.x] : [it.x.x + dx * k, it.y.x + dy * k]; }
    function drawItem(it) {
      if (it.kind === 'a') return;   // a pin: it only carries a note
      const pal = S.pal, D = W.D, px = it.size * scaleU() * S.dpr, rest = it.rest && !it.leavingAt;
      if (it.kind === 'l') {   // the name of a level beside its first row: a fine mark, not a legend; an empty level is a fine dashed rule, so the same distance means the same level in every family
        const sl = W.spriteFor('lv' + it.text, it.text, 'w', 11 * S.dpr, null, 1900, true), al = 0.62 * it.a.x; if (!sl) return; const bx = W.pushLabel(it.x.x, it.y.x, 11, sl, 0, pal.text, al, pal.mark, 0, 0, null, true); if (bx) it.w = bx.w - 24 * 11 / sl.px;
        if (it.empty && bx) dashed(it.x.x + it.w / 2 + 9, it.y.x, it.x.x + it.w / 2 + 9 + 170 * (it.kk || 1), it.y.x, pal.line, 0.55 * al, 1); return; }
      let sp = W.spriteFor(it.kind === 'w' ? it.id : it.key, it.text, it.font, px, it.marks, 2000 + it.size, true);
      const col = pal.text, a = it.a.x * (it.leavingAt ? 1 : it.fx != null ? lerp(1, 0.56, clamp(it.zz / 2000, 0, 1)) : lerp(1, 0.7, clamp(it.zz / 320, 0, 1)));   // (in a whole family brightness falls with depth: the common characters are the bright ones)
      if (it.ws && it.ws.length && it.s.x >= 35.5 && !it.leavingAt) { const kw = smooth(35.5, 39, it.s.x) * a, sz = clamp(it.s.x * 0.3, 11, 19);   // a near character of a whole family carries two of its own words beneath it
        it.ws.forEach((wi, j) => { const sw = W.spriteFor(wi, D.words[wi][0], 'w', sz * S.dpr, null, 300); if (sw || W.hasBase(wi)) W.pushLabel(it.x.x, it.y.x + it.s.x * 0.6 + 3 + sz * 0.66 + j * sz * 1.3, sz, sw, wi, pal.text, 0.74 * kw, pal.mark, 0, 0); }); }
      if (!sp && it.kind === 'w' && W.hasBase(it.id)) { const box = W.pushLabel(it.x.x, it.y.x, it.s.x, null, it.id, col, a, pal.mark, 0, 0); if (box) it.w = box.w - it.s.x * 0.5; return; }
      if (!sp) { it.w = Array.from(it.text).length * it.s.x; return; }
      if (it.s.x >= 15) W.pushLabel(it.x.x, it.y.x + it.s.x * 0.015, it.s.x * 1.035, sp, 0, pal.c[0], 0.66 * a, pal.c[0], 0.66 * a, 3.0);
      const box = W.pushLabel(it.x.x, it.y.x, it.s.x, sp, 0, col, a, pal.mark, a, 0, null, rest); if (box) it.w = box.w - 24 * it.s.x / sp.px; void D;
    }
    web.draw = () => {
      const pal = S.pal;
      for (const it of web.leaving) drawItem(it);
      for (const l of web.linesOut.concat(web.lines)) { if (l.p.x < 0.01) continue; const A = l.a, B = l.b, al = Math.min(A.a.x, B.a.x);
        if (l.drop) { const U2 = scaleU(), top = B.y.x - B.s.x * 0.62, by = top - 20 * U2; W.pushLine(B.x.x, by, B.x.x, top - 5 * U2, 0, 1.5, pal.cord, 0.9 * al, l.p.x);   // a narrow screen, a character: one stem, one bar, one equal drop to each part
          if (l.span) { if (l.span[0] !== l.span[1]) W.pushLine(l.span[0].x.x, by, l.span[1].x.x, by, 0, 1.5, pal.cord, 0.9 * al, l.p.x); W.pushLine(A.x.x, by - 13 * U2, A.x.x, by, 0, 1.5, pal.cord, 0.9 * al, l.p.x); } continue; }
        const pad = l.kind === 'cord' ? 10 : B.role === 'kin' ? 3 : 7; let [x0, y0] = edge(A, B.x.x, B.y.x, pad); const [x1, y1] = edge(B, A.x.x, A.y.x, pad);
        if (A.capH && B.y.x > A.y.x + A.s.x * 0.5 && (l.under || (A.role === 'centre' && A.kind !== 'w' && l.kind === 'fam') || (A.role === 'hub' && l.kind === 'fam' && B.ty > A.ty + 100))) { const ux = A.x.x + clamp((B.x.x - A.x.x) * 0.22, -70, 70), uy = A.y.x + A.s.x * 0.56 + A.capH * scaleU(); if (uy <= y1 - 8) { x0 = ux; y0 = uy; } else if (A.role !== 'hub') continue; }   // start under the notes, never through them (where a character's note is too tall for that, the line keeps its plain course)
        if (l.kind === 'cord') W.pushLine(x0, y0, x1, y1, 0, 2.3, pal.cord, 0.95 * al, l.p.x);
        else if (l.kind === 'fam') W.pushLine(x0, y0, x1, y1, l.bend != null ? l.bend * scaleU() : (x1 - x0) * (y1 - y0) > 0 ? 9 : -9, 1.1, pal.line, 0.62 * al, l.p.x);
        else if (l.kind === 'bond') W.pushLine(A.x.x, A.y.x - A.s.x * 0.62, B.x.x, B.y.x - B.s.x * 0.62, l.bow * scaleU(), 1.2, pal.mark, 0.6 * al, l.p.x);
        else { if (A.role === 'centre' && B.y.x < A.y.x - A.s.x && !A.bondTop) { x0 = A.x.x + (B.x.x - A.x.x) * 0.16; y0 = A.y.x - A.s.x * 0.6 - 50 * scaleU(); if (y0 < y1 + 10) continue; }   // a link upward starts above the reading that stands over the word
          if (A.bondTop && B.y.x < A.y.x && Math.abs(B.x.x - A.x.x) < 90 * scaleU()) { x0 = A.x.x + (B.x.x - A.x.x) * 0.3; y0 = A.y.x - A.bondTop * scaleU(); if (y0 < y1 + 10) continue; } dashed(x0, y0, x1, y1, pal.text, 0.5 * al, l.p.x); } }
      const order = [...web.items.values()].filter((it) => it.born).sort((a, b) => b.zz - a.zz); for (const it of order) drawItem(it);
    };
    function dashed(x0, y0, x1, y1, col, a, prog) { const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / 11)); for (let q = 0; q < n; q += 2) { const t0 = q / n, t1 = Math.min(1, (q + 1) / n); if (t0 > prog) break; W.pushLine(lerp(x0, x1, t0), lerp(y0, y1, t0), lerp(x0, x1, t1), lerp(y0, y1, t1), 0, 1.0, col, a, 1); } }
    web.after = () => {
      const u = scaleU(); margin();
      if (web.cur) { const tO = S.t - web.cur.t0; for (const row of legendRows) { let a = 0; if (row.k === 'turn') a = tO > 1.5 ? 1 : 0; else for (const l of web.lines) if (l.kind === row.k && l.p.x > a) a = l.p.x; row.node.style.opacity = a.toFixed(2); } }
      if (!web.cur && S.frame % 45 === 3) refreshReach();
      if (focused) { const q = focused.pos(); if (q) { ring.style.opacity = '1'; ring.style.width = (q.w + 14).toFixed(1) + 'px'; ring.style.height = (q.h + 8).toFixed(1) + 'px'; ring.style.transform = 'translate(' + (q.x - q.w / 2 - 7).toFixed(1) + 'px,' + (q.y - q.h / 2 - 4).toFixed(1) + 'px)'; } else ring.style.opacity = '0'; }
      if (frontBtn && W.tgt) { const g = W.tgt, away = W.lens === 'star' && W.star && W.star.ok ? !web.cur && W.starAway() : !web.cur && g.ov < 0.5 && (Math.abs(g.yaw) > 0.06 || Math.abs(g.pitch) > 0.06 || Math.abs(g.offY) > 25 || Math.abs(g.offZ) > 50); if (frontBtn.hidden === away) frontBtn.hidden = !away; }
      const tOpen = web.cur ? S.t - web.cur.t0 : 9;
      for (const cp of web.caps) { const it = cp.of, node = cp.node, a = it.born ? clamp((it.a.x - 0.35) / 0.65, 0, 1) * (cp.wait ? clamp((tOpen - cp.wait) / 0.24, 0, 1) : 1) : 0; node.style.opacity = a.toFixed(3); if (a <= 0) continue;
        const x = it.x.x + (cp.dx || 0) * u, y = it.y.x + cp.dy * (it.s.x / (it.size * u || 1)) * u; node.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)' + (cp.left ? '' : ' translateX(-50%)') + (cp.up ? ' translateY(-100%)' : ''); }
      if (tipOn) { let x = 0, y = 0, s = 0, ok = false; if (tipOn.t === 's') { const st = W.star; if (st.ss[tipOn.i] > 0) { x = st.sx[tipOn.i]; y = st.sy[tipOn.i]; s = Math.max(12, st.cs[tipOn.i]); ok = true; } } else if (tipOn.t === 'sw') { const q = W.star.wHits.find((z) => z.wi === tipOn.i); if (q) { x = q.x; y = q.y; s = q.h / 1.4; ok = true; } } else if (tipOn.t === 'kw') { const q = W.river && W.river.hits.find((z) => z.i === tipOn.i); if (q) { x = q.x; y = q.y; s = q.h / 1.3; ok = true; } } else if (tipOn.t === 'g') { const q = W.gHits.find((z) => z.i === tipOn.q.i); if (q) { x = q.x; y = q.y; s = q.s; ok = true; } } else if (tipOn.t === 'r') { const q = W.sHits.find((z) => z.gi === tipOn.i); if (q) { x = q.x; y = q.y + q.b; s = q.s; ok = true; } } else if (tipOn.t === 'h') { const q = W.hHits.find((z) => z.k === tipOn.i); if (q) { x = q.x; y = q.y; s = q.s; ok = true; } } else if (tipOn.t === 'w') { if (W.visAt[tipOn.i] >= S.frame - 1) { const o = tipOn.i * 5; x = W.vis[o]; y = W.vis[o + 1]; s = W.vis[o + 2]; ok = true; } } else { const it = tipOn.item; x = it.x.x; y = it.y.x; s = it.s.x; ok = web.items.has(it.key); }
        if (ok) { tip.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)'; tip.firstChild.style.bottom = (s * 0.62 + 5) + 'px'; tip.lastChild.style.top = (s * 0.62 + 4) + 'px'; tip.style.opacity = '1'; } else tip.style.opacity = '0'; }
    };

    /* ---------------------------------------------------------------- waking a word by touch of the pointer */
    const wake = { i: -1, k: { x: 0, v: 0 }, lines: [] }; let tipOn = null;
    function setTip(h) {
      tipOn = null; if (!h) { tip.style.opacity = '0'; return; } const D = W.D;
      if (h.t === 'g') { const g = W.gramById.get(h.i), q = W.gHits.find((x) => x.i === h.i); tip.firstChild.textContent = g.lvName; tip.lastChild.textContent = opt.lang === 'ja' && g.mJa ? g.mJa : g.mEn; tipOn = q ? { t: 'g', q } : null; return; }
      tip.classList.toggle('plate', h.t === 'i' && h.item.role === 'ring');   // among the many characters of a whole family the note stands on a plate of the sky's own ink
      if (h.t === 's') { const k = D.kanji[h.i]; if (W.star.sel === h.i) { tip.style.opacity = '0'; return; } tip.firstChild.textContent = k[2].slice(0, 2).join('・'); tip.lastChild.textContent = k[1]; tipOn = h; return; }
      if (h.t === 'sw') { tip.firstChild.textContent = W.rd[h.i]; tip.lastChild.textContent = D.words[h.i][2] || ''; tipOn = h; return; }
      if (h.t === 'sc') { tip.style.opacity = '0'; return; }
      if (h.t === 'kw') { const w = W.river && W.river.w[h.i]; if (!w) { tip.style.opacity = '0'; return; } tip.firstChild.textContent = ''; tip.lastChild.textContent = w[1] || ''; tipOn = h; return; }   // a kana word of the river: what it means (it is its own reading)
      if (h.t === 'r') { tip.firstChild.textContent = ''; tip.lastChild.textContent = L.seeFamily + '  →'; tipOn = h; return; }
      if (h.t === 'h') { const k = D.kanji[h.i]; tip.firstChild.textContent = k[2].slice(0, 2).join('・'); tip.lastChild.textContent = k[1]; tipOn = h; return; }
      if (h.t === 'w') { tip.firstChild.textContent = W.rd[h.i]; tip.lastChild.textContent = D.words[h.i][2] || ''; tipOn = h; }
      else if (h.t === 'i') { const it = h.item; if (it.role === 'centre' || it.role === 'hub' || it.role === 'sem' || it.role === 'homo') { tip.style.opacity = '0'; return; }
        if (it.kind === 'w') { tip.firstChild.textContent = W.rd[it.id]; tip.lastChild.textContent = D.words[it.id][2] || ''; } else if (it.kind === 'k') { tip.firstChild.textContent = D.kanji[it.id][2].slice(0, 2).join('・'); tip.lastChild.textContent = D.kanji[it.id][1]; } else { tip.firstChild.textContent = D.parts[it.id][1] || ''; tip.lastChild.textContent = D.parts[it.id][2] || ''; } tipOn = h; }
    }
    W.onHover = (h) => {
      setTip(h); if (web.cur) { wake.i = -1; return; }
      if (h && h.t === 'w') { wake.i = h.i; const D = W.D, kin = new Set(), lines = [], o = h.i * 5, hx = W.vis[o], hy = W.vis[o + 1];
        if (W.lens === 'sound') { for (const wi of (W.rd[h.i] ? W.byReading.get(W.rd[h.i]) || [] : [])) if (wi !== h.i && W.visAt[wi] >= S.frame - 1) { kin.add(wi); lines.push(wi); } }
        else if (W.lens === 'mean' && W.mOrder) { const rm = W.mOrder.realmOf[h.i], near = []; for (const wi of W.hits) { if (wi === h.i || W.mOrder.realmOf[wi] !== rm) continue; const q = wi * 5; near.push([Math.hypot(W.vis[q] - hx, W.vis[q + 1] - hy), wi]); } near.sort((x, y) => x[0] - y[0]); for (const [, wi] of near.slice(0, 8)) { kin.add(wi); lines.push(wi); } }
        else if (W.lens === 'read' && W.rOrder) { const a = W.rOrder.home[h.i]; if (a >= 0) { const near = []; for (const wi of W.ctx.articleWords[a]) { if (wi === h.i || W.rOrder.home[wi] !== a || W.visAt[wi] < S.frame - 1) continue; const q = wi * 5; near.push([Math.hypot(W.vis[q] - hx, W.vis[q + 1] - hy), wi]); } near.sort((x, y) => x[0] - y[0]); for (const [, wi] of near.slice(0, 8)) { kin.add(wi); lines.push(wi); } } }
        else for (const k of D.words[h.i][4]) { const near = []; for (const wi of W.fam[k]) { if (wi === h.i || W.visAt[wi] < S.frame - 1 || W.vis[wi * 5 + 3] < 0.1) continue; const q = wi * 5; near.push([Math.hypot(W.vis[q] - hx, W.vis[q + 1] - hy), wi]); } near.sort((a, b) => a[0] - b[0]); for (const [d2, wi] of near.slice(0, 5)) { if (d2 > 440) break; if (!kin.has(wi)) { kin.add(wi); lines.push(wi); } } }   // only kin that stand near: a thread never runs across the whole sky
        W.kin = kin; wake.lines = lines; }
      else if (h && h.t === 'h' && W.mOrder) { const hd = W.mOrder.heads.find((x) => x.k === h.i), own = hd ? hd.words.filter((wi) => W.visAt[wi] >= S.frame - 1 && !W.front[wi]) : []; if (own.length) { wake.i = own[0]; W.kin = new Set(own); wake.lines = []; } else wake.i = -1; }   // a head touched: its own words light up
      else wake.i = -1;
    };
    W.drawPath = () => {
      const wk = web.walk; if (wk.length < 1) return; const over = S.view ? S.view.over : 0, a0 = (0.34 + 0.4 * over) * (1 - 0.7 * S.dim.x), col = S.pal.cord; let prev = null, prevId = -1;
      for (const id of wk) { const p = W.project(id), on = p && p.z2 > 70 && p.x > -300 && p.x < S.W + 300 && p.y > -300 && p.y < S.H + 300 ? p : null;
        if (on && prev) { const dx = on.x - prev.x, dy = on.y - prev.y, box = (q, wid) => { const hw = (W.visAt[wid] >= S.frame - 1 ? W.vis[wid * 5 + 4] / 2 : q.size * 1.2) + 7, hh = q.size * 0.62 + 6; return 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh, 1e-6); }, k0 = over > 0.5 ? 0 : box(prev, prevId), k1 = over > 0.5 ? 0 : box(on, id);
          if (k0 + k1 < 0.95) W.pushLine(prev.x + dx * k0, prev.y + dy * k0, on.x - dx * k1, on.y - dy * k1, 0, 1.3, col, a0, 1); }
        if (on && over > 0.5) W.pushLabel(on.x, on.y, 3.4, null, 0, col, Math.min(1, a0 * 2.2), col, 0, 0, { u: 0, v: 0 });
        prev = on; prevId = id; }
    };
    W.drawWake = () => {
      if (wake.k.x < 0.02 || !wake.lines.length || wake.i < 0 && !W.kin) return; const i = wake.i >= 0 ? wake.i : wake.last; if (i == null || i < 0 || W.visAt[i] < S.frame - 1) return; wake.last = i;
      const o = i * 5, ax = W.vis[o], ay = W.vis[o + 1], aw = W.vis[o + 4] / 2, ah = W.vis[o + 2] * 0.6;
      for (const wi of wake.lines) { if (W.visAt[wi] < S.frame - 1) continue; const q = wi * 5, bx = W.vis[q], by = W.vis[q + 1], dx = bx - ax, dy = by - ay, k0 = 1 / Math.max(Math.abs(dx) / (aw + 6), Math.abs(dy) / (ah + 6), 1e-6), k1 = 1 / Math.max(Math.abs(dx) / (W.vis[q + 4] / 2 + 4), Math.abs(dy) / (W.vis[q + 2] * 0.6 + 4), 1e-6); if (k0 + k1 >= 1) continue;
        let cross = false; for (const fw of W.frontList) { if (fw === i || fw === wi || W.visAt[fw] < S.frame - 1) continue; const fo = fw * 5, fx = W.vis[fo], fy = W.vis[fo + 1], fhw = W.vis[fo + 4] / 2 + 8, fhh = W.vis[fo + 2] * 0.62 + 8; for (let t = 0.1; t < 0.95 && !cross; t += 0.1) if (Math.abs(ax + dx * t - fx) < fhw && Math.abs(ay + dy * t - fy) < fhh) cross = true; if (cross) break; }
        if (cross) continue;   // a thread never runs through one of his large words: that kin is lit without a thread
        W.pushLine(ax + dx * k0, ay + dy * k0, bx - dx * k1, by - dy * k1, dx * dy > 0 ? 7 : -7, 1.0, S.pal.line, 0.5 * wake.k.x, wake.k.x); }
    };
    /* a search or a door from the app arrives among the stars: at the character itself, or at the first star of the word (which then opens) */
    api.open = (word) => { const i = W.byWord.get(word); if (i != null) { if (W.star && W.star.ok) { const k0 = W.D.words[i][4].find((k) => W.star.con[k] >= 0); if (k0 != null) W.starGo(k0); } open('w', i); } return i != null; };
    api.openKanji = (ch) => { const i = W.byKanji.get(ch); if (i != null) { if (!(W.star && W.star.ok && W.starGo(i))) open('k', i); } return i != null; };
    /* the whole family of a radical: by its own glyph first (月 is the moon), then by a stored side form (氵), then by a form the characters carry (犭 for 犬).
     * 阝 is two radicals: say which with 'left' (阜, the hill) or 'right' (邑, the town); without that nothing is opened. */
    api.openFamily = (ch, side) => { const D = W.D, gs = W.radicalOrder().groups.filter((x) => !x.none); let g = gs.find((x) => x.key === ch) || gs.find((x) => x.formIds.some((p) => D.parts[p][0] === ch)) || null;
      if (!g) { const also = gs.filter((x) => x.also === ch); g = also.length === 1 ? also[0] : also.find((x) => (side === 'left' && x.key === '阜') || (side === 'right' && x.key === '邑')) || null; }
      if (g) open('r', g.i); return !!g; };
    api.close = close;
  };
})();
