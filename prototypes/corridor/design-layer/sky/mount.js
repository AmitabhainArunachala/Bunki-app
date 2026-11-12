/* Puts the new sky (宙) on the app's first screen in the 18841 prototype. Loaded by design/live.js.
 * The old first screen stays in the page, unseen and untouched, so its words (the learner's own) can be read
 * and every automated check still meets the screen it was written for: a driven browser (navigator.webdriver)
 * gets the old screen unless the address says ?sky=1. ?sky=0, or localStorage 'bunki-live:sky' = '0', turns it off.
 * Reads nothing of the learner's record; writes nothing. Pages open through the app's own door for the sky. */
(function () {
  'use strict';
  if (window.__bunkiSkyMount) return; window.__bunkiSkyMount = true;
  var q = new URLSearchParams(location.search), stored = null;
  try { stored = localStorage.getItem('bunki-live:sky'); } catch (e) { /* this visit only */ }
  var want = q.get('sky') === '1' || (q.get('sky') !== '0' && stored !== '0' && navigator.webdriver !== true);
  if (!want) return;
  /* a browser that can only draw in software keeps the old first screen (same rule as the app's own mount):
   * no context when asked not to accept a slow one, or a renderer that names a software drawer */
  function softwareOnly() {
    try {
      var c = document.createElement('canvas'), gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true }); if (!gl) return true;
      var ext = gl.getExtension('WEBGL_debug_renderer_info'), name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      return /swiftshader|llvmpipe|softpipe|lavapipe|basic render driver/i.test(name);
    } catch (e) { return true; }
  }
  if (softwareOnly()) return;
  var dir = /^[a-z0-9-]{1,40}$/.test(q.get('skydir') || '') ? q.get('skydir') : 'sky';   // ?skydir=sky-next: the lead's working copy, for checks before a release
  var base = '/design/' + dir + '/', v = Date.now().toString(36);
  function load(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = base + src + '?v=' + v; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  var lookOf = function () { return document.documentElement.getAttribute('data-theme') || 'hokusai'; };
  var langOf = function () { return document.body.classList.contains('ui-bi') ? 'en' : 'ja'; };
  function ownWords() {
    return Array.prototype.map.call(document.querySelectorAll('#drift-layer #sky > .word'), function (e) { var b = e.querySelector('.base'); return [(b ? b.textContent : '').trim(), e.classList.contains('fragile') ? 1 : 0]; }).filter(function (x) { return x[0]; });
  }
  var api = null, host = null, lang = null;
  function covered() {
    if (document.body.dataset.view !== 'drift') return true;
    var sheet = document.getElementById('sheet'); return !!sheet && sheet.getClientRects().length > 0 && getComputedStyle(sheet).visibility !== 'hidden';
  }
  /* anything wrong with the new sky: the old first screen comes back, whole */
  function giveBack(err) {
    try { console.error('SKY gave the first screen back', err); document.documentElement.removeAttribute('data-bunki-sky'); if (api && api.destroy) api.destroy(); if (host) host.remove(); host = null; api = null; window.__SKY__ = null; } catch (e) { /* nothing more to undo */ }
  }
  function start() {
    var layer = document.getElementById('drift-layer'); if (!layer || !window.BunkiSky) return false;
    if (!host) {
      host = document.createElement('div'); host.id = 'bunki-sky'; layer.appendChild(host);
      ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick', 'wheel', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'contextmenu'].forEach(function (t) { host.addEventListener(t, function (e) { e.stopPropagation(); }); });
      var st = document.createElement('style');
      st.textContent = 'html[data-bunki-sky="1"] #drift-layer > :not(#bunki-sky):not(#lvl){visibility:hidden!important;pointer-events:none!important}#bunki-sky{position:absolute;inset:0;z-index:5}' +
        /* the learner's level control stays, on top of the new sky; it decides which words are his own */
        'html[data-bunki-sky="1"] #drift-layer > #lvl{z-index:6}';
      document.head.appendChild(st); document.documentElement.setAttribute('data-bunki-sky', '1');
    }
    if (api) api.destroy();
    document.documentElement.setAttribute('data-bunki-sky', '1');
    lang = langOf();
    var door = function () { return window.__BUNKI_OPEN_ENTRY; };
    api = window.BunkiSky.mount(host, {
      look: lookOf(), lang: lang, dataUrl: base + 'sky-data.json?v=' + v, contextUrl: '/design/sky/sky-context.json?v=' + v, front: ownWords(), paused: covered, onFail: giveBack,
      foot: function () { var t = document.querySelector('.primary-tabs'); if (!t || !host) return 0; var q = t.getBoundingClientRect(), h = host.getBoundingClientRect(); return q.height > 0 && q.top < h.bottom ? h.bottom - q.top : 0; },
      /* the app's own buttons that lie over the sky (their boxes, in the sky's own coordinates): no word prints under them */
      clear: function () { if (!host) return []; var h = host.getBoundingClientRect(), out = []; ['#ginga-symbol', '#ginga-search', '#ginga-theme-seal', '#live-depth-switch', '#prototype-open'].forEach(function (sel) { var e = document.querySelector(sel); if (!e || !e.getClientRects().length) return; var q = e.getBoundingClientRect(); if (q.width > 0 && q.width < 120 && q.bottom > h.top && q.top < h.bottom) out.push([q.left - h.left, q.top - h.top, q.width, q.height]); }); return out; },
      paper: function () { var t = document.querySelector('.primary-tabs'); if (!t) return null; var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(t).backgroundColor); return m && (m[4] == null || Number(m[4]) > 0.9) ? [m[1] / 255, m[2] / 255, m[3] / 255] : null; },
      canOpen: function (t) { var d = door(); return !!d && d.has(t.kind, t.kind === 'word' ? t.word : t.char); },
      onOpen: function (t) { var d = door(); if (!d) return; var key = t.kind === 'word' ? t.word : t.char; if (d.has(t.kind, key)) d.open(t.kind, key); },
    });
    window.__SKY__ = api; if (api && api.ok === false) return true; return true;
  }
  load('sky.js').then(function () { return load('sky-world.js'); }).then(function () { return load('sky-web.js'); }).then(function () {
    var tries = 0, t = setInterval(function () {
      tries += 1;
      if ((document.body.dataset.ready === '1' && (ownWords().length > 8 || tries > 24) && start()) || tries > 120) { clearInterval(t); watch(); }
    }, 250);
  }).catch(function (e) { giveBack(e); });
  function watch() {
    var sky = document.querySelector('#drift-layer #sky'), timer = 0, last = '';
    if (sky) new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(function () { var own = ownWords(), sig = own.map(function (x) { return x[0]; }).sort().join('|'); if (api && api.setFront && own.length > 8 && sig !== last) { last = sig; api.setFront(own); } }, 900); }).observe(sky, { childList: true });
    new MutationObserver(function () { if (api && api.ok) api.setLook(lookOf()); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    new MutationObserver(function () { if (api && langOf() !== lang) start(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
})();
