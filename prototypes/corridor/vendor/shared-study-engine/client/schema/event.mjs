/** SYNC v4 immutable wire identity and synchronous, runtime-neutral hashing. */
export const EVENT_VERSION = 4;
export const POLICY_ID = 'nsrs-policy-v1';
export const SCHEDULED_CONTRACTS = ['vocabulary.read.v1', 'grammar.meaning.v1', 'grammar.cloze.v1'];
export const DEVICE_TYPES = ['review', 'capture', 'boost', 'capture-boost', 'hesitation-override', 'undo', 'suspend', 'known', 'repair', 'settings', 'baseline', 'manual-card'];
export const SERVER_TYPES = ['permit-grant', 'content-activate', 'learner-settings-baseline'];
// dayBounds searches three UTC days either side of an instant. Keep that
// search, the following learner-day key, and ISO serialization in years 0000–9999.
export const MAX_SYNC_TIME = Date.parse('9999-12-27T23:59:59.999Z');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const int = value => Number.isSafeInteger(value) && value >= 0;
const str = value => typeof value === 'string' && value.length > 0;
const scalarString = value => { for(const c of value){const cp=c.codePointAt(0);if(cp>=0xd800&&cp<=0xdfff)return false;}return true; };
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

export function canonicalStringify(value) {
  if (typeof value === 'string') {if(!scalarString(value))throw new TypeError('Unpaired Unicode surrogate');return JSON.stringify(value);}
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    for (let i=0;i<value.length;i++) if (!Object.hasOwn(value,i)) throw new TypeError('Sparse arrays are not canonical JSON');
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  if (plain(value)) return '{' + Object.keys(value).sort().map(key => canonicalStringify(key) + ':' + canonicalStringify(value[key])).join(',') + '}';
  throw new TypeError('Canonical data must contain only finite JSON values, without negative zero');
}

/** SHA-256 UTF-8, synchronous so no await can split an IndexedDB transaction.
 * Constants/rounds are FIPS 180-4 SHA-256; no Node/browser/environment imports.
 */
export function sha256(text) {
  let bytes;
  if (typeof text === 'string' && typeof TextEncoder === 'function') {
    // TextEncoder preserves b1 UTF-8 replacement for unpaired surrogates.
    // Keep the iterable path below for its historical non-string semantics.
    const encoded = new TextEncoder().encode(text), length = encoded.length;
    bytes = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
    bytes.set(encoded); bytes[length] = 128;
    const view = new DataView(bytes.buffer), bits = length * 8;
    view.setUint32(bytes.length - 8, Math.floor(bits / 0x100000000));
    view.setUint32(bytes.length - 4, bits >>> 0);
  } else {
    bytes = [];
    for (const character of text) {
      const raw = character.codePointAt(0);
      const cp = raw >= 0xd800 && raw <= 0xdfff ? 0xfffd : raw;
      if (cp <= 0x7f) bytes.push(cp);
      else if (cp <= 0x7ff) bytes.push(0xc0 | cp >>> 6, 0x80 | cp & 63);
      else if (cp <= 0xffff) bytes.push(0xe0 | cp >>> 12, 0x80 | cp >>> 6 & 63, 0x80 | cp & 63);
      else bytes.push(0xf0 | cp >>> 18, 0x80 | cp >>> 12 & 63, 0x80 | cp >>> 6 & 63, 0x80 | cp & 63);
    }
    const length = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const high = Math.floor(length / 0x100000000), low = length >>> 0;
    for (let shift = 24; shift >= 0; shift -= 8) bytes.push(high >>> shift & 255);
    for (let shift = 24; shift >= 0; shift -= 8) bytes.push(low >>> shift & 255);
  }
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rotate = (v, n) => v >>> n | v << (32 - n);
  const w = new Int32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = bytes[offset+i*4]<<24 | bytes[offset+i*4+1]<<16 | bytes[offset+i*4+2]<<8 | bytes[offset+i*4+3];
    for (let i = 16; i < 64; i++) {
      const a=w[i-15],b=w[i-2];
      w[i] = (w[i-16] + (rotate(a,7)^rotate(a,18)^a>>>3) + w[i-7] + (rotate(b,17)^rotate(b,19)^b>>>10)) | 0;
    }
    let [a,b,c,d,e,f,g,q] = h;
    for (let i = 0; i < 64; i++) {
      const t1=(q+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0;
      const t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))|0;
      q=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    [a,b,c,d,e,f,g,q].forEach((v,i)=>{ h[i]=(h[i]+v)|0; });
  }
  return h.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
export const payloadHash = value => sha256(canonicalStringify(value));
export const taskKey = (guid, contract, passageId) => JSON.stringify([guid, contract, passageId]);
export function isTaskKey(value) {
  if (typeof value !== 'string') return false;
  try { const tuple = JSON.parse(value); return Array.isArray(tuple) && tuple.length === 3 && tuple.every(str) && JSON.stringify(tuple) === value; }
  catch { return false; }
}

export function validateEvent(event, { allowServer = false } = {}) {
  const errors = [];
  if (!plain(event)) return { ok: false, unsupported: false, errors: ['event-not-object'] };
  if (event.v !== EVENT_VERSION || event.policy !== POLICY_ID || ![...DEVICE_TYPES,...SERVER_TYPES].includes(event.type))
    return { ok: false, unsupported: true, errors: ['unsupported-version-policy-or-type'] };
  const fields = ['v','id','learner','install','dseq','base','ts','epoch','policy','type','data'];
  if (Object.keys(event).some(key=>!fields.includes(key)) || fields.some(key=>!Object.hasOwn(event,key))) errors.push('event-fields');
  if (!str(event.learner) || !str(event.install) || event.install.includes(':') || !int(event.dseq) || event.dseq < 1 || event.id !== `${event.install}:${event.dseq}`) errors.push('installation-identity');
  if (![event.base,event.ts,event.epoch].every(int) || event.ts > MAX_SYNC_TIME) errors.push('event-integers');
  if (SERVER_TYPES.includes(event.type) && (!allowServer || event.install !== '@server')) errors.push('server-authority-required');
  if (DEVICE_TYPES.includes(event.type) && event.install === '@server') errors.push('reserved-installation');
  if (!plain(event.data)) return { ok: false, unsupported: false, errors: [...errors,'data-not-object'] };
  const d = event.data;
  const captureFields=['surface','lemma','reading','senseRef','resolution','kind','location','contextTaskKey','contentRevision','revealed','span','attemptId','targetTaskKey','depth','uncertaintyReason','source'];
  const fieldsByType={review:['taskKey','parent','contentRevision','rawRating','attempt','hesitation','permitId','learnAhead','boost','session','ratingPolicy'],capture:captureFields,boost:['taskKey','parent','observationId'],'capture-boost':['taskKey','parent','capture'],'hesitation-override':['taskKey','parent','target'],undo:['taskKey','parent','target'],suspend:['taskKey','parent','on'],known:['taskKey','parent','on'],repair:['taskKey','parent','action','hint','replacementTaskKey','replacementParent'],settings:['key','value'],'manual-card':['version','word','reading','meaning','example','note'],baseline:['taskKey','parent','contract','card','repair','suspended','known','sourceHash','snapshotHash','cutoff','missingHistory'],'permit-grant':['install','permitIds','timezone','day','startsAt','endsAt'],'content-activate':['revisions'],'learner-settings-baseline':['sourceHash','snapshotHash','settings']};
  if(Object.keys(d).some(key=>!fieldsByType[event.type].includes(key)))errors.push('unknown-data-fields');
  if (['review','boost','capture-boost','hesitation-override','undo','suspend','known','repair','baseline'].includes(event.type)) {
    if (!isTaskKey(d.taskKey) || !(d.parent === null || str(d.parent))) errors.push('task-parent');
  }
  if (event.type === 'review') {
    const a=d.attempt,h=d.hesitation;
    if (!Number.isInteger(d.rawRating) || d.rawRating < 1 || d.rawRating > 4 || !str(d.contentRevision)) errors.push('review-rating-content');
    if (Object.hasOwn(d,'ratingPolicy') && d.ratingPolicy !== 'chosen-v1') errors.push('review-rating-policy');
    if (plain(a) && Object.keys(a).some(key=>!['id','mode','revealed','foregroundValid','thinkMs','helpBeforeAnswer'].includes(key))) errors.push('unknown-attempt-fields');
    if (!plain(a) || !str(a.id) || !['scored','practice'].includes(a.mode) || typeof a.revealed !== 'boolean' || typeof a.foregroundValid !== 'boolean' || typeof a.helpBeforeAnswer !== 'boolean' || !(a.thinkMs === null || int(a.thinkMs))) errors.push('attempt-evidence');
    if (plain(h) && Object.keys(h).some(key=>!['policy','base','thresholdMs','windowHash','sampleCount','signalIds'].includes(key))) errors.push('unknown-threshold-fields');
    if (!plain(h) || h.policy !== 'hesitation-v1' || h.base !== event.base || !int(h.thresholdMs) || !hash(h.windowHash) || !Array.isArray(h.signalIds) || h.signalIds.some(x=>!str(x)) || new Set(h.signalIds).size !== h.signalIds.length) errors.push('hesitation-evidence');
    if (plain(h) && h.sampleCount!==undefined && (!int(h.sampleCount)||h.sampleCount>200)) errors.push('threshold-sample-count');
    if (Object.hasOwn(d,'effectiveRating')) errors.push('client-effective-rating-forbidden');
    if (d.session !== undefined && (!plain(d.session) || Object.keys(d.session).sort().join(',') !== 'aheadDays,mode,policy' || d.session.policy !== 'custom-session-v1' || d.session.mode !== 'review-ahead' || ![1,3,7].includes(d.session.aheadDays))) errors.push('custom-session-evidence');
    if (d.learnAhead !== undefined && typeof d.learnAhead !== 'boolean') errors.push('learn-ahead');
    if (d.permitId !== undefined && !str(d.permitId)) errors.push('permit-reference');
    if (d.boost !== undefined && (!plain(d.boost) || !str(d.boost.observationId))) errors.push('review-boost');
  }
  if (['capture','capture-boost'].includes(event.type)) {
    const c = event.type === 'capture' ? d : d.capture;
    if (!plain(c) || !str(c.surface) || !['lookup','unknown','unsure','known','correction'].includes(c.kind) || !['passage','definition','sheet','typed'].includes(c.location)) errors.push('capture-evidence');
    else if (Object.keys(c).some(key=>!captureFields.includes(key)) || (c.targetTaskKey!==undefined&&c.targetTaskKey!==null&&!isTaskKey(c.targetTaskKey))) errors.push('capture-fields');
    else if (c.contextTaskKey!==undefined&&!isTaskKey(c.contextTaskKey)) errors.push('capture-context-reference');
    else if ((c.attemptId!==undefined&&!str(c.attemptId))||(c.depth!==undefined&&(!int(c.depth)||c.depth<1))||(c.resolution!==undefined&&c.resolution!==null&&!plain(c.resolution))) errors.push('capture-metadata');
    else if (c.location !== 'typed' && (!isTaskKey(c.contextTaskKey) || !str(c.contentRevision) || c.revealed !== true || !plain(c.span) || !['unicode-codepoint','utf16-code-unit'].includes(c.span.unit) || !int(c.span.start) || !int(c.span.end) || c.span.end <= c.span.start)) errors.push('capture-context');
  }
  if (event.type === 'boost' && !str(d.observationId)) errors.push('boost-source');
  if (event.type === 'repair' && ((d.replacementTaskKey!==undefined&&!isTaskKey(d.replacementTaskKey)) ||
    (d.replacementParent!==undefined&&d.replacementParent!==null&&!str(d.replacementParent)))) errors.push('repair-reference');
  if (['undo','hesitation-override'].includes(event.type) && !str(d.target)) errors.push('correction-target');
  if (['suspend','known'].includes(event.type) && typeof d.on !== 'boolean') errors.push('on-boolean');
  if (event.type === 'repair' && !['hint','keep','swap','suspend','restore'].includes(d.action)) errors.push('repair-action');
  if (event.type === 'manual-card' && (d.version!==1 || ['word','reading','meaning','example'].some(key=>!str(d[key])||d[key].trim()!==d[key]) || (d.note!==undefined&&typeof d.note!=='string') || ['word','reading','meaning','example','note'].some(key=>typeof d[key]==='string'&&(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(d[key])||[...d[key]].length>(['word','reading'].includes(key)?128:4000))))) errors.push('manual-card-fields');
  // The immutable wire record must also fit the entry that replay materializes.
  // NFKC can expand one character (e.g. ㍿) into several; raw length alone would
  // let the Worker accept an event that manualCardData then throws on replay.
  if (event.type === 'manual-card' && ['word','reading'].some(key=>{
    if(typeof d[key]!=='string')return false;
    const normalized=d[key].normalize('NFKC').trim();
    return !normalized||[...normalized].length>128;
  })) errors.push('manual-card-fields');
  if (event.type === 'settings' && (!str(d.key) || !Object.hasOwn(d,'value'))) errors.push('setting-fields');
  if (event.type === 'baseline' && (!hash(d.sourceHash) || !hash(d.snapshotHash) || !str(d.contract) || !str(d.missingHistory) || !int(d.cutoff) || !plain(d.card))) errors.push('baseline-manifest');
  if (event.type === 'learner-settings-baseline' && (!hash(d.sourceHash) || !hash(d.snapshotHash) || !plain(d.settings) || Object.keys(d.settings).sort().join(',') !== 'learnerTimezone,newPerDayTotal' || !Number.isInteger(d.settings.newPerDayTotal) || d.settings.newPerDayTotal < 1 || d.settings.newPerDayTotal > 200 || !str(d.settings.learnerTimezone))) errors.push('learner-settings-baseline-fields');
  if (event.type === 'permit-grant' && (!str(d.install) || d.install === '@server' || !Array.isArray(d.permitIds) || !d.permitIds.length || d.permitIds.some(x=>!str(x)) || new Set(d.permitIds).size !== d.permitIds.length || !str(d.timezone) || !str(d.day) || !int(d.startsAt) || !int(d.endsAt) || d.endsAt <= d.startsAt)) errors.push('permit-grant-fields');
  if (event.type === 'content-activate' && (!plain(d.revisions) || Object.keys(d.revisions).some(key=>!isTaskKey(key) || !str(d.revisions[key])))) errors.push('content-activation-fields');
  try { canonicalStringify(event); } catch { errors.push('non-canonical-json'); }
  return { ok: errors.length === 0, unsupported: false, errors };
}
