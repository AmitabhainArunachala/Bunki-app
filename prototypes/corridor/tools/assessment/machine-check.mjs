#!/usr/bin/env node
/** Blind machine check for written-bank manuscripts.
 *
 * Each verifier model family solves every item without its key or rationale, gives a
 * one-line reason, and flags ambiguity, no correct option, or unnatural Japanese. Evidence
 * (prompts, raw responses, parsed verdicts) is written under ~/.dharma only. An item is
 * kept only when every family that answered chose the key and none flagged it: normally
 * three families, never fewer than two, and never the author's own family.
 *
 *   node machine-check.mjs run <manuscript.json>... [--families glm,kimi,deepseek] [--concurrency 6]
 *   node machine-check.mjs status <manuscript.json>... [--out status.json]
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVIDENCE = process.env.BUNKI_MACHINE_CHECK_EVIDENCE ??
  join(homedir(), '.dharma/bunki_review/2026-09-28/jlpt/evidence');
export const VERDICTS = join(EVIDENCE, 'verdicts.jsonl');
export const MACHINE_CHECK_POLICY = 'bunki-machine-check/1';
export const VERIFIER_FAMILIES = Object.freeze([
  { key: 'glm', family: 'zhipu-glm', label: 'GLM', model: 'glm-5.3:cloud' },
  { key: 'kimi', family: 'moonshot-kimi', label: 'Kimi', model: 'kimi-k3:cloud' },
  { key: 'deepseek', family: 'deepseek', label: 'DeepSeek', model: 'deepseek-v4-pro:cloud' },
  { key: 'minimax', family: 'minimax', label: 'MiniMax', model: 'minimax-m3:cloud', reserve: true },
]);
const FLAGS = new Set(['ambiguous', 'no-correct', 'unnatural']);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const refsOf = (entry) => entry.passages ?? (entry.passage !== undefined ? [entry.passage] : []);
/** What a verifier sees: never the key or rationale. */
export function itemView(manuscript, entry) {
  return {
    level: manuscript.level,
    passages: refsOf(entry).map((key) => manuscript.passages[key]),
    prompt: entry.prompt,
    options: entry.options,
  };
}
export const viewSha256 = (manuscript, entry) => sha(JSON.stringify(itemView(manuscript, entry)));

function batches(manuscript) {
  const groups = new Map();
  const loose = { vocabulary: [], grammar: [], reading: [] };
  manuscript.items.forEach((entry, index) => {
    const refs = refsOf(entry);
    if (refs.length) {
      const key = JSON.stringify(refs);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(index);
    } else loose[entry.skill].push(index);
  });
  const result = [...groups.values()];
  for (const indices of Object.values(loose))
    for (let start = 0; start < indices.length; start += 6) result.push(indices.slice(start, start + 6));
  return result;
}

const SPACING_NOTE = {
  N5: ' N5 and N4 papers put a space between phrases; that spacing is normal, not unnatural.',
  N4: ' N5 and N4 papers put a space between phrases; that spacing is normal, not unnatural.',
};
export function batchPrompt(manuscript, indices) {
  const level = manuscript.level;
  const lines = [
    `You are a native-level Japanese teacher checking ORIGINAL practice questions written in the style of the JLPT ${level} (they are not real exam items). The answer key is hidden from you.`,
    '',
    'For EACH question:',
    '1. Choose the single best option (1-4).',
    '2. Give a one-line reason.',
    `3. Add flags only when they apply: "ambiguous" if more than one option could reasonably be correct; "no-correct" if no option is correct; "unnatural" if the Japanese in the question, passage or options is unnatural or contains an error.${SPACING_NOTE[level] ?? ''} 【】 marks the word in question and （　） marks a gap to fill; ＿★＿ is the blank whose fragment you must choose after putting the four fragments in order.`,
    '',
    'Return ONLY JSON, no other text: {"answers":[{"id":"Q1","choice":1,"reason":"...","flags":[]}]} with one entry per question, in order.',
    '',
  ];
  const shown = new Set();
  indices.forEach((index, position) => {
    const entry = manuscript.items[index];
    const refs = refsOf(entry);
    for (const [refIndex, key] of refs.entries()) {
      if (shown.has(key)) continue;
      shown.add(key);
      const label = refs.length > 1 ? `Passage ${String.fromCharCode(65 + refIndex)}` : 'Passage';
      lines.push(`[${label}]`, manuscript.passages[key], '');
    }
    lines.push(`Q${position + 1}. ${entry.prompt}`);
    entry.options.forEach((option, choice) => lines.push(`${choice + 1}. ${option}`));
    lines.push('');
  });
  return lines.join('\n');
}

export function parseAnswers(raw, count) {
  // eslint-disable-next-line no-control-regex -- terminal escape sequences from the CLI
  const text = raw.replace(/\x1b\[[0-9;?]*[a-zA-Z]/gu, '');
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('no-json');
  const parsed = JSON.parse(text.slice(start, end + 1));
  const answers = parsed.answers;
  if (!Array.isArray(answers) || answers.length !== count) throw new Error('answer-count');
  return answers.map((answer, index) => {
    const choice = Number(answer.choice);
    const flags = Array.isArray(answer.flags) ? answer.flags.map(String) : [];
    if (answer.id !== undefined && String(answer.id) !== `Q${index + 1}`) throw new Error('answer-order');
    return {
      choice: Number.isInteger(choice) && choice >= 1 && choice <= 4 ? choice : null,
      reason: typeof answer.reason === 'string' ? answer.reason.slice(0, 500) : '',
      flags: flags.filter((flag) => FLAGS.has(flag)),
      otherFlags: flags.filter((flag) => !FLAGS.has(flag)),
    };
  });
}

function runModel(model, prompt, timeoutMs = 90_000) {
  return new Promise((resolve) => {
    const child = spawn('ollama', ['run', model, '--hidethinking', '--nowordwrap'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { if (stderr.length < 200_000) stderr += chunk; });
    child.on('close', (code) => {
      clearTimeout(timer);
      // eslint-disable-next-line no-control-regex -- strip spinner noise before keeping stderr
      const cleanErr = stderr.replace(/\x1b\[[0-9;?]*[a-zA-Z]|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/gu, '').trim();
      resolve({ code, stdout, stderr: cleanErr.slice(-2000), timedOut });
    });
    child.stdin.end(prompt);
  });
}

export async function loadVerdicts(path = VERDICTS) {
  const index = new Map();
  let text = '';
  try { text = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    const key = `${record.viewSha256}:${record.family}`;
    // A later valid verdict replaces an earlier failure; a valid verdict is never replaced.
    const prior = index.get(key);
    if (!prior || (prior.choice === null && record.choice !== null)) index.set(key, record);
  }
  return index;
}

/** Latest standing verdict per family for one item, and the keep decision. */
export function itemDecision(manuscript, entry, verdicts, { minimumFamilies = 3, floor = 2 } = {}) {
  const view = viewSha256(manuscript, entry);
  const rows = VERIFIER_FAMILIES.map((family) => verdicts.get(`${view}:${family.family}`))
    .filter(Boolean)
    .filter((row) => row.family !== manuscript.authorModelFamily);
  const answered = rows.filter((row) => row.choice !== null);
  const agreeing = answered.filter((row) => row.choice === entry.answer + 1 && !row.flags.length);
  const disagree = answered.filter((row) => row.choice !== entry.answer + 1);
  const flagged = answered.filter((row) => row.flags.length);
  const primaryErrors = VERIFIER_FAMILIES.filter((family) => !family.reserve)
    .filter((family) => !answered.some((row) => row.family === family.family)).length;
  const unanimous = answered.length > 0 && agreeing.length === answered.length;
  let status;
  if (!unanimous) status = 'failed';
  else if (answered.length >= minimumFamilies) status = 'kept';
  else if (answered.length >= floor && primaryErrors > 0 && rows.length > answered.length) status = 'kept-degraded';
  else status = 'pending';
  return { view, status, answered, agreeing, disagree, flagged };
}

async function main(argv) {
  const [command, ...rest] = argv;
  const option = (name, fallback) => {
    const at = rest.indexOf(name);
    if (at < 0) return fallback;
    const value = rest[at + 1];
    rest.splice(at, 2);
    return value;
  };
  const familyKeys = option('--families', 'glm,kimi,deepseek').split(',');
  const concurrency = Number(option('--concurrency', '6'));
  const out = option('--out', null);
  const files = rest;
  const manuscripts = await Promise.all(files.map(async (file) => ({ file, manuscript: JSON.parse(await readFile(file, 'utf8')) })));
  await mkdir(EVIDENCE, { recursive: true });
  if (command === 'run') {
    const families = familyKeys.map((key) => {
      const family = VERIFIER_FAMILIES.find((row) => row.key === key);
      if (!family) throw new Error(`Unknown family ${key}`);
      return family;
    });
    const verdicts = await loadVerdicts();
    const jobs = [];
    for (const { file, manuscript } of manuscripts)
      for (const indices of batches(manuscript))
        for (const family of families) {
          if (family.family === manuscript.authorModelFamily) throw new Error('A family cannot verify its own form');
          const pending = indices.filter((index) => {
            const row = verdicts.get(`${viewSha256(manuscript, manuscript.items[index])}:${family.family}`);
            return !row || row.choice === null;
          });
          if (pending.length) jobs.push({ file, manuscript, indices: pending, family });
        }
    console.log(`${jobs.length} verifier calls queued`);
    const cooling = new Map();
    const active = new Map();
    let done = 0, failures = 0;
    async function work(job) {
      const prompt = batchPrompt(job.manuscript, job.indices);
      const promptSha = sha(prompt);
      const stem = basename(job.file, '.json');
      const directory = join(EVIDENCE, job.manuscript.level, stem, job.family.key);
      await mkdir(directory, { recursive: true });
      let parsed = null, lastError = null, attempts = 0, result = null;
      while (!parsed && attempts < 6) {
        attempts++;
        while ((cooling.get(job.family.key) ?? 0) > Date.now()) await sleep(1000);
        const startedAt = new Date().toISOString();
        result = await runModel(job.family.model, prompt);
        const limited = /429|rate.?limit|too many requests|quota|usage limit|exceeded/iu.test(`${result.stderr}\n${result.code ? result.stdout : ''}`);
        if (limited) {
          const wait = Math.min(300_000, 30_000 * 2 ** (attempts - 1));
          cooling.set(job.family.key, Date.now() + wait);
          lastError = `rate-limited (${result.stderr.slice(0, 160)})`;
          console.log(`  ${job.family.key} rate-limited; backing off ${wait / 1000}s`);
          continue;
        }
        try {
          if (result.timedOut) throw new Error('timeout');
          if (result.code !== 0) throw new Error(`exit-${result.code}: ${result.stderr.slice(0, 160)}`);
          parsed = parseAnswers(result.stdout, job.indices.length);
        } catch (error) {
          lastError = error.message;
        }
        const call = {
          schema: 'bunki-machine-check-call/1', family: job.family.family, model: job.family.model,
          promptSha256: promptSha, startedAt, endedAt: new Date().toISOString(), attempt: attempts,
          exitCode: result.code, timedOut: result.timedOut, error: parsed ? null : lastError,
          responseSha256: sha(result.stdout),
        };
        await writeFile(join(directory, `${promptSha.slice(0, 16)}-a${attempts}.json`),
          JSON.stringify({ ...call, prompt, response: result.stdout, stderr: result.stderr }, null, 2) + '\n');
        if (!parsed && attempts >= 3) break;
      }
      const at = new Date().toISOString();
      const lines = job.indices.map((index, position) => {
        const entry = job.manuscript.items[index];
        const answer = parsed?.[position];
        return JSON.stringify({
          schema: 'bunki-machine-check-verdict/1', policy: MACHINE_CHECK_POLICY,
          viewSha256: viewSha256(job.manuscript, entry), level: job.manuscript.level, form: stem,
          itemIndex: index + 1, family: job.family.family, model: job.family.model,
          choice: answer?.choice ?? null, reason: answer?.reason ?? null, flags: answer?.flags ?? [],
          otherFlags: answer?.otherFlags ?? [], error: parsed ? null : lastError,
          promptSha256: promptSha, responseSha256: result ? sha(result.stdout) : null, at,
        });
      });
      await appendFile(VERDICTS, lines.join('\n') + '\n');
      done++;
      if (!parsed) failures++;
      if (done % 20 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length} calls, ${failures} failed`);
    }
    const queue = [...jobs];
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        // at most two concurrent calls per family keeps each provider's share polite
        const pick = queue.findIndex((job) => (active.get(job.family.key) ?? 0) < 2 &&
          (cooling.get(job.family.key) ?? 0) <= Date.now());
        if (pick < 0) { await sleep(500); continue; }
        const [job] = queue.splice(pick, 1);
        active.set(job.family.key, (active.get(job.family.key) ?? 0) + 1);
        try { await work(job); } finally { active.set(job.family.key, active.get(job.family.key) - 1); }
      }
    }));
    console.log(`done: ${done} calls, ${failures} without a parsed verdict`);
  } else if (command === 'status') {
    const verdicts = await loadVerdicts();
    const report = [];
    for (const { file, manuscript } of manuscripts) {
      const rows = manuscript.items.map((entry, index) => {
        const decision = itemDecision(manuscript, entry, verdicts);
        return {
          index: index + 1, task: entry.task, key: entry.answer + 1, status: decision.status,
          answers: Object.fromEntries(VERIFIER_FAMILIES.map((family) => {
            const row = verdicts.get(`${decision.view}:${family.family}`);
            return [family.key, row ? (row.choice === null ? `error` : `${row.choice}${row.flags.length ? `[${row.flags.join('+')}]` : ''}`) : '-'];
          })),
          reasons: decision.answered.filter((row) => row.choice !== entry.answer + 1 || row.flags.length)
            .map((row) => `${row.family}: ${row.reason}`),
        };
      });
      const tally = Object.groupBy(rows, (row) => row.status);
      console.log(`${basename(file)}: ${rows.length} items — ${Object.entries(tally).map(([status, list]) => `${status} ${list.length}`).join(', ')}`);
      for (const row of rows.filter((row) => row.status !== 'kept'))
        console.log(`  q${row.index} ${row.task} key ${row.key} ${JSON.stringify(row.answers)} ${row.status}\n    ${row.reasons.join('\n    ')}`);
      report.push({ file: basename(file), level: manuscript.level, number: manuscript.number, rows });
    }
    if (out) await writeFile(out, JSON.stringify(report, null, 2) + '\n');
  } else {
    console.error('Usage: machine-check.mjs run|status <manuscript.json>...');
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main(process.argv.slice(2));
