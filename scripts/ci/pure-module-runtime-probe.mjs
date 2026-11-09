/** Bounded effect observations, not a security sandbox or proof for unexecuted inputs.
 * A separate process/VM realm instruments dependencies BEFORE evaluation and keeps
 * clock/timer traps away from node:test itself. Exercise callbacks use only data. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
const SELF = fileURLToPath(import.meta.url);
export function assertPureModules({ files = [], data = {}, exercise, source } = {}) {
  if (!Array.isArray(files) || typeof exercise !== 'function')
    throw Error('Explicit files and exercise required');
  const payload = { files: files.map((f) => resolve(f)), data, exercise: String(exercise), source };
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', SELF, '--pure-child'], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  let report;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    throw Error('Purity probe failed without a valid report: ' + r.stderr);
  }
  if (r.status !== 0 || report.calls.length)
    throw Error('Observed effect or failed operation: ' + JSON.stringify(report));
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === SELF && process.argv[2] === '--pure-child') {
  const payload = JSON.parse(readFileSync(0, 'utf8')),
    calls = [];
  const context = vm.createContext({
    structuredClone,
    __effect: (name) => {
      calls.push(name);
      throw Error('Forbidden effect: ' + name);
    },
  });
  vm.runInContext(
    `
 const effect=name=>(...args)=>__effect(name);
 const capability=name=>new Proxy(function(){},{get:(_t,key)=>effect(name+'.'+String(key)),apply:()=>__effect(name),construct:()=>__effect(name)});
 for(const name of ['fetch','XMLHttpRequest','WebSocket','Audio','AudioContext','webkitAudioContext','speechSynthesis','indexedDB','localStorage','sessionStorage','navigator','document','process','require'])Object.defineProperty(globalThis,name,{value:capability(name),configurable:false});
 for(const name of ['setTimeout','setInterval','setImmediate','clearTimeout','clearInterval','clearImmediate','queueMicrotask','requestAnimationFrame','cancelAnimationFrame','requestIdleCallback','cancelIdleCallback'])Object.defineProperty(globalThis,name,{value:effect(name),configurable:false});
 Object.defineProperty(globalThis,'performance',{value:new Proxy({},{get:(_t,key)=>{if(key==='timeOrigin')return __effect('performance.timeOrigin');return effect('performance.'+String(key));}})});
 Object.defineProperty(globalThis,'crypto',{value:capability('crypto')});
 for(const name of ['window','self'])Object.defineProperty(globalThis,name,{get:()=>__effect(name)});
 const realDate=Date;globalThis.Date=new Proxy(realDate,{apply:()=>__effect('Date()'),construct:(target,args)=>{if(!args.length)return __effect('new Date()');return Reflect.construct(target,args);},get:(target,key)=>key==='now'?effect('Date.now'):Reflect.get(target,key)});
 Math.random=effect('Math.random');
 globalThis.console={log:effect('console.log'),warn:effect('console.warn'),error:effect('console.error')};
 `,
    context,
  );
  const cache = new Map(),
    loaded = [];
  function moduleAt(file, inline) {
    if (cache.has(file)) return cache.get(file);
    let m;
    if (file.endsWith('.json')) {
      const json = readFileSync(file, 'utf8');
      const value = vm.runInContext('JSON.parse(' + JSON.stringify(json) + ')', context);
      m = new vm.SyntheticModule(
        ['default'],
        function () {
          this.setExport('default', value);
        },
        { context, identifier: file },
      );
    } else
      m = new vm.SourceTextModule(inline ?? readFileSync(file, 'utf8'), {
        context,
        identifier: file,
        initializeImportMeta(meta) {
          meta.url = pathToFileURL(file).href;
        },
        importModuleDynamically: async () => {
          calls.push('import()');
          throw Error('Dynamic import not in bounded pure graph');
        },
      });
    cache.set(file, m);
    loaded.push(file);
    return m;
  }
  const linker = (specifier, from) => {
    if (!specifier.startsWith('.')) {
      calls.push('external import ' + specifier);
      throw Error('Only explicit relative pure dependencies allowed');
    }
    return moduleAt(resolve(dirname(from.identifier), specifier));
  };
  try {
    const modules = [];
    if (payload.source !== undefined)
      modules.push(moduleAt(resolve('__pure_inline__.mjs'), payload.source));
    for (const file of payload.files) modules.push(moduleAt(file));
    for (const m of modules) {
      if (m.status === 'unlinked') await m.link(linker);
      if (m.status === 'linked') await m.evaluate({ timeout: 10000 });
    }
    context.__namespaces = modules.map((m) => m.namespace);
    context.__data = vm.runInContext(
      'JSON.parse(' + JSON.stringify(JSON.stringify(payload.data)) + ')',
      context,
    );
    await vm.runInContext('(' + payload.exercise + ')(__namespaces,__data)', context, {
      timeout: 10000,
    });
    process.stdout.write(
      JSON.stringify({
        calls,
        loaded,
        scope: 'observed imports and explicit fixture operations only',
      }),
    );
    if (calls.length) process.exitCode = 1;
  } catch (e) {
    process.stdout.write(JSON.stringify({ calls, loaded, error: String(e) }));
    process.exitCode = 1;
  }
}
