/* global URL */
/** The look before the first paint (2026-11-14). The app puts the learner's stored look on the page at the end of its
 * start-up (boot(): setKairoTheme(themeId())), so every load painted the bare default, 藍, for about a quarter of a
 * second first. A few marked lines in the head of index.html now put the stored look on the html element before any
 * stylesheet is in. They cannot import the app's lists, so they carry two of their own: the looks, and the night looks.
 *
 * This is the guard against those lists drifting. The marked lines are read out of index.html. Their two lists are
 * compared with the app's own (THEME_UI, and the looks the actual setKairoTheme makes dark), and the lines are run
 * beside the actual themeId and setKairoTheme, lifted from the source, over the same storage, system setting and page:
 * the mark, the colour scheme and its meta tag must come out the same for every look, for a stored look the app does
 * not know, with nothing stored and with storage blocked, on a light and on a dark system. The lines never write to
 * storage. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, test } from 'vitest';
import { CORRIDOR, corridorDeclarations } from './corridor-declarations.mjs';

const BEGIN = '<!-- BEGIN look-before-first-paint -->';
const END = '<!-- END look-before-first-paint -->';
const index = readFileSync(new URL('index.html', CORRIDOR), 'utf8');
const count = (text, part) => text.split(part).length - 1;

/** the marked lines of the page, and the one script among them */
function headLines(html) {
  if (count(html, BEGIN) !== 1 || count(html, END) !== 1)
    throw new Error('index.html must carry the marked look-before-first-paint lines exactly once');
  const start = html.indexOf(BEGIN);
  const end = html.indexOf(END);
  const scripts = [...html.slice(start, end).matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gu)];
  if (start > end || scripts.length !== 1)
    throw new Error('the marked look-before-first-paint lines must hold exactly one script');
  return { start, end, attributes: scripts[0][1], code: scripts[0][2] };
}
/** a list as the head lines write it: var <name> = ['a', 'b']; */
function headList(code, name) {
  const found = new RegExp(`\\bvar ${name} = (\\[[^\\]]*\\]);`, 'u').exec(code);
  if (!found) throw new Error(`the look-before-first-paint lines name no list ${name}`);
  return JSON.parse(JSON.stringify(vm.runInNewContext(found[1])));
}

const lines = headLines(index);
const app = [
  corridorDeclarations('corridor.js', ['THEME_UI', 'THEME_STORE', 'setKairoTheme']),
  corridorDeclarations('modules/learner.mjs', ['themeId']),
].join('\n');
const appLooks = JSON.parse(
  JSON.stringify(vm.runInNewContext(`${app}\nTHEME_UI.map((look) => look.id);`)),
);

/** A page as both readers meet it: one stored look (null = nothing stored), a light or a dark system, and storage that
 * answers, throws when it is read (blocked: 'read') or throws when it is touched at all (blocked: 'touch'). */
function page({ stored = null, dark = false, blocked = '', matchMedia = true }) {
  const writes = [];
  const meta = {
    content: 'light',
    setAttribute(name, value) {
      if (name === 'content') this.content = value;
    },
  };
  const root = {
    mark: null,
    style: { colorScheme: '' },
    setAttribute(name, value) {
      if (name === 'data-theme') this.mark = value;
    },
  };
  const storage = {
    getItem(key) {
      if (blocked) throw new Error('storage is blocked');
      return key === 'kairo-theme' ? stored : null;
    },
    setItem(key, value) {
      if (blocked) throw new Error('storage is blocked');
      writes.push([key, value]);
    },
  };
  const media = (query) => ({ matches: dark && query === '(prefers-color-scheme: dark)' });
  const globals = {
    window: matchMedia ? { matchMedia: media } : {},
    document: {
      documentElement: root,
      querySelector: (selector) => (selector === 'meta[name="color-scheme"]' ? meta : null),
    },
    // the rest of setKairoTheme (the paper, the old first screen, the phone's bar) is not what the head lines do
    applyPaper() {},
    syncDriftTheme() {},
    syncThemeColor() {},
  };
  if (matchMedia) globals.matchMedia = media;
  Object.defineProperty(globals, 'localStorage', {
    enumerable: true,
    get() {
      if (blocked === 'touch') throw new Error('storage is blocked');
      return storage;
    },
  });
  return {
    globals,
    result: () => ({ mark: root.mark, colorScheme: root.style.colorScheme, meta: meta.content }),
    writes,
  };
}
/** what the head lines leave on a page, and what they wrote to storage */
function byHeadLines(setting, code = lines.code) {
  const at = page(setting);
  vm.runInNewContext(code, at.globals);
  return { ...at.result(), writes: at.writes };
}
/** what the app's own setKairoTheme(themeId()) leaves on the same page */
function byApp(setting) {
  const at = page(setting);
  vm.runInNewContext(`${app}\nsetKairoTheme(themeId());`, at.globals);
  return at.result();
}

const SYSTEMS = [
  ['a light system', false],
  ['a dark system', true],
];
const settings = [];
for (const [system, dark] of SYSTEMS) {
  for (const stored of [...appLooks, null, '', 'a-look-the-app-does-not-know']) {
    settings.push([`${JSON.stringify(stored)} stored, ${system}`, { stored, dark }]);
  }
  settings.push([`storage that throws when read, ${system}`, { blocked: 'read', dark }]);
  settings.push([`storage that throws when touched, ${system}`, { blocked: 'touch', dark }]);
}
settings.push(['nothing stored, a browser without matchMedia', { matchMedia: false }]);

describe('the look before the first paint (index.html) follows the app', () => {
  test('the marked lines stand once, in the head, above every stylesheet and below the colour-scheme meta they set', () => {
    expect(lines.attributes).toBe(''); // a plain script: one with src, defer, async or type="module" runs too late
    expect(lines.start).toBeGreaterThan(index.indexOf('<head>'));
    expect(lines.start).toBeGreaterThan(index.indexOf('<meta name="color-scheme"'));
    expect(index.indexOf('<meta name="color-scheme"')).toBeGreaterThan(-1);
    expect(lines.end).toBeLessThan(index.indexOf('<link rel="stylesheet"'));
    expect(lines.end).toBeLessThan(index.indexOf('</head>'));
  });

  test('its list of looks is the app’s list (THEME_UI)', () => {
    expect(headList(lines.code, 'ids').sort()).toEqual([...appLooks].sort());
  });

  test('its list of night looks is the looks the app’s setKairoTheme makes dark', () => {
    const appNight = appLooks.filter((stored) => byApp({ stored }).colorScheme === 'dark');
    expect(appNight.length).toBeGreaterThan(0);
    expect(headList(lines.code, 'night').sort()).toEqual(appNight.sort());
  });

  test.each(settings)(
    'the lines leave what setKairoTheme(themeId()) leaves, and write nothing: %s',
    (_name, setting) => {
      const head = byHeadLines(setting);
      expect(head.writes).toEqual([]);
      expect({ mark: head.mark, colorScheme: head.colorScheme, meta: head.meta }).toEqual(
        byApp(setting),
      );
    },
  );

  // The guard must fail on a fault. Each fault is planted in a copy of the lines, never in the page.
  test('a look missing from the lines, a night look missing from them, or a write to storage is caught', () => {
    const without = (code, name, look) => {
      const planted = code.replace(
        new RegExp(`(\\bvar ${name} = \\[[^\\]]*?)'${look}',? ?`, 'u'),
        '$1',
      );
      expect(planted).not.toBe(code);
      return planted;
    };
    const lostLook = without(lines.code, 'ids', 'shu');
    expect(headList(lostLook, 'ids')).not.toContain('shu');
    expect(byHeadLines({ stored: 'shu' }, lostLook).mark).not.toBe(byApp({ stored: 'shu' }).mark);
    const lostNight = without(lines.code, 'night', 'kaku');
    expect(headList(lostNight, 'night')).not.toContain('kaku');
    expect(byHeadLines({ stored: 'kaku' }, lostNight).colorScheme).not.toBe(
      byApp({ stored: 'kaku' }).colorScheme,
    );
    const writing = `${lines.code}\nlocalStorage.setItem('kairo-theme', 'shu');`;
    expect(byHeadLines({ stored: 'shu' }, writing).writes).toEqual([['kairo-theme', 'shu']]);
  });
});
