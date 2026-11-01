import {createNode} from '../player/presentation.mjs';

/** Session controls collect intent; the backend owns filtering, permits and scheduling. */
export function customSessionPanel(document,{options,manualDraft={},weekdayDraft={},today,todayTotalDraft={},onStart,onMoreNew,onTodayTotal,onWeekdays,onManual,onFactory,settings,busy=false}){
 const h=(tag,attrs,...children)=>createNode(document,tag,attrs,...children);
 const button=(label,action,attrs={})=>h('button',{type:'button',onclick:action,disabled:busy,...attrs},label);
 const choose=(label,key,values)=>{const select=h('select',{'data-session-filter':key,'aria-label':label,onchange:event=>{options.filters[key]=event.target.value;}},...values.map(([value,text])=>h('option',{value},text)));select.value=options.filters[key]??'';return h('label',{},label,select);};
 const mode=h('select',{'data-session-mode':'','aria-label':'学習方法',onchange:event=>{options.mode=event.target.value;}},h('option',{value:'due'},'予定どおりの復習'),h('option',{value:'review-ahead'},'先取り復習'),h('option',{value:'practice'},'練習（予定は変えません）'));mode.value=options.mode;
 const ahead=h('select',{'data-session-ahead':'','aria-label':'先取りする日数',onchange:event=>{options.aheadDays=Number(event.target.value);}},...[1,3,7].map(n=>h('option',{value:n},`${n}`)));ahead.value=String(options.aheadDays);
 const sizeText=h('output',{'data-session-size-value':''},String(options.size));
 const size=h('input',{type:'range',min:10,max:200,step:10,value:options.size,'data-session-size':'','aria-label':'セッションの課題数',oninput:event=>{options.size=Number(event.target.value);sizeText.textContent=String(options.size);}});
 const until=h('input',{type:'checkbox',checked:options.untilDone,'data-session-until-done':'',onchange:event=>{options.untilDone=event.target.checked;size.disabled=options.untilDone;}});size.disabled=options.untilDone;
 const recent=h('input',{type:'checkbox',checked:options.filters.recentlyFailed,'data-session-recent-failed':'',onchange:event=>{options.filters.recentlyFailed=event.target.checked;}});
 const tag=h('input',{value:options.filters.tag||'','data-session-tag':'','aria-label':'タグ・テーマ',oninput:event=>{options.filters.tag=event.target.value.trim();}});
 const moreNew=h('section',{'data-more-new':''},h('h3',{},'今日の新規枠を追加'),h('p',{class:'secondary'},'新規枠は全モジュール共通です。追加は今日だけ、合計200件までです。'));
 if(today){
  const target=h('input',{id:'study-pace-today-total',type:'number',inputmode:'numeric',min:today.limit,max:200,step:1,required:true,
   value:todayTotalDraft.value??today.limit,oninput:event=>{todayTotalDraft.value=event.currentTarget.value;},'data-today-total':''});
  moreNew.append(h('form',{class:'setting-row',novalidate:true,onsubmit:event=>{event.preventDefault();onTodayTotal(target.valueAsNumber);}},
   h('label',{},'今日の新規カードの合計',h('small',{},`${today.limit}–200`),target),
   h('button',{type:'submit',disabled:busy,'data-save-today-total':''},'今日の合計を設定')));
 }
 moreNew.append(h('div',{class:'row-actions'},...[5,10,20].map(n=>button(`+${n}`,()=>onMoreNew(n),{'data-more-new-count':n}))));
 const panel=h('details',{'data-custom-session':'',class:'fold'},h('summary',{},'追加学習'),
  h('p',{class:'secondary'},'先取り復習は実際の経過時間で採点します。練習では復習予定を変えません。'),
  h('div',{class:'setting-row'},h('label',{},'学習方法',mode),h('label',{},'先取りする日数',ahead)),
  h('div',{class:'setting-row'},h('label',{},'セッションの課題数',size,sizeText),h('label',{},until,'選んだ課題を最後まで')),
  h('fieldset',{},h('legend',{},'課題を絞り込む'),choose('レベル','level',[['','すべて'],['n2','N2'],['n1','N1']]),choose('デッキ','module',[['all','すべて'],['vocabulary','語彙'],['n2','N2'],['n1','N1'],['senmon','専門'],['kotoba','わたしの言葉'],['grammar','文法']]),h('label',{},'タグ・テーマ',tag),h('label',{},recent,'最近7日以内に間違えた課題'),choose('並び順','order',[['due','予定の早い順'],['hardest','定着度の低い順'],['newest','新しい順']])),
  button('このセッションを始める',()=>onStart(structuredClone(options)),{'data-session-start':'',class:'primary'}),
  moreNew);
 const limits=settings.studyPolicy?.newByWeekday??Array(7).fill(settings.newPerDayTotal);
 const dayNames=['日曜日','月曜日','火曜日','水曜日','木曜日','金曜日','土曜日'];
 const weekdays=limits.map((value,day)=>h('input',{type:'number',min:0,max:200,required:true,id:'study-pace-weekday-'+day,
  value:weekdayDraft[day]??value,oninput:event=>{weekdayDraft[day]=event.currentTarget.value;},'aria-label':dayNames[day],'data-weekday-limit':day}));
 panel.append(h('details',{class:'fold','data-weighted-days':''},h('summary',{},'曜日ごとの新規枠'),h('p',{class:'secondary'},'翌日の学習日から適用します。復習予定日は変更しません。'),h('div',{class:'setting-row'},...weekdays.map((input,i)=>h('label',{},dayNames[i],input))),button('曜日設定を保存',()=>onWeekdays(weekdays.map(input=>input.valueAsNumber)),{'data-save-weekdays':''})));
 const field=(name,label,required=true,multiline=false)=>{const node=h(multiline?'textarea':'input',{name,required,oninput:event=>{manualDraft[name]=event.target.value;},'aria-label':label,'data-manual-field':name,...(multiline?{rows:3}:{type:'text'}),maxlength:multiline?4000:128});node.value=manualDraft[name]||'';return node;};
 const word=field('word','言葉'),reading=field('reading','読み'),meaning=field('meaning','意味',true,true),example=field('example','例文',true,true),note=field('note','補足',false,true);
 const values=()=>({word:word.value,reading:reading.value,meaning:meaning.value,example:example.value,note:note.value});
 const form=h('form',{'data-manual-form':'',onsubmit:event=>{event.preventDefault();onManual(values());}},h('label',{},'言葉',word),h('label',{},'読み',reading),h('label',{},'意味',meaning),h('label',{},'例文',example),h('label',{},'補足',note),h('p',{class:'secondary'},'自分で書いた内容を保存します。AI作成・翻訳は行いません。'),h('button',{type:'submit',disabled:busy,'data-manual-save':'',class:'primary'},'カードを保存'),button('カード作成に送る',()=>onFactory(values()),{'data-manual-factory':''}));
 panel.append(h('details',{class:'fold','data-manual-card':''},h('summary',{},'カードを手入力'),form));
 if(busy)for(const control of panel.querySelectorAll('input,select,textarea'))control.disabled=true;
 return panel;
}
