/** A synthetic stand-in for a real paper, for tests that must not touch real exam content.
 * Every sentence below was written for this fixture; none comes from a JLPT paper. */
import { execFile } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { FORMS, MAPPING_SCHEMA, PACK_SCHEMA, assemblePack, packContainer } from './private-pack.mjs';
import { PAPER_MARKS, keySummary } from './official-paper.mjs';
import { sha256 } from './source-import.mjs';

const run = promisify(execFile);
const M = PAPER_MARKS;
export const SYNTHETIC_FORM_ID = 'synthetic-official-n1';
export const syntheticConfig = Object.freeze({
  ...FORMS['jlpt-koshiki-2018-n1'],
  formId: SYNTHETIC_FORM_ID,
  keyName: 'SYNTHETIC',
  titleJa: '検証用フィクスチャ N1（合成）',
  titleEn: 'Verification fixture N1 (synthetic)',
  badge: '本物 · 検証用フィクスチャ（合成データ）',
  byline: '検証用の合成データ · 実際の試験問題ではありません',
  source: { id: 'synthetic-official-fixture', label: '検証用フィクスチャ', uri: null, licenseClaim: 'synthetic test data' },
  written: [
    { mondai: 1, skill: 'vocabulary', task: 'kanji-reading', layout: 'question' },
    { mondai: 2, skill: 'grammar', task: 'sentence-composition', layout: 'question' },
    { mondai: 3, skill: 'grammar', task: 'text-grammar', layout: 'text-grammar' },
    { mondai: 4, skill: 'reading', task: 'information-retrieval', layout: 'material-after' },
  ],
  listening: [
    { mondai: 1, task: 'task-based-listening', printed: 'all', optionCount: 4 },
    { mondai: 2, task: 'quick-response', printed: 'none', optionCount: 3 },
  ],
  recordedListeningSeconds: 6,
});
/** A sentence no real paper contains; tests look for it in exports and caches. */
export const SYNTHETIC_PROBE = '灯台の見える坂道で、猫が三冊の古い辞書を並べていた。';

export function syntheticMapping() {
  return {
    schema: MAPPING_SCHEMA,
    formId: SYNTHETIC_FORM_ID,
    drafted: 'synthetic fixture',
    written: {
      mondai: [
        { mondai: 1, skill: 'vocabulary', task: 'kanji-reading', instruction: '＿＿＿の言葉の読み方として最もよいものを、１・２・３・４から\u4E00つ選びなさい。', itemNumbers: [1, 2] },
        { mondai: 2, skill: 'grammar', task: 'sentence-composition', instruction: '次の文の ★ に入る最もよいものを、１・２・３・４から\u4E00つ選びなさい。', itemNumbers: [3] },
        { mondai: 3, skill: 'grammar', task: 'text-grammar', instruction: '次の文章を読んで、文章全体の内容を考えて、4 の中に入る最もよいものを選びなさい。', itemNumbers: [4] },
        { mondai: 4, skill: 'reading', task: 'information-retrieval', instruction: '右のページのお知らせを読んで、下の質問に答えなさい。', itemNumbers: [5] },
      ],
      items: [
        { number: 1, mondai: 1, skill: 'vocabulary', task: 'kanji-reading', prompt: `朝の${M.underlineOpen}坂道${M.underlineClose}を${M.rubyOpen}駆${M.rubySplit}か${M.rubyClose}け上がった。`, options: ['さかみち', 'はんどう', 'さかどう', 'はんみち'], passageId: null, pages: ['V-1'] },
        { number: 2, mondai: 1, skill: 'vocabulary', task: 'kanji-reading', prompt: `港の${M.underlineOpen}灯台${M.underlineClose}が見えた。`, options: ['とうだい', 'ひだい', 'とだい', 'ひのだい'], passageId: null, pages: ['V-1'] },
        { number: 3, mondai: 2, skill: 'grammar', task: 'sentence-composition', prompt: '猫は　＿＿＿　＿★＿　＿＿＿　＿＿＿　並べていた。', options: ['辞書を', '三冊の', '古い', '窓辺に'], passageId: null, pages: ['G-1'] },
        { number: 4, mondai: 3, skill: 'grammar', task: 'text-grammar', prompt: '', options: ['それで', 'ところが', 'つまり', 'たとえば'], passageId: 'm3-p1', pages: ['G-2'] },
        { number: 5, mondai: 4, skill: 'reading', task: 'information-retrieval', prompt: '図書室を土曜日に使いたい人は、どうすればよいか。', options: ['金曜日までに申し込む', '当日に受付へ行く', '先生に電話する', '予約は要らない'], passageId: 'm4-p1', pages: ['R-1'] },
      ],
      passages: [
        { id: 'm3-p1', mondai: 3, label: null, text: `${SYNTHETIC_PROBE}\n雨の日は窓辺が暗い。${M.boxOpen}4${M.boxClose}、猫は辞書を読むのをやめて眠った。`, pages: ['G-2'], inlineMarkers: 1, thirdParty: false },
        { id: 'm4-p1', mondai: 4, label: null, text: '図書室のお知らせ\n土曜日に使う人は、金曜日までに受付で申し込んでください。', pages: ['R-2'], inlineMarkers: 0, thirdParty: false },
      ],
    },
    listening: {
      mondai: [
        { mondai: 1, instruction: '問題１では、まず質問を聞いてください。' },
        { mondai: 2, instruction: '問題２では、問題用紙に何も印刷されていません。' },
      ],
      groups: [
        { mondai: 1, label: '例', options: ['例の答え\u4E00', '例の答え二', '例の答え三', '例の答え四'], pages: ['L-1'] },
        { mondai: 1, label: '1', options: ['駅で待つ', '家に帰る', '本を買う', '電話する'], pages: ['L-2'] },
      ],
      transcripts: { 1: 'Ｆ：駅で待っていてね。\nＭ：わかった。', 2: 'Ｍ：おはよう。\nＦ：おはようございます。' },
    },
  };
}
export function syntheticKey() {
  return {
    written: [1, 2, 3, 4, 5].map((number, index) => ({ mondai: [1, 1, 2, 3, 4][index], label: String(number), answer: [1, 1, 2, 2, 1][index] })),
    listening: [
      { mondai: 1, label: '1', answer: 1 },
      { mondai: 2, label: '1', answer: 2 },
      { mondai: 2, label: '2', answer: 3 },
    ],
  };
}
export function syntheticKeyParse(key = syntheticKey()) {
  const written = keySummary(key.written, syntheticConfig.written.length);
  const listening = keySummary(key.listening.filter((row) => row.mondai < syntheticConfig.listening.length), syntheticConfig.listening.length - 1);
  return {
    SYNTHETIC: {
      [syntheticConfig.writtenKeySection]: written,
      聴解: { per_mondai: [...listening.per_mondai, 0], total: listening.total, answer_pos: listening.answer_pos },
    },
  };
}

/** Real decodable MP3 tones (ffmpeg), 3 s each. */
export async function syntheticRecordings(directory) {
  await mkdir(directory, { recursive: true });
  const recordings = [];
  for (const [index, frequency] of [440, 660].entries()) {
    const file = join(directory, `tone-${index + 1}.mp3`);
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=3`, '-ac', '1', '-ar', '22050', '-b:a', '48k', file], { timeout: 60_000 });
    const bytes = await readFile(file);
    recordings.push({ name: `tone-${index + 1}.mp3`, bytes, sha256: sha256(bytes), durationMs: 3000 });
  }
  return recordings;
}

/** A complete container, as the Mac builder writes it, from synthetic content only. */
export async function buildSyntheticContainer(directory, { tamper = null } = {}) {
  const media = await syntheticRecordings(join(directory, 'media-source'));
  const packId = 'synthetic-official-n1-fixture';
  const { form, delivery, entry } = await assemblePack({ mapping: syntheticMapping(), key: syntheticKey(), media, config: syntheticConfig, packId });
  const blobs = new Map();
  const files = [];
  const add = (path, bytes, mimeType) => {
    blobs.set(path, bytes);
    files.push({ path, sha256: sha256(bytes), bytes: bytes.length, mimeType });
  };
  add('form.json', Buffer.from(JSON.stringify(form)), 'application/json');
  add('delivery.json', Buffer.from(JSON.stringify(delivery)), 'application/json');
  for (const row of media) add(`media/${row.sha256}.mp3`, row.bytes, 'audio/mpeg');
  const pageFile = join(directory, 'media-source', 'page.jpg');
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=120x170', '-frames:v', '1', pageFile], { timeout: 60_000 });
  const page = await readFile(pageFile);
  add(`pages/${sha256(page)}.jpg`, page, 'image/jpeg');
  const manifest = {
    schema: PACK_SCHEMA,
    packId,
    formId: form.id,
    createdAt: '2026-09-29T00:00:00.000Z',
    rights: { basis: 'synthetic test data', sync: 'denied' },
    entry,
    files,
    pages: [{ sheet: 'V-1', sha256: sha256(page) }],
    itemPages: { [`${form.id}:q1`]: ['V-1'] },
    passagePages: {},
    sources: [],
    checks: { items: { total: form.items.length } },
  };
  let container = packContainer(manifest, blobs);
  if (tamper === 'media') {
    container = Buffer.from(container);
    container[container.length - page.length - 100] ^= 0xff;
  }
  await rm(join(directory, 'media-source'), { recursive: true, force: true });
  return { container, form, delivery, entry, manifest };
}
