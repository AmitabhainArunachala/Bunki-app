import * as FSRS from '../../vendor/ts-fsrs.mjs';
import {createEngine} from './engine.mjs';
import {openStore} from './store.mjs';
import {validateCollection, validateEnrichment, parseImport, backup, safeURL, MAX_IMPORT_BYTES} from './schema.mjs';
import {mergeEnrichment} from './enrichment.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
const labels = {meaning:'Meaning',reading:'Reading',grammar:'Grammar',apply:'Apply the idea'};
const button = (label, attrs = '', cls = '') => `<button type="button" class="${cls}" ${attrs}>${esc(label)}</button>`;
const interval = ms => ms < 3600000 ? `${Math.max(1,Math.round(ms/60000))}m` : ms < 86400000 ? `${Math.round(ms/3600000)}h` : `${Math.round(ms/86400000)}d`;
const date = ms => new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'}).format(ms) + ' JST';
const rubyText = (value, segments) => Array.isArray(segments) && segments.map(s => s.text).join('') === value ? segments.map(s => s.reading ? `<ruby>${esc(s.text)}<rt>${esc(s.reading)}</rt></ruby>` : esc(s.text)).join('') : esc(value);
const mark = (value, target) => target ? esc(value).split(esc(target)).join(`<mark>${esc(target)}</mark>`) : esc(value);

export async function mount(container, {onLeave, themes = [], currentTheme, onTheme, bridge} = {}) {
  if (!document.querySelector('link[data-personal-style]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = new URL('./personal.css', import.meta.url).href;
    link.dataset.personalStyle = ''; document.head.append(link);
  }
  const root = document.createElement('div'); root.className = 'pc';
  root.innerHTML = '<div class="pc-body"></div><p class="pc-status" role="status" aria-live="polite"></p><input class="pc-file" type="file" accept=".json,application/json" aria-label="Import collection or progress backup" hidden>';
  container.replaceChildren(root);
  const body = root.querySelector('.pc-body'), status = root.querySelector('.pc-status'), input = root.querySelector('.pc-file');
  let store, record, engine, list = [], screen = 'home', current = null, revealed = false, started = 0;
  let busy = false, pending = null, query = '', world = 'all', reader = null, fatal = '', disposed = false;
  let noticeTimer, exploring = false, englishOpen = false, briefEnglishOpen = false;
  const prepared = new Map(), preparing = new Set();
  let lookupNodes = [], paintedViewKey = null;
  const detailStates = new Map();
  const enrichmentFor = l => record?.enrichment?.lessons?.find(x => x.id === l.id && x.contentHash === l.contentHash);
  const canExplore = id => !disposed && root.isConnected && ((screen === 'study' && revealed && current?.lesson.id === id) || (screen === 'read' && reader === id));
  const preparedKey = l => `${record.id}:${l.id}:${l.contentHash}:${record.enrichment?.enrichmentHash || 'base'}`;
  const notice = message => {
    clearTimeout(noticeTimer); status.textContent = message;
    if (!message.startsWith('Not saved.')) noticeTimer = setTimeout(() => { status.textContent = ''; }, 5000);
  };
  const collection = () => record.collection;
  const worldFor = id => collection().worlds.find(w => w.id === id);
  const resetCard = () => { current = null; revealed = false; englishOpen = false; briefEnglishOpen = false; bridge?.close?.(); };
  const focusAnswer = () => body.querySelector(window.matchMedia('(max-width:999px)').matches ? '.pc-quick-answer' : '.pc-answer')?.focus({preventScroll:true});
  const focusAction = action => [...body.querySelectorAll(`[data-action="${action}"]`)].find(el => el.getClientRects().length)?.focus({preventScroll:true});
  const focusHeading = () => body.querySelector('h1')?.focus({preventScroll:true});
  function nav(next) { bridge?.close?.(); exploring = false; englishOpen = false; briefEnglishOpen = false; screen = next; pending = null; reader = null; paint(); window.scrollTo(0,0); focusHeading(); }
  function download(name, value) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = name; root.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function exportRecord(share = false) {
    // Export the latest committed record, including when another window wrote it.
    const latest = await store.get(record.id);
    if (!latest) throw new Error('This collection could not be read.');
    const value = backup(latest), name = `${latest.id}-bunki-backup.json`;
    if (share && navigator.canShare) {
      const file = new File([JSON.stringify(value,null,2)],name,{type:'application/json'});
      if (navigator.canShare({files:[file]})) {
        try { await navigator.share({files:[file],title:'Bunki collection backup'}); notice('Backup shared.'); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
    }
    download(name,value); notice('Backup prepared with this collection and its complete review history.');
  }
  async function refreshHome() { list = await store.list(); screen = 'home'; record = null; engine = null; resetCard(); paint(); }
  async function open(id) {
    const next = await store.get(id);
    if (!next) throw new Error('This collection was not found on this device.');
    await validateCollection(next.collection);
    const enrichment = next.enrichment || next.collection.enrichment;
    if (enrichment) await validateEnrichment(enrichment,next.collection);
    const nextEngine = createEngine(next.collection,FSRS);
    nextEngine.validate(next.progress);
    record = {...next,...(enrichment?{enrichment}:{})}; engine = nextEngine; resetCard(); reader = null; query = ''; world = 'all'; nav('study');
  }
  async function transact(transform) {
    if (busy) return false;
    busy = true;
    root.setAttribute('aria-busy','true');
    try {
      const result = await store.update(record.id,record.revision,old => ({...old,progress:engine.validate(transform(engine.validate(old.progress)))}));
      record = result; return true;
    } catch (e) { notice(`Not saved. ${e.message}`); return false; }
    finally { busy = false; root.removeAttribute('aria-busy'); }
  }
  function top(title) {
    return `<header class="pc-top">${button('← Bunki','data-action="leave"')}<span class="pc-kicker">私の文脈 / PERSONAL COLLECTIONS</span></header><h1 tabindex="-1">${esc(title)}</h1>`;
  }
  function tabs() {
    return `<nav aria-label="Collection">${[['study','Study'],['read','Read'],['connections','Threads'],['settings','Settings'],['home','Library']].map(([id,label]) => button(label,`data-screen="${id}" aria-current="${screen===id?'page':'false'}"`)).join('')}</nav>`;
  }
  function preview() {
    if (!pending) return '';
    return `<section class="pc-panel pc-preview" aria-label="Import preview"><h2>Ready to import</h2><p>${esc(pending.collection.title)}</p><p>${pending.collection.lessons.length} paragraphs · ${pending.collection.lessons.length*4} focused cards · ${pending.added} additional review events</p>${pending.enrichment?`<p>${pending.enrichment.lessons.length} Japanese answer guides with paragraph readings · revision ${pending.enrichment.revision}. Your original paragraphs and review identities stay the same.</p>`:''}<p>${pending.existing?'Your current collection and settings will be retained. Compatible review history can only grow.':'The collection stays on this device. Reading does not create review evidence. Choose Study when you are ready.'}</p>${button('Import on this device','data-action="confirm-import"','pc-primary')} ${button('Cancel','data-action="cancel-import"')}</section>`;
  }
  function home() {
    body.innerHTML = top('私の文脈 · Personal collections') + `<p class="pc-lead">Bring your own paragraphs into Bunki. One focused question, with room for the whole idea.</p><section class="pc-panel"><h2>Import your collection</h2><p>Choose the collection JSON saved in Files or Downloads. A Bunki backup also restores its compatible review history.</p>${button('Choose a JSON file','data-action="import"','pc-primary')}<p class="pc-small">On iPhone, install Bunki on your Home Screen first, then import inside that app. On Mac, import inside the Bunki window you use for study.</p></section>${preview()}<div class="pc-grid">${list.map(r => `<section class="pc-panel"><h2>${esc(r.collection?.title || r.id)}</h2><p>${r.collection?.lessons?.length || 0} paragraphs · ${r.progress?.events?.length || 0} preserved events</p><div class="pc-actions">${button('Open collection',`data-open="${esc(r.id)}"`)}${button('Export stored data',`data-raw="${esc(r.id)}"`)}</div></section>`).join('')}</div><p class="pc-small">Content and progress stay in Bunki’s device storage. There is no automatic cloud sync. Export before moving devices or clearing browser data; Files, iCloud Drive, or AirDrop can carry your backup.</p>${fatal?`<p role="alert">${esc(fatal)}</p>`:''}`;
  }
  function provenance(l) {
    const c = collection(), w = worldFor(l.world), thread = c.threads?.find(t => t.id === w.thread), guide = record.enrichment?.provenance;
    return `<details class="pc-notes"><summary>Sources, conversation thread & connections</summary><p>Original composition · ${esc(l.editorialStatus)}</p>${guide?`<div class="pc-editorial-note" lang="ja"><h3>説明と読みについて</h3><p>${esc(guide.authorshipJa)}</p><p>${esc(guide.readingMethodJa)}</p></div>`:''}${thread?`<h3>${esc(thread.label)}</h3><ul>${thread.anchors.map(a => `<li>${esc(a)}</li>`).join('')}</ul><p>${esc(thread.basis)}</p>`:''}${l.sources.map(id => {
      const s = c.sources.find(x => x.id === id), url = safeURL(s.url);
      return `<p>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`:esc(s.title)}<br><span class="pc-small">${esc(s.scope)}</span></p>`;
    }).join('')}<div class="pc-actions">${l.connections.map(id => button(worldFor(id).en,`data-world="${esc(id)}"`)).join('')}</div></details>`;
  }
  function lookupButton(label, node, l, cls = '', content = esc(label)) {
    if (!bridge?.lookup || !node) return content;
    const index = lookupNodes.push({node,lessonId:l.id}) - 1;
    return `<button type="button" class="pc-token ${cls}" data-lookup="${index}">${content}</button>`;
  }
  function annotated(l, target = '') {
    const data = prepared.get(preparedKey(l)), sidecar = enrichmentFor(l);
    const segments = data?.segments?.length ? data.segments : sidecar?.segments;
    if (!segments?.length || segments.map(s => s.text ?? s.surface ?? '').join('') !== l.ja) return mark(l.ja,target);
    let offset = 0;
    const ranges = target ? [...l.ja.matchAll(new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),'g'))].map(m => [m.index,m.index+target.length]) : [];
    return segments.map(segment => {
      const text = segment.text ?? segment.surface, reading = segment.reading;
      let content = reading ? `<ruby>${esc(text)}<rt>${esc(reading)}</rt></ruby>` : esc(text);
      if (ranges.some(([start,end]) => start < offset + text.length && end > offset)) content = `<mark>${content}</mark>`;
      offset += text.length;
      if (!segment.node || !bridge?.lookup) return content;
      const index = lookupNodes.push({node:segment.node,lessonId:l.id}) - 1;
      return `<button type="button" class="pc-token" data-lookup="${index}">${content}</button>`;
    }).join('');
  }
  function prepare(l) {
    if (!bridge?.prepareLesson || !canExplore(l.id)) return;
    const key = preparedKey(l);
    if (prepared.has(key) || preparing.has(key)) return;
    preparing.add(key);
    Promise.resolve(bridge.prepareLesson({...l,segments:enrichmentFor(l)?.segments},{canInteract:() => canExplore(l.id)})).then(data => {
      if (disposed) return;
      prepared.set(key,data || {});
      if (canExplore(l.id) && !exploring) {
        const active = document.activeElement, action = root.contains(active) ? active?.dataset?.action : null;
        paint();
        if (action) body.querySelector(`[data-action="${action}"]`)?.focus({preventScroll:true});
      }
    }).catch(() => {
      prepared.set(key,{notice:'Dictionary preparation is unavailable. The paragraph and review remain available.'});
      if (canExplore(l.id)) paint();
    }).finally(() => preparing.delete(key));
  }
  function english(l, kind) {
    return `<div class="pc-english">${button(englishOpen?'Close English support':'English support',`data-action="english" aria-expanded="${englishOpen}"`,'pc-english-toggle')}${englishOpen?`<div class="pc-english-content" lang="en"><h4>Target meaning</h4><p>${esc(l.gloss)}</p><h4>Grammar · ${esc(l.grammar)}</h4><p>${esc(l.grammarAnswer)}</p>${['apply','read'].includes(kind)?`<h4>One acceptable application</h4><p>${esc(l.conceptAnswer)}</p>`:''}<h4>Paragraph translation</h4><p class="pc-translation">${esc(l.en)}</p></div>`:''}</div>`;
  }
  function phraseRuby(l, text) {
    if (text === l.term) return rubyText(text,[{text,reading:l.reading}]);
    const start = l.ja.indexOf(text), end = start + text.length;
    if (start < 0) return esc(text);
    let offset = 0;
    const matched = [];
    for (const segment of enrichmentFor(l)?.segments || []) {
      const next = offset + segment.text.length;
      if (offset >= start && next <= end) matched.push(segment);
      offset = next;
    }
    return rubyText(text,matched);
  }
  function briefEnglish(l, kind) {
    const text = kind==='grammar'?l.grammarAnswer:kind==='apply'?l.conceptAnswer:l.gloss;
    return `<div class="pc-rescue">${button(briefEnglishOpen?'Close English':'English',`data-action="english-brief" aria-expanded="${briefEnglishOpen}"`,'pc-quiet')}${briefEnglishOpen?`<p class="pc-brief-definition" lang="en">${esc(text)}</p>`:''}</div>`;
  }
  function quickAnswer(l, kind) {
    const e = enrichmentFor(l), key = kind==='grammar'?'grammarJa':kind==='apply'?'applicationJa':'explanationJa';
    const target = kind==='grammar'?l.grammar:kind==='apply'?'段落から考える':l.term;
    const fallback = kind==='reading'?'上の読み方と、自分の答えを比べてください。':kind==='apply'?'段落の内容を根拠に、自分の答えを確認してください。':'日本語の説明は未収録です。語句を調べるか、英語の補助を開いて確認できます。';
    return `<section class="pc-quick-answer" tabindex="-1" aria-label="Revealed answer"><h3 lang="ja">${phraseRuby(l,target)}${!['grammar','apply'].includes(kind)?`<span class="pc-reading">${l.acceptedReadings.map(esc).join(' / ')}</span>`:''}</h3><p class="pc-quick-definition${e?.[key]?'':' pc-fallback'}" lang="ja">${e?.[key]?rubyText(e[key],e.rubySegments?.[key]):esc(fallback)}</p>${briefEnglish(l,kind)}</section>`;
  }
  function answer(l, kind) {
    const e = enrichmentFor(l), data = prepared.get(preparedKey(l));
    const target = kind==='grammar'?l.grammar:kind==='apply'?'段落から考える':l.term;
    const explanationKey = kind==='grammar'?'grammarJa':kind==='apply'?'applicationJa':'explanationJa';
    const explanation = e?.[explanationKey];
    const fallback = kind==='reading'?'上の読み方と、自分の答えを比べてください。':kind==='apply'?'段落の内容を根拠に、自分の答えを確認してください。':'この版には日本語の説明がまだありません。段落を読み直すか、語句を調べて確認できます。';
    const comparisonIsRelated = e?.relations?.some(r => r.explanationJa === e.contrastJa);
    const relation = e?.relations?.length ? `<details class="pc-notes"><summary lang="ja">${comparisonIsRelated?'使い分け・関連する表現':'関連する表現'}</summary><div class="pc-relations">${e.relations.map((r,index) => `<div class="pc-relation"><h4 lang="ja">${lookupButton(r.term,{kind:'word',text:r.term},l,'',r.reading?`<ruby>${esc(r.term)}<rt>${esc(r.reading)}</rt></ruby>`:rubyText(r.term,e.rubySegments?.relations?.[index]?.term))}</h4><p lang="ja">${rubyText(r.explanationJa,e.rubySegments?.relations?.[index]?.explanationJa)}</p></div>`).join('')}</div></details>`:'';
    const grammar = kind!=='grammar' && e?.grammarJa ? `<details class="pc-notes"><summary lang="ja">文の組み立て · ${esc(l.grammar)}</summary><p lang="ja">${rubyText(e.grammarJa,e.rubySegments?.grammarJa)}</p></details>`:'';
    const contrast = e?.contrastJa && !comparisonIsRelated ? `<details class="pc-notes"><summary lang="ja">使い分け</summary><p lang="ja">${rubyText(e.contrastJa,e.rubySegments?.contrastJa)}</p></details>`:'';
    const kanji = data?.kanji || [];
    const tools = bridge?.lookup ? `<div class="pc-answer-tools"><div class="pc-actions">${lookupButton(l.term,{kind:'word',text:l.term},l)}${lookupButton(l.grammar,{kind:'grammar',grammarKey:l.grammar,text:l.grammar},l)}</div>${kanji.length?`<details class="pc-notes"><summary lang="ja">漢字をたどる</summary><div class="pc-actions">${kanji.map(k => lookupButton(k.label,k.node || {kind:'kanji',text:k.label},l)).join('')}</div></details>`:''}</div>`:'';
    return `<section class="pc-answer" tabindex="-1" aria-label="Revealed answer"><div class="pc-answer-head"><div><p class="pc-eyebrow">確認 / CHECK YOUR RECALL</p><h3 lang="ja">${phraseRuby(l,target)}${!['grammar','apply'].includes(kind)?`<span class="pc-reading">${l.acceptedReadings.map(esc).join(' / ')}</span>`:''}</h3></div><span class="pc-answer-kind">${labels[kind] || 'Reference'}</span></div><p class="pc-definition${explanation?'':' pc-fallback'}" lang="ja">${explanation?rubyText(explanation,e?.rubySegments?.[explanationKey]):esc(fallback)}</p>${briefEnglish(l,kind)}${e?.usageJa?`<div class="pc-usage"><p lang="ja">${rubyText(e.usageJa,e.rubySegments?.usageJa)}</p></div>`:''}${tools}${grammar}${contrast}${relation}${english(l,kind)}${provenance(l)}</section>`;
  }
  function study() {
    const q = engine.queue(record.progress);
    if (!current || ![...q.due,...q.newCards].some(c => c.id === current.id)) {
      current = q.next; revealed = false; englishOpen = false; briefEnglishOpen = false; started = performance.now();
    }
    let html = `<div class="pc-study-meta"><div class="pc-counter"><span><b>${q.due.length}</b>due</span><span><b>${Math.max(0,record.progress.settings.newLimit-q.startedToday)}</b>new slots</span></div><p class="pc-small">Japan study day</p></div>`;
    if (!current) {
      return html + `<section class="pc-panel"><p class="pc-eyebrow">ひと息 / AT YOUR PACE</p><h2>Room to return</h2><p>Nothing is due right now.${q.nextAt?' Next selected review: '+esc(date(q.nextAt))+'.':''}</p><p>${q.buried} related cards resting until another study day. ${q.pausedCount} selected cards paused.</p><div class="pc-actions">${button('Read a paragraph','data-screen="read"','pc-primary')}${button('Refresh due cards','data-action="refresh"')}${button('Undo last grade','data-action="undo"')}</div></section>`;
    }
    const l = current.lesson, kind = current.kind;
    const prompt = kind==='meaning'?`「${l.term}」は、ここではどんな意味？`:kind==='reading'?`「${l.term}」の読み方は？`:kind==='grammar'?`「${l.grammar}」は、この文でどう働く？`:l.conceptQuestion;
    const guide = kind==='meaning'?'Recall the meaning in this context.':kind==='reading'?'Recall the reading.':kind==='grammar'?'Recall the grammar’s function in this paragraph.':'Use the paragraph to reason. English or Japanese is fine.';
    html += `<article class="pc-panel pc-card${revealed?' pc-revealed':''}" data-card="${esc(current.id)}"><header class="pc-card-head"><p class="pc-kicker" lang="ja">${esc(worldFor(l.world).ja)} / ${esc(l.title)}</p><span class="pc-state">${q.states.has(current.id)?'Review':'New'}</span></header><section class="pc-focus"><p class="pc-eyebrow">${esc(labels[kind])} / ${kind==='meaning'?'意味':kind==='reading'?'読み':kind==='grammar'?'文法':'応用'}</p><h2>${esc(prompt)}</h2><p class="pc-small">${esc(guide)}</p>${revealed?quickAnswer(l,kind):''}</section><section class="pc-context"><div class="pc-context-label pc-eyebrow">文脈 / CONTEXT</div><p class="pc-japanese" lang="ja">${revealed?annotated(l,kind==='grammar'?l.grammar:kind==='apply'?'':l.term):mark(l.ja,kind==='grammar'?l.grammar:kind==='apply'?'':l.term)}</p>${revealed?`<p class="pc-explore-note">${bridge?.lookup?'Tap a word, kanji, or grammar expression to explore.':'Read the paragraph again, then compare your recall.'}${prepared.get(preparedKey(l))?.notice?` ${esc(prepared.get(preparedKey(l)).notice)}`:''}</p>`:''}</section>`;
    if (revealed) {
      prepare(l);
      const waits = engine.intervals(record.progress,current.id);
      html += answer(l,kind) + `<div class="pc-controls"><p class="pc-dock-label"><span>${exploring?'Close the dictionary to grade your recall.':'Grade only the target you recalled.'}</span><span>1–4</span></p><div class="pc-grades">${['Again','Hard','Good','Easy'].map((s,i) => `<button type="button" data-grade="${i+1}" ${exploring?'disabled':''} title="${['Missed','Recalled with difficulty','Recalled','Effortless'][i]}"><kbd>${i+1}</kbd><strong>${s}</strong><span>${interval(waits[i])}</span></button>`).join('')}</div></div>`;
    } else html += `<div class="pc-controls"><p class="pc-dock-label"><span>One target. Take your time.</span><span>Space</span></p>${button('Reveal answer','data-action="reveal"','pc-primary pc-wide')}</div>`;
    return html + `</article><footer class="pc-card-foot"><div class="pc-actions">${button('Undo last grade','data-action="undo"')}${button('Pause this card',`data-pause="${esc(current.id)}" data-value="true"`)}${button('Stop & read','data-screen="read"')}</div><p class="pc-small">Original paragraph · Learner graded</p></footer>`;
  }
  function reading() {
    if (reader) {
      const l = engine.lessonMap.get(reader); prepare(l);
      const index = collection().lessons.findIndex(x => x.id === reader), d = engine.derive(record.progress);
      return `<div class="pc-actions">${button('← All paragraphs','data-action="read-all"')}<span class="pc-small">${index+1}/${collection().lessons.length}</span></div><article class="pc-panel"><p class="pc-kicker">${esc(worldFor(l.world).en)} · Read freely</p><h2 lang="ja">${esc(l.title)}</h2><p class="pc-japanese" lang="ja">${annotated(l)}</p>${answer(l,'read')}<details class="pc-notes"><summary>Try an application</summary><p>${esc(l.conceptQuestion)}</p><details><summary>Compare one acceptable answer</summary><p>${esc(l.conceptAnswer)}</p></details></details><details class="pc-notes"><summary>Manage these four cards</summary><p>Six Again grades pause a difficult card for repair. Resume it here when ready.</p><div class="pc-actions">${engine.cards.filter(c => c.family===l.id).map(c => button(`${d.paused(c)?'Resume':'Pause'} ${labels[c.kind]}`,`data-pause="${esc(c.id)}" data-value="${!d.paused(c)}"`)).join('')}</div></details></article><div class="pc-actions">${button('Previous',`data-read="${esc(collection().lessons[(index-1+collection().lessons.length)%collection().lessons.length].id)}"`)}${button('Next paragraph',`data-read="${esc(collection().lessons[(index+1)%collection().lessons.length].id)}"`)}</div>`;
    }
    const search = query.toLocaleLowerCase().trim();
    const found = collection().lessons.filter(l => (world==='all'||l.world===world) && (!search||[l.title,l.ja,l.en,l.term,l.reading,l.grammar,worldFor(l.world).en].join(' ').toLocaleLowerCase().includes(search)));
    return `<p class="pc-small">Reading, searching, and revealing do not change your schedule.</p><div class="pc-search"><label>Search paragraphs<input type="search" id="pc-search" value="${esc(query)}" placeholder="Word, kanji, theme, or idea"></label><label>Theme<select id="pc-world"><option value="all">All themes</option>${collection().worlds.map(w => `<option value="${esc(w.id)}" ${world===w.id?'selected':''}>${esc(w.en)}</option>`).join('')}</select></label></div><p class="pc-small">${found.length} paragraphs</p><div class="pc-grid">${found.map(l => `<button type="button" class="pc-panel pc-tile" data-read="${esc(l.id)}"><span class="pc-kicker">${esc(worldFor(l.world).en)}</span><strong lang="ja">${esc(l.title)}</strong><span lang="ja">${esc(l.ja.split('。')[0])}。</span><span class="pc-small" lang="ja">${esc(l.term)} · ${esc(l.grammar)}</span></button>`).join('')}</div>`;
  }
  function connections() {
    return `<p class="pc-lead">Follow a thread across the same collection.</p><div class="pc-grid">${(collection().routes||[]).map(r => `<section class="pc-panel pc-route"><h2>${esc(r.title)}</h2>${r.ids.map((id,i) => button(`${i+1}. ${engine.lessonMap.get(id).title}`,`data-read="${esc(id)}"`)).join('')}</section>`).join('')}</div>${collection().worlds.map(w => `<section class="pc-panel"><h2>${esc(w.en)} <span lang="ja">${esc(w.ja)}</span></h2><p>${esc(w.about)}</p>${button('Read this theme',`data-world="${esc(w.id)}"`)}</section>`).join('')}`;
  }
  function settings() {
    const s = record.progress.settings;
    return `<section class="pc-panel"><h2>Make room for your day</h2><form id="pc-settings"><label>New cards per day <input name="limit" type="number" min="0" max="60" value="${s.newLimit}" required></label><p class="pc-small">Default 6 across all selected themes and types. Due cards come first. A related card waits until another Japan study day.</p><fieldset><legend>Tasks in review</legend>${Object.entries(labels).map(([id,label]) => `<label class="pc-check"><input type="checkbox" name="kind" value="${id}" ${s.kinds.includes(id)?'checked':''}>${label}${['reading','apply'].includes(id)?' · optional':''}</label>`).join('')}</fieldset><fieldset><legend>Themes in review</legend>${collection().worlds.map(w => `<label class="pc-check"><input type="checkbox" name="world" value="${esc(w.id)}" ${s.worlds.includes(w.id)?'checked':''}>${esc(w.en)}</label>`).join('')}</fieldset><button type="submit" class="pc-primary">Save study settings</button></form></section><section class="pc-panel"><h2>iPhone ↔ Mac</h2><p>Export here, then import that file inside Bunki on the other device. Keep one device as your active study device until you transfer the latest backup.</p><div class="pc-actions">${button('Export collection & progress','data-action="export"')}${button('Share backup','data-action="share"')}${button('Import a JSON file','data-action="import"')}</div><p class="pc-small">${record.progress.events.length} preserved events. Older files cannot remove reviews; histories that branched on both devices stay untouched. There is no automatic iCloud sync. Progress from the standalone edition can be imported here; Anki has its own schedule.</p>${preview()}</section>${themes.length?`<section class="pc-panel"><h2>Bunki palette</h2><div class="pc-actions">${themes.map(t=>button(`${t.seal} ${t.name}`,`data-theme="${esc(t.id)}" aria-pressed="${currentTheme===t.id}"`)).join('')}</div></section>`:''}<section class="pc-panel"><h2>About this collection</h2><p>${esc(collection().scope)}</p><p>${esc(collection().level)}</p><p>${collection().lessons.length} original paragraphs · ${engine.cards.length} independently scheduled tasks. Meaning and grammar are the default; reading and application are optional.</p><p class="pc-small">FSRS-6 · ts-fsrs 5.4.1 · retention 0.90 · 1m/10m learning · 10m relearning. Each answer stays learner-graded. Views and lookups never count as mastery.</p><p class="pc-small">Private content stays on this device unless you export or share it. Browser storage can be cleared; keep backups. Native iPhone and Mac packaging is separate from this installed web app.</p></section>`;
  }
  function paint() {
    if (disposed) return;
    const previousKey = paintedViewKey;
    const active = root.contains(document.activeElement) ? document.activeElement : null;
    const activeSummary = active?.tagName === 'SUMMARY' ? active.textContent : null;
    const activeAnswer = active?.matches('.pc-answer,.pc-quick-answer');
    if (previousKey) {
      const remembered = detailStates.get(previousKey) || new Map();
      body.querySelectorAll('details').forEach(detail => remembered.set(detail.querySelector(':scope > summary')?.textContent || '',detail.open));
      detailStates.set(previousKey,remembered);
    }
    lookupNodes = [];
    root.dataset.screen = screen;
    if (screen==='home' || !record) { paintedViewKey = null; home(); return; }
    body.innerHTML = top(collection().title) + tabs() + (screen==='study'?study():screen==='read'?reading():screen==='connections'?connections():settings());
    paintedViewKey = `${record.id}:${screen}:${screen==='study'?current?.id || 'empty':reader || 'all'}`;
    const remembered = detailStates.get(paintedViewKey);
    body.querySelectorAll('details').forEach(detail => {
      const state = remembered?.get(detail.querySelector(':scope > summary')?.textContent || '');
      if (state !== undefined) detail.open = state;
    });
    if (paintedViewKey === previousKey) {
      if (activeSummary) [...body.querySelectorAll('summary')].find(summary => summary.textContent === activeSummary)?.focus({preventScroll:true});
      else if (activeAnswer) focusAnswer();
    }
  }
  async function chooseImport(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) throw new Error('This file exceeds the 30 MB import limit. Nothing was replaced.');
    const incoming = await parseImport(JSON.parse(await file.text()));
    const id = incoming.collection?.id || incoming.progress?.deck || incoming.enrichment?.collectionId;
    const existing = await store.get(id);
    const data = incoming.collection || existing?.collection;
    if (!data) throw new Error('Import the collection JSON before its separate answers or progress backup.');
    await validateCollection(data);
    if (existing && existing.collection.contentDigest !== data.contentDigest) throw new Error('This is a different content edition. Keep both files; the existing collection was not changed.');
    if (incoming.enrichment) await validateEnrichment(incoming.enrichment,data);
    const enrichment = mergeEnrichment(existing?.enrichment || existing?.collection.enrichment,incoming.enrichment);
    const e = createEngine(data,FSRS), base = existing ? e.validate(existing.progress) : e.fresh(uid());
    if (!existing && incoming.progress) base.settings = e.validate(incoming.progress).settings;
    const imported = incoming.progress ? e.previewImport(base,incoming.progress) : {added:0,result:base};
    pending = {collection:data,progress:incoming.progress,enrichment,existing,added:imported.added};
    // A backup preview belongs to the collections screen, not another deck's settings.
    if (record && record.id !== id) screen = 'home';
    paint(); body.querySelector('.pc-preview')?.scrollIntoView({block:'center'}); notice('Review the import, then confirm.');
  }
  async function confirmImport() {
    if (!pending || busy) return;
    busy = true;
    try {
      const p = pending, e = createEngine(p.collection,FSRS);
      await store.update(p.collection.id,p.existing?.revision ?? null,old => {
        const base = old ? e.validate(old.progress) : e.fresh(uid());
        if (!old && p.progress) base.settings = e.validate(p.progress).settings;
        const progress = p.progress ? e.previewImport(base,p.progress).result : base;
        const enrichment = mergeEnrichment(old?.enrichment || old?.collection.enrichment,p.enrichment);
        const {enrichment:embeddedAnswers,...originalCollection} = old?.collection || p.collection;
        return {id:p.collection.id,collection:originalCollection,progress,...(enrichment?{enrichment}:{})};
      });
      pending = null; await open(p.collection.id); notice('Collection saved on this device. Choose a task when ready.');
    } finally { busy = false; }
  }
  async function grade(rating) {
    if (!current || !revealed || screen!=='study' || busy || exploring) return;
    const id = current.id;
    if (await transact(old => engine.grade(old,id,rating,uid(),performance.now()-started))) {
      resetCard(); paint(); notice('Review saved.'); window.scrollTo(0,0);
      body.querySelector('[data-action="reveal"]')?.focus({preventScroll:true});
    }
  }
  root.addEventListener('click',async event => {
    const b = event.target.closest('button'); if (!b || !root.contains(b) || busy) return;
    try {
      if (b.dataset.lookup !== undefined) {
        const selected = lookupNodes[Number(b.dataset.lookup)];
        if (!selected || !canExplore(selected.lessonId) || exploring) return;
        exploring = true;
        body.querySelectorAll('[data-grade]').forEach(el => { el.disabled = true; });
        const label = body.querySelector('.pc-dock-label span');
        if (label) label.textContent = 'Close the dictionary to grade your recall.';
        try { await bridge.lookup(selected.node,{canInteract:() => canExplore(selected.lessonId),invoker:b}); }
        finally {
          exploring = false;
          if (canExplore(selected.lessonId)) {
            body.querySelectorAll('[data-grade]').forEach(el => { el.disabled = false; });
            if (label?.isConnected) label.textContent = 'Grade only the target you recalled.';
            if (b.isConnected) b.focus({preventScroll:true});
          }
        }
        return;
      }
      if (b.dataset.screen) { if (b.dataset.screen==='home') await refreshHome(); else nav(b.dataset.screen); return; }
      if (b.dataset.open) { await open(b.dataset.open); return; }
      if (b.dataset.raw) { download(`${b.dataset.raw}-stored-data.json`,await store.get(b.dataset.raw)); notice('Untouched stored record exported for recovery.'); return; }
      if (b.dataset.read) { bridge?.close?.(); englishOpen=false; briefEnglishOpen=false; screen='read'; reader=b.dataset.read; paint(); window.scrollTo(0,0); return; }
      if (b.dataset.world) { world=b.dataset.world; query=''; nav('read'); return; }
      if (b.dataset.theme) { onTheme?.(b.dataset.theme); currentTheme=b.dataset.theme; paint(); return; }
      if (b.dataset.grade) { await grade(Number(b.dataset.grade)); return; }
      if (b.dataset.pause) {
        if (await transact(old => engine.pause(old,b.dataset.pause,b.dataset.value==='true',uid()))) { resetCard(); paint(); notice(b.dataset.value==='true'?'Card paused.':'Card resumed.'); } return;
      }
      switch (b.dataset.action) {
        case 'leave': bridge?.close?.(); disposed=true; clearInterval(ticker); store?.close(); onLeave?.(); break;
        case 'import': input.value=''; input.click(); break;
        case 'confirm-import': await confirmImport(); break;
        case 'cancel-import': pending=null; paint(); break;
        case 'reveal': revealed=true; paint(); focusAnswer(); break;
        case 'english-brief': briefEnglishOpen=!briefEnglishOpen; paint(); focusAction('english-brief'); break;
        case 'english': englishOpen=!englishOpen; paint(); body.querySelector('[data-action="english"]')?.focus({preventScroll:true}); break;
        case 'refresh': resetCard(); paint(); break;
        case 'undo': if (await transact(old => engine.undo(old,uid()))) { resetCard(); paint(); notice('Last grade undone. Original event preserved.'); } break;
        case 'read-all': reader=null; paint(); break;
        case 'export': await exportRecord(); break;
        case 'share': await exportRecord(true); break;
      }
    } catch (e) { notice(e.message); }
  });
  input.addEventListener('change',async () => { try { pending=null; await chooseImport(input.files[0]); } catch (e) { paint(); notice(e.message); } });
  root.addEventListener('input',event => {
    if (event.target.id !== 'pc-search') return;
    query=event.target.value; const position=event.target.selectionStart; paint();
    const field=body.querySelector('#pc-search'); field.focus(); field.setSelectionRange(position,position);
  });
  root.addEventListener('change',event => { if (event.target.id==='pc-world') { world=event.target.value; paint(); } });
  root.addEventListener('submit',async event => {
    if (event.target.id!=='pc-settings') return;
    event.preventDefault();
    const form = event.target;
    const settings = {newLimit:Number(form.elements.limit.value),kinds:[...form.querySelectorAll('[name="kind"]:checked')].map(x=>x.value),worlds:[...form.querySelectorAll('[name="world"]:checked')].map(x=>x.value)};
    if (await transact(old => ({...old,settings}))) { resetCard(); notice('Study settings saved.'); }
  });
  root.addEventListener('keydown',event => {
    if (exploring || screen!=='study' || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    if (/^[1-4]$/.test(event.key) && revealed) { event.preventDefault(); grade(Number(event.key)); }
    else if (event.code==='Space' && current && !revealed && !/^(BUTTON|A|SUMMARY)$/.test(event.target.tagName)) { event.preventDefault(); revealed=true; paint(); focusAnswer(); }
  });
  const ticker = setInterval(() => { if (!root.isConnected) { clearInterval(ticker); store?.close(); } else if (screen==='study' && !current && !busy) paint(); },30000);
  try { store = await openStore(); await refreshHome(); }
  catch (e) { fatal=`Device storage could not open: ${e.message} No data was reset.`; paint(); }
  return {destroy() { bridge?.close?.(); disposed=true; clearInterval(ticker); store?.close(); root.remove(); }};
}
