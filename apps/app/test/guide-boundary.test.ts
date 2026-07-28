/**
 * The guide's surface cannot write (Campaign E / B6; map document §4.3).
 *
 * `packages/domain/test/guide/boundary.test.ts` holds the kernel half: nothing
 * that decides memory state or review timing can reach or name a guide value.
 * This is the app half, and it asserts the other direction — that the guide's
 * *screen* cannot cause a write either.
 *
 * That matters separately. The kernel boundary would still hold if the guide
 * screen dispatched a `promote` command every time it proposed a station: no
 * guide value would have crossed into the gate, and the guide would still have
 * changed what the app believes about the learner. So the property here is
 * about the surface's own capabilities rather than about the values it passes:
 *
 *   1. Nothing under `src/ui/guide/` or in `guide-screen.tsx` calls
 *      `store.execute`, or imports anything that could mint or persist.
 *   2. The screen's only outward callback is the one verb the kernel's
 *      `GUIDE_ACTION_KINDS` allows — "go and look at this".
 *   3. The guide's words are labelled in the tree wherever they render, and the
 *      label comes from `@bunki/ai` rather than from a literal that could drift.
 *   4. The surface makes no claim the standing does not support: no level, no
 *      score, no percentage, and nothing that says a proposal is a record.
 *
 * As in the kernel half, each predicate is run against a deliberately violating
 * synthetic source, so a predicate loosened into one that passes on any input
 * fails here rather than passing quietly.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CANDIDATE_LABEL, OFFLINE_FALLBACK_LABEL } from '@bunki/ai';
import { GUIDE_ACTION_KINDS, GUIDE_AUTHORITY, GUIDE_BOUNDARY_RULE } from '@bunki/domain';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE_UI = resolve(APP_ROOT, 'src/ui/guide');
const GUIDE_SCREEN = resolve(APP_ROOT, 'src/screens/guide-screen.tsx');
const GUIDE_ROUTE = resolve(APP_ROOT, 'app/guide.tsx');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (['.ts', '.tsx'].includes(extname(full))) out.push(full);
  }
  return out;
}

const read = (file: string): string => readFileSync(file, 'utf8');
const rel = (file: string): string => relative(APP_ROOT, file);

/** Comments stripped: a rule has to be nameable in the prose that explains it. */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const guideFiles = [...walk(GUIDE_UI), GUIDE_SCREEN, GUIDE_ROUTE];
const guideSource = guideFiles.map((file) => stripComments(read(file))).join('\n');

// ---------------------------------------------------------------------------
// 0. The scan has something to scan
// ---------------------------------------------------------------------------

describe('the guide surface exists and is being read', () => {
  it('finds the whole surface', () => {
    expect(guideFiles.length).toBeGreaterThan(6);
    expect(guideFiles.map(rel)).toContain('src/screens/guide-screen.tsx');
    expect(guideFiles.map(rel)).toContain('app/guide.tsx');
  });
});

// ---------------------------------------------------------------------------
// 1. It cannot write
// ---------------------------------------------------------------------------

/** Every way this app can cause a write, by name. */
const WRITE_CALLS = [
  /\.execute\s*\(/,
  /persistMinted/,
  /createDomainEvent/,
  /applySessionCommand/,
  /sealMintedEvents/,
  /mintEvidence/,
  /admitToScheduler/,
];

describe('nothing on the guide surface can write', () => {
  it.each(guideFiles.map(rel))('%s calls nothing that writes', (file) => {
    const source = stripComments(read(resolve(APP_ROOT, file)));
    const offenders = WRITE_CALLS.filter((pattern) => pattern.test(source)).map(String);
    expect(
      offenders,
      `${file} can cause a write. The guide narrates and routes; it never records (map document §4.3).`,
    ).toEqual([]);
  });

  it('imports no store command type and no persistence seam', () => {
    for (const pattern of [/AppCommand/, /state\/persistence/, /@bunki\/persistence/]) {
      expect(pattern.test(guideSource), `the guide names ${String(pattern)}`).toBe(false);
    }
  });

  /**
   * The store is read, and only read.
   *
   * `useAppSnapshot` is where the learner's own position comes from — captures
   * and promotions, both events a person caused. `useAppStore` would hand the
   * surface an `execute`, so it is not imported at all: an unused capability is
   * still a capability, and the next person to need "just one command here"
   * would find it already in scope.
   */
  it('reads the snapshot and never takes the store itself', () => {
    expect(guideSource).toContain('useAppSnapshot');
    expect(guideSource).not.toContain('useAppStore');
  });
});

// ---------------------------------------------------------------------------
// 2. One verb
// ---------------------------------------------------------------------------

describe('the guide surface has one outward verb', () => {
  it('agrees with the kernel that there is exactly one', () => {
    expect(GUIDE_ACTION_KINDS).toEqual(['look_at']);
  });

  /**
   * The screen's prop list is the surface's whole vocabulary of consequences.
   *
   * `onOpenWord` navigates and `declaredBranches` is an input. Anything else
   * beginning `on…` would be a second thing the guide can cause, which is the
   * edit this assertion exists to make visible.
   */
  it('takes exactly one callback prop, and it navigates', () => {
    const screen = stripComments(read(GUIDE_SCREEN));
    const props = [...screen.matchAll(/readonly\s+(on[A-Z]\w*)\s*[?:]/g)].map(
      (match) => match[1] as string,
    );
    expect([...new Set(props)]).toEqual(['onOpenWord']);
  });

  it('wires that verb to a word page at the route and nowhere else', () => {
    const route = stripComments(read(GUIDE_ROUTE));
    expect(route).toContain('onOpenWord');
    expect(route).toContain('/word/');
    expect(route).not.toMatch(/execute|promote|grade/);
  });
});

// ---------------------------------------------------------------------------
// 3. Everything the guide says is labelled
// ---------------------------------------------------------------------------

describe('the guide’s words are labelled before they can be read', () => {
  const speech = read(resolve(GUIDE_UI, 'guide-speech.tsx'));
  const viewModel = read(resolve(GUIDE_UI, 'guide-view-model.ts'));

  it('takes the labels from @bunki/ai rather than retyping them', () => {
    expect(viewModel).toContain('CANDIDATE_LABEL');
    expect(viewModel).toContain('OFFLINE_FALLBACK_LABEL');
    const literals = guideFiles.filter((file) => read(file).includes(`'${CANDIDATE_LABEL}'`));
    expect(literals.map(rel), 'a screen holds the label as a literal').toEqual([]);
  });

  it('renders the label above the text, in source order', () => {
    // The test ids are template literals (`${testID}-label`), so the suffix is
    // what identifies them here. The browser half of this claim — that the
    // label's bounding box is above the text's — is `e2e/guide-label.spec.ts`.
    const labelAt = speech.indexOf('-label`');
    const textAt = speech.indexOf('-text`');
    expect(labelAt).toBeGreaterThan(-1);
    expect(textAt).toBeGreaterThan(-1);
    expect(labelAt, 'the guide’s text is rendered before its label').toBeLessThan(textAt);
  });

  /**
   * There is no branch in which the guide speaks unlabelled.
   *
   * The only component that renders a turn's words is `GuideSpeech`, and
   * `GuideSpeech` is the only place the text is read out of the turn record.
   * A second renderer is how the label gets left behind on one path.
   */
  it('has exactly one component that renders the guide’s words', () => {
    const renderers = guideFiles.filter((file) => /<GuideSpeech\b/.test(stripComments(read(file))));
    expect(renderers.map(rel)).toEqual(['src/ui/guide/guide-conversation.tsx']);
  });

  it('carries the fallback marker as a second label, never as a replacement', () => {
    // Both test ids exist, and the primary is not inside a conditional that the
    // secondary's absence could turn off.
    expect(speech).toContain('-fallback-label');
    expect(speech).toContain('labels.primary');
    expect(speech).toMatch(/labels\.secondary === null \? null :/);
    expect(OFFLINE_FALLBACK_LABEL).not.toBe(CANDIDATE_LABEL);
  });
});

// ---------------------------------------------------------------------------
// 4. It claims nothing the standing does not support
// ---------------------------------------------------------------------------

describe('the guide surface makes no claim about what the learner knows', () => {
  const FORBIDDEN = [
    /\byour level\b/i,
    /\bmastery\b/i,
    /\bfluency\b/i,
    /\bJLPT\b/i,
    /\bN[1-5]\b/,
    /\bscore\b/i,
    /\bstreak\b/i,
    /\bXP\b/,
    /\bbadge\b/i,
    /\bdays active\b/i,
    /\d+\s*%/,
  ];

  it.each(FORBIDDEN)('says nothing matching %s', (pattern) => {
    const offenders = guideFiles.filter((file) => pattern.test(read(file))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('renders the division of labour from the kernel’s own constant', () => {
    const panel = read(resolve(GUIDE_UI, 'guide-boundary.tsx'));
    expect(panel).toContain('GUIDE_AUTHORITY');
    expect(panel).toContain('GUIDE_BOUNDARY_RULE');
    // Both columns. A panel that listed only what the guide does would be
    // describing a chatbot.
    expect(panel).toContain('guideDecides');
    expect(panel).toContain('guideNeverDoes');
    expect(GUIDE_AUTHORITY.guideNeverDoes.length).toBeGreaterThan(3);
    expect(GUIDE_BOUNDARY_RULE).toMatch(/never/);
  });

  it('says plainly that its records are not part of the learner’s record', () => {
    const screen = read(GUIDE_SCREEN);
    expect(screen).toContain('not written to your record');
  });

  it('acknowledges the dictionary it displays, unconditionally', () => {
    const screen = read(GUIDE_SCREEN);
    const rendered = [...screen.matchAll(/<SeedEntryDisclosure[\s/>]/g)];
    expect(rendered.length).toBeGreaterThan(0);
    for (const match of rendered) {
      const preceding = screen.slice(Math.max(0, match.index - 24), match.index);
      expect(preceding, 'the acknowledgement is behind a condition').not.toMatch(/[?&]{1,2}\s*$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The scan fails what it is supposed to fail
// ---------------------------------------------------------------------------

describe('the surface scan catches a deliberate violation', () => {
  const WRITING_SCREEN = `
    export function GuideScreen({ onOpenWord }) {
      const store = useAppStore();
      const accept = () => store.execute({ kind: 'promote', threadId, to: 'learn' });
      return <AppButton label="Take it up" onPress={accept} />;
    }
  `;

  const UNLABELLED_SPEECH = `
    export function GuideSpeech({ text }) {
      return <Text testID="guide-speech-text">{text}</Text>;
    }
  `;

  it('sees a write on a guide screen', () => {
    const hits = WRITE_CALLS.filter((pattern) => pattern.test(stripComments(WRITING_SCREEN)));
    expect(hits.length).toBeGreaterThan(0);
  });

  it('sees a second callback prop appear', () => {
    const withTwo = `
      readonly onOpenWord: (form: string) => void;
      readonly onGradeIt: (form: string) => void;
    `;
    const props = [...withTwo.matchAll(/readonly\s+(on[A-Z]\w*)\s*[?:]/g)].map((m) => m[1]);
    expect(props).toEqual(['onOpenWord', 'onGradeIt']);
  });

  it('sees guide words rendered with no label above them', () => {
    expect(UNLABELLED_SPEECH.indexOf('-label"')).toBe(-1);
    expect(UNLABELLED_SPEECH.indexOf('-text"')).toBeGreaterThan(-1);
  });

  it('sees a forbidden claim in a plausible-looking line of copy', () => {
    const copy = 'Your level is around N3 — 62% mastery on reading.';
    const hits = [/\byour level\b/i, /\bN[1-5]\b/, /\d+\s*%/, /\bmastery\b/i].filter((pattern) =>
      pattern.test(copy),
    );
    expect(hits).toHaveLength(4);
  });
});
