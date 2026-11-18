import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const EXPECTED_HASHES = {
  dataBytes: '85c0db0477885b7b34dbc24543cdb25671d638d0e5498ac1aa0539684d40c3e0',
  contextBytes: '5cc8e2f7643fa6b27e6eec2b6c905bacc82dd01de98ca2dd4f5b8ba882633c48',
  sidecarBytes: 'c22dd9810182061877beba9a11b735f4148c5c62dcec6f947a2ca3aec56f34a5',
};

const EXPECTED_CELLS = [
  {
    skyRowIndexZeroBased: 178,
    pointer: '/words/178/2',
    word: '下さい',
    reading: 'ください',
    old: 'please, please',
    new: 'please',
  },
  {
    skyRowIndexZeroBased: 360,
    pointer: '/words/360/2',
    word: '撮る',
    reading: 'とる',
    old: 'to take, to record',
    new: 'to take (a photograph)',
  },
  {
    skyRowIndexZeroBased: 869,
    pointer: '/words/869/2',
    word: '空く',
    reading: 'あく',
    old: 'to open, to open',
    new: 'to open, to become empty',
  },
  {
    skyRowIndexZeroBased: 1320,
    pointer: '/words/1320/2',
    word: '正確',
    reading: 'せいかく',
    old: 'accurate, punctuality',
    new: 'accurate, correct, precise',
  },
  {
    skyRowIndexZeroBased: 1529,
    pointer: '/words/1529/2',
    word: '納める',
    reading: 'おさめる',
    old: 'to store to pay, to supply',
    new: 'to pay (fees, taxes), to supply',
  },
  {
    skyRowIndexZeroBased: 1850,
    pointer: '/words/1850/2',
    word: '現在',
    reading: 'げんざい',
    old: 'now), present',
    new: 'the present, now',
  },
  {
    skyRowIndexZeroBased: 2041,
    pointer: '/words/2041/2',
    word: '者',
    reading: 'もの',
    old: 'person)',
    new: 'person',
  },
  {
    skyRowIndexZeroBased: 2314,
    pointer: '/words/2314/2',
    word: '多少',
    reading: 'たしょう',
    old: 'a little)',
    new: 'a little, some',
  },
  {
    skyRowIndexZeroBased: 2382,
    pointer: '/words/2382/2',
    word: '昼食',
    reading: 'ちゅうしょく',
    old: 'lunch)',
    new: 'lunch',
  },
  {
    skyRowIndexZeroBased: 3000,
    pointer: '/words/3000/2',
    word: '～等',
    reading: '～とう',
    old: 'level, place',
    new: 'class, rank',
  },
  {
    skyRowIndexZeroBased: 3152,
    pointer: '/words/3152/2',
    word: '伯父さん',
    reading: 'おじさん',
    old: 'middle-aged gentleman',
    new: 'uncle',
  },
  {
    skyRowIndexZeroBased: 3272,
    pointer: '/words/3272/2',
    word: '関西',
    reading: 'かんさい',
    old: 'Kansai, Kansai',
    new: 'Kansai region',
  },
  {
    skyRowIndexZeroBased: 3283,
    pointer: '/words/3283/2',
    word: '関東',
    reading: 'かんとう',
    old: 'Kantō, Kantō',
    new: 'Kantō region',
  },
  {
    skyRowIndexZeroBased: 3666,
    pointer: '/words/3666/2',
    word: '親類',
    reading: 'しんるい',
    old: 'relative)',
    new: 'relative, relation',
  },
  {
    skyRowIndexZeroBased: 5694,
    pointer: '/words/5694/2',
    word: '繊維',
    reading: 'せんい',
    old: 'fiber, fiber',
    new: 'fiber',
  },
  {
    skyRowIndexZeroBased: 5867,
    pointer: '/words/5867/2',
    word: '着色',
    reading: 'ちゃくしょく',
    old: 'coloring, coloring',
    new: 'coloring',
  },
  {
    skyRowIndexZeroBased: 6671,
    pointer: '/words/6671/2',
    word: '人目',
    reading: 'ひとめ',
    old: 'glimpse, public gaze',
    new: 'public gaze, notice',
  },
  {
    skyRowIndexZeroBased: 6707,
    pointer: '/words/6707/2',
    word: '凍結',
    reading: 'とうけつ',
    old: 'freezing, freezing',
    new: 'freezing',
  },
  {
    skyRowIndexZeroBased: 7552,
    pointer: '/words/7552/2',
    word: '重み',
    reading: 'おもみ',
    old: 'weight, weight',
    new: 'weight',
  },
];

const parseJson = (bytes) => JSON.parse(Buffer.from(bytes).toString('utf8'));

export function adaptSkyReference({ dataBytes, contextBytes, sidecarBytes }) {
  const inputs = { dataBytes, contextBytes, sidecarBytes };
  for (const [name, bytes] of Object.entries(inputs)) {
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== EXPECTED_HASHES[name])
      throw new Error(`${name} does not match the pinned raw bytes`);
  }

  const sidecar = parseJson(sidecarBytes);
  if (
    sidecar?.schema !== 1 ||
    sidecar.originalData?.sha256 !== EXPECTED_HASHES.dataBytes ||
    sidecar.originalContext?.sha256 !== EXPECTED_HASHES.contextBytes ||
    !Array.isArray(sidecar.cells) ||
    sidecar.cells.length !== EXPECTED_CELLS.length
  ) {
    throw new Error('Invalid sky reference sidecar');
  }

  const indices = new Set();
  sidecar.cells.forEach((cell, i) => {
    if (!isDeepStrictEqual(cell, EXPECTED_CELLS[i]) || indices.has(cell.skyRowIndexZeroBased)) {
      throw new Error(`Invalid sky reference cell ${i}`);
    }
    indices.add(cell.skyRowIndexZeroBased);
  });

  const data = parseJson(dataBytes);
  if (!Array.isArray(data?.words)) throw new Error('Invalid sky reference data');
  for (const cell of EXPECTED_CELLS) {
    const row = data.words[cell.skyRowIndexZeroBased];
    if (
      !Array.isArray(row) ||
      row.length < 3 ||
      row[0] !== cell.word ||
      row[1] !== cell.reading ||
      row[2] !== cell.old
    ) {
      throw new Error(`Sky reference source mismatch at ${cell.pointer}`);
    }
  }

  for (const cell of EXPECTED_CELLS) data.words[cell.skyRowIndexZeroBased][2] = cell.new;
  return data;
}
