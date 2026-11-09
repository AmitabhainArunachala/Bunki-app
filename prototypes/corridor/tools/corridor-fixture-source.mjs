/** Actual authored import-closure definitions for the existing VM fixtures.
 * No application behavior is copied here. Explicit corridor mutants replace
 * their root declarations; moved module definitions still come from the same
 * validated import/export graph the application loads. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parse} from 'acorn';
import {readAuthoredCorridor} from './authored-corridor-source.mjs';

const statements=source=>parse(source,{ecmaVersion:'latest',sourceType:'module'}).body;
const names=node=>node.type==='FunctionDeclaration'||node.type==='ClassDeclaration'?[node.id?.name]:
  node.type==='VariableDeclaration'?node.declarations.filter(d=>d.id.type==='Identifier').map(d=>d.id.name):[];

export function fixtureSource(directory,{rootSource=null}={}) {
  const authored=readAuthoredCorridor(directory);
  if(rootSource===null)return authored.source;
  const original=readFileSync(resolve(directory,'corridor.js'),'utf8');
  const rootNames=new Set(statements(original).flatMap(names));
  const replacements=new Map();
  for(const node of statements(rootSource))for(const name of names(node))if(rootNames.has(name))
    replacements.set(name,rootSource.slice(node.start,node.end));
  for(const name of rootNames)assert(replacements.has(name),`Mutant removed authored root declaration ${name}`);
  return statements(authored.source).map(node=>{
    const name=names(node).find(name=>rootNames.has(name));
    return name?replacements.get(name):authored.source.slice(node.start,node.end);
  }).join('\n\n');
}

export function fixtureDefinitions(source,requested) {
  const wanted=new Set(requested),found=new Set();
  const selected=statements(source).filter(node=>{
    const hits=names(node).filter(name=>wanted.has(name));hits.forEach(name=>found.add(name));return hits.length;
  });
  assert.deepEqual([...wanted].filter(name=>!found.has(name)),[],'Every fixture definition must come from the actual authored closure');
  return selected.map(node=>source.slice(node.start,node.end)).join('\n');
}
