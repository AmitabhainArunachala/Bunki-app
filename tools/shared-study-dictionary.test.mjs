/* global Response, structuredClone */
import {Buffer} from 'node:buffer';
import process from 'node:process';
import {URL} from 'node:url';
import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {buildSharedStudyBinding,verifySharedDictionaryArtifact} from '../scripts/shared-study-binding.mjs';
import {sharedDictionaryBuild} from '../prototypes/corridor/shared-study-content.mjs';
// Staged checks may explicitly select the unchanged canonical source modules.
// The integrated default MUST use the verified Bunki distribution after repin.
const canonical=process.env.NSRS_DICTIONARY_SOURCE_ROOT?pathToFileURL(resolve(process.env.NSRS_DICTIONARY_SOURCE_ROOT)+'/'):new URL('../prototypes/corridor/vendor/shared-study-engine/',import.meta.url);
const {loadOfflineDictionary}=await import(new URL('client/app/dictionary-loader.mjs',canonical));
const {prepareOfflineDictionary}=await import(new URL('client/player/dictionary.mjs',canonical));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
 const source={catalogSha256:'a'.repeat(64),registrySha256:'b'.repeat(64)},text='𠮷は抜かれた。';
 const catalog=[{taskKey:'test-dictionary-card',noteGuid:'test-guid',contractId:'vocabulary.read.v1',term:'別',reading:'べつ',ja:text}];
 const input={format:'nsrs-offline-dictionary/v1',entries:{nuku:{lemma:'抜く',reading:'ぬく',glosses:['to extract'],source:'JMdict'}},passages:{'test-dictionary-card|passage':{sourceSha256:sha(text),sourceText:text,tokens:[{start:2,end:6,unit:'codepoint',surface:'抜かれた',lemma:'抜く',reading:'ぬかれた',entryKey:'nuku'}]}},kanji:{'募':{readings:['ボ','つのる'],meanings:['recruit']}},attribution:{source:'EDRDG',license:'CC BY-SA 4.0'}};
 const plain=Buffer.from(JSON.stringify(input)),gzip=gzipSync(plain),build={release3FullCorpus:true,dictionarySha256:sha(gzip),dictionaryJSONSha256:sha(plain),dictionaryJSONBytes:plain.length,files:{'catalog.json':source.catalogSha256,'registry.json':source.registrySha256,'dictionary.json.gz':sha(gzip)}};
 const buildBytes=Buffer.from(JSON.stringify(build)+'\n'),binding={source,dictionary:{format:'bunki-shared-dictionary/v1',buildSha256:sha(buildBytes),bytes:gzip.length,sha256:sha(gzip),jsonBytes:plain.length,jsonSha256:sha(plain)}};
 return{binding,build,buildBytes,gzip,plain,input,catalog};
}
function rebindBuild(f){f.buildBytes=Buffer.from(JSON.stringify(f.build)+'\n');f.binding.dictionary.buildSha256=sha(f.buildBytes);}
describe('shared canonical dictionary binding',()=>{
 it('authenticates exact compressed and expanded bytes then uses the canonical loader and preparer',async()=>{
  const f=fixture();expect(await verifySharedDictionaryArtifact(f.binding,f.buildBytes,f.gzip)).toEqual(f.build);
  const calls=[];const input=await loadOfflineDictionary({build:sharedDictionaryBuild(f.binding,f.build),base:'https://test.invalid/data/shared-study/',fetch:async(url,options)=>{calls.push({url,options});return new Response(f.gzip);}});
  expect(input).toEqual(f.input);expect(calls).toEqual([{url:'https://test.invalid/data/shared-study/dictionary.json.gz',options:{cache:'no-store'}}]);
  const dictionary=await prepareOfflineDictionary(input,f.catalog),entry=f.catalog[0];
  expect(dictionary.segments(entry,entry.ja,'passage')[0]).toMatchObject({surface:'抜かれた',start:3,end:7,unit:'utf16-code-unit'});
  expect(dictionary.resolve({surface:'抜かれた',span:{start:3,end:7},source:{context:entry.ja}})).toMatchObject({kind:'dictionary',lemma:'抜く',reading:'ぬく',glosses:['to extract']});
  expect(dictionary.resolve({surface:'募'})).toMatchObject({kind:'kanji',meanings:['recruit']});
  await expect(prepareOfflineDictionary(input,[{...entry,ja:'別の文章。'}])).rejects.toThrow('source mismatch');
 });
 it('refuses missing, malformed, oversized, and source-mismatched pins before any request',()=>{
  for(const mutate of [f=>delete f.binding.dictionary,f=>f.binding.dictionary.bytes=0,f=>f.binding.dictionary.bytes=64*1024*1024+1,f=>f.binding.dictionary.jsonBytes=256*1024*1024+1,f=>f.binding.dictionary.jsonSha256='bad',f=>f.binding.dictionary.buildSha256='bad']){const f=fixture();mutate(f);expect(()=>sharedDictionaryBuild(f.binding,f.build)).toThrow('shared-dictionary-binding-required');}
  for(const mutate of [f=>f.build.release3FullCorpus=false,f=>f.build.files['catalog.json']='c'.repeat(64),f=>f.binding.source.registrySha256='d'.repeat(64)]){const f=fixture();mutate(f);expect(()=>sharedDictionaryBuild(f.binding,f.build)).toThrow('shared-dictionary-source-mismatch');}
  for(const mutate of [f=>f.build.dictionarySha256='e'.repeat(64),f=>f.build.files['dictionary.json.gz']='f'.repeat(64),f=>f.build.dictionaryJSONBytes++,f=>f.build.dictionaryJSONSha256='e'.repeat(64)]){const f=fixture();mutate(f);expect(()=>sharedDictionaryBuild(f.binding,f.build)).toThrow('shared-dictionary-build-mismatch');}
 });
 it('rejects changed build bytes, gzip bytes and compressed length',async()=>{
  const f=fixture();await expect(verifySharedDictionaryArtifact(f.binding,Buffer.concat([f.buildBytes,Buffer.from(' ')]),f.gzip)).rejects.toThrow('shared-dictionary-build-hash');
  const changed=Buffer.from(f.gzip);changed[changed.length-1]^=1;await expect(verifySharedDictionaryArtifact(f.binding,f.buildBytes,changed)).rejects.toThrow('shared-dictionary-gzip-mismatch');
  f.binding.dictionary.bytes++;await expect(verifySharedDictionaryArtifact(f.binding,f.buildBytes,f.gzip)).rejects.toThrow('shared-dictionary-gzip-mismatch');
 });
 it('limits decompression to pinned JSON size and rejects wrong expanded hash or length',async()=>{
  for(const delta of [-1,1]){const f=fixture();f.build.dictionaryJSONBytes+=delta;f.binding.dictionary.jsonBytes+=delta;rebindBuild(f);await expect(verifySharedDictionaryArtifact(f.binding,f.buildBytes,f.gzip)).rejects.toThrow(delta<0?'shared-dictionary-json-byte-limit':'shared-dictionary-json-mismatch');}
  const f=fixture();f.build.dictionaryJSONSha256='0'.repeat(64);f.binding.dictionary.jsonSha256=f.build.dictionaryJSONSha256;rebindBuild(f);await expect(verifySharedDictionaryArtifact(f.binding,f.buildBytes,f.gzip)).rejects.toThrow('shared-dictionary-json-mismatch');
 });
 it('rejects malformed compressed data even when its compressed identity is self-consistent',async()=>{
  const f=fixture();f.gzip=Buffer.from('not a gzip stream');f.binding.dictionary.bytes=f.gzip.length;f.binding.dictionary.sha256=sha(f.gzip);f.build.dictionarySha256=f.binding.dictionary.sha256;f.build.files['dictionary.json.gz']=f.binding.dictionary.sha256;rebindBuild(f);
  await expect(verifySharedDictionaryArtifact(f.binding,f.buildBytes,f.gzip)).rejects.toThrow(/header|gzip|compression/i);
 });
 it('missing pinned gzip never requests unpinned plaintext',async()=>{
  const f=fixture(),requests=[];await expect(loadOfflineDictionary({build:sharedDictionaryBuild(f.binding,f.build),fetch:async url=>{requests.push(url);return new Response('',{status:404});}})).rejects.toThrow('compressed artifact missing');expect(requests).toEqual(['./qa/dictionary.json.gz']);
 });
 it('preserves the reviewed content fixture and adds only a detached dictionary binding',()=>{
  const reviewed=JSON.parse(readFileSync(new URL('./fixtures/shared-study-content-source.json',import.meta.url)));
  const old=buildSharedStudyBinding(reviewed.input);expect(sha(JSON.stringify(old)+'\n')).toBe(reviewed.expectedBindingSha256);
  const f=fixture();f.binding.source=reviewed.input.source;f.build.files['catalog.json']=f.binding.source.catalogSha256;f.build.files['registry.json']=f.binding.source.registrySha256;rebindBuild(f);
  const next=buildSharedStudyBinding({...reviewed.input,dictionary:f.binding.dictionary,dictionaryBuild:f.build}),{dictionary,...rest}=next;expect(rest).toEqual(old);expect(dictionary).toEqual(f.binding.dictionary);
  f.binding.dictionary.jsonSha256='0'.repeat(64);expect(dictionary.jsonSha256).not.toBe(f.binding.dictionary.jsonSha256);
  const invalid=structuredClone(reviewed.input);invalid.dictionary=fixture().binding.dictionary;invalid.dictionaryBuild=fixture().build;expect(()=>buildSharedStudyBinding(invalid)).toThrow('shared-dictionary-source-mismatch');
 });
});
