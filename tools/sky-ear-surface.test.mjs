/* global URL */
/** The ear on the sky leans on the sky's engine (the re-check's fr2, concern Q1; fix round 3, S1; ported to the
 * engine's version 3 on 2026-11-12, when version 1's W.hz was gone and the ear would have thrown on the sky).
 *
 * sky/mount.mjs is the app's own mount. To speak what stands under a point it asks the engine's own rule (a copy of
 * sky-world.js pick, unless the engine hands its pick out as W.pick), and to take an armed tap it wraps the engine's tap
 * so the ear is asked first, about the engine's own pick for that lift (askEarFirst). The engine, sky.js, sky-world.js
 * and sky-web.js, is the design seat's: nothing here changes it. If the engine changed what mount.mjs leans on, the ear
 * would go quiet on the sky, name the wrong word or throw, and nothing in the page would fail; only a check drawn on a
 * graphics card would see it. This test reads the three files and the mount as text, names every piece that is gone,
 * and fails when the mount reads any part of the engine this list does not pin. The negative controls break one piece
 * at a time in a copy and expect it named. The last block checks what the mount says for each kind of thing the engine
 * picks, grammar patterns most of all, over every pattern the sky's context holds. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SKY = new URL('../prototypes/corridor/sky/', import.meta.url);
const DATA = new URL('../prototypes/corridor/data/', import.meta.url);
const read = (name) => readFileSync(new URL(name, SKY), 'utf8');
const squeeze = (text) => text.replace(/\s+/gu, ' ').trim();
const noComments = (text) => text.replace(/\/\*[^]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

/** The body of `function <name>(<params>) {` up to the closing brace at the indentation it opened at. */
function body(text, head) {
  const at = text.indexOf(head);
  if (at < 0) return null;
  const line = text.lastIndexOf('\n', at) + 1;
  const indent = text.slice(line, at).match(/^ */u)[0];
  const end = text.indexOf(`\n${indent}}`, at);
  return end < 0 ? null : text.slice(at + head.length, end);
}
const PICK_HEAD = 'function pick(px, py, slop) {';
const COPY_HEAD = 'function enginePick(W, view, hits, px, py, slop) {';
/** The mount's ear: from its first comment to the line after askEarFirst. */
const hookOf = (mount) => {
  const from = mount.indexOf('/* The ear (modules/ear.mjs');
  const to = mount.indexOf('let api = null;');
  return from >= 0 && to > from ? mount.slice(from, to) : '';
};

/** [file, what mount.mjs leans on, a test of that file's text (and the mount's, for the pick)] */
const NEEDS = [
  [
    'sky.js',
    'window.BunkiSky.mount (mount.mjs mounts the sky with it)',
    (t) => /window\.BunkiSky = \{ mount\b/u.test(t),
  ],
  [
    'sky.js',
    'the api mount returns, with ok, S, wrap, ui and destroy (the hook measures against sky.wrap, reads sky.S.view, finds the captions in sky.ui)',
    (t) => /const api = \{ ok: true, S,[^\n]*\bwrap, ui\b[^\n]*\bdestroy\(\)/u.test(t),
  ],
  [
    'sky.js',
    "setLook writes the deep sky of the look on the wrap as --sky-deep (the mount says it as the marks' ground)",
    (t) => /wrap\.style\.setProperty\('--sky-deep', L\.c\[1\]\)/u.test(t),
  ],
  [
    'sky.js',
    'the world, and with it W.web, built inside mount before it returns (askEarFirst wraps W.web.tap right after)',
    (t) => /window\.BunkiSkyWorld\(api, opt\);[^\n]*\n[^\n]*\n\s*return api;/u.test(t),
  ],
  [
    'sky-world.js',
    'api.W, with W.ready set once the data is in',
    (t) => /const W = api\.W = \{ ready: false/u.test(t) && /W\.ready = true/u.test(t),
  ],
  [
    'sky-world.js',
    'S.view with over, the view from above, set every frame (the pick ignores words while over > 0.3)',
    (t) => /const view = S\.view = \{[^\n]*\bover: 0 \};/u.test(t) && /\bview\.over = e;/u.test(t),
  ],
  [
    'sky-world.js',
    'W.D, the data (words, kanji, parts) the hook names a pick by',
    (t) => /W\.D = D\b/u.test(t),
  ],
  [
    'sky-world.js',
    'W.rd, the readings the ear sends as kana',
    (t) => /W\.rd = D\.words\.map\(/u.test(t),
  ],
  [
    'sky-world.js',
    'W.hits, the words drawn in the latest frame',
    (t) =>
      /const hits = \[\]; W\.hits = hits;/u.test(t) &&
      /hits\.length = 0;/u.test(t) &&
      /hits\.push\(i\)/u.test(t),
  ],
  [
    'sky-world.js',
    'W.vis, five numbers a word (x, y, size, alpha, width)',
    (t) =>
      /W\.vis = new Float32Array\(n \* 5\)/u.test(t) &&
      /W\.vis\[o\] = x; W\.vis\[o \+ 1\] = y; W\.vis\[o \+ 2\] = s2; W\.vis\[o \+ 3\] = a; W\.vis\[o \+ 4\] = box\.w;/u.test(
        t,
      ),
  ],
  [
    'sky-world.js',
    'W.gHits, the grammar signs drawn in the latest frame ({ i, x, y, w, s }; a band name has i -1)',
    (t) =>
      /W\.gHits = \[\];/u.test(t) &&
      /W\.gHits\.length = 0;/u.test(t) &&
      /W\.gHits\.push\(\{ i: x\.i, x: X, y: Y, w: box\.w, s: size \}\)/u.test(t) &&
      /W\.gHits\.push\(\{ i: -1, /u.test(t),
  ],
  [
    'sky-world.js',
    'W.gramById, each pattern by its row with the printed pattern as p',
    (t) =>
      /W\.gramById = new Map\(g\.map\(\(x\) => \[x\.i, x\]\)\)/u.test(t) &&
      /\(r, i\) => \(\{ i, id: r\[0\], p: r\[1\],/u.test(t),
  ],
  [
    'sky-world.js',
    "the engine's pick, exactly as the mount's enginePick copies it (unless the engine hands it out as W.pick = pick)",
    (t, mount) => {
      if (/\bW\.pick = /u.test(t)) return /\bW\.pick = pick;/u.test(t);
      const engine = body(t, PICK_HEAD);
      const copy = body(mount, COPY_HEAD);
      return engine !== null && copy !== null && squeeze(engine) === squeeze(copy);
    },
  ],
  [
    'sky-world.js',
    "the lifted pointer's pick: a finger 14 px of reach, a mouse 5 (wordAt gives the same)",
    (t) => /const h = pick\(x, y, e\.pointerType === 'touch' \? 14 : 5\);/u.test(t),
  ],
  [
    'sky-world.js',
    'the one way into the tap: onUp calls W.web.tap(h, e) through the property, with its event and its own pick',
    (t) =>
      (t.match(/\.tap\(/gu) || []).length === 1 &&
      /const h = pick\(x, y, e\.pointerType === 'touch' \? 14 : 5\);\n\s*if \(W\.web\) W\.web\.tap\(h, e\); \};/u.test(
        t,
      ),
  ],
  [
    'sky-world.js',
    'onUp: a drag, and a touch on the ring seen from above, return before the tap (the ear is not asked there)',
    (t) => {
      const up = (/const onUp = \(e\) => \{([^]*?)\n {4}const onLeave/u.exec(t) || [])[1];
      if (!up) return false;
      const drag = up.indexOf('if (was) {');
      const over = up.indexOf('if (tgt.ov > 0.5 && view.over > 0.6) {');
      const tap = up.indexOf('W.web.tap(h, e)');
      return (
        drag >= 0 &&
        over > drag &&
        tap > over &&
        /turnEnd\(\); return; \}/u.test(up.slice(drag, over)) &&
        /setOver\(false\); return; \}/u.test(up.slice(over, tap))
      );
    },
  ],
  [
    'sky-world.js',
    'onUp bound to pointerup and pointercancel only (the two events that reach the tap)',
    (t) =>
      (t.match(/addEventListener\('[a-z]+', onUp\)/gu) || []).sort().join() ===
      "addEventListener('pointercancel', onUp),addEventListener('pointerup', onUp)",
  ],
  [
    'sky-world.js',
    'the web built at the end of the world, at once',
    (t) =>
      /if \(window\.BunkiSkyWeb\) window\.BunkiSkyWeb\(api, opt\);\n {2}\};\n\}\)\(\);/u.test(t),
  ],
  [
    'sky-web.js',
    'W.web made once, when the web is built (the wrapped tap stays on it)',
    (t) => (t.match(/W\.web = /gu) || []).length === 1 && /const web = W\.web = \{/u.test(t),
  ],
  [
    'sky-web.js',
    'web.tap a property of W.web, and every call into it through that property, so the wrapper is what is called',
    (t) => /web\.tap = \(h\) => \{/u.test(t) && (t.match(/(?<!\bweb)\.tap\(/gu) || []).length === 0,
  ],
  [
    'sky-web.js',
    "web.pick(px, py, slop), answering { t: 'i', item, id }",
    (t) =>
      /web\.pick = \(px, py, slop\) => \{[^\n]*return best \? \{ t: 'i', item: best, id: best\.key \} : null; \};/u.test(
        t,
      ),
  ],
  ['sky-web.js', 'web.isOpen()', (t) => /web\.isOpen = \(\) =>/u.test(t)],
  [
    'sky-web.js',
    "web.tap knows the picks the hook names: { t: 'w', i }, { t: 'g', i }, { t: 'i', item }",
    (t) =>
      /if \(h\.t === 'w'\) \{ open\('w', h\.i\); return; \}/u.test(t) &&
      /if \(h\.t === 'g'\) \{ open\('g', h\.i\); return; \}/u.test(t) &&
      /if \(h\.t === 'i'\) \{ const it = h\.item;/u.test(t),
  ],
  [
    'sky-web.js',
    'web items that say what they show: kind, id and text (a word, a character, a part, an opened pattern)',
    (t) =>
      ['w', 'k', 'p'].every((kind) =>
        new RegExp(`kind: '${kind}', id[:,][^\\n]*?text: `, 'u').test(t),
      ) && /kind: 'g', id, text: g\.p,/u.test(t),
  ],
  [
    'sky-web.js',
    'captions are DOM in the sky’s ui, each a div of class cap…, that take no pointer (a tap on one reaches the canvas)',
    (t) =>
      /web\.caps = c\.caps\.map\(\(cp\) => \{ const node = el\('div', cp\.cls\); cp\.build\(node\); ui\.append\(node\);/u.test(
        t,
      ) && /\n {2}\.cap \{[^}]*pointer-events: none;/u.test(t),
  ],
  [
    'sky-web.js',
    'a word’s sentence: a .cx block in its caption, its English in a span .en, its source and next button in a span .src',
    (t) =>
      /const w = W\.D\.words\[id\]\[0\], box = el\('div', 'cx'\)/u.test(t) &&
      /box\.append\(el\('span', 'en', row\[2\]\)\)/u.test(t) &&
      /src = el\('span', 'src', /u.test(t) &&
      /src\.append\(b\)/u.test(t),
  ],
  [
    'sky-web.js',
    "an opened pattern's examples: each a .exj row in the caption 'cap gram'",
    (t) => /cls: 'cap gram'/u.test(t) && /const row = el\('div', 'exj'\)/u.test(t),
  ],
];

/** What mount.mjs leans on that the engine no longer has, by name. */
export function missing(files, mount = read('mount.mjs')) {
  return NEEDS.filter(([file, , holds]) => !holds(files[file] ?? '', mount)).map(
    ([file, what]) => `${file}: ${what}`,
  );
}
const engine = () =>
  Object.fromEntries(['sky.js', 'sky-world.js', 'sky-web.js'].map((name) => [name, read(name)]));
/** Every distinct name read after `<prefix>.` in a text. */
const names = (text, prefix) =>
  [
    ...new Set(
      [...text.matchAll(new RegExp(`\\b${prefix}\\.([A-Za-z]+)(?![A-Za-z'])`, 'gu'))].map(
        (m) => m[1],
      ),
    ),
  ].sort();

describe("what the ear on the sky leans on in the sky's engine", () => {
  it('every piece mount.mjs leans on is in the engine', () => {
    expect(missing(engine())).toEqual([]);
  });
  it("mount.mjs reads no part of the engine's world that this test does not pin", () => {
    const mount = noComments(read('mount.mjs'));
    const hook = noComments(hookOf(read('mount.mjs')));
    expect(hook.length).toBeGreaterThan(1000);
    // the world, the web, the view and the data, read only as pinned above, and only by the ear's part of the mount
    expect(names(mount, 'W')).toEqual([
      'D',
      'gHits',
      'gramById',
      'hits',
      'pick',
      'rd',
      'ready',
      'vis',
      'web',
    ]);
    expect(names(mount.replace(hook, ''), 'W')).toEqual([]);
    expect(names(hook, 'web')).toEqual(['isOpen', 'pick', 'tap']);
    expect(names(hook, 'sky')).toEqual(['S', 'W', 'ui', 'wrap']);
    // the captions: by these classes, and nothing else of the ui
    const classes = [...new Set([...hook.matchAll(/'(\.[a-z][^']*)'/gu)].map((m) => m[1]))].sort();
    expect(classes).toEqual(['.cap', '.cap .cx, .cap .exj', '.en, .src, button']);
    expect(names(hook, 'S')).toEqual(['view']);
    expect(names(hook, 'view')).toEqual(['over']);
    expect(names(hook, 'D')).toEqual(['kanji', 'parts', 'words']);
    // a pick ({ t, i } or { t, item }), a grammar sign ({ i, x, y, w, s }), an item (kind, id, text), a pattern (p)
    expect(names(hook, 'h')).toEqual(['i', 'item', 's', 't', 'w', 'x', 'y']);
    expect(names(hook, 'it')).toEqual(['id', 'kind', 'text']);
    expect(names(hook, 'g')).toEqual(['p']);
    // wordAt gives a finger the engine's reach
    expect(hook).toMatch(/slop = pointer === 'touch' \? 14 : 5/u);
    // the engine's own pick is asked when it hands one out
    expect(hook).toMatch(
      /typeof W\.pick === 'function' \? W\.pick\(px, py, slop\) : enginePick\(/u,
    );
    // and the engine's own pick for a lift is what the ear is told about that lift
    expect(hook).toMatch(
      /lifted = \{ sky, x: event\.clientX, y: event\.clientY, h: h \|\| null \};/u,
    );
  });
  describe('negative controls: one piece broken in a copy is named', () => {
    const broken = (file, from, to) => {
      const files = engine();
      expect(files[file]).toContain(from);
      files[file] = files[file].replace(from, to);
      return missing(files);
    };
    it.each([
      ['sky-web.js', 'web.pick = (px, py, slop) =>', 'web.find = (px, py, slop) =>', 'web.pick'],
      ['sky-web.js', 'web.tap = (h) => {', 'const tap = (h) => {', 'web.tap a property'],
      ['sky-web.js', 'act: () => web.tap({ t: ', 'act: () => that.tap({ t: ', 'web.tap a property'],
      [
        'sky-web.js',
        "if (h.t === 'g') { open('g', h.i); return; }",
        "if (h.t === 'gram') { open('g', h.i); return; }",
        'web.tap knows the picks',
      ],
      [
        'sky-world.js',
        'if (W.web) W.web.tap(h, e); };',
        'if (W.web) W.web.tap(h); };',
        'the one way into the tap',
      ],
      [
        'sky-world.js',
        'W.vis = new Float32Array(n * 5)',
        'W.vis = new Float32Array(n * 6)',
        'W.vis, five numbers',
      ],
      [
        'sky-world.js',
        "e.pointerType === 'touch' ? 14 : 5",
        "e.pointerType === 'touch' ? 18 : 5",
        'a finger 14 px',
      ],
      [
        'sky-world.js',
        'W.vis[o + 2] * 0.62 + slop',
        'W.vis[o + 2] * 0.7 + slop',
        "the engine's pick, exactly",
      ],
      ['sky-world.js', 'if (view.over > 0.3) return null;', '', "the engine's pick, exactly"],
      [
        'sky-world.js',
        'const z = -W.vis[o + 2];',
        'const z = W.hz[i];',
        "the engine's pick, exactly",
      ],
      [
        'sky-world.js',
        'W.gHits.push({ i: x.i, x: X, y: Y, w: box.w, s: size })',
        'W.gHits.push({ g: x.i, x: X, y: Y, w: box.w, s: size })',
        'W.gHits',
      ],
      [
        'sky-world.js',
        'W.gramById = new Map(g.map((x) => [x.i, x]))',
        'W.gramByRow = new Map(g.map((x) => [x.i, x]))',
        'W.gramById',
      ],
      ['sky-world.js', 'view.over = e;', 'view.above = e;', 'S.view with over'],
      [
        'sky-world.js',
        'if (tgt.ov > 0.5 && view.over > 0.6) {',
        'if (false) {',
        'onUp: a drag, and a touch on the ring',
      ],
      [
        'sky-world.js',
        "wrap.addEventListener('pointerup', onUp);",
        "wrap.addEventListener('pointerup', onUp); wrap.addEventListener('click', onUp);",
        'pointerup and pointercancel only',
      ],
      ['sky-world.js', 'const hits = []; W.hits = hits;', 'const hits = [];', 'W.hits'],
      [
        'sky-world.js',
        'if (window.BunkiSkyWeb) window.BunkiSkyWeb(api, opt);',
        'setTimeout(() => window.BunkiSkyWeb(api, opt));',
        'the web built at the end',
      ],
      [
        'sky.js',
        'if (window.BunkiSkyWorld) window.BunkiSkyWorld(api, opt);',
        'setTimeout(() => window.BunkiSkyWorld(api, opt));',
        'built inside mount',
      ],
      ['sky.js', 'const api = { ok: true, S, gl,', 'const api = { ok: true, gl,', 'the api mount'],
      [
        'sky.js',
        "wrap.style.setProperty('--sky-deep', L.c[1])",
        "wrap.style.setProperty('--sky-ground', L.c[1])",
        'setLook writes the deep sky',
      ],
      ['sky-web.js', "box = el('div', 'cx')", "box = el('div', 'sentence')", 'a word’s sentence'],
      [
        'sky-web.js',
        "const row = el('div', 'exj')",
        "const row = el('div', 'example')",
        'examples',
      ],
    ])('%s: %s → named', (file, from, to, named) => {
      const said = broken(file, from, to);
      expect(said.some((line) => line.startsWith(`${file}:`) && line.includes(named))).toBe(true);
    });
    it('the engine handing out a pick of its own that is not its pick is named', () => {
      const files = engine();
      files['sky-world.js'] = files['sky-world.js'].replace(
        'W.project = project;',
        'W.pick = () => null; W.project = project;',
      );
      expect(missing(files).some((line) => line.includes("the engine's pick"))).toBe(true);
    });
    it('the engine handing out its own pick is enough, whatever the copy says', () => {
      const files = engine();
      files['sky-world.js'] = files['sky-world.js'].replace(
        'W.project = project;',
        'W.pick = pick; W.project = project;',
      );
      const mount = read('mount.mjs').replace('if (view.over > 0.3) return null;', '');
      expect(missing(files, mount)).toEqual([]);
      expect(missing(engine(), mount).some((line) => line.includes("the engine's pick"))).toBe(
        true,
      );
    });
  });
});

/* ------------------------------------------------------------------ what the mount says for each pick */
/** The mount's own functions, lifted by name from its text (the module itself mounts a sky on import). */
function lift() {
  const mount = read('mount.mjs');
  const take = (re) => {
    const m = re.exec(mount);
    if (!m) throw new Error(`mount.mjs: ${re} not found`);
    return m[0];
  };
  const source = [
    take(/^function sayable\(reading\) \{[^]*?\n\}/mu),
    take(/^const OPTIONAL_AFTER_KANJI = [^\n]*\n/mu),
    take(/^const KANA_SAID = [^\n]*\n/mu),
    take(/^function formSaid\(form\) \{[^]*?\n\}/mu),
    take(/^function patternSaid\(pattern\) \{[^]*?\n\}/mu),
    take(/^function said\(sky, h\) \{[^]*?\n\}/mu),
  ].join('\n');
  return new Function(`${source}\nreturn { sayable, patternSaid, said };`)();
}
let lifted = null;
const patternSaid = (text) => (lifted ||= lift()).patternSaid(text);
const said = (sky, pick) => (lifted ||= lift()).said(sky, pick);
const patterns = () =>
  ['share_alike', 'proprietary_safe', 'original'].flatMap(
    (pool) =>
      JSON.parse(readFileSync(new URL(`${pool}/sky-context.json`, DATA), 'utf8')).grammar || [],
  );

describe('what the ear says for each thing the sky picks', () => {
  it.each([
    ['〜によると', 'によると'],
    ['〜そうだ（伝聞）', 'そうだ'],
    ['〜そうだ（様態）', 'そうだ'],
    ['〜と（条件）', 'と'],
    ['〜ため（に）', 'ために'],
    ['〜つつ（も）', 'つつも'],
    ['〜ゆえ（に）', 'ゆえに'],
    ['〜られる／〜される', 'られる、される'],
    ['〜前に／〜てから', '前に、てから'],
    ['どんなに〜ても', 'どんなに、ても'],
    ['〜か〜ないかのうちに', 'か、ないかのうちに'],
    ['〜てあげる・くれる・もらう', 'てあげる、くれる、もらう'],
    ['〜上（じょう）', 'じょう'],
    ['〜際（に）', '際に'],
    ['〜以上（は）', '以上は'],
  ])('the pattern %s is said %s', (printed, spoken) => {
    expect(patternSaid(printed)).toBe(spoken);
  });
  it('every pattern the sky holds is said as Japanese a voice can say, with no mark of print left', () => {
    const rows = patterns();
    expect(rows.length).toBeGreaterThan(200);
    const bad = rows
      .map((row) => [row[2], patternSaid(row[2])])
      .filter(
        ([, spoken]) =>
          !spoken ||
          /[〜～~…／/・･（）()［］[\]A-Za-z0-9０-９]/u.test(spoken) ||
          /^、|、$|、、/u.test(spoken),
      );
    expect(bad).toEqual([]);
  });
  const W = {
    D: {
      words: [
        ['熾烈', 'しれつ', 'fierce', 1, []],
        ['行く', 'いく; ゆく', 'go', 5, []],
      ],
      kanji: [['熾']],
      parts: [['氵', 'さんずい']],
    },
    rd: ['しれつ', 'いく; ゆく'],
    gramById: new Map([
      [7, { i: 7, p: '〜ため（に）' }],
      [8, { i: 8, p: '〜に違いない' }],
    ]),
  };
  const sky = { W };
  it.each([
    ['a word of the field', { t: 'w', i: 0 }, { text: '熾烈', reading: 'しれつ', id: 'w0' }],
    [
      'a word of an opened family',
      { t: 'i', item: { kind: 'w', id: 1, text: '行く' } },
      { text: '行く', reading: 'いく', id: 'w1' },
    ],
    [
      'a character',
      { t: 'i', item: { kind: 'k', id: 0, text: '熾' } },
      { text: '熾', reading: '', id: 'k0' },
    ],
    [
      'a part',
      { t: 'i', item: { kind: 'p', id: 0, text: '氵' } },
      { text: '氵', reading: 'さんずい', id: 'p0' },
    ],
    [
      'a grammar sign overhead, all kana',
      { t: 'g', i: 7 },
      { text: 'ために', reading: 'ために', id: 'g7' },
    ],
    [
      'a grammar sign overhead, with a kanji',
      { t: 'g', i: 8 },
      { text: 'に違いない', reading: '', id: 'g8' },
    ],
    [
      'an opened pattern',
      { t: 'i', item: { kind: 'g', id: 8, text: '〜に違いない' } },
      { text: 'に違いない', reading: '', id: 'g8' },
    ],
    ['a grammar row the sky does not hold', { t: 'g', i: 99 }, null],
  ])('%s', (_, pick, want) => {
    expect(said(sky, pick)).toEqual(want);
  });
});
