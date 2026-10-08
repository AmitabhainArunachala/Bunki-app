/* MIGAKI 磨き · evolution, refined. Prototype router + rooms.
   Vanilla JS. Only transform and opacity are animated. */
(() => {
  'use strict';
  const D = window.MIGAKI_DATA;
  const Q = new URLSearchParams(location.search);
  const LANG = Q.get('lang') === 'ja' ? 'ja' : 'en';
  const THEME = Q.get('theme') === 'night' ? 'night' : 'day';
  const H = document.documentElement;
  H.dataset.theme = THEME; H.dataset.lang = LANG; H.lang = LANG === 'ja' ? 'ja' : 'en';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- language: one active interface language (tx law) ---------- */
  const T = (en, ja) => (LANG === 'ja' ? ja : en);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const J = s => `<span lang="ja" data-ui-content="learning">${s}</span>`; // learned Japanese, kept in both modes
  const fmt = n => n.toLocaleString('en-US');
  // Kanken grades and JMdict parts of speech, in the active interface language
  const KK = x => !x ? '—' : LANG === 'ja' ? x : x.replace('準', 'Pre-').replace('級', '');
  const POSJ = { 'noun': '名詞', 'suru verb': 'サ変', 'transitive verb': '他動詞', 'intransitive verb': '自動詞', 'godan verb': '五段動詞', 'ichidan verb': '一段動詞', 'adjective': '形容詞', 'na-adjective': '形容動詞', 'adverb': '副詞', 'expression': '表現', 'pre-noun adjectival': '連体詞', 'interjection': '感動詞', 'conjunction': '接続詞', 'counter': '助数詞', 'suffix': '接尾辞', 'prefix': '接頭辞' };
  const POS = (p, n = 2) => (p || '').split(' · ').slice(0, n).map(x => LANG === 'ja' ? (POSJ[x] || '') : x.toUpperCase()).filter(Boolean).join(' · ');
  const isK = ch => /[一-鿿々]/.test(ch);
  const sleep = ms => new Promise(r => setTimeout(r, REDUCED ? Math.min(ms, 60) : ms));
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  /* ---------- a tiny spring (the sheet and the card move on springs, not curves) ---------- */
  function spring(el, from, to, { k = 260, c = 26, apply, done } = {}) {
    if (REDUCED) { apply(to); done && done(); return; }
    let x = from, v = 0, last = performance.now();
    const step = now => {
      const dt = Math.min(32, now - last) / 1000; last = now;
      const a = -k * (x - to) - c * v; v += a * dt; x += v * dt;
      apply(x);
      if (Math.abs(v) < .02 && Math.abs(x - to) < .05) { apply(to); done && done(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- learner record (prototype sample; every mark is computed from it) ---------- */
  const DUE = D.cards.map(c => c.term);          // today's 12 due, from the real decks
  const CARD = D.cards[0];                        // 推進 (N1)
  const REC = {
    day: 214, dueToday: 12, newToday: 4, minutes: 14,
    firstMet: { '推進': '14 Sep', '研ぐ': '2 Sep', '反復': '19 Sep', '怠る': '28 Aug', '目下': '9 Sep', '辛抱': '3 Sep' },
    seen: { '推進': 4, '研ぐ': 3, '反復': 2 },
    intervals: { again: ['1m', '1分'], hard: ['8m', '8分'], good: ['3d', '3日'], easy: ['9d', '9日'] },
  };

  /* ---------- shell ---------- */
  const app = document.getElementById('app');
  const ICON = {
    today: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 17.5h18"/><path d="M6.5 17.5a5.5 5.5 0 0 1 11 0"/><path d="M12 6.2v2.2M5.2 9.2l1.5 1.5M18.8 9.2l-1.5 1.5"/><path d="M8 20.5h8"/></svg>',
    read: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 6.5c-2.4-1.6-5.4-2-8.5-1.5v13c3.1-.5 6.1-.1 8.5 1.5 2.4-1.6 5.4-2 8.5-1.5V5c-3.1-.5-6.1-.1-8.5 1.5z"/><path d="M12 6.5v13"/></svg>',
    learn: '<svg class="ico" viewBox="0 0 24 24"><rect x="4.5" y="3.5" width="15" height="17" rx="1.5"/><rect x="7.5" y="7" width="9" height="10" rx=".6"/><path d="M4.5 20.5h15"/></svg>',
    words: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.6"/><circle cx="4.8" cy="6" r="1.6"/><circle cx="19.2" cy="6.5" r="1.6"/><circle cx="18.5" cy="18.5" r="1.6"/><circle cx="5.5" cy="18" r="1.6"/><path d="M6.1 7l3.8 3.3M17.9 7.4l-3.8 3M17.3 17.4l-3.4-3.6M6.8 17l3.3-3.2"/></svg>',
    me: '<svg class="ico" viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="1"/><path d="M8 3.5v17"/><circle cx="13.5" cy="10.5" r="2.6"/><path d="M11 15.5h5"/></svg>',
    back: '<svg class="ico" viewBox="0 0 24 24"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    close: '<svg class="ico" viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z" fill="currentColor"/></svg>',
    chev: '<svg class="ico" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M9.5 6l6 6-6 6"/></svg>',
    down: '<svg class="ico" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M6 9.5l6 6 6-6"/></svg>',
  };
  const TABS = [
    ['today', '#/today', 'Today', '今日'], ['read', '#/read', 'Read', '読む'], ['learn', '#/learn', 'Learn', '学ぶ'],
    ['words', '#/words', 'Words', '辞書'], ['me', '#/me', 'Me', '私'],
  ];
  const tombo = () => '<span class="tombo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
  const sign = (en, ja) => `<div class="sign" aria-hidden="true">${T(en, ja)}</div>`;

  function shell() {
    app.innerHTML = `<div class="views"></div>
      <nav class="tabs" aria-label="${T('Rooms', '部屋')}">${TABS.map(([k, h, en, ja]) => `<a class="tab" data-go="${k}" href="${h}">${ICON[k]}<span>${T(en, ja)}</span></a>`).join('')}</nav>`;
  }

  /* ---------- router ---------- */
  const S = { room: null, route: null, view: null, walk: [], origin: null, popup: null, cardRevealed: false, month: 0, articleScroll: 0 };
  const ROUTES = [
    [/^\/today$/, () => viewToday()],
    [/^\/read$/, () => viewShelf()],
    [/^\/read\/article$/, () => viewArticle()],
    [/^\/read\/popup$/, () => viewArticle({ popup: '反復' })],
    [/^\/learn$/, () => viewLearn()],
    [/^\/learn\/front$/, () => viewCard(false)],
    [/^\/learn\/back$/, () => viewCard(true)],
    [/^\/learn\/done$/, () => viewDone()],
    [/^\/words(?:\/([wkp])\/(.+))?$/, m => window.MigakiWeb.view(m[1] ? { t: m[1], id: decodeURIComponent(m[2]) } : null)],
    [/^\/me$/, () => viewMe()],
  ];
  function parse() { const h = location.hash.replace(/^#/, '') || '/today'; for (const [re, fn] of ROUTES) { const m = h.match(re); if (m) return { h, fn: () => fn(m) }; } return { h: '/today', fn: () => viewToday() }; }

  async function route() {
    const { h, fn } = parse();
    const prev = S.route; S.route = h;
    // in-place transitions inside one room (no page change: the match-cut keeps you where you are)
    if (prev === '/read/article' && h === '/read/popup' && S.view) { openPopup('反復'); return; }
    if (prev === '/read/popup' && h === '/read/article' && S.view) { closePopup(); return; }
    if (S.popup) teardownPopup(true);
    if (voiceTimer) { clearInterval(voiceTimer); voiceTimer = null; }
    if (prev === '/learn/front' && h === '/learn/back' && S.view) { revealCard(); return; }
    if (prev && prev.startsWith('/words') && h.startsWith('/words') && S.view && window.MigakiWeb.recentre(h)) return;
    const v = fn();
    mount(v);
  }

  function mount(v) {
    const views = app.querySelector('.views');
    const old = views.querySelector('.view:not(.leaving)');
    const el = document.createElement('main');
    el.className = 'view room-' + v.room; el.innerHTML = v.html; el.dataset.enter = '';
    H.dataset.room = v.room; S.room = v.room;
    app.querySelectorAll('.tab').forEach(t => { if (t.dataset.go === v.room) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    if (old) { old.classList.add('leaving'); setTimeout(() => old.remove(), 170); }
    views.appendChild(el);
    S.view = el;
    if (v.after) requestAnimationFrame(() => v.after(el));
    el.addEventListener('animationend', e => { if (e.target === el) delete el.dataset.enter; });
  }

  /* =====================================================================
     TODAY 今日 · the daily ritual over the kept word sky
     ===================================================================== */
  function viewToday() {
    const r = rng(214);
    const faint = ['名人', '新鮮', '気味', '万一', '判断', '開始', '天候', '触れる', '印刷', '順', '救う', '謎', '職人', '産霊'];
    const layers = [[], [], []];
    faint.forEach((w, i) => {
      const L = i % 3; const x = 2 + r() * 84, y = 1 + r() * 17;
      layers[L].push(`<span style="left:${x}%;top:${y}%;font-size:${[12, 15, 19][L]}px" lang="ja">${w}</span>`);
    });
    const dueSky = DUE.map((w, i) => { const row = i % 2; const x = 4 + Math.floor(i / 2) * 14.5 + r() * 3, y = 3.2 + row * 7 + r() * 2.4; return `<span class="due" data-i="${i}" style="left:${x}%;top:${y}%" lang="ja">${w}</span>`; });
    const dw = D.W['研ぐ'];
    const k = D.K['研'];
    const html = `
      <div class="sky" aria-hidden="true">
        <div class="sky-band"></div>
        <div class="sky-l l0 ambient">${layers[0].join('')}</div>
        <div class="sky-l l1 ambient">${layers[1].join('')}</div>
        <div class="sky-l l2 ambient">${layers[2].join('')}</div>
        <div class="sky-due">${dueSky.join('')}</div>
      </div>
      ${sign('TODAY', '今日')}
      <header class="t-head">
        <div class="t-date">${T('Thursday', '木曜日')}<span>${T('8 October', '十月八日')}</span></div>
        <div class="data">${T(`DAY <b>${REC.day}</b> · <b>${REC.dueToday}</b> DUE · <b>1</b> STORY · ≈<b>${REC.minutes}</b> MIN`, `<b>${REC.day}</b>日目 · 復習 <b>${REC.dueToday}</b> · 記事 <b>1</b> · 約<b>${REC.minutes}</b>分`)}</div>
      </header>
      <a class="dayword" href="#/words/w/研ぐ" data-from="today" aria-label="${T('Open the word of the day in Words', '今日の言葉を辞書で開く')}" data-ui-content-value="研ぐ">
        <div class="dw-label eyebrow">${T('Word of the day', '今日の言葉')}</div>
        <div class="dw-glyph" lang="ja"><span class="ink-blur">研ぐ</span><span class="ink">研<span class="ok">ぐ</span></span><span class="dw-rt">とぐ</span></div>
        <div class="dw-passage" lang="ja" data-ui-content="learning">包丁を<em>研ぐ</em>職人は、一度に力を<br>入れすぎず、毎日欠かすことなく…</div>
        <div class="dw-meta">
          <div class="dw-gloss">${LANG === 'ja' ? J(esc(D.cards.find(c => c.term === '研ぐ').defJa)) : esc(dw.m.slice(0, 2).join(', '))}</div>
          <div class="data dw-data"><span>${J('研')} <b>${k.st}</b> ${T('STROKES', '画')}</span><span>${J(k.parts.join(' + '))}</span><span>${T('KANKEN', '漢検')} <b>${KK(k.kk)}</b></span><span>${T('MET', '初出')} <b>${T(REC.firstMet['研ぐ'], '9月2日')}</b> · ${T('SEEN', '既見')} <b>${REC.seen['研ぐ']}×</b></span></div>
          <div class="dw-open">${T('Open the word', '言葉を開く')} ${ICON.chev}</div>
        </div>
      </a>
      <section class="train" aria-label="${T('Words due today', '今日の復習')}">
        <div class="train-head"><span class="eyebrow">${T('Arriving today', '今日届く言葉')}</span><span class="data"><b>${DUE.length}</b> ${T('WORDS', '語')}</span></div>
        <div class="rails"><div class="track"></div>${DUE.map((w, i) => `<a class="car" data-i="${i}" lang="ja" href="#/words/w/${encodeURIComponent(w)}" data-from="today" data-ui-content-value="${w}">${w}</a>`).join('')}</div>
      </section>
      <ol class="line" aria-label="${T("Today's line", '今日の路線')}">
        <li class="st now"><a href="#/learn/front"><i></i><span class="st-name">${T('Cards', 'カード')}</span><span class="data"><b>12</b> ${T('DUE', '件')} · <b>4</b> ${T('NEW', '新')} · ≈<b>6</b> ${T('MIN', '分')}</span></a></li>
        <li class="st"><a href="#/read/article"><i></i><span class="st-name">${T('Read', '読む')} · ${J('伊勢の時間')}</span><span class="data">N1 · <b>${fmt(D.article.chars)}</b> ${T('CHARS', '字')} · ${T('HOLDS', '既習')} <b>9</b></span></a></li>
        <li class="st"><a href="#/learn"><i></i><span class="st-name">${T('Focus', '集中')} · ${J('隹')} ${T('family', 'の一族')}</span><span class="data"><b>6</b> ${T('KANJI', '字')} · ≈<b>5</b> ${T('MIN', '分')}</span></a></li>
        <li class="st end"><span><i></i><span class="st-name">${T('Tomorrow', '明日')}</span><span class="data"><b>9</b> ${T('DUE', '件')} · ${T('FIRST', '最初')} ${J('<span class="half">怠</span>')}</span></span></li>
      </ol>
      <div class="t-go"><a class="btn signal block" href="#/learn/front">${T('Begin', '始める')} <span class="sub">${T('12 cards · 6 min', '12枚 · 6分')}</span></a></div>`;
    return { room: 'today', html, after: todayRitual };
  }

  async function todayRitual(el) {
    // 1. the sky settles; 2. the day's word inks in; 3. due words leave the sky and arrive as a train; 4. ma; 5. stations light.
    el.classList.add('ritual');
    const cars = [...el.querySelectorAll('.car')], dues = [...el.querySelectorAll('.sky-due .due')];
    const rects = dues.map(d => d.getBoundingClientRect());
    cars.forEach((c, i) => {
      const a = c.getBoundingClientRect(), b = rects[i];
      c.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(1.15)`; c.style.opacity = '0';
    });
    await sleep(520);
    cars.forEach((c, i) => {
      if (REDUCED) { c.style.transform = ''; c.style.opacity = 1; return; }
      const from = c.style.transform;
      c.style.opacity = 1;
      c.animate([{ transform: from, opacity: .2 }, { transform: 'translate(0,0) scale(1)', opacity: 1 }], { duration: 760, delay: i * 55, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'both' });
      dues[i].animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: i * 55, fill: 'forwards' });
      setTimeout(() => { c.style.transform = ''; }, 760 + i * 55);
    });
    await sleep(760 + 12 * 55 + 320);   // the held frame (間)
    el.classList.add('arrived');
  }

  /* =====================================================================
     READ 読む · the magazine shelf
     ===================================================================== */
  const LANTERNS = {
    'bunki-essay-n1-ise-time': [[41, 63], [57, 70], [63, 71]],
    'bunki-essay-n1-city': [[22, 50], [45, 40]],
    'aozora-000628': [[20, 36], [33, 38], [42, 40]],
    'bunki-essay-n1-ai': [[71, 31]],
    'bunki-essay-n1-kojiki-power': [[38, 63], [52, 63], [66, 63], [24, 66]],
    'bunki-essay-n1-cosmic-analogy': [[55, 93]],
  };
  const SOURCE_EN = { '随筆 · Bunki': 'Essay · Bunki', '青空文庫 · 新美南吉': 'Aozora Bunko · Niimi Nankichi' };
  const HOLD = { 'bunki-essay-n1-ise-time': 9, 'bunki-essay-n1-city': 5, 'aozora-000628': 3, 'bunki-essay-n1-ai': 7, 'bunki-essay-n1-kojiki-power': 6, 'bunki-essay-n1-cosmic-analogy': 4 };
  const mins = n => Math.max(2, Math.round(n / 140));
  function print(a, cls = '', src = a.pic600) {
    const l = (LANTERNS[a.id] || []).map(([x, y]) => `<i style="left:${x}%;top:${y}%"></i>`).join('');
    return `<div class="print ${cls}"><img src="${src}" alt="" loading="eager" decoding="async"><div class="night-ink"></div><div class="lanterns">${l}</div><div class="rain ambient"></div></div>`;
  }
  function viewShelf() {
    const [lead, ...rest] = D.shelf;
    const meta = a => `${a.level ? `<span class="seal-n">${a.level}</span>` : `<span class="seal-n plain">${T('Classic', '名作')}</span>`}<span class="data"><b>${fmt(a.chars)}</b> ${T('CH', '字')} · <b>${mins(a.chars)}</b> ${T('MIN', '分')} · ${T('YOUR WORDS', '既習語')} <b>${HOLD[a.id]}</b></span>`;
    const item = (a, cls) => `<a class="story ${cls}" href="#/read/article">${print(a)}<div class="story-t"><h3 lang="ja" data-ui-content="learning">${esc(a.title)}</h3><div class="story-m">${meta(a)}</div></div></a>`;
    const html = `
      ${sign('READ', '読む')}
      <header class="mast">
        <div class="mast-row"><h1>${T('Read', '読む')}</h1><div class="data">${T('THU 8 OCT', '10月8日（木）')}<br><b>6</b> ${T('NEW STORIES', '本の新着')}</div></div>
        <div class="mast-ctl"><button class="filter" type="button">${T('N1 · All fields', 'N1 · 全分野')} ${ICON.down}</button><span class="data">${T('SORTED BY YOUR DUE WORDS', '復習語の多い順')}</span></div>
      </header>
      <a class="lead" href="#/read/article" aria-label="${T('Open the lead story', '巻頭の記事を開く')}">
        ${print(lead, 'lead-print', lead.pic)}
        <span class="listen" aria-hidden="true">${ICON.play}<span>${T('Listen', '聴く')} · 6:48</span></span>
        <div class="cartouche" lang="ja" data-ui-content="learning">${tombo()}<span class="ct-title">産霊・自然・反復</span><span class="ct-sub">伊勢の時間</span><span class="ct-seal">N1</span></div>
        <div class="lead-t">
          <div class="eyebrow">${T('Lead story · Essay · voiced by Kore', '巻頭 · 随筆 · 朗読 Kore')}</div>
          <p class="lead-line" lang="ja" data-ui-content="learning">${esc(lead.lead)}…</p>
          <div class="story-m">${meta(lead)}</div>
        </div>
      </a>
      <div class="also"><span class="eyebrow">${T('Also on the shelf', 'ほかの記事')}</span><span class="rule soft"></span></div>
      <div class="grid">
        ${item(rest[0], 'wide')}
        ${item(rest[1], '')}${item(rest[2], '')}
        ${item(rest[3], '')}${item(rest[4], '')}
      </div>`;
    return { room: 'read', html };
  }

  /* =====================================================================
     READ · the article, built around the voice
     ===================================================================== */
  function tok(t, pi, ti) {
    const [s, f, b, c] = t;
    const inner = f.map(([x, r]) => (r && r !== x && [...x].some(isK)) ? `<ruby>${x}<rt>${r}</rt></ruby>` : x).join('');
    if (!c) return inner;
    const g = D.GL[b];
    const ghost = g && (g.jlpt === 1 || g.jlpt == null) && [...s].some(isK) ? ' ghost' : '';
    return `<span class="w${ghost}" data-b="${esc(b)}" data-p="${pi}" data-t="${ti}" role="button" tabindex="0">${inner}</span>`;
  }
  function viewArticle(opts = {}) {
    const A = D.article, lead = D.shelf[0];
    const body = A.paras.map((p, pi) => `<p>${p.map((t, ti) => tok(t, pi, ti)).join('')}</p>`).join('');
    const html = `
      <div class="hero">${print(lead, 'hero-print', lead.pic)}${tombo()}
        <a class="back-disc" href="#/read" aria-label="${T('Back to the shelf', '本棚へ戻る')}">${ICON.back}</a>
        <div class="hero-cap data">${T('WOODBLOCK · BUNKI', '木版画 · Bunki')}</div>
      </div>
      <article class="paper">
        <div class="eyebrow">${T(SOURCE_EN[A.source] || A.source, A.source)}</div>
        <h1 class="a-title" lang="ja" data-ui-content="learning">${esc(A.title)}</h1>
        <div class="data a-meta"><b>${A.level}</b> · <b>${fmt(A.chars)}</b> ${T('CHARS', '字')} · <b>${mins(A.chars)}</b> ${T('MIN', '分')} · <b>12</b> ${T('NEW TO YOU', '未習')}</div>
        <div class="voice" role="group" aria-label="${T('Voice', '朗読')}">
          <button class="v-play" type="button" aria-label="${T('Play the voice', '朗読を再生')}">${ICON.play}</button>
          <div class="v-line"><div class="v-track">${A.paras.map(() => '<i></i>').join('')}</div><div class="v-fill"></div></div>
          <div class="data v-t">Kore · <b>2:14</b>/<b>6:48</b></div>
        </div>
        <div class="body" lang="ja" data-ui-content="learning">${body}<span class="voice-mark" aria-hidden="true"></span></div>
        <div class="a-end">${tombo()}<div class="eyebrow">${T('Paragraph 3 of 9 · continue', '第3段落 / 全9 · 続きへ')}</div></div>
      </article>`;
    return {
      room: 'read', html, after: el => {
        const view = el; const img = el.querySelector('.hero-print');
        view.addEventListener('scroll', () => { const y = view.scrollTop; img.style.transform = `translateY(${y * .42}px) scale(${1 + Math.min(y, 260) / 2600})`; }, { passive: true });
        placeVoice(el, 0, -13);
        el.querySelector('.v-play').addEventListener('click', () => toggleVoice(el));
        el.querySelector('.body').addEventListener('click', e => { const w = e.target.closest('.w'); if (w) { S.popupWord = w; location.hash = '#/read/popup'; } });
        if (opts.popup) setTimeout(() => openPopup(opts.popup), 380);
      },
    };
  }
  // the voice line: one signal underline travels word by word
  function placeVoice(el, p, t) {
    const w = (t < 0 ? [...el.querySelectorAll(`.w[data-p="${p}"]`)][-t] : el.querySelector(`.w[data-p="${p}"][data-t="${t}"]`)) || el.querySelector('.w');
    const m = el.querySelector('.voice-mark'); const body = el.querySelector('.body');
    if (!w || !m) return;
    const a = w.getBoundingClientRect(), b = body.getBoundingClientRect();
    m.style.transform = `translate(${a.left - b.left}px, ${a.bottom - b.top - 3}px) scaleX(${a.width / 100})`;
    el.querySelectorAll('.w.speaking').forEach(x => x.classList.remove('speaking')); w.classList.add('speaking');
  }
  let voiceTimer = null;
  function toggleVoice(el) {
    const btn = el.querySelector('.v-play');
    if (voiceTimer) { clearInterval(voiceTimer); voiceTimer = null; btn.innerHTML = ICON.play; el.classList.remove('playing'); return; }
    btn.innerHTML = ICON.pause; el.classList.add('playing');
    let p = 0, t = +(el.querySelector('.w.speaking')?.dataset.t || 0);
    voiceTimer = setInterval(() => {
      const ws = [...el.querySelectorAll(`.w[data-p="${p}"]`)]; const idx = ws.findIndex(x => +x.dataset.t > t);
      if (idx < 0) { p = (p + 1) % D.article.paras.length; t = -1; return; }
      t = +ws[idx].dataset.t; placeVoice(el, p, t);
    }, 380);
  }

  /* the word sheet: tap = reading + meaning + keep; a second tap dives */
  function openPopup(base) {
    const el = S.view; if (!el) return;
    let w = S.popupWord && el.contains(S.popupWord) ? S.popupWord : [...el.querySelectorAll('.w')].find(x => x.dataset.b === base);
    if (!w) return;
    const b = w.dataset.b; const e = D.W[b] || {}; const g = D.GL[b] || {};
    const m = (e.m || g.m || []).slice(0, 6);
    if (voiceTimer) toggleVoice(el);
    // make sure the word is visible above the sheet
    const vr = w.getBoundingClientRect(); if (vr.top > 330 || vr.top < 80) { el.scrollTop += vr.top - 210; }
    const r = w.getBoundingClientRect();
    const scrim = document.createElement('div'); scrim.className = 'scrim';
    const lift = document.createElement('div'); lift.className = 'lifted word-lift'; lift.innerHTML = w.innerHTML; lift.lang = 'ja';
    const ar = app.getBoundingClientRect();
    Object.assign(lift.style, { left: r.left - ar.left + 'px', top: r.top - ar.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const ks = (e.k || [...b].filter(isK)).map(c => D.K[c]).filter(Boolean);
    const kTiles = ks.map(k => `<a class="ktile" href="#/words/k/${encodeURIComponent(k.c)}" data-from="article" aria-label="${T('Open kanji', '漢字を開く')} ${k.c}" data-ui-content-value="${k.c}">
        <span class="kt-g" lang="ja">${k.c}</span><span class="kt-m">${esc(k.m || '')}</span><span class="data"><b>${k.st}</b>${T(' STR', '画')} · ${J(k.parts.join('+'))}</span></a>`).join('');
    const also = (e.pass || []).filter(p => p.id !== 'art:' + D.article.id)[0];
    const cult = (e.cult || [])[0];
    const sheet = document.createElement('section'); sheet.className = 'sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', T('Word', '単語'));
    sheet.innerHTML = `<div class="grip"></div>
      <div class="stagger">
        <div class="ws-head" style="--i:0"><span class="ws-w" lang="ja" data-ui-content="learning">${esc(b)}</span><span class="ws-r" lang="ja" data-ui-content="learning">${esc(e.r || g.r || '')}</span>
          <button class="keep btn" type="button" aria-label="${T('Keep this word as a card', 'この言葉をカードにする')}"><span class="keep-mark">＋</span>${T('Keep', '覚える')}</button></div>
        <div class="data ws-data" style="--i:1"> ${esc(POS(e.p || g.p))} · ${T('MET', '初出')} <b>${T(REC.firstMet[b] || 'today', REC.firstMet[b] ? '9月19日' : '今日')}</b> · ${T('SEEN', '既見')} <b>${REC.seen[b] || 1}×</b></div>
        <div class="ws-gloss" style="--i:2">${m.map(x => esc(x)).join(' <span class="dot">·</span> ')}</div>
        <div class="ws-k" style="--i:3">${kTiles}</div>
        ${also ? `<a class="ws-also" style="--i:4" href="#/read"><span class="eyebrow">${T('Also in a story on your shelf', '本棚の別の記事にも')}</span><span class="snip" lang="ja" data-ui-content="learning">${esc(also.snip).replace(esc(b), `<em>${esc(b)}</em>`)}</span><span class="data">${J(esc(also.label))}</span></a>` : ''}
        ${cult ? `<div class="ws-cult" style="--i:5"><span class="ct" lang="ja" data-ui-content="learning">${cult.t}</span><span>${esc(T(cult.en, cult.en))}</span></div>` : ''}
        <a class="ws-dive" style="--i:6" href="#/words/w/${encodeURIComponent(b)}" data-from="article">${T('Open the whole web', '言葉の網を開く')} ${ICON.chev}</a>
      </div>`;
    app.append(scrim, lift, sheet);
    S.popup = { scrim, lift, sheet, w };
    w.classList.add('picked');
    requestAnimationFrame(() => {
      scrim.classList.add('on');
      lift.animate([{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-3px) scale(1.07)' }], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      spring(sheet, 105, 0, { k: 300, c: 30, apply: v => { sheet.style.transform = `translateY(${v}%)`; } });
    });
    scrim.addEventListener('click', () => { location.hash = '#/read/article'; });
    sheet.querySelector('.keep').addEventListener('click', ev => {
      const k = ev.currentTarget; k.classList.add('kept'); k.innerHTML = `<span class="keep-mark">✓</span>${T('Kept · card tomorrow', '保存 · 明日カードに')}`;
      w.classList.add('kept');
    });
    sheet.querySelectorAll('[data-from="article"]').forEach(a => a.addEventListener('click', () => { S.origin = { hash: '#/read/article', label: T('Back to the sentence', '文へ戻る'), scroll: S.view.scrollTop }; teardownPopup(true); }));
  }
  function teardownPopup(instant) {
    const p = S.popup; if (!p) return; S.popup = null;
    p.w && p.w.classList.remove('picked');
    if (instant) { p.scrim.remove(); p.lift.remove(); p.sheet.remove(); return; }
    p.scrim.classList.remove('on');
    p.lift.animate([{ transform: 'translateY(-3px) scale(1.07)' }, { transform: 'none' }], { duration: 160, fill: 'forwards' });
    p.sheet.animate([{ transform: p.sheet.style.transform || 'translateY(0)' }, { transform: 'translateY(105%)' }], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    setTimeout(() => { p.scrim.remove(); p.lift.remove(); p.sheet.remove(); }, 230);
  }
  const closePopup = () => teardownPopup(false);

  /* =====================================================================
     LEARN 学ぶ · a stage, in clear sections (the dojo, unstrewn)
     ===================================================================== */
  function viewLearn() {
    const deckRow = (k, en, ja, due, nw, held) => `<a class="deck" href="#/learn/front"><span class="d-name">${T(en, ja)}</span><span class="d-bar"><i style="transform:scaleX(${held})"></i></span><span class="data"><b>${due}</b> ${T('DUE', '件')}${nw ? ` · <b>${nw}</b> ${T('NEW', '新')}` : ''}</span></a>`;
    const html = `
      ${sign('LEARN', '学ぶ')}
      <header class="l-head"><h1>${T('Learn', '学ぶ')}</h1><div class="data">${T('NEXT REVIEW IN', '次の復習まで')} <b>18</b> ${T('MIN', '分')} · ${T('RETENTION', '保持率')} <b>91.4%</b></div></header>
      <section class="proscenium">
        <div class="pro-frame">
          <div class="pro-top"><span class="eyebrow">${T('The next sitting', '次の一座')}</span><span class="data"><b>12</b> ${T('CARDS', '枚')} · ≈<b>6</b> ${T('MIN', '分')}</span></div>
          <div class="pro-card">${tombo()}
            <div class="pc-stack" aria-hidden="true"><i></i><i></i></div>
            <p class="pc-pass" lang="ja" data-ui-content="learning">明治政府は、国民国家をつくるために標準語の<mark>　　</mark>に力を入れた。</p>
            <div class="pc-mix"><span class="data">N1 <b>7</b></span><span class="data">N2 <b>3</b></span><span class="data">${T('FIELDS', '専門')} <b>2</b></span></div>
          </div>
          <a class="btn signal block" href="#/learn/front">${T('Start the sitting', '始める')}</a>
        </div>
      </section>
      <section class="lsec">
        <h2><span class="n">1</span>${T('Cards', 'カード')}<span class="data"><b>12</b> ${T('DUE', '件')} · <b>4</b> ${T('NEW', '新')}</span></h2>
        ${deckRow('n1', 'N1 · Passages', 'N1 · 文章', 7, 2, .62)}
        ${deckRow('n2', 'N2 · Passages', 'N2 · 文章', 3, 1, .78)}
        ${deckRow('senmon', 'Your fields', '専門分野', 2, 1, .41)}
      </section>
      <section class="lsec">
        <h2><span class="n">2</span>${T('Focus', '集中')}<span class="data">${T('ONE DRILL', '一題')}</span></h2>
        <a class="focus" href="#/words/p/%E9%9A%B9"><span class="f-g" lang="ja">隹</span><span><span class="f-t">${T('The short-tailed bird', 'ふるとり')} · ${J('推 進 集 雑 確 観')}</span><span class="data"><b>6</b> ${T('KANJI', '字')} · ≈<b>5</b> ${T('MIN', '分')} · ${T('4 IN TODAY\'S CARDS', '今日のカードに4字')}</span></span></a>
      </section>
      <section class="lsec">
        <h2><span class="n">3</span>${T('Tests', '試験')}<span class="data">${T('LAST', '前回')} <b>112</b>/180 · ${T('21 SEP', '9月21日')}</span></h2>
        <div class="tests"><a href="#/learn" class="test"><span class="t-n">${T('Short mock', '短い模試')}</span><span class="data"><b>25</b> ${T('MIN', '分')} · <b>30</b> ${T('ITEMS', '問')}</span></a><a href="#/learn" class="test"><span class="t-n">${T('Full N1 mock', 'N1 本番形式')}</span><span class="data"><b>170</b> ${T('MIN', '分')} · <b>3</b> ${T('PARTS', '部')}</span></a></div>
      </section>
      <section class="lsec">
        <h2><span class="n">4</span>${T('Guided', 'ガイド')}<span class="data">${T('FROM TODAY\'S CARD', '今日のカードから')}</span></h2>
        <a class="guided" href="#/learn"><span class="g-pat" lang="ja">〜すら</span><span><span class="f-t">${T('“even” — the limit pushed', '極端な例を挙げる')}</span><span class="snip" lang="ja" data-ui-content="learning">方言を話した児童に札を下げさせる罰<em>すら</em>行われた。</span></span></a>
      </section>`;
    return { room: 'learn', html };
  }

  function cardText(card, withRuby) {
    return card.ruby.map(([t, r, tgt]) => {
      const inner = withRuby && r ? `<ruby>${t}<rt>${r}</rt></ruby>` : t;
      return tgt ? `<span class="target">${inner}</span>` : inner;
    }).join('');
  }
  function kanjiPlate(k) {
    const paths = (k.paths || []).map((d, i) => `<path d="${d}" style="--s:${i}"/>`).join('');
    const parts = k.parts.map(p => `<span lang="ja">${p}</span>`).join('<b>+</b>');
    return `<a class="kplate" href="#/words/k/${encodeURIComponent(k.c)}" data-ui-content-value="${k.c}" aria-label="${T('Open kanji', '漢字を開く')} ${k.c}">
      <svg viewBox="0 0 109 109" class="strokes" aria-hidden="true">${paths}</svg>
      <span class="kp-body"><span class="kp-m">${esc(k.m)}</span><span class="kp-parts">${parts}</span>
      <span class="data"><b>${k.st}</b>${T(' STR', '画')} · ${T('GR', '学年')} <b>${k.grade ?? '—'}</b><br>${T('KANKEN', '漢検')} <b>${KK(k.kk)}</b> · <b>${k.jlpt || '—'}</b></span></span></a>`;
  }
  function viewCard(revealed) {
    S.cardRevealed = revealed;
    const c = CARD;
    const ks = c.term.split('').map(ch => D.K[ch]).filter(Boolean);
    const html = `
      <div class="stage ${revealed ? 'revealed' : ''}">
        <div class="st-top">
          <a class="tap st-x" href="#/learn" aria-label="${T('End the sitting', '終了する')}">${ICON.close}</a>
          <div class="ticks" aria-label="${T('Card 3 of 12', '12枚中3枚目')}">${Array.from({ length: 12 }, (_, i) => `<i class="${i < 2 ? 'done' : i === 2 ? 'cur' : ''}"></i>`).join('')}</div>
          <span class="data st-n"><b>3</b>/12</span>
        </div>
        <article class="card">${tombo()}
          <div class="c-eyebrow"><span class="eyebrow">N1 · ${T(c.group, '日本語')}</span><span class="data">${T('PASSAGE', '文章')} · <b>${c.ja.length}</b>${T(' CH', '字')}</span></div>
          <div class="answer" ${revealed ? '' : 'hidden'}>${revealed ? answerHTML(c, ks) : ''}</div>
          <div class="c-body"><p class="c-pass" lang="ja" data-ui-content="learning">${cardText(c, revealed)}</p>
          <div class="c-prompt data">${T('RECALL THE MARKED WORD: READING AND MEANING', '印の言葉の読みと意味を思い出す')}</div>
          <div class="c-after">${revealed ? afterHTML() : ''}</div></div>
          <div class="polish" aria-hidden="true"></div>
        </article>
        <div class="st-act">
          ${revealed ? gradeHTML() : `<button class="btn signal block show" type="button">${T('Show answer', '答えを見る')} <span class="sub">${T('SPACE', 'スペース')}</span></button>`}
        </div>
      </div>`;
    return {
      room: 'learn', html, after: el => {
        const b = el.querySelector('.show'); if (b) b.addEventListener('click', () => { location.hash = '#/learn/back'; });
        wireGrades(el);
        if (revealed) el.querySelector('.stage').classList.add('settled');
      },
    };
  }
  function answerHTML(c, ks) {
    return `<div class="a-head"><span class="a-w" lang="ja" data-ui-content="learning">${c.term}</span><span class="a-r" lang="ja" data-ui-content="learning">${c.reading}</span><span class="data a-pos">${T('NOUN · SURU', '名詞・サ変')}</span></div>
      <p class="a-def" lang="ja" data-ui-content="learning">${c.defJa}</p>
      <details class="a-en"><summary>${T('Show English', '英語を表示')}</summary><span>${esc(c.meaning)}</span></details>
      <div class="a-ks">${ks.map(kanjiPlate).join('')}</div>
      <div class="data a-rec">${T('FIRST MET', '初出')} <b>${T(REC.firstMet['推進'], '9月14日')}</b> · ${T('SEEN', '既見')} <b>${REC.seen['推進']}×</b> · ${T('STABILITY', '安定度')} <b>11.2</b>${T('D', '日')} · ${T('RECALL', '想起率')} <b>87%</b></div>`;
  }
  function afterHTML() {
    const sib = D.P['隹'];
    return `<a class="a-sib" href="#/words/p/${encodeURIComponent('隹')}"><span class="as-g" lang="ja">隹</span><span>${T('The same bird sits in', '同じ「隹」が')} ${J('権')} ${T('— your Fields card', '— 専門カード')} ${J('傀儡政権')}</span><span class="data"><b>${sib.count}</b> ${T('KANJI CARRY IT', '字に含まれる')}</span></a>`;
  }
  function gradeHTML() {
    const G = [['again', 'Again', '再'], ['hard', 'Hard', '難'], ['good', 'Good', '良'], ['easy', 'Easy', '易']];
    return `<div class="grades">${G.map(([k, en, ja]) => `<button class="pad ${k}" type="button"><span class="g-l">${T(en, ja)}</span><span class="data">${T(...REC.intervals[k])}</span></button>`).join('')}</div>`;
  }
  function wireGrades(el) {
    el.querySelectorAll('.pad').forEach(p => p.addEventListener('click', () => {
      p.classList.add('pressed'); el.querySelector('.card').classList.add('registered');
      setTimeout(() => { location.hash = '#/learn/done'; }, 420);
    }));
  }
  // 研ぎ出し togidashi: the answer is polished up from beneath the same surface
  async function revealCard() {
    const el = S.view; const c = CARD; const ks = c.term.split('').map(ch => D.K[ch]).filter(Boolean);
    const stage = el.querySelector('.stage'); const card = el.querySelector('.card');
    stage.classList.add('revealing');
    el.querySelector('.st-act').innerHTML = '';
    const pass = el.querySelector('.c-pass');
    pass.innerHTML = cardText(c, true); pass.classList.add('ruby-in');
    // the readings surface where the polish band passes: delay by x, then by line
    const pr = pass.getBoundingClientRect();
    pass.querySelectorAll('rt').forEach(rt => { const r = rt.getBoundingClientRect(); rt.style.animationDelay = Math.round(60 + (r.left - pr.left) / pr.width * 360 + (r.top - pr.top) * .25) + 'ms'; });
    await sleep(520);                           // the polish band crosses the passage
    await sleep(240);                           // 間: the held frame
    const body = el.querySelector('.c-body'); const before = body.getBoundingClientRect().top;
    const ans = el.querySelector('.answer'); ans.innerHTML = answerHTML(c, ks); ans.hidden = false; ans.classList.add('rising');
    el.querySelector('.c-after').innerHTML = afterHTML();
    stage.classList.add('revealed');
    const dy = body.getBoundingClientRect().top - before;
    if (!REDUCED) body.animate([{ transform: `translateY(${-dy}px)` }, { transform: 'none' }], { duration: 460, easing: 'cubic-bezier(.22,1,.36,1)' });
    await sleep(260);
    const act = el.querySelector('.st-act'); act.innerHTML = gradeHTML(); act.classList.add('rising');
    wireGrades(el);
    S.cardRevealed = true;
  }

  /* session close: a cleared surface, one seal, and the next door */
  function viewDone() {
    const city = D.shelf[1];
    const html = `
      ${sign('LEARN', '学ぶ')}
      <section class="closing">
        <div class="d-sheet">${tombo()}
          <svg class="d-ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52"/><circle cx="60" cy="60" r="44" class="in"/></svg>
          <div class="d-seal"><span class="num">12</span></div>
          <h1>${T('Twelve cards, whole.', '十二枚、ひとまとまり。')}</h1>
          <div class="data d-stat"><b>10</b> ${T('HELD', '保持')} · <b>2</b> ${T('AGAIN', '再')} · <b>6:40</b> · ${T('RETENTION', '保持率')} <b>91.4%</b></div>
          <div class="d-words" lang="ja" data-ui-content="learning">${DUE.map((w, i) => `<span class="${i === 4 || i === 9 ? 'miss' : ''}">${w}</span>`).join('')}</div>
        </div>
        <div class="eyebrow d-next-l">${T('The next door', '次の扉')}</div>
        <a class="d-next" href="#/read/article">${print(city)}<span class="dn-t"><span class="dn-h" lang="ja" data-ui-content="learning">${esc(city.title)}</span><span class="data">${T('HOLDS', '含む')} <b>5</b> ${T('OF TODAY\'S WORDS', '今日の言葉')} · <b>${mins(city.chars)}</b> ${T('MIN', '分')}</span></span>${ICON.chev}</a>
        <div class="d-tomorrow"><span class="eyebrow">${T('Tomorrow', '明日')}</span><span class="data"><b>9</b> ${T('DUE', '件')} · ${T('FIRST', '最初')}</span><span class="half-word" lang="ja">怠<span>る</span></span></div>
      </section>`;
    return { room: 'learn', html };
  }

  /* =====================================================================
     ME 私 · the book of your year
     ===================================================================== */
  function viewMe() {
    const hz = [
      ['N1 vocabulary', 'N1 語彙', 1284, 3410, 'HELD BY RECALL', '想起で保持'],
      ['Jōyō kanji', '常用漢字', 1486, 2136, 'READ AND RECALLED', '読み・想起'],
      ['Kanken 1-kyū', '漢検1級', 1902, 6355, 'ON THE WAY', '途上'],
      ['Your six fields', '専門六分野', 412, 1200, 'WORDS IN FIELD TEXTS', '分野語'],
    ];
    const months = [{ en: 'October', ja: '十月', days: 31, start: 4, done: 7, today: 8 }, { en: 'September', ja: '九月', days: 30, start: 2, done: 30, today: 0 }];
    const mo = months[S.month % 2];
    const r = rng(9 + S.month);
    const cells = [];
    for (let i = 0; i < mo.start; i++) cells.push('<i class="blank"></i>');
    for (let d = 1; d <= mo.days; d++) {
      const did = d <= mo.done ? (r() > .12) : false; const today = d === mo.today;
      cells.push(`<i class="${did ? 'seal' : ''} ${today ? 'today' : ''}" style="--i:${d}"><span class="num">${d}</span></i>`);
    }
    const kin = [['怠る', 'おこたる', T('LAPSED 14 SEP', '9/14 失念'), T('HELD 6 OCT', '10/6 回復')], ['目下', 'めした', T('LAPSED 22 SEP', '9/22 失念'), T('HELD 5 OCT', '10/5 回復')], ['辛抱', 'しんぼう', T('LAPSED 30 SEP', '9/30 失念'), T('HELD 7 OCT', '10/7 回復')]];
    const html = `
      ${sign('ME', '私')}
      <div class="book">
        <div class="spine" aria-hidden="true"></div><div class="edges" aria-hidden="true"></div>
        <header class="m-head"><div class="eyebrow">${T('The book of your year', '一年の帳')}</div><h1>${T('Your record', 'あなたの記録')}</h1>
          <div class="data">${T('SINCE', '開始')} <b>${T('7 MAR 2026', '2026年3月7日')}</b> · <b>${REC.day}</b> ${T('DAYS', '日')} · <b>186</b> ${T('PRACTISED', '日稽古')}</div></header>
        <section class="horizons">
          <h2 class="eyebrow">${T('Four horizons', '四つの地平')}</h2>
          ${hz.map(([en, ja, a, b, sen, sja]) => `<div class="hz"><div class="hz-top"><span class="hz-n">${T(en, ja)}</span><span class="data"><b>${fmt(a)}</b> / ${fmt(b)}</span></div>
            <div class="hz-rule"><i style="transform:scaleX(${(a / b).toFixed(3)})"></i>${Array.from({ length: 9 }, (_, i) => `<s style="left:${(i + 1) * 10}%"></s>`).join('')}</div>
            <div class="data hz-sub">${T(sen, sja)} · <b>${(a / b * 100).toFixed(1)}%</b></div></div>`).join('')}
        </section>
        <section class="month">
          <div class="mo-head"><button class="tap mo-b" type="button" data-m="1" aria-label="${T('Previous month', '前の月')}">${ICON.back}</button><h2>${T(mo.en, mo.ja)} <span class="data">2026</span></h2><button class="tap mo-b" type="button" data-m="-1" aria-label="${T('Next month', '次の月')}" style="transform:scaleX(-1)">${ICON.back}</button></div>
          <div class="dow data">${(LANG === 'ja' ? ['日', '月', '火', '水', '木', '金', '土'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map(d => `<span>${d}</span>`).join('')}</div>
          <div class="cal">${cells.join('')}</div>
          <div class="data mo-foot">${T('A SEAL FOR EVERY DAY YOU READ OR REVIEWED', '読んだ日・復習した日に印')}</div>
        </section>
        <section class="kintsugi">
          <h2 class="eyebrow">${T('Mended this month', '今月、継いだ言葉')}</h2>
          <div class="kin">${kin.map(([w, rd, l, h], i) => `<div class="kt cel" style="--cel-delay:${600 + i * 180}ms"><svg viewBox="0 0 100 60" class="seam" aria-hidden="true"><path d="M-2 22 L18 26 L27 19 L41 31 L55 24 L63 36 L80 30 L102 38"/></svg><span class="kt-w" lang="ja" data-ui-content="learning">${w}</span><span class="kt-r" lang="ja" data-ui-content="learning">${rd}</span><span class="data">${l}<br><b>${h}</b></span></div>`).join('')}</div>
        </section>
        <section class="copied">
          <h2 class="eyebrow">${T('A line you copied by hand', '書き写した一文')}</h2>
          <p class="hand" lang="ja" data-ui-content="learning">気に入った一文を書き写して<br>声に出す習慣は、<br>短くても有益である。</p>
          <div class="data">${T('FROM THE CARD', 'カードより')} ${J('研ぐ')} · <b>${T('6 OCT', '10月6日')}</b></div>
        </section>
        <section class="settings">
          <h2 class="eyebrow">${T('At the back of the book', '奥付')}</h2>
          <div class="set"><span>${T('Interface language', '表示言語')}</span><div class="seg">${segLink('lang', 'en', 'English')}${segLink('lang', 'ja', '日本語')}</div></div>
          <div class="set"><span>${T('Light', '明かり')}</span><div class="seg">${segLink('theme', 'day', T('Day', '昼'))}${segLink('theme', 'night', T('Night', '夜'))}</div></div>
          <div class="data colophon">${T('DICTIONARY JMDICT · KANJIDIC2 · KANJIVG (CC BY-SA) · PICTURES BUNKI', '辞書 JMdict · KANJIDIC2 · KanjiVG（CC BY-SA）· 絵 Bunki')}</div>
        </section>
      </div>`;
    return {
      room: 'me', html, after: el => {
        el.querySelectorAll('.mo-b').forEach(b => b.addEventListener('click', () => {
          const dir = +b.dataset.m; const sec = el.querySelector('.month');
          sec.animate([{ transform: 'perspective(900px) rotateY(0)', opacity: 1 }, { transform: `perspective(900px) rotateY(${dir * 70}deg)`, opacity: 0 }], { duration: 240, easing: 'cubic-bezier(.4,0,1,1)' }).onfinish = () => {
            S.month = (S.month + 1) % 2; const top = el.scrollTop; mount(viewMe()); S.view.scrollTop = top;
            const ns = S.view.querySelector('.month'); S.view.dataset.enter = 'none';
            ns.animate([{ transform: `perspective(900px) rotateY(${-dir * 70}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' });
          };
        }));
      },
    };
  }
  function segLink(key, val, label) {
    const q = new URLSearchParams(location.search); const cur = key === 'lang' ? LANG : THEME;
    if ((key === 'lang' && val === 'en') || (key === 'theme' && val === 'day')) q.delete(key); else q.set(key, val);
    const s = q.toString();
    return `<a class="${cur === val ? 'on' : ''}" href="${location.pathname}${s ? '?' + s : ''}${location.hash}" ${cur === val ? 'aria-current="true"' : ''}${val === 'ja' ? ' lang="ja"' : ''}>${label}</a>`;
  }

  /* ---------- go ---------- */
  window.Migaki = { KK, POS, D, T, J, esc, ICON, sign, tombo, spring, sleep, REDUCED, LANG, S, REC, mount, kanjiPlate, isK, fmt, app: () => app };
  shell();
  addEventListener('hashchange', route);
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-from="today"]'); if (a) S.origin = { hash: '#/today', label: T('Back to today', '今日へ戻る') };
    const t = e.target.closest('.tab'); if (t) { S.origin = null; S.walk = []; }
  });
  route();
})();
