/* global URL */
/** Lift actual top-level declarations (functions, constants) out of the corridor's authored source, by name, for a
 * test that runs them in a VM with its own fakes. `optional` names the declarations a base may lack: they are left out
 * instead of failing the lift, so a test can fail on behaviour rather than on a missing name. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
export const CORRIDOR = new URL('../prototypes/corridor/', import.meta.url);

export function corridorDeclarations(file, names, optional = []) {
  const source = readFileSync(new URL(file, CORRIDOR), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return names
    .map((name) => {
      const statement = ast.statements.find(
        (node) =>
          (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
          (ts.isVariableStatement(node) &&
            node.declarationList.declarations.some((row) => row.name.getText(ast) === name)),
      );
      if (!statement && optional.includes(name)) return '';
      if (!statement) throw new Error(`the corridor declares no ${name} in ${file}`);
      // an exported declaration is lifted as the plain declaration it exports
      return statement.getText(ast).replace(/^export\s+/u, '');
    })
    .join('\n');
}
