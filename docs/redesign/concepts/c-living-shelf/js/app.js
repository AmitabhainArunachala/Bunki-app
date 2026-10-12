/* C 生きた本棚 Living Shelf · prototype runtime (vanilla, no deps)
   Routes: #/today #/read #/read/article #/read/popup #/learn #/learn/front #/learn/back
           #/words[/w|k|p/<key>] #/me        ?theme=night  ?lang=ja                       */
(() => {
  'use strict';
  const B = window.BUNKI;
  const QS = new URLSearchParams(location.search);
  const LANG = QS.get('lang') === 'ja' ? 'ja' : 'en';
  const THEME = QS.get('theme') === 'night' ? 'night' : 'day';
  const H = document.documentElement;
  H.lang = LANG; H.dataset.theme = THEME;
  const t = (en, ja) => (LANG === 'ja' ? ja : en);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const jp = (s, cls = '') => `<span lang="ja" data-ui-content="learning"${cls ? ` class="${cls}"` : ''}>${esc(s)}</span>`;
  const fmt = n => n.toLocaleString('en-US');
  const stage = $('#stage');

  /* ------------------------------------------------------------------ data */
  const WORD = new Map();
  for (const w of B.words) if (!WORD.has(w.t)) WORD.set(w.t, w);
  const CARD = new Map(B.cards.map(c => [c.term, c]));
  const ART = new Map(B.articles.map(a => [a.id, a]));
  const DECK_EN = { n1: 'N1', n2: 'N2', senmon: t('Fields', '専門') };
  const REG_EN = { 論: ['Essay', '論'], 講: ['Lecture', '講'], 学: ['Study note', '学'], 報: ['Report', '報'], 語: ['Narrative', '語'], 話: ['Talk', '話'] };
  const reg = r => (REG_EN[r] ? t(REG_EN[r][0], REG_EN[r][1]) : '');
  const kanjiRe = /[一-鿿]/;
  // real: deck words that appear in each article
  const deckTerms = B.words.filter(w => w.t.length >= 2 && kanjiRe.test(w.t)).map(w => w.t);
  const artWords = new Map(B.articles.map(a => {
    const txt = a.paras.join('');
    return [a.id, [...new Set(deckTerms.filter(x => txt.includes(x)))]];
  }));
  const artChars = a => a.paras.join('').replace(/\s/g, '').length;
  const PARTS_EN = p => (B.parts[p] && B.parts[p].m) || (B.kanji[p] && B.kanji[p].m.toLowerCase()) || '';
  const kmean = c => ((B.kanji[c] && B.kanji[c].m) || '').toLowerCase();
  const LEAD = 'bunki-essay-n1-ise-time';
  const LEARN_CARD = '研ぐ';
  const DAY_WORD = '推進';

  /* --------------------------------------------------------------- icons */
  const ICON = {
    today: '<svg viewBox="0 0 24 24"><path d="M2 16.5h20"/><path d="M6.5 16.5a5.5 5.5 0 0 1 11 0"/><path d="M12 4.5v3M4.6 8.1l2 2M19.4 8.1l-2 2"/><path d="M5 20h14"/></svg>',
    read: '<svg viewBox="0 0 24 24"><path d="M4 4h4v16H4zM10 7h4v13h-4z"/><path d="M15.6 5.2l3.8-1 3.6 15.4-3.8.9z"/></svg>',
    learn: '<svg viewBox="0 0 24 24"><rect x="2.5" y="3.5" width="19" height="17"/><rect x="6" y="7" width="12" height="10"/><path d="M9 10.5h6M9 13.5h4"/></svg>',
    words: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><circle cx="4.5" cy="5" r="1.6"/><circle cx="19.5" cy="5.5" r="1.6"/><circle cx="18.5" cy="19.5" r="1.6"/><circle cx="4.5" cy="18" r="1.6"/><path d="M9.6 9.7 5.7 6.1M14.5 10l3.8-3.3M14.4 14.3l3 3.9M9.5 14 5.8 16.9"/></svg>',
    me: '<svg viewBox="0 0 24 24"><path d="M5 3.5h14v17H5z"/><path d="M8.5 3.5v17"/><circle cx="6.75" cy="7" r=".5"/><circle cx="6.75" cy="12" r=".5"/><circle cx="6.75" cy="17" r=".5"/><rect x="11.5" y="8" width="5" height="5"/></svg>',
  };
  const TABS = [
    ['today', 'Today', '今日'], ['read', 'Read', '読む'], ['learn', 'Learn', '学ぶ'], ['words', 'Words', '辞書'], ['me', 'Me', '私'],
  ];
  $('#tabs').innerHTML = TABS.map(([k, en, ja]) => `<a class="tab" href="#/${k}" data-go="${k}">${ICON[k]}<span>${t(en, ja)}</span></a>`).join('');
  $('#tabs').setAttribute('aria-label', t('Rooms', '部屋'));

  const spine = (en, ja, data) => `<div class="spine" aria-hidden="true"><b>${t(en, ja)}</b><i>${esc(data)}</i></div>`;
  const regs = () => '<i class="reg tl"></i><i class="reg tr"></i><i class="reg bl"></i><i class="reg br"></i>';

  /* --------------------------------------------------------------- motion */
  function spring(el, from, to, { k = 420, z = 0.82, axis = 'Y', done } = {}) {
    if (RM) { el.style.transform = `translate${axis}(${to}px)`; done && done(); return; }
    const c = 2 * Math.sqrt(k) * z; let x = from, v = 0, last = performance.now(), t0 = last;
    const step = now => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      const a = -k * (x - to) - c * v; v += a * dt; x += v * dt;
      el.style.transform = `translate${axis}(${x.toFixed(2)}px)`;
      if ((Math.abs(v) < 4 && Math.abs(x - to) < 0.5) || now - t0 > 700) { el.style.transform = `translate${axis}(${to}px)`; done && done(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // Kon match-cut: carry the same glyph/picture from one context to the next
  function matchCut(fromEl, findTarget, { dur = 280, kind = 'text' } = {}) {
    if (!fromEl) return;
    const r0 = fromEl.getBoundingClientRect();
    const clone = fromEl.cloneNode(true);
    const cs = getComputedStyle(fromEl);
    clone.classList.add('cut');
    [clone, ...clone.querySelectorAll('*')].forEach(n => { n.style.animation = 'none'; });
    Object.assign(clone.style, { left: r0.left + 'px', top: r0.top + 'px', width: r0.width + 'px', height: r0.height + 'px', margin: 0,
      font: cs.font, color: cs.color, letterSpacing: cs.letterSpacing, lineHeight: r0.height + 'px', whiteSpace: 'nowrap' });
    if (kind === 'pic') clone.style.overflow = 'hidden';
    return () => {
      const target = findTarget();
      if (!target || RM) return;
      const r1 = target.getBoundingClientRect();
      document.body.appendChild(clone);
      target.style.opacity = 0;
      const sx = r1.width / r0.width, sy = kind === 'pic' ? r1.height / r0.height : sx;
      const dx = r1.left - r0.left, dy = r1.top - r0.top + (kind === 'pic' ? 0 : (r1.height - r0.height * sy) / 2);
      const an = clone.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: 1 }],
        { duration: dur, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
      an.onfinish = () => { target.style.transition = 'opacity 90ms'; target.style.opacity = ''; setTimeout(() => clone.remove(), 90); };
    };
  }

  /* --------------------------------------------------------------- router */
  let silent = false, lastRoom = null;
  const memory = { articleScroll: 0, articleToken: null, trail: [] };
  function go(hash, { quiet = false } = {}) { if (quiet) silent = true; location.hash = hash; }
  addEventListener('hashchange', () => { if (silent) { silent = false; return; } render(); });

  function render() {
    const path = (location.hash.replace(/^#\/?/, '') || 'today').split('/').map(decodeURIComponent);
    const room = ['today', 'read', 'learn', 'words', 'me'].includes(path[0]) ? path[0] : 'today';
    H.dataset.room = room;
    $$('.tab').forEach(a => (a.dataset.go === room ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    closeSheet(true);
    stopVoice();
    const view = { today: Today, read: Read, learn: Learn, words: Words, me: Me }[room];
    stage.classList.remove('enter'); void stage.offsetWidth;
    stage.innerHTML = view(path.slice(1));
    stage.classList.add('enter');
    stage.scrollTop = 0;
    lastRoom = room;
    while (afterRender.length) afterRender.shift()();
    document.title = `Bunki · ${t(TABS.find(x => x[0] === room)[1], TABS.find(x => x[0] === room)[2])}`;
  }
  const afterRender = [];
  const after = fn => afterRender.push(fn);

  /* ================================================================ TODAY */
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function Today() {
    const dw = WORD.get(DAY_WORD);
    const shared = sharedPart(dw.k);
    const lead = ART.get(LEAD);
    const ticks = Array.from({ length: 12 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    after(placeSky);
    return `<section class="room today">
      <div class="sky" aria-label="${t('Your words', 'あなたのことば')}"><div class="dawn"></div>${cityHTML()}</div>
      <header class="head" data-l="1">
        <div class="eyebrow">${t('Thursday · 8 Oct 2026', '2026年10月8日（木）')}</div>
        <h1 class="title">${t('Today', '今日')}</h1>
        ${spine('Today', '今日', '10·08')}
      </header>
      <a class="dayword" href="#/words/w/${encodeURIComponent(DAY_WORD)}" data-l="2">
        <span class="dw-label">${t("Today's word", '今日のことば')}</span>
        <span class="dw-glyph" lang="ja" data-ui-content="learning">${[...DAY_WORD].map(c => `<span class="dw-k">${c}</span>`).join('')}</span>
        <span class="dw-r" lang="ja" data-ui-content="learning">${esc(dw.r)}</span>
        <span class="dw-hook">${shared ? t(`A small bird, ${jp(shared, 'pk')}, hides inside both kanji.`, `二つの漢字に、同じ鳥 ${jp(shared, 'pk')} が隠れている。`) : ''}</span>
        <span class="dw-go">${t('Follow the bird', '鳥をたどる')} <i class="arrow"></i></span>
      </a>
      <div class="ritual" data-l="3">
        ${regs()}
        <ol class="line">
          <li class="stop now"><b class="num">12</b><span>${t('cards', '枚のカード')}</span></li>
          <li class="stop"><b class="num">1</b><span>${t('article', '本の記事')}</span></li>
          <li class="stop"><b class="num">1</b><span>${t('question', 'つの問い')}</span></li>
        </ol>
        <div class="train" aria-hidden="true">${ticks}</div>
        <div class="ritual-row">
          <a class="btn btn-primary btn-wide" href="#/learn/front" data-press>${t('Begin today', '今日をはじめる')} <span class="data">${t('12 cards · 6 min', '12枚・6分')}</span></a>
        </div>
        <p class="then">${t('Then', 'つづいて')} <span lang="ja" data-ui-content="learning">${esc(lead.title.split('――')[1] || lead.title)}</span> · <span class="data">${t(`${artWords.get(LEAD).length} of your words`, `あなたの語 ${artWords.get(LEAD).length}`)}</span></p>
      </div>
    </section>`;
  }
  // a horizon of roofs; by night every window is lit (the city through the paper)
  function cityHTML() {
    const r = rng(9); let roofs = '', wins = '';
    let x = 0;
    while (x < 400) {
      const w = 14 + Math.floor(r() * 26), h = 10 + Math.floor(r() * (x > 140 && x < 260 ? 18 : 40));
      roofs += `<rect x="${x}" y="${80 - h}" width="${w - 1}" height="${h}"/>`;
      for (let wy = 80 - h + 4; wy < 78; wy += 5) for (let wx = x + 3; wx < x + w - 4; wx += 4) if (r() > .62) wins += `<rect x="${wx}" y="${wy}" width="1.6" height="2"/>`;
      x += w;
    }
    return `<svg class="city" viewBox="0 0 400 80" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><g class="roofs">${roofs}</g><g class="wins">${wins}</g><path class="hz" d="M0 79.5H400"/></svg>`;
  }
  function placeSky() {
    const room = $('.room.today'); if (!room) return;
    const sky = $('.sky', room);
    const R = room.getBoundingClientRect();
    const W = R.width, Hh = Math.max(560, $('.ritual', room).offsetTop - 10);
    const rel = el => { const b = el.getBoundingClientRect(); return { x: b.left - R.left - 10, y: b.top - R.top - 8, w: b.width + 20, h: b.height + 16 }; };
    const boxes = [rel($('.title', room)), rel($('.eyebrow', room)), rel($('.spine', room)), rel($('.dw-glyph', room)), rel($('.dw-label', room)), rel($('.dw-hook', room)), rel($('.dw-go', room)), rel($('.dw-r', room))];
    const due = B.cards.map(c => c.term).filter(x => x !== DAY_WORD);
    const pool = B.words.filter(w => w.d !== 'n2' && w.t.length >= 2 && w.t.length <= 4 && /^[\u4e00-\u9fff]+$/.test(w.t));
    const r = rng(20261008);
    const list = [...due.map(w => ({ w, due: true })), ...Array.from({ length: 70 }, () => ({ w: pool[Math.floor(r() * pool.length)].t, due: false }))];
    const placed = [];
    list.forEach((it, i) => {
      const layer = it.due ? 2 + (i % 2) : (r() < .62 ? 1 : 2);
      const size = it.due ? (layer === 3 ? 21 : 18) : (layer === 1 ? 12 + Math.floor(r() * 2) : 15);
      const bw = [...it.w].length * size + 8, bh = size + 10;
      for (let k = 0; k < 80; k++) {
        const x = 8 + r() * (W - 16 - bw), y = 12 + r() * (Hh - 24 - bh);
        const b = { x, y, w: bw, h: bh };
        if ([...boxes, ...placed].some(o => !(b.x + b.w < o.x || o.x + o.w < b.x || b.y + b.h < o.y || o.y + o.h < b.y))) continue;
        placed.push({ ...b, ...it, layer, size, i }); break;
      }
    });
    sky.insertAdjacentHTML('afterbegin', [1, 2, 3].map(L => `<div class="sky-layer ambient" data-depth="${L}">${placed.filter(p => p.layer === L).map(p =>
      `<button class="star${p.due ? ' due' : ''}" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px;font-size:${p.size}px;--d:${(p.i % 7) * 0.9}s" data-word="${esc(p.w)}" lang="ja" data-ui-content="learning" aria-label="${esc(p.w)}">${esc(p.w)}</button>`).join('')}</div>`).join(''));
  }
  function sharedPart(ks) {
    if (!ks || ks.length < 2) return null;
    const lists = ks.map(c => (B.kanji[c] ? B.kanji[c].p : []));
    return lists[0].find(p => p !== '亻' && lists.slice(1).every(l => l.includes(p))) || null;
  }

  /* ================================================================= READ */
  function Read(sub) {
    if (sub[0] === 'article' || sub[0] === 'popup') return Article(sub[0] === 'popup' ? LEAD : (sub[1] || LEAD), sub[0] === 'popup');
    const lead = ART.get(LEAD);
    const rest = B.articles.filter(a => a.id !== LEAD);
    const level = a => a.level || t('Lit.', '文学');
    const spines = rest.map((a, i) => `<a class="book ambient" href="#/read/article/${a.id}" style="--d:${i * 1.3}s;--h:${Math.round(232 + Math.min(artChars(a), 2600) / 2600 * 70)}px" data-cut-pic>
        <span class="book-pic"><img src="/${a.picture600}" alt="" loading="eager"></span>
        <span class="book-title" lang="ja" data-ui-content="learning">${esc(a.title.replace(/[『』「」]/g, ''))}</span>
        <span class="book-foot"><em class="seal">${esc(level(a))}</em><span class="data">${artWords.get(a.id).length}</span></span>
      </a>`).join('');
    return `<section class="room read">
      <header class="head" data-l="1">
        <div class="eyebrow">${t('The shelf · Thu 8 Oct', '本棚・10月8日')}</div>
        <h1 class="title">${t('Read', '読む')}</h1>
        <button class="filter" aria-label="${t('Filter: N1, all topics', '絞り込み：N1・すべての分野')}"><span>${t('N1 · All topics', 'N1・すべて')}</span><i class="chev"></i></button>
        ${spine('Read', '読む', '06')}
      </header>
      <a class="lead" href="#/read/article/${LEAD}" data-l="2" data-cut-pic>
        <figure class="lead-pic"><span class="pic-wrap ambient"><img src="/${lead.picture}" alt="${t('Woodblock: a shrine in a cedar forest', '木版画：杉木立の社')}"></span><span class="rain"></span>${regs()}</figure>
        <div class="lead-text">
          <div class="kicker"><em class="seal">N1</em><span>${t('Essay', '随筆')}</span><span class="dot"></span><span class="data">${fmt(artChars(lead))} ${t('chars', '字')} · 4 ${t('min', '分')}</span><span class="voice-chip">${t('Voiced', '音声つき')}</span></div>
          <h2 lang="ja" data-ui-content="learning">${esc(lead.title)}</h2>
          <p class="why">${t(`Holds <b class="num">${artWords.get(LEAD).length}</b> words from your decks, including ${jp('反復')} from your Fields deck.`, `あなたのデッキの語を <b class="num">${artWords.get(LEAD).length}</b> 含む。専門デッキの ${jp('反復')} も。`)}</p>
        </div>
      </a>
      <div class="shelf-head" data-l="3"><span class="eyebrow">${t('On the shelf', '棚に')}</span><span class="data">${t('ranked by your words', 'あなたの語の多い順')}</span></div>
      <div class="shelf" data-l="3">${spines}</div>
      <div class="ledge" data-l="3"></div>
    </section>`;
  }

  function tokensHTML(a) {
    const toks = a.tokens_sample || [];
    const p0 = a.paras[0];
    const paras = []; let cur = [], pos = 0, covered = 0, para = 0;
    const punct = /^[。、」』）！？・]+$/;
    toks.forEach((tk, i) => {
      const inner = tk.f.map(f => (f.r && kanjiRe.test(f.t) ? `<ruby>${esc(f.t)}<rt>${esc(f.r)}</rt></ruby>` : esc(f.t))).join('');
      const deck = WORD.has(tk.b) && tk.b.length > 1 ? ' known' : '';
      const html = tk.c ? `<span class="w${deck}" data-b="${esc(tk.b)}" data-i="${i}" role="button" tabindex="0">${inner}</span>` : inner;
      // kinsoku: closing punctuation never starts a line, so it travels with the word before it
      if (punct.test(tk.s) && cur.length) cur[cur.length - 1] = `<span class="kin">${cur[cur.length - 1]}${html}</span>`;
      else cur.push(html);
      pos += tk.s.length; covered += tk.s.length;
      if (para === 0 && pos >= p0.length) { paras.push(cur.join('')); cur = []; para = 1; }
    });
    const p1 = a.paras[1] || '';
    paras.push(cur.join('') + esc(p1.slice(Math.max(0, covered - p0.length))));
    for (let i = 2; i < a.paras.length; i++) paras.push(esc(a.paras[i]));
    return paras.map((p, i) => `<p data-p="${i}">${p}</p>`).join('');
  }

  function Article(id, popup) {
    const a = ART.get(id) || ART.get(LEAD);
    const n = artWords.get(a.id).length;
    after(() => { bindArticle(a); if (popup) setTimeout(() => { const w = $('.w[data-b="反復"]'); if (w) openWord('反復', w, { instant: false }); }, 60); });
    const tok = a.tokens_sample && a.tokens_sample.length;
    return `<article class="room article">
      <figure class="hero" data-l="1"><span class="hero-pic"><img src="/${a.picture}" alt="" id="hero-img"></span><span class="rain"></span><span class="mist"></span>
        <a class="back" href="#/read" aria-label="${t('Back to the shelf', '本棚へ戻る')}"><i class="chev l"></i></a>
        ${spine('Read', '読む', a.level || '—')}
      </figure>
      <header class="a-head" data-l="2">
        <div class="kicker"><em class="seal">${esc(a.level || t('Lit.', '文学'))}</em><span>${t(a.id.startsWith('aozora') ? 'Aozora Bunko' : 'Essay · Bunki original', a.id.startsWith('aozora') ? '青空文庫' : '随筆・Bunki')}</span></div>
        <h1 lang="ja" data-ui-content="learning">${esc(a.title)}</h1>
        <div class="meta data"><span>${fmt(artChars(a))} ${t('chars', '字')}</span><span>4 ${t('min', '分')}</span><span>${n} ${t('of your words', 'あなたの語')}</span></div>
      </header>
      <div class="text" lang="ja" data-ui-content="learning" data-l="3">${tok ? tokensHTML(a) : a.paras.map(p => `<p>${esc(p)}</p>`).join('')}</div>
      <div class="credit data">${esc(a.licence || '')} · ${t('Illustration: Bunki', '挿絵：Bunki')}</div>
      <div class="voice" data-l="3">
        <button class="play" aria-label="${t('Play the voice', '音声を再生')}"><i></i></button>
        <div class="v-mid"><div class="v-top"><span class="v-name">${t('Kore reads', '朗読 Kore')}</span><span class="data v-time">0:12 / 4:08</span></div><div class="v-bar"><i></i></div></div>
        <button class="v-speed data" aria-label="${t('Speed 1.0x', '速度 1.0倍')}">1.0×</button>
      </div>
    </article>`;
  }

  let voiceTimer = null;
  function stopVoice() { clearInterval(voiceTimer); voiceTimer = null; }
  function bindArticle(a) {
    const img = $('#hero-img'), pic = $('.hero-pic');
    const mist = $('.mist');
    const onScroll = () => {
      const y = stage.scrollTop;
      if (pic && !RM) pic.style.transform = `translateY(${(y * 0.42).toFixed(1)}px) scale(${(1 + Math.min(y, 300) * 0.0004).toFixed(4)})`;
      if (mist && !RM) mist.style.transform = `translateY(${(y * 0.18).toFixed(1)}px)`;
    };
    stage.onscroll = onScroll; onScroll();
    // the voice line: one signal word at a time
    const words = $$('.text .w');
    let vi = Math.min(3, words.length - 1);
    const lightUp = () => { words.forEach(w => w.classList.remove('spoken')); words[vi] && words[vi].classList.add('spoken'); };
    lightUp();
    $('.play').onclick = e => {
      const b = e.currentTarget; b.classList.toggle('on');
      if (voiceTimer) return stopVoice();
      voiceTimer = setInterval(() => { vi = (vi + 1) % words.length; lightUp(); }, 380);
    };
    $('.text').addEventListener('click', e => {
      const w = e.target.closest('.w'); if (!w) return;
      memory.articleScroll = stage.scrollTop; memory.articleToken = w.dataset.i; memory.articleId = a.id;
      openWord(w.dataset.b, w);
    });
    if (memory.returning && memory.articleId === a.id) {
      memory.returning = false;
      requestAnimationFrame(() => {
        stage.scrollTop = memory.articleScroll;
        const w = $(`.w[data-i="${memory.articleToken}"]`);
        if (w) { w.classList.add('glint'); setTimeout(() => w.classList.remove('glint'), 1400); }
      });
    }
  }

  /* -------------------------------------------------------- the word sheet */
  function sheetHTML(term, tok) {
    const w = WORD.get(term) || { t: term, r: '', m: '', k: [...term].filter(c => kanjiRe.test(c)) };
    const ks = (w.k || []).filter(c => B.kanji[c]);
    const pass = (B.passages[term] || []).slice(0, 2);
    const fam = B.words.filter(x => x.t !== term && x.k.some(c => ks.includes(c))).slice(0, 5);
    return `<div class="grab"></div>
      <div class="ws">
        <div class="ws-head">
          <div><div class="ws-r" lang="ja" data-ui-content="learning">${esc(w.r)}</div><div class="ws-t ink-in" lang="ja" data-ui-content="learning" data-cut-src>${esc(w.t)}</div></div>
          <div class="ws-tags">${w.d ? `<em class="seal">${DECK_EN[w.d]}</em>` : ''}<span class="data">${esc(posEn(w.pos))}</span></div>
        </div>
        <p class="ws-m">${esc(w.m || t('Not in your decks yet', 'まだデッキにない語'))}</p>
        ${w.dj ? `<p class="ws-dj" lang="ja" data-ui-content="learning">${esc(w.dj)}</p>` : ''}
        <div class="ws-k">${ks.map(c => {
          const k = B.kanji[c];
          return `<div class="kt"><a class="kt-glyph" href="#/words/k/${encodeURIComponent(c)}" data-k="${esc(c)}" aria-label="${t('Open kanji', '漢字をひらく')} ${esc(c)}" data-ui-content-value="${esc(c)}"><span lang="ja" data-ui-content="learning">${c}</span></a>
            <div class="kt-info"><div class="kt-m">${esc(kmean(c))} <span class="data">${k.st} ${t('strokes', '画')}</span></div>
            <div class="kt-parts">${k.p.slice(0, 3).map(p => `<a class="pchip" href="#/words/p/${encodeURIComponent(p)}" data-p="${esc(p)}" data-ui-content-value="${esc(p)}"><span lang="ja" data-ui-content="learning">${esc(p)}</span><small>${esc(PARTS_EN(p))}</small></a>`).join('')}</div></div></div>`;
        }).join('')}</div>
        ${pass.length ? `<div class="ws-sec"><span class="eyebrow">${t('Also in your cards', 'ほかのカードでも')}</span>${pass.map(p => `<p class="ws-pass" lang="ja" data-ui-content="learning">${hl(p.s, term)}</p>`).join('')}</div>` : ''}
        ${fam.length ? `<div class="ws-sec"><span class="eyebrow">${t('Family', '仲間')}</span><div class="ws-fam">${fam.map(x => `<a href="#/words/w/${encodeURIComponent(x.t)}" lang="ja" data-ui-content="learning">${esc(x.t)}</a>`).join('')}</div></div>` : ''}
        <div class="ws-act"><button class="btn btn-primary save" data-press>${t('Save to my cards', '覚える')}</button><a class="btn btn-ghost" href="#/words/w/${encodeURIComponent(w.t)}" data-k="${esc(w.t)}">${t('Open the web', '網をひらく')}</a></div>
      </div>`;
  }
  const posEn = p => ({ noun: t('noun', '名詞'), verb: t('verb', '動詞'), expression: t('expression', '表現'), adjective: t('adjective', '形容詞') }[p] || (p ? esc(p) : ''));
  const hl = (s, term) => esc(s).split(esc(term)).join(`<b>${esc(term)}</b>`);

  function openWord(term, fromEl, { instant } = {}) {
    closeSheet(true);
    const app = $('#app');
    const scrim = document.createElement('div'); scrim.className = 'scrim';
    const sheet = document.createElement('div'); sheet.className = 'sheet'; sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', t('Word', '語'));
    sheet.innerHTML = sheetHTML(term);
    app.append(scrim, sheet);
    $$('.w.lit').forEach(x => x.classList.remove('lit'));
    if (fromEl) { fromEl.classList.add('lit'); $('.text') && $('.text').classList.add('dim'); }
    $$('.w.spoken').forEach(x => x.classList.add('mute'));
    requestAnimationFrame(() => scrim.classList.add('on'));
    const hgt = sheet.getBoundingClientRect().height;
    sheet.style.transform = `translateY(${hgt}px)`;
    spring(sheet, hgt, 0, { k: 460, z: 0.86 });
    scrim.onclick = () => closeSheet();
    sheet.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#/words"]');
      if (a) {
        e.preventDefault();
        memory.returning = false;
        const glyph = a.querySelector('span') || a;
        const play = matchCut(glyph, () => $('.centre .c-glyph'), { dur: 280 });
        closeSheet(true); go(a.getAttribute('href')); setTimeout(() => {}, 0);
        after(play);
        return;
      }
      if (e.target.closest('.save')) {
        const b = e.target.closest('.save'); b.classList.add('saved'); b.textContent = t('Saved · first card tomorrow', '保存済・明日から');
      }
    });
  }
  function closeSheet(now) {
    const s = $('.sheet'), sc = $('.scrim');
    $$('.w.lit').forEach(x => x.classList.remove('lit'));
    $$('.w.mute').forEach(x => x.classList.remove('mute'));
    $('.text.dim') && $('.text.dim').classList.remove('dim');
    if (!s) return;
    if (now) { s.remove(); sc && sc.remove(); return; }
    sc && sc.classList.remove('on');
    spring(s, 0, s.getBoundingClientRect().height, { k: 520, z: 1, done: () => { s.remove(); sc && sc.remove(); } });
  }

  /* ================================================================ LEARN */
  function Learn(sub) {
    if (sub[0] === 'front' || sub[0] === 'back') return CardView(sub[0] === 'back');
    if (sub[0] === 'done') return Done();
    const decks = [
      ['n1', t('N1 passages', 'N1 文章カード'), 666, 8, 5],
      ['n2', t('N2 passages', 'N2 文章カード'), 358, 3, 0],
      ['senmon', t('Your fields', '専門'), 976, 1, 2],
    ];
    const fan = ['研ぐ', '推進', '辛抱'].map((k, i) => {
      const c = CARD.get(k);
      return `<div class="fan-card f${i}"><span lang="ja" data-ui-content="learning">${esc(c.card.ja.slice(0, 34))}…</span></div>`;
    }).join('');
    return `<section class="room learn">
      <div class="proscenium" data-l="1">
        <header class="head">
          <div class="eyebrow">${t('Learn · tonight', '学ぶ・今夜')}</div>
          <h1 class="title">${t('The stage', '舞台')}</h1>
          ${spine('Learn', '学ぶ', '12')}
        </header>
        <div class="fan ambient">${fan}<div class="spot"></div></div>
        <div class="stage-row">
          <div class="due"><b class="num">12</b><span>${t('cards due', '枚が今日')}</span></div>
          <div class="due-split data">N1 8 · N2 3 · ${t('Fields', '専門')} 1<br>${t('about 6 min', '約6分')}</div>
        </div>
        <a class="btn btn-primary btn-wide" href="#/learn/front" data-press>${t('Review 12 cards', '12枚を復習する')}</a>
      </div>
      <div class="sections">
        <section class="sec" data-l="2"><div class="sec-n data">01</div><div class="sec-b">
          <h2>${t('Decks', 'デッキ')}</h2>
          ${decks.map(([id, name, n, due, nw]) => `<a class="deck" href="#/learn/front"><span class="d-name">${name}</span><span class="d-n data">${fmt(n)} ${t('words', '語')}</span><span class="d-due"><b class="num">${due}</b> ${t('due', '復習')}</span><span class="d-new"><b class="num">${nw}</b> ${t('new', '新')}</span><i class="chev"></i></a>`).join('')}
        </div></section>
        <section class="sec" data-l="2"><div class="sec-n data">02</div><div class="sec-b">
          <h2>${t('Focus sitting', '集中の座')}</h2>
          <p>${t('Twenty quiet minutes. The tabs and counts fall away; only the card and your breath.', '二十分の静けさ。タブも数字も消え、カードと呼吸だけが残る。')}</p>
          <button class="btn btn-ghost">${t('Sit for 20 minutes', '20分座る')}</button>
        </div></section>
        <section class="sec" data-l="3"><div class="sec-n data">03</div><div class="sec-b">
          <h2>${t('Tests', '試験')}</h2>
          <p>${t('N1 mock in the real format. Every wrong option explained.', '本番形式のN1模試。すべての誤答に解説。')}</p>
          <div class="mock">${[[t('Short', '短'), '15'], [t('Half', '半'), '55'], [t('Full', '本番'), '165']].map(([n, m]) => `<button class="m-opt"><b>${n}</b><span class="data">${m} ${t('min', '分')}</span></button>`).join('')}</div>
        </div></section>
        <section class="sec" data-l="3"><div class="sec-n data">04</div><div class="sec-b">
          <h2>${t('Guided path', '道しるべ')}</h2>
          <a class="deck" href="#/learn/front"><span class="d-name">${t('Grammar inside passages', '文章の中の文法')}</span><span class="d-n data">${t('lesson 5 of 24', '第5課／24')}</span><i class="chev"></i></a>
        </div></section>
      </div>
    </section>`;
  }

  // the session ends on a cleared surface and one visible next door (Dōgen; the pull)
  function Done() {
    const kept = B.cards.map(c => c.term);
    const again = ['しめた', '目下'];
    const lead = ART.get(LEAD);
    const inLead = kept.filter(k => lead.paras.join('').includes(k));
    return `<section class="room finish">
      <div class="rise" aria-hidden="true">${kept.map((k, i) => `<span class="up${again.includes(k) ? ' again' : ''}" lang="ja" style="--i:${i};left:${5 + (i % 3) * 32 + (Math.floor(i / 3) % 2) * 8}%;top:${Math.floor(i / 3) * 24}%">${esc(k)}</span>`).join('')}</div>
      <header class="head" data-l="1"><div class="eyebrow">${t('Session complete', 'おわり')}</div>
        <h1 class="title">${t('The surface is clear.', '机の上は、空になった。')}</h1>
        ${spine('Learn', '学ぶ', '12/12')}</header>
      <dl class="tally" data-l="2">
        <div><dt>${t('Kept', '覚えた')}</dt><dd class="num">10</dd></div>
        <div><dt>${t('Again', 'もう一度')}</dt><dd class="num">2</dd></div>
        <div><dt>${t('Time', '時間')}</dt><dd class="num">6:12</dd></div>
      </dl>
      <p class="again-line" data-l="2">${t('Coming back in ten minutes, in new sentences:', '十分後、新しい文で戻ってくる：')} ${again.map(a => jp(a, 'ag')).join('・')}</p>
      <a class="door" href="#/read/article/${LEAD}" data-l="3">
        <span class="door-pic"><img src="/${lead.picture600}" alt=""></span>
        <span class="door-t"><span class="eyebrow">${t('Next door', '次の扉')}</span>
          <b lang="ja" data-ui-content="learning">${esc(lead.title.split('――')[1])}</b>
          <span>${t(`Holds ${artWords.get(LEAD).length} of your words. Kore reads it in 4 min.`, `あなたの語を${artWords.get(LEAD).length}含む。Kore の朗読で4分。`)}</span></span>
      </a>
      <a class="btn btn-primary btn-wide go-read" href="#/read/article/${LEAD}" data-l="3" data-press>${t('Read it now', '今すぐ読む')}</a>
      <p class="tomorrow data" data-l="3">${t('Tomorrow · 9 cards · first', '明日・9枚・最初は')} <span lang="ja" class="half">推敲</span></p>
    </section>`;
  }

  let cardIdx = 0;
  function rubyHTML(ruby, showRt) {
    let out = '', inT = false, n = 0;
    ruby.forEach(([txt, rd, tg]) => {
      const seg = showRt && rd && kanjiRe.test(txt) ? `<ruby>${esc(txt)}<rt style="--i:${n++}">${esc(rd)}</rt></ruby>` : esc(txt);
      if (tg && !inT) { out += '<mark class="tgt">'; inT = true; }
      if (!tg && inT) { out += '</mark>'; inT = false; }
      out += seg;
    });
    if (inT) out += '</mark>';
    return out;
  }
  function CardView(back) {
    const c = CARD.get(LEARN_CARD);
    const k = c.kanji.map(x => x.c);
    after(() => bindCard(c, back));
    const ticks = Array.from({ length: 12 }, (_, i) => `<i class="${i < 2 ? 'done' : i === 2 ? 'now' : ''}"></i>`).join('');
    const sib = B.words.filter(x => x.t !== c.term && x.k.some(ch => k.includes(ch))).slice(0, 3);
    const grades = [['again', t('Again', '再'), t('<1m', '1分'), '再'], ['hard', t('Hard', '難'), t('6m', '6分'), '難'], ['good', t('Good', '良'), t('1d', '1日'), '良'], ['easy', t('Easy', '易'), t('4d', '4日'), '易']];
    return `<section class="room card-room ${back ? 'is-back' : 'is-front'}">
      <div class="frame">
        <div class="frame-top" data-l="1">
          <a class="x" href="#/learn" aria-label="${t('End session', 'セッションを終える')}"><i></i></a>
          <div class="prog"><div class="ticks">${ticks}</div><span class="data">3 / 12</span></div>
          <span class="deckname data">N1 · ${esc(reg(c.card.register))}</span>
        </div>
        <div class="card registered-not" data-l="2">
          ${regs()}
          <div class="card-meta data">${t('Recall the marked word', '印の語を思い出す')}</div>
          <div class="passage" lang="ja" data-ui-content="learning">
            <div class="p-front" ${back ? 'hidden' : ''}>${rubyHTML(c.card.ruby, false)}</div>
            ${back ? `<div class="p-back">${rubyHTML(c.card.ruby, true)}</div>` : ''}
          </div>
          ${back ? answerHTML(c, sib) : `<div class="card-foot data"><span>${c.card.ja.length} ${t('chars', '字')}</span><span>${t('Bunki original', 'Bunki 書き下ろし')}</span><span>${t('seen 3×', '3回目')}</span></div>`}
        </div>
        <div class="dock" data-l="3">
          ${back ? `<div class="grades">${grades.map(([id, label, iv, seal]) => `<button class="grade g-${id}" data-g="${id}"><b class="${LANG === 'ja' ? 'kt-seal' : ''}">${label}</b><span class="data">${iv}</span></button>`).join('')}</div>`
            : `<button class="btn btn-primary btn-wide reveal" data-press>${t('Reveal', '答えを見る')}</button>`}
        </div>
      </div>
    </section>`;
  }
  function answerHTML(c, sib) {
    return `<div class="answer">
      <div class="a-row"><div class="a-word"><span class="a-r" lang="ja" data-ui-content="learning">${esc(c.reading)}</span><span class="a-t" lang="ja" data-ui-content="learning">${esc(c.term)}</span></div>
        <span class="a-pos data">${esc(posEn(c.pos))}</span></div>
      <p class="a-dj" lang="ja" data-ui-content="learning">${esc(c.defJa)}</p>
      <button class="en-toggle" aria-expanded="false"><span class="en-label">${t('Show English', '英語を見る')}</span><span class="en-text">${esc(c.meaning)}</span></button>
      <div class="a-k">${c.kanji.map(k => `<a class="ak" href="#/words/k/${encodeURIComponent(k.c)}" data-ui-content-value="${esc(k.c)}"><span class="ak-g" lang="ja" data-ui-content="learning">${k.c}</span><span class="ak-m">${esc(k.m)} <span class="data">${k.st}${t('', '画')}</span></span></a>
        <span class="ak-eq">=</span>${k.parts.slice(0, 2).map(p => `<a class="pchip" href="#/words/p/${encodeURIComponent(p)}" data-ui-content-value="${esc(p)}"><span lang="ja" data-ui-content="learning">${esc(p)}</span><small>${esc(PARTS_EN(p))}</small></a>`).join('<span class="ak-eq">+</span>')}`).join('')}</div>
      <div class="a-sib"><span class="eyebrow">${t('Same kanji', '同じ漢字')}</span>${sib.map(x => `<a href="#/words/w/${encodeURIComponent(x.t)}" lang="ja" data-ui-content="learning">${esc(x.t)}</a>`).join('')}</div>
    </div>`;
  }
  function bindCard(c, back) {
    const rv = $('.reveal');
    if (rv) rv.onclick = () => {
      // the reveal: a held frame (間), then furigana rise as ink, then the answer plate
      const card = $('.card');
      rv.classList.add('pressed');
      go('#/learn/back', { quiet: true });
      const sib = B.words.filter(x => x.t !== c.term && x.k.some(ch => c.kanji.map(k => k.c).includes(ch))).slice(0, 3);
      setTimeout(() => {
        $('.room.card-room').classList.replace('is-front', 'is-back');
        $('.p-front').hidden = true;
        $('.card-foot') && $('.card-foot').remove();
        $('.passage').insertAdjacentHTML('beforeend', `<div class="p-back">${rubyHTML(c.card.ruby, true)}</div>`);
        card.insertAdjacentHTML('beforeend', answerHTML(c, sib));
        $('.dock').innerHTML = `<div class="grades">${[['again', t('Again', '再'), t('<1m', '1分')], ['hard', t('Hard', '難'), t('6m', '6分')], ['good', t('Good', '良'), t('1d', '1日')], ['easy', t('Easy', '易'), t('4d', '4日')]].map(([id, l, iv]) => `<button class="grade g-${id}" data-g="${id}"><b class="${LANG === 'ja' ? 'kt-seal' : ''}">${l}</b><span class="data">${iv}</span></button>`).join('')}</div>`;
        bindBack();
      }, RM ? 0 : 90);
    };
    if (back) bindBack();
  }
  function bindBack() {
    const en = $('.en-toggle');
    if (en) en.onclick = () => { en.classList.toggle('open'); en.setAttribute('aria-expanded', en.classList.contains('open')); };
    $$('.grade').forEach(g => g.onclick = () => {
      const card = $('.card'); card.classList.add('registered'); g.classList.add('chosen');
      setTimeout(() => { cardIdx++; go('#/learn/done'); }, 260);
    });
  }

  /* ================================================================ WORDS */
  function nodeFor(type, key) {
    if (type === 'w') { const w = WORD.get(key); return { type, key, glyph: key, r: w ? w.r : '', m: w ? w.m : '' }; }
    if (type === 'k') { const k = B.kanji[key]; return { type, key, glyph: key, r: k ? (k.on[0] || '') : '', m: kmean(key) }; }
    return { type, key, glyph: key, r: (B.parts[key] || {}).n || '', m: PARTS_EN(key) };
  }
  function articleSentences(key, n = 1) {
    const out = [];
    for (const a of B.articles) {
      a.paras.forEach((p, pi) => p.split(/(?<=。)/).forEach(s => { if (out.length < n && s.includes(key) && s.length < 80) out.push({ a, pi, s }); }));
    }
    return out;
  }
  function webModel(type, key) {
    const nodes = [], marks = [];
    const W = (stage.clientWidth || 390) - 24;
    const cx = W / 2, cy = 196;
    const P = (ang, rx, ry = rx) => [cx + rx * Math.cos(ang * Math.PI / 180), cy + ry * Math.sin(ang * Math.PI / 180)];
    const spread = (n, a, b) => (n === 1 ? [(a + b) / 2] : Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1)));
    let strokes = 0;
    if (type === 'w') {
      const w = WORD.get(key) || { t: key, k: [...key].filter(c => B.kanji[c]), r: '', m: '' };
      const ks = w.k.filter(c => B.kanji[c]);
      const sp = sharedPart(ks);
      const kAng = spread(ks.length, ks.length > 2 ? -150 : -128, ks.length > 2 ? -30 : -52);
      const partPos = {};
      ks.forEach((c, i) => {
        const pos = P(kAng[i], 96);
        strokes += B.kanji[c].st || 0;
        nodes.push({ type: 'k', key: c, x: pos[0], y: pos[1], from: [cx, cy], label: c, cap: kmean(c) });
        B.kanji[c].p.filter(p => p !== '亻' || ks.length === 1).slice(0, 2).forEach((p, j, arr) => {
          if (partPos[p]) { partPos[p].from2 = [pos[0], pos[1]]; return; }
          const off = arr.length === 1 ? 0 : (j ? 17 : -17);
          const pp = P(kAng[i] + off, 168, 160);
          const nd = { type: 'p', key: p, x: pp[0], y: pp[1], from: [pos[0], pos[1]], label: p, cap: PARTS_EN(p), shared: p === sp };
          partPos[p] = nd; nodes.push(nd);
        });
      });
      // a shared part sits between its kanji
      Object.values(partPos).forEach(nd => { if (nd.from2) { const [a, b] = [nd.from, nd.from2]; nd.x = (a[0] + b[0]) / 2; nd.y = Math.min(a[1], b[1]) - 74; } });
      const sibs = B.words.filter(x => x.t !== w.t && x.k.some(c => ks.includes(c))).sort((a, b) => (a.d === 'n1' ? -1 : 1) - (b.d === 'n1' ? -1 : 1)).slice(0, 5);
      spread(sibs.length, 30, 150).forEach((ang, i) => { const p = P(ang, i % 2 ? 104 : 146, i % 2 ? 112 : 150); nodes.push({ type: 'w', key: sibs[i].t, x: p[0], y: p[1], from: [cx, cy], label: sibs[i].t, cap: sibs[i].m.split(/[;,]/)[0], hi: ks }); });
      const pass = (B.passages[w.t] || []);
      const arts = articleSentences(w.t, 1);
      const side = [];
      if (arts[0]) side.push({ type: 'a', key: arts[0].a.id, label: arts[0].a.title.split('――')[1] || arts[0].a.title, cap: t('article · ¶', '記事 ¶') + (arts[0].pi + 1), pic: arts[0].a.picture600 });
      if (pass[0]) side.push({ type: 'w', key: pass[0].from, label: '…' + pass[0].s.slice(Math.max(0, pass[0].s.indexOf(w.t) - 2), pass[0].s.indexOf(w.t) + w.t.length + 2) + '…', cap: t('card: ', 'カード：') + pass[0].from, q: true });
      if (CARD.has(w.t) && side.length < 2) { const ja = CARD.get(w.t).card.ja, ix = ja.indexOf(w.t); side.push({ type: 'c', key: w.t, label: '…' + ja.slice(Math.max(0, ix - 3), ix + w.t.length + 1) + '…', cap: t('your card · due', 'あなたのカード'), q: true }); }
      side.slice(0, 2).forEach((s, i) => { const p = P(i ? -6 : 186, 128, 128); nodes.push({ ...s, x: p[0], y: p[1], from: [cx, cy] }); });
      marks.push([t('Deck', 'デッキ'), DECK_EN[w.d] || '—'], [t('Reading', '読み'), w.r || '—'], [t('Kanji', '漢字'), String(ks.length)], [t('Strokes', '画数'), String(strokes)],
        [t('Shared part', '共通部品'), sp || '—'], [t('Siblings', '仲間'), String(B.words.filter(x => x.t !== w.t && x.k.some(c => ks.includes(c))).length)]);
      return { centre: { type, key, glyph: w.t, r: w.r, m: w.m, st: strokes }, nodes, marks, cx, cy };
    }
    if (type === 'k') {
      const k = B.kanji[key] || { p: [], st: 0, on: [], kun: [], kk: '' };
      spread(k.p.length, k.p.length > 2 ? -150 : -125, k.p.length > 2 ? -30 : -55).forEach((ang, i) => { const p = P(ang, 104); nodes.push({ type: 'p', key: k.p[i], x: p[0], y: p[1], from: [cx, cy], label: k.p[i], cap: PARTS_EN(k.p[i]), shared: memory.trail.some(s => s.type === 'p' && s.key === k.p[i]) }); });
      const ws = B.words.filter(x => x.k.includes(key)).slice(0, 6);
      spread(ws.length, 26, 154).forEach((ang, i) => { const p = P(ang, i % 2 ? 106 : 146, i % 2 ? 114 : 150); nodes.push({ type: 'w', key: ws[i].t, x: p[0], y: p[1], from: [cx, cy], label: ws[i].t, cap: ws[i].m.split(/[;,]/)[0], hi: [key] }); });
      const arts = articleSentences(key, 1);
      if (arts[0]) { const p = P(188, 150); nodes.push({ type: 'a', key: arts[0].a.id, label: arts[0].a.title.split('――')[1] || arts[0].a.title, cap: t('article · ¶', '記事 ¶') + (arts[0].pi + 1), x: p[0], y: p[1], from: [cx, cy], pic: arts[0].a.picture600 }); }
      marks.push([t('Strokes', '画数'), String(k.st)], [t('Meaning', '意味'), kmean(key) || '—'], [t('On', '音'), (k.on || []).join('・') || '—'], [t('Kun', '訓'), (k.kun || []).map(x => x.replace(/\.(.+)/, '($1)')).join('・') || '—'],
        [t('Kanken', '漢検'), k.kk ? (LANG === 'ja' ? k.kk : 'Grade ' + k.kk.replace('級', '')) : '—'], [t('In your words', 'あなたの語'), String(B.words.filter(x => x.k.includes(key)).length)]);
      return { centre: { type, key, glyph: key, r: (k.on || [])[0] || '', m: kmean(key), st: k.st }, nodes, marks, cx, cy };
    }
    const p = B.parts[key] || { k: [], n: '', m: '', kt: 0, st: 0 };
    const mem = p.k.slice(0, 10);
    spread(mem.length, -90, 270 - 360 / Math.max(mem.length, 1)).forEach((ang, i) => { const q = P(ang, mem.length > 7 ? 138 : 112, mem.length > 7 ? 150 : 118); nodes.push({ type: 'k', key: mem[i], x: q[0], y: q[1], from: [cx, cy], label: mem[i], cap: kmean(mem[i]), shared: memory.trail.some(s => s.key.includes && s.key.includes(mem[i])) }); });
    marks.push([t('Name', '名前'), p.n || key], [t('Meaning', '意味'), p.m || '—'], [t('Strokes', '画数'), p.st ? String(p.st) : '—'], [t('Words using it', 'この部品の語'), String(B.words.filter(w => w.k.some(c => (p.k || []).includes(c))).length)],
      [t('Kanji with it', 'この部品の字'), String(p.kt || p.k.length)], [t('In your kanji', 'あなたの字'), String(p.k.length)]);
    return { centre: { type: 'p', key, glyph: key, r: p.n, m: p.m, st: p.st || 0 }, nodes, marks, cx, cy };
  }

  function strokeSVG(c, cls = '') {
    const s = B.strokes[c]; if (!s) return '';
    const nums = s.map((d, i) => { const m = d.match(/M\s*([\d.]+)[ ,]([\d.]+)/); return m ? `<text x="${(+m[1] - 4).toFixed(1)}" y="${(+m[2] - 2).toFixed(1)}">${i + 1}</text>` : ''; }).join('');
    return `<svg class="strokes ${cls}" viewBox="0 0 109 109" aria-hidden="true"><g class="grid"><path d="M54.5 0v109M0 54.5h109"/></g>${s.map((d, i) => `<path class="st" style="--i:${i}" d="${d}"/>`).join('')}<g class="sn">${nums}</g></svg>`;
  }

  function plateHTML(m) {
    const { centre: c, nodes } = m;
    const W = (stage.clientWidth || 390) - 24;
    const gl = [...c.glyph].length, gsize = gl === 1 ? 78 : gl === 2 ? 54 : gl === 3 ? 40 : 30;
    const ticks = Array.from({ length: Math.max(c.st, 1) }, (_, i) => { const a = (i / Math.max(c.st, 1)) * Math.PI * 2 - Math.PI / 2; const r1 = 64, r2 = 70; return `<path d="M${(m.cx + r1 * Math.cos(a)).toFixed(1)} ${(m.cy + r1 * Math.sin(a)).toFixed(1)}L${(m.cx + r2 * Math.cos(a)).toFixed(1)} ${(m.cy + r2 * Math.sin(a)).toFixed(1)}"/>`; }).join('');
    const lines = nodes.map((n, i) => {
      let [x0, y0] = n.from;
      if (x0 === m.cx && y0 === m.cy) { const a = Math.atan2(n.y - y0, n.x - x0); x0 += 72 * Math.cos(a); y0 += 72 * Math.sin(a); }
      const via = n.from2 ? `<path class="ld ${n.shared ? 'sig' : ''}" style="--i:${i}" d="M${n.from2[0].toFixed(1)} ${n.from2[1].toFixed(1)}L${n.x.toFixed(1)} ${n.y.toFixed(1)}"/>` : '';
      return `<path class="ld ${n.shared ? 'sig' : ''}" style="--i:${i}" d="M${x0.toFixed(1)} ${y0.toFixed(1)}L${n.x.toFixed(1)} ${n.y.toFixed(1)}"/>${via}<circle class="via" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="1.6"/>`;
    }).join('');
    nodes.forEach(n => { const half = n.q ? 64 : n.type === 'w' ? 48 : 40; n.x = Math.max(half, Math.min(W - half, n.x)); });
    const nodeHTML = nodes.map((n, i) => {
      const href = n.type === 'a' ? `#/read/article/${n.key}` : n.type === 'c' ? '#/learn' : `#/words/${n.type}/${encodeURIComponent(n.key)}`;
      const lab = n.type === 'w' && n.hi && !n.q ? [...n.label].map(ch => (n.hi.includes(ch) ? `<b>${esc(ch)}</b>` : esc(ch))).join('') : esc(n.label);
      return `<a class="node n-${n.type}${n.shared ? ' shared' : ''}${n.q ? ' n-q' : ''}" href="${href}" data-t="${n.type}" data-key="${esc(n.key)}" style="left:${n.x.toFixed(1)}px;top:${n.y.toFixed(1)}px;--i:${i}" data-ui-content-value="${esc(n.key)}">
        <span class="nb">${n.pic ? `<img src="/${n.pic}" alt="">` : ''}<span class="ng" lang="ja" data-ui-content="learning">${lab}</span></span><span class="nc">${esc(n.cap || '')}</span></a>`;
    }).join('');
    return `<svg class="wires" viewBox="0 0 ${W} 400" width="${W}" height="400" aria-hidden="true"><g class="ticks">${ticks}</g><circle class="ring" cx="${m.cx}" cy="${m.cy}" r="58"/>${lines}</svg>
      <div class="centre c-${c.type}" style="left:${m.cx}px;top:${m.cy}px"><span class="c-r" lang="ja" data-ui-content="learning">${esc(c.r)}</span><span class="c-glyph" lang="ja" data-ui-content="learning" style="font-size:${gsize}px">${esc(c.glyph)}</span><span class="c-m">${esc(c.m.split(/[;,]/)[0])}</span></div>
      <div class="nodes">${nodeHTML}</div>`;
  }

  function entryHTML(m) {
    const c = m.centre;
    const marks = `<dl class="marks">${m.marks.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="data" lang="${/[぀-鿿]/.test(v) ? 'ja' : 'en'}">${esc(v)}</dd></div>`).join('')}</dl>`;
    if (c.type === 'w') {
      const w = WORD.get(c.key) || {};
      const pass = (B.passages[c.key] || []).slice(0, 3);
      return `${marks}<div class="entry-b"><p class="e-dj" lang="ja" data-ui-content="learning">${esc(w.dj || '')}</p>
        ${pass.length ? `<h3 class="eyebrow">${t('In your other cards', 'ほかのカードの中で')}</h3>${pass.map(p => `<a class="e-pass" href="#/words/w/${encodeURIComponent(p.from)}"><span lang="ja" data-ui-content="learning">${hl(p.s, c.key)}</span><small class="data">${DECK_EN[p.d]} · <span lang="ja" data-ui-content="learning">${esc(p.from)}</span></small></a>`).join('')}` : ''}</div>`;
    }
    if (c.type === 'k') {
      return `${marks}<div class="entry-b k-entry">${strokeSVG(c.key, 'big ink-strokes')}<p class="e-note">${t('Stroke order from KanjiVG. Tap a part above to open its family.', '筆順は KanjiVG。上の部品をたたくと仲間がひらく。')}</p></div>`;
    }
    const p = B.parts[c.key] || { k: [] };
    return `${marks}<div class="entry-b"><h3 class="eyebrow">${t(`${p.k.length} of its ${p.kt || p.k.length} kanji are already in your words`, `この部品の字 ${p.kt || p.k.length} のうち ${p.k.length} があなたの語に`)}</h3>
      <div class="fam-grid">${p.k.map(k => `<a href="#/words/k/${encodeURIComponent(k)}" lang="ja" data-ui-content="learning">${k}</a>`).join('')}</div></div>`;
  }

  function Words(sub) {
    const type = ['w', 'k', 'p'].includes(sub[0]) ? sub[0] : 'w';
    const key = sub[1] || DAY_WORD;
    if (!memory.trail.length || memory.trail[memory.trail.length - 1].key !== key) {
      const at = memory.trail.findIndex(s => s.key === key && s.type === type);
      if (at >= 0) memory.trail = memory.trail.slice(0, at + 1); else memory.trail.push({ type, key });
    }
    const m = webModel(type, key);
    after(() => bindWeb());
    return `<section class="room words">
      <header class="head" data-l="1">
        <div class="eyebrow">${t('The web · plate', '網・図版')} <span class="data">${String(memory.trail.length).padStart(2, '0')}</span></div>
        <nav class="trail" aria-label="${t('Your path', 'たどった道')}">${memory.trail.map((s, i) => `${i ? '<i class="chev sm"></i>' : ''}<a href="#/words/${s.type}/${encodeURIComponent(s.key)}" class="${i === memory.trail.length - 1 ? 'here' : ''}" lang="ja" data-ui-content="learning">${esc(s.key)}</a>`).join('')}</nav>
        <a class="search" href="#/words" aria-label="${t('Search words', '語を検索')}"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/></svg></a>
        ${spine('Words', '辞書', String(memory.trail.length).padStart(2, '0'))}
      </header>
      <div class="plate" data-l="2">${regs()}<div class="plate-in">${plateHTML(m)}</div>
        <div class="legend data"><span><i class="lg k"></i>${t('kanji', '漢字')}</span><span><i class="lg p"></i>${t('part', '部品')}</span><span><i class="lg w"></i>${t('word', '語')}</span><span><i class="lg a"></i>${t('passage', '用例')}</span></div>
      </div>
      <div class="entry" data-l="3">${entryHTML(m)}</div>
    </section>`;
  }

  function bindWeb() {
    const plate = $('.plate-in');
    // parallax of depth: wires < nodes < centre when the plate is dragged (multiplane)
    let sx = 0;
    plate.addEventListener('pointermove', e => {
      if (RM || e.pointerType === 'touch') return;
      const r = plate.getBoundingClientRect(); const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
      $('.wires').style.transform = `translate(${dx * -4}px,${dy * -4}px)`;
      $('.nodes').style.transform = `translate(${dx * -8}px,${dy * -8}px)`;
    });
    $$('.node', plate).forEach(n => n.addEventListener('click', e => {
      if (n.dataset.t === 'a') {
        e.preventDefault();
        if (memory.articleId !== n.dataset.key) { memory.articleToken = null; memory.articleScroll = 0; }
        memory.returning = true; memory.articleId = n.dataset.key;
        go(n.getAttribute('href'));
        return;
      }
      if (n.dataset.t === 'c') return;
      e.preventDefault();
      recentre(n);
    }));
    $$('.trail a, .fam-grid a, .e-pass, .a-sib a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(a.getAttribute('href')); }));
  }

  function recentre(n) {
    const plate = $('.plate-in');
    const cen = $('.centre .c-glyph');
    const g = n.querySelector('.ng');
    const r0 = g.getBoundingClientRect(), r1 = cen.getBoundingClientRect();
    plate.classList.add('leaving-web');
    n.classList.add('chosen');
    if (!RM) {
      const s = r1.height / r0.height;
      g.animate([{ transform: 'none' }, { transform: `translate(${r1.left + r1.width / 2 - (r0.left + r0.width / 2)}px,${r1.top + r1.height / 2 - (r0.top + r0.height / 2)}px) scale(${s})` }],
        { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
    }
    setTimeout(() => {
      const href = n.getAttribute('href');
      go(href, { quiet: true });
      const path = href.replace(/^#\//, '').split('/').map(decodeURIComponent);
      // swap only the plate, trail and entry: the room itself never blinks (one continuous shot)
      const tmp = document.createElement('div');
      tmp.innerHTML = Words(path.slice(1));
      for (const sel of ['.head', '.plate', '.entry']) { const n = $(sel, tmp), o = $(sel, stage); if (n && o) { n.removeAttribute('data-l'); o.replaceWith(n); } }
      afterRender.length = 0;
      bindWeb();
      if (!RM) $('.centre .c-glyph').animate([{ opacity: .6, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.22,1,.36,1)' });
    }, RM ? 0 : 200);
  }

  /* =================================================================== ME */
  function Me() {
    const weeks = 12, days = weeks * 7;
    const r = rng(77);
    const cells = Array.from({ length: days }, (_, i) => {
      const x = r(); const today = i === days - 1 - 2; // Thu
      const v = i > days - 3 ? 'future' : today ? 'today' : x > .38 ? 'read' : x > .16 ? 'cards' : 'none';
      return `<i class="d ${v}" style="--i:${i}"></i>`;
    }).join('');
    const hz = [
      ['N1', t('words in review', '復習中の語'), 412, 666, t('N1 deck', 'N1デッキ')],
      [t('Your fields', '専門'), t('field words held', '定着した専門語'), 238, 976, t('3 fields', '3分野')],
      [t('Your voice', '声'), t('spoken answers', '話した答え'), 14, 60, t('this season', '今期')],
      [t('Kanken 1', '漢検1級'), t('kanji seen', '出会った漢字'), 1220, 6000, t('1-kyū range', '1級の範囲')],
    ];
    const home = [['辛抱', t('lapsed 14 Sep', '9/14に忘れ'), t('kept 6 Oct', '10/6に定着')], ['怠る', t('lapsed 21 Sep', '9/21に忘れ'), t('kept 7 Oct', '10/7に定着')], ['目下', t('lapsed 2 Oct', '10/2に忘れ'), t('kept today', '今日定着')]];
    return `<section class="room me">
      <div class="binding" aria-hidden="true">${Array.from({ length: 6 }, () => '<i></i>').join('')}</div>
      <header class="head" data-l="1">
        <div class="eyebrow">${t('Me · the book of 2026', '私・二〇二六年の帖')}</div>
        <h1 class="title">${t('Your year in Japanese', 'あなたの一年')}</h1>
        <p class="lede data">${t('Day 214 · since 9 Mar 2026 · 31,480 characters read', '214日目・2026年3月9日から・31,480字を読んだ')}</p>
        ${spine('Me', '私', '214')}
      </header>
      <div class="horizons" data-l="2">${hz.map(([n, what, v, of, note]) => `<div class="hz"><span class="eyebrow">${n}</span><b class="hz-v num">${fmt(v)}</b><span class="hz-w">${what}</span>
        <span class="hz-bar"><i style="transform:scaleX(${(v / of).toFixed(3)})"></i></span><span class="hz-of data">${fmt(v)} / ${fmt(of)} · ${note}</span></div>`).join('')}</div>
      <section class="home" data-l="3"><div class="row-h"><h2>${t('Came home', '戻ってきた語')}</h2><span class="data">${t('lost, then kept', '忘れて、また覚えた')}</span></div>
        ${home.map(([w, a, b], i) => `<a class="hm" href="#/words/w/${encodeURIComponent(w)}" style="--i:${i}"><span class="hm-w" lang="ja" data-ui-content="learning">${w}</span><span class="seam"><svg viewBox="0 0 120 12" preserveAspectRatio="none"><path d="M0 6 L18 4 L26 9 L41 3 L57 8 L70 5 L84 9 L99 3 L120 6"/></svg><i class="cel"></i></span><span class="hm-d data">${a}<br>${b}</span></a>`).join('')}
      </section>
      <section class="stamps" data-l="3"><div class="row-h"><h2>${t('Twelve weeks', '十二週')}</h2><span class="data">${t('stamp = read + cards · dot = cards', '印＝読書＋カード・点＝カード')}</span></div>
        <div class="cal">${cells}</div></section>
      <a class="next-door" href="#/learn" data-l="3"><span class="eyebrow">${t('Tomorrow', '明日')}</span><span class="nd-t">${t('9 cards, first', '9枚、最初は')} <span lang="ja" data-ui-content="learning" class="half">推敲</span></span><i class="chev"></i></a>
      <section class="settings" data-l="3"><h2>${t('Settings', '設定')}</h2>
        <div class="set"><span>${t('Interface language', '表示言語')}</span><div class="seg">${segLink('lang', 'en', 'English')}${segLink('lang', 'ja', '日本語')}</div></div>
        <div class="set"><span>${t('Light', '光')}</span><div class="seg">${segLink('theme', 'day', t('Day', '昼'))}${segLink('theme', 'night', t('Night', '夜'))}</div></div>
        <a class="set link" href="#/me"><span>${t('Credits & licences', 'クレジットとライセンス')}</span><i class="chev"></i></a>
      </section>
    </section>`;
  }
  function segLink(k, v, label) {
    const q = new URLSearchParams(location.search); q.set(k, v);
    const on = (k === 'lang' ? LANG : THEME) === v;
    return `<a href="?${q}${location.hash}" class="${on ? 'on' : ''}" ${v === 'ja' ? 'lang="ja"' : ''} aria-pressed="${on}">${label}</a>`;
  }

  /* ========================================================== global taps */
  document.addEventListener('click', e => {
    const star = e.target.closest('.star');
    if (star) {
      e.preventDefault(); star.classList.add('touched');
      const play = matchCut(star, () => $('.centre .c-glyph'), { dur: 280 });
      setTimeout(() => { memory.trail = []; go('#/words/w/' + encodeURIComponent(star.dataset.word)); after(play); }, 70);
      return;
    }
    const dw = e.target.closest('.dayword');
    if (dw) {
      e.preventDefault();
      const play = matchCut($('.dw-glyph'), () => $('.centre .c-glyph'), { dur: 280 });
      memory.trail = []; go(dw.getAttribute('href')); after(play); return;
    }
    const book = e.target.closest('[data-cut-pic]');
    if (book) {
      e.preventDefault();
      book.classList.add('pulled');
      const img = book.querySelector('img');
      const play = matchCut(img.parentElement, () => $('.hero-pic'), { dur: 280, kind: 'pic' });
      setTimeout(() => { go(book.getAttribute('href')); after(play); }, book.classList.contains('book') ? 90 : 0);
      return;
    }
    const tab = e.target.closest('.tab');
    if (tab && tab.dataset.go === 'words' && !location.hash.startsWith('#/words')) memory.trail = [];
  });
  document.addEventListener('pointerdown', e => { const p = e.target.closest('[data-press]'); if (p) p.classList.add('pressed'); });
  document.addEventListener('pointerup', () => $$('.pressed').forEach(p => p.classList.remove('pressed')));

  window.__bunki = { render };
  render();
})();
