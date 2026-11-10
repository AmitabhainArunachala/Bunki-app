/**
 * Two fixes from the never-merged PR #77 (origin/claude/renkan-round-b-2026-08-18, 3df6ed8f4), retyped into today's
 * files: (1) a drill undo (a bare [t,'dojo',key,0] row) is not an encounter and takes back the practice it revokes,
 * by the same rule the study mirror uses (study-host.mjs); (2) Tab stays inside the colour stones while they are open.
 * Shipped code, run with stub seams.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

const corridor = new URL('../prototypes/corridor/', import.meta.url);
const read = (path) => readFileSync(new URL(path, corridor), 'utf8');
function slice(text, start, end, label) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a);
  expect(a >= 0 && b > a && text.indexOf(start, a + 1) < 0, `one ${label}`).toBe(true);
  return text.slice(a, b);
}

function trail(obslog, lang = 'bi') {
  const source = [
    slice(read('modules/capture.mjs'), 'function encounterTrail(', '\nexport {', 'encounterTrail … renderEncounterTrail'),
    slice(read('modules/drift.mjs'), 'function trailLastPhrase(', '\n}\n', 'trailLastPhrase') + '\n}\n',
  ].join('\n');
  const node = (tag, cls, text) => ({ tag, className: cls || '', textContent: text || '', children: [], append(...kids) { this.children.push(...kids); } });
  const sheet = node('div');
  const context = {
    S: { obslog },
    TRAIL_KINDS: new Set(['tap', 'probe', 'dojo', 'lesson', 'reveal', 'drift']),
    tx: (ja, en) => (lang === 'bi' ? en : ja),
    el: node,
    withEn: (n) => n,
    srsKey: (t, id) => `${t}:${id}`,
    sheet,
  };
  runInNewContext(`${source}\nresult = encounterTrail('kanji:一');\nrenderEncounterTrail(sheet, { t: 'kanji', id: '一' });`, context);
  const lines = sheet.children[0]?.children.slice(1).map((p) => p.textContent) || [];
  return { ...context.result, lines };
}

describe('the encounter trail after a drill undo', () => {
  const day = 1794315780338;
  it('one drill taken back: one encounter, no practice, and the last line says it was taken back', () => {
    const t = trail([[day, 'dojo', 'kanji:一', 3, 'kanji'], [day + 1, 'dojo', 'kanji:一', 0]]);
    expect(t.met).toBe(1);
    expect(t.counts.dojo || 0).toBe(0);
    expect(t.lines[0]).toMatch(/· 1 encounter so far$/u);
    expect(t.lines[1]).toMatch(/took back a dojo practice$/u);
    expect(t.lines).toHaveLength(2);
  });

  it('grades and undos unwind in append order, as in the study mirror; other keys and kinds are untouched', () => {
    const t = trail([
      [day, 'tap', 'kanji:一', 1],
      [day + 1, 'dojo', 'kanji:一', 1, 'kanji'],
      [day + 2, 'dojo', 'kanji:一', 0],
      [day + 3, 'dojo', 'kanji:二', 3, 'kanji'],
      [day + 4, 'dojo', 'kanji:一', 3, 'kanji'],
      [day + 5, 'dojo', 'kanji:一', 4, 'kanji'],
      [day + 6, 'dojo', 'kanji:一', 0],
    ]);
    expect(t.met).toBe(2);
    expect(t.counts).toEqual({ tap: 1, dojo: 1 });
    expect(t.lines[2]).toBe('1 practice record — evidence, not mastery');
  });

  it('in Japanese the taken-back line reads 道場の稽古を取り消した', () => {
    const t = trail([[day, 'dojo', 'kanji:一', 3, 'kanji'], [day + 1, 'dojo', 'kanji:一', 0]], 'ja');
    expect(t.lines[0]).toMatch(/これまで 1回$/u);
    expect(t.lines[1]).toMatch(/道場の稽古を取り消した$/u);
  });
});

describe('the colour stones keep Tab inside', () => {
  function ring() {
    const source = slice(read('corridor.js'), 'function worldPickerTab(', '\n}\n', 'worldPickerTab') + '\n}\n';
    const focus = [];
    const stones = ['墨', '朱', '藍'].map((name) => ({ name, focus: () => { context.document.activeElement = stones.find((s) => s.name === name); focus.push(name); } }));
    const outside = { name: 'page' };
    const pop = { querySelectorAll: () => stones, contains: (n) => stones.includes(n) };
    const context = { worldPickerEls: [{}, pop], document: { activeElement: stones[0] }, focus };
    runInNewContext(source, context);
    const press = (key, shiftKey, at) => {
      context.document.activeElement = at === 'outside' ? outside : stones[at];
      let prevented = false;
      context.worldPickerTab({ key, shiftKey, preventDefault: () => { prevented = true; } });
      return { prevented, now: context.document.activeElement.name };
    };
    return press;
  }

  it('Tab on the last stone goes to the first; Shift+Tab on the first goes to the last; between them the browser walks', () => {
    const press = ring();
    expect(press('Tab', false, 2)).toEqual({ prevented: true, now: '墨' });
    expect(press('Tab', true, 0)).toEqual({ prevented: true, now: '藍' });
    expect(press('Tab', false, 0)).toEqual({ prevented: false, now: '墨' });
    expect(press('Escape', false, 2)).toEqual({ prevented: false, now: '藍' });
  });

  it('a focus that slipped outside is brought back in', () => {
    const press = ring();
    expect(press('Tab', false, 'outside')).toEqual({ prevented: true, now: '墨' });
    expect(press('Tab', true, 'outside')).toEqual({ prevented: true, now: '藍' });
  });

  it('the stones are a modal dialog, and opening and closing arm and disarm the ring', () => {
    const source = read('corridor.js');
    const open = slice(source, 'function openWorldPicker(', 'const WORLD_PICKER_HOLD_MS', 'openWorldPicker');
    const close = slice(source, 'function closeWorldPicker(', 'function openWorldPicker(', 'closeWorldPicker');
    expect(open).toContain("pop.setAttribute('aria-modal', 'true');");
    expect(open).toContain("document.addEventListener('keydown', worldPickerTab, true);");
    expect(close).toContain("document.removeEventListener('keydown', worldPickerTab, true);");
  });
});
