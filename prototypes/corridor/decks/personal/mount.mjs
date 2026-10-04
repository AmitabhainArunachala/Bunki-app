import * as FSRS from '../../vendor/ts-fsrs.mjs';
import {createEngine} from './engine.mjs';
import {openStore} from './store.mjs';
import {validateCollection, parseImport, backup, safeURL, MAX_IMPORT_BYTES} from './schema.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
const labels = {meaning:'Meaning',reading:'Reading',grammar:'Grammar',apply:'Apply the idea'};
const button = (label, attrs = '', cls = '') => `<button type="button" class="${cls}" ${attrs}>${esc(label)}</button>`;
const interval = ms => ms < 3600000 ? `${Math.max(1,Math.round(ms/60000))}m` : ms < 86400000 ? `${Math.round(ms/3600000)}h` : `${Math.round(ms/86400000)}d`;
const date = ms => new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'}).format(ms) + ' JST';
const mark = (value, target) => target ? esc(value).split(esc(target)).join(`<mark>${esc(target)}</mark>`) : esc(value);

export async function mount(container, {onLeave, themes = [], currentTheme, onTheme} = {}) {
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
  let noticeTimer;
  const notice = message => {
    clearTimeout(noticeTimer); status.textContent = message;
    if (!message.startsWith('Not saved.')) noticeTimer = setTimeout(() => { status.textContent = ''; }, 5000);
  };
  const collection = () => record.collection;
  const worldFor = id => collection().worlds.find(w => w.id === id);
  const resetCard = () => { current = null; revealed = false; };
  const focusHeading = () => body.querySelector('h1')?.focus({preventScroll:true});
  function nav(next) { screen = next; pending = null; reader = null; paint(); window.scrollTo(0,0); focusHeading(); }
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
    const nextEngine = createEngine(next.collection,FSRS);
    nextEngine.validate(next.progress);
    record = next; engine = nextEngine; resetCard(); reader = null; query = ''; world = 'all'; nav('study');
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
    return `<header class="pc-top">${button('← Bunki','data-action="leave"')}<span class="pc-kicker">集中道場 · Private collections</span></header><h1 tabindex="-1">${esc(title)}</h1>`;
  }
  function tabs() {
    return `<nav aria-label="Collection">${[['study','Study'],['read','Read'],['connections','Connections'],['settings','Settings'],['home','Collections']].map(([id,label]) => button(label,`data-screen="${id}" aria-current="${screen===id?'page':'false'}"`)).join('')}</nav>`;
  }
  function preview() {
    if (!pending) return '';
    return `<section class="pc-panel pc-preview" aria-label="Import preview"><h2>Ready to import</h2><p>${esc(pending.collection.title)}</p><p>${pending.collection.lessons.length} paragraphs · ${pending.collection.lessons.length*4} focused cards · ${pending.added} additional review events</p><p>${pending.existing?'Your current collection and settings will be retained. Compatible review history can only grow.':'The collection stays on this device. Reading does not create review evidence. Choose Study when you are ready.'}</p>${button('Import on this device','data-action="confirm-import"','pc-primary')} ${button('Cancel','data-action="cancel-import"')}</section>`;
  }
  function home() {
    body.innerHTML = top('私の文脈 · Personal collections') + `<p class="pc-lead">Bring your own paragraphs into Bunki. One focused question, with room for the whole idea.</p><section class="pc-panel"><h2>Import your collection</h2><p>Choose the collection JSON saved in Files or Downloads. A Bunki backup also restores its compatible review history.</p>${button('Choose a JSON file','data-action="import"','pc-primary')}<p class="pc-small">On iPhone, install Bunki on your Home Screen first, then import inside that app. On Mac, import inside the Bunki window you use for study.</p></section>${preview()}<div class="pc-grid">${list.map(r => `<section class="pc-panel"><h2>${esc(r.collection?.title || r.id)}</h2><p>${r.collection?.lessons?.length || 0} paragraphs · ${r.progress?.events?.length || 0} preserved events</p><div class="pc-actions">${button('Open collection',`data-open="${esc(r.id)}"`)}${button('Export stored data',`data-raw="${esc(r.id)}"`)}</div></section>`).join('')}</div><p class="pc-small">Content and progress stay in Bunki’s device storage. There is no automatic cloud sync. Export before moving devices or clearing browser data; Files, iCloud Drive, or AirDrop can carry your backup.</p>${fatal?`<p role="alert">${esc(fatal)}</p>`:''}`;
  }
  function provenance(l) {
    const c = collection(), w = worldFor(l.world), thread = c.threads?.find(t => t.id === w.thread);
    return `<details class="pc-notes"><summary>Sources, conversation thread & connections</summary><p>Original composition · ${esc(l.editorialStatus)}</p>${thread?`<h3>${esc(thread.label)}</h3><ul>${thread.anchors.map(a => `<li>${esc(a)}</li>`).join('')}</ul><p>${esc(thread.basis)}</p>`:''}${l.sources.map(id => {
      const s = c.sources.find(x => x.id === id), url = safeURL(s.url);
      return `<p>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`:esc(s.title)}<br><span class="pc-small">${esc(s.scope)}</span></p>`;
    }).join('')}<div class="pc-actions">${l.connections.map(id => button(worldFor(id).en,`data-world="${esc(id)}"`)).join('')}</div></details>`;
  }
  function answer(l, kind) {
    return `<section class="pc-answer"><h3 lang="ja">${esc(l.term)} <span class="pc-reading">${l.acceptedReadings.map(esc).join(' / ')}</span></h3><p class="pc-definition">${esc(l.gloss)}</p>${kind==='apply'?`<h3>One acceptable answer</h3><p>${esc(l.conceptAnswer)}</p>`:''}<p><strong lang="ja">${esc(l.grammar)}</strong> — ${esc(l.grammarAnswer)}</p><p class="pc-translation">${esc(l.en)}</p></section>${provenance(l)}`;
  }
  function study() {
    const q = engine.queue(record.progress);
    if (!current || ![...q.due,...q.newCards].some(c => c.id === current.id)) {
      current = q.next; revealed = false; started = performance.now();
    }
    let html = `<p class="pc-small">${q.due.length} due now · ${Math.max(0,record.progress.settings.newLimit-q.startedToday)} new slots today · Japan study day</p>`;
    if (!current) {
      html += `<section class="pc-panel"><h2>Room to return</h2><p>Nothing is due right now.${q.nextAt?' Next selected review: '+esc(date(q.nextAt))+'.':''}</p><p>${q.buried} related cards resting until another study day. ${q.pausedCount} selected cards paused.</p><div class="pc-actions">${button('Read a paragraph','data-screen="read"','pc-primary')}${button('Refresh due cards','data-action="refresh"')}${button('Undo last grade','data-action="undo"')}</div></section>`;
      return html;
    }
    const l = current.lesson, kind = current.kind;
    const prompt = kind==='meaning'?`What does 「${l.term}」 mean here?`:kind==='reading'?`How do you read 「${l.term}」 here?`:kind==='grammar'?`What does 「${l.grammar}」 do in this paragraph?`:l.conceptQuestion;
    html += `<article class="pc-panel pc-card" data-card="${esc(current.id)}"><p class="pc-kicker">${esc(worldFor(l.world).en)} · ${labels[kind]} · ${q.states.has(current.id)?'Review':'New'}</p><h2>${esc(prompt)}</h2><p class="pc-small">${kind==='apply'?'Use the paragraph to reason. English or Japanese is fine.':'Recall only this task, then reveal and grade it.'}</p><p class="pc-japanese" lang="ja">${mark(l.ja,kind==='grammar'?l.grammar:kind==='apply'?'':l.term)}</p>`;
    if (revealed) {
      const waits = engine.intervals(record.progress,current.id);
      html += answer(l,kind) + `<p class="pc-small">Again = missed · Hard = recalled with difficulty · Good = recalled · Easy = effortless</p><div class="pc-controls pc-grades">${['Again','Hard','Good','Easy'].map((s,i) => `<button type="button" data-grade="${i+1}"><strong>${s}</strong><span>${interval(waits[i])}</span></button>`).join('')}</div>`;
    } else html += `<div class="pc-controls">${button('Show answer','data-action="reveal"','pc-primary pc-wide')}</div>`;
    return html + `<div class="pc-actions">${button('Undo last grade','data-action="undo"')}${button('Pause this card',`data-pause="${esc(current.id)}" data-value="true"`)}${button('Stop & read','data-screen="read"')}</div><p class="pc-small">${esc(l.title)} · Original paragraph</p></article>`;
  }
  function reading() {
    if (reader) {
      const l = engine.lessonMap.get(reader), index = collection().lessons.findIndex(x => x.id === reader), d = engine.derive(record.progress);
      return `<div class="pc-actions">${button('← All paragraphs','data-action="read-all"')}<span class="pc-small">${index+1}/${collection().lessons.length}</span></div><article class="pc-panel"><p class="pc-kicker">${esc(worldFor(l.world).en)} · Read freely</p><h2 lang="ja">${esc(l.title)}</h2><p class="pc-japanese" lang="ja">${mark(l.ja,l.term)}</p>${answer(l,'grammar')}<details class="pc-notes"><summary>Try an application</summary><p>${esc(l.conceptQuestion)}</p><details><summary>Compare one acceptable answer</summary><p>${esc(l.conceptAnswer)}</p></details></details><details class="pc-notes"><summary>Manage these four cards</summary><p>Six Again grades pause a difficult card for repair. Resume it here when ready.</p><div class="pc-actions">${engine.cards.filter(c => c.family===l.id).map(c => button(`${d.paused(c)?'Resume':'Pause'} ${labels[c.kind]}`,`data-pause="${esc(c.id)}" data-value="${!d.paused(c)}"`)).join('')}</div></details></article><div class="pc-actions">${button('Previous',`data-read="${esc(collection().lessons[(index-1+collection().lessons.length)%collection().lessons.length].id)}"`)}${button('Next paragraph',`data-read="${esc(collection().lessons[(index+1)%collection().lessons.length].id)}"`)}</div>`;
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
    return `<section class="pc-panel"><h2>Make room for your day</h2><form id="pc-settings"><label>New cards per day <input name="limit" type="number" min="0" max="60" value="${s.newLimit}" required></label><p class="pc-small">Default 6 across all selected themes and types. Due cards come first. A related card waits until another Japan study day.</p><fieldset><legend>Tasks in review</legend>${Object.entries(labels).map(([id,label]) => `<label class="pc-check"><input type="checkbox" name="kind" value="${id}" ${s.kinds.includes(id)?'checked':''}>${label}${['reading','apply'].includes(id)?' · optional':''}</label>`).join('')}</fieldset><fieldset><legend>Themes in review</legend>${collection().worlds.map(w => `<label class="pc-check"><input type="checkbox" name="world" value="${esc(w.id)}" ${s.worlds.includes(w.id)?'checked':''}>${esc(w.en)}</label>`).join('')}</fieldset><button type="submit" class="pc-primary">Save study settings</button></form></section><section class="pc-panel"><h2>iPhone ↔ Mac</h2><p>Export here, then import that file inside Bunki on the other device. Keep one device as your active study device until you transfer the latest backup.</p><div class="pc-actions">${button('Export collection & progress','data-action="export"')}${button('Share backup','data-action="share"')}${button('Import a backup','data-action="import"')}</div><p class="pc-small">${record.progress.events.length} preserved events. Older files cannot remove reviews; histories that branched on both devices stay untouched. There is no automatic iCloud sync. Progress from the standalone edition can be imported here; Anki has its own schedule.</p>${preview()}</section>${themes.length?`<section class="pc-panel"><h2>Bunki palette</h2><div class="pc-actions">${themes.map(t=>button(`${t.seal} ${t.name}`,`data-theme="${esc(t.id)}" aria-pressed="${currentTheme===t.id}"`)).join('')}</div></section>`:''}<section class="pc-panel"><h2>About this collection</h2><p>${esc(collection().scope)}</p><p>${esc(collection().level)}</p><p>${collection().lessons.length} original paragraphs · ${engine.cards.length} independently scheduled tasks. Meaning and grammar are the default; reading and application are optional.</p><p class="pc-small">FSRS-6 · ts-fsrs 5.4.1 · retention 0.90 · 1m/10m learning · 10m relearning. Each answer stays learner-graded. Views and lookups never count as mastery.</p><p class="pc-small">Private content stays on this device unless you export or share it. Browser storage can be cleared; keep backups. Native iPhone and Mac packaging is separate from this installed web app.</p></section>`;
  }
  function paint() {
    if (disposed) return;
    if (screen==='home' || !record) { home(); return; }
    body.innerHTML = top(collection().title) + tabs() + (screen==='study'?study():screen==='read'?reading():screen==='connections'?connections():settings());
  }
  async function chooseImport(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) throw new Error('This file exceeds the 30 MB import limit. Nothing was replaced.');
    const incoming = await parseImport(JSON.parse(await file.text()));
    const id = incoming.collection?.id || incoming.progress?.deck;
    const existing = await store.get(id);
    const data = incoming.collection || existing?.collection;
    if (!data) throw new Error('Import the collection JSON before its standalone progress backup.');
    await validateCollection(data);
    if (existing && existing.collection.contentDigest !== data.contentDigest) throw new Error('This is a different content edition. Keep both files; the existing collection was not changed.');
    const e = createEngine(data,FSRS), base = existing ? e.validate(existing.progress) : e.fresh(uid());
    if (!existing && incoming.progress) base.settings = e.validate(incoming.progress).settings;
    const imported = incoming.progress ? e.previewImport(base,incoming.progress) : {added:0,result:base};
    pending = {collection:data,progress:incoming.progress,existing,added:imported.added};
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
        return {id:p.collection.id,collection:old?.collection || p.collection,progress};
      });
      pending = null; await open(p.collection.id); notice('Collection saved on this device. Choose a task when ready.');
    } finally { busy = false; }
  }
  async function grade(rating) {
    if (!current || !revealed || screen!=='study' || busy) return;
    const id = current.id;
    if (await transact(old => engine.grade(old,id,rating,uid(),performance.now()-started))) {
      resetCard(); paint(); notice('Review saved.'); window.scrollTo(0,0);
      body.querySelector('[data-action="reveal"]')?.focus({preventScroll:true});
    }
  }
  root.addEventListener('click',async event => {
    const b = event.target.closest('button'); if (!b || !root.contains(b) || busy) return;
    try {
      if (b.dataset.screen) { if (b.dataset.screen==='home') await refreshHome(); else nav(b.dataset.screen); return; }
      if (b.dataset.open) { await open(b.dataset.open); return; }
      if (b.dataset.raw) { download(`${b.dataset.raw}-stored-data.json`,await store.get(b.dataset.raw)); notice('Untouched stored record exported for recovery.'); return; }
      if (b.dataset.read) { screen='read'; reader=b.dataset.read; paint(); window.scrollTo(0,0); return; }
      if (b.dataset.world) { world=b.dataset.world; query=''; nav('read'); return; }
      if (b.dataset.theme) { onTheme?.(b.dataset.theme); currentTheme=b.dataset.theme; paint(); return; }
      if (b.dataset.grade) { await grade(Number(b.dataset.grade)); return; }
      if (b.dataset.pause) {
        if (await transact(old => engine.pause(old,b.dataset.pause,b.dataset.value==='true',uid()))) { resetCard(); paint(); notice(b.dataset.value==='true'?'Card paused.':'Card resumed.'); } return;
      }
      switch (b.dataset.action) {
        case 'leave': disposed=true; clearInterval(ticker); store?.close(); onLeave?.(); break;
        case 'import': input.value=''; input.click(); break;
        case 'confirm-import': await confirmImport(); break;
        case 'cancel-import': pending=null; paint(); break;
        case 'reveal': revealed=true; paint(); body.querySelector('.pc-answer')?.scrollIntoView({block:'start'}); body.querySelector('[data-grade="3"]')?.focus({preventScroll:true}); break;
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
    if (screen!=='study' || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    if (/^[1-4]$/.test(event.key) && revealed) { event.preventDefault(); grade(Number(event.key)); }
    else if (event.code==='Space' && current && !revealed && !/^(BUTTON|A|SUMMARY)$/.test(event.target.tagName)) { event.preventDefault(); revealed=true; paint(); }
  });
  const ticker = setInterval(() => { if (!root.isConnected) { clearInterval(ticker); store?.close(); } else if (screen==='study' && !current && !busy) paint(); },30000);
  try { store = await openStore(); await refreshHome(); }
  catch (e) { fatal=`Device storage could not open: ${e.message} No data was reset.`; paint(); }
  return {destroy() { disposed=true; clearInterval(ticker); store?.close(); root.remove(); }};
}
