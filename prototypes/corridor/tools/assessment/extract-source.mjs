#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { sha256, safeId, sourceURL } from './source-import.mjs';

const run = promisify(execFile);
const entities = (text) =>
  text.replace(
    /&(?:amp|lt|gt|quot|apos|nbsp);/gu,
    (token) =>
      ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[
        token
      ],
  );

/** Mechanical extraction does not establish the printed layout, answer key or question quality. */
export async function extractSource(receipt, options = {}) {
  if (
    receipt.schema !== 'kairo-assessment-source-import/1' ||
    !/^[a-f0-9]{64}$/u.test(receipt.sha256) ||
    receipt.asset !== `${receipt.sha256}.original`
  )
    throw new Error('Invalid source receipt');
  safeId(receipt.id);
  const store = await realpath(
    resolve(options.store ?? join(homedir(), '.dharma/bunki_assessment/private-sources')),
  );
  const directory = join(store, receipt.id);
  const file = join(directory, receipt.asset);
  const actual = await realpath(file);
  if (actual !== file || !actual.startsWith(`${store}${sep}`))
    throw new Error('Source escaped private store');
  const bytes = await readFile(file);
  if (sha256(bytes) !== receipt.sha256 || bytes.length !== receipt.bytes)
    throw new Error('Source bytes changed');
  let content;
  if (receipt.kind === 'pdf') {
    const result = await run('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30_000,
    });
    const pages = result.stdout.split('\f');
    if (!pages.at(-1).trim()) pages.pop();
    content = {
      kind: 'pdf-text',
      pages: pages.map((text, index) => ({ page: index + 1, text, textSha256: sha256(text) })),
      fidelity: 'layout-and-glyph-review-required',
    };
  } else if (receipt.kind === 'html') {
    const html = bytes.toString('utf8');
    const text = entities(
      html
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, '')
        .replace(/<[^>]+>/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim(),
    );
    const links = [];
    for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/giu)) {
      try {
        const url = sourceURL(new URL(entities(match[1]), receipt.url).href).href;
        if (!links.includes(url)) links.push(url);
      } catch {
        /* Non-primary and non-HTTPS links are not ingestion targets. */
      }
    }
    content = {
      kind: 'html-text',
      text,
      textSha256: sha256(text),
      primarySourceLinks: links,
      fidelity: 'layout-review-required',
    };
  } else if (receipt.kind === 'answer-key') {
    content = {
      kind: 'answer-key-data',
      data: JSON.parse(bytes.toString('utf8')),
      fidelity: 'mapping-to-item-versions-required',
    };
  } else {
    const result = await run(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=codec_type,width,height',
        '-of',
        'json',
        file,
      ],
      { maxBuffer: 1024 * 1024, timeout: 30_000 },
    );
    content = {
      kind: `${receipt.kind}-metadata`,
      metadata: JSON.parse(result.stdout),
      fidelity:
        receipt.kind === 'audio'
          ? 'actual-audio-listening-review-required'
          : 'actual-image-inspection-required',
    };
  }
  const extraction = {
    schema: 'kairo-assessment-source-extraction/1',
    sourceId: receipt.id,
    sourceSha256: receipt.sha256,
    distribution: receipt.distribution,
    publicRedistribution: false,
    extractedAt: new Date().toISOString(),
    content,
    editorialReview: 'not-established',
  };
  const data = JSON.stringify(extraction, null, 2) + '\n';
  await writeFile(join(directory, `${receipt.sha256}.${sha256(data)}.extraction.json`), data, {
    flag: 'wx',
    mode: 0o600,
  });
  return extraction;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--receipt')
    throw new Error('Usage: extract-source.mjs --receipt private-receipt.json');
  const result = await extractSource(JSON.parse(await readFile(args[1], 'utf8')));
  console.log(
    JSON.stringify({
      sourceId: result.sourceId,
      sourceSha256: result.sourceSha256,
      kind: result.content.kind,
      pages: result.content.pages?.length ?? null,
      editorialReview: result.editorialReview,
    }),
  );
}
