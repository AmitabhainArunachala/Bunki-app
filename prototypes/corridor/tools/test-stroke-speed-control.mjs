import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
const control = source.slice(source.indexOf('function strokeSpeedControl('), source.indexOf('/** The honest room:', source.indexOf('function strokeSpeedControl(')));
const speed = source.slice(source.indexOf("const STROKE_SPEED_KEY ="), source.indexOf('function stopInkRoom(', source.indexOf("const STROKE_SPEED_KEY =")));
function fixture(stored) {
  const memory = new Map(stored == null ? [] : [['kairo-stroke-speed-v1', stored]]), rewrites = [], fallback = [];
  const context = {
    S: {}, tx: (_ja, en) => en,
    localStorage: { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) },
    inkRoom: { handle: { rewrite: options => rewrites.push(options) } },
    startStrokeAnimation: page => fallback.push(page),
    el(tagName, className, textContent = '') {
      return { tagName, className, textContent, children: [], attributes: {}, handlers: {},
        append(...children) { this.children.push(...children); },
        setAttribute(key, value) { this.attributes[key] = value; },
        addEventListener(type, handler) { this.handlers[type] = handler; } };
    },
  };
  vm.createContext(context);
  vm.runInContext(`${speed}\n${control}\nthis.control = strokeSpeedControl; this.speed = strokeSpeed;`, context);
  return { context, memory, rewrites, fallback };
}

test('A fresh writing room has one three-position slider at Normal; both renderers obey changed speed', () => {
  const f = fixture();
  const page = { dataset: { living: 'on' } };
  const control = f.context.control(page), range = control.children.find(child => child.tagName === 'input');
  assert.equal(control.children.filter(child => child.tagName === 'input').length, 1);
  assert.equal(control.children.filter(child => child.tagName === 'button').length, 0);
  assert.equal(range.min, '0'); assert.equal(range.max, '2'); assert.equal(range.step, '1');
  assert.equal(range.value, '1'); assert.equal(range.attributes['aria-valuetext'], 'Normal');
  range.value = '0'; range.handlers.input(); range.handlers.change();
  assert.equal(f.memory.get('kairo-stroke-speed-v1'), '0.7'); assert.equal(f.rewrites[0].speed, 0.7);
  page.dataset.living = 'fallback';
  range.value = '2'; range.handlers.input(); range.handlers.change();
  assert.equal(f.memory.get('kairo-stroke-speed-v1'), '1.6'); assert.equal(range.attributes['aria-valuetext'], 'Fast');
  assert.equal(f.fallback.length, 1); assert.equal(f.fallback[0], page);
});

test('Existing continuous preferences recover to the nearest speed; invalid storage recovers to Normal', () => {
  for (const [stored, expected, position] of [['0.4', 0.7, '0'], ['1.0', 1.1, '1'], ['1.5', 1.6, '2'], ['invalid', 1.1, '1']]) {
    const f = fixture(stored), control = f.context.control({ dataset: {} });
    assert.equal(f.context.speed(), expected);
    assert.equal(control.children.find(child => child.tagName === 'input').value, position);
  }
});
