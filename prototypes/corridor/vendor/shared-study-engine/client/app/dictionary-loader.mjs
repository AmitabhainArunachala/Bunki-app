const MAX_JSON=256*1024*1024,MAX_GZIP=64*1024*1024;
export const dictionaryHash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function readBounded(stream,max){const reader=stream.getReader(),chunks=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max)throw Error('Offline dictionary byte limit exceeded');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;}
export async function loadOfflineDictionary({fetch:request=globalThis.fetch,build=null,base='./qa/'}={}){
 if(build?.release3FullCorpus&&(!/^[a-f0-9]{64}$/.test(build.dictionarySha256||'')||!/^[a-f0-9]{64}$/.test(build.dictionaryJSONSha256||'')||!Number.isSafeInteger(build.dictionaryJSONBytes)||build.dictionaryJSONBytes<1||build.dictionaryJSONBytes>MAX_JSON||build.files?.['dictionary.json.gz']!==build.dictionarySha256))throw Error('Pinned full-corpus dictionary manifest required');
 const compressed=await request(base+'dictionary.json.gz',{cache:'no-store'});let bytes;
 if(compressed.ok){const gzip=await readBounded(compressed.body,MAX_GZIP);if(build?.dictionarySha256&&await dictionaryHash(gzip)!==build.dictionarySha256)throw Error('Offline dictionary compressed hash mismatch');if(typeof DecompressionStream!=='function')throw Error('Offline dictionary decompression unavailable');bytes=await readBounded(new Blob([gzip]).stream().pipeThrough(new DecompressionStream('gzip')),MAX_JSON);}
 else{if(build?.dictionarySha256)throw Error('Offline dictionary compressed artifact missing');const plain=await request(base+'dictionary.json',{cache:'no-store'});if(!plain.ok)throw Error('Offline dictionary artifact missing');bytes=await readBounded(plain.body,MAX_JSON);}
 if(build?.dictionaryJSONBytes!==undefined&&bytes.byteLength!==build.dictionaryJSONBytes)throw Error('Offline dictionary JSON byte count mismatch');
 if(build?.dictionaryJSONSha256&&await dictionaryHash(bytes)!==build.dictionaryJSONSha256)throw Error('Offline dictionary JSON hash mismatch');
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
