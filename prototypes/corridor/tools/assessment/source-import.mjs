import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

export const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
export const SOURCE_KINDS = ['html', 'pdf', 'image', 'audio', 'answer-key'];
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const idPattern = /^[a-z0-9][a-z0-9-]{0,119}$/u;
const allowedHosts = new Set(['www.jlpt.jp', 'jlpt.jp', 'ask-books.com', 'www.3anet.co.jp']);

export function safeId(value) {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new Error('Invalid source ID');
  return value;
}

export function sourceURL(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !allowedHosts.has(url.hostname)
  ) {
    throw new Error('Source URL must use HTTPS on a registered primary publisher host');
  }
  url.hash = '';
  return url;
}

export function validateSourceRequest(request) {
  safeId(request.id);
  if (!SOURCE_KINDS.includes(request.kind)) throw new Error('Unsupported source kind');
  if (!['reference', 'personal', 'public'].includes(request.distribution))
    throw new Error('Invalid distribution');
  for (const key of ['title', 'edition', 'location', 'rightsBasis']) {
    if (typeof request[key] !== 'string' || !request[key].trim() || request[key].length > 2000)
      throw new Error(`Missing ${key}`);
  }
  if (request.distribution === 'public') {
    if (
      !request.publicGrant ||
      request.publicGrant.permitsRedistribution !== true ||
      !/^[a-f0-9]{64}$/u.test(request.publicGrant.evidenceSha256 ?? '') ||
      typeof request.publicGrant.evidenceRef !== 'string' ||
      !request.publicGrant.evidenceRef.trim()
    ) {
      throw new Error('Public source import needs an explicit redistribution grant with evidence');
    }
  }
  if (Boolean(request.url) === Boolean(request.file))
    throw new Error('Provide exactly one source URL or local file');
  if (request.url) sourceURL(request.url);
  if (request.expectedSha256 && !/^[a-f0-9]{64}$/u.test(request.expectedSha256))
    throw new Error('Invalid expected SHA-256');
  return request;
}

function checkBytes(bytes, kind) {
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES)
    throw new Error('Source size outside limits');
  const head = bytes.subarray(0, 64);
  const ascii = head.toString('ascii');
  if (kind === 'pdf' && !ascii.startsWith('%PDF-')) throw new Error('PDF signature mismatch');
  if (
    kind === 'html' &&
    !/^\s*(?:<!doctype\s+html|<html|<\?xml)/iu.test(bytes.subarray(0, 1024).toString('utf8'))
  )
    throw new Error('HTML signature mismatch');
  if (
    kind === 'image' &&
    !(
      head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (head[0] === 255 && head[1] === 216) ||
      (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP')
    )
  )
    throw new Error('Image signature mismatch');
  if (
    kind === 'audio' &&
    !(
      (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') ||
      ascii.startsWith('OggS') ||
      ascii.startsWith('ID3') ||
      (head[0] === 255 && (head[1] & 224) === 224) ||
      ascii.slice(4, 8) === 'ftyp'
    )
  )
    throw new Error('Audio signature mismatch');
  if (kind === 'answer-key') {
    const parsed = JSON.parse(bytes.toString('utf8'));
    if (!parsed || typeof parsed !== 'object')
      throw new Error('Answer key must be structured JSON');
  }
}

async function fetchBounded(url, fetchImpl, timeoutMs = 30_000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000)
    throw new Error('Invalid bounded source timeout');
  const response = await fetchImpl(sourceURL(url), {
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES)
    throw new Error('Source exceeds size limit');
  const chunks = [];
  let count = 0;
  for await (const chunk of response.body) {
    count += chunk.length;
    if (count > MAX_SOURCE_BYTES) throw new Error('Source exceeds size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Source bytes stay in a private store. Extraction is separate from editorial admission. */
export async function importSource(raw, options = {}) {
  const request = validateSourceRequest(raw);
  const store = resolve(
    options.store ?? join(homedir(), '.dharma/bunki_assessment/private-sources'),
  );
  const repositoryRoot = resolve(new URL('../../../../', import.meta.url).pathname);
  await mkdir(store, { recursive: true, mode: 0o700 });
  const resolvedStore = await realpath(store);
  const resolvedRepository = await realpath(repositoryRoot);
  const inRepository = relative(resolvedRepository, resolvedStore);
  if (
    !inRepository ||
    (!inRepository.startsWith(`..${sep}`) && inRepository !== '..' && !isAbsolute(inRepository))
  ) {
    throw new Error('Source store must be outside the repository and public site');
  }
  let bytes;
  if (request.url)
    bytes = await fetchBounded(request.url, options.fetchImpl ?? fetch, options.timeoutMs);
  else {
    const sourceStat = await stat(request.file);
    if (!sourceStat.isFile() || sourceStat.size > MAX_SOURCE_BYTES)
      throw new Error('Invalid source file');
    bytes = await readFile(request.file);
  }
  checkBytes(bytes, request.kind);
  const digest = sha256(bytes);
  if (request.expectedSha256 && digest !== request.expectedSha256)
    throw new Error('Source digest mismatch');
  const directory = join(resolvedStore, safeId(request.id));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await realpath(directory)) !== directory)
    throw new Error('Source store entry cannot be a symlink');
  const asset = `${digest}.original`;
  try {
    await writeFile(join(directory, asset), bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (sha256(await readFile(join(directory, asset))) !== digest)
      throw new Error('Immutable source collision', { cause: error });
  }
  const receipt = {
    schema: 'kairo-assessment-source-import/1',
    id: request.id,
    title: request.title,
    edition: request.edition,
    location: request.location,
    kind: request.kind,
    url: request.url ?? null,
    importedAt: new Date().toISOString(),
    sha256: digest,
    bytes: bytes.length,
    asset,
    distribution: request.distribution,
    rightsBasis: request.rightsBasis,
    publicGrant: request.publicGrant ?? null,
    extraction: 'not-performed',
    review: 'not-established',
  };
  const receiptBytes = JSON.stringify(receipt, null, 2) + '\n';
  await writeFile(join(directory, `${digest}.${sha256(receiptBytes)}.receipt.json`), receiptBytes, {
    flag: 'wx',
    mode: 0o600,
  });
  return receipt;
}
