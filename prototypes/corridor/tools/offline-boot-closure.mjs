import assert from 'node:assert/strict';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { build, version } from 'esbuild';

// Self-contained: Playwright serializes this function into the browser.
export function collectBootScripts(html) {
  const documentURL = new URL(/^https?:$/.test(location.protocol)
    ? location.href : 'https://offline-boot.invalid/index.html');
  const siteURL = new URL('.', documentURL);
  const document = new DOMParser().parseFromString(html, 'text/html');
  const local = (url) => {
    if (url.origin !== siteURL.origin || url.username || url.password ||
        !url.pathname.startsWith(siteURL.pathname)) {
      throw new Error(`Boot script URL escapes the site: ${url.href}`);
    }
    return url;
  };
  const base = document.querySelector('base[href]');
  const baseURL = base ? local(new URL(base.getAttribute('href'), documentURL)) : documentURL;
  const classicTypes = new Set([
    '', 'application/ecmascript', 'application/javascript', 'application/x-ecmascript',
    'application/x-javascript', 'text/ecmascript', 'text/javascript',
    'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3',
    'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript',
    'text/x-ecmascript', 'text/x-javascript',
  ]);
  const paths = new Set();
  for (const script of document.querySelectorAll('script')) {
    if (script.hasAttribute('nomodule') || script.closest('noscript')) continue;
    const type = (script.getAttribute('type') ??
      (script.getAttribute('language') ? `text/${script.getAttribute('language')}` : '')).trim().toLowerCase();
    if (type !== 'module' && !classicTypes.has(type)) continue;
    if (!script.hasAttribute('src')) {
      if (type === 'module' && script.textContent.trim()) {
        throw new Error('Inline module imports are not represented by external boot roots');
      }
      continue;
    }
    const src = script.getAttribute('src').trim();
    if (!src) throw new Error('Empty external boot script source');
    const url = local(new URL(src, baseURL));
    // stampedSW keys non-navigation assets by origin + pathname.
    paths.add(decodeURIComponent(url.pathname.slice(siteURL.pathname.length)));
  }
  return [...paths].sort();
}

export async function eagerBootClosure(siteRoot, scriptRoots) {
  const root = realpathSync(siteRoot);
  const inside = (file) => {
    const path = relative(root, file);
    assert(!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`),
      `Boot dependency escapes the site: ${file}`);
  };
  const checked = (file) => {
    inside(file);
    const real = realpathSync(file);
    inside(real);
    assert(statSync(real).isFile(), `Boot dependency is not a file: ${file}`);
    return file;
  };
  const entries = [...new Set(scriptRoots)].map((path) => {
    assert(typeof path === 'string' && path && !isAbsolute(path) &&
      !/^[a-z][a-z\d+.-]*:/i.test(path) && !/[\\\0?#]/.test(path),
    'Expected an artifact-relative boot root');
    return checked(resolve(root, path));
  });
  const manifest = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
  assert.equal(version, manifest.devDependencies.esbuild, 'Use the pinned esbuild parser');
  if (!entries.length) return [];
  const result = await build({
    absWorkingDir: root,
    entryPoints: entries,
    outdir: resolve(root, '.offline-boot-closure'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    metafile: true,
    treeShaking: false,
    ignoreAnnotations: true,
    preserveSymlinks: true,
    logLevel: 'silent',
    plugins: [{
      name: 'eager-browser-imports',
      setup(parser) {
        parser.onResolve({ filter: /.*/ }, (args) => {
          if (args.kind === 'dynamic-import') return { path: args.path, external: true };
          if (args.kind === 'entry-point') return { path: checked(args.path) };
          assert(args.kind === 'import-statement', `Unsupported boot dependency: ${args.path}`);
          assert(!args.path.startsWith('//') &&
            (args.path.startsWith('./') || args.path.startsWith('../') || args.path.startsWith('/')),
          `Non-local static boot import: ${args.path}`);
          const path = decodeURIComponent(args.path.split(/[?#]/, 1)[0]);
          assert(!path.includes('\\') && !path.includes('\0'), `Invalid boot import: ${args.path}`);
          const file = path.startsWith('/') ? resolve(root, `.${path}`) : resolve(dirname(args.importer), path);
          return { path: checked(file) };
        });
        parser.onLoad({ filter: /.*/ }, (args) => ({
          contents: readFileSync(checked(args.path), 'utf8'),
          loader: 'js',
          resolveDir: dirname(args.path),
        }));
      },
    }],
  });
  // Inputs retain unused static imports too; output bytes reflect bundling and
  // must not be used as the browser's module-resolution inventory.
  return [...new Set(Object.keys(result.metafile.inputs).map((path) =>
    relative(root, checked(resolve(root, path))).split(sep).join('/')))].sort();
}
