/* look-seal.js · the look seal on every page (2026-11-13; round two 2026-11-14).
 * Round two added two small things that need a script and belong to the same matter, each in its own block:
 *   0 · the stored look is put on <html> as early as this file can run (it shortens the 藍 a load paints first;
 *       it cannot remove it: see the block and repo-patches/look-before-first-paint.md)
 *   2 · the 読 seal beside "Bookshelf" is inked in the chosen look (the app's picture is one navy file)
 * The seal itself (block 1) is as in round one, except its place: it now stands exactly where the app's own seal
 * stands on the first screen, 12 px from the top and 12 px from the right, in every room and on every page.
 *
 * The app draws its seal (the small tile in the upper right that opens the board of eleven looks) on the first
 * screen only. With a word's or a kanji's page open, or in a room, there was no way to change the look.
 * This keeps one seal in that corner whenever the app's own is not in the page: same size, same character, same
 * place. It goes away when the app's own seal is back, so there is never more than one.
 *
 * It does not change the look itself. A press calls the app's own code: the click of one of the app's own seals
 * (the one the first screen made, or the Look row of the gate's menu), which runs the app's openWorldPicker and,
 * on a stone, its setKairoTheme: the attribute on <html>, the stored choice "kairo-theme", the paper, the lot.
 * Those functions are inside the app's module and cannot be called by name from here; the app's own elements
 * carry them, and a click on one of them reaches them even when the app has taken that element off the page.
 *
 * It sits on <body>, never inside a top bar, and moves nothing. It writes nothing to storage and reads nothing
 * of the learner's record. It is not shown during a review (the review's own × stands at its place).
 * (colour round 2026-11-14) It now stands on the study deck's page and on its card as well, at the same place.
 * (colour round 2026-11-14, step "keys and strays") two more blocks:
 *   3 · TAKEN OUT AGAIN in the step "repair" (2026-11-15, the checker's finding 2): Me's "Light: Day or Night" keeping
 *       his look needed the layer to catch the app's own clicks and to write a note of its own to storage
 *       ("bunki-look-halves"): a behaviour, not a colour, in a round that changes colours only. It goes to the app,
 *       where it belongs: repo-patches/me-light-keeps-the-look.md. Until then Day gives 藍 and Night 金, as in the live
 *       files. The block as it was: shots/colour-20261114/repair/look-seal.next.with-block3.js.
 *   4 · the colour handed to the browser's own bar is the colour of the bar he sees at the top when a page is open,
 *       also right after a change of look. It writes the colour of meta[name="theme-color"] and nothing else. */
(function () {
  if (window.__bunkiLookSeal) return;
  window.__bunkiLookSeal = { version: 2 };

  /* 0 · the stored look, as early as this file can run (2026-11-14).
   * The app puts the stored look on <html> only at the end of its start-up, after the record has opened (built
   * corridor.js 4395: setKairoTheme(themeId()), after fourteen waits). Until then the page has no look and paints
   * the bare default, 藍. This file is loaded by live.js, which runs when the page has been read to its end: that
   * is earlier than the app's own line, so the stored look is put on here, with exactly what the app will put on
   * a moment later (themeId() in modules/learner.mjs 105, and the first three lines of setKairoTheme: the mark,
   * color-scheme, its meta tag). Nothing is written to storage.
   * THIS DOES NOT REMOVE THE OTHER LOOK, IT SHORTENS IT. The browser draws its first frame before any script at
   * the foot of the page can run, and that frame is 藍. The cure is in the page's head: see
   * repo-patches/look-before-first-paint.md. When that is in the app this block finds the mark already set and
   * does nothing. EARLY_LOOK = false leaves the look to the app alone. */
  var EARLY_LOOK = true;
  (function earlyLook() {
    if (!EARLY_LOOK) return;
    try {
      var de = document.documentElement;
      if (de.hasAttribute('data-theme')) return;                 // the app, or the page's head, has set it already
      var ids = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku'];
      var night = ['rokusho', 'yoru', 'nami', 'hakuu', 'kaku'];
      var id = '';
      try { id = localStorage.getItem('kairo-theme') || ''; } catch (e) { id = ''; }
      if (ids.indexOf(id) < 0) {
        id = 'hokusai';
        try { if (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) id = 'yoru'; } catch (e) { /* no matchMedia */ }
      }
      var dark = night.indexOf(id) >= 0;
      de.setAttribute('data-theme', id === 'hokusai' ? '' : id);
      de.style.colorScheme = dark ? 'dark' : 'light';
      var meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.setAttribute('content', dark ? 'dark' : 'light');
      window.__bunkiLookSeal.early = id;
    } catch (e) { /* the app sets the look itself a moment later */ }
  })();

  var ID = 'bunki-look-seal';
  var STYLE_ID = 'bunki-look-seal-style';
  // false (round two, his word "same place"): the very same place as on the first screen, 12 px from the top and
  // 12 px from the right, in every room and on every page. Measured at 1728 wide: the bar is 45 px high with its
  // hairline, the seal's tile is drawn from 22 to 46 px, so the tile's lower edge lies one pixel over the bar's
  // hairline. That one pixel is the price of the same place, and the brief chose it.
  // true (round one): on a page or in a room the seal stands on the bar's own line, 12 px higher than on the
  // first screen, with nothing over the bar's edge.
  var ON_THE_BAR = false;
  // the eleven seals, as the app lists them (corridor.js THEME_UI). Only used until the app has shown its own:
  // whatever the app prints on a seal or a stone is learned and used instead.
  var SEALS = { hokusai: '藍', sumi: '墨', shu: '朱', iwa: '柿', akafuji: '赤', keyblock: '板', rokusho: '漆', yoru: '金', kaku: '殻', nami: '浪', hakuu: '雷' };
  var learned = {};
  var openers = [];           // the app's own elements that open the board, newest first
  var seal = null;
  var openedByMe = false;     // the board on screen was opened from this seal
  var pendingGlyph = '';
  var pendingAt = 0;
  var queued = false;
  var lastSync = 0;
  var keep = null;            // where the page stood when the board opened
  var pageWas = false;        // (block 4) was a page open at the last look

  var root = document.documentElement;
  var lookKey = function () { return root.getAttribute('data-theme') || 'hokusai'; };
  var glyph = function () { var k = lookKey(); return learned[k] || SEALS[k] || '色'; };
  var shown = function (e) { return !!e && e.isConnected && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  var one = function (sel) { var list = document.querySelectorAll(sel); for (var i = 0; i < list.length; i += 1) if (shown(list[i])) return list[i]; return null; };
  var board = function () { return document.querySelector('body > .world-picker'); };
  var sheetOpen = function () { return one('#sheet'); };

  var CSS =
    // the app's own seal, rule for rule (corridor.css 449, editorial.css 4796, print.css 330): 44 by 44, 12 px from
    // the right edge, the look's character in the look's red on a tile of the look's raised paper.
    '#' + ID + '{position:fixed;top:calc(12px + env(safe-area-inset-top, 0px));right:12px;z-index:70;width:44px;height:44px;' +
    'display:flex;align-items:center;justify-content:center;margin:0;padding:0;border:0;border-radius:var(--radius-seal,3px);' +
    'background:transparent;box-shadow:none;color:color-mix(in oklab,var(--red,#b23a2a) 84%,#000);' +
    'font:800 var(--type-label,13px)/1 var(--display,"Shippori Mincho B1","Noto Serif JP",serif);letter-spacing:0;' +
    'cursor:pointer;isolation:isolate;touch-action:manipulation;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none;' +
    '-webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent}' +
    '#' + ID + '::after{content:"";position:absolute;inset:10px;z-index:-1;border-radius:var(--radius-seal,3px);' +
    'border:1px solid color-mix(in srgb,var(--red,#b23a2a) 75%,transparent);' +
    'background:color-mix(in srgb,var(--ground-0,#f6f1e6) 88%,transparent)}' +
    // (lead, 11-14, the checker's finding 8) at night the app's own seal on the first screen is the look's red as it is (殻 #ff6b4a, 金 #ef8079);
    // darkened as by day, this seal was a shade duller than that one, so the seal changed a little when a page opened
    "html:is([data-theme='rokusho'],[data-theme='yoru'],[data-theme='nami'],[data-theme='hakuu'],[data-theme='kaku']) #" + ID + '{color:var(--red,#ef8079)}' +
    // (step "repair", 2026-11-15, the checker's note) at night the bars are the print's light margins, and the tile, the
    // look's night paper at 88%, let 12% of that light through: the character read 3.8 to 4.0 to 1 on it (浪 雷 漆). The
    // tile is the look's night paper itself, as it is over the dark sky of the first screen.
    "html:is([data-theme='rokusho'],[data-theme='yoru'],[data-theme='nami'],[data-theme='hakuu'],[data-theme='kaku']) #" + ID + '::after{background:var(--ground-0,#251e16)}' +
    // where a bar runs along the top (every room, every page) the seal stands on the bar's own line, as the app's
    // gate does in the middle of the same bar (editorial.css 5185: the first screen's mark, at the bar's top)
    '#' + ID + '[data-on-bar]{top:env(safe-area-inset-top, 0px)}' +
    '#' + ID + ':focus{outline:none}' +
    '#' + ID + ':focus-visible{outline:2px solid var(--bar-ink,var(--ai,currentColor));outline-offset:2px}' +
    '#' + ID + '[data-on-bar]:focus-visible{outline-offset:-6px}' +
    // a small wake when the look has just changed: the first beat of the app's own (corridor.css seal-wake), without
    // its fade to a fifth, which on this seal would end in a jump back to full strength
    '@keyframes bunki-look-seal-wake{0%{transform:scale(1.18)}100%{transform:scale(1)}}' +
    '#' + ID + '.awake{animation:bunki-look-seal-wake .36s ease-out}' +
    '@media (prefers-reduced-motion:reduce){#' + ID + '.awake{animation:none}}' +
    // while the gate's menu is borrowed for a moment (see fromGate) it is never drawn
    'html[data-look-seal-busy] #gate-menu{visibility:hidden}' +
    // (colour round 2026-11-14) on the study deck's page and on its card too: the seal is the look's own control, not
    // a tool of the prototype, and "every single page" includes them. Never during a review (body.zen): the review's
    // own × stands at that very corner (1678, 4), and this seal would lie over it.
    'body.zen #' + ID + '{display:none}' +
    '@media print{#' + ID + '{display:none}}';

  function makeSeal() {
    var b = document.createElement('button');
    b.type = 'button';
    b.id = ID;
    b.setAttribute('tabindex', '0');
    b.setAttribute('aria-haspopup', 'dialog');
    b.addEventListener('click', function (e) { e.stopPropagation(); openBoard(); });
    // a press here is never a press on the page under it
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(function (t) { b.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true }); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return b;
  }

  /* the app's own seals: any of them, on the page now or taken off it, opens the app's own board */
  function scan() {
    var own = document.querySelectorAll('button#ginga-theme-seal, #app > .chrome > button#theme-seal, #stroke-world-seal, #nav-look, #settings-world');
    for (var i = 0; i < own.length; i += 1) { if (openers.indexOf(own[i]) < 0) openers.unshift(own[i]); }
    if (openers.length > 6) openers.length = 6;
    // what the app prints on its seal for this look is the character this seal prints too
    var s = document.querySelector('button#ginga-theme-seal, #app > .chrome > button#theme-seal, #nav-look #theme-seal');
    var t = s && (s.textContent || '').trim();
    if (t && t.length <= 2) learned[lookKey()] = t;
  }
  /* is one of the app's own look controls in front of the learner now? */
  function appSealInPage() {
    if (one('#gate-menu') || one('#stroke-world-seal')) return true;          // the menu's Look row; the writing room's seal
    if (sheetOpen()) return false;                                             // a page covers the room and its bar
    return !!one('button#ginga-theme-seal, #app > .chrome > button#theme-seal');
  }
  function wanted() {
    if (!document.body || document.body.dataset.ready !== '1') return false;
    if (document.body.classList.contains('zen')) return false;   // (2026-11-14) the deck's room is no longer left out
    return !appSealInPage();
  }
  function sync() {
    queued = false;
    try {
      scan();
      if (!document.getElementById(STYLE_ID)) { var st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st); }
      var on = wanted();
      if (on) {
        if (!seal) seal = makeSeal();
        var g = glyph();
        if (seal.textContent !== g) seal.textContent = g;
        var label = document.body.classList.contains('ui-bi') ? 'Colour theme' : '配色を選ぶ';
        if (seal.getAttribute('aria-label') !== label) seal.setAttribute('aria-label', label);
        // is a bar of the app's under this corner?
        var barEl = sheetOpen() ? one('#sheet > .sheet-bar') : one('#app > .chrome');
        var onBar = false;
        var below = '';
        if (barEl) {
          var br = barEl.getBoundingClientRect();
          var atTop = Math.abs(br.top) <= 1 && br.height >= 40 && br.height <= 72 && br.right >= window.innerWidth - 12;
          onBar = ON_THE_BAR && atTop;
          // in a narrow window the bar's own controls reach the corner: the seal never lies over one of them, it
          // hangs just under the bar instead
          if (atTop) {
            var y0 = onBar ? br.top : 12, x1 = window.innerWidth - 12, x0 = x1 - 44, kids = barEl.children;
            for (var k = 0; k < kids.length; k += 1) { var kr = kids[k].getBoundingClientRect(); if (kr.width > 0 && kr.height > 0 && kr.right > x0 - 4 && kr.left < x1 + 4 && kr.bottom > y0 && kr.top < y0 + 44) { onBar = false; below = Math.round(br.bottom + 6) + 'px'; break; } }
          }
        }
        if (seal.style.top !== below) seal.style.top = below;
        if (onBar !== seal.hasAttribute('data-on-bar')) { if (onBar) seal.setAttribute('data-on-bar', ''); else seal.removeAttribute('data-on-bar'); }
        if (seal.parentNode !== document.body) document.body.appendChild(seal);
        borrowForDeck();
        // never twice: one node, one id
        var all = document.querySelectorAll('#' + ID);
        for (var i = 0; i < all.length; i += 1) if (all[i] !== seal) all[i].remove();
      } else if (seal && seal.parentNode) {
        var had = document.activeElement === seal;
        seal.remove();
        if (had) { var back = one('button#ginga-theme-seal, #app > .chrome > button#theme-seal'); if (back) try { back.focus({ preventScroll: true }); } catch (e) {} }
      }
      if (openedByMe && !board()) boardClosed();
      // (step "keys and strays", block 4) a page has opened or closed: the browser's bar takes the page's bar
      var pageNow = !!sheetOpen();
      if (pageNow !== pageWas) { pageWas = pageNow; if (pageNow) barSoon(); }
    } catch (e) { /* the app goes on without this seal */ }
    if (document.querySelector('img.shelf-art')) shelfSync();
  }
  // at most one look at the page every 120 ms, however fast the page changes
  function queue() { if (queued) return; queued = true; var wait = Math.max(0, 120 - (Date.now() - lastSync)); setTimeout(function () { lastSync = Date.now(); sync(); }, wait); }
  /* an element of the app's that is off the page is the best one to press: nothing on the page takes the focus
     or scrolls when the board closes */
  function pickOpener() {
    for (var i = 0; i < openers.length; i += 1) if (!openers[i].isConnected) return openers[i];
    for (var j = 0; j < openers.length; j += 1) if (openers[j].isConnected) return openers[j];
    return null;
  }

  /* no seal of the app's has been made yet (the page was loaded straight into a room): the gate's menu has a Look
     row with the same press. The menu is opened and closed again in one step, before the screen is drawn. */
  function fromGate() {
    var have = document.getElementById('nav-look');
    if (have) return have;
    var gate = one('#sheet > .sheet-bar > button.bar-gate') || one('#app > .chrome > button.bar-gate');
    if (!gate || document.getElementById('gate-menu')) return null;
    root.setAttribute('data-look-seal-busy', '1');
    var look = null;
    try {
      gate.click();
      look = document.getElementById('nav-look');
      if (document.getElementById('gate-menu')) { var again = document.getElementById(gate.id) || gate; again.click(); }
    } catch (e) { /* nothing opened */ }
    root.removeAttribute('data-look-seal-busy');
    return look;
  }
  /* (colour round 2026-11-14) a sitting at the deck has no bar and no gate, so a press on the card's seal had nothing
     of the app's to borrow when the page had made no seal of its own (it was loaded straight into a room or the deck).
     On the deck's own page, which has the gate, the Look row is borrowed once, the way a press borrows it above, and
     kept: a press on the card then opens the app's board. Once per page; never while a menu or the board is open; the
     focus and the page's place are put back as they were. Nothing is written anywhere. */
  var borrowedForDeck = false;
  function borrowForDeck() {
    if (borrowedForDeck || openers.length || root.getAttribute('data-room') !== 'deckplay') return;
    if (board() || document.getElementById('gate-menu') || !one('#app > .chrome > button.bar-gate')) return;
    borrowedForDeck = true;
    var was = document.activeElement, sx = window.scrollX, sy = window.scrollY;
    var look = fromGate();
    if (look && openers.indexOf(look) < 0) openers.unshift(look);
    try {
      if (document.activeElement !== was) { if (was && was !== document.body && was.isConnected && was.focus) was.focus({ preventScroll: true }); else if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
      if (window.scrollX !== sx || window.scrollY !== sy) window.scrollTo(sx, sy);
    } catch (e) { /* as it was */ }
  }
  function place(pop) {
    // the app's own rule for where the board hangs (corridor.js openWorldPicker): under the seal, inside the window
    var r = seal.getBoundingClientRect();
    var pw = pop.offsetWidth;
    pop.style.top = Math.round(Math.min(r.bottom + 8, window.innerHeight - pop.offsetHeight - 8)) + 'px';
    pop.style.left = Math.round(Math.min(Math.max(8, r.right - pw), window.innerWidth - pw - 8)) + 'px';
  }
  function openBoard() {
    if (!seal || board()) return;
    scan();
    var opener = pickOpener();
    if (!opener) { opener = fromGate(); if (opener && openers.indexOf(opener) < 0) openers.unshift(opener); }
    if (!opener) { try { console.warn('look seal: no seal of the app could be reached on this page'); } catch (e) {} return; }
    var sh = sheetOpen();
    keep = { x: window.scrollX, y: window.scrollY, sheet: sh, top: sh ? sh.scrollTop : 0 };
    try { opener.click(); } catch (e) { return; }      // the app's own openWorldPicker
    var pop = board();
    if (!pop) return;
    openedByMe = true;
    place(pop);
    seal.setAttribute('aria-expanded', 'true');
    // registered after the app's own Escape listener, so it runs after it: the board is closed by the app, and the
    // same key press goes no further (it must not also step out of the page under the board)
    document.addEventListener('keydown', afterEscape, true);
    window.addEventListener('resize', onResize);
  }
  function onResize() { var pop = board(); if (pop && openedByMe && seal) place(pop); }
  function afterEscape(e) {
    if (e.key !== 'Escape' || !openedByMe) return;
    e.stopPropagation();
    e.preventDefault();
    if (!board()) boardClosed();
  }
  function boardClosed() {
    openedByMe = false;
    document.removeEventListener('keydown', afterEscape, true);
    window.removeEventListener('resize', onResize);
    if (seal) {
      seal.removeAttribute('aria-expanded');
      // the app hands focus back to the seal that opened the board; this seal stood in for it
      if (seal.isConnected && !board()) try { seal.focus({ preventScroll: true }); } catch (e) {}
    }
    // and the page stays where it stood
    if (keep) { try { if (keep.sheet && keep.sheet.isConnected && keep.sheet.scrollTop !== keep.top) keep.sheet.scrollTop = keep.top; if (window.scrollX !== keep.x || window.scrollY !== keep.y) window.scrollTo(keep.x, keep.y); } catch (e) {} keep = null; }
  }

  /* a page keeps Tab inside itself (corridor.js, the page's own ring). This seal is one more stop on that ring,
     between its last control and its first. */
  function ringOf(sheet) {
    var list = sheet.querySelectorAll('summary, button, a[href], input, select, textarea, [tabindex]');
    var out = [];
    for (var i = 0; i < list.length; i += 1) { var it = list[i]; if (!it.disabled && it.tabIndex >= 0 && it.getClientRects().length > 0) out.push(it); }
    return out;
  }
  function onTab(e) {
    if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey || !seal || !seal.isConnected || board()) return;
    var sheet = sheetOpen();
    if (!sheet) return;
    var ring = ringOf(sheet);
    if (!ring.length) return;
    var here = document.activeElement, first = ring[0], last = ring[ring.length - 1], to = null;
    if (here === seal) to = e.shiftKey ? last : first;
    else if (!e.shiftKey && here === last) to = seal;
    else if (e.shiftKey && here === first) to = seal;
    if (!to) return;
    e.preventDefault();
    e.stopPropagation();
    try { to.focus(); } catch (x) {}
  }
  /* the character a stone carries is the character of the look it sets */
  function onStone(e) {
    var s = e.target && e.target.closest && e.target.closest('.world-stone');
    if (s) { pendingGlyph = (s.textContent || '').trim(); pendingAt = Date.now(); }
  }
  function onLook() {
    if (pendingGlyph && Date.now() - pendingAt < 4000) learned[lookKey()] = pendingGlyph;
    pendingGlyph = '';
    // the character changes in the same step as the look (round one changed it at the next look at the page, up to
    // 155 ms later)
    if (seal) { var g = glyph(); if (seal.textContent !== g) seal.textContent = g; }
    if (seal && seal.isConnected) { seal.classList.remove('awake'); requestAnimationFrame(function () { if (seal) seal.classList.add('awake'); }); }   /* (lead, 11-14, from the checker) no layout forced in the middle of the app's change of look */
    shelfSync();
    barSoon();
    lastSync = 0; queue();
  }

  /* (block 3, Me's "Light: Day or Night", was here: taken out in the step "repair"; see the header) */

  /* 4 · the colour handed to the browser's own bar (colour round 2026-11-14, step "keys and strays"; the checker's
   * finding 12). The app hands the browser the colour of the room's bar (built corridor.js 35832, syncThemeColor) when
   * the look changes or a room is drawn. With a page open, the bar at the top is the page's own bar; over the first
   * screen the room's bar has no colour, so the app leaves the colour as it was, and after a change of look the
   * browser kept the last look's colour. Here, when a page is open, the colour of the page's bar is handed on: once
   * the page is drawn after a change of look, when a page opens, and if the app writes another one while the page is
   * open. Only the content of meta[name="theme-color"] is set, and only when it differs. */
  function hexOf(c) {
    var n = String(c || '').match(/-?[0-9.]+/g); if (!n || n.length < 3) return '';
    if (n.length > 3 && +n[3] === 0) return '';
    var scale = String(c).indexOf('color(') === 0 ? 255 : 1;
    return '#' + n.slice(0, 3).map(function (v) { return Math.round(Math.max(0, Math.min(255, v * scale))).toString(16).padStart(2, '0'); }).join('');
  }
  function barColour() {
    try {
      var meta = document.querySelector('meta[name="theme-color"]'), sh = sheetOpen();
      if (!meta || !sh) return;
      var bar = sh.querySelector(':scope > .sheet-bar'); if (!bar) return;
      var hex = hexOf(getComputedStyle(bar).backgroundColor);
      if (hex && meta.getAttribute('content') !== hex) meta.setAttribute('content', hex);
    } catch (e) { /* the app's own colour stays */ }
  }
  function barSoon() { setTimeout(function () { requestAnimationFrame(barColour); }, 90); setTimeout(barColour, 480); }

  /* 2 · the 読 seal beside "Bookshelf" (round two).
   * The app draws one picture there in every look: design/ink-hoku-nami.png, a brushed white 読 in a white frame on
   * a navy tile (corridor.js 6398). A stylesheet cannot re-ink a picture. Here the same picture is read once and
   * printed again in two inks of the chosen look, tone for tone, so its shape and its brush marks are the same and
   * only the two colours change:
   *     the tile      the look's one dark, the ink the head of a word's page is printed in (--head-ink);
   *                   in the night looks the look's own night (--zen-stage)
   *     the strokes   the look's paper white (--print-white); in the night looks the look's light ink (--ink)
   * It is handed to the app through the door the app already has for another picture (window.__KAIRO_SHELF_ART_URL__),
   * so the Read list is drawn with it from the start, and it is put on a seal that is already on the page.
   * 藍 keeps the app's own file: that navy is 藍's own. With the 深 switch off the app's own file is back.
   * If the picture cannot be read, or another picture has been handed to the app by someone else, nothing is done. */
  var SHELF_FILE = 'design/ink-hoku-nami.png';
  var NIGHT = { rokusho: 1, yoru: 1, nami: 1, hakuu: 1, kaku: 1 };
  var shelf = { base: null, asked: false, made: {}, mine: '', px: null };
  function inkOf(name) {
    // one of the look's named colours as the page works it out, as three numbers; null if the page has no such name yet
    try {
      if (!getComputedStyle(document.body).getPropertyValue(name).trim()) return null;
      var el = document.createElement('i');
      el.style.cssText = 'position:absolute;left:-9px;top:-9px;width:0;height:0;visibility:hidden;color:var(' + name + ')';
      document.body.appendChild(el);
      var c = getComputedStyle(el).color;
      el.remove();
      if (!shelf.px) { shelf.px = document.createElement('canvas'); shelf.px.width = shelf.px.height = 1; }
      var x = shelf.px.getContext('2d', { willReadFrequently: true });
      x.clearRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1);
      var d = x.getImageData(0, 0, 1, 1).data;
      return d[3] < 250 ? null : [d[0], d[1], d[2]];
    } catch (e) { return null; }
  }
  function shelfPrint(look) {
    /* (lead, 11-14, from the checker) the two inks are read once per look: reading them puts a probe on the page, and the probe woke this script's own watcher 16 times a second on the Read list */
    shelf.inks = shelf.inks || {};
    var two = shelf.inks[look];
    if (!two || !two[0] || !two[1]) two = shelf.inks[look] = [inkOf(NIGHT[look] ? '--zen-stage' : '--head-ink'), inkOf(NIGHT[look] ? '--ink' : '--print-white')];
    var dark = two[0], light = two[1];
    if (!dark || !light || !shelf.base) return '';
    var key = look + ' ' + dark.join(',') + ' ' + light.join(',');
    if (shelf.made[key]) return shelf.made[key];
    try {
      var n = 320, cv = document.createElement('canvas');
      cv.width = cv.height = n;
      var x = cv.getContext('2d', { willReadFrequently: true });
      x.drawImage(shelf.base, 0, 0, n, n);
      var im = x.getImageData(0, 0, n, n), d = im.data, hist = new Array(256).fill(0), i, g;
      for (i = 0; i < d.length; i += 4) { g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]); hist[g] += 1; }
      // the picture's own darkest and lightest tones: its tile and its strokes (2 in 100 left out at either end)
      var total = n * n, lo = 0, hi = 255, acc = 0;
      for (i = 0; i < 256; i += 1) { acc += hist[i]; if (acc >= total * 0.02) { lo = i; break; } }
      acc = 0;
      for (i = 255; i >= 0; i -= 1) { acc += hist[i]; if (acc >= total * 0.02) { hi = i; break; } }
      if (hi - lo < 40) return '';
      for (i = 0; i < d.length; i += 4) {
        g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        var t = Math.max(0, Math.min(1, (g - lo) / (hi - lo)));
        d[i] = Math.round(dark[0] + (light[0] - dark[0]) * t);
        d[i + 1] = Math.round(dark[1] + (light[1] - dark[1]) * t);
        d[i + 2] = Math.round(dark[2] + (light[2] - dark[2]) * t);
      }
      x.putImageData(im, 0, 0);
      shelf.made[key] = cv.toDataURL('image/png');
      return shelf.made[key];
    } catch (e) { return ''; }
  }
  function shelfSync() {
    try {
      // someone else's picture is in the app's door: it is theirs
      var given = window.__KAIRO_SHELF_ART_URL__;
      if (given && given !== shelf.mine) return;
      var look = lookKey();
      var imgs = document.querySelectorAll('img.shelf-art');
      var i;
      if (look === 'hokusai' || root.getAttribute('data-live-depth') !== '1') {
        if (shelf.mine) {
          for (i = 0; i < imgs.length; i += 1) if (imgs[i].getAttribute('src') === shelf.mine) imgs[i].src = SHELF_FILE;
          try { delete window.__KAIRO_SHELF_ART_URL__; } catch (e) { window.__KAIRO_SHELF_ART_URL__ = undefined; }
          shelf.mine = '';
        }
        return;
      }
      if (!shelf.base) {
        if (shelf.asked) return;
        shelf.asked = true;
        var im = new Image();
        im.onload = function () { shelf.base = im; shelfSync(); };
        im.onerror = function () { /* the app's own picture stays */ };
        im.src = SHELF_FILE;
        return;
      }
      var url = shelfPrint(look);
      if (!url) return;
      window.__KAIRO_SHELF_ART_URL__ = url;
      shelf.mine = url;
      for (i = 0; i < imgs.length; i += 1) if (imgs[i].getAttribute('src') !== url) imgs[i].src = url;
    } catch (e) { /* the app's own picture stays */ }
  }

  function start() {
    window.__bunkiLookSeal.sync = sync;
    document.addEventListener('keydown', onTab, true);
    document.addEventListener('click', onStone, true);
    // (step "keys and strays") block 4: the browser's bar (block 3 taken out in the step "repair")
    var metaBar = document.querySelector('meta[name="theme-color"]');
    if (metaBar) new MutationObserver(function () { if (sheetOpen()) barColour(); }).observe(metaBar, { attributes: true, attributeFilter: ['content'] });
    new MutationObserver(onLook).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    new MutationObserver(queue).observe(root, { attributes: true, attributeFilter: ['data-room'] });
    // the app's seal, a page, the gate's menu and the bars are all direct children of #app; the board and this
    // seal are children of <body>. Nothing deeper is watched (the sky redraws its own words many times a second).
    var watch = function () {
      new MutationObserver(queue).observe(document.body, { childList: true, attributes: true, attributeFilter: ['class', 'data-view', 'data-ready'] });
      var app = document.getElementById('app');
      if (app) new MutationObserver(queue).observe(app, { childList: true });
      return !!app;
    };
    if (!watch()) { var t = setInterval(function () { var app = document.getElementById('app'); if (app) { clearInterval(t); new MutationObserver(queue).observe(app, { childList: true }); queue(); } }, 300); }
    setInterval(queue, 1200);
    sync();
    // the 読 seal is printed before the Read list is first drawn; the design layer's own sheets (the look's dark and
    // its paper white) may come in a moment after this file, so it is looked at again
    new MutationObserver(function () { shelfSync(); }).observe(root, { attributes: true, attributeFilter: ['data-live-depth'] });
    shelfSync();
    setTimeout(shelfSync, 500);
    setTimeout(shelfSync, 1600);
    setTimeout(shelfSync, 4000);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
