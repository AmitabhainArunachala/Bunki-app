'use strict';
/* global __filename */

// Build-time only. Both development and packaging consume the same closed host.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire, isBuiltin } = require('node:module');
const { Buffer } = require('node:buffer');

const NATIVE_RPC_PATH = 'lib/native-rpc-session.cjs';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inside = (root, file) => {
  const rel = path.relative(root, file);
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
};

async function stageDesktopHost({
  root,
  desktop = path.join(root, 'prototypes/bunki-desktop'),
  output,
}) {
  root = fs.realpathSync(root);
  desktop = fs.realpathSync(desktop);
  const { externalPath } = require(path.join(desktop, 'lib/paths.cjs'));
  const hostSource = externalPath(output, { fresh: true });
  assert(!inside(root, hostSource), 'Host output cannot be inside the checkout');
  const outputParent = path.dirname(hostSource);
  fs.mkdirSync(outputParent, { recursive: true });
  const directoryIdentity = (dir) => {
    const stat = fs.lstatSync(dir);
    assert(
      stat.isDirectory() && !stat.isSymbolicLink(),
      'Host directory must remain a real directory',
    );
    return { path: fs.realpathSync(dir), dev: stat.dev, ino: stat.ino };
  };
  const parentIdentity = directoryIdentity(outputParent);
  assert.equal(parentIdentity.path, outputParent, 'Host output parent changed before staging');
  let hostIdentity;
  const verifyDestination = () => {
    assert.deepEqual(directoryIdentity(outputParent), parentIdentity, 'Host output parent changed');
    if (hostIdentity)
      assert.deepEqual(
        directoryIdentity(hostSource),
        hostIdentity,
        'Staged host directory changed',
      );
  };
  const sourceFiles = new Map();
  const sourceLinks = new Map();
  const remember = (file) => {
    const requested = path.resolve(file);
    const real = fs.realpathSync(file);
    if (sourceLinks.has(requested))
      assert.equal(real, sourceLinks.get(requested), 'Host input link changed');
    else sourceLinks.set(requested, real);
    assert(fs.statSync(real).isFile(), 'A host input must be a regular file');
    const bytes = fs.readFileSync(real);
    const previous = sourceFiles.get(real);
    if (previous) assert.deepEqual(bytes, previous, 'A host input changed during staging');
    else sourceFiles.set(real, bytes);
    return bytes;
  };
  const sourcePackage = JSON.parse(remember(path.join(desktop, 'package.json')));
  assert.equal(sourcePackage.main, 'main.cjs', 'The closed host has one main entry');
  const manifest = JSON.parse(remember(path.join(root, 'package.json')));
  const lock = JSON.parse(remember(path.join(root, 'package-lock.json')));
  // Pass the captured base explicitly so esbuild never consults an uncaptured
  // per-directory tsconfig while transforming a captured source file.
  const tsconfigFile = path.join(root, 'tsconfig.base.json');
  const tsconfigBytes = remember(tsconfigFile);
  const tsconfigRaw = JSON.parse(tsconfigBytes);
  assert(!tsconfigRaw.extends, 'The host compiler base must be self-contained');
  const workspaceNames = fs.readdirSync(path.join(root, 'packages')).sort();
  const workspaceExports = new Map();
  for (const name of workspaceNames) {
    const file = path.join(root, 'packages', name, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(remember(file));
    assert(
      typeof pkg.name === 'string' && pkg.name.startsWith('@bunki/'),
      'Unexpected workspace name',
    );
    assert(!workspaceExports.has(pkg.name), 'Workspace names must be unique');
    workspaceExports.set(pkg.name, { directory: path.dirname(file), exports: pkg.exports });
  }
  remember(__filename);
  const esbuild = createRequire(path.join(root, 'package.json'))('esbuild');
  assert.equal(
    esbuild.version,
    manifest.devDependencies.esbuild,
    'The host compiler must match the exact repository esbuild pin',
  );
  const authoredPaths = [
    'main.cjs',
    'preload.cjs',
    ...fs
      .readdirSync(path.join(desktop, 'lib'))
      .filter((name) => name.endsWith('.cjs'))
      .map((name) => 'lib/' + name),
  ].sort();
  assert(
    !authoredPaths.includes(NATIVE_RPC_PATH),
    'Generated native client cannot shadow authored source',
  );
  const hostBytes = new Map(
    authoredPaths.map((name) => {
      const requested = path.join(desktop, name);
      const file = fs.realpathSync(requested);
      assert(inside(desktop, file), 'Authored host inputs cannot escape their source directory');
      return [name, Buffer.from(remember(requested))];
    }),
  );
  const build = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ['prototypes/bunki-desktop/tools/native-sync-entry.ts'],
    outfile: NATIVE_RPC_PATH,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2022',
    charset: 'utf8',
    legalComments: 'inline',
    sourcemap: false,
    metafile: true,
    write: false,
    logLevel: 'silent',
    tsconfigRaw,
    // Preserve requested paths until onLoad can check their identity. Otherwise
    // esbuild resolves relative symlinks before this capture hook sees them.
    preserveSymlinks: true,
    plugins: [
      {
        name: 'captured-host-source',
        setup(builder) {
          // Resolve workspace exports from captured metadata and explicit source
          // paths. node_modules aliases cannot select a different workspace.
          builder.onResolve({ filter: /^[^./]/ }, ({ path: specifier, kind, importer }) => {
            if (kind === 'entry-point') return;
            // An unused adapter can mention a Node built-in. The final imports
            // check below still refuses any dependency that survives bundling.
            if (isBuiltin(specifier)) return { path: specifier, external: true };
            if (specifier === 'zod') {
              let directory;
              let locked;
              for (
                let parent = path.dirname(importer);
                inside(root, parent);
                parent = path.dirname(parent)
              ) {
                const candidate = path.join(parent, 'node_modules/zod');
                const entry =
                  lock.packages[path.relative(root, candidate).split(path.sep).join('/')];
                if (entry) {
                  directory = candidate;
                  locked = entry;
                  break;
                }
              }
              assert(directory && locked, 'Native dependency must have a captured lock entry');
              const pkg = JSON.parse(remember(path.join(directory, 'package.json')));
              assert.equal(pkg.name, 'zod');
              assert.equal(pkg.version, locked.version);
              const condition = kind === 'require-call' ? 'require' : 'import';
              const exported = pkg.exports?.['.']?.[condition];
              assert(
                typeof exported === 'string' && exported.startsWith('./'),
                'Unsupported zod export',
              );
              const requested = path.resolve(directory, exported);
              const real = fs.realpathSync(requested);
              assert(inside(root, real), 'Native dependency escaped the checkout');
              remember(requested);
              return { path: real };
            }
            const match = /^(@bunki\/[^/]+)(\/.*)?$/.exec(specifier);
            assert(match, 'The native client may only import repository workspaces: ' + specifier);
            const workspace = workspaceExports.get(match[1]);
            assert(workspace, 'Unknown native client workspace');
            const subpath = match[2] ? '.' + match[2] : '.';
            const exported =
              typeof workspace.exports === 'string'
                ? subpath === '.'
                  ? workspace.exports
                  : undefined
                : workspace.exports?.[subpath];
            assert(
              typeof exported === 'string' && exported.startsWith('./'),
              'Unsupported workspace export',
            );
            const requested = path.resolve(workspace.directory, exported);
            const real = fs.realpathSync(requested);
            assert(inside(workspace.directory, real), 'Workspace export escaped its package');
            remember(requested);
            return { path: real };
          });
          builder.onLoad({ filter: /.*/, namespace: 'file' }, ({ path: input }) => {
            const file = fs.realpathSync(input);
            assert.equal(
              path.resolve(input),
              file,
              'Native compiler source aliases are not supported',
            );
            assert(inside(root, file), 'Native client input escaped the selected checkout');
            const bytes = remember(input);
            const text = bytes.toString('utf8');
            assert.deepEqual(
              Buffer.from(text, 'utf8'),
              bytes,
              'Native client source must be exact UTF-8',
            );
            const loader = {
              '.ts': 'ts',
              '.tsx': 'tsx',
              '.js': 'js',
              '.jsx': 'jsx',
              '.mjs': 'js',
              '.cjs': 'js',
              '.json': 'json',
            }[path.extname(file)];
            assert(loader, 'Unsupported native client source type');
            return { contents: text, loader, resolveDir: path.dirname(file) };
          });
        },
      },
    ],
  });
  assert.equal(build.outputFiles.length, 1, 'Native RPC host client must remain one bundle');
  assert.equal(Object.keys(build.metafile.outputs).length, 1);
  assert.deepEqual(
    Object.values(build.metafile.outputs)[0].imports,
    [],
    'The staged native client cannot require an unstaged package or external module',
  );
  const compilerInputs = Object.keys(build.metafile.inputs)
    .map((name) => {
      const file = fs.realpathSync(path.resolve(root, name));
      assert(inside(root, file), 'Native client input escaped the selected checkout');
      return {
        path: path.relative(root, file).split(path.sep).join('/'),
        sha256: digest(remember(file)),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const nativeBytes = Buffer.from(build.outputFiles[0].contents);
  hostBytes.set(NATIVE_RPC_PATH, nativeBytes);
  const hostPaths = [...hostBytes.keys()].sort();
  const metadata = {
    name: sourcePackage.name,
    version: sourcePackage.version,
    description: sourcePackage.description,
    main: sourcePackage.main,
    private: true,
    dependencies: {},
  };
  const metadataBytes = Buffer.from(JSON.stringify(metadata, null, 2) + '\n');
  const inputs = [...sourceFiles]
    .map(([file, bytes]) => ({ file, sha256: digest(bytes) }))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const nativeRpc = {
    path: NATIVE_RPC_PATH,
    sha256: digest(nativeBytes),
    bytes: nativeBytes.length,
    compiler: {
      name: 'esbuild',
      version: esbuild.version,
      platform: 'node',
      format: 'cjs',
      target: 'es2022',
      tsconfig: { path: 'tsconfig.base.json', sha256: digest(tsconfigBytes) },
      resolver: 'captured-workspace-exports-and-lock',
      sourceAliases: 'preserved-until-capture-and-refused',
    },
    inputs: compilerInputs,
    metafile: build.metafile,
  };
  const verifyInputs = () => {
    assert.deepEqual(
      fs.readdirSync(path.join(root, 'packages')).sort(),
      workspaceNames,
      'Workspace directory set changed after staging',
    );
    for (const [requested, real] of sourceLinks)
      assert.equal(fs.realpathSync(requested), real, 'Host input link changed after staging');
    for (const [file, bytes] of sourceFiles)
      assert.deepEqual(fs.readFileSync(file), bytes, 'Host source changed after staging: ' + file);
    const currentPaths = [
      'main.cjs',
      'preload.cjs',
      ...fs
        .readdirSync(path.join(desktop, 'lib'))
        .filter((name) => name.endsWith('.cjs'))
        .map((name) => 'lib/' + name),
    ].sort();
    assert.deepEqual(currentPaths, authoredPaths, 'Authored host file set changed after staging');
  };
  const verifyStaged = () => {
    verifyDestination();
    const walk = (dir) =>
      fs
        .readdirSync(dir)
        .sort()
        .flatMap((name) => {
          const file = path.join(dir, name);
          const stat = fs.lstatSync(file);
          assert(!stat.isSymbolicLink(), 'Staged host cannot contain symlinks');
          if (stat.isDirectory()) return walk(file);
          assert(stat.isFile(), 'Unsupported staged host entry');
          return [path.relative(hostSource, file).split(path.sep).join('/')];
        });
    assert.deepEqual(
      walk(hostSource).sort(),
      [...hostPaths, 'package.json'].sort(),
      'Staged host must contain exactly its declared runtime',
    );
    for (const [name, bytes] of hostBytes)
      assert.deepEqual(
        fs.readFileSync(path.join(hostSource, name)),
        bytes,
        'Staged host changed: ' + name,
      );
    assert.deepEqual(
      fs.readFileSync(path.join(hostSource, 'package.json')),
      metadataBytes,
      'Staged host metadata changed',
    );
  };
  // Verify captured inputs and the pinned parent before creating the runtime;
  // callers retain a failed directory for diagnosis, never as a valid bundle.
  verifyInputs();
  verifyDestination();
  fs.mkdirSync(hostSource);
  hostIdentity = directoryIdentity(hostSource);
  assert.equal(hostIdentity.path, hostSource, 'Host output changed during creation');
  for (const [name, bytes] of hostBytes) {
    verifyDestination();
    fs.mkdirSync(path.dirname(path.join(hostSource, name)), { recursive: true });
    verifyDestination();
    fs.writeFileSync(path.join(hostSource, name), bytes, { flag: 'wx' });
  }
  verifyDestination();
  fs.writeFileSync(path.join(hostSource, 'package.json'), metadataBytes, { flag: 'wx' });
  verifyInputs();
  verifyStaged();
  return {
    hostSource,
    hostPaths,
    hostBytes,
    authoredPaths,
    sourcePackage,
    metadataBytes,
    inputs,
    nativeRpc,
    verifyInputs,
    verifyStaged,
  };
}

module.exports = { stageDesktopHost, NATIVE_RPC_PATH };
