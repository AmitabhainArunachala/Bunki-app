/** Source/pure controls only. Actual renderer declarations and retained data;
 * CSS material contracts are not browser layout, contrast or screenshot proof. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';
import * as srsCore from '../srs-core.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.env.BUNKI_VISUAL_SOURCE_ROOT || fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const source = read('corridor.js');
const data = JSON.parse(read('data/share_alike/kanji.json'));
const official = JSON.parse(read('data/share_alike/radicals214.json'));
const radByGlyph = {};
for (const row of Object.values(official)) {
  radByGlyph[row.c] = row;
  if (row.var) radByGlyph[row.var] = row;
}
function declaration(name, text = source) {
  const ast = ts.createSourceFile('corridor.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert(node, `actual ${name}`);
  return node.getText(ast);
}
class Element {
  constructor(tag, cls = '', text = '') {
    this.tag = tag; this.className = cls; this.ownText = text; this.children = []; this.dataset = {};
    this.style = { setProperty() {} }; this.attributes = {}; this.handlers = {};
    this.classList = {
      add: name => { this.className = [...new Set([...this.className.split(' '), name])].filter(Boolean).join(' '); },
      remove: name => { this.className = this.className.split(' ').filter(x => x !== name).join(' '); },
      contains: name => this.className.split(' ').includes(name),
    };
  }
  append(...children) { this.children.push(...children); }
  set textContent(text) { this.ownText = text; this.children = []; }
  get textContent() { return this.ownText + this.children.map(x => x.textContent ?? x).join(''); }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener(k, v) { this.handlers[k] = v; }
  querySelector() { return null; }
}
const el = (...args) => new Element(...args);
function family(glyph, english, renderSource = declaration('renderRadicalNode')) {
  const sheet = el('section'); const groups = []; const hops = [];
  const tx = (ja, en) => english ? en : ja;
  const ctx = vm.createContext({
    D: { radicals: data.radicals, kanji: data.kanji, radByGlyph, kanken: {} },
    el, tx, withEn: (node, en) => { if (english) node.textContent = en; return node; },
    partGloss: () => 'fire', kankenGradeLabel: x => x, renderStudyFold() {},
    chipsFor: (items, callback) => { const group = el('div', 'chips'); group.items = items; group.callback = callback; groups.push(group); return group; },
    go: (node, opts) => hops.push({ node, opts }),
  });
  vm.runInContext(renderSource, ctx);
  ctx.renderRadicalNode(sheet, { t: 'radical', id: glyph, from: 'fixture-reading' });
  return { sheet, groups, hops, note: sheet.children.find(x => x.className === 'note'), heading: sheet.children.find(x => x.className === 'eyebrow') };
}
function truthfulFamily(result, total, shown, english) {
  assert.equal(result.note.textContent, english
    ? `In this collection, this shape appears as a component in ${total} kanji.`
    : `この資料では、この形を部品に持つ字は全${total}字。`);
  assert.equal(result.heading.textContent, english
    ? `kanji that contain this part — ${shown < total ? `showing ${shown} of ${total}` : total}`
    : `この部品を含む字 — ${shown < total ? `${total} 字のうち ${shown} 字` : `${total} 字`}`);
}
for (const [glyph, total, shown] of [['火', 65, 65], ['木', 200, 80], ['艹', 82, 80], ['糸', 68, 68], ['灬', 47, 47]]) {
  for (const english of [false, true]) test(`family ${glyph} ${english ? 'EN' : 'JA'}: source total / shown and member identity`, () => {
    assert.equal(data.radicals[glyph].kanjiCount, total); assert.equal(data.radicals[glyph].kanji.length, shown);
    const result = family(glyph, english); truthfulFamily(result, total, shown, english);
    const members = result.groups.at(-1);
    assert.deepEqual([...members.items].map(x => x.label), data.radicals[glyph].kanji);
    const invoker = el('button'); members.callback(members.items[0], invoker);
    assert.equal(result.hops[0].node.id, data.radicals[glyph].kanji[0]);
    assert.equal(result.hops[0].node.from, 'fixture-reading'); assert.equal(result.hops[0].opts.invoker, invoker);
  });
}
test('old universal left-position sentence is rejected even with the right total', () => {
  const actual = declaration('renderRadicalNode');
  const mutant = actual.replace(/note\.textContent = tx\([^]*?\n  \);/, 'note.textContent = `${official.name}は「ひ」の部首。${count}字の左側にある。`;');
  assert.notEqual(mutant, actual);
  assert.throws(() => truthfulFamily(family('火', false, mutant), 65, 65, false), { code: 'ERR_ASSERTION' });
});
test('capped visible count cannot be substituted for the source total', () => {
  const actual = declaration('renderRadicalNode');
  const mutant = actual.replace('const count = r.kanjiCount || 0;', 'const count = r.kanji.length;');
  assert.notEqual(mutant, actual);
  assert.throws(() => truthfulFamily(family('木', true, mutant), 200, 80, true), { code: 'ERR_ASSERTION' });
});

// Lift the consumer actually used by the native verifier; no browser or verifier import.
const nativeSource = read('tools/verify-hfix-1a.mjs');
const nativeAst = ts.createSourceFile('verify-hfix-1a.mjs', nativeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const oracleStatement = nativeAst.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(nativeAst) === 'PART_ORACLE'));
assert(oracleStatement);
const oracleContext = vm.createContext({});
vm.runInContext(oracleStatement.getText(nativeAst) + '\n' + declaration('partNoteMatches', nativeSource), oracleContext);
test('native family oracle accepts source totals in both languages and rejects old positional claims / wrong totals', () => {
  for (const [glyph, count] of [['糸', 68], ['艹', 82], ['辶', 57], ['戈', 48]]) {
    assert.equal(data.radicals[glyph].kanjiCount, count);
    for (const ui of ['ja', 'bi']) {
      const copy = ui === 'ja' ? `この資料では、この形を部品に持つ字は全${count}字。` : `In this collection, this shape appears as a component in ${count} kanji.`;
      assert.equal(oracleContext.partNoteMatches(ui, glyph, copy), true);
      assert.equal(oracleContext.partNoteMatches(ui, glyph, copy.replace(String(count), String(count - 1))), false);
    }
  }
  assert.equal(oracleContext.partNoteMatches('ja', '糸', 'いとへんは「いと」の部首。68字の左側にある。'), false);
  assert.equal(oracleContext.partNoteMatches('bi', '糸', 'いとへん, the thread radical, on the left of 68 kanji.'), false);
  assert.equal(oracleContext.partNoteMatches('ja', 'absent', undefined), false);
});

function reviewFixture() {
  const rv = { queue: [], ix: 0, history: [], done: { again: 1, hard: 0, good: 0, easy: 0 }, t0: Date.now() - 2000 };
  const state = { review: rv, focus: null }; const exits = [];
  const ctx = vm.createContext({
    S: state, scheduler: {}, fsrsApi: {}, srsCore, Date, el,
    tx: (ja) => ja, bi: () => false, biLabel: (tag, cls, ja) => el(tag, cls, ja), withEn: x => x,
    TODAY_JA_WORD: /[一-龯ぁ-んァ-ヶ]/u, todayLearning: el,
    renderReaderTicket() {}, renderAiCoach() {}, renderReviewNext() {}, renderReviewUndo() {},
    render() {}, reviewNextStep: () => null, placesLayout: () => false, isLeech: () => false,
    bindReviewExit: (...args) => exits.push(args),
    clearTimeout() {}, setTimeout() { return 1; }, reviewPauseTimer: null,
  });
  vm.runInContext(declaration('renderReview'), ctx);
  return { ctx, rv, state, exits, main: el('main') };
}
test('completion material is an actual renderer marker, with tally and owned exit intact', () => {
  const f = reviewFixture(); f.ctx.renderReview(f.main);
  assert(f.main.classList.contains('review-complete'));
  assert(f.main.children.some(x => x.className === 'review-summary' && /覚えた0もう一度1時間/u.test(x.textContent)));
  assert.equal(f.exits.length, 1); assert.equal(f.exits[0][2], f.rv); assert.equal(f.exits[0][3], true);
  f.state.review = null; f.ctx.renderReview(f.main);
  assert(!f.main.classList.contains('review-complete'), 'unavailable/new view must not retain completed material');
});
test('paused completion keeps the same early-step handler and queue', () => {
  const f = reviewFixture(); f.rv.queue = [{ t: 'word', id: 'word-a' }];
  f.ctx.reviewNextStep = () => ({ pause: true, at: Date.now() + 60_000, canEarly: true });
  f.ctx.srsKey = (t, id) => `${t}:${id}`;
  f.ctx.renderReview(f.main); assert(f.main.classList.contains('review-complete'));
  const button = f.main.children.find(x => x.id === 'review-ahead');
  assert.equal(button.textContent, '次の学習ステップを少し早めに始める');
  const queue = f.rv.queue; button.handlers.click(); assert.equal(f.rv.ahead, true); assert.equal(f.rv.queue, queue);
});

// Narrow CSS declaration contracts. Browser cascade/geometry is separately owed.
function rule(text, selector) {
  const start = text.indexOf(selector + ' {'); assert(start >= 0, selector);
  const body = text.slice(start + selector.length + 2, text.indexOf('}', start));
  return Object.fromEntries(body.replace(/\/\*[^]*?\*\//g, '').split(';').map(x => x.trim()).filter(Boolean).map(x => {
    const colon = x.indexOf(':'); return [x.slice(0, colon).trim(), x.slice(colon + 1).trim()];
  }));
}
const today = read('rooms/today.css'); const register = read('register.css'); const player = read('decks/player/player.css');
const completeSelector = "html[data-room='review'] #app > main.review-complete";
test('completion uses a paired light material, including explicit ink aliases and quiet exits', () => {
  const x = rule(today, completeSelector);
  for (const [name, value] of Object.entries({ background: 'var(--color-card-ground)', color: 'var(--color-card-ink)', '--color-ink': 'var(--color-card-ink)', '--color-muted': 'var(--color-card-ink-2)', '--faint': 'var(--color-card-ink-2)', '--ed-muted': 'var(--color-card-ink-2)' })) assert.equal(x[name], value, name);
  assert.equal(rule(today, completeSelector + ' .close-doors :is(button.take.quiet, button.chip.review-undo)').color, 'var(--color-card-ink-2)');
});
test('context note and disabled permission use their own card ink, without changing the room note', () => {
  assert.equal(rule(register, 'html[data-register="tutor"] .teacher-note').color, 'var(--sheet-faint)');
  assert.equal(rule(register, 'html[data-register="tutor"] #app main .teacher-context :is(.teacher-note, label)').color, 'var(--card-ink-2)');
  const x = rule(register, 'html[data-register="tutor"] #app main .teacher-context .chip:disabled');
  assert.equal(x.opacity, '1'); assert.equal(x.color, 'var(--card-ink-2)'); assert.equal(x.background, 'transparent');
});
test('removing either material correction is rejected by the source contracts', () => {
  const missingCard = today.replace(completeSelector + ' {', '.test-mutant-absent {');
  assert.throws(() => rule(missingCard, completeSelector), { code: 'ERR_ASSERTION' });
  const selector = 'html[data-register="tutor"] #app main .teacher-context :is(.teacher-note, label)';
  assert.throws(() => rule(register.replace(selector + ' {', '.test-mutant-absent {'), selector), { code: 'ERR_ASSERTION' });
});
for (const width of [390, 1280]) test(`early controls at ${width}: bounded width and one unbroken text run (source contract)`, () => {
  for (const x of [rule(today, "html[data-room='review'] #app #review-ahead"), rule(player, '.kp .kp-ahead')]) {
    assert.equal(x.display, 'block'); assert.equal(x['white-space'], 'nowrap'); assert.equal(x['text-wrap'], 'nowrap');
    assert.equal(x.width, '100%'); assert.equal(x['max-width'], '100%'); assert.equal(x['min-width'], 'min(100%, 18em)');
    assert.equal(x['box-sizing'], 'border-box'); assert.equal(x['min-height'], '48px');
  }
  const card = rule(today, completeSelector);
  assert.equal(card.width, 'calc(100% - 32px)'); assert.equal(card['max-width'], '720px');
  assert(Math.min(width - 32, 720) < width);
});
test('unchanged card pigments have ordinary-text contrast; no new color literal in the local material', () => {
  const css = read('corridor.css');
  const hex = name => css.match(new RegExp(`${name}: (#[0-9a-f]{6});`))[1];
  const luminance = h => h.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((n, x, i) => n + x * [.2126, .7152, .0722][i], 0);
  const bg = luminance(hex('--card-ground'));
  for (const key of ['--card-ink', '--card-ink-2', '--card-ai']) {
    const ink = luminance(hex(key)); assert((Math.max(bg, ink) + .05) / (Math.min(bg, ink) + .05) >= 4.5, key);
  }
  assert(!Object.values(rule(today, completeSelector)).some(x => /#|rgba?\(/.test(x)));
});
