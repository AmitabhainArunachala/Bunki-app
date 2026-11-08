/** Collect the authored declarations the corridor actually loads.
 *
 * The corridor is split across `corridor.js` and its `./modules/*.mjs` seams.
 * This helper follows that static, relative import closure once, strips the
 * import/export wiring, and returns the declaration source together with the
 * exact identity of every contributing file. The returned source is for the
 * existing AST/VM declaration lifts in the verifiers; it is deliberately not a
 * runtime, a module loader or a second copy of any application algorithm.
 */
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parse } from 'acorn';

const MODULES = 'modules';
const CORRIDOR = 'corridor.js';

const slash = (value) => value.split(sep).join('/');
const inside = (root, target) => {
  const path = relative(root, target);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};
const patternNames = (node, names = []) => {
  if (!node) return names;
  if (node.type === 'Identifier') names.push(node.name);
  else if (node.type === 'ObjectPattern') for (const property of node.properties) patternNames(property.type === 'RestElement' ? property.argument : property.value, names);
  else if (node.type === 'ArrayPattern') for (const element of node.elements) patternNames(element, names);
  else if (node.type === 'RestElement') patternNames(node.argument, names);
  else if (node.type === 'AssignmentPattern') patternNames(node.left, names);
  return names;
};
const declarationNames = (declaration) => declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration'
  ? [declaration.id?.name]
  : declaration.type === 'VariableDeclaration' ? declaration.declarations.flatMap((entry) => patternNames(entry.id)) : [];
const declared = (statement) => {
  if (statement.type === 'ExportNamedDeclaration') return statement.declaration ? [statement.declaration] : [];
  if (statement.type === 'ExportDefaultDeclaration' && /Declaration$/u.test(statement.declaration.type)) return [statement.declaration];
  return [statement];
};
const moduleName = (node) => (node?.type === 'Literal' ? node.value : node?.name);
const identifierName = (node) => (node?.type === 'Identifier' ? node.name : null);

export function readAuthoredCorridor(directory) {
  const root = resolve(directory);
  const corridorPath = resolve(root, CORRIDOR);
  const modulesRoot = resolve(root, MODULES);
  let realRoot;
  try { realRoot = realpathSync(root); } catch (error) {
    throw new Error(`Missing authored corridor root ${slash(root)}: ${error.message}`);
  }
  const realCorridorPath = resolve(realRoot, CORRIDOR);
  const realModulesRoot = resolve(realRoot, MODULES);
  const visited = new Set();
  const records = new Map();
  const files = [];
  const owners = new Map();
  const declarations = [];
  const label = (path) => slash(relative(root, path));

  const parseFile = (path, realPath) => {
    let text;
    try { text = readFileSync(realPath, 'utf8'); } catch (error) {
      throw new Error(`Missing authored corridor source ${label(path)}: ${error.message}`);
    }
    try { return { text, ast: parse(text, { ecmaVersion: 'latest', sourceType: 'module' }) }; } catch (error) {
      throw new Error(`Unparseable authored corridor source ${label(path)}: ${error.message}`);
    }
  };
  const sourceOf = (text, ast, path) => {
    const pieces = [];
    for (const statement of ast.body) {
      if (statement.type === 'ImportDeclaration') continue;
      if (statement.type === 'ExportAllDeclaration') {
        throw new Error(`Unsupported star or namespace export ${moduleName(statement.exported ?? statement.source)} in authored corridor source ${label(path)}: only same-name named exports are lifted`);
      }
      if (statement.type === 'ExportNamedDeclaration') {
        for (const specifier of statement.specifiers) {
          if (specifier.type !== 'ExportSpecifier' || !identifierName(specifier.local) ||
              identifierName(specifier.local) !== identifierName(specifier.exported))
            throw new Error(`Unsupported export alias ${moduleName(specifier.exported)} in authored corridor source ${label(path)}: only same-name named exports are lifted`);
        }
        if (statement.declaration) pieces.push(text.slice(statement.declaration.start, statement.declaration.end));
        continue;
      }
      if (statement.type === 'ExportDefaultDeclaration')
        throw new Error(`Unsupported default export in authored corridor source ${label(path)}: only named declarations are lifted`);
      pieces.push(text.slice(statement.start, statement.end));
    }
    return pieces.join('\n\n');
  };
  const recordOf = (path, realPath, ast) => {
    const record = { path: label(path), realPath, ast, declarations: new Set(), localExports: new Set(), forwardExports: [], imports: [] };
    const exportNames = new Set();
    for (const statement of ast.body) {
      if (statement.type === 'ExportDefaultDeclaration')
        throw new Error(`Unsupported default export in authored corridor source ${record.path}: only named declarations are lifted`);
      if (statement.type === 'ExportAllDeclaration')
        throw new Error(`Unsupported star or namespace export ${moduleName(statement.exported ?? statement.source)} in authored corridor source ${record.path}: only same-name named exports are lifted`);
      for (const declaration of declared(statement)) {
        for (const name of declarationNames(declaration)) {
          if (!name) continue;
          record.declarations.add(name);
          const owner = owners.get(name);
          if (owner) throw new Error(`Duplicate authored declaration ${name} in ${owner} and ${record.path}`);
          owners.set(name, record.path);
        }
      }
      if (statement.type !== 'ExportNamedDeclaration') continue;
      for (const name of statement.declaration ? declarationNames(statement.declaration) : []) {
        if (!name) continue;
        if (exportNames.has(name)) throw new Error(`Ambiguous authored export ${name} in ${record.path}`);
        exportNames.add(name);
        record.localExports.add(name);
      }
      for (const specifier of statement.specifiers) {
        const local = identifierName(specifier.local);
        const exported = identifierName(specifier.exported);
        if (specifier.type !== 'ExportSpecifier' || !local || !exported || local !== exported || exported === 'default')
          throw new Error(`Unsupported export alias ${moduleName(specifier.exported)} in authored corridor source ${record.path}: only same-name named exports are lifted`);
        if (exportNames.has(exported)) throw new Error(`Ambiguous authored export ${exported} in ${record.path}`);
        exportNames.add(exported);
        if (statement.source) record.forwardExports.push({ name: exported, source: statement.source.value, target: null });
        else record.localExports.add(exported);
      }
    }
    return record;
  };
  const follow = (path, specifier, relativePath) => {
    if (isAbsolute(specifier)) throw new Error(`Authored corridor import escapes its source root: ${specifier} from ${relativePath}`);
    if (!specifier.startsWith('.')) return null;
    if (path === corridorPath && !specifier.startsWith(`./${MODULES}/`)) return null;
    const target = resolve(dirname(path), specifier);
    if (target === corridorPath) return visit(corridorPath);
    if (!inside(modulesRoot, target)) throw new Error(`Authored corridor import escapes ${MODULES}/: ${specifier} from ${relativePath}`);
    const stat = statSync(target, { throwIfNoEntry: false });
    if (!stat?.isFile()) throw new Error(`Missing authored corridor source ${slash(relative(root, target))} imported by ${relativePath}`);
    return visit(target);
  };
  const visit = (path) => {
    let realPath;
    try { realPath = realpathSync(path); } catch (error) {
      throw new Error(`Missing authored corridor source ${label(path)}: ${error.message}`);
    }
    if (path === corridorPath) {
      if (!inside(realRoot, realPath) || realPath !== realCorridorPath)
        throw new Error(`Authored corridor source ${label(path)} resolves outside its selected root: ${slash(realPath)}`);
    } else if (!inside(realModulesRoot, realPath)) {
      throw new Error(`Authored corridor source ${label(path)} resolves outside ${MODULES}/: ${slash(realPath)}`);
    }
    if (visited.has(realPath)) return records.get(realPath) || null;
    visited.add(realPath);
    let info;
    try { info = statSync(realPath); } catch (error) {
      throw new Error(`Missing authored corridor source ${label(path)}: ${error.message}`);
    }
    if (!info.isFile()) throw new Error(`Missing authored corridor source ${label(path)}: not a file`);
    const { text, ast } = parseFile(path, realPath);
    const record = recordOf(path, realPath, ast);
    records.set(realPath, record);
    const relativePath = label(path);
    files.push({ path: relativePath, sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) });
    declarations.push(sourceOf(text, ast, path));
    for (const statement of ast.body) {
      if (statement.type === 'ImportDeclaration') {
        const specifier = statement.source?.value;
        if (!specifier) continue;
        const target = follow(path, specifier, relativePath);
        for (const entry of statement.specifiers || []) {
          if (!target) {
            if (entry.local?.name) record.imports.push({ name: entry.local.name, target: null });
            continue;
          }
          if (entry.type === 'ImportDefaultSpecifier')
            throw new Error(`Unsupported default import ${entry.local?.name || ''} in authored corridor source ${relativePath}: only same-name named imports are followed`);
          if (entry.type === 'ImportNamespaceSpecifier')
            throw new Error(`Unsupported namespace import ${entry.local?.name || ''} in authored corridor source ${relativePath}: only same-name named imports are followed`);
          const imported = identifierName(entry.imported);
          const local = identifierName(entry.local);
          if (!imported || !local || imported !== local || imported === 'default')
            throw new Error(`Unsupported import alias ${moduleName(entry.imported)} in authored corridor source ${relativePath}: only same-name named imports are followed`);
          record.imports.push({ name: local, target });
        }
        continue;
      }
      if (statement.type === 'ExportNamedDeclaration' && statement.source) {
        const target = follow(path, statement.source.value, relativePath);
        if (!target) throw new Error(`Unsupported external reexport in authored corridor source ${relativePath}: only same-name named reexports are followed`);
        for (const forwarded of record.forwardExports) {
          if (forwarded.source === statement.source.value) forwarded.target = target;
        }
      }
    }
    return record;
  };
  visit(corridorPath);
  const exported = new Map([...records.values()].map((record) => [record, new Set()]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of records.values()) {
      const names = exported.get(record);
      const add = (name) => { if (!names.has(name)) { names.add(name); changed = true; } };
      for (const name of record.localExports) {
        if (record.declarations.has(name)) { add(name); continue; }
        const imported = record.imports.find((entry) => entry.name === name);
        if (imported && (!imported.target || exported.get(imported.target)?.has(name))) add(name);
      }
      for (const forwarded of record.forwardExports) {
        if (forwarded.target && exported.get(forwarded.target)?.has(forwarded.name)) add(forwarded.name);
      }
    }
  }
  for (const record of records.values()) {
    for (const name of record.localExports) {
      if (!exported.get(record).has(name))
        throw new Error(`Unsupported authored export ${name} in ${record.path}: no grounded declaration or same-name export`);
    }
    for (const forwarded of record.forwardExports) {
      if (!forwarded.target || !exported.get(record).has(forwarded.name))
        throw new Error(`Unsupported reexport ${forwarded.name} in ${record.path}: ${moduleName(forwarded.source)} does not export it`);
    }
    for (const imported of record.imports) {
      if (!imported.target) continue;
      if (!exported.get(imported.target).has(imported.name))
        throw new Error(`Unsupported import ${imported.name} in ${record.path}: ${imported.target.path} does not export it`);
    }
  }
  return { source: declarations.join('\n\n'), files };
}
