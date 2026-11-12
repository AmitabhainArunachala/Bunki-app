/* Lead's live design switch for the 18841 prototype (2026-11-10).
 * Loaded by one line added to the served index.html. ON unless John has tapped 深 off (since 22:00;
 * before that it was off until tapped).
 * On: attaches the design folder's depth stylesheets to the real app and swaps them in place whenever
 * /design/depth/version.txt changes, so a change shows in his open app within about three seconds, with
 * no reload and no lost place. While on, the app's own folded copy (depth.css in the build) is set aside,
 * so the design folder is the one truth here. Off: the flat app, for comparison.
 * Writes one key of its own in localStorage (bunki-live-depth). Never touches the learner record. */
(function () {
  if (window.__bunkiLiveDepth) return;
  window.__bunkiLiveDepth = true;
  // The 糸 depth trial is retired (John, 2026-11-11 13:22, on a character's page: "immediately, without warning or
  // prompt, the tone and mood and theme change automatically"). The trial changed the look by itself: dusk on a word,
  // night on a character. Its switch was still on in his browser from the evening of 11-10. Here it is taken off
  // wherever it was left on; if the prototype layer had already started it on this page, the page loads once more
  // without it (once per browser session, so this can never loop). Until a builder takes the trial out of the
  // prototype layer, its switch in the 試 sheet is hidden by print.css.
  (function retireItoTrial() {
    var ITO = 'bunki-prototype:ito-depth:v1';
    var again = function () {
      try {
        if (document.documentElement.getAttribute('data-pl-ito') !== 'on') return;
        localStorage.removeItem(ITO);
        if (sessionStorage.getItem('bunki-live:ito-retired') === '1') return;
        sessionStorage.setItem('bunki-live:ito-retired', '1');
        location.reload();
      } catch (e) { /* this visit only */ }
    };
    try { if (localStorage.getItem(ITO) === '1') localStorage.removeItem(ITO); } catch (e) { /* this visit only */ }
    setTimeout(again, 700);
    setTimeout(again, 2600);
  })();
  // The new first screen (宙), from design/sky/. It decides by itself whether to show (see sky/mount.js).
  (function skyLayer() {
    try { var s = document.createElement('script'); s.src = '/design/sky/mount.js?v=' + Date.now().toString(36); s.async = true; document.head.appendChild(s); } catch (e) { /* the old first screen stays */ }
  })();
  var KEY = 'bunki-live-depth';
  var on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) { /* this visit only */ }
  var FILES = ['depth/depth.css', 'depth/kanji.css', 'depth/lead.css', 'depth/print.css'];
  var links = [];
  var ver = '';
  var style = document.createElement('style');
  style.textContent =
    '#live-depth-switch{position:fixed;left:12px;bottom:76px;z-index:2147483000;width:30px;height:30px;border-radius:7px;opacity:.92;' +
    'border:1px solid rgba(20,26,36,.5);background:#f3eee2;color:#141a24;font:600 14px/1 "Shippori Mincho B1","Noto Serif JP",serif;' +
    'cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.28);transition:background .18s ease,color .18s ease,transform .12s ease}' +
    '#live-depth-switch:active{transform:scale(.94)}' +
    '#live-depth-switch.on{background:#c5392b;color:#fff;border-color:#c5392b}' +
    /* never on the study card or a review: nothing of the prototype sits on a card */
    'html[data-room="deckplay"] #live-depth-switch,body.zen #live-depth-switch{display:none}' +
    '@media (prefers-reduced-motion:reduce){#live-depth-switch{transition:none}}';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'live-depth-switch';
  btn.textContent = '深';
  btn.title = 'Depth trial: on / off';
  btn.setAttribute('aria-label', 'Depth trial');
  function builtIn(disabled) {
    // the build's own folded copy: set aside while the live files are attached
    var own = document.querySelectorAll('link[rel="stylesheet"][href$="depth.css"]:not([data-live-depth-file])');
    for (var i = 0; i < own.length; i += 1) own[i].disabled = disabled;
  }
  function apply() {
    builtIn(on);
    if (on) {
      if (!links.length) {
        FILES.forEach(function (f) {
          var l = document.createElement('link');
          l.rel = 'stylesheet';
          l.setAttribute('data-live-depth-file', f);
          document.head.appendChild(l);
          links.push(l);
        });
      }
      links.forEach(function (l) { l.href = '/design/' + l.getAttribute('data-live-depth-file') + '?v=' + (ver || Date.now()); });
      document.documentElement.setAttribute('data-live-depth', '1');
    } else {
      links.forEach(function (l) { l.remove(); });
      links = [];
      document.documentElement.removeAttribute('data-live-depth');
    }
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  btn.addEventListener('click', function () {
    on = !on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* this visit only */ }
    apply();
  });
  function mount() {
    document.head.appendChild(style);
    document.body.appendChild(btn);
    apply();
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  /* The article's own picture is handed to the stylesheet as a variable, so the page can let it bleed into its
   * ground as a soft gradation (print.css). Read-only: one attribute and one custom property on <html>. */
  var coverTimer = 0;
  // the two pigments of an article's picture: its sky (the top band) and its horizon (the middle band)
  function pigments(img) {
    try {
      var c = document.createElement('canvas'); c.width = 16; c.height = 16;
      var x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, 16, 16);
      var d = x.getImageData(0, 0, 16, 16).data;
      var band = function (r0, r1) {
        var r = 0, g = 0, b = 0, n = 0;
        for (var y = r0; y < r1; y += 1) for (var i = 0; i < 16; i += 1) { var o = (y * 16 + i) * 4; r += d[o]; g += d[o + 1]; b += d[o + 2]; n += 1; }
        return [r / n, g / n, b / n];
      };
      // a pigment holds a little more colour than a picture's mean, and is never lighter than the paper under it
      var ink = function (q) {
        var m = (q[0] + q[1] + q[2]) / 3;
        return 'rgb(' + q.map(function (v) { return Math.round(Math.max(0, Math.min(236, m + (v - m) * 1.25))); }).join(' ') + ')';
      };
      return [ink(band(0, 5)), ink(band(6, 11))];
    } catch (e) { return null; }
  }
  var coverSrc = '';
  function cover() {
    var root = document.documentElement;
    var img = document.querySelector('#app > main > .reader-hero img.reader-picture-img');
    var src = img && (img.currentSrc || img.src);
    if (src && document.body && document.body.dataset.view === 'reader') {
      if (src === coverSrc && root.hasAttribute('data-cover')) return;
      if (!(img.complete && img.naturalWidth)) { img.addEventListener('load', cover, { once: true }); return; }
      var two = pigments(img);
      if (!two) return;
      coverSrc = src;
      root.style.setProperty('--cover-a', two[0]);
      root.style.setProperty('--cover-b', two[1]);
      root.setAttribute('data-cover', '1');
    } else if (root.hasAttribute('data-cover')) {
      coverSrc = '';
      root.removeAttribute('data-cover');
      root.style.removeProperty('--cover-a');
      root.style.removeProperty('--cover-b');
    }
  }
  // The first screen is the same print. Its words take their ink from the sky they stand in: paper white in the
  // deep pigment, the darkest ink where the pigment thins, their own ink on bare paper. Per look: the sky plate's
  // height over its width, then the two lines as fractions of the plate's height (measured on the plates, 23:45).
  var SKY = { hokusai: [843 / 2400, 0.40, 0.55], sumi: [948 / 2400, 0.20, 0.48], shu: [843 / 2400, 0.30, 0.40], akafuji: [843 / 2400, 0.35, 0.42], iwa: [843 / 2400, 0.445, 0.515] };
  // For the looks whose sky is one real plate, the ink of a word is chosen from the plate itself, at the place the
  // word stands: brush streaks make the sky darker or lighter than its row's average, and two words measured
  // 2.6 and 2.95 to 1 with a line drawn across the whole width (contrast walk, 2026-11-11 01:16).
  var PLATE = { hokusai: '/design/depth/art/bokashi-ai.webp', sumi: '/design/depth/art/bokashi-sumi.webp' };
  var BLOCK = { shu: 1, akafuji: 1, iwa: 1 };
  var plates = {};
  function lumOf(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    return 0.2126 * lin(parseInt(m[1], 16)) + 0.7152 * lin(parseInt(m[2], 16)) + 0.0722 * lin(parseInt(m[3], 16));
  }
  function plateOf(look, layer) {
    var p = plates[look];
    if (p) return p.ready ? p : null;
    var cs = getComputedStyle(layer);
    var v = function (n) { return cs.getPropertyValue(n).trim(); };
    var paper = v('--print-paper'), skyA = v('--sky-a'), skyB = v('--sky-b');
    var deepL = lumOf(v('--print-deep')), paperL = lumOf(paper);
    // the look's own colours are not on the page yet: try again at the next tick
    if (deepL == null || paperL == null || (BLOCK[look] && (lumOf(skyA) == null || lumOf(skyB) == null))) return null;
    // k: the sky on screen against this picture of it, measured row by row on real pictures (2026-11-11):
    // 0.78 to 0.85 for the two plates, 0.71 to 0.84 for the block print
    p = plates[look] = { ready: false, k: BLOCK[look] ? 0.76 : 0.8, deepL: deepL, paperL: paperL };
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = 320; c.height = Math.max(1, Math.round(320 * img.naturalHeight / img.naturalWidth));
        var x = c.getContext('2d', { willReadFrequently: true });
        if (!BLOCK[look]) x.drawImage(img, 0, 0, c.width, c.height);
        else {
          // the block print as the stylesheet lays it: pigment, the block over it (screen), paper over all (multiply)
          x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
          var gh = c.width * 0.34, g = x.createLinearGradient(0, 0, 0, gh);
          g.addColorStop(0, skyA); g.addColorStop(0.14, skyA); g.addColorStop(0.72, skyB); g.addColorStop(1, skyB);
          x.fillStyle = g; x.fillRect(0, 0, c.width, gh);
          x.globalCompositeOperation = 'screen'; x.drawImage(img, 0, 0, c.width, c.height);
          x.globalCompositeOperation = 'multiply'; x.fillStyle = paper; x.fillRect(0, 0, c.width, c.height);
          x.globalCompositeOperation = 'source-over';
        }
        p.w = c.width; p.h = c.height; p.d = x.getImageData(0, 0, c.width, c.height).data; p.ready = true;
      } catch (e) {}
    };
    img.src = PLATE[look] || '/design/depth/art/bokashi-block.webp';
    return null;
  }
  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  // the luminance of the ground at a point of the first screen (the plate is drawn 50% 0 / max(100%, 1500px) auto)
  function groundAt(p, x, y, pageW) {
    var pw = Math.max(pageW, 1500), ph = pw * p.h / p.w;
    var fx = (x - (pageW - pw) / 2) / pw, fy = y / ph;
    if (fy < 0 || fy >= 1 || fx < 0 || fx >= 1) return 0.66;
    var i = (Math.min(p.h - 1, Math.floor(fy * p.h)) * p.w + Math.min(p.w - 1, Math.floor(fx * p.w))) * 4;
    // the sky on screen is the plate multiplied by the paper and the ink layer: measured 0.78 to 0.85 of the plate's
    // own luminance in both looks (real picture against the plate, row by row, 2026-11-11 01:33)
    return p.k * (0.2126 * lin(p.d[i]) + 0.7152 * lin(p.d[i + 1]) + 0.0722 * lin(p.d[i + 2]));
  }
  function inkFor(p, r, pageW) {
    var lo = 1, hi = 0, y0 = r.top + r.height * 0.3, y1 = r.top + r.height * 0.7;
    for (var k = 0; k <= 4; k += 1) {
      var x = r.left + r.width * k / 4;
      var a = groundAt(p, x, y0, pageW), b2 = groundAt(p, x, y1, pageW);
      lo = Math.min(lo, a, b2); hi = Math.max(hi, a, b2);
    }
    if (lo >= 0.55) return '';                 // paper, or nearly: the word's own ink reads
    // deep sky under the whole word: paper-white ink (6.4 to 1 or more against the lightest ground under it)
    if (hi <= 0.105) return 'sky';
    // the sky is half way between pigment and paper here, and neither ink reads on it (measured 3.0 to 4.3 to 1,
    // 2026-11-11). Two remedies, whichever asks less of the sky under this word:
    //   a pool: the sky's own pigment laid deeper under the word, until its lightest part is 0.10; paper-white ink
    //   a wisp: paper laid over the sky under the word, until its darkest part is 0.34; the deepest ink
    // Colours are laid over each other in their encoded values, so the sums are done there (g), not in luminance.
    var g = function (L) { return Math.pow(Math.max(L, 0), 1 / 2.2); };
    var wisp = (g(0.34) - g(lo)) / Math.max(0.05, g(p.paperL) - g(lo));
    if (wisp <= 0.03) return 'haze';
    var pool = (g(hi) - g(0.10)) / Math.max(0.05, g(hi) - 0.2);
    var usePool = pool < wisp, need = usePool ? pool : wisp;
    var step = Math.min(6, Math.max(1, Math.ceil((need - 0.04) / 0.08)));
    return usePool ? 'sky p' + step : 'haze w' + step;
  }
  function skyInk() {
    var root = document.documentElement;
    var layer = document.getElementById('drift-layer');
    var k = on && SKY[root.getAttribute('data-theme') || 'hokusai'];
    // in every look: a word a learner can tap is marked near or mid from the layer's own faintness (0.3 to 0.7), so
    // the stylesheet can print it at full strength; under 0.3 (far ghosts, words fading, words dimmed round a
    // gathered family) nothing is marked
    if (on && layer && layer.classList.contains('active')) {
      var all = layer.querySelectorAll('#sky > .word');
      for (var j = 0; j < all.length; j += 1) {
        var oo = parseFloat(all[j].style.opacity);
        var dd = !(oo >= 0.3) ? '' : oo >= 0.5 ? 'near' : 'mid';
        if ((all[j].getAttribute('data-depth') || '') !== dd) {
          if (dd) all[j].setAttribute('data-depth', dd); else all[j].removeAttribute('data-depth');
        }
      }
    }
    if (!k || !layer || !layer.classList.contains('active')) {
      if (root.hasAttribute('data-sky-ink')) root.removeAttribute('data-sky-ink');
      return;
    }
    if (!root.hasAttribute('data-sky-ink')) root.setAttribute('data-sky-ink', '1');
    // the page's own width, not window.innerWidth: WebKit reports the visible width when the page is magnified
    var ph = Math.max(document.documentElement.clientWidth, 1500) * k[0];
    var white = ph * k[1];
    var deep = ph * k[2];
    var lookNow = root.getAttribute('data-theme') || 'hokusai';
    var plate = (PLATE[lookNow] || BLOCK[lookNow]) ? plateOf(lookNow, layer) : null;
    var pageW = document.documentElement.clientWidth;
    var ws = layer.querySelectorAll('#sky > .word, #sky > .scale-stars > *');
    for (var i = 0; i < ws.length; i += 1) {
      var r = ws[i].getBoundingClientRect();
      if (!r.width) continue;
      var y = r.top + r.height / 2;
      var zw = (plate ? inkFor(plate, r, pageW) : (y < white ? 'sky' : y < deep ? 'haze' : '')).split(' ');
      var z = zw[0], wisp = zw[1] || '';
      if ((ws[i].getAttribute('data-ink') || '') !== z) {
        if (z) ws[i].setAttribute('data-ink', z); else ws[i].removeAttribute('data-ink');
      }
      if ((ws[i].getAttribute('data-wisp') || '') !== wisp) {
        if (wisp) ws[i].setAttribute('data-wisp', wisp); else ws[i].removeAttribute('data-wisp');
      }
      // every word a learner can tap is readable: the layer's own faintness (0.3 to 0.7) becomes two strengths
      // of ink; what it keeps under 0.3 (far ghosts, words fading in or out) is left as it is
      var o = parseFloat(ws[i].style.opacity);
      var d = !(o >= 0.3) ? '' : o >= 0.5 ? 'near' : 'mid';
      if ((ws[i].getAttribute('data-depth') || '') !== d) {
        if (d) ws[i].setAttribute('data-depth', d); else ws[i].removeAttribute('data-depth');
      }
    }
  }
  setInterval(skyInk, 450);
  function watchCover() {
    var app = document.getElementById('app');
    if (!app) return;
    new MutationObserver(function () {
      if (coverTimer) return;
      coverTimer = setTimeout(function () { coverTimer = 0; cover(); }, 90);
    }).observe(app, { childList: true, subtree: true });
    cover();
  }
  if (document.body) watchCover(); else document.addEventListener('DOMContentLoaded', watchCover);
  setInterval(function () {
    fetch('/design/depth/version.txt?' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) {
        t = String(t).trim();
        if (t && t !== ver) {
          ver = t;
          if (on) links.forEach(function (l) { l.href = '/design/' + l.getAttribute('data-live-depth-file') + '?v=' + ver; });
        }
      })
      .catch(function () { /* server away: keep what is shown */ });
  }, 2500);
})();
