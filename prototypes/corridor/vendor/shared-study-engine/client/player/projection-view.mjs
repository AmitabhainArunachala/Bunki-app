/** Public views cannot mutate the backend's current scheduling snapshot. */
export function createProjectionView(){
 const modes=new WeakMap();
 return projection=>{
  if(!projection||typeof projection!=='object')return projection;
  let plain=modes.get(projection);
  if(plain===undefined){
   plain=true;const pending=[projection],seen=new Set();
   while(pending.length){
    const value=pending.pop();if(!value||typeof value!=='object'||seen.has(value))continue;seen.add(value);
    // Native cloning preserves shared backing, so it is not an isolated view.
    if(typeof SharedArrayBuffer!=='undefined'&&(value instanceof SharedArrayBuffer||ArrayBuffer.isView(value)&&value.buffer instanceof SharedArrayBuffer))throw Error('projection-view-shared-memory');
    const proto=Object.getPrototypeOf(value);
    if(!Array.isArray(value)&&proto!==Object.prototype&&proto!==null)plain=false;
    if(value instanceof Map){for(const [key,item]of value)pending.push(key,item);}
    else if(value instanceof Set){for(const item of value)pending.push(item);}
    else if(!ArrayBuffer.isView(value))for(const key of Reflect.ownKeys(value)){
     const descriptor=Object.getOwnPropertyDescriptor(value,key);
     if(!Object.hasOwn(descriptor,'value'))throw Error('projection-view-accessor');
     pending.push(descriptor.value);
    }
   }
   // Normal persisted projections are plain records, arrays and scalar values.
   // Freeze their already-owned graph once; no clone on ordinary public reads.
   if(plain)for(const value of seen)Object.freeze(value);
   modes.set(projection,plain);
  }
  // Object.freeze does not disable Map/Set/Date/typed-array mutation methods.
  // Unusual metadata therefore gets an independent copy on every public read.
  return plain?projection:structuredClone(projection);
 };
}
