/* MIGAKI · Words 辞書: the web as a technical plate.
   word ↔ kanji ↔ parts ↔ sibling words ↔ passages ↔ grammar ↔ culture.
   Tapping a node re-centres the web with a match-cut (FLIP on transform + opacity only). */
(() => {
  'use strict';
  const M = () => window.Migaki;
  const PW = 390, PH = 452, CX = 195, CY = 206;
  const key = n => n.t + ':' + n.id;

  function info(n) {
    const { D } = M();
    if (n.t === 'w') return D.W[n.id];
    if (n.t === 'k') return D.K[n.id];
    if (n.t === 'p') return D.P[n.id] || D.K[n.id];
    return null;
  }

  function neighbours(c) {
    const { D } = M(); const e = info(c); if (!e) return [];
    const out = [];
    if (c.t === 'w') {
      e.k.forEach(k => D.K[k] && out.push({ t: 'k', id: k, cat: 'struct' }));
      (e.sib || []).filter(s => D.W[s]).slice(0, 4).forEach(s => out.push({ t: 'w', id: s, cat: 'sib' }));
      (e.pass || []).slice(0, 1).forEach(p => out.push({ t: 's', id: p.id, cat: 'ctx', d: p }));
      (e.gram || []).slice(0, 1).forEach(g => out.push({ t: 'g', id: g.g, cat: 'ctx', d: g }));
      (e.cult || []).slice(0, 1).forEach(x => out.push({ t: 'c', id: x.t, cat: 'ctx', d: x }));
    } else if (c.t === 'k') {
      (e.parts || []).forEach(p => out.push({ t: 'p', id: p, cat: 'struct' }));
      (e.words || []).filter(w => D.W[w]).slice(0, 4).forEach(w => out.push({ t: 'w', id: w, cat: 'sib' }));
      (e.pass || []).slice(0, 1).forEach(p => out.push({ t: 's', id: p.id, cat: 'ctx', d: p }));
      (e.cult || []).slice(0, 1).forEach(x => out.push({ t: 'c', id: x.t, cat: 'ctx', d: x }));
    } else {
      const P = D.P[c.id] || {};
      (P.kanji || []).slice(0, 7).forEach(k => D.K[k] && out.push({ t: 'k', id: k, cat: P.kanji.length > 4 ? 'ring' : 'struct' }));
      (P.cult || []).slice(0, 1).forEach(x => out.push({ t: 'c', id: x.t, cat: 'ctx', d: x }));
    }
    return out;
  }

  function layout(c, ns) {
    const S = ns.filter(n => n.cat === 'struct'), R = ns.filter(n => n.cat === 'ring'), W = ns.filter(n => n.cat === 'sib'), X = ns.filter(n => n.cat === 'ctx');
    const pos = [];
    const arc = (list, a0, a1, rx, ry) => list.forEach((n, i) => {
      const a = list.length === 1 ? (a0 + a1) / 2 : a0 + (a1 - a0) * i / (list.length - 1);
      const r = a * Math.PI / 180; pos.push({ n, x: CX + rx * Math.cos(r), y: CY + ry * Math.sin(r), a });
    });
    if (S.length) arc(S, S.length === 1 ? -90 : -90 - 22 * (S.length - 1), S.length === 1 ? -90 : -90 + 22 * (S.length - 1), 118, 128);
    if (R.length) arc(R, -168, -12, 140, 136);
    const side = [[-4, 136, 104], [184, 136, 104], [30, 132, 112], [150, 132, 112]];
    W.forEach((n, i) => { const [a, rx, ry] = side[i] || side[0]; const r = a * Math.PI / 180; pos.push({ n, x: CX + rx * Math.cos(r), y: CY + ry * Math.sin(r), a }); });
    X.forEach((n, i) => { const m = X.length; const x = m === 1 ? CX : 72 + (PW - 144) * i / (m - 1); pos.push({ n, x, y: PH - 50, a: Math.atan2(PH - 50 - CY, x - CX) * 180 / Math.PI }); });
    return pos;
  }

  function nodeHTML(p, i) {
    const { D, esc, T } = M(); const n = p.n; const k = key(n);
    const style = `style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px;--i:${i}"`;
    if (n.t === 'k') { const e = D.K[n.id]; return `<a class="node nk" data-k="${k}" href="#/words/k/${encodeURIComponent(n.id)}" ${style} data-ui-content-value="${n.id}"><span class="g" lang="ja">${n.id}</span><span class="lbl">${esc((e.m || '').split(/[,;]/)[0])}</span></a>`; }
    if (n.t === 'p') { const e = D.P[n.id] || {}; return `<a class="node np" data-k="${k}" href="#/words/p/${encodeURIComponent(n.id)}" ${style} data-ui-content-value="${n.id}"><span class="g" lang="ja">${n.id}</span><span class="lbl" lang="ja">${esc(e.name || e.m || '')}</span></a>`; }
    if (n.t === 'w') { const e = D.W[n.id]; return `<a class="node nw" data-k="${k}" href="#/words/w/${encodeURIComponent(n.id)}" ${style} data-ui-content-value="${n.id}"><span class="rd" lang="ja">${esc(e.r)}</span><span class="g" lang="ja">${n.id}</span><span class="lbl">${esc((e.m[0] || '').slice(0, 18))}</span></a>`; }
    if (n.t === 's') { const d = n.d; const href = d.kind === 'article' ? '#/read/article' : '#/learn/back';
      return `<a class="node nx ns" data-k="${k}" href="${href}" ${style}><span class="eyebrow">${T('Passage', '文例')} · ${d.src || ''}</span><span class="snip" lang="ja" data-ui-content="learning">${esc(d.snip.slice(0, 24)).replace(esc(d.hit), `<em>${esc(d.hit)}</em>`)}…</span></a>`; }
    if (n.t === 'g') return `<button type="button" class="node nx ng" data-k="${k}" ${style}><span class="eyebrow">${T('Grammar', '文法')}</span><span class="pat" lang="ja" data-ui-content="learning">${esc(n.d.g)}</span><span class="lbl">${esc(n.d.en)}</span></button>`;
    return `<button type="button" class="node nx nc" data-k="${k}" ${style}><span class="eyebrow">${T('Culture', '文化')}</span><span class="pat" lang="ja" data-ui-content="learning">${esc(n.d.t)}</span><span class="lbl">${esc(n.d.en.split(':')[0].slice(0, 26))}</span></button>`;
  }

  function centreHTML(c) {
    const { D, esc, T } = M(); const e = info(c);
    if (c.t === 'k' && e && e.paths) {
      const starts = e.paths.map(d => d.match(/M\s*([\d.]+)[ ,]([\d.]+)/)).map(m => m ? [+m[1], +m[2]] : [0, 0]);
      return `<div class="centre ck" data-k="${key(c)}"><svg viewBox="0 0 109 109" class="strokes big" aria-label="${c.id}">${e.paths.map((d, i) => `<path d="${d}" style="--s:${i}"/>`).join('')}${starts.map(([x, y], i) => `<text x="${x - 3}" y="${y - 2}" style="--s:${i}">${i + 1}</text>`).join('')}</svg><span class="c-lbl">${esc(e.m)}</span></div>`;
    }
    if (c.t === 'w') return `<div class="centre cw" data-k="${key(c)}"><span class="c-rd" lang="ja">${esc(e.r)}</span><span class="c-g" lang="ja" data-ui-content="learning">${esc(c.id)}</span><span class="c-lbl">${esc(e.m.slice(0, 2).join(', '))}</span></div>`;
    return `<div class="centre cp" data-k="${key(c)}"><span class="c-g" lang="ja">${esc(c.id)}</span><span class="c-lbl" lang="ja">${esc((D.P[c.id] || {}).name || (e && e.m) || '')}</span></div>`;
  }

  function edgesHTML(pos) {
    return pos.map((p, i) => {
      const dx = p.x - CX, dy = p.y - CY; const d = Math.hypot(dx, dy); const a = Math.atan2(dy, dx) * 180 / Math.PI;
      const off = 56, len = Math.max(8, d - off - (p.n.cat === 'ctx' ? 34 : 30));
      return `<div class="edge e-${p.n.cat}" style="left:${CX}px;top:${CY}px;transform:rotate(${a.toFixed(2)}deg) translateX(${off}px);--i:${i}"><i style="width:${len.toFixed(1)}px"></i><b style="left:${len.toFixed(1)}px"></b></div>`;
    }).join('');
  }

  function detailHTML(c) {
    const { D, T, J, esc, REC } = M(); const e = info(c);
    const row = (l, v) => `<div class="dt"><span class="eyebrow">${l}</span><span class="dv">${v}</span></div>`;
    if (c.t === 'w') {
      const jl = e.jlpt ? 'N' + e.jlpt : '—';
      return `<div class="dl-head"><span class="dl-g" lang="ja" data-ui-content="learning">${esc(c.id)}</span><span class="dl-gloss">${esc(e.m.slice(0, 3).join(' · '))}</span></div>
        <div class="dts">${row(T('Reading', '読み'), J(esc(e.r)))}${row('JLPT', `<span class="mono">${jl}</span>`)}${row(T('Kind', '品詞'), `<span class="mono small">${esc(M().POS(e.p, 1).toLowerCase())}</span>`)}${row(T('Kanji', '漢字'), J(e.k.join(' ')))}${row(T('First met', '初出'), `<span class="mono">${REC.firstMet[c.id] ? T(REC.firstMet[c.id], REC.firstMet[c.id]) : '—'}</span>`)}${row(T('Passages', '文例'), `<span class="mono">${(e.pass || []).length}</span>`)}</div>`;
    }
    if (c.t === 'k') {
      return `<div class="dl-head"><span class="dl-g" lang="ja">${c.id}</span><span class="dl-gloss">${esc(e.m)}</span></div>
        <div class="dts">${row(T('On', '音'), J((e.on || []).slice(0, 2).join('・') || '—'))}${row(T('Kun', '訓'), J((e.kun || []).slice(0, 2).join('・') || '—'))}${row(T('Strokes', '画数'), `<span class="mono">${e.st}</span>`)}${row(T('Kanken', '漢検'), `<span class="mono">${M().KK(e.kk)}</span>`)}${row(T('School grade', '学年'), `<span class="mono">${e.grade ?? '—'}</span>`)}${row('JLPT', `<span class="mono">${e.jlpt || '—'}</span>`)}</div>`;
    }
    const P = D.P[c.id] || {};
    return `<div class="dl-head"><span class="dl-g" lang="ja">${c.id}</span><span class="dl-gloss">${esc(P.m || e?.m || '')}</span></div>
      <div class="dts">${row(T('Name', '名前'), J(P.name || '—'))}${row(T('Radical no.', '部首番号'), `<span class="mono">${P.n || '—'}</span>`)}${row(T('Position', '位置'), `<span class="mono small">${esc(P.pos || '—')}</span>`)}${row(T('Strokes', '画数'), `<span class="mono">${P.st || '—'}</span>`)}${row(T('Carried by', '含む字'), `<span class="mono">${P.count || 0}</span>`)}${row(T('In your cards', 'カード内'), `<span class="mono">${countInCards(c.id)}</span>`)}</div>`;
  }
  function countInCards(p) { const { D } = M(); return D.cards.filter(c => c.term.split('').some(k => (D.K[k]?.parts || []).includes(p))).length; }

  function trailHTML() {
    const { S, T, esc, ICON } = M();
    const items = S.walk.map((n, i) => `${i ? '<span class="tr-sep">›</span>' : ''}<a href="#/words/${n.t}/${encodeURIComponent(n.id)}" class="tr ${i === S.walk.length - 1 ? 'cur' : ''}" lang="ja" data-ui-content-value="${esc(n.id)}">${esc(n.id)}</a>`).join('');
    const back = S.origin ? `<a class="origin btn quiet" href="${S.origin.hash}">${ICON.back}${esc(S.origin.label)}</a>` : '';
    return `<div class="trail"><span class="eyebrow">${T('Walk', '道筋')}</span><div class="tr-items">${items}</div></div>${back}`;
  }

  function plateHTML(c) {
    const ns = neighbours(c); const pos = layout(c, ns);
    return `<div class="leaders">${edgesHTML(pos)}</div><div class="ring" style="left:${CX}px;top:${CY}px"></div>${centreHTML(c)}${pos.map(nodeHTML).join('')}`;
  }

  function pushWalk(c) {
    const { S } = M(); const i = S.walk.findIndex(n => key(n) === key(c));
    if (i >= 0) S.walk = S.walk.slice(0, i + 1); else S.walk.push({ t: c.t, id: c.id });
    if (S.walk.length > 6) S.walk = S.walk.slice(-6);
  }

  function view(c) {
    const { T, sign, tombo } = M();
    c = c && info(c) ? c : { t: 'w', id: '推進' };
    pushWalk(c);
    const html = `${sign('WORDS', '辞書')}
      <header class="w-head"><div class="w-top"><h1>${T('Words', '辞書')}</h1><span class="data">${T('JMDICT · KANJIDIC2 · KANJIVG', '辞書・字典・筆順')}</span></div>
        <label class="look"><svg class="ico" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg><input type="search" placeholder="${T('Look up a word, kanji or part', '言葉・漢字・部品を引く')}" aria-label="${T('Look up', '引く')}"></label></header>
      <div class="w-trail">${trailHTML()}</div>
      <section class="plate" aria-label="${T('Word web', '言葉の網')}" style="height:${PH}px">${tombo()}<div class="grid-ruling" aria-hidden="true"></div><div class="plate-in">${plateHTML(c)}</div>
        <div class="legend data" aria-hidden="true"><span>${T('PARTS ▲', '部品 ▲')}</span><span>${T('◀ FAMILY ▶', '◀ 仲間 ▶')}</span><span>${T('CONTEXT ▼', '文脈 ▼')}</span></div></section>
      <section class="detail">${tombo()}<div class="detail-in">${detailHTML(c)}</div></section>`;
    return { room: 'words', html, after: el => { wire(el); enter(el); } };
  }

  function wire(el) {
    el.querySelector('.plate').addEventListener('click', ev => {
      const b = ev.target.closest('button.node'); if (!b) return;
      const n = b.dataset.k; const d = el.querySelector('.detail-in');
      el.querySelectorAll('.node.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
      d.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' });
      d.innerHTML = `<div class="dl-note"><span class="eyebrow">${b.querySelector('.eyebrow').textContent}</span><span class="dl-g" lang="ja">${b.querySelector('.pat').innerHTML}</span><p>${M().esc(findNote(n))}</p></div>`;
    });
  }
  function findNote(k) {
    const { D } = M(); const [t, id] = [k[0], k.slice(2)];
    for (const e of [...Object.values(D.W), ...Object.values(D.K), ...Object.values(D.P)]) {
      for (const g of e.gram || []) if (t === 'g' && g.g === id) return `${g.en}. ${g.ex}`;
      for (const c of e.cult || []) if (t === 'c' && c.t === id) return c.en;
    }
    return '';
  }

  function enter(el) {
    const { REDUCED } = M();
    const nodes = el.querySelectorAll('.plate .node'), edges = el.querySelectorAll('.plate .edge i, .plate .edge b'), centre = el.querySelector('.centre');
    if (REDUCED) return;
    centre.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.9)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
    nodes.forEach((n, i) => n.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.82)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 380, delay: 220 + i * 40, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
    edges.forEach((e, i) => e.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 420, delay: 160 + i * 18, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' }));
    strokesIn(el);
  }
  function strokesIn(el, delay = 260) {
    const { REDUCED } = M(); if (REDUCED) return;
    el.querySelectorAll('.centre .strokes path').forEach((p, i) => p.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: delay + i * 70, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' }));
    el.querySelectorAll('.centre .strokes text').forEach((p, i) => p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: delay + 120 + i * 70, fill: 'backwards' }));
  }

  // the match-cut: same glyph, same pixel origin, carried to the centre
  function recentre(h) {
    const { S, REDUCED } = M(); const el = S.view; if (!el || !el.querySelector('.plate')) return false;
    const m = h.match(/^\/words(?:\/([wkp])\/(.+))?$/); const c = m && m[1] ? { t: m[1], id: decodeURIComponent(m[2]) } : { t: 'w', id: '推進' };
    if (!info(c)) return false;
    const cur = el.querySelector('.centre'); if (cur && cur.dataset.k === key(c)) return true;
    const plate = el.querySelector('.plate-in');
    const old = {}; plate.querySelectorAll('[data-k]').forEach(n => { const g = n.querySelector('.g, .c-g, svg') || n; old[n.dataset.k] = { r: g.getBoundingClientRect(), centre: n.classList.contains('centre') }; });
    pushWalk(c);
    plate.innerHTML = plateHTML(c);
    el.querySelector('.w-trail').innerHTML = trailHTML();
    const det = el.querySelector('.detail-in'); det.innerHTML = detailHTML(c);
    if (REDUCED) return true;
    plate.querySelectorAll('[data-k]').forEach((n, i) => {
      const o = old[n.dataset.k]; const isC = n.classList.contains('centre');
      if (o) {
        const g = n.querySelector('.g, .c-g, svg') || n; const r = g.getBoundingClientRect();
        const s = o.r.width / Math.max(1, r.width);
        const dx = (o.r.left + o.r.width / 2) - (r.left + r.width / 2), dy = (o.r.top + o.r.height / 2) - (r.top + r.height / 2);
        n.animate([{ transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${s})`, opacity: isC ? 1 : .9 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: isC ? 640 : 520, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' });
      } else {
        n.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.8)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 360, delay: 340 + i * 35, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
      }
    });
    plate.querySelectorAll('.edge i, .edge b').forEach((e, i) => e.animate([{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 420, delay: 420 + i * 16, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' }));
    plate.querySelector('.ring').animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 520, delay: 300, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
    det.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 380, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
    strokesIn(el, 560);
    return true;
  }

  window.MigakiWeb = { view, recentre };
})();
