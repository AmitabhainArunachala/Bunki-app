import {createFactoryStatusReader,factoryRequest} from './factory-status.mjs';
import {applyKinsoku} from '../player/kinsoku.mjs';
import { createRecallTimer, createNode } from '../player/presentation.mjs';
import { renderVocabularyPassage,renderVocabularyBack,renderVocabularyRelated,renderVocabularyEntry } from '../player/vocabulary.mjs';
import {contentReady} from '../player/content-ready.mjs';
import { dayBounds } from '../replay.mjs';
import {translateInterfaceText,formatInterfaceText,defaultInterfaceLanguage,renderInterfacePair} from './interface-language.mjs';
import {nextStep} from '../vendor/engine.js';
import {customSessionPanel} from './custom-session.mjs';
import {watchLocalDayBudget} from './local-budget.mjs';
const MODULES = [['all','すべて','すべてのデッキ'],['n2','N2','日本語能力試験'],['n1','N1','日本語能力試験'],['senmon','専門','考えを深める言葉'],['kotoba','わたしの言葉','拾い集めた言葉'],['grammar','文法','意味・思い出す']];
const GRADES = [[1,'もう一度','Again','再'],[2,'難しい','Hard','難'],[3,'正解','Good','良'],[4,'簡単','Easy','易']];
const interval = ms => ms < 60000 ? '1分未満' : ms < 3600000 ? `${Math.ceil(ms/60000)}分` : ms < 86400000 ? `${Math.ceil(ms/3600000)}時間` : `${Math.round(ms/86400000)}日`;

/** Select only from scheduler-admitted queues; daily permits and topic filters remain backend-owned. */
export function nextRapidFireStudy(backend,module='all',at=Date.now(),gradedTaskKey=null) {
  const another=entry=>entry.taskKey!==gradedTaskKey;
  const tasks=backend.readProjection().tasks,scoped=backend.queue({module}).filter(another);
  const chooseDue=(scope,ready,ahead)=>{
    const learning=backend.queue({module:scope,learningOnly:true}).filter(another);
    const entries=new Map([...ready,...learning].map(entry=>[entry.taskKey,entry]));
    const step=nextStep({now:new Date(at),ahead,
      queue:ready.filter(entry=>{const card=tasks[entry.taskKey]?.card;return card&&card.state!==0&&![1,3].includes(card.state);}).map(entry=>entry.taskKey),
      learning:learning.map(entry=>({id:entry.taskKey,due:Date.parse(tasks[entry.taskKey].card.due)}))});
    return step.show?{entry:entries.get(step.show),early:step.early}:null;
  };
  const withinModule=chooseDue(module,scoped,false);
  if(withinModule?.entry)return withinModule;
  const all=module==='all'?scoped:backend.queue({module:'all'}).filter(another),otherDue=chooseDue('all',all,false);
  if(otherDue?.entry)return otherDue;
  const fresh=entry=>{const card=tasks[entry.taskKey]?.card;return !card||card.state===0;};
  const entry=scoped.find(fresh)||all.find(fresh);
  if(entry)return {entry,early:false};
  const learning=backend.queue({module:'all',learningOnly:true}).filter(another).filter(entry=>{
    const card=tasks[entry.taskKey].card,due=Date.parse(card.due),reviewed=Date.parse(card.last_review);
    return Number.isFinite(reviewed)&&Number.isFinite(due)&&due>reviewed&&at-reviewed>=(due-reviewed)/2;
  });
  const early=nextStep({now:new Date(at),queue:[],ahead:true,learning:learning.map(entry=>({id:entry.taskKey,due:Date.parse(tasks[entry.taskKey].card.due)}))});
  return early.show?{entry:learning.find(entry=>entry.taskKey===early.show),early:early.early}:null;
}

/** Actual DOM app; backend commands own every learner mutation. */
export function mountStudyApp(root, { backend, catalog, themes, grammar = null, dictionary = null, platform = {}, corpus = null, legacyHistory = null, preferences = globalThis.localStorage, now = Date.now }) {
  const document = root.ownerDocument, win = document.defaultView;
  const pairedPhone = ['paired-dev','paired-prod'].includes(platform.storageKind);
  const h = (tag, attrs, ...children) => createNode(document, tag, attrs, ...children);
  const button = (text, fn, attrs = {}) => h('button', { type:'button', onclick: fn, ...attrs }, text);
  let screen = 'today', module = 'all', current = null, busy = false, notice = '', pendingIntent = null, pendingAction = null, factoryRetry = null, disposed = false, pop = null, lastReview = null;
  let nativeSyncState={paired:false,state:'idle',error:null},nativeSyncBusy=false,nativeStatusGeneration=0,nativeSyncActionError=null,nativePairDraft='';
  let saveStatusGeneration=0,noticeOwner=null;
  let saveBacklogSince=null,saveBacklogTimer=null,lastSaveStatus=null;
  let typedBusy=false,typedDraft='',typedSentence='';
  let swipeGrading=false;try{swipeGrading=preferences.getItem('nihongo.swipe-grading.v1')==='true';}catch{}
  const shippedCatalog=catalog;
  const customOptions={mode:'review-ahead',aheadDays:1,size:20,untilDone:false,filters:{level:'',module:'all',tag:'',recentlyFailed:false,order:'due'}};
  let customRun=null,customBusy=false;
  let budgetWatcher=null;
  let pendingObservation=false;
  const manualDraft={word:'',reading:'',meaning:'',example:'',note:''};
  const paceDraft={};
  let todayTotalDraft={};
  let weekdayDraft={},weekdayPending=null;
  let interfaceLanguage=defaultInterfaceLanguage(win.navigator);try{const stored=preferences.getItem('nihongo.interface-language.v1');if(['ja','en','both'].includes(stored))interfaceLanguage=stored;}catch{}
  const originalLabels=new WeakMap(),originalAttributes=new WeakMap(),cardViews=new WeakMap();
  function localized(jp){return formatInterfaceText(jp,interfaceLanguage);}
  const sourceCopy='.passage,.grammar-front,.grammar-back,[data-vocabulary-entry],[data-vocabulary-source]';
  const isSourceCopy=element=>element.closest(sourceCopy)&&!element.closest('[data-interface-copy]');
  function displayDate(value,options={}){const date=new Date(value),zone=options.timeZone?{timeZone:options.timeZone}:{},jp=`${date.toLocaleDateString('ja-JP',{month:'long',day:'numeric',...zone})}（${date.toLocaleDateString('ja-JP',{weekday:'short',...zone})}）${options.timeStyle?date.toLocaleTimeString('ja-JP',{timeStyle:'short',...zone}):''}`,en=new Intl.DateTimeFormat('en-US',options).format(date);return renderInterfacePair(h('span'),jp,en,interfaceLanguage);}
  function localize(){
    for(const element of document.querySelectorAll('[data-interface-ja][data-interface-en]')){
      if(!isSourceCopy(element))renderInterfacePair(element,element.dataset.interfaceJa,element.dataset.interfaceEn,interfaceLanguage,{inline:!!element.closest('button,option')});
    }
    const walker=document.createTreeWalker(document.body,win.NodeFilter.SHOW_TEXT),nodes=[];let node;
    while(node=walker.nextNode()){
      const parent=node.parentElement;if(isSourceCopy(parent)||parent.closest('[data-interface-ja][data-interface-en]'))continue;
      nodes.push(node);
    }
    for(const node of nodes){
      const prior=originalLabels.get(node),jp=prior&&node.nodeValue===prior.rendered?prior.source:node.nodeValue;
      const english=translateInterfaceText(jp);
      if(node.parentElement.tagName==='OPTION')renderInterfacePair(node.parentElement,jp,english,interfaceLanguage,{inline:true});
      else if(english!==jp&&!node.parentElement.closest('button,script,style')){
        node.replaceWith(renderInterfacePair(h('span'),jp,english,interfaceLanguage));
      }else{const rendered=localized(jp);originalLabels.set(node,{source:jp,rendered});if(node.nodeValue!==rendered)node.nodeValue=rendered;}
    }
    for(const element of root.querySelectorAll('[aria-label],[placeholder],[title]')){
      if(isSourceCopy(element))continue;
      const before=originalAttributes.get(element)||{},after={};
      for(const name of ['aria-label','placeholder','title'])if(element.hasAttribute(name)){
        const value=element.getAttribute(name),source=before[name]&&value===before[name].rendered?before[name].source:value,rendered=localized(source);
        element.setAttribute(name,rendered);after[name]={source,rendered};
      }
      originalAttributes.set(element,after);
    }
    document.documentElement.lang=interfaceLanguage==='en'?'en':'ja';
  }
  function languagePicker(compact=false){const select=h('select',{'aria-label':'表示言語','data-interface-language':'',onchange:async e=>{interfaceLanguage=e.target.value;for(const picker of root.querySelectorAll('[data-interface-language]'))picker.value=interfaceLanguage;try{await preferences.setItem('nihongo.interface-language.v1',interfaceLanguage);}catch{message('表示言語を保存できません。');}render();}},h('option',{value:'ja'},'日本語'),h('option',{value:'en'},'English'),h('option',{value:'both'},'両方'));select.value=interfaceLanguage;return h('label',{class:`language-picker${compact?' compact':''}`},h('span',{},'表示言語'),select);}
  let refreshFactoryRows=()=>{};
  const factoryStatuses=createFactoryStatusReader({inspect:platform.inspectCardFactory,catalog,getProjection:()=>backend.readProjection(),onUpdate:()=>{if(!disposed&&screen==='words')refreshFactoryRows();}});
  function reconcileUnknownFactoryRows(){factoryStatuses.inspectUnknown(backend.readProjection().captures.filter(c=>!c.targetTaskKey&&['unknown','unsure'].includes(c.kind)));}
  let themePreferenceSet=false;
  let theme = 'auto', query = '', wordFilter = 'all',wordPage=0;
  try { const stored=preferences.getItem('nihongo.qa.appearance.v1');themePreferenceSet=stored!==null;theme=stored||'auto'; } catch { /* preference unavailable */ }
  const dark = win.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme(value, save = true) {
    theme = Object.hasOwn(themes.themes, value) || value === 'auto' ? value : 'auto';
    const resolved = theme === 'auto' ? (dark.matches ? 'dark' : 'washi') : theme;
    const tokens = themes.themes[resolved].tokens;
    for (const [key, value] of Object.entries(tokens)) document.documentElement.style.setProperty(`--${key}`, value);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = themes.themes[resolved].scheme;
    if (save) try { const previousSet=themePreferenceSet,saved=preferences.setItem('nihongo.qa.appearance.v1', theme);themePreferenceSet=true;saved?.catch?.(()=>{themePreferenceSet=previousSet;message('この端末に色の設定を保存できません。');}); } catch { message('この端末に色の設定を保存できません。'); }
    for (const picker of root.querySelectorAll('[data-theme-picker]')) picker.value = theme;
  }
  const darkChanged = () => { if (theme === 'auto') applyTheme('auto', false); };
  dark.addEventListener('change', darkChanged);
  applyTheme(theme, false);
  function themePicker() {
    const select = h('select', { 'aria-label':'色を選ぶ', 'data-theme-picker':'', onchange: e => applyTheme(e.target.value) },
      h('option', {value:'auto'}, '自動'), ...Object.entries(themes.themes).map(([id, item]) => h('option',{value:id},item.name)));
    select.value = theme;
    return h('label',{class:'theme-picker'},h('span',{},'色'),select);
  }
  const statusLine = h('p',{class:'save-status',role:'status','data-save-status':''},'読み込み中…');
  const live = h('p',{class:'notice',role:'status','aria-live':'polite'});
  const main = h('main',{id:'main',tabindex:'-1'});
  const nav = h('nav',{'aria-label':'メイン'}, ...[['today','今日'],['words','単語'],['record','記録'],['settings','設定']].map(([id,label]) =>
    button(label,() => navigate(id),{'data-nav':id})));
  root.replaceChildren(h('header',{class:'app-header'},h('a',{class:'brand',href:'#',onclick:e=>{e.preventDefault();navigate('today');}},'集中道場',h('span',{},'Nihongo Study')),h('div',{class:'header-controls'},languagePicker(true),themePicker())),
    h('div',{class:'qa-banner'},corpus?.release3FullCorpus?'全デッキ · 全文英訳付き。':'QAプレビュー · テスト用の記録です。実際の学習履歴には影響しません。'),nav,main,live,
    h('footer',{},statusLine,h('span',{},'一つずつ、確かに。')));
  async function updateStatus() {
    const generation=++saveStatusGeneration;
    let status;
    try { status=await backend.status(); }
    catch {
      if(!disposed&&generation===saveStatusGeneration)message('保存状態を読み取れません。再読み込み前にバックアップを取ってください。','save-status');
      return;
    }
    if (disposed||generation!==saveStatusGeneration) return;
    if(noticeOwner==='save-status')message('');
    paintSaveStatus(status);
    if(platform.nativeSync&&!nativeSyncBusy){const generation=++nativeStatusGeneration;try{const sync=await platform.nativeSync.status();if(disposed||generation!==nativeStatusGeneration)return;const pairedChanged=nativeSyncState.paired!==sync.paired;nativeSyncState=sync;if(pairedChanged&&screen==='settings'){render();return;}const state=root.querySelector('[data-native-sync-status]');if(state){const description=nativeSyncDescription();renderInterfacePair(state,description,translateInterfaceText(description),interfaceLanguage);}}catch(error){if(!disposed&&generation===nativeStatusGeneration){nativeSyncState={...nativeSyncState,state:'error',error:['authentication-required','credential-storage-failed','invalid-credential'].includes(error?.message)?error.message:'status-unavailable'};const state=root.querySelector('[data-native-sync-status]');if(state){const description=nativeSyncDescription();renderInterfacePair(state,description,translateInterfaceText(description),interfaceLanguage);}}}}
    if(disposed||generation!==saveStatusGeneration)return;
    paintSaveStatus(status);
  }
  function paintSaveStatus(status){
    lastSaveStatus=status;
    const paired=['paired-dev','paired-prod','native-worker-qa'].includes(platform.storageKind)||nativeSyncState.paired;
    const synced=paired&&status.pendingUpload===0&&status.applied===status.head&&(!platform.nativeSync||nativeSyncState.state==='up-to-date');
    const detail=nativeSyncNeedsAttention()?nativeSyncDescription():'';
    const jp=detail||(!paired?'この端末に保存しました。同期は未設定です。':`${synced?'同期済み':'同期を待っています'}${status.pendingUpload?`・未送信${status.pendingUpload}件`:''}`);
    const en=detail?translateInterfaceText(detail):!paired?'Saved on this device. Sync is not set up.':`${synced?'Synced':'Waiting to sync'}${status.pendingUpload?` · ${status.pendingUpload} records not sent yet`:''}`;
    renderInterfacePair(statusLine,jp,en,interfaceLanguage);
    const diagnostics=root.querySelector('[data-study-diagnostics-values]');if(diagnostics)diagnostics.textContent=diagnosticValues();
    statusLine.dataset.pending = String(status.pendingUpload);
    const backlog=status.pendingUpload>0||status.applied!==status.head;
    if(backlog&&saveBacklogSince===null)saveBacklogSince=win.performance.now();
    if(!backlog){saveBacklogSince=null;win.clearTimeout(saveBacklogTimer);saveBacklogTimer=null;}
    const pendingFor=saveBacklogSince===null?0:win.performance.now()-saveBacklogSince;
    if(platform.storageKind==='native-worker-prod'&&backlog&&pendingFor<3000&&saveBacklogTimer===null)
      saveBacklogTimer=win.setTimeout(()=>{saveBacklogTimer=null;updateStatus();},3000-pendingFor);
    statusLine.dataset.studySync=platform.storageKind==='native-worker-prod'&&(nativeSyncNeedsAttention()||backlog&&(!autoSyncAllowed()||pendingFor>=3000))?'attention':'quiet';
    localize();
  }
  function message(text,owner=null) { notice = text; noticeOwner=owner; live.textContent = text;localize(); }
  function navigate(next) {
    if (busy || typedBusy || customBusy || pendingIntent) return message('保存を確認してから移動してください。失敗した場合は再試行できます。');
    if (current?.revealed && !current.committed && current.attempt.mode!=='practice') {
      // A target lookup on an abandoned attempt gets its own revision-checked boost.
      const p = backend.readProjection(), t = p.tasks[current.entry.taskKey];
      const capture = t && p.captures.find(c => c.attemptId === current.attempt.id && c.targetTaskKey === t.taskKey && !p.boostSources[`${c.id}|${t.taskKey}`] && ['lookup','unknown','unsure'].includes(c.kind));
      if (capture && !t.suspended && !t.known && t.contract === 'vocabulary.read.v1') {
        run(backend.command('boost',{taskKey:t.taskKey,parent:t.head,observationId:capture.id}),() => { current?.timer.dispose(); current=null; screen=next; render(); });
        return;
      }
    }
    current?.timer.dispose(); current = null; customRun=null; screen = next; closePopover(); render();
  }
  function render() {
    if (disposed) return;
    catalog=backend.catalogEntries?.()??shippedCatalog;
    factoryStatuses.leave();refreshFactoryRows=()=>{};
    for (const b of nav.querySelectorAll('button')) b.setAttribute('aria-current',b.dataset.nav === screen ? 'page' : 'false');
    const focusedField=document.activeElement;
    const paceFieldId=focusedField?.id.startsWith('study-pace-')?focusedField.id:null;
    const selection=paceFieldId&&focusedField.selectionStart!=null?[focusedField.selectionStart,focusedField.selectionEnd,focusedField.selectionDirection]:null;
    const previousCard=main.querySelector('[data-card]'),previousView=previousCard&&cardViews.get(previousCard),previousScroll=previousCard?.scrollTop??0;
    const openPanels=screen==='today'?['[data-custom-session]','[data-weighted-days]','[data-manual-card]'].filter(selector=>main.querySelector(selector)?.open):[];
    main.replaceChildren(screen === 'study' ? studyScreen() : screen === 'words' ? wordsScreen() : screen === 'record' ? recordScreen() : screen === 'settings' ? settingsScreen() : todayScreen());
    for(const selector of openPanels)main.querySelector(selector)?.setAttribute('open','');
    if(paceFieldId){
      const field=document.getElementById(paceFieldId);
      field?.focus({preventScroll:true});
      if(selection)field?.setSelectionRange(...selection);
    }
    root.querySelector('[data-retry-panel]')?.remove();
    if(pendingIntent&&!busy&&!(pairedPhone&&screen==='study'&&pendingIntent.type==='review'))main.after(h('div',{'data-retry-panel':'',class:'retry-panel',role:'status'},h('p',{},'保存を確認できていません。同じ操作を再試行できます。'),button('保存を再試行',()=>run(pendingIntent),{class:'primary','data-retry':''})));
    root.querySelector('[data-factory-retry-panel]')?.remove();
    if(factoryRetry)main.after(h('div',{'data-factory-retry-panel':'',class:'retry-panel'},button('カード作成の依頼を再試行',()=>submitFactory(factoryRetry),{class:'quiet','data-factory-retry':''})));
    live.textContent = notice;localize();
    if(previousView?.current===current&&previousView.revealed===current?.revealed){const card=main.querySelector('[data-card]');if(card)card.scrollTop=previousScroll;}
    if(screen==='study'&&!pop&&!document.querySelector('dialog[open]'))focusStudyCard();
    updateStatus();
    budgetWatcher?.schedule();
  }
  function todayScreen() {
    const p = backend.readProjection(), queue = backend.queue({module}),step=backend.sitting({module});
    const today=backend.todayAllowance?.();
    if(today&&(todayTotalDraft.day!==today.day||todayTotalDraft.timezone!==today.timezone))todayTotalDraft={day:today.day,timezone:today.timezone};
    const section = h('section',{class:'today'},h('div',{class:'section-heading screen-head'},h('h1',{},'今日の学習'),h('p',{},displayDate(now(),{month:'long',day:'numeric',weekday:'long'}))));
    const due = queue.filter(e => p.tasks[e.taskKey].card).length, availablePermits=Object.values(p.permits).filter(x=>!x.usedBy&&x.install===backend.installation&&x.startsAt<=now()&&x.endsAt>now()).length, plannedNew=Math.min(queue.length-due,availablePermits);
    section.append(h('div',{class:'daily-intro sheet hero'},h('div',{},h('p',{class:'lead'}, queue.length ? '言葉に会って、思い出す。' : '次の学習まで、少し休憩。'),
      h('p',{class:'secondary'},`復習 ${due} · 新規カード ${plannedNew} · 1日の新規カード上限はすべてのデッキ共通`)),
      h('div',{class:'today-actions'},button(step.entry&&!step.pause?'学習を始める':step.pause?'次の学習ステップを待っています':'今できる復習はありません',() => start(step.entry),{class:'primary',disabled:!step.entry||!!step.pause,'data-start':''}),lastReview?button('元に戻す',undoLast,{class:'quiet','data-undo':''}):null,overrideLastReviewButton(p))));
    if(step.pause){const time=new Date(step.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:p.settings.learnerTimezone});section.append(h('div',{class:'learning-pause','data-learning-pause':''},h('p',{},`学習ステップが ${step.count} 件あります。次の予定は ${time} です。`),step.canEarly?button('次の学習ステップを今（少し早め）',()=>{const early=backend.sitting({module,ahead:true});if(early.entry&&!early.pause)start(early.entry,false,early.early);},{class:'primary','data-learn-ahead':''}):null));}
    const continued=catalog.filter(e=>p.tasks[e.taskKey]?.card),carried=new Set(p.baselines.map(b=>b.taskKey)),todayBounds=today??dayBounds(now(),p.settings.learnerTimezone),todayKeys=new Set(p.reviews.filter(r=>!r.undoneAt&&r.at>=todayBounds.startsAt&&r.at<todayBounds.endsAt).map(r=>r.taskKey));
    function scheduledList(entries,label,attrs){if(entries.length)section.append(h('section',{class:'sheet list-sheet'},h('h2',{},label),h('ul',{class:'forecast',...attrs},...entries.sort((a,b)=>Date.parse(p.tasks[a.taskKey].card.due)-Date.parse(p.tasks[b.taskKey].card.due)).slice(0,20).map(e=>{const due=p.tasks[e.taskKey].card.due;return h('li',{'data-task-key':e.taskKey,'data-scheduled-due':due},button(e.term,()=>start(e,true),{class:'text-link','data-vocabulary-entry':''}),h('span',{},displayDate(due,{dateStyle:'short',timeStyle:'short',timeZone:p.settings.learnerTimezone})));}))));}
    scheduledList(continued.filter(e=>carried.has(e.taskKey)),'引き継いだカード',{'data-continued-tasks':''});scheduledList(continued.filter(e=>!carried.has(e.taskKey)&&todayKeys.has(e.taskKey)),'今日の学習',{'data-today-learning':''});scheduledList(continued.filter(e=>!carried.has(e.taskKey)&&!todayKeys.has(e.taskKey)),'学習中のカード',{'data-ongoing-learning':''});
    if(backend.customSession)section.append(customSessionPanel(document,{options:customOptions,manualDraft,weekdayDraft,today,todayTotalDraft,settings:plannedSettings(p),busy:customBusy,
      onStart:beginCustomSession,onMoreNew:count=>customAction(()=>backend.addNewToday(count),'今日の新規カードを追加しました。'),
      onTodayTotal:total=>{
        if(!Number.isInteger(total)||total<0||total>200)return message('今日の上限から200までの整数を入力してください。');
        const draft=todayTotalDraft;
        customAction(async()=>{
          const result=await backend.setNewTodayTotal(total,today);
          if(result.kind==='durable')delete draft.value;
          return result;
        },'今日の新規カードの合計を保存しました。');
      },
      onWeekdays:saveWeekdays,
      onManual:values=>customAction(async()=>{const result=await backend.createManualCard(values);if(result.kind==='durable'&&!result.reused)for(const key of Object.keys(manualDraft))manualDraft[key]='';return result;},'手入力のカードを保存しました。'),
      onFactory:values=>{typedDraft=values.word;typedSentence=values.example;navigate('words');}}));
    const shelf=h('section',{class:'sheet library-sheet'},h('div',{class:'sheet-head'},h('h2',{},'本棚'),h('p',{class:'sheet-desc'},'学ぶ範囲を選びます。範囲を変えても、1日の新規カード上限は増えません。')));section.append(shelf);
    const library = h('div',{class:'library',role:'group','aria-label':'学習範囲'});
    for (const [id,name,description] of MODULES) {
      const entries = id === 'all' ? catalog : catalog.filter(e => e.module === id);
      const count = entries.filter(contentReady).length;
      library.append(button('',() => {module=id;render();},{class:`module ${module===id?'selected':''}`,'aria-pressed':module===id,'data-module':id}));
      library.lastChild.append(h('span',{class:'module-name'},name),h('span',{class:'module-description'},description),h('span',{class:'module-count'},`${count}枚`,h('small',{},corpus?.release3FullCorpus?'収録されている内容':'確認済みのQA内容')));
    }
    shelf.append(library,h('p',{class:'content-note'},corpus?.release3FullCorpus?`語彙${corpus.vocabularyCount.toLocaleString('ja-JP')}件（わたしの言葉${corpus.personalVocabularyCount}件を含む）・文法${corpus.grammarTasks}カード。${corpus.generatedVocabularyCount?`引き継いだ${corpus.basePersonalVocabularyCount}件に、新しい言葉${corpus.generatedVocabularyCount}件を追加しています。`:''}全文英訳は配布内容を表示しています。`:`このプレビューは ${catalog.filter(contentReady).length} 件の確認済みカードを表示します。全8,508カードの導入・コンテンツ検証は別途確認が必要です。`));
    return section;
  }
  async function customAction(action,success){
    if(customBusy||busy||pendingIntent)return;customBusy=true;render();
    try{const result=await action();if(disposed)return;
      // A manual card whose normalized content already exists merges into the existing card:
      // not a failure, not a new save. Keep the draft and say so.
      // The real backend answers an identical manual card with the existing card (durable, reused);
      // a creation that lost a canonical-order merge arrives as observation-only. Both mean: it exists.
      const existing=(result?.kind==='durable'&&result?.reused===true)||(result?.kind==='observation-only'&&result?.reason==='manual-card-content-occupied');
      if(existing){message('この言葉のカードは既にあります。既存のカードをそのまま使います。');return;}
      if(result?.kind!=='durable')throw Error(result?.reason||'custom-action-failed');message(success);}
    catch(error){
      const messages={'retry-existing-manual-card':'前のカードの入力に戻して、保存を再試行してください。',
        'invalid-manual-card':'言葉と読みは128文字以内、意味・例文・補足は4000文字以内で入力してください。言葉・読み・意味・例文は必須です。',
        'today-total-already-higher':'今日の上限から200までの整数を入力してください。',
        'retry-existing-new-override':'前の新規カード上限の変更をもう一度保存してください。',
        'override-day-ended':'学習日が変わりました。今日の合計を確認してください。'};
      if(!disposed)message(messages[error.message]??'操作を保存できませんでした。入力と通信を確認してください。');
    }
    finally{customBusy=false;if(!disposed)render();}
  }
  function saveWeekdays(values){
    if(values.length!==7||values.some(n=>!Number.isInteger(n)||n<0||n>200))return message('曜日の新規カード上限は0〜200の整数を入力してください。');
    if(customBusy||busy||pendingIntent)return;
    const body=JSON.stringify(values);
    if(weekdayPending&&weekdayPending.body!==body)return message('前の曜日設定を先に再試行してください。');
    const record=weekdayPending??(weekdayPending={body,intent:backend.command('settings',{key:'studyPolicy',value:{version:2,newByWeekday:values}})});
    weekdayDraft={...values};
    customAction(async()=>{
      const result=await backend.submitCommand(record.intent);
      if(result.kind!=='failed')weekdayPending=null;
      if(result.kind==='durable')weekdayDraft={};
      return result;
    },'翌日の学習日から変更します。');
  }
  function beginCustomSession(options){
    if(customBusy||busy||pendingIntent)return;
    try{const selection=backend.customSession(options);if(!selection.entries.length)return message('この条件で学習できるカードはありません。');customRun={options:selection.options,remaining:[...selection.entries],completed:0,total:selection.entries.length};advanceCustomSession();}
    catch{message('セッションの条件を確認してください。');}
  }
  function advanceCustomSession(){
    const eligible=customRun?new Set(backend.customSession({...customRun.options,untilDone:true}).entries.map(entry=>entry.taskKey)):new Set();
    let entry;while(customRun?.remaining.length&&!entry){const next=customRun.remaining.shift();if(eligible.has(next.taskKey))entry=next;}
    if(entry){start(entry,customRun.options.mode==='practice',false,customRun.options);return;}
    customRun=null;current?.timer.dispose();current=null;screen='today';message('セッションを終えました。');render();
  }
  function start(entry, practice = false,learnAhead=false,session=null) {
    if (!entry) return;
    try {
      current?.timer.dispose();
      if(!session)customRun=null;
      clearCardSelection();
      current={entry,attempt:backend.snapshotAttempt(entry.taskKey,{practice,learnAhead,...(session?{session}:{})}),revealed:false,committed:false,timer:createRecallTimer(document),thinkMs:null};
      screen='study';if(noticeOwner!=='native-sync-action'||!nativeSyncNeedsAttention())message('');render();focusStudyCard();win.scrollTo(0,0);
    } catch { message('翻訳・カードの確認が完了していないため、採点を開始できません。'); }
  }
  function focusStudyCard(){main.querySelector('[data-card]')?.focus({preventScroll:true});}
  function clearCardSelection(){const selection=win.getSelection(),card=main.querySelector('[data-card]');if(selection&&card&&(card.contains(selection.anchorNode)||card.contains(selection.focusNode)))selection.removeAllRanges();}
  function revealCard(c=current,source='pointer'){
    if(!c||c!==current||c.revealed||busy||pendingIntent||pop||document.querySelector('dialog[open]'))return;
    clearCardSelection();c.thinkMs=c.timer.freeze();c.revealed=true;c.revealSource=source;render();focusStudyCard();
  }
  function passage(text, options = {}) { return renderVocabularyPassage(document,current.entry,text,{...options,onWord:openWord,dictionary}); }
  const fold = (label, ...contents) => h('details',{class:'fold'},h('summary',{},label),...contents);
  function studyScreen() {
    const c=current, e=c.entry, p=backend.readProjection(), task=p.tasks[e.taskKey];
    const section=h('section',{class:'study','data-study':c.revealed?'back':'front','data-reveal-source':c.revealSource,
      'data-focus':c.sessionInfoOpen?'session-info':'simple'});
    const studyAction=(label,icon,action,attrs)=>button(icon,action,
      {class:'quiet study-icon','aria-label':label,title:label,...attrs});
    const override=overrideLastReviewButton(p);
    if(override)override.id='study-override';
    const actions=h('div',{class:'study-actions'},
      studyAction('本棚へ','‹',()=>navigate('today'),{'data-study-exit':''}),
      lastReview?studyAction('元に戻す','↶',undoLast,{'data-undo':''}):null,override);
    actions.append(studyAction('セッション情報','⋯',event=>{
        c.sessionInfoOpen=!c.sessionInfoOpen;
        section.dataset.focus=c.sessionInfoOpen?'session-info':'simple';
        event.currentTarget.setAttribute('aria-expanded',String(c.sessionInfoOpen));
        focusStudyCard();
      },{'data-session-info':'','aria-expanded':String(!!c.sessionInfoOpen),
        'aria-controls':['study-context',customRun?'study-progress':null,override?.id,!pairedPhone&&c.revealed?'study-help':null].filter(Boolean).join(' ')}));
    const context=h('span',{id:'study-context'},`${MODULES.find(m=>m[0]===e.module)?.[1]||'文法'} · ${c.attempt.learnAhead?'学習ステップ（少し早め） · ':''}${c.attempt.mode==='practice'?'追加練習（採点なし）':e.contractId==='grammar.cloze.v1'?'思い出す':e.contractId==='grammar.meaning.v1'?'意味':'読んで思い出す'}`);
    section.append(h('div',{class:'study-heading'},actions,context));
    const card=h('article',{class:'study-card','data-card':'',tabindex:'0',
      ...(c.revealed?{role:'region','aria-labelledby':'study-card-term'}:{role:'button','aria-label':'解答を表示',title:'解答を表示',
        'aria-describedby':'study-card-content','aria-keyshortcuts':'Space Enter','data-reveal':''})});
    cardViews.set(card,{current:c,revealed:c.revealed});
    if(customRun)section.append(h('p',{id:'study-progress','data-session-progress':''},'カスタム学習',' · ',`${customRun.completed+1} / ${customRun.total}`,customRun.options.mode==='review-ahead'?h('span',{},' · ','先取り復習'):null));
    if(e.manual){
      card.append(c.revealed?h('div',{'data-vocabulary-source':'','data-manual-back':''},h('h2',{},e.term),h('p',{},e.reading),h('p',{},e.meaning),h('p',{},e.ja),e.note?h('p',{},e.note):null):passage(e.ja,{front:true}));
    } else if (e.contractId.startsWith('grammar.') && grammar && e.grammarRecord) {
      card.append(c.revealed ? grammar.renderGrammarBack(document,e.grammarRecord,e.grammarTask,{onCapture:intent=>openWord({surface:intent.surface,
        span:{...intent.span,unit:intent.span.unit==='utf16'?'utf16-code-unit':intent.span.unit},location:intent.field==='example'?'passage':'definition',source:{field:intent.field,exampleId:intent.exampleId??null,context:intent.context,recordRevision:intent.contentRevision}},null)}) : grammar.renderGrammarFront(document,e.grammarRecord,e.grammarTask));
    } else {
      card.append(c.revealed?renderVocabularyBack(document,e,{onWord:openWord,kanjiPanel:kanjiPanel(e),dictionary}):passage(e.ja,{front:true}));
    }

    if(!c.revealed)card.firstElementChild.id='study-card-content';
    else card.querySelector('h1,h2').id='study-card-term';
    for(const passage of card.querySelectorAll('.grammar-front .passage,.grammar-back .passage'))applyKinsoku(passage);
    if (c.revealed && (task?.card?.lapses??0)>=5) card.append(leechPanel(task));
    section.append(card);
    if (c.revealed&&!c.committed) appendStudyControls(section,c);
    // Swipes grade only after an explicit device-local opt-in.
    let pointer=null,clickReady=false;
    const interactive=target=>{const control=target.closest('button,a,summary,input,textarea,select,audio,video,[contenteditable],[role=button],[role=link]');return control&&control!==card;};
    const selected=()=>win.getSelection()?.isCollapsed===false;
    card.addEventListener('pointerdown',ev=>{
      pointer=null;clickReady=false;
      if(ev.isPrimary!==false&&ev.button===0&&!interactive(ev.target))pointer={x:ev.clientX,y:ev.clientY,id:ev.pointerId,moved:false,scrolled:false,selected:selected()};
    });
    card.addEventListener('pointermove',ev=>{if(pointer?.id===ev.pointerId&&Math.hypot(ev.clientX-pointer.x,ev.clientY-pointer.y)>10)pointer.moved=true;});
    card.addEventListener('scroll',()=>{if(pointer)pointer.scrolled=true;clickReady=false;});
    card.addEventListener('pointerup',ev=>{
      const from=pointer;pointer=null;
      if(from?.id!==ev.pointerId||from.scrolled||from.selected||selected()||interactive(ev.target))return;
      const dx=ev.clientX-from.x,dy=ev.clientY-from.y;
      clickReady=!from.moved&&Math.hypot(dx,dy)<=10;
      if(swipeGrading&&c.revealed&&!c.committed&&Math.abs(dx)>90&&Math.abs(dx)>Math.abs(dy)*2)grade(dx>0?3:1,'swipe');
    });
    card.addEventListener('pointercancel',()=>{pointer=null;clickReady=false;});
    card.addEventListener('click',ev=>{
      const activate=ev.detail===0||clickReady;clickReady=false;
      if(activate&&ev.button===0&&!interactive(ev.target)&&!selected())revealCard(c);
    });
    return section;
  }
  function appendStudyControls(section,c) {
    const practice=c.attempt.mode==='practice';
    const finishPractice=()=>button('追加練習を終える',()=>navigate('today'),{class:'primary','data-finish-practice':''});
    if(pairedPhone&&pendingIntent?.type==='review'){
      section.append(button('保存を再試行',()=>run(pendingIntent),{class:'primary','data-retry':'',disabled:busy}));
      return;
    }
    if(pairedPhone&&practice&&!customRun){section.append(finishPractice());return;}
    let preview;
    if(!c.ratingsUnavailable&&(!practice||!pairedPhone)){try{preview=backend.preview(c.attempt,c.thinkMs);}catch{}}
    if(pairedPhone&&(c.ratingsUnavailable||(!practice&&!preview))){
      if(!c.ratingsUnavailable){
        c.ratingsUnavailable=true;
        queueMicrotask(()=>refreshPhoneRatings(c));
      }
      section.append(button(c.requestedRating?'保存を再試行':'評価を再読み込み',()=>refreshPhoneRatings(c),
        {class:'primary','data-retry-ratings':'',disabled:busy||!!pendingIntent}));
      return;
    }
    const bar=h('div',{class:'grade-bar','aria-label':'思い出せた度合い'});
    for(const [rating,jp,en,seal] of GRADES) {
      const wait=c.attempt.mode==='practice'?'追加練習':preview?.cards?.[rating] ? interval(Math.max(0,Date.parse(preview.cards[rating].due)-now())) : '確認中';
      const effective=preview?.ratings?.[rating]?.effectiveRating;
      const capped=effective&&effective!==rating;
      const effectiveGrade=capped?GRADES.find(g=>g[0]===effective):null;
      bar.append(button('',()=>grade(rating,'click'),{class:`grade rating-${effectiveGrade?.[0]||rating}`,disabled:busy||!!pendingIntent||c.attempt.mode==='scored'&&!preview||c.attempt.mode==='practice'&&!customRun,'data-grade':rating}));
      if(interfaceLanguage==='ja')bar.lastChild.append(h('span',{class:'seal','aria-hidden':'true'},effectiveGrade?.[3]||seal));
      if(capped){
        if(interfaceLanguage!=='en')bar.lastChild.append(h('span',{'data-grade-capped-label':'ja'},`${jp} → ${effectiveGrade[1]} · ${wait}`));
        if(interfaceLanguage!=='ja')bar.lastChild.append(h('span',{'data-grade-capped-label':'en',lang:'en'},`${en} → ${effectiveGrade[2]} · ${translateInterfaceText(wait)}`));
      }else bar.lastChild.append(h('span',{'data-grade-label':''},jp),h('small',{},wait));
    }
    section.append(bar);
    if(pairedPhone)return;
    if(!practice&&!preview)section.append(h('p',{class:'grade-rule',role:'status','data-stale-attempt':''},'表示後に記録が変わりました。評価は送信していません。本棚からカードを開き直してください。'));
    if(practice)section.append(finishPractice());
    const help=[h('p',{class:'grade-rule'},'裏面を見て理解が深まったときは「もう一度」。迷いによる短縮は、保存後に取り消せます。'),
      button('内容の誤りを報告',()=>correctionDialog(),{class:'quiet'})];
    section.append(h('div',{id:'study-help',class:'study-help'},...help));
  }
  async function refreshPhoneRatings(c){
    if(disposed||current!==c||c.refreshingRatings||busy||pendingIntent)return;
    c.refreshingRatings=true;
    try{
      await backend.refresh();
      if(disposed||current!==c||busy||pendingIntent)return;
      // First retry this same attempt. A tap for which no command was made can
      // still be saved with its original rating and frozen recall time.
      try{
        const intent=c.requestedRating?gradeIntent(c,c.requestedRating):null;
        if(!intent)backend.preview(c.attempt,c.thinkMs);
        c.ratingsUnavailable=false;
        if(intent){c.requestedRating=null;submitGrade(c,intent);}
        return;
      }catch{/* Check whether this attempt actually changed or left the queue. */}
      const key=c.entry.taskKey, task=backend.readProjection().tasks[key];
      const options=customRun?.options;
      const eligible=options?backend.customSession({...options,untilDone:true}).entries:backend.queue({module:c.entry.module});
      let entry=eligible.find(item=>item.taskKey===key);
      if(!entry&&!options&&c.attempt.learnAhead){
        const next=nextRapidFireStudy(backend,module,now());
        if(next?.entry.taskKey===key)entry=next.entry;
      }
      if(!entry){
        advanceStudy(key);
        message('前のカードは学習対象から外れたため、採点していません。');
      }else if(task&&(task.head!==c.attempt.parent||task.contentRevision!==c.attempt.contentRevision)){
        start(entry,c.attempt.mode==='practice',c.attempt.learnAhead,options);
        message('カードが更新されました。もう一度答えを表示して評価してください。');
      }
    }catch{/* A local read can fail. Keep this card and the retry control. */}
    finally{
      c.refreshingRatings=false;
      if(!disposed&&current===c&&!busy&&!pendingIntent)render();
    }
  }
  function advanceStudy(previousKey){
    if(customRun){advanceCustomSession();return;}
    const next=nextRapidFireStudy(backend,module,now(),previousKey);
    if(next?.entry)start(next.entry,false,next.early);
    else navigate('today');
  }
  async function run(intent,onSuccess=pendingAction||(()=>{}),allowObservation=pendingObservation) {
    if(busy||disposed)return;
    if(pendingIntent&&pendingIntent.commandId!==intent.commandId)return message('前の保存を先に確認してください。');
    pendingAction=onSuccess;
    pendingObservation=allowObservation;
    busy=true;pendingIntent=intent;root.setAttribute('aria-busy','true');
    for(const b of main.querySelectorAll('[data-grade]'))b.disabled=true;
    let result;
    try { result=await backend.submitCommand(intent); }
    catch { result={kind:'failed'}; }
    if(disposed)return;
    busy=false;root.removeAttribute('aria-busy');
    if(result.kind==='failed'){message('保存できませんでした。同じカードのまま再試行してください。');render();return;}
    pendingIntent=null;pendingAction=null;pendingObservation=false;
    if(result.kind!=='durable'&&!(allowObservation&&result.kind==='observation-only'&&result.reason==='practice-or-assisted')){message('この操作を保存できませんでした。記録と入力は残っています。もう一度お試しください。');render();return;}
    onSuccess(result);await updateStatus();
  }
  function gradeIntent(c,rating){
    return c.attempt.mode==='practice'?backend.command('review',backend.practiceData(c.attempt,rating,c.thinkMs)):backend.preview(c.attempt,c.thinkMs).intents[rating];
  }
  function submitGrade(c,intent){
    const practice=c.attempt.mode==='practice';
    const admission={learnAhead:c.attempt.learnAhead,session:customRun?.options??c.attempt.session??null,run:customRun?{...customRun,remaining:[...customRun.remaining]}:null};
    run(intent,result=>{
      c.committed=true;if(!practice)lastReview={...result,entry:c.entry,...admission};
      if(customRun)customRun.completed++;
      advanceStudy(c.entry.taskKey);
    },practice);
  }
  function grade(rating,source) {
    const c=current;
    if(busy||pendingIntent||pop||document.querySelector('dialog[open]')||!c?.revealed||c.committed||c.ratingsUnavailable||c.attempt.mode!=='scored'&&!customRun)return;
    let intent;
    try{intent=gradeIntent(c,rating);}
    catch{
      if(pairedPhone){c.requestedRating=rating;c.ratingsUnavailable=true;render();refreshPhoneRatings(c);}
      else message('表示後に記録が変わりました。評価は送信していません。本棚からカードを開き直してください。');
      return;
    }
    submitGrade(c,intent);
  }
  async function requestCard(result,capture,source){
    if(!platform.requestCard){message('言葉を保存しました。カード作成の通信は準備中です。');return;}
    await submitFactory(factoryRequest(result,capture,{learner:backend.learner,source}));
  }
  async function submitFactory(request){
    let timeout;
    try{const result=await Promise.race([platform.requestCard(request),new Promise((_,reject)=>{timeout=win.setTimeout(()=>reject(Error('factory-timeout')),10000);})]);if(disposed)return;if(result?.captureEventId!==request.captureEventId||!['queued','joined','already-card','held','ignored'].includes(result?.status)||['queued','joined','held'].includes(result.status)&&!result.jobId&&!(result.status==='held'&&result.reason==='daily-job-cap'))throw Error('factory-response');factoryRetry=null;message(result.status==='queued'||result.status==='joined'&&result.jobStatus!=='held'?'カード作成を依頼しました。校閲を終えてから届きます。':result.status==='already-card'?'この言葉のカードはすでにあります。':result.status==='held'&&result.reason==='daily-job-cap'?'今日のカード作成の上限を使い切りました。言葉の記録は保存しています。':result.status==='held'||result.status==='joined'&&result.jobStatus==='held'?'読み・語義の確認待ちとして保存しました。':'作成の希望を記録しました。');}
    catch{if(disposed)return;factoryRetry=request;message('言葉は保存しましたが、カード作成の依頼を送れませんでした。同じ依頼を再試行できます。');}
    finally{win.clearTimeout(timeout);if(!disposed)render();}
  }
  function resolveWord(surface) {
    const exact=catalog.filter(e=>e.contractId==='vocabulary.read.v1'&&[e.term,e.form].includes(surface));
    const unique=new Map(exact.map(e=>[e.noteGuid,e]));
    return unique.size===1?[...unique.values()][0]:null;
  }
  function closePopover() { const wasOpen=!!pop;pop?.node.remove();pop=null;if(wasOpen&&!disposed&&screen==='study')focusStudyCard(); }
  async function openWord(info,anchor) {
    if(!current?.revealed||busy||pendingIntent)return;
    closePopover();
    const e=current.entry,resolved=dictionary?.resolve(info),target=info.isTarget&&e.contractId==='vocabulary.read.v1'?e:resolved?resolved.deck||null:resolveWord(info.surface),p=backend.readProjection();
    const meaning=target?.defJa||(resolved?.kind==='dictionary'?resolved.glosses.join('; '):resolved?.kind==='kanji'?resolved.meanings.join('; '):null);
    const reading=target?.reading||resolved?.reading||(resolved?.kind==='kanji'?resolved.readings.join('・'):null);
    const hasEntry=!!target||resolved&&resolved.kind!=='pending';
    const capture={surface:info.surface,kind:'lookup',location:info.location,contextTaskKey:e.taskKey,contentRevision:current.attempt.contentRevision,revealed:true,
      span:info.span,targetTaskKey:target?.taskKey??null,depth:info.depth??1,source:info.source??{context:info.location==='definition'?e.defJa:e.ja},...(target?{lemma:target.term,reading:target.reading,resolution:{status:'catalog-exact',guid:target.noteGuid}}:resolved?.lemma?{lemma:resolved.lemma,...(resolved.reading?{reading:resolved.reading}:{}),resolution:{status:hasEntry?'dictionary':'unresolved',source:resolved.source||null}}:{})};
    const lookupEntry=target&&resolved?.kind!=='chunk'?target:{term:resolved?.kind==='chunk'?resolved.surface:resolved?.lemma||info.surface,reading,pos:Array.isArray(resolved?.pos)?resolved.pos.join(' · '):null,meaning:resolved?.glosses?.join('; ')||meaning,sourceIsInterfaceCopy:resolved?.kind==='chunk',source:resolved?.kind==='chunk'?'形態素解析による語のまとまり。各部分の語義・文法は配布デッキとJMdictに基づきます。':resolved?.source?`${resolved.source} · EDRDG · ${resolved.sourceId||''}`:null};
    const attempt=current.attempt;let lookupPending=true,lookupReady,actionAccepted=false;
    const openRelated=async term=>{if(actionAccepted)return;actionAccepted=true;closePopover();if(lookupPending)await lookupReady;if(disposed)return;query=term;wordFilter='all';wordPage=0;navigate('words');};
    const node=h('aside',{class:'word-popover',role:'dialog','aria-label':`${info.surface}の言葉`},
      button('閉じる',closePopover,{class:'popover-close'}),
      hasEntry?renderVocabularyEntry(document,lookupEntry,{dictionary,hideUnavailable:!target,onWord:nested=>openWord({...nested,depth:(info.depth||1)+1},null),relatedWords:catalog}):h('div',{},h('h2',{'data-vocabulary-entry':''},info.surface),h('p',{},'この語は辞書に見つかりませんでした。記録して確認に回します。')),
      info.surface!==lookupEntry.term?h('p',{class:'surface-form'},h('span',{'data-interface-copy':''},'本文のタップ'),'：',h('span',{'data-vocabulary-source':''},info.surface)):null,
      target?button('この言葉のカードへ',()=>openRelated(target.term),{class:'text-link','data-dictionary-card':''}):null,
      resolved?.kind==='chunk'?h('div',{class:'lookup-parts','data-lookup-chunk':''},h('h3',{},'組み立て'),...resolved.parts.map(part=>fold(h('span',{'data-vocabulary-source':''},`${part.surface} → ${part.lemma||part.surface}`),renderVocabularyEntry(document,{term:part.lemma||part.surface,reading:part.reading,meaning:part.glosses?.join('; '),source:part.source||null},{dictionary,hideUnavailable:true}),part.deck?button('この言葉のカードへ',()=>openRelated(part.deck.term),{class:'text-link'}):null)),resolved.grammar?h('div',{'data-chunk-grammar':''},h('h3',{'data-vocabulary-source':''},resolved.grammar.term),h('p',{lang:'en'},resolved.grammar.meaning),button('文法カードへ',()=>openRelated(resolved.grammar.term),{class:'text-link','data-grammar-card':''})):null):null,
      h('div',{class:'capture-actions'},...[['unknown','知らない'],['unsure','うろ覚え'],['known','知っている']].map(([kind,label])=>button(label,async()=>{
        if(actionAccepted||busy&&!lookupPending)return;actionAccepted=true;closePopover();
        if(lookupPending)await lookupReady;if(disposed)return;busy=true;
        let result;try{result=await backend.capture(attempt,{...capture,kind});}catch{result={kind:'failed'};}busy=false;
        if(result.kind==='durable'){if(kind==='unknown'||kind==='unsure'&&!target)await requestCard(result,{...capture,kind},'tap');else message(kind==='unsure'?'迷いを記録しました。':'知っているという記録を残しました。');}
        else message('記録できませんでした。もう一度タップしてください。');
        if(pop?.node===node)closePopover();render();
      }))),h('p',{class:'secondary','data-dictionary-source':''},resolved?.kind==='chunk'?'語のまとまり · 配布デッキ / JMdict':target?'配布デッキ · 本棚にあります。':resolved?.kind==='dictionary'?'JMdict · EDRDG · CC BY-SA 4.0':resolved?.kind==='kanji'?'KANJIDIC2 · EDRDG · CC BY-SA 4.0':'辞書未収録 · 読み・語義の確認待ち'));
    pop={node,anchor};root.append(node);localize();node.querySelector('button').focus({preventScroll:true});
    busy=true;
    const result=await (lookupReady=Promise.resolve(backend.capture(attempt,capture)).catch(()=>({kind:'failed'})));lookupPending=false;busy=false;
    if(result.kind!=='durable')message('タップの記録を保存できませんでした。再度お試しください。');
    if(!disposed)render();
    updateStatus();
  }
  function kanjiPanel(entry) {
    const div=renderVocabularyRelated(document,entry,{onWord:openWord,relatedWords:catalog,dictionary,onRelated:e=>{query=e.term;navigate('words');}});
    div.append(button('Macの辞書で調べる',()=>platform.openDictionary?.(entry.term),{disabled:!platform.openDictionary,class:'quiet','data-interface-copy':''}),!platform.openDictionary?h('p',{class:'secondary','data-interface-copy':''},'Macのシステム辞書は未通信です。'):null);return div;
  }
  function leechPanel(task) {
    const sibling=catalog.find(e=>e.noteGuid===task.noteGuid&&e.contractId===task.contract&&e.taskKey!==task.taskKey&&!backend.readProjection().tasks[e.taskKey].card);
    return h('div',{class:'leech'},h('h2',{},'このカードを整える'),h('p',{},`このカードだけで ${task.card.lapses} 回のつまずき。文脈を変える、ヒントを付ける、休ませる。`),
      button('別の文脈へ',()=>backend.mutate('repair',task.taskKey,{action:'swap',replacementTaskKey:sibling.taskKey,replacementParent:backend.readProjection().tasks[sibling.taskKey].head}).then(()=>render()),{disabled:!sibling}),
      button('ヒントを付ける',()=>hintDialog(task)),button('休ませる',()=>backend.mutate('repair',task.taskKey,{action:'suspend'}).then(()=>navigate('today'))),
      button('このまま続ける',()=>backend.mutate('repair',task.taskKey,{action:'keep'}).then(()=>render())));
  }
  function dialog(title,body,save) {
    const node=h('dialog',{},h('form',{method:'dialog'},h('h2',{},title),body,h('div',{class:'dialog-actions'},button('キャンセル',()=>{node.close();node.remove();}),button('記録する',async()=>{await save();node.close();node.remove();},{class:'primary'}))));
    root.append(node);node.showModal();localize();return node;
  }
  function hintDialog(task){const input=h('textarea',{'aria-label':'ヒント',required:true});dialog('このカードのヒント',input,async()=>{if(input.value.trim()){await backend.mutate('repair',task.taskKey,{action:'hint',hint:input.value.trim()});message('ヒントを記録しました。');render();}});}
  function correctionDialog(){const input=h('textarea',{'aria-label':'気になったところ',required:true});dialog('気になったところ',input,async()=>{
    if(!input.value.trim())return;const e=current.entry,form=e.form||e.term,start=Math.max(0,e.ja.indexOf(form));await backend.capture(current.attempt,{surface:form,kind:'correction',location:'passage',contextTaskKey:e.taskKey,contentRevision:current.attempt.contentRevision,revealed:true,
      span:{start,end:start+form.length,unit:'utf16-code-unit'},targetTaskKey:null,source:{venue:'standalone-qa',note:input.value.trim(),context:e.ja}});message('訂正の希望を記録しました。内容監査への配信は通信待ちです。');});}
  function undoLast(){const previous=lastReview;if(!previous)return;const p=backend.readProjection(),task=p.tasks[previous.entry.taskKey],effect=task&&p.effects[task.head];if(!effect||effect.root!==previous.eventId)return message('このカードは現在の状態から戻せません。');run(backend.command('undo',{taskKey:task.taskKey,parent:task.head,target:effect.root}),()=>{lastReview=null;customRun=previous.run?{...previous.run,remaining:[...previous.run.remaining]}:null;start(previous.entry,false,previous.learnAhead,previous.session);});}
  function overrideLastReviewButton(p){if(!lastReview)return null;const review=p.reviews.find(r=>r.id===lastReview.eventId),task=p.tasks[lastReview.entry.taskKey];if(!review||review.rawRating===review.effectiveRating||!task)return null;return button('選んだ評価に戻す',()=>run(backend.command('hesitation-override',{taskKey:task.taskKey,parent:task.head,target:review.id}),()=>{message('選んだ評価に戻しました。');render();}),{class:'quiet','data-override':''});}
  function wordsScreen(){
    reconcileUnknownFactoryRows();
    const section=h('section',{},h('h1',{},'単語とカード'),h('p',{class:'secondary'},'文法の意味と想起は、別々のカードとして記録します。'));
    const input=h('input',{type:'search',placeholder:'言葉・読み・意味を検索','aria-label':'言葉を検索',value:query,oninput:e=>{query=e.target.value;wordPage=0;refreshRows();}});
    const filter=h('select',{'aria-label':'カードの状態',onchange:e=>{wordFilter=e.target.value;wordPage=0;refreshRows();}},...['all','suspended','leech','held'].map((s,i)=>h('option',{value:s,...(s==='held'?{'data-interface-option':''}:{})},['すべて','休ませているカード','つまずき5回以上','カード作成の依頼'][i])));filter.value=wordFilter;
    const rows=h('div',{class:'word-list'});
    let visibleCaptures=[];
    function paintFactoryRows(){
      if(disposed||screen!=='words'||wordFilter!=='held')return;
      rows.replaceChildren();for(const c of visibleCaptures){const status=factoryStatuses.read(c.id),entry=status.taskKey?catalog.find(e=>e.taskKey===status.taskKey):null;
        rows.append(h('div',{class:'word-row','data-factory-capture':c.id,'data-factory-state':status.kind},h('div',{},h('strong',{'data-vocabulary-entry':''},c.surface),h('span',{'data-factory-label':''},status.label),status.reasonLabel?h('small',{'data-factory-reason':''},status.reasonLabel):null,status.loading?h('small',{},'状況を確認中…'):status.failed?h('small',{},'状況を読み取れませんでした。'):!status.supported?h('small',{},'この端末では状況確認に未対応です。'):null),entry?button('このカードを開く',()=>{const latest=factoryStatuses.read(c.id);if(latest.kind==='ready'&&latest.taskKey===entry.taskKey)start(entry,true);},{class:'quiet','data-factory-open':entry.taskKey}):null));}
      if(!visibleCaptures.length)rows.append(h('p',{class:'empty'},'カード作成の依頼はありません。'));
      localize();
    }
    function refreshRows(){const p=backend.readProjection();factoryStatuses.leave();rows.replaceChildren();if(wordFilter==='held'){
      const captures=p.captures.filter(c=>!c.targetTaskKey&&['unknown','unsure'].includes(c.kind)&&`${c.surface} ${c.lemma||''} ${c.reading||''}`.toLowerCase().includes(query.toLowerCase())).slice().reverse();
      wordPage=Math.min(wordPage,Math.max(0,Math.ceil(captures.length/20)-1));visibleCaptures=captures.slice(wordPage*20,(wordPage+1)*20);refreshFactoryRows=paintFactoryRows;
      factoryStatuses.inspectVisible(visibleCaptures);paintFactoryRows();
      const controls=h('div',{class:'row-actions','data-factory-controls':''},button('状況を再確認',()=>{factoryStatuses.inspectVisible(visibleCaptures);paintFactoryRows();},{class:'quiet',disabled:!platform.inspectCardFactory||!visibleCaptures.length,'data-factory-refresh':''}));
      if(captures.length>20)controls.append(h('span',{},`${captures.length}件 · ${wordPage*20+1}〜${Math.min(captures.length,(wordPage+1)*20)}件`),button('前の20件',()=>{wordPage--;refreshRows();},{disabled:wordPage===0}),button('次の20件',()=>{wordPage++;refreshRows();},{disabled:(wordPage+1)*20>=captures.length}));
      rows.after(controls);section.querySelectorAll('[data-factory-controls]').forEach(node=>{if(node!==controls)node.remove();});localize();return;}
      section.querySelector('[data-factory-controls]')?.remove();refreshFactoryRows=()=>{};
      const matches=catalog.filter(e=>{const t=p.tasks[e.taskKey];return t&&`${e.term} ${e.reading} ${e.meaning}`.toLowerCase().includes(query.toLowerCase())&&(wordFilter!=='suspended'||t.suspended)&&(wordFilter!=='leech'||(t.card?.lapses??0)>=5);});
      wordPage=Math.min(wordPage,Math.max(0,Math.ceil(matches.length/100)-1));
      if(matches.length>100)rows.append(h('p',{class:'secondary','data-search-count':''},`${matches.length}件 · ${wordPage*100+1}〜${Math.min(matches.length,(wordPage+1)*100)}件を表示`));
      for(const e of matches.slice(wordPage*100,(wordPage+1)*100)){const t=p.tasks[e.taskKey];
        const item=h('div',{class:'word-row'},h('div',{},h('strong',{'data-vocabulary-entry':''},e.term),h('span',{class:'reading','data-vocabulary-entry':''},e.reading),h('small',{},`${MODULES.find(item=>item[0]===e.module)?.[1]||'学習'} · ${e.contractId==='grammar.cloze.v1'?'思い出す':e.contractId==='grammar.meaning.v1'?'意味':'読む'} · ${t.suspended?'休止':t.card?'学習中':'新規カード'}`)),
          h('div',{class:'row-actions'},button('追加練習',()=>start(e,true),{disabled:!contentReady(e)}),button(t.suspended?'戻す':'休ませる',async()=>{const result=await backend.mutate('suspend',t.taskKey,{on:!t.suspended});message(result.kind==='durable'?'カードの状態を保存しました。':'保存できませんでした。');refreshRows();updateStatus();})));
        if((t.card?.lapses??0)>=5)item.append(leechPanel(t));rows.append(item);}
      if(matches.length>100)rows.append(h('div',{class:'row-actions'},button('前の100件',()=>{wordPage--;refreshRows();},{disabled:wordPage===0}),button('次の100件',()=>{wordPage++;refreshRows();},{disabled:(wordPage+1)*100>=matches.length})));
      if(!rows.childNodes.length)rows.append(h('p',{class:'empty'},'見つかりませんでした。言葉や読みを変えてみてください。'));localize();
    }
    const typed=h('input',{'aria-label':'新しい言葉',placeholder:'覚えたい言葉を入力',value:typedDraft,disabled:typedBusy,'data-typed-word':'',oninput:e=>{typedDraft=e.target.value;}});
    const sentence=h('textarea',{'aria-label':'自分の例文（任意）',placeholder:'自分の例文（任意）',disabled:typedBusy,'data-typed-sentence':'',oninput:e=>{typedSentence=e.target.value;}},typedSentence);
    const saveTyped=async()=>{
      if(typedBusy||disposed||!typed.value.trim())return;
      typedDraft=typed.value;typedSentence=sentence.value;typedBusy=true;render();
      try{
        const result=await backend.captureTyped(typedDraft,{sentence:typedSentence});
        if(disposed)return;
        if(result.kind==='existing'){query=result.surface;wordFilter='all';wordPage=0;message(result.taskKeys.length===1?'本棚にあります。':'同じ表記のカードが複数あります。読み・意味を確認して選んでください。');}
        else if(result.kind==='durable'){await requestCard(result,result.capture,'typed');typedDraft='';typedSentence='';}
        else message(result.kind==='invalid'?'言葉は128文字、例文は4000文字以内で入力してください。':'保存できませんでした。入力は残しています。もう一度お試しください。');
      }catch{if(!disposed)message('保存を確認できませんでした。同じ入力を再試行できます。');}
      finally{typedBusy=false;if(!disposed){render();updateStatus();}}
    };
    section.append(h('div',{class:'search-controls'},input,filter),rows,h('h2',{},'言葉を足す'),h('p',{class:'secondary'},'既存の言葉を確認してから依頼します。例文は言葉の記録と一緒に保存します。'),h('div',{class:'typed-intake'},typed),h('div',{class:'setting-row'},h('label',{},h('span',{},'自分の例文（任意）'),sentence)),h('div',{class:'typed-intake'},button(typedBusy?'保存を確認中…':'記録する',saveTyped,{disabled:typedBusy,'data-typed-submit':''})));
    refreshRows();return section;
  }
  function recordScreen(){const p=backend.readProjection(),reviews=p.reviews.filter(r=>!r.undoneAt),bounds=dayBounds(now(),p.settings.learnerTimezone),today=reviews.filter(r=>r.dayStart===bounds.startsAt),recall=today.filter(r=>r.effectiveRating>=2).length;
    const taps=new Map();for(const c of p.captures)taps.set(c.surface,(taps.get(c.surface)||0)+1);
    const nextDue=Object.values(p.tasks).filter(t=>t.card&&!t.suspended).sort((a,b)=>Date.parse(a.card.due)-Date.parse(b.card.due)).slice(0,8);
    return h('section',{class:'record'},h('header',{class:'screen-head'},h('h1',{},'学習の記録')),
      h('div',{class:'sheet stat-sheet'},h('div',{class:'record-summary'},h('div',{},h('strong',{},String(today.length)),h('span',{},'今日の回答')),h('div',{},h('strong',{},today.length?`${Math.round(recall/today.length*100)}%`:'—'),h('span',{},'今日思い出せた割合')),h('div',{},h('strong',{},String(p.captures.length)),h('span',{},'言葉の記録')))),
      h('section',{class:'sheet'},h('h2',{},'これからの復習'),nextDue.length?h('ul',{class:'forecast'},...nextDue.map(t=>h('li',{},h('span',{'data-vocabulary-entry':''},catalog.find(e=>e.taskKey===t.taskKey)?.term||'カード'),h('span',{},displayDate(t.card.due,{dateStyle:'short',timeStyle:'short'}))))):h('p',{class:'empty'},'学習を始めると、復習の予定がここに現れます。')),
      ...(legacyHistory?[legacyArchive()]:[]),
      h('section',{class:'sheet'},h('h2',{},'よく触れた言葉'),taps.size?h('ul',{class:'forecast'},...[...taps].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([word,n])=>h('li',{},h('span',{'data-vocabulary-entry':''},word),h('span',{},`${n} 回`)))):h('p',{class:'empty'},'裏面の言葉をタップすると、ここに記録が残ります。')),
      h('section',{class:'sheet'},h('h2',{},'保存と取り出し'),h('div',{class:'sheet-actions'},button('すべての記録を書き出す',()=>downloadBackup(),{class:'primary','data-export':''})),h('p',{class:'secondary'},'テスト学習者のイベント・未送信記録・保存済みの範囲を含みます。Ankiのスケジュールとは別です。')));
  }
  function legacyArchive(){
    const rows=legacyHistory.decks.flatMap(d=>d.log.map(row=>({deck:d.deckId,row}))),lookups=legacyHistory.decks.flatMap(d=>d.lookups.map(row=>({deck:d.deckId,row})));
    const term=id=>catalog.find(e=>e.player?.cardId===id||e.taskKey===id)?.term||id;
    return h('section',{'data-legacy-history':''},h('h2',{},'引き継いだ学習記録'),h('p',{'data-legacy-counts':''},`以前の回答 ${legacyHistory.reviewCount} 件 · 調べた言葉 ${legacyHistory.lookupCount} 件 · このアプリの新しい回答 ${backend.readProjection().reviews.filter(r=>!r.undoneAt).length} 件`),
      h('p',{class:'secondary'},'以前の回答はそのまま保管しています。引き継いだ復習予定と重ねて採点し直すことはありません。Anki・Bunkiの履歴はまだ統合していません。'),
      h('ul',{class:'forecast'},...rows.map(({deck,row})=>h('li',{'data-legacy-review':''},h('span',{'data-vocabulary-entry':''},term(row[0])),h('span',{},`${deck} · 評価 ${row[1]} · ${row[2]}`)))),
      fold('調べた言葉の記録',h('ul',{class:'forecast'},...lookups.map(({deck,row})=>h('li',{'data-legacy-lookup':''},h('span',{'data-vocabulary-entry':''},row[3]||term(row[1])),h('span',{},`${deck} · ${row[0]}`))))));
  }
  async function downloadBackup(){const backup=await backend.exportBackup(),blob=new win.Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=win.URL.createObjectURL(blob),link=h('a',{href:url,download:`nihongo-${backend.learner}-${now()}.json`});link.click();setTimeout(()=>win.URL.revokeObjectURL(url),1000);message('バックアップを書き出しました。');}
  function nativeSyncNeedsAttention(){return !!(nativeSyncActionError||nativeSyncState.error||nativeSyncState.state==='update-required');}
  function nativeSyncDescription(){
    if(nativeSyncBusy)return '通信を確認中…';
    const error=nativeSyncActionError||nativeSyncState.error;
    if(error==='pairing-disabled')return '端末の同期の設定は実機テスト時に有効になります。';
    if(error==='native-sync-bootstrap-required')return '既存の学習履歴を先に安全に引き継ぐ必要があります。';
    if(['authentication-required','credential-storage-failed','invalid-credential'].includes(error))return platform.storageKind==='native-worker-prod'?'このMacの認証を確認してください。「今すぐ同期」を押し、macOSの確認画面でMacのログインパスワードを使ってNihongo Studyを「常に許可」してください。未送信の記録は端末に残っています。':'認証の確認が必要です。未送信の記録は端末に残っています。';
    if(error==='update-required'||nativeSyncState.state==='update-required')return 'アプリの更新が必要です。更新するまで同期を一時停止します。未送信の記録はこの端末に残っています。';
    if(error)return '通信を確認できませんでした。未送信の記録は端末に残っています。同じ操作を再試行できます。';
    if(!nativeSyncState.paired)return '同期はまだ設定されていません。';
    if(platform.storageKind==='native-worker-prod')return nativeSyncState.state==='up-to-date'?'このMacは同期設定済み · 記録を同期しました。':'このMacは同期設定済み · 今すぐ同期できます。';
    return nativeSyncState.state==='up-to-date'?'同期済み · 記録を保存しました。':'同期設定済み · 今すぐ同期できます。';
  }
  async function runNativeSync(action,{quiet=false,onSuccess}={}){
    if(nativeSyncBusy||disposed)return;
    const show=()=>{if(quiet&&screen!=='settings')updateStatus().catch(()=>{});else render();};
    nativeSyncBusy=true;nativeStatusGeneration++;show();
    try{
      const result=await action();
      if(disposed)return;
      nativeSyncState=result;nativeSyncActionError=result.error||(result.state==='update-required'?'update-required':null);
      if(!nativeSyncActionError)onSuccess?.(result);
      if(!quiet||nativeSyncActionError)message(nativeSyncActionError?'同期を完了できませんでした。記録は端末に残っています。':'通信と保存状態を確認しました。','native-sync-action');
      else if(noticeOwner==='native-sync-action')message('');
    }catch(error){
      if(!disposed){nativeSyncActionError=error?.message||'operation-failed';nativeSyncState={...nativeSyncState,state:'error',error:nativeSyncActionError};message(nativeSyncActionError==='native-sync-bootstrap-required'?'既存の学習履歴を先に安全に引き継ぐ必要があります。':'通信を確認できませんでした。未送信の記録は端末に残っています。同じ操作を再試行できます。','native-sync-action');}
    }finally{nativeSyncBusy=false;nativeStatusGeneration++;if(!disposed)show();}
  }
  function nativeSyncSettings(){
    if(platform.storageKind==='native-worker-prod'){
      return h('section',{'data-native-sync-controls':''},h('h2',{},'この端末の同期を設定'),
        h('p',{role:'status','data-native-sync-status':''},nativeSyncDescription()),
        h('div',{class:'row-actions'},button(nativeSyncState.paired?'このMacは同期設定済み':'このMacの同期を設定',()=>runNativeSync(()=>platform.nativeSync.pairThisMac()),{disabled:nativeSyncBusy||!platform.nativeSync.pairingEnabled||nativeSyncState.paired,'data-native-pair-mac':''}),
          button('今すぐ同期',()=>runNativeSync(()=>platform.nativeSync.sync({interactive:true})),{class:'primary',disabled:nativeSyncBusy,'data-native-sync':''})),
        button('iPhoneとの同期を設定',()=>runNativeSync(()=>platform.nativeSync.issueDeviceCode()),
          {disabled:nativeSyncBusy||!platform.nativeSync.pairingEnabled||!nativeSyncState.paired,'data-native-issue-code':''}),
        h('p',{class:'secondary'},'QRコードをiPhoneで読み取るか、表示された12桁のコードを入力してください。'));
    }
    const code=h('input',{'aria-label':'同期コード',autocomplete:'one-time-code',maxlength:20,value:nativePairDraft,oninput:e=>{nativePairDraft=e.target.value;},'data-native-pair-code':'',disabled:nativeSyncBusy});
    return h('section',{'data-native-sync-controls':''},h('h2',{},'テスト用の同期'),h('p',{class:'secondary'},'開発用の通信確認です。既存のMacの学習履歴とは別のテスト記録を使います。'),h('p',{role:'status','data-native-sync-status':''},nativeSyncDescription()),h('label',{},'12桁の同期コード',code),h('div',{class:'row-actions'},
      button('同期を設定',()=>runNativeSync(()=>platform.nativeSync.pair(nativePairDraft),{onSuccess:result=>{if(result.paired)nativePairDraft='';}}),{disabled:nativeSyncBusy,'data-native-pair':''}),
      button('今すぐ同期',()=>runNativeSync(()=>platform.nativeSync.reserve()),{class:'primary',disabled:nativeSyncBusy,'data-native-sync':''})),h('p',{class:'secondary'},'同期後に、今日の新規カードを学習できます。'));
  }
  // Editors show the saved plan for the next study day. Admission still reads the effective policy.
  function plannedSettings(projection){
    return {...projection.settings,...Object.fromEntries(projection.pendingSettings.map(({key,value})=>[key,value]))};
  }
  function diagnosticValues(){return JSON.stringify({learner:backend.learner,installation:backend.installation,storage:platform.storageKind,replica:lastSaveStatus,sync:nativeSyncState},null,2);}
  function settingsScreen(){
    const p=backend.readProjection(),planned=plannedSettings(p),weekdayPolicy=!!planned.studyPolicy;
    const paceInput=(key,attrs)=>h('input',{...attrs,id:'study-pace-'+key,value:paceDraft[key]??planned[key],oninput:event=>{paceDraft[key]=event.currentTarget.value;}});
    const newCount=paceInput('newPerDayTotal',{type:'number',min:1,max:200,disabled:weekdayPolicy,'aria-label':'1日の新規カード上限'});
    const tz=paceInput('learnerTimezone',{'aria-label':'学習日のタイムゾーン'});
    function savePace(key,input,value){
      const submitted=input.value;
      run(backend.command('settings',{key,value}),()=>{
        if(paceDraft[key]===submitted)delete paceDraft[key];
        message('翌日の学習日から変更します。');render();
      });
    }
    const swipe=h('input',{type:'checkbox',checked:swipeGrading,'data-swipe-grading':'','aria-describedby':'swipe-grading-help',onchange:async event=>{
      const input=event.currentTarget,previous=swipeGrading;swipeGrading=input.checked;
      try{await preferences.setItem('nihongo.swipe-grading.v1',String(swipeGrading));}
      catch{swipeGrading=previous;input.checked=previous;message('この端末に操作の設定を保存できません。');}
    }});
    const file=h('input',{type:'file',accept:'.json,application/json','aria-label':'バックアップを選ぶ',onchange:async e=>{try{const backup=JSON.parse(await e.target.files[0].text());await backend.importBackup(backup);message('互換のある保存済み記録を追加しました。');render();}catch(error){message(error.message==='backup-has-pending-events-recovery-required'?'未送信の記録を含むため自動復元できません。元の端末とバックアップを保管してください。':'学習者・内容の整合性を確認できませんでした。記録は置き換えていません。');}}});
    const sheet=(id,kicker,title,description,...body)=>h('section',{class:'sheet','data-settings-section':id},h('div',{class:'sheet-head'},h('p',{class:'kicker'},kicker),h('h2',{},title),description?h('p',{class:'sheet-desc'},description):null),...body);
    return h('section',{class:'settings'},h('header',{class:'screen-head stacked'},h('h1',{},'設定'),h('p',{class:'secondary'},'この端末の表示と、すべてのデッキ共通の学習設定。')),...(platform.nativeSync?[nativeSyncSettings()]:[]),
      sheet('appearance','表示','この端末の見え方','色はこの端末だけに保存します。学習履歴や他の端末の色は変わりません。',h('div',{class:'control-grid'},themePicker(),languagePicker()),h('label',{class:'swipe-grading-setting'},swipe,h('span',{},'スワイプで採点（この端末のみ）')),h('p',{id:'swipe-grading-help',class:'secondary'},'初期設定はオフです。左で「もう一度」、右で「正解」。')),
      ...(legacyHistory?[sheet('legacy-display','引き継ぎ','引き継いだ表示設定',null,...legacyHistory.decks.map(d=>h('p',{class:'secondary','data-legacy-settings':''},`${d.deckId} · 一日の新規 ${d.preferences.newPerDay} · 読み方 ${d.preferences.mode} · 全文英訳 ${d.preferences.gloss} · 文脈 ${d.preferences.zoom}`)),h('p',{class:'secondary'},themePreferenceSet?'色はこの端末の指定を使っています。':'以前の色指定は未設定です。自動表示のまま、設定値は書き込んでいません。'))]:[]),
      sheet('pace','学習','共通の学習ペース','1日の新規カード上限と学習日の区切りは、すべてのデッキ共通です。変更は翌日の学習日から有効です。',h('div',{class:'setting-row'},h('label',{},'1日の新規カード上限',newCount),button('翌日から変更',()=>{const value=newCount.valueAsNumber;if(!Number.isSafeInteger(value)||value<1||value>200)return message('1日の新規カード上限は1〜200の整数を入力してください。');savePace('newPerDayTotal',newCount,value);},{disabled:weekdayPolicy})),weekdayPolicy?h('p',{class:'secondary','data-weekday-policy-active':''},'曜日ごとの新規カード上限を使っています。今日のカスタム学習パネルで変更できます。'):null,
      h('div',{class:'setting-row'},h('label',{},'学習日のタイムゾーン',tz),button('翌日から変更',()=>savePace('learnerTimezone',tz,tz.value))),
      p.pendingSettings.length?h('p',{class:'sheet-note'},'翌日からの設定変更を保存しています。'):null),
      sheet('backup','データ','バックアップ','記録をすべて書き出すか、互換のあるバックアップを追加します。',h('div',{class:'sheet-actions'},button('すべて書き出す',()=>downloadBackup(),{class:'quiet'})),h('label',{class:'file-field'},h('span',{},'バックアップを選ぶ'),file),h('p',{class:'secondary'},'同じ端末の互換な保存済み記録だけを追加します。別端末ごとに作った模擬割当の履歴は統合できません。未送信記録は自動移行せず、元の端末とバックアップの保管が必要です。')),
      h('p',{class:'content-note'},nativeSyncState.paired?'記録はこのMacに保存され、iPhoneと同期されます。':'記録はこの端末に保存されます。'),
      h('details',{'data-study-diagnostics':'',class:'sheet'},h('summary',{},'診断情報'),h('p',{},'技術的な保存・同期の情報です。'),h('pre',{'data-study-diagnostics-values':''},diagnosticValues())));
  }
  function onKey(event){if(event.defaultPrevented||event.repeat||event.isComposing||event.keyCode===229||event.metaKey||event.ctrlKey||event.altKey||busy||pop||document.querySelector('dialog[open]')||event.target.closest?.('button,input,select,textarea,summary,a,audio,video,[contenteditable]'))return;
    if(event.key.toLowerCase()==='u'&&lastReview){event.preventDefault();undoLast();return;}
    if(screen!=='study'||!current)return;
    if(!current.revealed&&!event.shiftKey&&[' ','Enter'].includes(event.key)&&win.getSelection()?.isCollapsed!==false){event.preventDefault();revealCard(current,'key');}
    else if(current.revealed&&!current.committed&&['1','2','3','4'].includes(event.key)){event.preventDefault();grade(Number(event.key),'key');}}
  document.addEventListener('keydown',onKey);
  const outsidePopover=event=>{if(pop&&!pop.node.contains(event.target)&&!pop.anchor?.contains(event.target))closePopover();};document.addEventListener('pointerdown',outsidePopover,true);
  const escape=event=>{if(event.key==='Escape'){if(pop){event.preventDefault();closePopover();}else{const modal=root.querySelector('dialog[open]');if(modal){event.preventDefault();modal.close();modal.remove();}}}};document.addEventListener('keydown',escape);
  const unsubscribe=backend.subscribe(()=>{updateStatus().catch(()=>{});if(screen!=='study'&&!busy)render();scheduleOutboxSync();});
  if(backend.refreshLocalDayBudget)budgetWatcher=watchLocalDayBudget({refresh:()=>backend.refreshLocalDayBudget(),getProjection:()=>backend.readProjection(),now,canRefresh:()=>!busy&&!typedBusy&&!customBusy&&!pendingIntent&&!(screen==='study'&&current?.revealed),onRefresh:()=>{if(screen!=='study')render();},schedule:(fn,delay)=>win.setTimeout(fn,delay),cancel:id=>win.clearTimeout(id)});
  const budgetWake=()=>{if(document.visibilityState!=='hidden')budgetWatcher?.check();};
  win.addEventListener('focus',budgetWake);document.addEventListener('visibilitychange',budgetWake);
  // Local writes wake the same Sync action. Its refresh notifications must not
  // start another sync: only a durable, nonempty outbox requests this work.
  let outboxSyncTimer=null;
  const autoSyncAllowed=()=>!disposed&&document.visibilityState!=='hidden'&&platform.storageKind==='native-worker-prod'&&platform.nativeSync?.pairingEnabled&&nativeSyncState.paired&&!nativeSyncActionError&&!nativeSyncState.error&&nativeSyncState.state!=='update-required';
  function scheduleOutboxSync(){
    if(disposed||platform.storageKind!=='native-worker-prod')return;
    win.clearTimeout(outboxSyncTimer);
    outboxSyncTimer=win.setTimeout(async()=>{
      outboxSyncTimer=null;
      if(!autoSyncAllowed()||pendingIntent)return;
      if(nativeSyncBusy||busy||typedBusy||customBusy){scheduleOutboxSync();return;}
      try{
        const status=await backend.status();
        if(!autoSyncAllowed()||nativeSyncBusy||busy||typedBusy||customBusy||pendingIntent)return;
        if(status.pendingUpload>0)await runNativeSync(()=>platform.nativeSync.sync(),{quiet:true});
      }catch{/* Save-status polling reports a failed local read. */}
    },300);
  }
  // Production foreground sync: a paired Mac syncs quietly when it comes to the front, at most once a minute; errors still surface.
  let lastAutoSync=0;
  const autoSync=()=>{if(!autoSyncAllowed()||nativeSyncBusy||busy||typedBusy||customBusy||pendingIntent)return;
    const at=now();if(at-lastAutoSync<60000)return;lastAutoSync=at;runNativeSync(()=>platform.nativeSync.sync(),{quiet:true});};
  win.addEventListener('focus',autoSync);document.addEventListener('visibilitychange',autoSync);
  render();
  reconcileUnknownFactoryRows();
  if(platform.storageKind==='native-worker-prod'&&platform.nativeSync)updateStatus().then(autoSync).catch(()=>{});
  return Object.freeze({showTask:start,read:()=>({screen,current,busy:busy||typedBusy||customBusy,pendingIntent,theme,themePreferenceSet,interfaceLanguage}),dispose(){disposed=true;nativeStatusGeneration++;win.clearTimeout(outboxSyncTimer);win.clearTimeout(saveBacklogTimer);budgetWatcher?.dispose();win.removeEventListener('focus',budgetWake);document.removeEventListener('visibilitychange',budgetWake);win.removeEventListener('focus',autoSync);document.removeEventListener('visibilitychange',autoSync);platform.nativeSync?.dispose?.();factoryStatuses.dispose();current?.timer.dispose();closePopover();unsubscribe();dark.removeEventListener('change',darkChanged);document.removeEventListener('keydown',onKey);document.removeEventListener('keydown',escape);document.removeEventListener('pointerdown',outsidePopover,true);root.replaceChildren();}});
}
