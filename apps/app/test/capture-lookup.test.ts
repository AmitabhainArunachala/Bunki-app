/**
 * Real lookups record real friction (T-07; full-review ledger P1-17).
 *
 * Before this work the `LookupFrictionLogged` channel fired only from the
 * scripted golden route, so the friction ledger was empty for every real
 * learner. These tests pin the capture surface's builder against the same
 * store command flow, and pin T-07's law where it now has a second caller: a
 * lookup mints exactly one grade-free event, moves no review memory, and is
 * refused by the evidence gate for FSRS by name.
 *
 * The browser half — the actual press on the shipped bundle writing the event
 * to the durable snapshot — is `e2e/kernel-honesty.spec.ts`.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createDeterministicContext, type DomainContext } from '@bunki/domain';

import { createMemoryAppStore } from '../src/state/memory-store.ts';
import { CAPTURE_LOOKUP_ID_PREFIX, captureLookupCommand } from '../src/state/lookup-friction.ts';

const INSTANTS = Array.from(
  { length: 20 },
  (_value, index) => `2026-08-16T00:00:${String(index).padStart(2, '0')}.000Z`,
);

const context = (prefix: string): DomainContext =>
  createDeterministicContext({ instants: INSTANTS, idPrefix: prefix });

const store = () => createMemoryAppStore({ context: context('lookup-') });

describe('captureLookupCommand', () => {
  it('names the gesture: capture context, seed-stable target, explicit user action', () => {
    const command = captureLookupCommand([], { targetType: 'lexeme', targetId: 'lex-bunki' });
    expect(command).toEqual({
      kind: 'recordLookupFriction',
      userAction: true,
      lookupId: `${CAPTURE_LOOKUP_ID_PREFIX}:lexeme:lex-bunki:0`,
      targetRef: { targetType: 'lexeme', targetId: 'lex-bunki' },
      context: 'capture',
    });
  });

  it('mints exactly one grade-free event through the domain evidence factory', () => {
    const app = store();
    const before = JSON.stringify(app.readDerived().memoryStates);

    const ack = app.execute(
      captureLookupCommand(app.readAll(), { targetType: 'lexeme', targetId: 'lex-bunki' }),
    );

    expect(ack.events).toHaveLength(1);
    const event = ack.events[0];
    expect(event?.type).toBe('LookupFrictionLogged');
    // T-07: the schema has no field a grade could ride in on.
    expect(event !== undefined && 'grade' in event).toBe(false);
    expect(event !== undefined && 'tier' in event).toBe(false);
    expect(event !== undefined && 'contractId' in event).toBe(false);

    // Review memory is byte-identical, and the gate names its refusal.
    expect(JSON.stringify(app.readDerived().memoryStates)).toBe(before);
    expect(app.readDerived().gateDecisions.at(-1)).toMatchObject({
      admitted: false,
      reason: 'lookup_is_friction_not_a_grade',
      effectiveGrade: null,
    });
  });

  it('deduplicates a double dispatch of one gesture', () => {
    const app = store();
    const log = app.readAll();
    const command = captureLookupCommand(log, { targetType: 'kanji', targetId: 'kan-ki' });

    const first = app.execute(command);
    const second = app.execute(command);

    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.events).toEqual([]);
    expect(app.readAll().filter((event) => event.type === 'LookupFrictionLogged')).toHaveLength(1);
  });

  it('records a later lookup of the same target as a new event, never a lifetime one', () => {
    const app = store();
    app.execute(
      captureLookupCommand(app.readAll(), { targetType: 'lexeme', targetId: 'lex-bunki' }),
    );
    // The log has grown, so the same target yields a fresh gesture id.
    const again = app.execute(
      captureLookupCommand(app.readAll(), { targetType: 'lexeme', targetId: 'lex-bunki' }),
    );

    expect(again.deduplicated).toBe(false);
    expect(again.events).toHaveLength(1);
    expect(app.readAll().filter((event) => event.type === 'LookupFrictionLogged')).toHaveLength(2);
  });
});

describe('the capture screen wires the real lookup gestures (source scan)', () => {
  const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const source = readFileSync(resolve(APP_ROOT, 'src/screens/capture-screen.tsx'), 'utf8');
  /** Source with comments stripped: what the screen does, not what it explains. */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('builds the command through the shared builder, never inline', () => {
    expect(code).toContain('captureLookupCommand');
    // No literal recordLookupFriction object in the screen: the builder is the
    // one place the id scheme and the context live.
    expect(code).not.toMatch(/kind:\s*'recordLookupFriction'/);
  });

  it('records on the deliberate doors — word page, kanji page, other matches', () => {
    // Both top-answer doors and the other-matches rows call the one recorder.
    const calls = code.match(/recordLookup\(\{/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(code).toMatch(/targetType:\s*'lexeme'/);
    expect(code).toMatch(/targetType:\s*'kanji'/);
  });

  it('does not record from an effect or a mount — a lookup is a press', () => {
    // The recorder is invoked only inside onPress handlers; the useEffect
    // blocks in this file must not call it (a route mount or an ambient
    // top-answer resolution is not a user action).
    for (const match of code.matchAll(/useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[/g)) {
      expect(match[1]).not.toContain('recordLookup(');
    }
  });
});
