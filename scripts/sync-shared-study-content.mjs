#!/usr/bin/env node
/** Generate frozen identity bindings, never infer identity from current text. */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSharedStudyBinding,verifySharedDictionaryArtifact} from './shared-study-binding.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), source = args[args.indexOf('--source') + 1];
if (!args.includes('--source') || !source) throw Error('Usage: --source /reviewed/content-directory [--check]');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const registry = read(resolve(source, 'registry.json')), catalog = read(resolve(source, 'catalog.json'));
const deckIds = ['n2', 'n1', 'senmon', 'kotoba-master'];
const packPaths = Object.fromEntries(deckIds.map(id => [id, resolve(repo, `prototypes/corridor/decks/${id}/deck.json`)]));
const buildBytes=readFileSync(resolve(source,'BUILD.json')),dictionaryBytes=readFileSync(resolve(source,'dictionary.json.gz'));
const dictionaryBuild=JSON.parse(buildBytes.toString('utf8'));
const dictionary={format:'bunki-shared-dictionary/v1',buildSha256:hash(resolve(source,'BUILD.json')),bytes:dictionaryBytes.length,
  sha256:dictionaryBuild.dictionarySha256,jsonSha256:dictionaryBuild.dictionaryJSONSha256,jsonBytes:dictionaryBuild.dictionaryJSONBytes};
const grammarAssets=Object.fromEntries(['registry.json','grammar.json','grammar-reviews.json'].map(name=>[name,hash(resolve(source,name))]));
const manifest=buildSharedStudyBinding({registry,catalog,packs:Object.fromEntries(Object.entries(packPaths).map(([id,path])=>[id,{deck:read(path),sha256:hash(path)}])),source:{registrySha256:hash(resolve(source,'registry.json')),catalogSha256:hash(resolve(source,'catalog.json'))},grammarAssets,dictionary,dictionaryBuild});
await verifySharedDictionaryArtifact(manifest,buildBytes,dictionaryBytes);
// Canonical grammar preparation authenticates the complete frozen registry.
// These are reviewed static content artifacts, never learner records.
for(const name of [...Object.keys(manifest.grammarAssets),'BUILD.json','dictionary.json.gz']) {
  const target=resolve(repo,'prototypes/corridor/data/shared-study',name), bytes=readFileSync(resolve(source,name));
  if(args.includes('--check')){if(!readFileSync(target).equals(bytes))throw Error(`Shared content asset is stale: ${name}`);}
  else {mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);}
}
const bytes = `${JSON.stringify(manifest)}\n`, destination = resolve(repo, 'prototypes/corridor/data/shared-study-content.json');
if (args.includes('--check')) {
  if (readFileSync(destination,'utf8') !== bytes) throw Error('Shared content binding is stale');
} else writeFileSync(destination, bytes);
console.log(JSON.stringify({checked:args.includes('--check'),...manifest.counts,bytes:Buffer.byteLength(bytes),source:manifest.source}));
