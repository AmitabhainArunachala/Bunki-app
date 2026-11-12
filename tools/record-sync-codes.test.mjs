import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const RENDERER = 'prototypes/corridor/record-sync.mjs';
const DESKTOP = 'prototypes/bunki-desktop/lib/record-sync-ipc.cjs';

const quoted = (text) => [...text.matchAll(/'([a-z][a-z-]*)'/gu)].map((match) => match[1]);

// The Set literal that starts at `const NAME = new Set(` and ends at its closing `]);` or `);`.
function setBody(source, name) {
  const start = source.indexOf(`const ${name} = new Set(`);
  if (start < 0) throw new Error(`${name} not found`);
  const end = source.indexOf(');', start);
  return source.slice(start, end);
}

function desktopCodes(source) {
  const store = setBody(source, 'STORE_CODES');
  const record = setBody(source, 'RECORD_CODES');
  expect(record).toContain('...STORE_CODES');
  return new Set([...quoted(store), ...quoted(record)]);
}

const rendererCodes = (source) => new Set(quoted(setBody(source, 'STORE_CODES')));

describe('record-sync error codes', () => {
  const renderer = readFileSync(RENDERER, 'utf8');
  const desktop = readFileSync(DESKTOP, 'utf8');

  it('the renderer and the desktop bridge keep the same codes', () => {
    const left = rendererCodes(renderer);
    const right = desktopCodes(desktop);
    expect(left.size).toBeGreaterThan(40);
    expect([...left].filter((code) => !right.has(code))).toEqual([]);
    expect([...right].filter((code) => !left.has(code))).toEqual([]);
  });

  it('notices a code added to one side only (negative control, in memory)', () => {
    const left = rendererCodes(renderer);
    const changed = desktop.replace("'busy',", "'busy', 'invented-code',");
    expect(changed).not.toBe(desktop);
    expect(desktopCodes(changed).has('invented-code')).toBe(true);
    expect(left.has('invented-code')).toBe(false);
    const dropped = renderer.replace("'busy',", '');
    expect(dropped).not.toBe(renderer);
    expect(rendererCodes(dropped).has('busy')).toBe(false);
    expect(desktopCodes(desktop).has('busy')).toBe(true);
  });
});
