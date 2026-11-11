/* global URL */
/** The ear on the sky leans on the sky's engine (the re-check's fr2, concern Q1; fix round 3, S1).
 *
 * sky/mount.mjs is the app's own mount. To speak the word under a point it repeats the engine's own pick (wordAt), and
 * to take an armed tap it wraps the engine's tap so the ear is asked first (askEarFirst). The engine, sky.js,
 * sky-world.js and sky-web.js, is the design seat's: nothing here changes it. If the engine changed what mount.mjs
 * leans on, the ear would go quiet on the sky or name the wrong word, and nothing in the page would fail; only a check
 * drawn on a graphics card would see it. This test reads the three files as text and names every piece that is gone.
 * The negative controls at the end break one piece at a time in a copy and expect it named. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SKY = new URL('../prototypes/corridor/sky/', import.meta.url);
const read = (name) => readFileSync(new URL(name, SKY), 'utf8');
const squeeze = (text) => text.replace(/\s+/gu, ' ').trim();

/** The engine's own pick (sky-world.js), as mount.mjs's wordAt repeats it: an open family's items first, then the field
 * of the latest frame (W.hits), five numbers a word in W.vis (x, y, size, alpha, width), the nearest by W.hz. */
const PICK = squeeze(`
      if (W.web) { const h = W.web.pick(px, py, slop); if (h) return h; if (W.web.isOpen()) return null; }
      let best = -1, bz = 1e9; for (const i of hits) { const o = i * 5, hw = W.vis[o + 4] / 2 + slop, hh = W.vis[o + 2] * 0.62 + slop; if (Math.abs(px - W.vis[o]) <= hw && Math.abs(py - W.vis[o + 1]) <= hh) { const z = W.hz[i]; if (z < bz) { bz = z; best = i; } } }
      return best >= 0 ? { t: 'w', i: best } : null;`);

/** [file, what mount.mjs leans on, a test of that file's text] */
const NEEDS = [
  [
    'sky.js',
    'window.BunkiSky.mount (mount.mjs mounts the sky with it)',
    (t) => /window\.BunkiSky = \{ mount\b/u.test(t),
  ],
  [
    'sky.js',
    'the api mount returns, with ok, wrap and destroy (wordAt measures a point against sky.wrap)',
    (t) => /const api = \{ ok: true,[^\n]*\bwrap\b[^\n]*\bdestroy\(\)/u.test(t),
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
    'W.D, the data (words, kanji, parts) wordAt names a pick by',
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
    'W.hz, the depth that makes the nearest word win',
    (t) => /W\.hz = new Float32Array\(n\)/u.test(t),
  ],
  [
    'sky-world.js',
    "the engine's pick exactly as wordAt repeats it",
    (t) => {
      const body = /function pick\(px, py, slop\) \{([^]*?)\n {4}\}/u.exec(t);
      return !!body && squeeze(body[1]) === PICK;
    },
  ],
  [
    'sky-world.js',
    "the lifted pointer's pick: a finger 14 px of reach, a mouse 5 (wordAt gives the same)",
    (t) => /const h = pick\(x, y, e\.pointerType === 'touch' \? 14 : 5\);/u.test(t),
  ],
  [
    'sky-world.js',
    'the one way into the tap: onUp calls W.web.tap(h, e) through the property, with its event',
    (t) =>
      (t.match(/\.tap\(/gu) || []).length === 1 &&
      /if \(W\.web\) W\.web\.tap\(h, e\); \};/u.test(t),
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
    'web.tap a property of W.web, so the wrapper is what the engine calls',
    (t) => /web\.tap = \(h\) => \{/u.test(t) && (t.match(/\.tap\(/gu) || []).length === 0,
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
    'web items that say what they show: kind, id and text',
    (t) =>
      ['w', 'k', 'p'].every((kind) =>
        new RegExp(`kind: '${kind}', id[:,][^\\n]*?text: `, 'u').test(t),
      ),
  ],
];

/** What mount.mjs leans on that the engine no longer has, by name. */
export function missing(files) {
  return NEEDS.filter(([file, , holds]) => !holds(files[file] ?? '')).map(
    ([file, what]) => `${file}: ${what}`,
  );
}
const engine = () =>
  Object.fromEntries(['sky.js', 'sky-world.js', 'sky-web.js'].map((name) => [name, read(name)]));

describe("what the ear on the sky leans on in the sky's engine", () => {
  it('every piece mount.mjs leans on is in the engine', () => {
    expect(missing(engine())).toEqual([]);
  });
  it("mount.mjs reads no part of the engine's world that this test does not pin", () => {
    const mount = read('mount.mjs')
      .replace(/\/\*[^]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');
    const fields = [...new Set([...mount.matchAll(/\bW\.([A-Za-z]+)/gu)].map((m) => m[1]))].sort();
    expect(fields).toEqual(['D', 'hits', 'hz', 'rd', 'ready', 'vis', 'web']);
    const web = [
      ...new Set([...mount.matchAll(/\bweb\.([A-Za-z]+)(?![A-Za-z'])/gu)].map((m) => m[1])),
    ].sort();
    expect(web).toEqual(['isOpen', 'pick', 'tap']);
    // wordAt's own copy of the pick: the same reach and the same box as the engine's
    expect(mount).toMatch(/slop = pointer === 'touch' \? 14 : 5/u);
    expect(mount).toMatch(
      /Math\.abs\(px - W\.vis\[o\]\) > W\.vis\[o \+ 4\] \/ 2 \+ slop \|\| Math\.abs\(py - W\.vis\[o \+ 1\]\) > W\.vis\[o \+ 2\] \* 0\.62 \+ slop/u,
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
        "the engine's pick exactly",
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
    ])('%s: %s → named', (file, from, to, named) => {
      const said = broken(file, from, to);
      expect(said.some((line) => line.startsWith(`${file}:`) && line.includes(named))).toBe(true);
    });
  });
});
