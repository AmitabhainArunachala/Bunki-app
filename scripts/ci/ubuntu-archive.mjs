/** Change only the measured slow Azure Ubuntu archive; retain APT's normal installation. */
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const azure = /^(https?:\/\/)azure\.archive\.ubuntu\.com(\/ubuntu\/?)$/;
const replaceUri = (uri) => uri.replace(azure, '$1archive.ubuntu.com$2');

/** Pure fixture entrypoint. Unsupported layouts retain every original byte. */
export function rewriteUbuntuArchive(text, format) {
  let replacements = 0;
  let unsupported = 0;
  const replace = (uri) => {
    const next = replaceUri(uri);
    if (next !== uri) replacements++;
    return next;
  };
  if (format === 'mirrors') {
    text = text.replace(/[^\n]+/g, (line) => {
      // The pinned image's apt-mirrors.txt has one URI then untouched priority metadata.
      if (/^\s*#/.test(line)) return line;
      const entry = line.match(
        /^([ \t]*)(\S+)([ \t]+priority:[0-9]+(?:[ \t]+#[^\r\n]*)?[ \t]*\r?)$/,
      );
      if (!entry) {
        if (azure.test(line.trim().split(/\s+/)[0])) unsupported++;
        return line;
      }
      return entry[1] + replace(entry[2]) + entry[3];
    });
  } else if (format === 'list') {
    text = text.replace(/[^\n]+/g, (line) => {
      if (/^\s*#/.test(line) || !line.includes('azure.archive.ubuntu.com')) return line;
      const entry = line.match(
        /^(\s*deb(?:-src)?\s+(?:\[[^\]\r\n]*\]\s+)?)(\S+)(\s+)(\S+)(\s+[^#\r\n]+)([\s\S]*)$/,
      );
      if (!entry || !/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(entry[2])) {
        unsupported++;
        return line;
      }
      if (entry[4].endsWith('-security')) return line;
      return entry[1] + replace(entry[2]) + entry[3] + entry[4] + entry[5] + entry[6];
    });
  } else if (format === 'sources') {
    text = text
      .split(/(\r?\n[ \t]*\r?\n)/)
      .map((stanza) => {
        if (!stanza.includes('azure.archive.ubuntu.com')) return stanza;
        const lines = stanza.match(/[^\n]*\n|[^\n]+$/g) || [];
        const fields = new Map();
        let current;
        for (let index = 0; index < lines.length; index++) {
          const line = lines[index].replace(/\r?\n$/, '');
          if (!line.trim() || /^\s*#/.test(line)) continue;
          const field = line.match(/^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/);
          if (field && !fields.has(field[1].toLowerCase())) {
            current = field[1].toLowerCase();
            fields.set(current, { value: field[2], lines: [index] });
          } else if (/^[ \t]/.test(line) && current) {
            const record = fields.get(current);
            record.value += ' ' + line.trim();
            record.lines.push(index);
          } else {
            unsupported++;
            return stanza;
          }
        }
        const uris = fields.get('uris');
        if (!uris || fields.get('enabled')?.value.trim().toLowerCase() === 'no') return stanza;
        const suites = fields.get('suites')?.value.trim().split(/\s+/);
        const types = fields.get('types')?.value.trim().split(/\s+/);
        if (
          !fields.get('suites')?.value.trim() ||
          !types?.every((type) => ['deb', 'deb-src'].includes(type)) ||
          !fields.get('components')?.value.trim() ||
          !uris.value
            .trim()
            .split(/\s+/)
            .every((uri) => /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(uri))
        ) {
          unsupported++;
          return stanza;
        }
        // Even an unusual Azure security or mixed archive/security stanza stays untouched.
        if (suites.some((suite) => suite.endsWith('-security'))) return stanza;
        for (const index of uris.lines)
          lines[index] = lines[index].replace(/\S+/g, (token) => replace(token));
        return lines.join('');
      })
      .join('');
  } else unsupported++;
  return { text, replacements, unsupported };
}

function main() {
  assert.equal(process.argv.length, 2, 'No source-path override is supported');
  assert(
    process.platform === 'linux' &&
      process.env.CI === 'true' &&
      process.env.GITHUB_ACTIONS === 'true' &&
      process.env.RUNNER_OS === 'Linux',
    'Real APT source writes require Ubuntu GitHub CI',
  );
  assert(/^ID=(?:ubuntu|"ubuntu")\r?$/m.test(readFileSync('/etc/os-release', 'utf8')));
  const directory = '/etc/apt/sources.list.d';
  const files = [
    ['/etc/apt/sources.list', 'list'],
    ...(existsSync(directory)
      ? readdirSync(directory)
          .filter((file) => /\.(?:sources|list)$/.test(file))
          .sort()
          .map((file) => [join(directory, file), file.endsWith('.sources') ? 'sources' : 'list'])
      : []),
    ['/etc/apt/apt-mirrors.txt', 'mirrors'],
  ];
  const counts = { literalSource: 0, mirrorFile: 0 };
  for (const [file, format] of files) {
    if (!existsSync(file)) continue;
    if (!lstatSync(file).isFile()) {
      console.log(`::notice::APT source layout retained without rewrite: ${file}`);
      continue;
    }
    const original = readFileSync(file, 'utf8');
    const rewritten = rewriteUbuntuArchive(original, format);
    if (rewritten.text !== original) writeFileSync(file, rewritten.text);
    counts[format === 'mirrors' ? 'mirrorFile' : 'literalSource'] += rewritten.replacements;
    if (rewritten.unsupported)
      console.log(`::notice::Unsupported APT entries retained unchanged: ${file}`);
  }
  console.log(`Ubuntu literal-source URI substitutions: ${counts.literalSource}`);
  console.log(`Ubuntu mirror-file URI substitutions: ${counts.mirrorFile}`);
  console.log('Normal APT update/install and signature checks follow unchanged.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
