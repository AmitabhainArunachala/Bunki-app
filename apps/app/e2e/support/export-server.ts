/**
 * A static host for the real `expo export --platform web` output (WP-10).
 *
 * ## Why the E2E runs against the export and not `expo start`
 *
 * The definition of done's first comes-up-short item is "tests pass but the app
 * doesn't". A dev server compiles on demand, serves source maps, and papers over
 * a bundler failure with a hot reload; the export is the artifact. Driving the
 * export means the loop is proven against the bytes a browser would actually be
 * given, and it means a broken `expo export` fails the E2E instead of hiding
 * behind a working dev server.
 *
 * ## Why a hand-written server rather than a package
 *
 * Two reasons, one of them load-bearing. The controller's dependency register
 * (§14) is a closed list and `@playwright/test` is on it; a static-file package
 * is not, and adding one to serve forty lines' worth of `readFile` would widen
 * the register for nothing. The load-bearing reason is routing: `expo export`
 * static-renders a dynamic route to a literal `word/[lexemeId].html`, so
 * `/word/lex-bunki` has no file of its own. A real static host is *configured*
 * to answer that; a generic file server 404s it, and the word page — where the
 * candidate panel lives — would be unreachable in the test but reachable in
 * production. `resolveFile` below encodes that configuration explicitly.
 *
 * The same mapping already exists in `apps/app/scripts/capture-evidence.mjs`.
 * It is deliberately *not* imported from there: that script is WP-05's evidence
 * harness with its own lifetime, and a shared helper between an evidence script
 * and the acceptance test would make one of them change for the other's reasons.
 */

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Content types for everything `expo export` emits. */
const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * The two dynamic routes the export writes as literal `[param]` filenames.
 *
 * A table rather than a regex so that adding a third dynamic route is a visible
 * one-line change here, and so a route that stops existing fails loudly when the
 * file is missing rather than silently falling through to `+not-found`.
 */
const DYNAMIC_ROUTES: Readonly<Record<string, string>> = {
  word: 'word/[lexemeId].html',
  kanji: 'kanji/[character].html',
};

/**
 * Whether `candidate` is the root itself or one of its descendants.
 *
 * `startsWith(root)` is not sufficient: `/export-secret` starts with `/export`.
 * `relative` also gives the right answer on Windows drives and separators.
 */
function isWithinRoot(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === '' ||
    (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
  );
}

/**
 * Return an existing regular file only after resolving every symlink and
 * proving the final target is still inside the real export root.
 */
type ExistingFile =
  { readonly status: 'file'; readonly path: string } | { readonly status: 'absent' | 'unsafe' };

function existingFileWithin(root: string, candidate: string): ExistingFile {
  if (!isWithinRoot(root, candidate)) return { status: 'unsafe' };

  try {
    const actual = realpathSync(candidate);
    if (!isWithinRoot(root, actual)) return { status: 'unsafe' };
    return statSync(actual).isFile() ? { status: 'file', path: actual } : { status: 'absent' };
  } catch {
    return { status: 'absent' };
  }
}

function realExportRoot(dist: string): string | null {
  try {
    const root = realpathSync(dist);
    return statSync(root).isDirectory() ? root : null;
  } catch {
    return null;
  }
}

function decodePath(urlPath: string): string | null {
  const [rawPath = '/'] = urlPath.split('?');

  try {
    const decoded = decodeURIComponent(rawPath);
    // Backslash is a path separator on Windows and never a canonical URL-path
    // separator. Reject it on every platform so the policy cannot change with
    // the runner. NUL cannot name a filesystem path.
    return decoded.includes('\\') || decoded.includes('\0') ? null : decoded;
  } catch {
    return null;
  }
}

/**
 * Resolve one URL path to a regular file inside `dist`.
 *
 * Unsafe, malformed, escaping, symlink-escaping, and genuinely absent paths
 * return `null`. A normal unknown app route may still resolve to Expo's own
 * `+not-found.html`, preserving the existing client-routing behavior.
 */
export function resolveFile(dist: string, urlPath: string): string | null {
  const root = realExportRoot(dist);
  const clean = decodePath(urlPath);
  if (root === null || clean === null) return null;

  const segments = clean.split('/').filter((segment) => segment !== '');
  // Reject traversal as syntax even when normalization would happen to land
  // back inside the root. A traversal request must never alias a valid asset.
  if (segments.some((segment) => segment === '.' || segment === '..')) return null;

  if (segments.length === 0) {
    const index = existingFileWithin(root, join(root, 'index.html'));
    return index.status === 'file' ? index.path : null;
  }

  const direct = resolve(root, ...segments);
  if (!isWithinRoot(root, direct)) return null;

  if (extname(direct) !== '') {
    const directFile = existingFileWithin(root, direct);
    if (directFile.status === 'unsafe') return null;
    if (directFile.status === 'file') return directFile.path;
  }

  if (segments.length === 2) {
    const group = segments[0] ?? '';
    const parameterised = DYNAMIC_ROUTES[group];
    if (parameterised !== undefined) {
      const file = existingFileWithin(root, resolve(root, parameterised));
      if (file.status === 'unsafe') return null;
      if (file.status === 'file') return file.path;
    }
  }

  const asHtml = existingFileWithin(root, `${direct}.html`);
  if (asHtml.status === 'unsafe') return null;
  if (asHtml.status === 'file') return asHtml.path;

  const asIndex = existingFileWithin(root, join(direct, 'index.html'));
  if (asIndex.status === 'unsafe') return null;
  if (asIndex.status === 'file') return asIndex.path;

  const notFound = existingFileWithin(root, join(root, '+not-found.html'));
  return notFound.status === 'file' ? notFound.path : null;
}

export interface ExportHost {
  /** `http://127.0.0.1:<port>` — no trailing slash. */
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
}

/**
 * Serve `dist` on an ephemeral loopback port.
 *
 * Port 0 rather than a fixed port so several Playwright workers can each hold
 * their own host without colliding, and `no-store` so a reload in the middle of
 * the loop genuinely re-fetches the app instead of proving that a memory cache
 * survives — which is not the durability claim under test.
 */
export async function startExportHost(dist: string): Promise<ExportHost> {
  if (resolveFile(dist, '/') === null) {
    throw new Error(
      `No web export at ${dist}. Build it first:\n` +
        `  npm run export:web --workspace @bunki/app\n` +
        `(the controller §17.5 spelling is: cd apps/app && npx expo export --platform web)`,
    );
  }

  const server: Server = createServer((request, response) => {
    const file = resolveFile(dist, request.url ?? '/');
    if (file === null) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }

    try {
      const body = readFileSync(file);
      // Expo's not-found document is content, not a successful asset lookup.
      const statusCode = basename(file) === '+not-found.html' ? 404 : 200;
      response.writeHead(statusCode, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(body);
    } catch {
      // Files can disappear between resolution and read. Fail closed without
      // exposing an absolute runner path or filesystem error to the browser.
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('not found');
    }
  });

  await new Promise<void>((done) => {
    server.listen(0, '127.0.0.1', () => {
      done();
    });
  });

  const address = server.address() as AddressInfo | null;
  if (address === null) throw new Error('the export host reported no address');

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((done, fail) => {
        server.close((cause) => {
          if (cause === undefined) done();
          else fail(cause);
        });
      }),
  };
}
