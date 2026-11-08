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
const declared = (statement) => {
  if (statement.type === 'ExportNamedDeclaration') return statement.declaration ? [statement.declaration] : [];
  if (statement.type === 'ExportDefaultDeclaration' && /Declaration$/u.test(statement.declaration.type)) return [statement.declaration];
  return [statement];
};
const sources = (statement) => {
  if (statement.type === 'ImportDeclaration' || statement.type === 'ExportAllDeclaration') return [statement.source?.value];
  if (statement.type === 'ExportNamedDeclaration' && statement.source) return [statement.source.value];
  return [];
};
const moduleName = (node) => (node?.type === 'Literal' ? node.value : node?.name);

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
        if (statement.exported)
          throw new Error(`Unsupported export alias ${moduleName(statement.exported)} in authored corridor source ${label(path)}: only same-name named exports are lifted`);
        continue;
      }
      if (statement.type === 'ExportNamedDeclaration') {
        for (const specifier of statement.specifiers) {
          if (specifier.type !== 'ExportSpecifier' || moduleName(specifier.local) !== moduleName(specifier.exported))
            throw new Error(`Unsupported export alias ${moduleName(specifier.exported)} in authored corridor source ${label(path)}: only same-name named exports are lifted`);
        }
        if (statement.declaration) pieces.push(text.slice(statement.declaration.start, statement.declaration.end));
        continue;
      }
      if (statement.type === 'ExportDefaultDeclaration') {
        const declaration = statement.declaration;
        if ((declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') && declaration.id)
          pieces.push(text.slice(declaration.start, declaration.end));
        else throw new Error(`Unsupported default export in authored corridor source ${label(path)}: only named function or class declarations are lifted`);
        continue;
      }
      pieces.push(text.slice(statement.start, statement.end));
    }
    return pieces.join('\n\n');
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
    if (visited.has(realPath)) return;
    visited.add(realPath);
    let info;
    try { info = statSync(realPath); } catch (error) {
      throw new Error(`Missing authored corridor source ${label(path)}: ${error.message}`);
    }
    if (!info.isFile()) throw new Error(`Missing authored corridor source ${label(path)}: not a file`);
    const { text, ast } = parseFile(path, realPath);
    const relativePath = label(path);
    files.push({ path: relativePath, sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) });
    for (const statement of ast.body) {
      for (const declaration of declared(statement)) {
        const names = declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration'
          ? [declaration.id?.name]
          : declaration.type === 'VariableDeclaration' ? declaration.declarations.flatMap((entry) => patternNames(entry.id)) : [];
        for (const name of names) {
          if (!name) continue;
          const owner = owners.get(name);
          if (owner) throw new Error(`Duplicate authored declaration ${name} in ${owner} and ${relativePath}`);
          owners.set(name, relativePath);
        }
      }
    }
    declarations.push(sourceOf(text, ast, path));
    for (const statement of ast.body) {
      for (const specifier of sources(statement)) {
        if (!specifier) continue;
        if (isAbsolute(specifier)) throw new Error(`Authored corridor import escapes its source root: ${specifier} from ${relativePath}`);
        if (!specifier.startsWith('.')) continue;
        if (path === corridorPath && !specifier.startsWith(`./${MODULES}/`)) continue;
        const target = resolve(dirname(path), specifier);
        if (target === corridorPath) continue; // the corridor cycle is authored once
        if (!inside(modulesRoot, target)) throw new Error(`Authored corridor import escapes ${MODULES}/: ${specifier} from ${relativePath}`);
        const stat = statSync(target, { throwIfNoEntry: false });
        if (!stat?.isFile()) throw new Error(`Missing authored corridor source ${slash(relative(root, target))} imported by ${relativePath}`);
        visit(target);
      }
    }
  };
  visit(corridorPath);
  return { source: declarations.join('\n\n'), files };
}
