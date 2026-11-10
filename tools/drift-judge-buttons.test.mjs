/* global URL, process */
/**
 * Drift's two judgments as buttons (port of codex/kairo-drift-a11y-20260809, dba62c507): the slip a Drift word opens
 * carries まだ and 知っている, and each press grades that word through the sky's own grade(), the flick's path.
 * The shipped code runs here with stub seams; the browser walk proves the screen.
 */
import { execFileSync } from 'node:child_process';
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

describe('Drift judgment buttons', () => {
  it('the generated layer hands the host a judge that grades the touched node, as a flick does', () => {
    const source = slice(
      read('drift-layer.js'),
      'function hostedSlip(',
      'function slipFor(',
      'hostedSlip',
    );
    const graded = [];
    let options = null;
    const n = {
      kind: 'word',
      w: '出',
      r: 'で',
      g: 'exit',
      el: { isConnected: true, dataset: { ladderRung: '1' }, classList: { remove() {}, add() {} } },
    };
    const context = {
      n,
      graded,
      slipHost: () => ({
        open: (_kind, _key, given) => {
          options = given;
          return 'opened';
        },
      }),
      grade: (node, dir) => graded.push([node, dir]),
      stack: [],
      lockOn: false,
      unfolded: null,
      bloomFocus() {},
      collapseUnfold() {},
      mountHostedNodeReading() {},
      getComputedStyle: () => ({}),
      performance: { now: () => 0 },
    };
    runInNewContext(`${source}\nhostedSlip(n);`, context);
    expect(typeof options?.judge).toBe('function');
    options.judge(1);
    options.judge(-1);
    expect(graded).toEqual([
      [n, 1],
      [n, -1],
    ]);
  });

  it('the generated layer is in step with its generator', () => {
    execFileSync(
      process.execPath,
      [new URL('tools/build-drift-layer.mjs', corridor).pathname, '--check'],
      { stdio: 'pipe' },
    );
  });

  it('the slip row: まだ then 知っている in both languages; a press records the nomination, closes the slip, then grades', () => {
    const source =
      slice(read('corridor.js'), 'function driftJudgeRow(', '\n}\n', 'driftJudgeRow') + '\n}\n';
    const make = (lang) => {
      const calls = [];
      const node = (tag, cls, text) => {
        const attrs = new Map();
        const listeners = new Map();
        return {
          tag,
          className: cls || '',
          textContent: text || '',
          dataset: {},
          children: [],
          type: '',
          setAttribute: (k, v) => attrs.set(k, String(v)),
          getAttribute: (k) => attrs.get(k) ?? null,
          append(...kids) {
            this.children.push(...kids);
          },
          addEventListener: (type, fn) => listeners.set(type, fn),
          click(detail = 1) {
            listeners.get('click')({ detail, stopPropagation() {} });
          },
        };
      };
      const context = {
        calls,
        S: { lang },
        el: node,
        tx: (ja, en) => (lang === 'bi' ? en : ja),
        bi: () => lang === 'bi',
        interaction: (action, modality, sourceId) =>
          calls.push(['interaction', action.kind, action.judgment, modality, sourceId]),
        removeMini: () => calls.push(['removeMini']),
        focusDriftWordAfter: () => calls.push(['refocus']),
      };
      runInNewContext(
        `${source}\nrow = driftJudgeRow('word', (dir) => calls.push(['judge', dir]), {});`,
        context,
      );
      return { row: context.row, calls };
    };
    const en = make('bi');
    expect(en.row.getAttribute('role')).toBe('group');
    expect(en.row.children.map((b) => b.textContent)).toEqual(['Not yet', 'I know it']);
    expect(en.row.children.map((b) => b.dataset.judgment)).toEqual(['unknown', 'known']);
    expect(en.row.children.every((b) => b.type === 'button')).toBe(true);
    en.row.children[1].click(1);
    expect(en.calls).toEqual([
      ['interaction', 'judgment.nominate', 'known', 'pointer', 'drift-slip-word'],
      ['removeMini'],
      ['judge', 1],
    ]);
    const ja = make('ja');
    expect(ja.row.children.map((b) => b.textContent)).toEqual(['まだ', '知っている']);
    expect(ja.row.children[0].getAttribute('aria-label')).toBe('まだ知らない');
    ja.row.children[0].click(0);
    expect(ja.calls).toEqual([
      ['interaction', 'judgment.nominate', 'unknown', 'keyboard', 'drift-slip-word'],
      ['removeMini'],
      ['judge', -1],
      ['refocus'],
    ]);
  });
});
