#!/usr/bin/env node
/** Answer-position balance for written tests, as on a real JLPT paper.
 *
 * The official 2012/2018 workbook keys are flat (positions 1–4 pooled 166/184/181/175). A form
 * passes when each position is within ±1 of n/4, no position takes more than ⌈k/4⌉+1 of a 大問's
 * k items, and no key repeats more than three times in a row (a house rule).
 *
 * Balancing permutes options only. Every item keeps its prompt, options, rationale and key text;
 * the key simply moves. An item keeps its order when its rationale names options by number or
 * its options are numbers in ascending order, as printed papers keep them.
 *
 *   node answer-balance.mjs report <manuscript.json>...
 *   node answer-balance.mjs apply <manuscript.json>... [--plan out.json]
 *   node answer-balance.mjs settle --prior <dir> <manuscript.json>... [--plan out.json]
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ANSWER_BALANCE_RULE = 'bunki-answer-balance/1';
export const MAX_RUN = 3;

/** Problems with one form's key sequence; keys are 1-based positions in paper order. */
export function answerBalanceProblems(keys, tasks, optionCount = 4) {
  const problems = [];
  const n = keys.length;
  for (let position = 1; position <= optionCount; position++) {
    const count = keys.filter((key) => key === position).length;
    if (Math.abs(count - n / optionCount) > 1)
      problems.push(`key ${position} is ${count} of ${n}, not within 1 of ${n / optionCount}`);
  }
  const groups = new Map();
  keys.forEach((key, index) => {
    if (!groups.has(tasks[index])) groups.set(tasks[index], []);
    groups.get(tasks[index]).push(key);
  });
  for (const [task, group] of groups) {
    const cap = Math.ceil(group.length / optionCount) + 1;
    for (let position = 1; position <= optionCount; position++) {
      const count = group.filter((key) => key === position).length;
      if (count > cap) problems.push(`${task}: key ${position} is ${count} of ${group.length}, above ${cap}`);
    }
  }
  let run = 1;
  for (let index = 1; index < n; index++) {
    run = keys[index] === keys[index - 1] ? run + 1 : 1;
    if (run === MAX_RUN + 1) problems.push(`key ${keys[index]} repeats more than ${MAX_RUN} times from q${index - MAX_RUN + 1}`);
  }
  return problems;
}

/** The key sequence of a native form, in item order. */
export function formAnswerKeys(form) {
  const keys = [], tasks = [];
  for (const item of form.items) {
    if (item.response.kind !== 'selected') throw new Error(`${item.id} is not a selected response`);
    keys.push(item.response.options.findIndex((option) => option.id === item.response.answerOptionId) + 1);
    tasks.push(item.task);
  }
  return { keys, tasks };
}

export function assertAnswerBalance(form) {
  const { keys, tasks } = formAnswerKeys(form);
  const optionCounts = new Set(form.items.map((item) => item.response.options.length));
  if (optionCounts.size !== 1) throw new Error(`answer-balance ${form.id}: items differ in option count`);
  const problems = answerBalanceProblems(keys, tasks, [...optionCounts][0]);
  if (problems.length) throw new Error(`answer-balance ${form.id}: ${problems.join('; ')}`);
}

const KANJI_DIGITS = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const KANJI_UNITS = { 十: 10, 百: 100, 千: 1000 };
function leadingNumber(text) {
  const arabic = text.normalize('NFKC').match(/^\d[\d,]*(?:\.\d+)?/u);
  if (arabic) return Number(arabic[0].replaceAll(',', ''));
  const kanji = text.match(/^[〇一二三四五六七八九十百千万]+/u)?.[0];
  if (!kanji) return null;
  let total = 0, section = 0, digit = 0;
  for (const char of kanji) {
    if (char in KANJI_DIGITS) digit = KANJI_DIGITS[char];
    else if (char in KANJI_UNITS) { section += (digit || 1) * KANJI_UNITS[char]; digit = 0; }
    else { total += (section + digit || 1) * 10_000; section = 0; digit = 0; }
  }
  return total + section + digit;
}

/** Why an item keeps its printed order, or null when its options may move. */
export function pinReason(entry) {
  // 「1は「見送る」…」: the explanation names options by their printed number.
  if (/(?:^|[、。\s])[1-4１-４](?:と[1-4１-４])*は[「『]/u.test(entry.rationale ?? '')) return 'rationale-names-positions';
  const numbers = entry.options.map(leadingNumber).filter((value) => value !== null);
  if (numbers.length >= 3 && numbers.every((value, index) => index === 0 || value > numbers[index - 1]))
    return 'ascending-numbers';
  return null;
}

/** The XOR permutation keeps option pairs together (1-2 and 3-4), so a 2×2 grid of choices
 * stays a grid. It moves the key from `from` to `to` (0-based). */
export function permuteOptions(options, from, to) {
  const mask = from ^ to;
  return options.map((_, index) => options[index ^ mask]);
}

function prng(seedHex) {
  let state = Number.parseInt(seedHex.slice(0, 8), 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A balanced key plan for one manuscript. Deterministic for its identity. */
export function planBalance(manuscript, { stem, attempts = 200_000 } = {}) {
  const items = manuscript.items;
  const n = items.length;
  const optionCount = items[0].options.length;
  if (items.some((entry) => entry.options.length !== optionCount)) throw new Error(`${stem}: mixed option counts`);
  const seed = createHash('sha256').update(`${ANSWER_BALANCE_RULE}:${stem}`).digest('hex');
  const random = prng(seed);
  const pins = items.map(pinReason);
  const tasks = items.map((entry) => entry.task);
  const pinnedCount = Array.from({ length: optionCount }, (_, position) =>
    items.filter((entry, index) => pins[index] && entry.answer === position).length);
  const free = items.map((_, index) => index).filter((index) => !pins[index]);
  const base = Math.floor(n / optionCount), extra = n % optionCount;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const order = Array.from({ length: optionCount }, (_, position) => position).sort(() => random() - 0.5);
    const quota = Array.from({ length: optionCount }, (_, position) => base + (order.indexOf(position) < extra ? 1 : 0));
    if (quota.some((value, position) => value < pinnedCount[position])) continue;
    const pool = quota.flatMap((value, position) => Array(value - pinnedCount[position]).fill(position));
    for (let index = pool.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [pool[index], pool[swap]] = [pool[swap], pool[index]];
    }
    const targets = items.map((entry) => entry.answer);
    free.forEach((index, at) => { targets[index] = pool[at]; });
    if (answerBalanceProblems(targets.map((key) => key + 1), tasks, optionCount).length) continue;
    return { stem, rule: ANSWER_BALANCE_RULE, seed, attempt, pins, targets };
  }
  throw new Error(`${stem}: no balanced plan within ${attempts} attempts`);
}

/** Apply a plan: options move, key text and every other field stay byte-identical. */
export function applyBalance(manuscript, plan) {
  const next = structuredClone(manuscript);
  next.items = manuscript.items.map((entry, index) => {
    const to = plan.targets[index];
    const options = permuteOptions(entry.options, entry.answer, to);
    if (options[to] !== entry.options[entry.answer]) throw new Error(`${plan.stem} q${index + 1}: key text moved wrongly`);
    if ([...options].sort().join('\u0000') !== [...entry.options].sort().join('\u0000'))
      throw new Error(`${plan.stem} q${index + 1}: options changed`);
    const item = { ...entry, options, answer: to };
    // Field order stays as authored.
    return Object.fromEntries(Object.keys(entry).map((key) => [key, item[key]]));
  });
  return next;
}

export function distribution(keys, optionCount = 4) {
  return Array.from({ length: optionCount }, (_, position) => keys.filter((key) => key === position + 1).length);
}

const sameContent = (a, b) => a.options[a.answer] === b.options[b.answer] &&
  JSON.stringify([...a.options].sort()) === JSON.stringify([...b.options].sort()) &&
  Object.keys(a).every((key) => ['options', 'answer'].includes(key) || JSON.stringify(a[key]) === JSON.stringify(b[key]));

/** After the blind re-check: each item takes its balanced order where every verifier kept it,
 * or its prior order (kept when first published) where the new order failed. When that leaves
 * the form unbalanced, the fewest further items return to their prior, already-verified order.
 * No item is ever shown in an order the verifiers did not keep. */
export function settleBalance(current, prior, decide, { stem, maxFlips = 4 } = {}) {
  if (current.items.length !== prior.items.length) throw new Error(`${stem}: prior manuscript differs`);
  const rows = current.items.map((entry, index) => {
    const before = prior.items[index];
    if (!sameContent(entry, before)) throw new Error(`${stem} q${index + 1}: content differs from the prior manuscript`);
    const now = decide(current, entry), then = decide(prior, before);
    const kept = (status) => ['kept', 'kept-degraded'].includes(status);
    if (!kept(now.status) && !kept(then.status)) throw new Error(`${stem} q${index + 1}: kept in neither order`);
    return { index, entry, before, keptNew: kept(now.status), keptPrior: kept(then.status), newDecision: now };
  });
  const choice = rows.map((row) => (row.keptNew ? 'new' : 'prior'));
  const keysOf = () => rows.map((row, index) => (choice[index] === 'new' ? row.entry : row.before).answer + 1);
  const tasks = current.items.map((entry) => entry.task);
  const balanced = () => answerBalanceProblems(keysOf(), tasks).length === 0;
  const flippable = rows.filter((row) => choice[row.index] === 'new' && row.keptPrior && row.entry.answer !== row.before.answer)
    .map((row) => row.index);
  let flipped = [];
  if (!balanced()) {
    const search = (start, depth, picked) => {
      if (depth === 0) {
        for (const index of picked) choice[index] = 'prior';
        if (balanced()) return picked;
        for (const index of picked) choice[index] = 'new';
        return null;
      }
      for (let at = start; at < flippable.length; at++) {
        const found = search(at + 1, depth - 1, [...picked, flippable[at]]);
        if (found) return found;
      }
      return null;
    };
    for (let depth = 1; depth <= maxFlips && !flipped.length; depth++) flipped = search(0, depth, []) ?? [];
    if (!flipped.length) throw new Error(`${stem}: no balanced settlement within ${maxFlips} returns`);
  }
  const next = structuredClone(current);
  next.items = rows.map((row, index) => structuredClone(choice[index] === 'new' ? row.entry : row.before));
  return {
    manuscript: next,
    failedNew: rows.filter((row) => !row.keptNew).map((row) => ({
      q: row.index + 1,
      task: row.entry.task,
      verdicts: row.newDecision.answered.map((verdict) => ({ family: verdict.family, choice: verdict.choice,
        key: row.entry.answer + 1, flags: verdict.flags, reason: verdict.reason })),
    })),
    returnedForBalance: flipped.map((index) => index + 1),
  };
}

async function main(argv) {
  const [command, ...rest] = argv;
  const at = rest.indexOf('--plan');
  const planPath = at >= 0 ? rest.splice(at, 2)[1] : null;
  const priorAt = rest.indexOf('--prior');
  const priorDirectory = priorAt >= 0 ? rest.splice(priorAt, 2)[1] : null;
  if (command === 'settle') {
    const { itemDecision, loadVerdicts } = await import('./machine-check.mjs');
    const verdicts = await loadVerdicts();
    const report = [];
    for (const file of rest) {
      const current = JSON.parse(await readFile(file, 'utf8'));
      const prior = JSON.parse(await readFile(`${priorDirectory}/${basename(file)}`, 'utf8'));
      const stem = basename(file, '.json');
      const settled = settleBalance(current, prior, (manuscript, entry) => itemDecision(manuscript, entry, verdicts), { stem });
      const keys = settled.manuscript.items.map((entry) => entry.answer + 1);
      console.log(`${stem}: keys ${distribution(keys).join('/')}; new order failed ${settled.failedNew.map((row) => `q${row.q}`).join(', ') || 'none'}; returned for balance ${settled.returnedForBalance.map((q) => `q${q}`).join(', ') || 'none'}`);
      report.push({ file: basename(file), keys: distribution(keys), ...settled, manuscript: undefined });
      if (JSON.stringify(settled.manuscript) !== JSON.stringify(current))
        await writeFile(file, JSON.stringify(settled.manuscript, null, 2) + '\n');
    }
    if (planPath) await writeFile(planPath, JSON.stringify({ rule: ANSWER_BALANCE_RULE, settled: report }, null, 2) + '\n');
    return;
  }
  if (!['report', 'apply'].includes(command) || !rest.length) {
    console.error('Usage: answer-balance.mjs report|apply <manuscript.json>... [--plan out.json] | settle --prior <dir> <manuscript.json>... [--plan out.json]');
    process.exitCode = 2;
    return;
  }
  const plans = [];
  for (const file of rest) {
    const text = await readFile(file, 'utf8');
    const manuscript = JSON.parse(text);
    const stem = basename(file, '.json');
    const keys = manuscript.items.map((entry) => entry.answer + 1);
    const tasks = manuscript.items.map((entry) => entry.task);
    const problems = answerBalanceProblems(keys, tasks);
    console.log(`${stem}: keys ${distribution(keys).join('/')} ${problems.length ? `FAILS (${problems.length})` : 'balanced'}`);
    if (command !== 'apply') continue;
    const plan = planBalance(manuscript, { stem });
    const next = applyBalance(manuscript, plan);
    const after = next.items.map((entry) => entry.answer + 1);
    const pinned = plan.pins.flatMap((reason, index) => (reason ? [`q${index + 1} ${reason}`] : []));
    console.log(`  → ${distribution(after).join('/')} moved ${next.items.filter((entry, index) => entry.answer !== manuscript.items[index].answer).length}; kept ${pinned.join(', ') || 'none'}`);
    plans.push({ file: basename(file), ...plan, before: keys, after });
    await writeFile(file, JSON.stringify(next, null, 2) + '\n');
  }
  if (planPath) await writeFile(planPath, JSON.stringify({ rule: ANSWER_BALANCE_RULE, plans }, null, 2) + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main(process.argv.slice(2));
