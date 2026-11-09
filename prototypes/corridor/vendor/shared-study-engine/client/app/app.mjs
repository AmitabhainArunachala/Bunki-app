import {buildKanjiCapacityReport} from '../kanji/capacity.mjs';
import {renderKanjiCapacity} from '../kanji/panel.mjs';
export {startAcceptedAudioHost,acceptedAudioSourceRevision} from './accepted-audio-host.mjs';
export {createBrowserAudioPackHost} from './browser-audio-pack-host.mjs';
import {createBackupStatusObserver} from './backup-status.mjs';
import {createFactoryStatusReader,factoryRequest} from './factory-status.mjs';
import {applyKinsoku} from '../player/kinsoku.mjs';
import {watchRubyLayout} from '../player/ruby-layout.mjs';
import { createRecallTimer, createNode } from '../player/presentation.mjs';
import { renderVocabularyPassage,renderVocabularyBack,renderVocabularyRelated,renderVocabularyEntry } from '../player/vocabulary.mjs';
import {contentReady} from '../player/content-ready.mjs';
import {lookupReadingPresentation,reviewedDictionaryEntry,reviewedActionCapture} from '../player/passage-reading-evidence.mjs';
import { dayBounds } from '../replay.mjs';
import {translateInterfaceText,formatInterfaceText,defaultInterfaceLanguage,renderInterfacePair,formatStudyDate,formatStudyMinutes} from './interface-language.mjs';
import {nextStep} from '../vendor/engine.js';
import {customSessionPanel} from './custom-session.mjs';
import {studyDayView,studyNewCardAvailability,studyReviewSummary,studyNewCardCost} from './study-loop.mjs';
import {createSessionEvidence} from './session-timings.mjs';
import {operationState,retainOperationProof} from './operation-result.mjs';
import {createSharedActivityTracker} from './sync-evidence.mjs';
import {createUpdateBoundary} from './update-boundary.mjs';
import {isRetryableProdSyncError} from './prod-native-sync.mjs';
import {watchLocalDayBudget} from './local-budget.mjs';
import {createStudyAudio,studyAudioSourceFields,studyAudioSourcePlan,studyAudioProfileAssignments} from './study-audio.mjs';
const MODULES = [['all','すべて','すべてのデッキ'],['n2','N2','日本語能力試験'],['n1','N1','日本語能力試験'],['senmon','専門','考えを深める言葉'],['kotoba','わたしの言葉','拾い集めた言葉'],['grammar','文法','意味・思い出す']];
const GRADES = [[1,'もう一度','Again','再'],[2,'難しい','Hard','難'],[3,'正解','Good','良'],[4,'簡単','Easy','易']];
const interval = ms => ms < 60000 ? '1分未満' : ms < 3600000 ? `${Math.ceil(ms/60000)}分` : ms < 86400000 ? `${Math.ceil(ms/3600000)}時間` : `${Math.round(ms/86400000)}日`;

/** Select only from scheduler-admitted queues; daily permits and topic filters remain backend-owned. */
export function nextRapidFireStudy(backend,module='all',at=Date.now(),gradedTaskKey=null,onReadyQueue=null,backlog=false) {
  const another=entry=>entry.taskKey!==gradedTaskKey;
  const tasks=backend.readProjection().tasks,scoped=backend.queue({module,backlog}).filter(another);
  const chooseDue=(scope,ready,ahead)=>{
    const learning=backend.queue({module:scope,learningOnly:true}).filter(another);
    const entries=new Map([...ready,...learning].map(entry=>[entry.taskKey,entry]));
    const step=nextStep({now:new Date(at),ahead,
      queue:ready.filter(entry=>{const card=tasks[entry.taskKey]?.card;return card&&card.state!==0&&![1,3].includes(card.state);}).map(entry=>entry.taskKey),
      learning:learning.map(entry=>({id:entry.taskKey,due:Date.parse(tasks[entry.taskKey].card.due)}))});
    return step.show?{entry:entries.get(step.show),early:step.early}:null;
  };
  let fullReady;const allReady=()=>fullReady??=(module==='all'?scoped:backend.queue({module:'all',backlog}).filter(another));
  const selected=result=>{if(result?.entry&&onReadyQueue)onReadyQueue(allReady());return result;};
  const withinModule=chooseDue(module,scoped,false);
  if(withinModule?.entry)return selected(withinModule);
  const all=allReady(),otherDue=chooseDue('all',all,false);
  if(otherDue?.entry)return selected(otherDue);
  const fresh=entry=>{const card=tasks[entry.taskKey]?.card;return !card||card.state===0;};
  const entry=scoped.find(fresh)||all.find(fresh);
  if(entry)return selected({entry,early:false});
  const learning=backend.queue({module:'all',learningOnly:true}).filter(another).filter(entry=>{
    const card=tasks[entry.taskKey].card,due=Date.parse(card.due),reviewed=Date.parse(card.last_review);
    return Number.isFinite(reviewed)&&Number.isFinite(due)&&due>reviewed&&at-reviewed>=(due-reviewed)/2;
  });
  const early=nextStep({now:new Date(at),queue:[],ahead:true,learning:learning.map(entry=>({id:entry.taskKey,due:Date.parse(tasks[entry.taskKey].card.due)}))});
  return early.show?selected({entry:learning.find(entry=>entry.taskKey===early.show),early:early.early}):null;
}

/** Actual DOM app; backend commands own every learner mutation. */
export function mountStudyApp(root, { backend, catalog, themes, grammar = null, dictionary = null, platform = {}, corpus = null, legacyHistory = null, preferences = globalThis.localStorage, now = Date.now, initialModule = 'all' }) {
  if(!MODULES.some(([id])=>id===initialModule))throw Error('invalid-initial-module');
  const document = root.ownerDocument, win = document.defaultView;
  const pairedPhone = ['paired-dev','paired-prod'].includes(platform.storageKind);
  if(platform.presentation!==undefined&&!['phone','desktop'].includes(platform.presentation))throw Error('invalid-study-presentation');
  const phonePresentation=platform.presentation===undefined?pairedPhone:platform.presentation==='phone';
  const sharedAudioDeclared=platform.audioDownloadFailure===true||platform.audio!==undefined&&platform.audio!==null;
  const sharedAudioGuarded=sharedAudioDeclared&&typeof platform.audioDownloads?.authorizePlayback==='function';
  let audioDownloadsSuspended=false,audioDownloadActionFailed=false,audioDownloadsSnapshot=null;
  // Audio requires the current Japanese-only shared authority.
  const trialAudio=null;
  let trialAudioPlaybackGeneration=0;
  let sharedAudioOwner=null,sharedAudioRoot=null,sharedAudioRootState=sharedAudioGuarded?'idle':sharedAudioDeclared?'unsupported':'absent',sharedAudioRootPromise=null,sharedAudioRootController=null;
  const studyAudio=sharedAudioGuarded?createStudyAudio({capability:platform.audio,authorize:()=>sharedAudioAuthorized(),preflight:platform.audioDownloads?.authorizePlayback}):null;
  const h = (tag, attrs, ...children) => createNode(document, tag, attrs, ...children);
  const button = (text, fn, attrs = {}) => h('button', { type:'button', onclick: fn, ...attrs }, text);
  let screen = 'today', module = initialModule, current = null, busy = false, notice = '', pendingIntent = null, pendingAction = null, factoryRetry = null, disposed = false, pop = null, lastReview = null;
  let nativeSyncState={paired:false,state:'idle',error:null},nativeSyncBusy=false,nativeStatusGeneration=0,nativeSyncActionError=null,nativePairDraft='';
  let startupSyncPending=platform.storageKind==='native-worker-prod'&&!!platform.nativeSync;
  let saveStatusGeneration=0,noticeOwner=null;
  let saveBacklogSince=null,saveBacklogTimer=null,lastSaveStatus=null;
  let typedBusy=false,typedDraft='',typedSentence='';
  const typedSaved={word:'',sentence:''};
  let swipeGrading=false;try{swipeGrading=preferences.getItem('nihongo.swipe-grading.v1')==='true';}catch{}
  const shippedCatalog=catalog;
  const activityTracker=createSharedActivityTracker({installation:backend.installation,afterSeq:platform.activitySince??backend.readProjection().appliedSeq,now,labelForInstallation:platform.labelForInstallation});
  let sharedActivity=activityTracker.snapshot(),boundaryQueue=[],boundaryNotice=null,lastSharedActivityKey=null;
  const observeSharedActivity=()=>{sharedActivity=activityTracker.observe(backend.readSharedActivity?.(activityTracker.cursor),backend.readProjection());};
  const customOptions={mode:'review-ahead',aheadDays:1,size:20,untilDone:false,filters:{level:'',module:'all',tag:'',recentlyFailed:false,order:'due'}};
  let customRun=null,customBusy=false,pausedStudy=null,parkedStudy=null,scheduledPage=0,sessionShown=0,boundaryPreparation=null;
  const sessionPreferences=preferences&&typeof preferences.setItem==='function'?{
    getItem:key=>preferences.getItem(key),
    setItem(key,value){const result=preferences.setItem(key,value);trackPreferencePromise(result);return result;},
  }:preferences;
  const sessionEvidence=createSessionEvidence({preferences:sessionPreferences,learner:backend.learner,installation:backend.installation,now});
  let activeSession=null,finishState=null,finishGuardTimer=null,costState=null;const acknowledgedDays=new Set();
  let toastTimer=null,lastInputSource='pointer';const frontCache=new Map();
  let intervalHints=false;try{intervalHints=preferences.getItem('nihongo.interval-hints.v1')==='true';}catch{}
  let budgetWatcher=null;
  let pendingObservation=false,pendingOperation=null,operationSequence=0;
  const manualDraft={word:'',reading:'',meaning:'',example:'',note:''};
  const manualSaved={word:'',reading:'',meaning:'',example:'',note:''};
  const paceDraft={};
  let todayTotalDraft={};
  let weekdayDraft={},weekdayPending=null;
  const defaultLanguage=defaultInterfaceLanguage(win.navigator);
  let interfaceLanguage=defaultLanguage;try{const stored=preferences.getItem('nihongo.interface-language.v1');if(['ja','en','both'].includes(stored))interfaceLanguage=stored;}catch{}
  const originalLabels=new WeakMap(),originalAttributes=new WeakMap(),cardViews=new WeakMap();
  const copy=(tag,ja,en,attrs={})=>renderInterfacePair(h(tag,attrs),ja,en,interfaceLanguage,{inline:tag==='button'||attrs['data-interface-layout']==='inline'});
  const copyButton=(ja,en,action,attrs={})=>copy('button',ja,en,{type:'button',onclick:action,...attrs});
  const online=()=>typeof platform.isOnline==='function'?platform.isOnline():win.navigator.onLine!==false;
  let startedOffline=platform.startedOffline===true&&!online();
  const canRequestNewCards=()=>typeof platform.requestNewCards==='function'&&(typeof platform.canRequestNewCards==='function'?platform.canRequestNewCards({nativeSyncState}):platform.canRequestNewCards===true);
  const actionFlights=new Map();let actionFlightSeq=0,updateBoundary=null;
  function beginFlight(label){
    if(disposed)return()=>{};
    const id=++actionFlightSeq;actionFlights.set(id,label);updateBoundary?.sync();
    let ended=false;return()=>{if(ended)return;ended=true;actionFlights.delete(id);updateBoundary?.sync();};
  }
  function trackPreferencePromise(result){
    if(!result||typeof result.then!=='function')return result;
    const end=beginFlight('preference');result.then(()=>end(),()=>end());return result;
  }
  function trackBudgetRefresh(){
    const end=beginFlight('budget');
    let result;
    try{result=backend.refreshLocalDayBudget();}
    catch(error){end();throw error;}
    if(!result||typeof result.then!=='function'){end();return result;}
    return result.then(value=>{end();return value;},error=>{end();throw error;});
  }
  function storedPreference(key){try{return preferences.getItem(key);}catch{return null;}}
  function preferenceChanged(key,current,fallback,valid=()=>true){
    const stored=storedPreference(key);
    return stored==null||!valid(stored)?current!==fallback:String(stored)!==String(current);
  }
  function readUpdateBlockers(){
    const blockers=new Set();
    if(current&&!current.committed)blockers.add('attempt');
    if(parkedStudy||pausedStudy)blockers.add('paused-attempt');
    if(busy)blockers.add('busy');
    if(typedBusy)blockers.add('typed-busy');
    if(customBusy)blockers.add('custom-busy');
    if(pendingIntent||pendingOperation)blockers.add('pending-operation');
    if(boundaryPreparation)blockers.add('boundary-preparation');
    if(factoryRetry)blockers.add('factory-retry');
    if(weekdayPending)blockers.add('weekday-pending');
    if(costState?.pending)blockers.add('cost-pending');
    if(pop)blockers.add('lookup');
    if(document.querySelector('dialog[open]'))blockers.add('dialog');
    if((typedDraft&&typedDraft!==typedSaved.word)||(typedSentence&&typedSentence!==typedSaved.sentence))blockers.add('typed-draft');
    if(Object.keys(manualDraft).some(key=>manualDraft[key]!==manualSaved[key]))blockers.add('manual-draft');
    if(preferenceChanged('nihongo.interface-language.v1',interfaceLanguage,defaultLanguage,value=>['ja','en','both'].includes(value)))blockers.add('preference-language');
    if(preferenceChanged('nihongo.qa.appearance.v1',theme,'auto',value=>value==='auto'||Object.hasOwn(themes.themes,value)))blockers.add('preference-theme');
    if(preferenceChanged('nihongo.swipe-grading.v1',String(swipeGrading),'false',value=>value==='true'||value==='false'))blockers.add('preference-swipe');
    if(preferenceChanged('nihongo.interval-hints.v1',String(intervalHints),'false',value=>value==='true'||value==='false'))blockers.add('preference-hints');
    if(nativePairDraft.trim())blockers.add('pairing-draft');
    for(const field of document.querySelectorAll('[data-host-settings] input,[data-host-settings] textarea')){
      const hint=[field.id,field.name,field.getAttribute('data-pair-code'),field.getAttribute('data-invitation')].join(' ').toLowerCase();
      if(/(pair|invit)/.test(hint)&&String(field.value??'').trim())blockers.add('host-pairing-draft');
    }
    try{
      const planned=plannedSettings(backend.readProjection());
      if(Object.keys(paceDraft).some(key=>String(paceDraft[key])!==String(planned[key]??'')))blockers.add('pace-draft');
      const limits=planned.studyPolicy?.newByWeekday??Array(7).fill(planned.newPerDayTotal);
      if(Object.entries(weekdayDraft).some(([day,value])=>String(value)!==String(limits[day])))blockers.add('weekday-draft');
      if(todayTotalDraft.value!==undefined&&String(todayTotalDraft.value)!==String(backend.todayAllowance?.()?.limit??''))blockers.add('today-total-draft');
    }catch{blockers.add('projection');}
    for(const label of new Set(actionFlights.values()))blockers.add('flight:'+label);
    return [...blockers];
  }
  updateBoundary=createUpdateBoundary({
    readBlockers:readUpdateBlockers,
    readFlights:()=>actionFlights.size,
    onHold:()=>{root.setAttribute('inert','');stopTrialAudio();},
    onRelease:()=>{root.removeAttribute('inert');},
  });
  const dayView=({restEvidence=screen!=='study'}={})=>studyDayView(backend.readProjection(),catalog,{at:now(),installation:backend.installation,queue:backend.queue(),offline:!online(),canRequestPermits:canRequestNewCards(),verifiedRestDays:restEvidence?(backend.readVerifiedRestDays?.().days??[]):[],sessionTimings:sessionEvidence.read(backend.readProjection()).entries});
  const newCardAvailability=(queue=null)=>studyNewCardAvailability(backend.readProjection(),catalog,{at:now(),installation:backend.installation,queue:queue??backend.queue(),offline:!online(),canRequestPermits:canRequestNewCards()});
  function localized(jp){return formatInterfaceText(jp,interfaceLanguage);}
  const sourceCopy='.passage,.grammar-front,.grammar-back,[data-vocabulary-entry],[data-vocabulary-source]';
  const isSourceCopy=element=>element.closest(sourceCopy)&&!element.closest('[data-interface-copy]');
  function displayDate(value,options={}){const date=new Date(value),zone=options.timeZone?{timeZone:options.timeZone}:{},jp=`${date.toLocaleDateString('ja-JP',{month:'long',day:'numeric',...zone})}（${date.toLocaleDateString('ja-JP',{weekday:'short',...zone})}）${options.timeStyle?date.toLocaleTimeString('ja-JP',{timeStyle:'short',...zone}):''}`,en=new Intl.DateTimeFormat('en-US',options).format(date);return renderInterfacePair(h('span'),jp,en,interfaceLanguage);}
  function localize(){
    for(const element of document.querySelectorAll('[data-interface-ja][data-interface-en]')){
      if(!isSourceCopy(element))renderInterfacePair(element,element.dataset.interfaceJa,element.dataset.interfaceEn,interfaceLanguage,{inline:element.dataset.interfaceLayout==='inline'||!!element.closest('button,option')&&element.dataset.interfaceLayout!=='grade'});
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
      if(isSourceCopy(element)||element.closest('[data-trial-audio]'))continue;
      const before=originalAttributes.get(element)||{},after={};
      for(const name of ['aria-label','placeholder','title'])if(element.hasAttribute(name)){
        const value=element.getAttribute(name),source=before[name]&&value===before[name].rendered?before[name].source:value,rendered=localized(source);
        element.setAttribute(name,rendered);after[name]={source,rendered};
      }
      originalAttributes.set(element,after);
    }
    document.documentElement.lang=interfaceLanguage==='en'?'en':'ja';
    document.documentElement.dataset.kanjiInterfaceLanguage=interfaceLanguage;
  }
  function languagePicker(compact=false){const select=h('select',{'aria-label':'表示言語','data-interface-language':'',onchange:async e=>{if(updateBoundary?.held)return;interfaceLanguage=e.target.value;for(const picker of root.querySelectorAll('[data-interface-language]'))picker.value=interfaceLanguage;const end=beginFlight('preference');try{await preferences.setItem('nihongo.interface-language.v1',interfaceLanguage);}catch{message('表示言語を保存できません。');}finally{end();render();}}},h('option',{value:'ja'},'日本語'),h('option',{value:'en'},'English'),h('option',{value:'both'},'両方'));select.value=interfaceLanguage;return h('label',{class:`language-picker${compact?' compact':''}`},h('span',{},'表示言語'),select);}
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
    if (save) try {
      const previousSet=themePreferenceSet,saved=preferences.setItem('nihongo.qa.appearance.v1', theme);themePreferenceSet=true;
      if(saved&&typeof saved.then==='function'){const end=beginFlight('preference');saved.then(()=>end(),()=>{themePreferenceSet=previousSet;message('この端末に色の設定を保存できません。');end();});}
    } catch { message('この端末に色の設定を保存できません。'); }
    for (const picker of root.querySelectorAll('[data-theme-picker]')) picker.value = theme;
    updateBoundary?.sync();
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
  const sharedStatus=h('div',{class:'shared-status','data-shared-status':''},h('p',{role:'status','data-offline-status':'',hidden:true}),statusLine,h('div',{'data-shared-activity':''}));
  root.replaceChildren(h('header',{class:'app-header'},h('a',{class:'brand',href:'#',onclick:e=>{e.preventDefault();navigate('today');}},'集中道場',h('span',{},'Nihongo Study')),h('div',{class:'header-controls'},languagePicker(true),themePicker())),
    h('div',{class:'qa-banner'},corpus?.release3FullCorpus?'全デッキ · 全文英訳付き。':'QAプレビュー · テスト用の記録です。実際の学習履歴には影響しません。'),nav,sharedStatus,main,live,
    h('footer',{},h('span',{},'一つずつ、確かに。')));
  const backupAlert=h('aside',{class:'backup-alert',role:'alert','data-backup-alert':'',hidden:true});
  if(typeof platform.backupStatus==='function')main.before(backupAlert);
  const backupObserver=createBackupStatusObserver({read:platform.backupStatus,isVisible:()=>document.visibilityState!=='hidden',onChange:()=>paintBackupStatus(),schedule:(fn,delay)=>win.setTimeout(fn,delay),cancel:id=>win.clearTimeout(id)});
  function backupFailureCopy(code){
    if(code==='export-too-large')return 'バックアップに失敗しました。サーバーのエクスポートが大きすぎます。新しいバックアップは作成されませんでした。';
    if(code==='backup-write-failed')return 'バックアップ先への保存を完了できませんでした。一部の保存先にはコピーがある場合があります。';
    if(code==='backup-interrupted')return 'バックアップが中断されました。完了を確認できません。';
    return 'バックアップに失敗しました。設定でバックアップの状態を確認してください。';
  }
  function paintBackupStatus(){
    if(disposed)return;const status=backupObserver.read(),code=status.failure?.code??(status.unavailable?'backup-status-unavailable':null);
    backupAlert.hidden=!code;
    if(code){const text=code==='backup-status-unavailable'?'バックアップの状態を読み取れません。完了したかは未確認です。':backupFailureCopy(code);renderInterfacePair(backupAlert,text,translateInterfaceText(text),interfaceLanguage);}
    const detail=root.querySelector('[data-backup-detail]');if(detail){detail.replaceChildren(...backupDetail().childNodes);localize();}
  }
  function backupDetail(){
    const status=backupObserver.read(),record=status.record,section=h('section',{'data-backup-detail':''},h('h2',{},'バックアップ'));
    const description=status.unavailable?'バックアップの状態を読み取れません。完了したかは未確認です。':!record?'この保存先でバックアップの実行記録はまだ確認されていません。':record.observation==='running'?'バックアップを作成中です。':record.observation==='interrupted'?'バックアップが中断されました。完了を確認できません。':record.observation==='completed'?'指定された保存先へのバックアップを作成しました。':'直近のバックアップは失敗しました。';
    section.append(h('p',{},description));
    if(status.failure)section.append(h('p',{},backupFailureCopy(status.failure.code)));
    if(record){section.append(copy('p',`保存先：${record.attempt.completedTargets} / ${record.attempt.expectedTargets}完了`,`Destinations completed: ${record.attempt.completedTargets} / ${record.attempt.expectedTargets}`));
      if(record.lastSuccess&&Number.isFinite(new Date(record.lastSuccess.finishedAt).getTime()))section.append(copy('p',`直近の完了：${formatStudyDate(record.lastSuccess.finishedAt,backend.readProjection().settings.learnerTimezone,'ja')}`,`Last completion: ${formatStudyDate(record.lastSuccess.finishedAt,backend.readProjection().settings.learnerTimezone,'en')}`));}
    section.append(h('p',{class:'secondary'},'この表示は確認できたバックアップ実行だけを示します。クラウドへのアップロード完了を示すものではありません。'));return section;
  }
  const rubyLayout=watchRubyLayout(root);
  async function updateStatus({presentation=false}={}) {
    const generation=++saveStatusGeneration;
    let status;
    try { status=await (presentation&&backend.presentationStatus?backend.presentationStatus():backend.status()); }
    catch {
      if(!disposed&&generation===saveStatusGeneration)message('保存状態を読み取れません。再読み込み前にバックアップを取ってください。','save-status');
      return;
    }
    if (disposed||generation!==saveStatusGeneration) return;
    if(noticeOwner==='save-status')message('');
    paintSaveStatus(status);let nativeRequested=false;
    if(platform.nativeSync&&!nativeSyncBusy){nativeRequested=true;const generation=++nativeStatusGeneration;try{const sync=await platform.nativeSync.status();if(disposed||generation!==nativeStatusGeneration)return;const pairedChanged=nativeSyncState.paired!==sync.paired,couldRequest=canRequestNewCards();nativeSyncState=sync;if((pairedChanged||couldRequest!==canRequestNewCards())&&['today','settings'].includes(screen)){render();return;}const state=root.querySelector('[data-native-sync-status]');if(state){const description=nativeSyncDescription();renderInterfacePair(state,description,translateInterfaceText(description),interfaceLanguage);}}catch(error){if(!disposed&&generation===nativeStatusGeneration){nativeSyncState={...nativeSyncState,state:'error',error:['authentication-required','credential-storage-failed','invalid-credential'].includes(error?.message)?error.message:'status-unavailable'};const state=root.querySelector('[data-native-sync-status]');if(state){const description=nativeSyncDescription();renderInterfacePair(state,description,translateInterfaceText(description),interfaceLanguage);}}}}
    if(disposed||generation!==saveStatusGeneration)return;
    if(nativeRequested)paintSaveStatus(status);
    // A render or backend notice can supersede the first status request. Only
    // the current native observation decides the one initial quiet sync.
    if(nativeRequested&&startupSyncPending){startupSyncPending=false;if(!nativeSyncActionError&&!nativeSyncState.error)autoSync();else if(retryableSyncFailure())scheduleSyncRetry();}
  }
  function ageSaveBacklog(){
    saveBacklogTimer=null;
    if(disposed||!lastSaveStatus||saveBacklogSince===null)return;
    const remaining=3000-(win.performance.now()-saveBacklogSince);
    if(remaining>0){saveBacklogTimer=win.setTimeout(ageSaveBacklog,remaining);return;}
    if(lastSaveStatus.pendingUpload>0||lastSaveStatus.applied!==lastSaveStatus.head)statusLine.dataset.studySync='attention';
  }
  function paintSaveStatus(status){
    lastSaveStatus=status;
    const paired=['paired-dev','paired-prod','native-worker-qa'].includes(platform.storageKind)||nativeSyncState.paired||platform.isPaired?.()===true;
    const hostState=platform.getSyncState?.(),flight=nativeSyncBusy||hostState==='syncing';
    const synced=paired&&status.pendingUpload===0&&status.applied===status.head&&(hostState!==undefined?hostState==='up-to-date':platform.storageKind!=='native-worker-prod'||nativeSyncState.state==='up-to-date');
    const hostError=platform.getSyncError?.()||(hostState==='update-required'?'update-required':hostState==='paused-auth'?'authentication-required':['error','blocked','backoff'].includes(hostState)?'sync-unavailable':null);
    const detail=nativeSyncNeedsAttention()?nativeSyncDescription():hostError==='update-required'?'アプリの更新が必要です。記録は端末に残っています。':hostError==='authentication-required'?'同期の設定を確認してください。記録は端末に残っています。':hostError?'通信を確認できませんでした。未送信の記録は端末に残っています。同じ操作を再試行できます。':'';
    const jp=flight?'同期中…':detail||(!paired?'この端末に保存しました。同期は未設定です。':`${synced?'同期済み':'同期を待っています'}${status.pendingUpload?`・未送信${status.pendingUpload}件`:''}`);
    const en=flight?'Syncing…':detail?translateInterfaceText(detail):!paired?'Saved on this device. Sync is not set up.':`${synced?'Synced':'Waiting to sync'}${status.pendingUpload?` · ${status.pendingUpload} records not sent yet`:''}`;
    renderInterfacePair(statusLine,jp,en,interfaceLanguage);const finishSync=main.querySelector('[data-finish-sync]');if(finishSync)renderInterfacePair(finishSync,jp,en,interfaceLanguage);
    const diagnostics=root.querySelector('[data-study-diagnostics-values]');if(diagnostics)diagnostics.textContent=diagnosticValues();
    statusLine.dataset.pending = String(status.pendingUpload);
    const backlog=status.pendingUpload>0||status.applied!==status.head;
    if(backlog&&saveBacklogSince===null)saveBacklogSince=win.performance.now();
    if(!backlog){saveBacklogSince=null;win.clearTimeout(saveBacklogTimer);saveBacklogTimer=null;}
    const pendingFor=saveBacklogSince===null?0:win.performance.now()-saveBacklogSince;
    if((platform.storageKind==='native-worker-prod'||pairedPhone||platform.getSyncState)&&backlog&&pendingFor<3000&&saveBacklogTimer===null)
      saveBacklogTimer=win.setTimeout(ageSaveBacklog,3000-pendingFor);
    statusLine.dataset.studySync=!online()||hostError||nativeSyncNeedsAttention()||backlog&&pendingFor>=3000?'attention':'quiet';
    paintSharedStatus();
    localize();
  }
  function paintSharedStatus(){
    const chip=sharedStatus.querySelector('[data-offline-status]');chip.hidden=online();chip.dataset.startedOffline=String(!online()&&startedOffline);
    if(!online()){
      const saved=!!lastSaveStatus&&!busy&&(!pendingIntent||operationState(pendingOperation?.result,pendingOperation?.policy).persisted);
      const device=['Mac','iPhone'].includes(platform.localDeviceLabel)?platform.localDeviceLabel:null;
      renderInterfacePair(chip,(startedOffline?'オフラインで起動しました':'オフライン')+(saved?`・この${device??'端末'}に保存`:''),(startedOffline?'Started offline':'Offline')+(saved?` · saved on this ${device??'device'}`:''),interfaceLanguage);
    }
    const rows=sharedStatus.querySelector('[data-shared-activity]'),key=JSON.stringify([sharedActivity.updated,sharedActivity.limitSettings,interfaceLanguage]);if(key===lastSharedActivityKey)return;lastSharedActivityKey=key;rows.replaceChildren();
    appendSharedActivity(rows);
  }
  function appendSharedActivity(rows){
    for(const update of sharedActivity.updated){const name=update.label??'別の端末',english=update.label??'another device',date=new Date(update.receivedAt),timeZone=backend.readProjection().settings.learnerTimezone,options={timeStyle:'short',...(timeZone?{timeZone}:{})},jpTime=date.toLocaleTimeString('ja-JP',options),enTime=date.toLocaleTimeString('en-US',options);rows.append(copy('p',`${name}から更新を受信しました（復習${update.count}件・${jpTime}）。`,`Updated from ${english} · ${update.count} reviews · ${enTime}`,{'data-remote-update':''}));}
    for(const setting of sharedActivity.limitSettings){const name=setting.label??'別の端末',english=setting.label??'another device';rows.append(copy('p',`今日の新規上限${setting.total}枚は${name}で設定されました。`,`Today's new-card limit of ${setting.total} was set on ${english}.`,{'data-remote-limit':''}));}
  }
  function consumeStudyBoundary(){
    observeSharedActivity();
    if(!sharedActivity.changedTaskKeys.length){boundaryNotice=null;return;}
    const projection=backend.readProjection(),selected=customRun?[current?.entry,...customRun.remaining].filter(Boolean).map(entry=>entry.taskKey):null;
    const eligible=customRun?(customRun.newOnly?backend.queue().filter(entry=>!projection.introductions[entry.taskKey]):backend.customSession({...customRun.options,untilDone:true}).entries):backend.queue();
    const chosen=selected&&new Set(selected),after=eligible.filter(entry=>!chosen||chosen.has(entry.taskKey)).map(entry=>entry.taskKey),skips=activityTracker.consumeBoundary(boundaryQueue,after,projection);boundaryQueue=after;
    const labels=new Set(skips.map(row=>row.label)),label=labels.size===1&&!labels.has(null)?skips[0].label:null;
    boundaryNotice=skips.length?{ja:`${label??'別の端末'}で復習済みの${skips.length}枚を、この学習から除きました。`,en:`Skipped ${skips.length} cards already reviewed on ${label??'another device'}.`}:null;
  }
  function message(text,owner=null) { notice = text; noticeOwner=owner; live.textContent = text;localize(); }
  function navigate(next) {
    if (updateBoundary?.held) return;
    if (busy || typedBusy || customBusy || pendingIntent) return message('保存を確認してから移動してください。失敗した場合は再試行できます。');
    if(screen==='study'&&current)return pauseStudy(next);
    boundaryPreparation=null;current?.timer.dispose(); current = null; customRun=null; activeSession=null;finishState=null;win.clearTimeout(finishGuardTimer);screen = next; closePopover(); render();
  }
  // Keep the same timer facade and elapsed visible recall across a paused screen.
  function studyTimer(){
    let clock=createRecallTimer(document),elapsed=0,paused=false,frozen=false;
    return Object.freeze({
      pause(){if(!paused&&!frozen){elapsed+=clock.freeze();paused=true;}},
      resume(){if(paused&&!frozen){clock=createRecallTimer(document);paused=false;}},
      freeze(){if(!frozen){if(!paused)elapsed+=clock.freeze();frozen=true;}return elapsed;},
      dispose(){clock.dispose();frozen=true;}
    });
  }
  function pauseStudy(next){
    if(updateBoundary?.held)return;
    if(!current||current.committed||boundaryPreparation)return message('保存を確認してから移動してください。失敗した場合は再試行できます。');
    stopTrialAudio();setStudyMenu(false);closePopover();current.timer.pause();
    parkedStudy={current,customRun,activeSession,boundaryQueue,boundaryNotice,sessionShown,module,scroll:main.querySelector('[data-card]')?.scrollTop??0};
    current=null;customRun=null;activeSession=null;screen=next;render();main.focus({preventScroll:true});
  }
  function studyDay(){const at=now(),today=backend.todayAllowance?.()??dayBounds(at,backend.readProjection().settings.learnerTimezone);return {day:today.day,timezone:today.timezone};}
  function parkedDayEnded(){if(!parkedStudy)return false;const today=studyDay(),started=parkedStudy.current.studyDay;return started.day!==today.day||started.timezone!==today.timezone;}
  function retireParkedStudy(next){
    if(updateBoundary?.held)return;
    if(!parkedStudy)return next();
    if(busy||typedBusy||customBusy||pendingIntent)return message('保存を確認してから移動してください。失敗した場合は再試行できます。');
    // A lookup records an observation; leaving its card never schedules it.
    parkedStudy.current.timer.dispose();parkedStudy=null;pausedStudy=null;
    return next();
  }
  function restoreStudy(){
    if(!parkedStudy)return null;const saved=parkedStudy;parkedStudy=null;
    ({current,customRun,activeSession,boundaryQueue,boundaryNotice,sessionShown,module}=saved);
    current.timer.resume();screen='study';return saved;
  }
  function resumeStudy(){
    if(updateBoundary?.held)return;
    if(busy||typedBusy||customBusy||pendingIntent)return message('保存を確認してから移動してください。失敗した場合は再試行できます。');
    if(parkedDayEnded())return retireParkedStudy(()=>render());
    const saved=restoreStudy();if(!saved)return;render();const card=main.querySelector('[data-card]');if(card)card.scrollTop=saved.scroll;focusStudyCard();
  }
  function endStudy(){navigate('today');}
  function availableUndo(){
    expireLastReview();const p=backend.readProjection(),task=lastReview&&p.tasks[lastReview.entry.taskKey];
    return !!(task&&p.effects[task.head]?.root===lastReview.eventId);
  }
  function menuItems(){return [...main.querySelectorAll('#study-help [role^=menuitem]')].filter(node=>!node.disabled&&node.getClientRects().length);}
  function setStudyMenu(open){
    if(!current)return;current.sessionInfoOpen=open;
    const section=main.querySelector('[data-focus]'),toggle=main.querySelector('[data-session-info]');
    if(section)section.dataset.focus=open?'session-info':'simple';toggle?.setAttribute('aria-expanded',String(open));
    if(open){closePopover();menuItems()[0]?.focus({preventScroll:true});}
    else{current.menuHelpOpen=false;const help=main.querySelector('[data-menu-help]');if(help)help.open=false;focusStudyCard();}
  }
  function menuKey(event){
    if(event.repeat||event.isComposing||event.keyCode===229){event.preventDefault();return;}
    if(event.metaKey||event.ctrlKey||event.altKey)return;
    const items=menuItems(),at=items.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus({preventScroll:true});return;
    }
    if(event.key==='Escape'){event.preventDefault();setStudyMenu(false);return;}
    if(/^[1-4]$/.test(event.key)&&current.revealed){event.preventDefault();if(!busy&&!pendingIntent){setStudyMenu(false);grade(Number(event.key),'key');}return;}
    if(event.key.toLowerCase()==='u'){event.preventDefault();if(!busy&&!pendingIntent&&availableUndo()){setStudyMenu(false);undoLast();}return;}
    // Native button/summary Enter and Space activation only; a focused card
    // behind an open menu must never reveal or grade on an async focus change.
    if(!event.target.closest?.('#study-help')&&['Enter',' '].includes(event.key)){event.preventDefault();menuItems()[0]?.focus({preventScroll:true});}
  }
  let panelObserver=null;
  function render() {
    if (disposed) return;
    expireLastReview();
    catalog=backend.catalogEntries?.()??shippedCatalog;
    factoryStatuses.leave();refreshFactoryRows=()=>{};
    for (const b of nav.querySelectorAll('button')) b.setAttribute('aria-current',b.dataset.nav === screen ? 'page' : 'false');
    const focusedField=document.activeElement;
    const menuFocus=focusedField?.closest?.('#study-help')?[...main.querySelectorAll('#study-help [role^=menuitem]')].indexOf(focusedField):null;
    const paceFieldId=focusedField?.id.startsWith('study-pace-')?focusedField.id:null;
    const selection=paceFieldId&&focusedField.selectionStart!=null?[focusedField.selectionStart,focusedField.selectionEnd,focusedField.selectionDirection]:null;
    const previousCard=main.querySelector('[data-card]'),previousView=previousCard&&cardViews.get(previousCard),previousScroll=previousCard?.scrollTop??0;
    const openPanels=screen==='today'?['[data-custom-session]','[data-weighted-days]','[data-manual-card]'].filter(selector=>main.querySelector(selector)?.open):[];
    main.replaceChildren(screen === 'finish' ? finishScreen() : screen === 'study' ? studyScreen() : screen === 'words' ? wordsScreen() : screen === 'record' ? recordScreen() : screen === 'settings' ? settingsScreen() : todayScreen());
    if(parkedStudy&&!['study','today'].includes(screen))main.prepend(h('div',{class:'sheet-actions','data-paused-session':''},button('学習に戻る',resumeStudy,{'data-resume-study':'',class:'primary'})));
    for(const selector of openPanels)main.querySelector(selector)?.setAttribute('open','');
    if(paceFieldId){
      const field=document.getElementById(paceFieldId);
      field?.focus({preventScroll:true});
      if(selection)field?.setSelectionRange(...selection);
    }
    root.querySelector('[data-retry-panel]')?.remove();
    if(pendingIntent&&!busy&&(screen!=='study'||root.querySelector('dialog[open]'))){const retry=h('div',{'data-retry-panel':'',class:'retry-panel',role:operationRole()},h('p',{},operationCopy()),button(operationRetryLabel(),retryOperation,{class:'primary','data-retry':''}));const modal=root.querySelector('dialog[open]');if(modal)modal.append(retry);else main.after(retry);}
    root.querySelector('[data-factory-retry-panel]')?.remove();
    if(factoryRetry)main.after(h('div',{'data-factory-retry-panel':'',class:'retry-panel'},button('カード作成の依頼を再試行',()=>submitFactory(factoryRetry),{class:'quiet','data-factory-retry':''})));
    platform.onScreenChange?.({screen,settingsHost:main.querySelector('[data-host-settings]')});
    if(pendingOperation)lockOperationControls(pendingOperation);
    live.textContent = notice;localize();paintBackupStatus();rubyLayout.fit();
    panelObserver?.disconnect();panelObserver=null;const panel=main.querySelector('[data-decision-panel]'),readingCard=main.querySelector('[data-card]');if(panel&&readingCard){const fit=()=>readingCard.style.setProperty('--decision-height',panel.getBoundingClientRect().height+'px');fit();if(win.ResizeObserver){panelObserver=new win.ResizeObserver(fit);panelObserver.observe(panel);}}
    if(previousView?.current===current&&previousView.revealed===current?.revealed){const card=main.querySelector('[data-card]');if(card)card.scrollTop=previousScroll;}
    if(screen==='study'&&!pop&&!document.querySelector('dialog[open]')){if(current?.sessionInfoOpen)(menuItems()[menuFocus]??menuItems()[0])?.focus({preventScroll:true});else focusStudyCard();}
    if(screen==='study'&&current?.revealed)current.revealSource='settled';
    if(screen==='study'&&current&&!current.revealed)current.entrySource='settled';
    updateStatus({presentation:true});
    budgetWatcher?.schedule();
    if(parkedStudy&&!busy&&!pendingIntent&&parkedDayEnded()){const saved=parkedStudy;queueMicrotask(()=>{if(!disposed&&parkedStudy===saved&&parkedDayEnded())retireParkedStudy(()=>render());});}
    updateBoundary?.sync();
    if(sharedAudioDeclared)syncSharedAudioCurrent();
  }
  function todayScreen() {
    const p=backend.readProjection(),view=dayView(),today=view.today,queue=backend.queue({module});
    if(todayTotalDraft.day!==today.day||todayTotalDraft.timezone!==today.timezone)todayTotalDraft={day:today.day,timezone:today.timezone};
    if(pausedStudy&&(pausedStudy.day!==today.day||pausedStudy.module!==module))pausedStudy=null;
    const section=h('section',{class:'today','data-today-state':view.firstDay?'first-day':view.finished?'finished':view.backlog?'backlog':'ready'},
      h('div',{class:'section-heading screen-head'},h('h1',{},view.finished&&!view.firstDay?'今日の学習は終わりました':'今日の学習'),h('p',{},displayDate(now(),{month:'long',day:'numeric',weekday:'long',timeZone:today.timezone}))));
    const hero=h('div',{class:'sheet today-plan','data-today-plan':''});
    const dueText=view.backlog?`復習${view.due}枚（うち期日超過${view.overdue}枚）`:`復習${view.due}枚`;
    const dueEnglish=view.backlog?`${view.due} due (${view.overdue} overdue)`:`${view.due} due`;
    if(!view.finished||view.firstDay)hero.append(copy('p',view.firstDay&&!view.due?`新規カード${view.newToday}枚`:`${dueText}・新規${view.newToday}枚`,view.firstDay&&!view.due?`${view.newToday} new ${view.newToday===1?'card':'cards'}`:`${dueEnglish} · ${view.newToday} new`,{class:'today-counts','data-today-counts':''}));
    if(view.estimateMinutes>0&&!view.firstDay)hero.append(copy('p',`約${view.estimateMinutes}分`,`About ${view.estimateMinutes} min`,{class:'secondary','data-study-estimate':''}));
    const raised=(p.settings.newTodayOverrides?.[today.timezone+'|'+today.day]??0)>0;
    hero.append(copy('p',raised?`今日の新規カード上限：${today.limit}枚（すべてのデッキ・iPhoneとMacで共通）`:`新規カード：1日${today.limit}枚（すべてのデッキ・iPhoneとMacで共通）`,raised?`Today's new-card limit: ${today.limit}, shared by all decks on iPhone and Mac`:`New cards: ${today.limit} a day, shared by all decks on iPhone and Mac`,{class:'secondary','data-shared-limit':''}));
    if(view.firstDay)hero.append(h('p',{class:'secondary','data-first-day-help':''},today.limit===20?'学習したカードは翌日以降、復習として戻ってきます。1日20枚のペースを続けると、数か月後には1日およそ200枚の復習になります。':'学習したカードは翌日以降、復習として戻ってきます。'),button('1日の新規カード上限を変更',()=>{navigate('settings');main.querySelector('#study-pace-newPerDayTotal')?.focus();},{class:'text-link'}));
    if(module!=='all'){const name=MODULES.find(([id])=>id===module)[1];hero.append(copy('p',`学習範囲：${name}`,`Studying: ${translateInterfaceText(name)}`,{class:'secondary','data-study-scope':''}));}
    if(view.backlog)hero.append(h('p',{class:'secondary'},'復習が多い日は、まず復習だけを進めることをおすすめします。'));
    const scopedDue=queue.filter(entry=>p.introductions[entry.taskKey]).length,scopedBacklog=view.backlog&&scopedDue>0;
    const scopedNew=view.availability.eligibleNewIds.some(key=>module==='all'||p.tasks[key]?.module===module),canStart=queue.length>0||view.availability.requestableNew>0&&scopedNew;
    const actions=h('div',{class:'today-actions'});
    if(!view.finished&&canStart||parkedStudy){
      const label=parkedStudy||pausedStudy?'続きから学習する':'学習を始める';
      const prepared=!parkedStudy&&queue[0]?frontFor(queue[0]):null;
      const action=event=>beginToday(scopedBacklog&&!parkedStudy?50:null,false,event?.detail===0?'key':'pointer'),attributes={class:'primary',disabled:customBusy||busy||prepared&&!prepared.ready,'data-start':''};
      actions.append(scopedBacklog&&!parkedStudy&&!pausedStudy&&!customBusy?copyButton(`${Math.min(50,scopedDue)}枚学習する`,`Study ${Math.min(50,scopedDue)}`,action,attributes):button(customBusy?'学習を準備しています…':label,action,attributes));
      if(scopedBacklog)actions.append(copyButton(`すべて学習する（${view.due+view.newToday}枚）`,`Study all (${view.due+view.newToday})`,()=>{pausedStudy=null;beginToday(null,false,lastInputSource,true);},{class:'quiet','data-study-all':''}),h('div',{class:'review-only-offer','data-review-only-offer':''},button('復習だけ学習する',()=>beginToday(null,true),{class:'quiet','data-reviews-only':''}),h('p',{class:'secondary'},'スケジュール：通常の復習／今日の新規上限：変わりません')));
      if(parkedStudy||pausedStudy){const remaining=parkedStudy?.current.remaining??pausedStudy?.run?.taskKeys.length??(queue.filter(entry=>p.introductions[entry.taskKey]).length+Math.min(queue.filter(entry=>!p.introductions[entry.taskKey]).length,view.newToday));hero.append(copy('p',`前回の続き：残り${remaining}枚`,`${remaining} left from the last session`,{class:'secondary','data-study-continue':''}));}
    }else if(!view.finished){hero.append(h('p',{class:'secondary'},'このデッキで今学習できるカードはありません。'),button('すべてのデッキを見る',()=>{module='all';pausedStudy=null;render();},{class:'quiet','data-show-all-decks':''}));}
    if(lastReview)actions.append(button('元に戻す',undoLast,{class:'quiet','data-undo':''}));
    if(actions.childNodes.length){const help=hero.querySelector('[data-first-day-help]');if(help)hero.insertBefore(actions,help);else hero.append(actions);}
    if(view.finished&&!view.firstDay){const total=view.totals;hero.append(copy('p',`今日：復習${total.reviewed}枚・新規${total.new}枚${formatStudyMinutes(total,'ja')?`・${formatStudyMinutes(total,'ja')}`:''}`,`Today: ${total.reviewed} reviewed · ${total.new} new${formatStudyMinutes(total,'en')?` · ${formatStudyMinutes(total,'en')}`:''}`,{'data-day-totals':'',class:'today-totals'}));}
    const introductions=activityTracker.newByDevice(p,today.day);if(introductions.length)hero.append(copy('p',introductions.map(row=>`${row.local?'この端末':row.label??'別の端末'}：新規${row.count}枚`).join('・'),introductions.map(row=>`${row.local?'This device':row.label??'Another device'}: ${row.count} new`).join(' · '),{class:'secondary','data-new-by-device':''}));
    appendDayConditions(hero,view);
    section.append(hero);
    if(view.finished&&!view.firstDay){appendTomorrow(section,view);if(backend.customSession)appendStudyOffers(section,view,view.offers);}
    if(view.continuity)section.append(copy('p',`直近30日のうち${view.continuity.days}日学習`,`Studied ${view.continuity.days} of the last 30 days`,{class:'secondary continuity','data-study-continuity':''}));
    if(backend.customSession)section.append(customSessionPanel(document,{options:customOptions,manualDraft,weekdayDraft,today,todayTotalDraft,settings:plannedSettings(p),busy:customBusy||busy||!!pendingIntent,
      onStart:beginCustomSession,onMoreNew:()=>openNewCardsSheet(),
      onTodayTotal:total=>{
        if(!Number.isInteger(total)||total<0||total>200)return message('今日の上限から200までの整数を入力してください。');
        const draft=todayTotalDraft;
        customAction(async()=>{
          const result=await backend.setNewTodayTotal(total,today);
          if(allowanceReady(result))delete draft.value;
          return result;
        },'今日の新規カードの合計を保存しました。');
      },
      onWeekdays:saveWeekdays,
      onManual:values=>runInput('manual',values,original=>backend.createManualCard(original),(result)=>{Object.assign(manualSaved,values);if(result.reused||result.existing)message('この言葉のカードは既にあります。既存のカードをそのまま使います。');else{for(const key of Object.keys(manualDraft))manualDraft[key]='';Object.assign(manualSaved,{word:'',reading:'',meaning:'',example:'',note:''});message('手入力のカードを保存しました。');}render();},{existing:true}),
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
  function appendDayConditions(parent,view){
    const add=(ja,en)=>parent.append(copy('p',ja,en,{class:'secondary day-condition','data-day-condition':''}));
    if(view.conditions.laterToday){const date=new Date(view.laterToday.nextAt),options={timeStyle:'short',timeZone:view.today.timezone},jpTime=date.toLocaleTimeString('ja-JP',options),enTime=date.toLocaleTimeString('en-US',options);add(`今日中にあと${view.laterToday.count}枚が再出題されます（次は${jpTime}）。`,`${view.laterToday.count} ${view.laterToday.count===1?'card comes':'cards come'} back later today (next at ${enTime}).`);}
    if(view.conditions.limitReached)add(`今日の新規カード上限（${view.today.limit}枚）に達しました。上限はすべてのデッキ・iPhoneとMacで共通です。`,`Today's new-card limit (${view.today.limit}) is reached. It is shared by all decks on iPhone and Mac.`);
    if(view.conditions.noNewLeft)parent.append(h('p',{class:'secondary day-condition','data-day-condition':''},'未学習の新規カードはもうありません。'));
    if(view.conditions.offline){if(view.availability.readyNew)add(`オフラインで学習できる新規カードはあと${view.availability.readyNew}枚です。`,`Offline: ${view.availability.readyNew} new ${view.availability.readyNew===1?'card is':'cards are'} available until you reconnect.`);else parent.append(h('p',{class:'secondary day-condition','data-day-condition':''},'オフラインで学習できる新規カードはありません。復習は続けられます。'));}
    if(view.conditions.reservedElsewhere)add(`新規カード${view.availability.reservedElsewhere}枚分は別の端末で利用できます。`,`${view.availability.reservedElsewhere} new-card ${view.availability.reservedElsewhere===1?'place is':'places are'} available on another device.`);
    if(view.conditions.buriedNew)parent.append(h('p',{class:'secondary day-condition','data-day-condition':''},'関連するカードは明日以降に学習できます。'));
    if(view.conditions.permitAuthorityUnavailable)parent.append(h('p',{class:'secondary day-condition','data-day-condition':''},'新規カードを受け取る接続が設定されていません。設定を確認してください。'));
  }
  function frontFor(entry){
    const key=entry.taskKey+'|'+(entry.contentRevision||'')+'|'+entry.ja;
    let record=frontCache.get(key);
    if(!record){const node=entry.contractId.startsWith('grammar.')&&grammar&&entry.grammarRecord?grammar.renderGrammarFront(document,entry.grammarRecord,entry.grammarTask):renderVocabularyPassage(document,entry,entry.ja,{front:true,dictionary});record={node,ready:!document.fonts,promise:null};frontCache.set(key,record);if(frontCache.size>2)frontCache.delete(frontCache.keys().next().value);
      if(document.fonts){const text=node.textContent;record.promise=Promise.all([document.fonts.load('24px "Noto Serif JP"',text),document.fonts.load('15px "Noto Sans JP"',text)]).catch(()=>{}).then(()=>{record.ready=true;if(!disposed&&screen==='today')render();});}}
    return record;
  }
  function readyCount(entries){const p=backend.readProjection(),at=now(),today=backend.todayAllowance?.()??dayBounds(at,p.settings.learnerTimezone),permits=Object.values(p.permits),held=permits.filter(permit=>!permit.usedBy&&permit.install===backend.installation&&permit.startsAt<=at&&permit.endsAt>at).length,spent=permits.filter(permit=>permit.usedBy&&permit.startsAt<today.endsAt&&permit.endsAt>today.startsAt).length;let reviews=0,fresh=0;for(const entry of entries){if(p.introductions[entry.taskKey])reviews++;else fresh++;}return reviews+Math.min(fresh,held,Math.max(0,(today.limit??Infinity)-spent));}
  function showToast(ja,en){win.clearTimeout(toastTimer);root.querySelector('[data-study-toast]')?.remove();const toast=copy('p',ja,en,{class:'study-toast',role:'status','data-study-toast':''});root.append(toast);toastTimer=win.setTimeout(()=>toast.remove(),2000);}
  async function beginToday(size=null,reviewsOnly=false,source=lastInputSource,newSession=false){
    if(updateBoundary?.held)return;
    if(customBusy||busy||pendingIntent)return;
    const endFlight=beginFlight('begin');
    try{
      if(parkedStudy){if(size!==null||reviewsOnly||newSession)return retireParkedStudy(()=>beginToday(size,reviewsOnly,source,newSession));return resumeStudy();}
      if(pausedStudy&&!reviewsOnly){const paused=pausedStudy;pausedStudy=null;if(paused.run)return paused.run.newOnly?beginNewSession(paused.run.taskKeys):beginCustomSession(paused.run.options,paused.run.taskKeys);const entry=backend.queue({module}).find(entry=>entry.taskKey===paused.taskKey);if(entry)return start(entry,false,false,null,{source});}
      let view=dayView();
      if(!reviewsOnly&&!backend.queue({module}).length&&view.availability.requestableNew>0){
        if(!online()||!canRequestNewCards())return render();
        customBusy=true;render();
        try{const result=await platform.requestNewCards();if(result?.error||result?.kind==='failed'||result?.kind==='observation-only')throw Error('reserve-unavailable');await backend.refresh();}
        catch{if(!disposed)message('新規カードを受け取れませんでした。通信と設定を確認して、もう一度お試しください。');return;}
        finally{customBusy=false;if(!disposed)render();}
        if(disposed)return;view=dayView();
      }
      const backlog=view.backlog,queue=backend.queue({module,backlog});
      if(size!==null||reviewsOnly){const keys=queue.filter(entry=>backend.readProjection().introductions[entry.taskKey]).map(entry=>entry.taskKey).slice(0,size??Infinity);return beginCustomSession({mode:'due',untilDone:true,filters:{module}},keys,source);}
      const entry=queue.find(entry=>entry.taskKey===pausedStudy?.taskKey)||queue[0];
      if(!entry){if(dayView().finished){render();return;}return message('この条件で学習できるカードはありません。');}
      pausedStudy=null;await frontFor(entry).promise;if(!disposed)start(entry,false,false,null,{source,backlog});
    }finally{endFlight();}
  }
  async function customAction(action,success){
    if(updateBoundary?.held||customBusy||busy||pendingIntent)return;customBusy=true;render();
    try{const result=await action();if(disposed)return;
      if(result?.preparation&&!allowanceReady(result)){message(allowanceReason(result.preparation.reason||result.reason||'setting-processing-required',{current:result.preparation.current??backend.todayAllowance()})[0]);return;}if(result?.kind!=='durable'&&!allowanceReady(result))throw Error(result?.reason||'custom-action-failed');message(success);}
    catch(error){
      if(!disposed)message(allowanceReason(error.message,{current:backend.todayAllowance()})[0]);
    }
    finally{customBusy=false;if(!disposed)render();}
  }
  function saveWeekdays(values){
    if(updateBoundary?.held)return;
    if(values.length!==7||values.some(n=>!Number.isInteger(n)||n<0||n>200))return message('曜日の新規カード上限は0〜200の整数を入力してください。');
    if(customBusy||busy||pendingIntent)return;
    const body=JSON.stringify(values);
    if(weekdayPending&&weekdayPending.body!==body)return message('前の曜日設定を先に再試行してください。');
    const record=weekdayPending??(weekdayPending={body,intent:backend.command('settings',{key:'studyPolicy',value:{version:2,newByWeekday:values}})});
    weekdayDraft={...values};
    run(record.intent,()=>{weekdayPending=null;weekdayDraft={};message('翌日の学習日から変更します。');render();},false,{onRefused:()=>{weekdayPending=null;}});
  }
  function beginNewSession(taskKeys,source=lastInputSource){
    if(parkedStudy)return retireParkedStudy(()=>beginNewSession([...taskKeys],source));
    const wanted=new Set(taskKeys),p=backend.readProjection(),entries=backend.queue().filter(entry=>wanted.has(entry.taskKey)&&!p.introductions[entry.taskKey]);
    if(!entries.length)return message('今学習できる新規カードはありません。');
    customRun={options:null,newOnly:true,remaining:entries,completed:0,total:entries.length,source};advanceCustomSession();
  }
  function acknowledgeDay(today){
    const key=`nihongo.finish-ack.v1:${backend.learner}:${today.timezone}:${today.day}`;
    if(acknowledgedDays.has(key))return false;acknowledgedDays.add(key);
    try{const stored=preferences.getItem(key);if(stored!==null)return false;const result=preferences.setItem(key,'1');if(result&&typeof result.then==='function'){trackPreferencePromise(result);return false;}return true;}catch{return false;}
  }
  function completeSitting(){
    stopTrialAudio();const p=backend.readProjection(),at=now(),session=activeSession,view=dayView({restEvidence:true}),practice=!!session?.practice;
    const summary=studyReviewSummary(p,{at,eventIds:session?.eventIds??[],startedAt:session?.startedAt,installation:backend.installation});
    const offers=view.offers;
    finishState={at,summary,view,offers,projection:p,online:online(),practice,practised:practice?customRun?.completed??0:0,ack:!practice&&summary.reviewed>0&&view.finished&&acknowledgeDay(view.today),until:win.performance.now()+400,showAll:false,source:current?.gradeSource||session?.source||lastInputSource};
    current?.timer.dispose();current=null;customRun=null;pausedStudy=null;screen='finish';message('');closePopover();render();main.querySelector('[data-finish]')?.focus({preventScroll:true});
    win.clearTimeout(finishGuardTimer);finishGuardTimer=win.setTimeout(()=>{if(screen==='finish'&&finishState)for(const control of main.querySelectorAll('[data-finish-action]'))control.disabled=false;},400);
  }
  const finishBlocked=()=>screen==='finish'&&finishState&&win.performance.now()<finishState.until;
  function finishAction(action){return event=>{if(updateBoundary?.held||finishBlocked()||busy||customBusy||pendingIntent){event?.preventDefault();return;}action(event);};}
  function finishDone(){if(updateBoundary?.held||finishBlocked())return;navigate('today');main.focus({preventScroll:true});}
  function openCustomSession(){if(updateBoundary?.held||finishBlocked())return;navigate('today');const panel=main.querySelector('[data-custom-session]');if(panel){panel.open=true;panel.scrollIntoView({block:'start'});panel.querySelector('summary')?.focus();}}
  function appendTomorrow(parent,view){
    const section=h('section',{class:'sheet today-forecast','data-today-forecast':''},h('h2',{},'明日'));
    section.append(copy('p',`復習${view.tomorrow.reviews}枚＋新規最大${view.tomorrow.new}枚${view.tomorrow.estimateMinutes>0?`・約${view.tomorrow.estimateMinutes}分`:''}`,`${view.tomorrow.reviews} ${view.tomorrow.reviews===1?'review':'reviews'} + up to ${view.tomorrow.new} new${view.tomorrow.estimateMinutes>0?` · about ${view.tomorrow.estimateMinutes} min`:''}`,{class:'tomorrow-counts'}));
    if(view.tomorrow.carriedReviews>0)section.append(copy('p',`明日の予定${view.tomorrow.scheduledReviews}枚・それ以前の未完了${view.tomorrow.carriedReviews}枚を含みます`,`${view.tomorrow.scheduledReviews} scheduled for tomorrow · ${view.tomorrow.carriedReviews} unfinished earlier reviews included`,{class:'secondary','data-forecast-carried':''}));
    const maximum=Math.max(1,...view.strip.map(day=>day.count)),strip=h('ol',{class:'forecast-strip','data-forecast-strip':''});
    for(const day of view.strip){const date=new Date(day.startsAt),ja=date.toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',timeZone:view.today.timezone}),en=date.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:view.today.timezone});strip.append(h('li',{},copy('span',ja,en),h('span',{class:'forecast-bar','aria-hidden':'true',style:`--forecast-height:${day.count/maximum*48}px`}),copy('span',`${day.count}枚`,`${day.count} ${day.count===1?'card':'cards'}`)));}
    section.append(strip,h('p',{class:'secondary'},'今後7日間の日付ごとの復習予定（新規カード・前日からの未完了分は含みません）'));parent.append(section);
  }
  function appendStudyOffers(parent,view,offers,{finish=false}={}){
    const section=h('section',{class:'sheet today-more','data-study-more':''},h('h2',{},'さらに学習する'));
    const offer=(key,ja,en,action,effect,value)=>section.append(h('div',{class:'study-offer'},copyButton(ja,en,finish?finishAction(action):action,{class:'quiet',[key]:'',...(finish?{'data-finish-action':'',disabled:finishBlocked()}:{})}),h('p',{class:'secondary'},effect),value?h('p',{class:'secondary study-offer-value'},value):null));
    if(finish&&view.due>0){section.append(copy('p',`残りの復習${view.due}枚${view.estimateMinutes>0?`・約${view.estimateMinutes}分`:''}`,`${view.due} still due${view.estimateMinutes>0?` · about ${view.estimateMinutes} min`:''}`,{'data-finish-remaining':''}));offer('data-study-more-chunk',`さらに${Math.min(50,view.due)}枚学習する`,`Study ${Math.min(50,view.due)} more`,()=>{module='all';beginToday(50);},'スケジュール：通常の復習／今日の新規上限：変わりません',null);}
    else if(finish&&view.newToday>0)offer('data-continue-new',`新規カード${view.newToday}枚を学習する`,`Study ${view.newToday} available new cards`,()=>{module='all';beginToday();},'スケジュール：新規カードを追加／今日の新規上限：変わりません',null);
    else{
      if(offers.practice.taskKeys.length)offer('data-practice-today',`今日忘れたカードを練習（${offers.practice.taskKeys.length}枚）`,`Practise today's misses (${offers.practice.taskKeys.length})`,()=>beginCustomSession(offers.practice.options,offers.practice.taskKeys),'スケジュール：変わりません／今日の新規上限：変わりません','忘れた直後にもう一度思い出すと、定着を助けます。');
      if(view.availability.eligibleNewIds.length>=5&&view.today.limit<=195&&canRequestNewCards()&&online())offer('data-add-new','新規カードを追加…','Learn more new cards…',()=>openNewCardsSheet(),'スケジュール：新規カードが加わります／今日の新規上限：両方の端末で引き上げ','今日の新規を増やすと、今後数週間の復習も増えます。');
      if(offers.ahead.taskKeys.length)offer('data-review-tomorrow',`明日の復習を先取り（${offers.ahead.taskKeys.length}枚）`,`Review tomorrow's cards early (${offers.ahead.taskKeys.length})`,()=>beginCustomSession(offers.ahead.options,offers.ahead.taskKeys),'スケジュール：早めの復習として更新（効果はやや小さめ）／今日の新規上限：変わりません','間隔が10日以上で、明日の予定のうち24時間以内のカードを出題します。');
    }
    section.append(button('カスタム学習…',finish?finishAction(openCustomSession):openCustomSession,{class:'quiet','data-finish-custom':'',...(finish?{'data-finish-action':'',disabled:finishBlocked()}:{})}));parent.append(section);
  }
  function finishScreen(){
    const state=finishState;
    const {summary,view}=state,section=h('section',{class:'finish-screen','data-finish':'',tabindex:'-1','aria-labelledby':'finish-title','data-finish-source':state.source});
    section.append(h('p',{class:'secondary finish-date'},copy('span',formatStudyDate(state.at,view.today.timezone,'ja'),formatStudyDate(state.at,view.today.timezone,'en'))),h('h1',{id:'finish-title'},state.practice?'追加練習を終えました':view.finished?'今日の学習は終わりました':'今回の学習は終わりました'));
    if(state.ack)section.append(h('p',{class:'finish-ack','data-finish-ack':''},'お疲れさまでした。'));
    const stats=h('section',{class:'finish-summary','data-session-summary':''},h('h2',{},'今回の学習'));
    if(state.practice)stats.append(copy('p',`${state.practised}枚を追加練習しました。復習予定は変わりません。`,`Practised ${state.practised} cards. The review schedule is unchanged.`));
    else{stats.append(copy('p',`復習${summary.reviewed}枚・[もう一度]${summary.again}枚・新規${summary.new}枚${formatStudyMinutes(summary,'ja')?`・${formatStudyMinutes(summary,'ja')}`:''}`,`${summary.reviewed} reviewed · ${summary.again} Again · ${summary.new} new${formatStudyMinutes(summary,'en')?` · ${formatStudyMinutes(summary,'en')}`:''}`,{'data-session-totals':''}));if(summary.matured)stats.append(copy('p',`習熟期に入ったカード${summary.matured}枚（間隔21日以上）`,`${summary.matured} cards matured (interval 21 days or more)`,{class:'secondary'}));
      if(view.totals.reviewed>summary.reviewed)stats.append(copy('p',`今日の合計：復習${view.totals.reviewed}枚${formatStudyMinutes(view.totals,'ja')?`・${formatStudyMinutes(view.totals,'ja')}`:''}（iPhoneとMac）`,`Today in total: ${view.totals.reviewed} reviews${formatStudyMinutes(view.totals,'en')?` · ${formatStudyMinutes(view.totals,'en')}`:''} (iPhone and Mac)`,{class:'secondary','data-finish-day-totals':''}));}
    section.append(stats);
    if(summary.misses.length){const missed=h('section',{'data-session-misses':''},copy('h2',`今回忘れたカード（${summary.misses.length}枚）`,`Missed this session (${summary.misses.length})`)),entries=new Map(catalog.map(entry=>[entry.taskKey,entry])),list=h('ul');for(const key of summary.misses.slice(0,state.showAll?Infinity:5)){const entry=entries.get(key);if(entry)list.append(h('li',{'data-vocabulary-source':''},h('strong',{},entry.term),entry.reading?h('span',{},entry.reading):null,entry.meaning?h('span',{},entry.meaning):null));}missed.append(list);if(summary.misses.length>5&&!state.showAll)missed.append(button('すべて表示',finishAction(()=>{state.showAll=true;render();}),{class:'text-link','data-show-all-misses':'','data-finish-action':'',disabled:finishBlocked()}));section.append(missed);}
    appendTomorrow(section,view);const conditions=h('section',{'data-finish-conditions':''});appendDayConditions(conditions,view);if(conditions.childNodes.length)section.append(conditions);if(boundaryNotice)section.append(copy('p',boundaryNotice.ja,boundaryNotice.en,{class:'secondary',role:'status','data-boundary-update':''}));
    const activity=h('div',{'data-finish-activity':''});appendSharedActivity(activity);if(activity.childNodes.length)section.append(activity);
    appendStudyOffers(section,view,state.offers,{finish:true});
    if(view.continuity)section.append(copy('p',`直近30日のうち${view.continuity.days}日学習`,`Studied ${view.continuity.days} of the last 30 days`,{class:'secondary continuity','data-study-continuity':''}));
    const sync=h('p',{class:'secondary',role:'status','data-finish-sync':''});sync.append(...[...statusLine.childNodes].map(node=>node.cloneNode(true)));section.append(sync);return h('div',{class:'finish-shell'},section,h('div',{class:'finish-done'},button('完了',finishAction(finishDone),{class:'primary','data-finish-done':'','data-finish-action':'',disabled:finishBlocked()})));
  }
  function allowanceReady(result){const preparation=result?.preparation,setting=preparation?.setting;return preparation?.status==='ready'&&(setting?.status==='unchanged'||setting?.status==='applied'&&setting.eventId===result.eventId&&setting.outcome?.status==='applied');}
  function allowanceReason(reason,{current=null,total=null}={}){const pair=({'invalid-today-total':['今日の合計・日付・タイムゾーンを確認してください。合計は現在の上限から200枚までの整数で指定してください。','Check today’s total, date and timezone. Enter a whole-number total from the current limit to 200.'],'setting-not-applied':['この上限変更は反映されませんでした。今日の上限を確認して選び直してください。','This limit change was not applied. Check today’s limit before choosing again.'],'setting-save-required':['上限を保存できたか確認できません。同じ合計を再試行してください。','The limit save could not be confirmed. Retry the same total.'],'retry-existing-new-override':['前の上限変更を先に再試行してください。別の変更は保存していません。','Retry the previous limit change first. No different change was saved.'],'server-permit-required':['新規カードを受け取る接続がありません。設定を確認してください。','No connection can reserve new cards. Check Settings.'],'new-permits-retry-required':['上限は保存しました。新規カードを受け取れませんでした。同じ操作を再試行してください。','The limit is saved. New cards could not be reserved. Retry preparation.'],'setting-processing-required':['上限の記録は端末に保存されています。処理をもう一度確認してください。','The limit record is saved on this device. Retry processing.'],'override-day-ended':['学習日が変わりました。今日の上限を確認してから選び直してください。','The study day changed. Check today’s limit before choosing again.'],'today-total-already-higher':['別の操作で今日の上限が増えました。現在の上限を確認してください。','Another change raised today’s limit. Check the current limit.'],'offline':['オフラインのため、新規カードを受け取れません。通信が戻ってから再試行してください。','New cards cannot be reserved offline. Retry when connected.']})[reason]??['新規カードの準備を完了できませんでした。同じ操作を再試行してください。','New-card preparation did not finish. Retry the same operation.'];if(['today-total-already-higher','invalid-today-total'].includes(reason)&&Number.isInteger(current?.limit))return[pair[0]+`現在の上限は${current.limit}枚です。`,pair[1]+` Current limit: ${current.limit}.`];if(['setting-save-required','setting-processing-required','new-permits-retry-required','retry-existing-new-override'].includes(reason)&&Number.isInteger(total))return[pair[0]+`再試行する合計は${total}枚です。`,pair[1]+` Retry total: ${total}.`];return pair;}
  function openNewCardsSheet(){
    if(updateBoundary?.held||finishBlocked()||busy||customBusy||pendingIntent||document.querySelector('dialog[open]'))return;
    const view=dayView();if(!costState)costState={day:{day:view.today.day,timezone:view.today.timezone},base:view.today.limit,choices:studyNewCardCost(backend.readProjection(),{at:now()}),eligible:view.availability.eligibleNewIds,selected:null,pending:false,result:null};
    if(!costState.pending&&!costState.choices.choices.some(choice=>choice.add<=costState.eligible.length)){
      const available=costState.eligible.length;costState=null;openCustomSession();
      const panel=main.querySelector('[data-more-new]');panel?.append(copy('p',`追加できる新規カードは${available}枚です。＋5・＋10・＋20で追加できる範囲がないため、今日の合計を直接設定してください。`,`There are ${available} eligible new cards. No +5, +10 or +20 choice fits the available cards and daily limit. Set today's total directly.`,{'data-cost-unavailable':''}));localize();main.querySelector('[data-today-total]')?.focus();return;
    }
    const state=costState,node=h('dialog',{'data-new-card-sheet':'','aria-labelledby':'new-card-title'},h('h2',{id:'new-card-title'},'今日の新規カードを増やす')),rows=h('fieldset',{},h('legend',{},'追加する枚数'));
    const status=h('p',{role:'status','data-new-card-result':''}),confirm=button(state.pending?'準備を再試行':'追加して学習する',async()=>{
      if(state.selected===null||customBusy)return;
      const currentDay=backend.todayAllowance();if(!state.pending&&(currentDay.day!==state.day.day||currentDay.timezone!==state.day.timezone||currentDay.limit!==state.base)){const [ja,en]=allowanceReason(currentDay.day!==state.day.day||currentDay.timezone!==state.day.timezone?'override-day-ended':'today-total-already-higher',{current:currentDay,total:state.base+state.selected});renderInterfacePair(status,ja,en,interfaceLanguage);confirm.disabled=true;costState=null;return;}
      if(!online()){const [ja,en]=allowanceReason('offline');renderInterfacePair(status,ja,en,interfaceLanguage);return;}
      customBusy=true;confirm.disabled=true;for(const radio of rows.querySelectorAll('input'))radio.disabled=true;
      let result;try{result=await backend.setNewTodayTotal(state.base+state.selected,state.day);}catch{result={kind:'failed',reason:'setting-save-required',preparation:{status:'pending',reason:'setting-save-required'}};}
      customBusy=false;if(disposed)return;state.result=result;const preparation=result.preparation??{status:!result.persisted&&(['invalid','unsupported'].includes(result.kind)||result.reason==='retry-existing-new-override')?'stopped':'pending',reason:result.persisted?'setting-processing-required':result.reason||'setting-save-required'};
      if(allowanceReady(result)){
        const candidates=new Set(state.eligible),keys=backend.queue().filter(entry=>candidates.has(entry.taskKey)&&!backend.readProjection().introductions[entry.taskKey]).slice(0,state.selected).map(entry=>entry.taskKey);node.close();node.remove();costState=null;if(keys.length)beginNewSession(keys);else{render();message('上限は保存しましたが、今学習できる新規カードはありません。');}return;
      }
      state.pending=preparation.status==='pending';const [ja,en]=allowanceReason(preparation.reason||result.reason,{current:preparation.current??backend.todayAllowance(),total:state.base+state.selected});renderInterfacePair(status,ja,en,interfaceLanguage);confirm.textContent=state.pending?'準備を再試行':'閉じて確認';confirm.disabled=!state.pending;if(!state.pending)costState=null;render();localize();
    },{class:'primary','data-confirm-new-cards':'',disabled:state.selected===null});
    for(const choice of state.choices.choices.filter(choice=>choice.add<=state.eligible.length)){const input=h('input',{type:'radio',name:'additional-new-cards',value:choice.add,checked:state.selected===choice.add,disabled:state.pending,'data-new-card-choice':choice.add,onchange:()=>{state.selected=choice.add;confirm.disabled=false;}});rows.append(h('label',{},input,copy('span',`＋${choice.add}枚（上限${choice.total}枚）・7日間の復習 約${choice.estimatedReviews}枚増`,`+${choice.add} → limit ${choice.total} · about ${choice.estimatedReviews} more reviews in 7 days`)));}
    node.append(rows,copy('p',state.choices.source==='history'?`過去の学習記録（${state.choices.cohortCards}枚）に基づく見積もりです。`:'十分な記録がないため、1枚あたり約1.1回の復習を見込んでいます。',state.choices.source==='history'?`Estimated from ${state.choices.cohortCards} completed card histories.`:'With limited history, the estimate uses about 1.1 later reviews per new card.',{class:'secondary','data-new-card-cost-source':''}),status,h('div',{class:'dialog-actions'},button('キャンセル',()=>{if(customBusy)return;node.close();node.remove();if(!state.pending)costState=null;main.querySelector('[data-finish]')?.focus({preventScroll:true});},{'data-cancel-new-cards':''}),confirm));
    if(state.pending){const [ja,en]=allowanceReason(state.result?.preparation?.reason||state.result?.reason,{current:state.result?.preparation?.current??backend.todayAllowance(),total:state.base+state.selected});renderInterfacePair(status,ja,en,interfaceLanguage);}node.addEventListener('cancel',event=>{if(customBusy){event.preventDefault();return;}if(!state.pending)costState=null;});node.addEventListener('close',()=>updateBoundary?.sync());root.append(node);localize();node.showModal();updateBoundary?.sync();
  }
  function beginCustomSession(options,taskKeys=null,source=lastInputSource){
    if(updateBoundary?.held)return;
    if(parkedStudy)return retireParkedStudy(()=>beginCustomSession(structuredClone(options),taskKeys&&[...taskKeys],source));
    if(customBusy||busy||pendingIntent)return;
    try{const selection=backend.customSession(options);const selected=new Map(selection.entries.map(entry=>[entry.taskKey,entry]));const entries=taskKeys===null?selection.entries:taskKeys.filter(key=>selected.has(key)).map(key=>selected.get(key));if(!entries.length)return message('この条件で学習できるカードはありません。');customRun={options:selection.options,remaining:[...entries],completed:0,total:entries.length,source};advanceCustomSession();}
    catch{message('セッションの条件を確認してください。');}
  }
  function requestBoundaryCards(record){
    if(updateBoundary?.held||record.waiting||disposed||boundaryPreparation!==record)return;
    if(!online()||!canRequestNewCards()){record.waiting=false;render();return;}
    record.waiting=true;render();
    Promise.resolve().then(()=>platform.requestNewCards()).then(async result=>{
      if(result?.error||['failed','observation-only','unsupported'].includes(result?.kind))throw Error('reserve-unavailable');
      await backend.refresh();
      if(disposed||boundaryPreparation!==record||screen!=='study'||current!==record.current||customRun!==record.run)return;
      boundaryPreparation=null;record.resume(false);
    }).catch(()=>{
      if(disposed||boundaryPreparation!==record||screen!=='study')return;
      record.waiting=false;render();
    });
  }
  function waitForBoundaryCards(resume,allowRequest=true,selected=null,view=null){
    if(!online()||!canRequestNewCards())return false;
    view??=newCardAvailability();
    if(view.availability.requestableNew<=0||selected&&!selected.some(entry=>view.availability.eligibleNewIds.includes(entry.taskKey)))return false;
    if(boundaryPreparation)return true;
    const record=boundaryPreparation={current,run:customRun,resume,waiting:false};
    if(allowRequest)requestBoundaryCards(record);else render();
    return true;
  }
  function advanceCustomSession(allowRequest=true){
    if(updateBoundary?.held)return;
    const ready=customRun?.newOnly?backend.queue():null;
    const eligible=customRun?new Set((ready?ready.filter(entry=>!backend.readProjection().introductions[entry.taskKey]):backend.customSession({...customRun.options,untilDone:true}).entries).map(entry=>entry.taskKey)):new Set();
    let availabilityView=null;
    if(customRun?.newOnly){
      availabilityView=newCardAvailability(ready);const potential=new Set(availabilityView.availability.eligibleNewIds);
      customRun.remaining=customRun.remaining.filter(entry=>eligible.has(entry.taskKey)||potential.has(entry.taskKey));
    }else if(customRun)customRun.remaining=customRun.remaining.filter(entry=>eligible.has(entry.taskKey));
    const index=customRun?.remaining.findIndex(entry=>eligible.has(entry.taskKey))??-1,entry=index>=0?customRun.remaining.splice(index,1)[0]:null;
    if(entry){start(entry,customRun.options?.mode==='practice',false,customRun.options,{source:customRun.source,remaining:customRun.remaining.length+1,preserveRun:!!customRun.newOnly});return;}
    if(customRun?.newOnly&&customRun.remaining.length&&waitForBoundaryCards(advanceCustomSession,allowRequest,customRun.remaining,availabilityView))return;
    completeSitting();
  }
  function start(entry, practice = false,learnAhead=false,session=null,{source=lastInputSource,remaining=null,restore=null,preserveRun=false,readyTaskKeys=null,backlog=false}={}) {
    if (updateBoundary?.held || !entry) return;
    stopTrialAudio();
    if(parkedStudy)return retireParkedStudy(()=>start(entry,practice,learnAhead,session,{source,remaining,restore,preserveRun,readyTaskKeys,backlog}));
    try {
      boundaryPreparation=null;
      boundaryQueue=customRun?[entry,...customRun.remaining].map(item=>item.taskKey):readyTaskKeys??backend.queue().map(item=>item.taskKey);
      const beginning=screen!=='study';if(beginning){boundaryNotice=null;sessionShown=0;const startedAt=now();activeSession={startedAt,eventIds:[],handle:practice?null:sessionEvidence.begin({startedAt}),practice,source,backlog};finishState=null;win.clearTimeout(finishGuardTimer);}
      current?.timer.dispose();
      if(!session&&!preserveRun)customRun=null;
      clearCardSelection();
      current={entry,studyDay:studyDay(),attempt:backend.snapshotAttempt(entry.taskKey,{practice,learnAhead,...(session?{session}:{})}),revealed:!!restore,committed:false,timer:studyTimer(),thinkMs:restore?.thinkMs??null,entrySource:source,revealSource:restore?'key':null,firstInSession:sessionShown++===0,firstEver:!backend.readProjection().reviews.some(row=>!row.undoneAt),remaining:Math.max(1,remaining??(customRun?customRun.remaining.length+1:practice?1:readyCount(backend.queue())))};
      if(restore){current.timer.freeze();current.revealedAt=win.performance.now();}
      screen='study';if(noticeOwner!=='native-sync-action'||!nativeSyncNeedsAttention())message('');render();focusStudyCard();win.scrollTo(0,0);
    } catch { message('翻訳・カードの確認が完了していないため、採点を開始できません。'); }
  }
  function gradeScopeCopy(entry=current?.entry){
    return entry?.contractId==='vocabulary.read.v1'&&!entry.manual?['採点は下線の語だけです。ほかの語は採点に影響しません。','You grade only the underlined word. Other words never change the grade.']:['採点はこのカードの学習対象だけです。ほかの語は採点に影響しません。',"You grade only this card’s target. Other words never change the grade."];
  }
  function keySheet(){
    const rows=[['Space・Return','Space / Return','解答を表示','Show answer'],['Space・Return（解答後）','Space / Return (back)','正解','Good'],['1〜4','1–4','採点：もう一度・難しい・正解・簡単','Grade: Again · Hard · Good · Easy'],['U・⌘Z','U / ⌘Z','最後の採点を元に戻す','Undo last rating'],['E','E','英訳の表示を切り替える','Show or hide the English'],['Esc','Esc','学習を終える','End session'],['?','?','この一覧','This list']];
    const node=h('dialog',{class:'key-sheet','data-key-sheet':''},h('h2',{},copy('span','キー操作','Keys')),h('dl',{},...rows.flatMap(([keyJa,keyEn,ja,en])=>[h('dt',{},copy('kbd',keyJa,keyEn)),h('dd',{},copy('span',ja,en))])),
      trialAudioReady()||(sharedAudioDeclared&&screen==='study'&&current?.revealed)?h('p',{class:'grade-rule','data-trial-audio-help':''},sharedAudioDeclared?copy('span','P：学習対象と全文を再生／停止','P: Play or stop audio'):copy('span',`P：単語と文を再生`,'P: Play word and sentence')):null,
      h('div',{class:'dialog-actions'},button('閉じる',()=>{node.close();node.remove();focusStudyCard();},{class:'primary'})));
    node.addEventListener('close',()=>{node.remove();focusStudyCard();updateBoundary?.sync();});
    root.append(node);node.showModal();localize();updateBoundary?.sync();
  }
  function focusStudyCard(){main.querySelector('[data-card]')?.focus({preventScroll:true});}
  function clearCardSelection(){const selection=win.getSelection(),card=main.querySelector('[data-card]');if(selection&&card&&(card.contains(selection.anchorNode)||card.contains(selection.focusNode)))selection.removeAllRanges();}
  function sharedAudioAuthorized(){
    if(disposed||!sharedAudioDeclared||audioDownloadsBlocked()||sharedAudioOwner!==current||screen!=='study'||!current?.revealed)return false;
    const c=current;
    try{
      return sharedAudioOwner===c&&c.revealed&&screen==='study'&&
        c.entry.taskKey===c.audioSelectionTaskKey&&
        c.attempt.contentRevision===c.audioSelectionContentRevision&&
        sharedAudioRevision(c)===c.audioSelectionAudioRevision&&
        sharedAudioFieldChoice(c)===c.audioSelectionField&&
        sharedAudioProfileChoice(c)===c.audioSelectionProfile;
    }catch{return false;}
  }
  function sharedAudioSource(c=current){
    const e=c?.entry;if(!e)return null;
    try{
      const assignments=c.audioSelectedAssignments??{},version=sharedAudioRoot?.version===2?2:1,snapshot=JSON.stringify([e,assignments,version]);
      if(c.audioSourceSnapshot!==snapshot||!c.audioSourcePlan){
        c.audioSourcePlan=studyAudioSourcePlan(e,assignments,{version});c.audioSourceSnapshot=snapshot;
      }
      return c.audioSourcePlan;
    }catch{return null;}
  }
  function sharedAudioRevision(c=current){return sharedAudioSource(c)?.audioContentRevision??null;}
  function sharedAudioFieldChoice(c=current){
    const id=c?.audioFieldId;
    return typeof id==='string'&&id!=='default'?id:'default';
  }
  function sharedAudioV2Profiles(c=current){
    return studyAudioProfileAssignments(sharedAudioRoot,c?.audioSelectedAssignments??{},sharedAudioSource(c)?.sourceFields??[],sharedAudioSelectedFields(c));
  }
  function sharedAudioProfileChoice(c=current){
    if(sharedAudioRoot?.version===2){const profiles=sharedAudioV2Profiles(c);return Object.values(profiles).some(id=>id===null)?null:JSON.stringify(profiles);}
    if(c&&c.audioProfileId!==undefined)return c.audioProfileId;
    return sharedAudioRoot?.defaultProfileId??null;
  }
  function sharedAudioDefaultFields(c=current){
    const e=c?.entry;if(!e)return [];
    const available=new Set(studyAudioSourceFields(e).map(field=>field.fieldId));
    const grammar=!!e.grammarRecord&&typeof e.contractId==='string'&&e.contractId.startsWith('grammar.');
    const ids=grammar?['pattern']:['term','ja'];
    if(grammar){
      const examples=Array.isArray(e.grammarRecord.examples)?e.grammarRecord.examples:[];
      const passageId=e.passageId??e.grammarTask?.passageId??null;
      const index=passageId==null?-1:examples.findIndex(example=>example&&example.exampleId===passageId);
      if(index<0)return [];
      ids.push(`examples[${index}].ja`);
    }
    if(ids.some(id=>!available.has(id)))return [];
    const seen=new Set();
    return ids.filter(id=>available.has(id)&&!seen.has(id)&&seen.add(id));
  }
  function sharedAudioSelectedFields(c=current){
    if(!c?.entry)return [];
    const choice=sharedAudioFieldChoice(c);
    if(choice==='default')return sharedAudioDefaultFields(c);
    return studyAudioSourceFields(c.entry).some(field=>field.fieldId===choice)?[choice]:[];
  }
  function sharedAudioSelectionKey(c=current){
    if(!c)return null;
    return JSON.stringify([c.entry.taskKey,c.attempt.contentRevision,sharedAudioRevision(c),
      platform.audio?.release?.contentRelease??null,sharedAudioSelectedFields(c),sharedAudioProfileChoice(c),c.revealed?'answer':'front',...(sharedAudioRoot?.version===2?[2]:[])]);
  }
  function sharedAudioSelection(c=current){
    const selection={
      taskKey:c.entry.taskKey,
      contentRevision:c.attempt.contentRevision,
      audioContentRevision:sharedAudioRevision(c),
      contentRelease:platform.audio?.release?.contentRelease??null,
      fields:sharedAudioSelectedFields(c),
      profileId:sharedAudioProfileChoice(c),
      supportedReadingId:null,
      face:c.revealed?'answer':'front',
      sourceFields:sharedAudioSource(c)?.sourceFields??[],
    };
    if(sharedAudioRoot?.version===2){const {profileId,...source}=selection;return {...source,version:2,profileAssignments:sharedAudioV2Profiles(c)};}
    return selection;
  }
  const sharedAudioText=(ja,en)=>interfaceLanguage==='en'?en:interfaceLanguage==='both'?`${ja} / ${en}`:ja;
  function sharedAudioStatusCopy(code){
    switch(code){
      case 'pending':return ['選択した項目の音声は準備中です。','Audio for the selected field is still pending preparation.'];
      case 'profile-unassigned':return ['音声プロファイルが割り当てられていません。','No audio profile is assigned.'];
      case 'profile-unavailable':return ['選択した音声プロファイルは利用できません。','The selected audio profile is unavailable.'];
      case 'source-stale':return ['音声がこのカードの内容と一致しません。項目またはプロファイルを選び直してください。','Audio no longer matches this card. Choose another field or profile.'];
      case 'content-release-mismatch':return ['音声のリリースがこのカードと一致しません。','The audio release does not match this card.'];
      case 'integrity-invalid':return ['音声の完全性を確認できませんでした。','Audio integrity is invalid.'];
      case 'unsupported-capability':return ['この端末では共有音声を利用できません。','Shared audio is unsupported on this device.'];
      case 'preparation-failed':return ['音声の準備に失敗しました。','Audio preparation failed.'];
      case 'offline-missing':return ['オフラインのため音声を利用できません。','Audio is not available offline.'];
      case 'decode':return ['音声を再生できませんでした。もう一度タップしてください。','Audio could not play. Tap to try again.'];
      case 'invalid':return ['音声の指定が正しくありません。','The audio selection is invalid.'];
      default:return ['音声を準備しています…','Preparing audio…'];
    }
  }
  function sharedAudioStatusInto(node,c=current){
    const code=c?.audioStatus??'preparing';
    if(code==='ready'||code==='cancelled'||code==='face-hidden'){node.hidden=true;renderInterfacePair(node,'','',interfaceLanguage);return;}
    const [ja,en]=sharedAudioStatusCopy(code);node.hidden=false;renderInterfacePair(node,ja,en,interfaceLanguage);
  }
  function sharedAudioDefaultLabel(c=current){
    const fields=sharedAudioDefaultFields(c).map(fieldId=>sharedAudioFieldLabels(fieldId,c));
    const ja=fields.length?fields.map(labels=>labels[0]).join(' · '):'—';
    const en=fields.length?fields.map(labels=>labels[1]).join(' · '):'—';
    return sharedAudioText(`既定（${ja}）`,`Default (${en})`);
  }
  function sharedAudioFieldLabels(fieldId,c=current){
    if(fieldId==='meaning'&&c?.entry?.manual===true)return ['意味','Meaning'];
    const labels={term:['単語','Word'],reading:['読み','Reading'],ja:['例文（日本語）','Example (Japanese)'],
      defJa:['定義（日本語）','Definition (Japanese)'],meaning:['意味（英語）','Meaning (English)'],
      note:['補足','Notes'],en:['例文（英語）','Example (English)'],pattern:['文型','Pattern'],
      formation:['接続','Formation'],nuance:['ニュアンス','Nuance']};
    if(Object.hasOwn(labels,fieldId))return labels[fieldId];
    const example=/^examples\[(\d+)\]\.(ja|en)$/.exec(fieldId);
    if(example){
      const number=Number(example[1])+1,japanese=example[2]==='ja';
      return [`例文${number}（${japanese?'日本語':'英語'}）`,`Example ${number} (${japanese?'Japanese':'English'})`];
    }
    const collocation=/^collocations\[(\d+)\]$/.exec(fieldId);
    if(collocation)return [`連語${Number(collocation[1])+1}`,`Collocation ${Number(collocation[1])+1}`];
    const reference=/^relatedReferences\[(\d+)\]\.text$/.exec(fieldId);
    if(reference)return [`関連項目${Number(reference[1])+1}`,`Related reference ${Number(reference[1])+1}`];
    return ['項目','Field'];
  }
  function fillSharedAudioProfiles(select,c=current){
    select.replaceChildren();
    if(!sharedAudioRoot){
      select.append(h('option',{value:''},sharedAudioText('読み込み中…','Loading…')));
      select.disabled=true;return;
    }
    if(sharedAudioRoot.version===2){
      const ids=Object.values(sharedAudioV2Profiles(c)),assigned=ids.length>0&&ids.every(id=>typeof id==='string');
      select.append(h('option',{value:'configured'},assigned?sharedAudioText('指定済みの音声','Configured voices'):sharedAudioText('未割り当て','Unassigned')));
      select.value='configured';select.disabled=true;return;
    }
    const profiles=sharedAudioRoot.profiles??[],defaultId=sharedAudioRoot.defaultProfileId??null;
    if(defaultId===null||profiles.length===0)select.append(h('option',{value:''},sharedAudioText('未割り当て','Unassigned')));
    for(const profile of profiles)select.append(h('option',{value:profile.id},profile.id));
    const selected=sharedAudioProfileChoice(c);
    select.value=selected??'';
    select.disabled=false;
  }
  function sharedAudioPanel(c=current){
    const fields=studyAudioSourceFields(c.entry);
    const fieldSelect=h('select',{'aria-label':sharedAudioText('音声の項目','Audio field'),'data-study-audio-field':'',
      onchange:event=>changeSharedAudioChoice(c,{fieldId:event.currentTarget.value})});
    fieldSelect.append(h('option',{value:'default'},sharedAudioDefaultLabel(c)));
    for(const field of fields)fieldSelect.append(h('option',{value:field.fieldId},sharedAudioText(...sharedAudioFieldLabels(field.fieldId,c))));
    const choice=sharedAudioFieldChoice(c);
    fieldSelect.value=choice==='default'||fields.some(field=>field.fieldId===choice)?choice:'default';
    const profileSelect=h('select',{'aria-label':sharedAudioText('音声プロファイル','Audio profile'),'data-study-audio-profile':'',
      onchange:event=>changeSharedAudioChoice(c,{profileId:event.currentTarget.value===''?null:event.currentTarget.value})});
    fillSharedAudioProfiles(profileSelect,c);
    const status=h('p',{class:'secondary','data-study-audio-status':'',role:'status'});
    sharedAudioStatusInto(status,c);
    return h('div',{class:'study-audio-panel','data-study-audio-panel':''},
      h('details',{class:'fold','data-study-audio-options':''},
        copy('summary','音声オプション','Audio options'),
        h('div',{class:'study-audio-fields'},h('label',{},copy('span','項目','Field'),fieldSelect),h('label',{},copy('span','プロファイル','Profile'),profileSelect))),
      status);
  }
  function syncSharedAudioPanel(c=current,panel=null){
    panel??=main.querySelector('[data-study-audio-panel]');if(!panel)return;
    const fieldSelect=panel.querySelector('[data-study-audio-field]');
    if(fieldSelect){
      const fields=studyAudioSourceFields(c.entry),choice=sharedAudioFieldChoice(c);
      fieldSelect.value=choice==='default'||fields.some(field=>field.fieldId===choice)?choice:'default';
    }
    const profileSelect=panel.querySelector('[data-study-audio-profile]');if(profileSelect)fillSharedAudioProfiles(profileSelect,c);
    const status=panel.querySelector('[data-study-audio-status]');if(status)sharedAudioStatusInto(status,c);
  }
  function stopTrialAudio(){
    stopSharedAudioRoot();
    trialAudioPlaybackGeneration++;
    trialAudio?.stop();
    studyAudio?.stop();
    sharedAudioOwner=null;
    const c=current;
    if(c){
      c.audioSourceController?.abort();c.audioSourceController=null;c.audioSourcePromise=null;
      c.audioPlaying=false;
      c.audioPlayGeneration=(c.audioPlayGeneration??0)+1;
      c.audioGeneration=(c.audioGeneration??0)+1;
      c.audioPromise=null;
    }
  }
  function audioDownloadsBlocked(){
    return ['paused','disposed'].includes(platform.audioDownloads?.read().state);
  }
  function invalidateDownloadedAudio(){
    stopTrialAudio();
    for(const c of [current,parkedStudy?.current]){
      if(!c)continue;
      c.audioGeneration=(c.audioGeneration??0)+1;
      c.audioResult=null;c.audioResolverKey=null;c.audioPromise=null;c.audioStatus='preparation-failed';
    }
    syncSharedAudioDom();
  }
  function retryDownloadedAudio(){
    if(!sharedAudioDeclared)return;
    stopSharedAudioRoot();
    if(['offline','integrity'].includes(sharedAudioRootState))sharedAudioRootState='idle';
    for(const c of [current,parkedStudy?.current]){
      if(!c)continue;
      const failed=['offline-missing','integrity-invalid','preparation-failed','cancelled'].includes(c.audioStatus);
      const resolving=c.audioResult?.status!=='ready'&&(c.audioPromise||c.audioSourcePromise);
      if(!failed&&!resolving)continue;
      if(c===current&&sharedAudioOwner===c){studyAudio?.stop();sharedAudioOwner=null;}
      c.audioSourceController?.abort();c.audioSourceController=null;c.audioSourcePromise=null;
      c.audioGeneration=(c.audioGeneration??0)+1;
      c.audioResult=null;c.audioResolverKey=null;c.audioPromise=null;c.audioStatus='preparing';
    }
  }
  function trialAudioMember(c=current){return !!trialAudio&&!!c?.entry?.noteGuid&&trialAudio.has(c.entry.noteGuid);}
  function trialAudioReady(c=current){return !!trialAudio&&!!c?.revealed&&trialAudioMember(c);}
  function trialAudioLabel(active=false,c=current){
    if(sharedAudioDeclared&&!active&&sharedAudioFieldChoice(c)!=='default'){
      const [ja,en]=sharedAudioFieldLabels(sharedAudioFieldChoice(c),c);
      return sharedAudioText(`${ja}を再生（P）`,`Play ${en} (P)`);
    }
    const [ja,en]=sharedAudioDeclared
      ?active?['音声を停止（P）','Stop audio (P)']:['学習対象と全文を再生（P）','Play target and entire passage (P)']
      :active?['Kore 試聴：再生を停止（P）','Kore trial: Stop audio (P)']:['Kore 試聴：単語と文を再生（P）','Kore trial: Play word and sentence (P)'];
    return sharedAudioText(ja,en);
  }
  function trialAudioButton(card=current){
    const c=card,shared=sharedAudioDeclared,playing=shared&&!!c?.audioPlaying,ready=shared&&c?.audioResult?.status==='ready';
    const label=trialAudioLabel(playing,c);
    return button('🔊',event=>{
      event.preventDefault();event.stopPropagation();
      if(shared)toggleSharedAudio(c,event.currentTarget);else playTrialAudio(c,event.currentTarget);
      focusStudyCard();
    },{class:'quiet study-icon','aria-label':label,title:label,'data-trial-audio':'','aria-busy':'false',...(shared?{'data-study-audio':'',disabled:!(ready||playing)}:{})});
  }
  function syncTrialAudioControl(){
    if(disposed)return;
    if(sharedAudioDeclared){syncSharedAudioCurrent();return;}
    if(screen!=='study'||!current)return;
    const actions=main.querySelector('.study-actions');if(!actions)return;
    const existing=actions.querySelector('[data-trial-audio]');
    if(!trialAudioReady(current)){existing?.remove();return;}
    if(existing)return;
    const node=trialAudioButton(current),remaining=actions.querySelector('[data-study-remaining]');
    if(remaining)actions.insertBefore(node,remaining);else actions.prepend(node);
  }
  function trialAudioFailure(){
    const ja=`音声を再生できません。もう一度タップしてください。`,en='Audio could not play. Tap to try again.';
    message(interfaceLanguage==='en'?en:interfaceLanguage==='both'?`${ja} / ${en}`:ja);
  }
  function playTrialAudio(card=current,control=null){
    const c=card;
    if(disposed||screen!=='study'||!c||c!==current||!c.revealed||!trialAudioMember(c))return;
    const live=main.querySelector('[data-trial-audio]');
    if(control&&control!==live)return;
    control=live;
    const generation=++trialAudioPlaybackGeneration;
    control?.setAttribute('aria-busy','true');
    trialAudio.play(c.entry.noteGuid).catch(()=>{if(generation===trialAudioPlaybackGeneration&&!disposed&&screen==='study'&&c===current&&trialAudioReady(c))trialAudioFailure();})
      .finally(()=>{if(generation===trialAudioPlaybackGeneration&&!disposed&&screen==='study'&&c===current&&c.revealed&&control?.isConnected&&control===main.querySelector('[data-trial-audio]'))control.setAttribute('aria-busy','false');});
  }
  function stopSharedAudioRoot(){
    sharedAudioRootController?.abort();sharedAudioRootController=null;
    if(sharedAudioRootState==='loading'){sharedAudioRootPromise=null;sharedAudioRootState='idle';}
  }
  function loadSharedAudioRoot(){
    if(!sharedAudioDeclared||!studyAudio)return Promise.resolve(null);
    if(sharedAudioRootState==='ready')return Promise.resolve(sharedAudioRoot);
    if(sharedAudioRootPromise)return sharedAudioRootPromise;
    sharedAudioRootState='loading';
    const controller=new AbortController();sharedAudioRootController=controller;
    const promise=studyAudio.load({signal:controller.signal}).then(root=>{
      if(disposed||controller.signal.aborted)return null;
      sharedAudioRoot=root;sharedAudioRootState='ready';
      if(screen==='study'&&current?.revealed)syncSharedAudioCurrent();
      return root;
    },error=>{
      if(!disposed&&!controller.signal.aborted){
        sharedAudioRoot=null;sharedAudioRootState=error?.audioCode==='unsupported'?'unsupported':error?.audioCode==='offline'?'offline':'integrity';
        if(screen==='study'&&current?.revealed)syncSharedAudioCurrent();
      }
      return null;
    }).finally(()=>{if(sharedAudioRootPromise===promise){sharedAudioRootPromise=null;sharedAudioRootController=null;}});
    sharedAudioRootPromise=promise;return promise;
  }
  function syncSharedAudioCurrent(sourceChecked=false){
    if(disposed||!sharedAudioDeclared||screen!=='study'||!current||!current.revealed)return;
    if(audioDownloadsBlocked()){invalidateDownloadedAudio();return;}
    const c=current;
    if(c.audioFieldId===undefined)c.audioFieldId='default';
    if(sharedAudioRootState==='idle'){c.audioStatus='preparing';syncSharedAudioDom(c);loadSharedAudioRoot();return;}
    if(sharedAudioRootState==='loading'){c.audioStatus='preparing';syncSharedAudioDom(c);return;}
    if(sharedAudioRootState!=='ready'){c.audioStatus=sharedAudioRootState==='unsupported'?'unsupported-capability':sharedAudioRootState==='offline'?'offline-missing':'integrity-invalid';sharedAudioOwner=null;syncSharedAudioDom(c);return;}
    if(!sourceChecked&&typeof platform.audioDownloads?.readSource==='function'){
      if(c.audioSourcePromise)return;
      const controller=new AbortController(),generation=c.audioGeneration??0,taskKey=c.entry.taskKey;
      c.audioSourceController=controller;
      const active=()=>!disposed&&!controller.signal.aborted&&c===current&&screen==='study'&&c.revealed&&(c.audioGeneration??0)===generation&&c.entry.taskKey===taskKey;
      const promise=Promise.resolve().then(()=>platform.audioDownloads.readSource({taskKeys:[taskKey],signal:controller.signal})).then(source=>{
        if(!active())return;
        if(!source?.selectedAssignments)throw Error('study-audio-source-assignments');
        const snapshot=JSON.stringify(source.selectedAssignments);
        if(c.audioAssignmentSnapshot!==undefined&&c.audioAssignmentSnapshot!==snapshot)stopTrialAudio();
        c.audioSelectedAssignments=JSON.parse(snapshot);c.audioAssignmentSnapshot=snapshot;
        c.audioSourcePromise=null;c.audioSourceController=null;
        syncSharedAudioCurrent(true);
      }).catch(error=>{
        if(!active())return;
        stopTrialAudio();
        c.audioResult=null;c.audioResolverKey=null;c.audioStatus=error?.audioCode==='cancelled'||error?.name==='AbortError'?'cancelled':'integrity-invalid';
        sharedAudioOwner=null;syncSharedAudioDom(c);
      }).finally(()=>{
        if(c.audioSourcePromise===promise){c.audioSourcePromise=null;c.audioSourceController=null;}
      });
      c.audioSourcePromise=promise;
      if(!c.audioResult){c.audioStatus='preparing';syncSharedAudioDom(c);}
      return;
    }
    const fields=sharedAudioSelectedFields(c),profileId=sharedAudioProfileChoice(c),revision=sharedAudioRevision(c);
    if(!fields.length||revision===null){
      c.audioStatus=revision===null?'integrity-invalid':'source-stale';c.audioResult=null;c.audioResolverKey=null;c.audioPromise=null;sharedAudioOwner=null;syncSharedAudioDom(c);return;
    }
    if(profileId===null){
      c.audioStatus='profile-unassigned';c.audioResult=null;c.audioResolverKey=null;c.audioPromise=null;sharedAudioOwner=null;syncSharedAudioDom(c);return;
    }
    const key=sharedAudioSelectionKey(c);
    if(c.audioResult&&c.audioResolverKey===key){
      c.audioStatus=c.audioResult.status==='ready'?'ready':c.audioResult.status;
      if(c.audioStatus!=='ready')sharedAudioOwner=null;
      syncSharedAudioDom(c);return;
    }
    if(c.audioResolverKey===key&&c.audioPromise){c.audioStatus='preparing';syncSharedAudioDom(c);return;}
    const generation=(c.audioGeneration??0)+1;c.audioGeneration=generation;
    c.audioResolverKey=key;c.audioResult=null;c.audioStatus='preparing';sharedAudioOwner=c;
    c.audioSelectionTaskKey=c.entry.taskKey;
    c.audioSelectionContentRevision=c.attempt.contentRevision;
    c.audioSelectionAudioRevision=revision;
    c.audioSelectionField=sharedAudioFieldChoice(c);
    c.audioSelectionProfile=profileId;
    const selection=sharedAudioSelection(c);
    const promise=studyAudio.resolve(selection).then(result=>{
      if(disposed||c!==current||screen!=='study'||!c.revealed||c.audioGeneration!==generation||c.audioResolverKey!==key)return;
      c.audioPromise=null;c.audioResult=result??null;c.audioStatus=result?.status??'integrity-invalid';
      if(c.audioStatus!=='ready')sharedAudioOwner=null;
      syncSharedAudioDom(c);
    },error=>{
      if(disposed||c!==current||screen!=='study'||!c.revealed||c.audioGeneration!==generation||c.audioResolverKey!==key)return;
      c.audioPromise=null;c.audioResult=null;
      c.audioStatus=error?.audioCode==='unsupported'?'unsupported-capability':error?.audioCode==='cancelled'?'cancelled':'integrity-invalid';
      sharedAudioOwner=null;syncSharedAudioDom(c);
    }).finally(()=>{if(c.audioPromise===promise)c.audioPromise=null;});
    c.audioPromise=promise;
    syncSharedAudioDom(c);
  }
  function syncSharedAudioDom(c=current){
    if(disposed||!sharedAudioDeclared||c!==current||screen!=='study'||!c?.revealed)return;
    const actions=main.querySelector('.study-actions');
    let control=actions?.querySelector('[data-trial-audio]');
    if(actions&&!control){
      control=trialAudioButton(c);const remaining=actions.querySelector('[data-study-remaining]');
      if(remaining)actions.insertBefore(control,remaining);else actions.prepend(control);
    }
    if(control){
      const playing=!!c.audioPlaying,ready=c.audioResult?.status==='ready',label=trialAudioLabel(playing,c);
      control.setAttribute('aria-label',label);control.title=label;
      control.disabled=!(ready||playing);
      control.setAttribute('aria-busy',String(playing));
      control.setAttribute('data-study-audio','');
    }
    let panel=main.querySelector('[data-study-audio-panel]');
    if(!panel){const heading=main.querySelector('.study-heading');if(heading){panel=sharedAudioPanel(c);heading.after(panel);}}
    if(panel)syncSharedAudioPanel(c,panel);
  }
  function changeSharedAudioChoice(c,{fieldId,profileId}={}){
    if(disposed||c!==current||screen!=='study')return;
    stopTrialAudio();
    if(fieldId!==undefined)c.audioFieldId=fieldId;
    if(profileId!==undefined)c.audioProfileId=profileId;
    c.audioResolverKey=null;c.audioResult=null;c.audioPromise=null;c.audioStatus='preparing';
    syncSharedAudioCurrent();
  }
  function playSharedAudio(c=current){
    if(disposed||audioDownloadsBlocked()||screen!=='study'||!c||c!==current||!c.revealed||c.audioResult?.status!=='ready')return;
    sharedAudioOwner=c;
    const generation=(c.audioPlayGeneration??0)+1;c.audioPlayGeneration=generation;
    c.audioPlaying=true;
    const live=main.querySelector('[data-study-audio]');
    live?.setAttribute('aria-busy','true');
    syncSharedAudioDom(c);
    studyAudio.play(c.audioResult).catch(()=>{
      if(c.audioPlayGeneration!==generation||disposed||screen!=='study'||c!==current||!c.revealed)return;
      c.audioStatus='decode';trialAudioFailure();syncSharedAudioDom(c);
    }).finally(()=>{
      if(c.audioPlayGeneration!==generation||disposed||screen!=='study'||c!==current||!c.revealed)return;
      c.audioPlaying=false;live?.setAttribute('aria-busy','false');syncSharedAudioDom(c);
    });
  }
  function toggleSharedAudio(c=current,control=null){
    if(disposed||screen!=='study'||!c||c!==current||!c.revealed)return;
    if(control&&control!==main.querySelector('[data-study-audio]'))return;
    if(c.audioPlaying){stopTrialAudio();syncSharedAudioDom(c);return;}
    if(c.audioResult?.status!=='ready')return;
    playSharedAudio(c);
  }
  let lastCardActionAt=-Infinity;
  function revealCard(c=current,source=lastInputSource){
    if(updateBoundary?.held||!c||c!==current||c.revealed||c.sessionInfoOpen||busy||pendingIntent||pop||document.querySelector('dialog[open]'))return;
    clearCardSelection();c.thinkMs=c.timer.freeze();c.revealed=true;c.revealSource=source;c.revealedAt=lastCardActionAt=win.performance.now();render();focusStudyCard();
  }
  function passage(text, options = {}) { return renderVocabularyPassage(document,current.entry,text,{...options,onWord:openWord,dictionary}); }
  const fold = (label, ...contents) => h('details',{class:'fold'},h('summary',{},label),...contents);
  function studyScreen() {
    const c=current, e=c.entry, p=backend.readProjection(), task=p.tasks[e.taskKey];
    const section=h('section',{class:'study','data-study':c.revealed?'back':'front','data-reveal-source':c.revealSource,
      'data-entry-source':c.entrySource,'data-focus':c.sessionInfoOpen?'session-info':'simple'});
    const studyAction=(label,icon,action,attrs)=>button(icon,action,
      {class:'quiet study-icon','aria-label':label,title:label,...attrs});
    const actions=h('div',{class:'study-actions'},
      studyAction('学習を終える','×',()=>navigate('today'),{'data-study-exit':''}),
      copy('span',`残り${c.remaining}枚`,`${c.remaining} left`,{class:'study-remaining','data-study-remaining':''}),lastReview?studyAction('元に戻す','↶',undoLast,{'data-undo':''}):null);
    actions.append(studyAction('メニュー','⋯',()=>{if(!current.sessionInfoOpen){const undo=main.querySelector('[data-menu-undo]');if(undo&&!availableUndo())undo.remove();}setStudyMenu(!c.sessionInfoOpen);},
      {'data-session-info':'','aria-haspopup':'menu','aria-expanded':String(!!c.sessionInfoOpen),'aria-controls':'study-help'}));
    const audioControl=sharedAudioDeclared?(c.revealed?trialAudioButton(c):null):(trialAudioReady(c)?trialAudioButton(c):null);
    if(audioControl)actions.insertBefore(audioControl,actions.querySelector('[data-study-remaining]'));
    const context=h('span',{id:'study-context'},`${MODULES.find(m=>m[0]===e.module)?.[1]||'文法'} · ${c.attempt.learnAhead?'学習ステップ（少し早め） · ':''}${c.attempt.mode==='practice'?'追加練習（採点なし）':e.contractId==='grammar.cloze.v1'?'思い出す':e.contractId==='grammar.meaning.v1'?'意味':'読んで思い出す'}`);
    const heading=h('div',{class:'study-heading'},actions,context);if(boundaryNotice)heading.append(copy('p',boundaryNotice.ja,boundaryNotice.en,{class:'boundary-notice',role:'status','data-boundary-update':''}));section.append(heading);
    if(sharedAudioDeclared&&c.revealed)section.append(sharedAudioPanel(c));
    const card=h('article',{class:'study-card','data-card':'',tabindex:'0',
      ...(c.revealed?{role:'region','aria-labelledby':'study-card-term'}:{role:'button','aria-label':'解答を表示',
        'aria-describedby':'study-card-content','aria-keyshortcuts':'Space Enter','data-reveal':''})});
    cardViews.set(card,{current:c,revealed:c.revealed});
    if(customRun)section.append(h('p',{id:'study-progress','data-session-progress':''},'カスタム学習',' · ',`${customRun.completed+1} / ${customRun.total}`,customRun.options?.mode==='review-ahead'?h('span',{},' · ','先取り復習'):null));
    if(!c.revealed){card.append(frontFor(e).node.cloneNode(true));}
    else if(e.manual){
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
    if(c.revealed&&c.firstInSession&&!e.manual)card.append(copy('p',phonePresentation?'本文の語をタップすると、読みと意味を確認できます。':'本文の語をクリックすると、読みと意味を確認できます。',phonePresentation?'Tap any word in the passage to see its reading and meaning.':'Click any word in the passage to see its reading and meaning.',{class:'back-lookup-hint','data-back-lookup-hint':''}));
    if(!c.revealed&&c.firstInSession)card.append(h('p',{class:'first-card-hint','data-first-card-hint':''},phonePresentation?'タップで解答を表示':'Spaceで解答を表示'));
    section.append(card);
    // ⋯ is a real menu: actions first, then where to go, then how it looks; the grading guide folds into Help.
    const item=(ja,en,fn,attrs={},key=null)=>h('button',{type:'button',class:'study-menu-item',role:'menuitem',onclick:fn,...attrs},copy('span',ja,en),key?h('kbd',{},key):null);
    const chip=(label,checked,fn,attrs={})=>h('button',{type:'button',class:'study-menu-chip',role:'menuitemradio','aria-checked':String(checked),onclick:fn,...attrs},...label);
    const group=(ja,en,...children)=>h('div',{class:'study-menu-group',role:'group','aria-label':ja},copy('p',ja,en,{class:'study-menu-label'}),h('div',{class:'study-menu-chips'},...children));
    const themeChips=()=>[['auto','自動'],...Object.entries(themes.themes).map(([id,t])=>[id,t.name])].map(([id,name])=>{
      const t=themes.themes[id==='auto'?(dark.matches?'dark':'washi'):id].tokens;
      return chip([h('i',{style:`background:${t.ground};border-color:${t.accent}`}),name],theme===id,ev=>{applyTheme(id);for(const b of guide.querySelectorAll('[data-menu-theme]'))b.setAttribute('aria-checked',String(b.dataset.menuTheme===theme));ev.currentTarget.focus();},{'data-menu-theme':id});});
    const setLanguage=async value=>{if(updateBoundary?.held)return;interfaceLanguage=value;for(const picker of root.querySelectorAll('[data-interface-language]'))picker.value=value;const end=beginFlight('preference');try{await preferences.setItem('nihongo.interface-language.v1',value);}catch{message('表示言語を保存できません。');}finally{end();}render();main.querySelector(`[data-menu-language="${value}"]`)?.focus({preventScroll:true});};
    const guide=h('div',{id:'study-help',class:'study-help study-menu',role:'menu','aria-label':'メニュー'},
      item('学習を終える','End session',endStudy,{'data-menu-end':''},'Esc'),
      availableUndo()?item('最後の採点を元に戻す','Undo last rating',()=>{setStudyMenu(false);undoLast();},{'data-menu-undo':''},'U'):null,
      item('このカードの誤りを報告','Report a problem with this card',()=>{setStudyMenu(false);correctionDialog();},{'data-report-problem':''}),
      h('hr',{role:'separator'}),
      group('移動','Go to',...[['today','今日','Today'],['words','単語','Words'],['record','記録','Record'],['settings','設定','Settings']].map(([id,ja,en])=>chip([copy('span',ja,en)],false,()=>navigate(id),{role:'menuitem','aria-checked':null,'data-menu-nav':id}))),
      group('色','Theme',...themeChips()),
      group('表示言語','Language',...[['ja','日本語'],['en','English'],['both','両方']].map(([value,label])=>chip([label],interfaceLanguage===value,()=>setLanguage(value),{'data-menu-language':value}))),
      h('hr',{role:'separator'}),
      h('details',{class:'study-menu-help','data-menu-help':'',open:!!c.menuHelpOpen,ontoggle:event=>{if(event.currentTarget.isConnected)c.menuHelpOpen=event.currentTarget.open;}},h('summary',{role:'menuitem'},copy('span','採点の目安とキー','Grading guide and keys')),copy('p',...gradeScopeCopy(e),{class:'grade-rule','data-grade-scope':''}),!phonePresentation?copy('p','?キーですべてのキー操作を表示します。','Press ? to see every key.',{class:'grade-rule'}):null,h('p',{class:'grade-rule'},'もう一度：思い出せなかった・難しい：苦労して思い出せた（合格）・正解：思い出せた・簡単：すぐに思い出せた'),h('p',{class:'grade-rule'},'思い出せなかったときは、惜しくても[もう一度]を選んでください。'),!phonePresentation?h('p',{class:'grade-rule'},'Space・Return：解答を表示・解答後は正解／1〜4：採点／U：元に戻す／E：英訳／?：キー操作／Esc：学習を終える'):null));
    let dismissPointer=null,swallowClick=false;
    section.addEventListener('pointerdown',ev=>{
      dismissPointer=null;swallowClick=false;
      if(c.sessionInfoOpen&&!guide.contains(ev.target)&&!ev.target.closest('[data-session-info]')){
        dismissPointer=ev.pointerId;swallowClick=true;ev.preventDefault();ev.stopPropagation();setStudyMenu(false);
      }
    },true);
    for(const type of ['pointermove','pointerup','pointercancel'])section.addEventListener(type,ev=>{if(ev.pointerId===dismissPointer){ev.preventDefault();ev.stopPropagation();}},true);
    section.addEventListener('click',ev=>{if(swallowClick){swallowClick=false;ev.preventDefault();ev.stopPropagation();}},true);
    guide.prepend(context);section.append(guide);
    if (c.revealed&&!c.committed) appendStudyControls(section,c);
    if(boundaryPreparation)section.append(h('div',{class:'decision-panel operation-status',role:'status','data-decision-panel':'','data-boundary-preparation':''},h('p',{},boundaryPreparation.waiting?'回答を保存しました。新規カードを準備しています…':'回答は保存されています。新規カードを受け取れませんでした。もう一度準備できます。'),boundaryPreparation.waiting?null:button('準備を再試行',()=>requestBoundaryCards(boundaryPreparation),{class:'primary','data-retry-boundary':''})));
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
      if(activate&&ev.button===0&&!interactive(ev.target)&&!selected()&&(ev.detail===0||win.performance.now()-lastCardActionAt>=400))revealCard(c);
    });
    return section;
  }
  function appendStudyControls(section,c) {
    const practice=c.attempt.mode==='practice';
    const finishPractice=()=>button('追加練習を終える',endStudy,{class:'primary','data-finish-practice':''});
    if(pendingIntent){
      section.append(h('div',{class:'decision-panel operation-status','data-decision-panel':'','data-operation-status':'',role:operationRole()},h('p',{},operationCopy()),root.querySelector('dialog[open]')?null:button(operationRetryLabel(),retryOperation,{class:'primary','data-retry':'',disabled:busy})));
      return;
    }
    if(c.stale){section.append(staleControls(c));return;}
    if(phonePresentation&&practice&&!customRun){section.append(finishPractice());return;}
    let preview;
    if(!c.ratingsUnavailable&&(!practice||!phonePresentation)){try{preview=backend.preview(c.attempt,c.thinkMs);}catch{}}
    const latestTask=backend.readProjection().tasks[c.entry.taskKey];if(!practice&&!preview&&latestTask&&(latestTask.head!==c.attempt.parent||latestTask.contentRevision!==c.attempt.contentRevision)){c.stale={submitted:false,persisted:false,reason:'card-updated'};section.append(staleControls(c));return;}
    if(phonePresentation&&(c.ratingsUnavailable||(!practice&&!preview))){
      if(!c.ratingsUnavailable){
        c.ratingsUnavailable=true;
        queueMicrotask(()=>refreshPhoneRatings(c));
      }
      section.append(button(c.requestedRating?'保存を再試行':'評価を再読み込み',()=>refreshPhoneRatings(c),
        {class:'primary','data-retry-ratings':'',disabled:busy||!!pendingIntent}));
      return;
    }
    const panel=h('div',{class:'decision-panel','data-decision-panel':''}),answer=[c.entry.reading||c.entry.term,c.entry.meaning].filter(Boolean).join(' · ');
    const answerLine=h('p',{class:'answer-line'},h('span',{'data-vocabulary-source':''},answer));
    if(Number.isFinite(c.thinkMs)&&c.thinkMs>=0){const seconds=Math.round(c.thinkMs/1000);answerLine.append(copy('span',`${seconds}秒`,`${seconds} s`,{class:'secondary answer-time','data-answer-time':''}));}
    panel.append(answerLine);
    if(c.firstInSession&&c.firstEver)panel.append(h('p',{class:'first-grade-guide','data-first-grade-guide':''},'もう一度：思い出せなかった・難しい：苦労して思い出せた（合格）・正解：思い出せた・簡単：すぐに思い出せた'),h('p',{class:'first-grade-guide'},'思い出せなかったときは、惜しくても[もう一度]を選んでください。'));
    const bar=h('div',{class:'grade-bar','aria-label':'思い出せた度合い'});
    for(const [rating,jp,en,seal] of GRADES) {
      const wait=c.attempt.mode==='practice'?'追加練習':preview?.cards?.[rating] ? interval(Math.max(0,Date.parse(preview.cards[rating].due)-now())) : '確認中';
      const effective=preview?.ratings?.[rating]?.effectiveRating;
      const capped=effective&&effective!==rating;
      const effectiveGrade=capped?GRADES.find(g=>g[0]===effective):null;
      bar.append(button('',()=>grade(rating,'click'),{class:`grade rating-${effectiveGrade?.[0]||rating}`,disabled:busy||!!pendingIntent||c.attempt.mode==='scored'&&!preview||c.attempt.mode==='practice'&&!customRun,'data-grade':rating}));
      const label=copy('span',capped?`${jp} → ${effectiveGrade[1]}`:jp,capped?`${en} → ${effectiveGrade[2]}`:en,{class:'grade-caption','data-interface-layout':'grade',...(capped?{'data-grade-capped-label':interfaceLanguage}:{'data-grade-label':''})});bar.lastChild.append(label);
      if(!phonePresentation||intervalHints)bar.lastChild.append(h('span',{class:'grade-hints'},!phonePresentation?h('small',{'data-grade-key':''},String(rating)):null,intervalHints?h('small',{'data-grade-interval':''},wait):null));
    }
    panel.append(bar);section.append(panel);
    if(phonePresentation)return;
    if(!practice&&!preview)section.append(h('p',{class:'grade-rule',role:'status','data-stale-attempt':''},'表示後に記録が変わりました。評価は送信していません。本棚からカードを開き直してください。'));
    if(practice)section.append(finishPractice());

  }
  function staleControls(c){return h('div',{class:'decision-panel operation-status','data-decision-panel':'','data-stale-attempt':'',role:'status'},h('p',{},c.stale.persisted?'回答の記録は端末に保存されていますが、今のカードには反映されませんでした。':'このカードの記録が更新されました。今回の評価は送信していません。'),button('次のカードへ',()=>{if(busy||pendingIntent||current!==c)return;advanceStudy(c.entry.taskKey);},{class:'primary','data-next-card':''}));}
  async function refreshPhoneRatings(c){
    if(updateBoundary?.held||disposed||current!==c||c.refreshingRatings||busy||pendingIntent)return;
    c.refreshingRatings=true;
    const endFlight=beginFlight('ratings');
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
        c.requestedRating=null;c.stale={submitted:false,persisted:false,reason:'not-eligible'};
      }else if(task&&(task.head!==c.attempt.parent||task.contentRevision!==c.attempt.contentRevision)){
        c.requestedRating=null;c.stale={submitted:false,persisted:false,reason:'card-updated'};
      }
    }catch{/* A local read can fail. Keep this card and the retry control. */}
    finally{
      c.refreshingRatings=false;endFlight();
      if(!disposed&&current===c&&!busy&&!pendingIntent&&!updateBoundary?.held)render();
    }
  }
  function advanceStudy(previousKey,source=lastInputSource,allowRequest=true){
    if(updateBoundary?.held)return;
    consumeStudyBoundary();
    if(customRun){customRun.source=source;advanceCustomSession(allowRequest);return;}
    let remaining=1,readyTaskKeys=null;const next=nextRapidFireStudy(backend,module,now(),previousKey,entries=>{remaining=readyCount(entries);readyTaskKeys=Object.freeze(entries.map(entry=>entry.taskKey));},activeSession?.backlog===true);
    if(next?.entry)start(next.entry,false,next.early,null,{source,remaining,readyTaskKeys});
    else if(!waitForBoundaryCards(allow=>advanceStudy(previousKey,source,allow),allowRequest))completeSitting();
  }
  function lockOperationControls(record){
    if(record.kind==='lookup')return;record.controls??=new Map();
    for(const control of root.querySelectorAll('input,textarea,select,[data-typed-submit],[data-manual-save],[data-save-weekdays],dialog button.primary:not([data-retry])')){if(!record.controls.has(control))record.controls.set(control,control.disabled);control.disabled=true;}
  }
  function unlockOperationControls(record){for(const [control,disabled] of record.controls??[])if(control.isConnected)control.disabled=disabled;record.controls?.clear();}
  function operationCopy(record=pendingOperation){
    const state=operationState(record?.result,record?.policy);
    if(state.reason==='native-receipt-limit')return state.persisted?'同期の保存確認記録が学習用ストレージの上限に達しました。記録は端末に保存されていますが、処理が止まっています。この画面と学習データを残し、保存領域の復旧を依頼してください。':'同期の保存確認記録が学習用ストレージの上限に達しました。保存できたかは未確認です。入力と元の操作を残しています。この画面と学習データを残し、保存領域の復旧を依頼してください。';
    if(state.reason==='storage-limit')return state.persisted?'学習用ストレージが上限に達しました。記録は端末に保存されていますが、処理が止まっています。この画面と学習データを残し、保存領域の復旧を依頼してください。':'学習用ストレージが上限に達しました。保存できたかは未確認です。入力と元の操作を残しています。この画面と学習データを残し、保存領域の復旧を依頼してください。';
    if(state.updateRequired)return state.persisted?'記録は端末に保存されています。アプリを更新してから処理状況を確認してください。':'アプリの更新が必要です。保存できたかは未確認です。入力と同じ操作は残しています。';
    if(state.reason==='event-too-large')return state.persisted?'記録は端末に保存されていますが、大きすぎるため処理できません。記録を残したまま対応方法を確認してください。':'入力が大きすぎるため、この操作を処理できません。保存状態を確認してから入力を見直してください。';
    if(state.reason==='identity-conflict')return '保存済み記録の照合に失敗しました。元の記録と操作を残しています。もう一度状況を確認してください。';
    return state.persisted?'記録は端末に保存されています。処理が完了していません。同じ記録の処理を再試行できます。':'保存できたか確認できません。入力と同じ操作を残しています。保存を再試行してください。';
  }
  function operationRole(){return ['storage-limit','native-receipt-limit'].includes(operationState(pendingOperation?.result,pendingOperation?.policy).reason)?'alert':'status';}
  function operationRetryLabel(){const state=operationState(pendingOperation?.result,pendingOperation?.policy);return ['storage-limit','native-receipt-limit'].includes(state.reason)?'保存領域の復旧後に確認':state.persisted?'保存済み記録の処理を再試行':'保存を再試行';}
  function retryOperation(){return pendingOperation?performOperation(pendingOperation):Promise.resolve(null);}
  async function performOperation(record){
    if(busy||disposed||updateBoundary?.held)return null;
    if(pendingOperation&&pendingOperation!==record){message('前の保存を先に確認してください。');return null;}
    pendingOperation=record;pendingIntent=record.intent??{commandId:record.key,type:record.kind};pendingAction=record.onSuccess;pendingObservation=!!record.policy?.observations?.length;
    busy=true;root.setAttribute('aria-busy','true');lockOperationControls(record);
    const endFlight=beginFlight('operation');
    try{
      if(!online())paintSharedStatus();
      for(const control of main.querySelectorAll('[data-grade]'))control.disabled=true;
      let result;try{result=await record.execute();}catch{result={kind:'failed',reason:'storage-failed'};}
      if(disposed)return null;
      result=retainOperationProof(record.result,result);record.result=result;busy=false;root.removeAttribute('aria-busy');
      if(!online())paintSharedStatus();
      const state=operationState(result,record.policy);
      if(state.phase==='pending'&&state.persisted)scheduleOutboxSync();
      if(state.phase==='pending'){message(operationCopy(record));render();return result;}
      pendingOperation=null;pendingIntent=null;pendingAction=null;pendingObservation=false;unlockOperationControls(record);
      if(state.phase==='refused'){
        message(state.persisted?'記録は端末に保存されましたが、この操作は反映されませんでした。':'この操作は保存されていません。入力を確認してください。');
        if(record.intent?.type==='review'&&current===record.current)current.stale={submitted:true,persisted:state.persisted,reason:state.reason};
        record.onRefused?.(result);render();return result;
      }
      await record.onSuccess?.(result,state);if(!disposed)await updateStatus({presentation:true});return result;
    }finally{endFlight();}
  }
  function run(intent,onSuccess=pendingAction||(()=>{}),allowObservation=pendingObservation,extra={}) {
    if(updateBoundary?.held)return Promise.resolve(null);
    if(pendingOperation){if(pendingIntent?.commandId===intent.commandId)return retryOperation();message('前の保存を先に確認してください。');return Promise.resolve(null);}
    const record={key:intent.commandId,intent,kind:intent.type,current,onSuccess,policy:{observations:allowObservation?['practice-or-assisted']:[]},...extra};
    record.execute=()=>{const retry=record.attempted===true;record.attempted=true;return retry&&backend.resumeCommand?backend.resumeCommand(intent):backend.submitCommand(intent);};
    return performOperation(record);
  }
  function runInput(kind,input,execute,onSuccess,policy={}){
    if(updateBoundary?.held)return Promise.resolve(null);
    if(pendingOperation){message('前の保存を先に確認してください。');return Promise.resolve(null);}
    const original=structuredClone(input),record={key:kind+':'+(++operationSequence),kind,input:original,current,onSuccess,policy};record.execute=()=>execute(original);return performOperation(record);
  }
  function gradeIntent(c,rating){
    return c.attempt.mode==='practice'?backend.command('review',backend.practiceData(c.attempt,rating,c.thinkMs)):backend.reviewIntent?backend.reviewIntent(c.attempt,rating,c.thinkMs):backend.preview(c.attempt,c.thinkMs).intents[rating];
  }
  function submitGrade(c,intent){
    const practice=c.attempt.mode==='practice';
    const admission={learnAhead:c.attempt.learnAhead,session:customRun?.options??c.attempt.session??null,run:customRun?{...customRun,remaining:[...customRun.remaining]}:null};
    run(intent,result=>{
      if(!practice&&activeSession){const projection=backend.readProjection(),review=projection.reviews.find(row=>row.id===result.eventId);if(operationState(result).phase==='applied'&&review?.install===backend.installation&&projection.outcomes?.[result.eventId]?.status==='applied'){if(!activeSession.eventIds.includes(result.eventId))activeSession.eventIds.push(result.eventId);sessionEvidence.record(activeSession.handle,{eventId:result.eventId,projection,durable:true});}}
      c.committed=true;if(!practice)lastReview={...result,entry:c.entry,thinkMs:c.thinkMs,...admission};
      if(customRun)customRun.completed++;
      const continuation=()=>advanceStudy(c.entry.taskKey,c.gradeSource||'pointer');
      const persisted=operationState(result,{observations:practice?['practice-or-assisted']:[]}).persisted;
      if(!(persisted&&updateBoundary?.hold(continuation))&&!updateBoundary?.held)continuation();
    },practice);
  }
  function grade(rating,source) {
    const c=current;
    if(updateBoundary?.held||busy||pendingIntent||pop||document.querySelector('dialog[open]')||c?.sessionInfoOpen||!c?.revealed||c.committed||c.ratingsUnavailable||c.stale||c.attempt.mode!=='scored'&&!customRun)return;
    stopTrialAudio();
    let intent;
    try{intent=gradeIntent(c,rating);}
    catch{
      if(phonePresentation){c.requestedRating=rating;c.ratingsUnavailable=true;render();refreshPhoneRatings(c);}
      else{c.stale={submitted:false,persisted:false,reason:'card-updated'};render();}
      return;
    }
    c.gradeSource=source;lastCardActionAt=win.performance.now();main.querySelector('[data-card]')?.setAttribute('data-grade-source',source);submitGrade(c,intent);
  }
  async function requestCard(result,capture,source){
    if(updateBoundary?.held)return;
    if(!platform.requestCard){message('言葉を保存しました。カード作成の通信は準備中です。');return;}
    await submitFactory(factoryRequest(result,capture,{learner:backend.learner,source}));
  }
  async function submitFactory(request){
    if(updateBoundary?.held)return;
    let timeout;const endFlight=beginFlight('factory');
    try{
      const endRequest=beginFlight('factory-request');
      let pending;
      try{pending=Promise.resolve(platform.requestCard(request));}
      catch(error){endRequest();throw error;}
      const admitted=pending.then(value=>{endRequest();return value;},error=>{endRequest();throw error;});
      // The UI timeout only stops waiting; the admitted request keeps its own
      // flight until it actually settles so readiness cannot outrun it.
      admitted.catch(()=>{});
      const result=await Promise.race([admitted,new Promise((_,reject)=>{timeout=win.setTimeout(()=>reject(Error('factory-timeout')),10000);})]);
      if(disposed)return;if(result?.captureEventId!==request.captureEventId||!['queued','joined','already-card','held','ignored'].includes(result?.status)||['queued','joined','held'].includes(result.status)&&!result.jobId&&!(result.status==='held'&&result.reason==='daily-job-cap'))throw Error('factory-response');factoryRetry=null;message(result.status==='queued'||result.status==='joined'&&result.jobStatus!=='held'?'カード作成を依頼しました。校閲を終えてから届きます。':result.status==='already-card'?'この言葉のカードはすでにあります。':result.status==='held'&&result.reason==='daily-job-cap'?'今日のカード作成の上限を使い切りました。言葉の記録は保存しています。':result.status==='held'||result.status==='joined'&&result.jobStatus==='held'?'読み・語義の確認待ちとして保存しました。':'作成の希望を記録しました。');}
    catch{if(disposed)return;factoryRetry=request;message('言葉は保存しましたが、カード作成の依頼を送れませんでした。同じ依頼を再試行できます。');}
    finally{win.clearTimeout(timeout);if(!disposed){if(screen!=='finish')render();else updateStatus({presentation:true}).catch(()=>{});}endFlight();}
  }
  function resolveWord(surface) {
    const exact=catalog.filter(e=>e.contractId==='vocabulary.read.v1'&&[e.term,e.form].includes(surface));
    const unique=new Map(exact.map(e=>[e.noteGuid,e]));
    return unique.size===1?[...unique.values()][0]:null;
  }
  function closePopover() { const wasOpen=!!pop;pop?.node.remove();pop=null;if(wasOpen&&!disposed&&screen==='study')focusStudyCard();updateBoundary?.sync(); }
  async function openWord(info,anchor) {
    if(updateBoundary?.held||!current?.revealed||busy||pendingIntent)return;
    closePopover();
    const e=current.entry,resolved=dictionary?.resolve(info),target=info.isTarget&&e.contractId==='vocabulary.read.v1'?e:resolved?resolved.deck||null:resolveWord(info.surface),p=backend.readProjection();
    const meaning=target?.defJa||(resolved?.kind==='dictionary'?resolved.glosses.join('; '):resolved?.kind==='kanji'?resolved.meanings.join('; '):null);
    const reading=target?.reading||resolved?.reading||(resolved?.kind==='kanji'?resolved.readings.join('・'):null);
    const reviewedEntry=reviewedDictionaryEntry(e,info,dictionary);
    const hasEntry=!!target||resolved&&resolved.kind!=='pending';
    const capture={surface:info.surface,kind:'lookup',location:info.location,contextTaskKey:e.taskKey,contentRevision:current.attempt.contentRevision,revealed:true,
      span:info.span,targetTaskKey:target?.taskKey??null,depth:info.depth??1,source:info.source??{context:info.location==='definition'?e.defJa:e.ja},...(target?{lemma:target.term,reading:target.reading,resolution:{status:'catalog-exact',guid:target.noteGuid}}:resolved?.lemma?{lemma:resolved.lemma,...(resolved.reading?{reading:resolved.reading}:{}),resolution:{status:hasEntry?'dictionary':'unresolved',source:resolved.source||null}}:{})};
    const familiarityCapture=reviewedActionCapture(e,info,dictionary,catalog,capture)??capture;
    const lookupTarget=reviewedEntry?catalog.find(entry=>entry.taskKey===familiarityCapture.targetTaskKey)??null:target;
    const lookupEntry=reviewedEntry?{term:reviewedEntry.lemma,reading:reviewedEntry.reading,meaning:reviewedEntry.glosses.join('; '),source:`${reviewedEntry.source} · EDRDG · ${reviewedEntry.sourceId||''}`} :target&&resolved?.kind!=='chunk'?target:{term:resolved?.kind==='chunk'?resolved.surface:resolved?.lemma||info.surface,reading,pos:Array.isArray(resolved?.pos)?resolved.pos.join(' · '):null,meaning:resolved?.glosses?.join('; ')||meaning,sourceIsInterfaceCopy:resolved?.kind==='chunk',source:resolved?.kind==='chunk'?'形態素解析による語のまとまり。各部分の語義・文法は配布デッキとJMdictに基づきます。':resolved?.source?`${resolved.source} · EDRDG · ${resolved.sourceId||''}`:null};
    const lexicalSource=reviewedEntry?'dictionary':lookupEntry===target?'card':['dictionary','kanji'].includes(resolved?.kind)?'dictionary':null;
    const readingPresentation=lookupReadingPresentation(e,info,lookupEntry,{lexicalSource});
    const renderLookupEntry=(entry,options,lexicalSource=null)=>{
      const presentation=lookupReadingPresentation(e,info,entry,{lexicalSource});
      if(!presentation.passageReadings.length)return renderVocabularyEntry(document,entry,options);
      return h('div',{},renderVocabularyEntry(document,presentation.displayEntry,options),
        presentation.headwordReading?h('p',{class:'reading','data-lexical-reading':''},
          copy('span',lexicalSource==='card'?'カードの見出しの読み':'辞書の見出しの読み',lexicalSource==='card'?'Card headword reading':'Dictionary headword reading'),
          '：',h('span',{'data-vocabulary-source':''},presentation.headwordReading)):null);
    };
    const card=current,attempt=current.attempt,gate={card,applied:false,action:null,rating:null};let actionAccepted=false;
    const afterLookup=action=>{if(actionAccepted)return;actionAccepted=true;closePopover();if(!gate.applied){gate.action=action;return;}if(!pendingIntent&&!busy)action();};
    const openRelated=term=>afterLookup(()=>{query=term;wordFilter='all';wordPage=0;navigate('words');});
    const node=h('aside',{class:'word-popover',role:'dialog','aria-label':`${info.surface}の言葉`},
      button('閉じる',closePopover,{class:'popover-close'}),
      ...readingPresentation.passageReadings.map(proof=>h('p',{'data-reviewed-passage-reading':''},
        copy('span','本文の読み','Reading in this passage'),'：',h('span',{'data-vocabulary-source':''},`${proof.surface}（${proof.reading}）`))),
      reviewedEntry||hasEntry?renderLookupEntry(lookupEntry,{dictionary,hideUnavailable:!!reviewedEntry||!target,onWord:nested=>openWord({...nested,depth:(info.depth||1)+1},null),relatedWords:catalog},lexicalSource):h('div',{},h('h2',{'data-vocabulary-entry':''},info.surface),h('p',{},'この語は辞書に見つかりませんでした。記録して確認に回します。')),
      info.surface!==lookupEntry.term?h('p',{class:'surface-form'},h('span',{'data-interface-copy':''},'本文のタップ'),'：',h('span',{'data-vocabulary-source':''},info.surface)):null,
      lookupTarget?button('この言葉のカードへ',()=>openRelated(lookupTarget.term),{class:'text-link','data-dictionary-card':''}):null,
      !reviewedEntry&&resolved?.kind==='chunk'?h('div',{class:'lookup-parts','data-lookup-chunk':''},h('h3',{},'組み立て'),...resolved.parts.map(part=>fold(h('span',{'data-vocabulary-source':''},`${part.surface} → ${part.lemma||part.surface}`),renderLookupEntry({term:part.lemma||part.surface,reading:part.reading,meaning:part.glosses?.join('; '),source:part.source||null},{dictionary,hideUnavailable:true},part.source==='deck'?'card':['JMdict','KANJIDIC2'].includes(part.source)?'dictionary':null),part.deck?button('この言葉のカードへ',()=>openRelated(part.deck.term),{class:'text-link'}):null)),resolved.grammar?h('div',{'data-chunk-grammar':''},h('h3',{'data-vocabulary-source':''},resolved.grammar.term),h('p',{lang:'en'},resolved.grammar.meaning),button('文法カードへ',()=>openRelated(resolved.grammar.term),{class:'text-link','data-grammar-card':''})):null):null,
      copy('p','「知らない」は、この語のカード作成を依頼します。「うろ覚え」も、デッキにない語なら作成を依頼します。「知っている」は記録だけです。'+gradeScopeCopy(e)[0],'Unknown requests a card for this word. Not sure also requests one if the word is not already in your deck. Know it only records familiarity. '+gradeScopeCopy(e)[1],{class:'secondary capture-help','data-capture-help':''}),
      h('div',{class:'capture-actions'},...[['unknown','知らない'],['unsure','うろ覚え'],['known','知っている']].map(([kind,label])=>button(label,()=>afterLookup(()=>{
        if(pendingIntent||busy)return;const intent=backend.captureCommand(attempt,{...familiarityCapture,kind}),payload=intent.type==='capture-boost'?intent.data.capture:intent.data;
        run(intent,async result=>{if(kind==='unknown'||kind==='unsure'&&!familiarityCapture.targetTaskKey)await requestCard(result,payload,'tap');else message(kind==='unsure'?'迷いを記録しました。':'知っているという記録を残しました。');if(!disposed&&screen!=='finish')render();});
      })))),h('p',{class:'secondary','data-dictionary-source':''},reviewedEntry?`${reviewedEntry.source} · EDRDG · CC BY-SA 4.0`:resolved?.kind==='chunk'?'語のまとまり · 配布デッキ / JMdict':target?'配布デッキ · 本棚にあります。':resolved?.kind==='dictionary'?'JMdict · EDRDG · CC BY-SA 4.0':resolved?.kind==='kanji'?'KANJIDIC2 · EDRDG · CC BY-SA 4.0':'辞書未収録 · 読み・語義の確認待ち'));
    pop={node,anchor};root.append(node);localize();node.querySelector('button').focus({preventScroll:true});
    const intent=backend.captureCommand(attempt,capture);
    await run(intent,async()=>{
      gate.applied=true;if(gate.action){await gate.action();return;}render();
      if(gate.rating!==null&&current===card&&!card.committed){closePopover();grade(gate.rating,'key');}
    },false,{kind:'lookup',lookupGate:gate});
  }

  function kanjiPanel(entry) {
    const div=renderVocabularyRelated(document,entry,{onWord:openWord,relatedWords:catalog,dictionary,locale:interfaceLanguage,onRelated:e=>{query=e.term;navigate('words');}});
    div.append(button('Macの辞書で調べる',()=>platform.openDictionary?.(entry.term),{disabled:!platform.openDictionary,class:'quiet','data-interface-copy':''}),!platform.openDictionary?h('p',{class:'secondary','data-interface-copy':''},'Macのシステム辞書は未通信です。'):null);return div;
  }
  function repair(task,data,onSuccess){return run(backend.command('repair',{taskKey:task.taskKey,parent:task.head,...data}),onSuccess);}
  function leechPanel(task) {
    const sibling=catalog.find(e=>e.noteGuid===task.noteGuid&&e.contractId===task.contract&&e.taskKey!==task.taskKey&&!backend.readProjection().tasks[e.taskKey].card);
    return h('div',{class:'leech'},h('h2',{},'このカードを整える'),h('p',{},`このカードだけで ${task.card.lapses} 回のつまずき。文脈を変える、ヒントを付ける、休ませる。`),
      button('別の文脈へ',()=>repair(task,{action:'swap',replacementTaskKey:sibling.taskKey,replacementParent:backend.readProjection().tasks[sibling.taskKey].head},()=>render()),{disabled:!sibling}),
      button('ヒントを付ける',()=>hintDialog(task)),button('休ませる',()=>repair(task,{action:'suspend'},()=>navigate('today'))),
      button('このまま続ける',()=>repair(task,{action:'keep'},()=>render())));
  }
  function dialog(title,body,save) {
    const node=h('dialog',{},h('form',{method:'dialog'},h('h2',{},title),body,h('div',{class:'dialog-actions'},button('キャンセル',()=>{if(busy)return;node.close();node.remove();if(pendingIntent)render();}),button('記録する',()=>{if(busy||pendingIntent)return;save(()=>{node.close();node.remove();});},{class:'primary'}))));
    node.addEventListener('close',()=>updateBoundary?.sync());root.append(node);node.showModal();localize();updateBoundary?.sync();return node;
  }
  function hintDialog(task){const input=h('textarea',{'aria-label':'ヒント',required:true});dialog('このカードのヒント',input,close=>{if(input.value.trim())repair(task,{action:'hint',hint:input.value.trim()},()=>{close();message('ヒントを記録しました。');render();});});}
  function correctionDialog(){const input=h('textarea',{'aria-label':'気になったところ',required:true});dialog('気になったところ',input,close=>{
    if(!input.value.trim())return;const e=current.entry,form=e.form||e.term,start=Math.max(0,e.ja.indexOf(form));const capture={surface:form,kind:'correction',location:current.revealed?'passage':'typed',contextTaskKey:e.taskKey,contentRevision:current.attempt.contentRevision,revealed:!!current.revealed,
      span:{start,end:start+form.length,unit:'utf16-code-unit'},targetTaskKey:null,source:{venue:'standalone-qa',note:input.value.trim(),context:e.ja}};
    run(backend.captureCommand(current.attempt,capture),()=>{close();message('訂正の希望を記録しました。内容監査への配信は通信待ちです。');render();});});}
  function expireLastReview(){
    if(!lastReview)return;
    const p=backend.readProjection(),review=p.reviews.find(row=>row.id===lastReview.eventId),at=now(),today=backend.todayAllowance?.()??dayBounds(at,p.settings.learnerTimezone);
    if(!review||!Number.isSafeInteger(review.at)||review.at<today.startsAt||review.at>=today.endsAt)lastReview=null;
  }
  function undoLast(){stopTrialAudio();if(parkedStudy)return message('中断中の学習に戻ってから、別のカードを開いてください。');expireLastReview();const previous=lastReview;if(!previous)return;const p=backend.readProjection(),task=p.tasks[previous.entry.taskKey],effect=task&&p.effects[task.head];if(!effect||effect.root!==previous.eventId)return message('このカードは現在の状態から戻せません。');run(backend.command('undo',{taskKey:task.taskKey,parent:task.head,target:effect.root}),()=>{lastReview=null;customRun=previous.run?{...previous.run,remaining:[...previous.run.remaining]}:null;const review=p.reviews.find(row=>row.id===previous.eventId),labels=GRADES.find(([value])=>value===review?.effectiveRating),pressed=GRADES.find(([value])=>value===review?.rawRating),capped=review?.rawRating!==review?.effectiveRating;start(previous.entry,false,previous.learnAhead,previous.session,{source:'key',restore:{thinkMs:previous.thinkMs},preserveRun:!!previous.run});showToast(`[${capped?pressed?.[1]+' → ':''}${labels?.[1]||'評価'}]を元に戻しました`,`Undid [${capped?pressed?.[2]+' → ':''}${labels?.[2]||'rating'}]`);});}
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
          h('div',{class:'row-actions'},button('追加練習',()=>start(e,true),{disabled:!contentReady(e)}),button(t.suspended?'戻す':'休ませる',()=>run(backend.command('suspend',{taskKey:t.taskKey,parent:t.head,on:!t.suspended}),()=>{message('カードの状態を保存しました。');refreshRows();}))));
        if((t.card?.lapses??0)>=5)item.append(leechPanel(t));rows.append(item);}
      if(matches.length>100)rows.append(h('div',{class:'row-actions'},button('前の100件',()=>{wordPage--;refreshRows();},{disabled:wordPage===0}),button('次の100件',()=>{wordPage++;refreshRows();},{disabled:(wordPage+1)*100>=matches.length})));
      if(!rows.childNodes.length)rows.append(h('p',{class:'empty'},'見つかりませんでした。言葉や読みを変えてみてください。'));localize();
    }
    const typed=h('input',{'aria-label':'新しい言葉',placeholder:'覚えたい言葉を入力',value:typedDraft,disabled:typedBusy||busy||!!pendingIntent,'data-typed-word':'',oninput:e=>{typedDraft=e.target.value;}});
    const sentence=h('textarea',{'aria-label':'自分の例文（任意）',placeholder:'自分の例文（任意）',disabled:typedBusy||busy||!!pendingIntent,'data-typed-sentence':'',oninput:e=>{typedSentence=e.target.value;}},typedSentence);
    const saveTyped=()=>{
      if(updateBoundary?.held||typedBusy||busy||pendingIntent||disposed||!typed.value.trim())return;
      typedDraft=typed.value;typedSentence=sentence.value;
      return runInput('typed',{word:typedDraft,sentence:typedSentence},original=>backend.captureTyped(original.word,{sentence:original.sentence}),async result=>{
        if(result.kind==='existing'){
          // captureTyped returns an existing word without persisting the
          // supplied sentence, so only the word itself is saved here. A new
          // sentence stays dirty until it is actually saved or cleared.
          typedSaved.word=typedDraft;
          query=result.surface;wordFilter='all';wordPage=0;message(result.taskKeys.length===1?'本棚にあります。':'同じ表記のカードが複数あります。読み・意味を確認して選んでください。');}
        else{typedDraft='';typedSentence='';typedSaved.word='';typedSaved.sentence='';render();await requestCard(result,result.capture,'typed');}
        if(!disposed&&screen!=='finish')render();
      },{existing:true});
    };
    section.append(h('div',{class:'search-controls'},input,filter),rows,h('h2',{},'言葉を足す'),h('p',{class:'secondary'},'既存の言葉を確認してから依頼します。例文は言葉の記録と一緒に保存します。'),h('div',{class:'typed-intake'},typed),h('div',{class:'setting-row'},h('label',{},h('span',{},'自分の例文（任意）'),sentence)),h('div',{class:'typed-intake'},button(typedBusy?'保存を確認中…':'記録する',saveTyped,{disabled:typedBusy||busy||!!pendingIntent,'data-typed-submit':''})));
    refreshRows();return section;
  }
  function recordScreen(){const p=backend.readProjection(),reviews=p.reviews.filter(r=>!r.undoneAt),bounds=dayBounds(now(),p.settings.learnerTimezone),today=reviews.filter(r=>r.dayStart===bounds.startsAt),recall=today.filter(r=>r.effectiveRating>=2).length;
    const taps=new Map();for(const c of p.captures)taps.set(c.surface,(taps.get(c.surface)||0)+1);
    const nextDue=Object.values(p.tasks).filter(t=>t.card&&!t.suspended).sort((a,b)=>Date.parse(a.card.due)-Date.parse(b.card.due));
    scheduledPage=Math.min(scheduledPage,Math.max(0,Math.ceil(nextDue.length/50)-1));
    return h('section',{class:'record'},h('header',{class:'screen-head'},h('h1',{},'学習の記録')),
      h('div',{class:'sheet stat-sheet'},h('div',{class:'record-summary'},h('div',{},h('strong',{},String(today.length)),h('span',{},'今日の回答')),h('div',{},h('strong',{},today.length?`${Math.round(recall/today.length*100)}%`:'—'),h('span',{},'今日思い出せた割合')),h('div',{},h('strong',{},String(p.captures.length)),h('span',{},'言葉の記録')))),
      h('section',{class:'sheet','data-kanji-record':''},renderKanjiCapacity(document,buildKanjiCapacityReport(p,catalog,{now:now()}),{locale:interfaceLanguage})),
      h('section',{class:'sheet'},h('h2',{},'これからの復習'),nextDue.length?h('ul',{class:'forecast','data-scheduled-list':''},...nextDue.slice(scheduledPage*50,(scheduledPage+1)*50).map(t=>h('li',{},h('span',{'data-vocabulary-entry':''},catalog.find(e=>e.taskKey===t.taskKey)?.term||'カード'),h('span',{},displayDate(t.card.due,{dateStyle:'short',timeStyle:'short'}))))):h('p',{class:'empty'},'学習を始めると、復習の予定がここに現れます。')),
      nextDue.length>50?h('div',{class:'row-actions','data-scheduled-pages':''},button('前の50枚',()=>{scheduledPage--;render();},{disabled:scheduledPage===0}),button('次の50枚',()=>{scheduledPage++;render();},{disabled:(scheduledPage+1)*50>=nextDue.length})):null,
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
  async function downloadBackup(){if(updateBoundary?.held)return;const endFlight=beginFlight('backup');try{const backup=await backend.exportBackup(),blob=new win.Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=win.URL.createObjectURL(blob),link=h('a',{href:url,download:`nihongo-${backend.learner}-${now()}.json`});link.click();setTimeout(()=>win.URL.revokeObjectURL(url),1000);message('バックアップを書き出しました。');}finally{endFlight();}}
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
    if(updateBoundary?.held||nativeSyncBusy||disposed)return;
    const show=()=>{if(quiet&&screen!=='settings')updateStatus().catch(()=>{});else render();};
    nativeSyncBusy=true;nativeStatusGeneration++;show();
    const endFlight=beginFlight('native-sync');
    try{
      const result=await action();
      if(disposed)return;
      nativeSyncState=result;nativeSyncActionError=result.error||(result.state==='update-required'?'update-required':null);
      if(!nativeSyncActionError)onSuccess?.(result);
      if(!quiet||nativeSyncActionError)message(nativeSyncActionError?'同期を完了できませんでした。記録は端末に残っています。':'通信と保存状態を確認しました。','native-sync-action');
      else if(noticeOwner==='native-sync-action')message('');
    }catch(error){
      if(!disposed){nativeSyncActionError=error?.message||'operation-failed';nativeSyncState={...nativeSyncState,state:'error',error:nativeSyncActionError};message(nativeSyncActionError==='native-sync-bootstrap-required'?'既存の学習履歴を先に安全に引き継ぐ必要があります。':'通信を確認できませんでした。未送信の記録は端末に残っています。同じ操作を再試行できます。','native-sync-action');}
    }finally{nativeSyncBusy=false;nativeStatusGeneration++;if(!disposed){show();if(quiet){if(retryableSyncFailure())scheduleSyncRetry();else clearSyncRetry();}}endFlight();}
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
  function diagnosticValues(){return JSON.stringify({learner:backend.learner,installation:backend.installation,storage:platform.storageKind,replica:lastSaveStatus,sync:nativeSyncState,replayCache:backend.readReplayDiagnostics?.()??null,...(typeof platform.getAudioPreparationState==='function'?{audioPreparation:platform.getAudioPreparationState()}: {})},null,2);}
  function cacheLimitNotice(){
    const reason=backend.readReplayDiagnostics?.()?.reason;
    return ['row-budget','input-budget','config-budget','retained-budget'].includes(reason)?h('p',{'data-cache-limit':reason,role:'status'},'履歴が高速処理の上限に達しています。学習は続けられますが、表示が遅くなることがあります。'):null;
  }
  function syncAudioDownloads(node=main.querySelector('[data-audio-downloads]')){
    if(disposed||!node||!platform.audioDownloads)return;
    const status=platform.audioDownloads.read(),state=audioDownloadActionFailed?'error':status.state;
    const [ja,en]=({
      idle:['音声はまだ保存されていません。','Audio is not yet saved.'],
      checking:['保存済みの音声を確認しています…','Checking saved audio…'],
      downloading:['音声を保存しています…','Saving audio…'],
      saved:['選択した音声をこの端末に保存しました。','Selected audio is saved on this device.'],
      cancelled:['保存をキャンセルしました。保存済みの音声は残っています。','Saving was cancelled. Previously saved audio remains.'],
      error:['音声を確認または保存できませんでした。もう一度お試しください。','Audio could not be checked or saved. Try again.'],
      paused:['音声の保存を一時停止しています。','Audio saving is paused.'],
      disposed:['音声のダウンロードは終了しました。','Audio downloads are closed.'],
    })[state]??['音声を確認できませんでした。','Audio could not be checked.'];
    renderInterfacePair(node.querySelector('[data-audio-download-status]'),ja,en,interfaceLanguage,{inline:true});
    const locked=['checking','downloading','paused','disposed'].includes(status.state);
    node.querySelector('[data-audio-download-start]').disabled=locked;
    node.querySelector('[data-audio-download-cancel]').disabled=!['checking','downloading'].includes(status.state);
    node.querySelector('[data-audio-download-refresh]').disabled=locked;
  }
  async function audioDownloadAction(action){
    audioDownloadActionFailed=false;
    try{await platform.audioDownloads[action]();}
    catch{audioDownloadActionFailed=!['cancelled','paused','disposed'].includes(platform.audioDownloads.read().state);}
    syncAudioDownloads();
  }
  function audioDownloadsDetail(){
    if(!platform.audioDownloads)return h('details',{class:'sheet','data-audio-downloads':''},copy('summary','音声のダウンロード','Audio downloads',{'data-interface-layout':'inline'}),copy('p','この内容の音声ダウンロードは利用できません。学習は続けられます。','Audio downloads are unavailable for this content. You can continue studying.',{role:'status'}));
    const node=h('details',{class:'sheet','data-audio-downloads':''},
      copy('summary','音声のダウンロード','Audio downloads',{'data-interface-layout':'inline'}),
      h('p',{role:'status','data-audio-download-status':'','data-interface-layout':'inline'}),
      h('div',{class:'sheet-actions'},
        copyButton('音声を保存','Save audio',()=>audioDownloadAction('acquire'),{'data-audio-download-start':''}),
        copyButton('キャンセル','Cancel',()=>platform.audioDownloads.cancel(),{'data-audio-download-cancel':''}),
        copyButton('確認','Check',()=>audioDownloadAction('refresh'),{'data-audio-download-refresh':''})));
    syncAudioDownloads(node);return node;
  }
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
      if(updateBoundary?.held)return;const input=event.currentTarget,previous=swipeGrading;swipeGrading=input.checked;
      const end=beginFlight('preference');
      try{await preferences.setItem('nihongo.swipe-grading.v1',String(swipeGrading));}
      catch{swipeGrading=previous;input.checked=previous;message('この端末に操作の設定を保存できません。');}
      finally{end();}
    }});
    const file=h('input',{type:'file',accept:'.json,application/json','aria-label':'バックアップを選ぶ',onchange:async e=>{if(updateBoundary?.held)return;const end=beginFlight('import');try{const backup=JSON.parse(await e.target.files[0].text());await backend.importBackup(backup);message('互換のある保存済み記録を追加しました。');render();}catch(error){message(error.message==='backup-has-pending-events-recovery-required'?'未送信の記録を含むため自動復元できません。元の端末とバックアップを保管してください。':'学習者・内容の整合性を確認できませんでした。記録は置き換えていません。');}finally{end();}}});
    const sheet=(id,kicker,title,description,...body)=>h('section',{class:'sheet','data-settings-section':id},h('div',{class:'sheet-head'},h('p',{class:'kicker'},kicker),h('h2',{},title),description?h('p',{class:'sheet-desc'},description):null),...body);
    return h('section',{class:'settings'},h('header',{class:'screen-head stacked'},h('h1',{},'設定'),h('p',{class:'secondary'},'この端末の表示と、すべてのデッキ共通の学習設定。')),...(platform.nativeSync?[nativeSyncSettings()]:[]),...(typeof platform.backupStatus==='function'?[backupDetail()]:[]),platform.onScreenChange?h('section',{class:'sheet host-settings','data-host-settings':''}):null,
      ...((platform.audioDownloads||platform.audioDownloadFailure)?[audioDownloadsDetail()]:[]),
      sheet('appearance','表示','この端末の見え方','色はこの端末だけに保存します。学習履歴や他の端末の色は変わりません。',h('div',{class:'control-grid'},themePicker(),languagePicker()),h('label',{class:'swipe-grading-setting'},swipe,h('span',{},'スワイプで採点（この端末のみ）')),h('p',{id:'swipe-grading-help',class:'secondary'},'初期設定はオフです。左で「もう一度」、右で「正解」。'),h('label',{class:'swipe-grading-setting'},h('input',{type:'checkbox',checked:intervalHints,'data-interval-hints':'',onchange:async event=>{if(updateBoundary?.held)return;intervalHints=event.target.checked;const end=beginFlight('preference');try{await preferences.setItem('nihongo.interval-hints.v1',String(intervalHints));}catch{message('この端末に表示設定を保存できません。');}finally{end();}}}),h('span',{},'次の復習までの間隔を表示（この端末のみ）'))),
      ...(legacyHistory?[sheet('legacy-display','引き継ぎ','引き継いだ表示設定',null,...legacyHistory.decks.map(d=>h('p',{class:'secondary','data-legacy-settings':''},`${d.deckId} · 一日の新規 ${d.preferences.newPerDay} · 読み方 ${d.preferences.mode} · 全文英訳 ${d.preferences.gloss} · 文脈 ${d.preferences.zoom}`)),h('p',{class:'secondary'},themePreferenceSet?'色はこの端末の指定を使っています。':'以前の色指定は未設定です。自動表示のまま、設定値は書き込んでいません。'))]:[]),
      sheet('pace','学習','共通の学習ペース','1日の新規カード上限と学習日の区切りは、すべてのデッキ共通です。変更は翌日の学習日から有効です。',h('div',{class:'setting-row'},h('label',{},'1日の新規カード上限',newCount),button('翌日から変更',()=>{const value=newCount.valueAsNumber;if(!Number.isSafeInteger(value)||value<1||value>200)return message('1日の新規カード上限は1〜200の整数を入力してください。');savePace('newPerDayTotal',newCount,value);},{disabled:weekdayPolicy})),weekdayPolicy?h('p',{class:'secondary','data-weekday-policy-active':''},'曜日ごとの新規カード上限を使っています。今日のカスタム学習パネルで変更できます。'):null,
      h('div',{class:'setting-row'},h('label',{},'学習日のタイムゾーン',tz),button('翌日から変更',()=>savePace('learnerTimezone',tz,tz.value))),
      p.pendingSettings.length?h('p',{class:'sheet-note'},'翌日からの設定変更を保存しています。'):null),
      sheet('backup','データ','バックアップ','記録をすべて書き出すか、互換のあるバックアップを追加します。',h('div',{class:'sheet-actions'},button('すべて書き出す',()=>downloadBackup(),{class:'quiet'})),h('label',{class:'file-field'},h('span',{},'バックアップを選ぶ'),file),h('p',{class:'secondary'},'同じ端末の互換な保存済み記録だけを追加します。別端末ごとに作った模擬割当の履歴は統合できません。未送信記録は自動移行せず、元の端末とバックアップの保管が必要です。')),
      cacheLimitNotice(),h('p',{class:'content-note'},nativeSyncState.paired?'記録はこのMacに保存され、iPhoneと同期されます。':'記録はこの端末に保存されます。'),
      h('details',{'data-study-diagnostics':'',class:'sheet'},h('summary',{},'診断情報'),h('p',{},'技術的な保存・同期の情報です。'),h('pre',{'data-study-diagnostics-values':''},diagnosticValues())));
  }
  function onKey(event){
    if(typeof updateBoundary!=='undefined'&&updateBoundary?.held)return;
    lastInputSource='key';
    if(event.defaultPrevented)return;
    if(current?.sessionInfoOpen&&!document.querySelector('dialog[open]')){menuKey(event);return;}
    if(event.repeat||event.isComposing||event.keyCode===229)return;
    if(busy){const gate=pendingOperation?.kind==='lookup'?pendingOperation.lookupGate:null;const rating=/^[1-4]$/.test(event.key)?Number(event.key):null;if(gate&&rating&&current===gate.card&&!gate.action&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.target.closest?.('input,textarea,select,[contenteditable]')){event.preventDefault();if(gate.rating===null)gate.rating=rating;closePopover();}return;}
    const editing=event.target.closest?.('input,select,textarea,[contenteditable]');
    if(screen==='finish'&&!document.querySelector('dialog[open]')){if(event.metaKey||event.ctrlKey||event.altKey)return;if(event.key===' '){event.preventDefault();return;}if(finishBlocked()){event.preventDefault();return;}if(editing||event.target.closest?.('button,a,summary'))return;const action=event.key==='Enter'||event.key==='Escape'?finishDone:({p:()=>main.querySelector('[data-practice-today]')?.click(),n:()=>main.querySelector('[data-add-new]')?.click(),a:()=>main.querySelector('[data-review-tomorrow]')?.click(),c:openCustomSession})[event.key.toLowerCase()];if(action){event.preventDefault();action();}return;}
    if(!document.querySelector('dialog[open]')&&event.metaKey&&event.key.toLowerCase()==='z'&&!event.shiftKey&&!event.altKey&&!editing&&screen==='study'&&lastReview){event.preventDefault();closePopover();undoLast();return;}
    if(event.metaKey||event.ctrlKey||event.altKey)return;
    const rating=/^(?:Digit|Numpad)([1-4])$/.exec(event.code)?.[1]??(/^[1-4]$/.test(event.key)?event.key:null);
    if(pop&&rating&&!editing&&current?.revealed){event.preventDefault();closePopover();grade(Number(rating),'key');return;}
    if(pop||document.querySelector('dialog[open]')||event.target.closest?.('button,input,select,textarea,summary,a,audio,video,[contenteditable]'))return;
    if(screen==='study'&&current&&event.key.toLowerCase()==='p'){
      if(sharedAudioDeclared){if(current.revealed&&(current.audioPlaying||current.audioResult?.status==='ready')){event.preventDefault();toggleSharedAudio(current);}return;}
      if(trialAudioReady(current)){event.preventDefault();playTrialAudio(current);}
      return;
    }
    if(event.key.toLowerCase()==='u'&&lastReview){event.preventDefault();undoLast();return;}
    if(screen==='study'&&event.key==='?'){event.preventDefault();keySheet();return;}
    if(screen==='study'&&current?.revealed&&event.key.toLowerCase()==='e'){const fold=main.querySelector('[data-card] details:has([data-full-translation]),[data-card] details.grammar-translation');if(fold){event.preventDefault();fold.open=!fold.open;}return;}
    if(screen==='today'&&event.key==='Enter'&&!event.shiftKey){const primary=main.querySelector('[data-start]:not(:disabled)');if(primary){event.preventDefault();primary.click();}return;}
    if(screen!=='study'||!current)return;
    if(!current.revealed&&!event.shiftKey&&[' ','Enter'].includes(event.key)&&win.getSelection()?.isCollapsed!==false){event.preventDefault();revealCard(current,'key');}
    else if(current.revealed&&[' ','Enter'].includes(event.key)){event.preventDefault();if(!current.committed&&!event.shiftKey&&win.performance.now()-(current.revealedAt??Infinity)>=300)grade(3,'key');}
    else if(current.revealed&&!current.committed&&rating){event.preventDefault();grade(Number(rating),'key');}}
  document.addEventListener('keydown',onKey);
  const outsidePopover=event=>{lastInputSource='pointer';if(pop&&!pop.node.contains(event.target)&&!pop.anchor?.contains(event.target))closePopover();};document.addEventListener('pointerdown',outsidePopover,true);
  const escape=event=>{if(updateBoundary?.held||event.defaultPrevented||event.repeat||event.isComposing||event.keyCode===229)return;if(event.key==='Escape'){if(pop){event.preventDefault();closePopover();}else{const modal=root.querySelector('dialog[open]');if(modal){event.preventDefault();if(customBusy&&modal.hasAttribute('data-new-card-sheet'))return;modal.dispatchEvent(new Event('cancel',{cancelable:true}));modal.close();modal.remove();if(pendingIntent)render();}else if(screen==='finish'){event.preventDefault();finishDone();}else if(screen==='study'){event.preventDefault();if(current?.sessionInfoOpen)setStudyMenu(false);else endStudy();}}}};document.addEventListener('keydown',escape);
  const unsubscribe=backend.subscribe(()=>{observeSharedActivity();updateStatus({presentation:true}).catch(()=>{});if(!['study','finish'].includes(screen)&&!busy)render();scheduleOutboxSync();});
  if(backend.refreshLocalDayBudget)budgetWatcher=watchLocalDayBudget({refresh:trackBudgetRefresh,getProjection:()=>backend.readProjection(),now,canRefresh:()=>!updateBoundary?.held&&!busy&&!typedBusy&&!customBusy&&!pendingIntent&&!(screen==='study'&&current?.revealed),onRefresh:()=>{if(!['study','finish'].includes(screen))render();},schedule:(fn,delay)=>win.setTimeout(fn,delay),cancel:id=>win.clearTimeout(id)});
  const budgetWake=()=>{if(updateBoundary?.held||document.visibilityState==='hidden')return;if(parkedStudy)render();budgetWatcher?.check();};
  const availabilityWake=()=>{if(online())startedOffline=false;observeSharedActivity();if(updateBoundary?.held)return;if(screen==='today')render();else updateStatus();};
  const unsubscribeSyncState=platform.subscribeSyncState?.(()=>updateStatus({presentation:true}).catch(()=>{}));
  win.addEventListener('online',availabilityWake);win.addEventListener('offline',availabilityWake);
  win.addEventListener('focus',budgetWake);document.addEventListener('visibilitychange',budgetWake);
  // Local writes wake the same Sync action. Its refresh notifications must not
  // start another sync: only a durable, nonempty outbox requests this work.
  let outboxSyncTimer=null,syncRetryTimer=null,syncRetryStep=0;
  const retryableSyncFailure=()=>[nativeSyncActionError,nativeSyncState.error].some(isRetryableProdSyncError);
  const autoSyncAllowed=(retryErrors=false)=>!disposed&&!updateBoundary?.held&&online()&&document.visibilityState!=='hidden'&&platform.storageKind==='native-worker-prod'&&platform.nativeSync?.pairingEnabled&&nativeSyncState.paired&&[nativeSyncActionError,nativeSyncState.error].every(error=>!error||retryErrors&&isRetryableProdSyncError(error))&&!['update-required','bootstrap-required','pairing-disabled'].includes(nativeSyncState.state);
  const pendingAllowsSync=()=>{
    if(!pendingIntent)return true;
    const result=pendingOperation?.result,state=operationState(result,pendingOperation?.policy),resolution=result?.resolution;
    // Only a proved provisional observation needs upload to learn its canonical
    // outcome. Unknown saves and blocked projection/admission stay explicit.
    return state.persisted&&state.phase==='pending'&&!state.updateRequired&&
      (resolution?resolution.eventId===result.eventId&&resolution.status==='observation'&&resolution.outcome?.status==='observation':
        result?.kind==='observation-only'&&result.outcome?.status==='observation');
  };
  function clearSyncRetry(){win.clearTimeout(syncRetryTimer);syncRetryTimer=null;syncRetryStep=0;}
  function scheduleSyncRetry(){
    if(syncRetryTimer!==null||!autoSyncAllowed(true))return;
    const delay=[5000,30000,120000][Math.min(syncRetryStep++,2)];
    syncRetryTimer=win.setTimeout(()=>{syncRetryTimer=null;attemptAutoSync(true);},delay);
  }
  function scheduleOutboxSync(){
    if(disposed||updateBoundary?.held||platform.storageKind!=='native-worker-prod')return;
    win.clearTimeout(outboxSyncTimer);
    outboxSyncTimer=win.setTimeout(async()=>{
      outboxSyncTimer=null;
      if(updateBoundary?.held||!autoSyncAllowed()||!pendingAllowsSync()){if(retryableSyncFailure())scheduleSyncRetry();return;}
      if(nativeSyncBusy||busy||typedBusy||customBusy){scheduleOutboxSync();return;}
      try{
        const status=await backend.status();
        if(!autoSyncAllowed()||nativeSyncBusy||busy||typedBusy||customBusy||!pendingAllowsSync()){scheduleSyncRetry();return;}
        if(status.pendingUpload>0)await runNativeSync(()=>platform.nativeSync.sync(),{quiet:true});
      }catch{/* Save-status polling reports a failed local read. */}
    },300);
  }
  // Foreground wakes are throttled. A dropped/failed wake gets one quiet retry
  // timer: 5 s, 30 s, then at most once per 2 min while visible and online.
  let lastAutoSync=-Infinity,lastReconnectReset=-Infinity;
  function attemptAutoSync(retry=false){
    if(!autoSyncAllowed(true)){clearSyncRetry();return;}
    if(nativeSyncBusy||busy||typedBusy||customBusy||!pendingAllowsSync()){scheduleSyncRetry();return;}
    const at=now();if(!retry&&nativeSyncState.catchUp?.reason!=='paused'&&at-lastAutoSync<60000){if(retryableSyncFailure())scheduleSyncRetry();return;}
    win.clearTimeout(syncRetryTimer);syncRetryTimer=null;lastAutoSync=at;
    runNativeSync(()=>platform.nativeSync.sync(),{quiet:true});
  }
  const autoSync=()=>attemptAutoSync();
  const reconnectSync=()=>{
    const at=now();if(retryableSyncFailure()&&at-lastReconnectReset>=10000){lastAutoSync=-Infinity;lastReconnectReset=at;}
    scheduleOutboxSync();autoSync();
  };
  win.addEventListener('online',reconnectSync);
  win.addEventListener('focus',autoSync);document.addEventListener('visibilitychange',autoSync);
  const backupWake=()=>backupObserver.wake();
  if(typeof platform.backupStatus==='function'){win.addEventListener('focus',backupWake);document.addEventListener('visibilitychange',backupWake);}
  const updateDraftWake=()=>updateBoundary?.sync();root.addEventListener('input',updateDraftWake);root.addEventListener('change',updateDraftWake);
  observeSharedActivity();render();
  const loadTrialAudio=()=>{
    if(disposed||updateBoundary?.held||document.visibilityState==='hidden')return;
    if(sharedAudioDeclared){
      if(sharedAudioRootState==='idle'||sharedAudioRootState==='offline')loadSharedAudioRoot();
      if(current?.audioResult?.status==='offline-missing'){
        current.audioResult=null;current.audioResolverKey=null;
      }
      syncSharedAudioCurrent();
      return;
    }
    if(!trialAudio)return;
    trialAudio.load().then(()=>{if(!disposed)syncTrialAudioControl();},()=>{if(!disposed)syncTrialAudioControl();});
  };
  const audioDownloadsChanged=()=>{
    if(disposed)return;
    const snapshot=platform.audioDownloads.read(),previous=audioDownloadsSnapshot,{state}=snapshot;
    audioDownloadsSnapshot=snapshot;
    const suspended=['paused','disposed'].includes(state),resumed=audioDownloadsSuspended&&!suspended;
    audioDownloadsSuspended=suspended;
    const completed=previous?.state==='downloading'&&['saved','error','cancelled'].includes(state);
    const installed=previous&&snapshot.installedPacks!==previous.installedPacks;
    const retry=resumed||completed||installed||state==='saved'&&previous?.state!=='saved';
    if(suspended){
      if(sharedAudioDeclared)invalidateDownloadedAudio();
    }else{
      if(resumed||['saved','idle','cancelled'].includes(state))audioDownloadActionFailed=false;
      if(retry){
        retryDownloadedAudio();
        loadTrialAudio();
      }
    }
    syncAudioDownloads();
  };
  const unsubscribeAudioDownloads=platform.audioDownloads?.subscribe(audioDownloadsChanged);
  if(platform.audioDownloads)audioDownloadsChanged();
  win.addEventListener('online',loadTrialAudio);win.addEventListener('focus',loadTrialAudio);document.addEventListener('visibilitychange',loadTrialAudio);
  loadTrialAudio();
  backupObserver.start();
  reconcileUnknownFactoryRows();
  if(platform.storageKind==='native-worker-prod'&&platform.nativeSync)updateStatus().catch(()=>{});
  return Object.freeze({requestUpdateBoundary:token=>updateBoundary.request(token),readUpdateState:()=>updateBoundary.read(),releaseUpdateBoundary:token=>updateBoundary.release(token),subscribeUpdateState:listener=>updateBoundary.subscribe(listener),showTask:(...args)=>{if(updateBoundary.held)return;sessionShown=0;return start(...args);},refreshStatus:updateStatus,read:()=>({screen,module,current,busy:busy||typedBusy||customBusy,pendingIntent,theme,themePreferenceSet,interfaceLanguage}),dispose(){unsubscribeAudioDownloads?.();stopTrialAudio();studyAudio?.dispose?.();disposed=true;updateBoundary.dispose();root.removeEventListener('input',updateDraftWake);root.removeEventListener('change',updateDraftWake);backupObserver.dispose();win.removeEventListener('focus',backupWake);document.removeEventListener('visibilitychange',backupWake);nativeStatusGeneration++;clearSyncRetry();win.clearTimeout(outboxSyncTimer);win.clearTimeout(saveBacklogTimer);win.clearTimeout(toastTimer);win.clearTimeout(finishGuardTimer);panelObserver?.disconnect();budgetWatcher?.dispose();win.removeEventListener('online',availabilityWake);win.removeEventListener('online',reconnectSync);win.removeEventListener('offline',availabilityWake);win.removeEventListener('focus',budgetWake);document.removeEventListener('visibilitychange',budgetWake);win.removeEventListener('focus',autoSync);document.removeEventListener('visibilitychange',autoSync);platform.nativeSync?.dispose?.();factoryStatuses.dispose();rubyLayout.dispose();current?.timer.dispose();parkedStudy?.current.timer.dispose();closePopover();unsubscribe();unsubscribeSyncState?.();dark.removeEventListener('change',darkChanged);document.removeEventListener('keydown',onKey);document.removeEventListener('keydown',escape);document.removeEventListener('pointerdown',outsidePopover,true);win.removeEventListener('online',loadTrialAudio);win.removeEventListener('focus',loadTrialAudio);document.removeEventListener('visibilitychange',loadTrialAudio);trialAudioPlaybackGeneration++;trialAudio?.dispose();root.replaceChildren();}});
}
