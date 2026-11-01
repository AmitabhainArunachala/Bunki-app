/** Host adapters only. The generated canonical distribution owns all scheduling,
 * admission, event construction, history replay, budget and durable store logic. */
import {createStudyEngine,studyDayAllowance} from './vendor/shared-study-engine/client/engine.mjs';
import {isSharedDeck,moduleForSharedDeck} from './shared-study-content.mjs';

export {isSharedStudyMode} from './shared-study-content.mjs';

export async function createBunkiStudyAdapter({content, storage, identity, transport=null, canRequestNewCards=false, isOnline=()=>globalThis.navigator?.onLine!==false, now=Date.now, uuid, initialize=null, readPreviousRegistry=null}) {
  if (!storage || !identity || !['open','fresh'].includes(identity.mode)) throw Error('shared-host-binding-required');
  const {learner,environment,installation,epoch=0,timezone='Asia/Tokyo',mode} = identity;
  if (![learner,environment,installation].every(v=>typeof v==='string'&&v)) throw Error('shared-host-identity-required');
  if (initialize && (!learner.startsWith('test-') || !environment.startsWith('test-'))) throw Error('shared-fixture-scope-required');
  if (readPreviousRegistry !== null && typeof readPreviousRegistry !== 'function') throw Error('shared-content-history-adapter');
  if (!['boolean','function'].includes(typeof canRequestNewCards) || typeof isOnline !== 'function') throw Error('shared-permit-capability-adapter');
  if (transport !== null && typeof transport.reserveNewPermits !== 'function') throw Error('shared-permit-transport-adapter');
  const online=()=>isOnline()===true;
  const canRequest=()=>!!transport&&(typeof canRequestNewCards==='function'?canRequestNewCards()===true:canRequestNewCards===true);
  // One explicit host reserve action serves both the canonical settings path
  // and Today. A backend method's existence never grants authority by itself.
  const reserve=async options=>{
    if(!online())throw Error('shared-permit-offline');
    if(!canRequest())throw Error('shared-permit-authority-unavailable');
    return transport.reserveNewPermits(options);
  };
  const engine = createStudyEngine({content,learner,epoch,timezone});
  const store = mode === 'fresh'
    ? await engine.createFreshStore({adapter:storage,environment,newInstallationId:()=>installation,now})
    : await engine.openStore({adapter:storage,scope:{learner,environment,installation},now});
  // The canonical additive gate requires exact prior source rows; a projection
  // cannot reconstruct them. Without a host snapshot adapter, growth is fenced.
  await engine.refreshCorpus(store,{readPreviousRegistry,allowQAExpansion:false});
  // Only an explicit shell/fixture authority can reconcile grants. No defaults,
  // local permit issuer, legacy-ledger reader, or migration are hidden here.
  if (initialize) await initialize({store,engine});
  const backend = await engine.connect({store,transport:transport?{reserveNewPermits:reserve}:null,now,uuid});
  const platform=Object.freeze({storageKind:'bunki-shared',isOnline:online,canRequestNewCards:canRequest,
    ...(transport?{requestNewCards:()=>reserve({store})}:{})});
  const entries = new Map(content.catalog.map(entry=>[entry.taskKey,entry]));
  const inDeck = (entry,deckId) => deckId === 'shared-grammar' ? entry.module === 'grammar' : entry.player?.deckId === deckId;
  function supported(deckId) { if (!isSharedDeck(deckId) && deckId !== 'shared-grammar') throw Error('unmapped-shared-contract'); }
  return Object.freeze({engine,store,backend,catalog:content.catalog,identity:Object.freeze({...identity}),platform,now,
    entry:key=>entries.get(key),
    entries(deckId) { supported(deckId); return content.catalog.filter(entry=>inDeck(entry,deckId)); },
    sitting(deckId,options={}) { supported(deckId); return backend.sitting({module:moduleForSharedDeck(deckId),...options}); },
    begin(taskKey,options) { if (!entries.has(taskKey)) throw Error('unmapped-shared-task'); return backend.snapshotAttempt(taskKey,options); },
    preview:(attempt,thinkMs)=>backend.preview(attempt,thinkMs),
    submit:intent=>backend.submitCommand(intent),
    async summary(deckId) {
      supported(deckId); await backend.refresh();
      const projection=backend.readProjection(),all=content.catalog.filter(e=>inDeck(e,deckId));
      const queue=backend.queue({module:moduleForSharedDeck(deckId)}).filter(e=>inDeck(e,deckId));
      const unseen=queue.filter(e=>!projection.introductions[e.taskKey]).length,due=queue.length-unseen;
      const at=now(),day=studyDayAllowance(projection,at),permits=Object.values(projection.permits);
      const held=permits.filter(p=>p.install===installation&&!p.usedBy&&p.startsAt<=at&&p.endsAt>at).length;
      const spent=permits.filter(p=>p.usedBy&&p.startsAt<day.endsAt&&p.endsAt>day.startsAt).length;
      const fresh=Math.min(unseen,held,Math.max(0,day.limit-spent));
      return {due,fresh,total:due+fresh,words:new Set(all.map(e=>e.noteGuid)).size,
        begun:new Set(all.filter(e=>projection.introductions[e.taskKey]).map(e=>e.noteGuid)).size,authority:'shared-v4'};
    },
    async missedTerms(deckId,since=0) {
      supported(deckId); await backend.refresh(); const latest=new Map();
      for (const review of backend.readProjection().reviews) {
        const entry=entries.get(review.taskKey);
        if (!entry || !inDeck(entry,deckId) || review.undoneAt || review.effectiveRating!==1 || review.at<since) continue;
        if (!latest.has(entry.term) || latest.get(entry.term).at<review.at) latest.set(entry.term,{term:entry.term,reading:entry.reading||'',at:review.at,deck:deckId});
      }
      return [...latest.values()].sort((a,b)=>b.at-a.at);
    },
  });
}

/** A displayed attempt owns its immutable intents until a durable acknowledgement.
 * Retrying an uncertain write cannot append another review or rebind its parent. */
export function createBunkiAttempt(adapter,taskKey,options) {
  const attempt=adapter.begin(taskKey,options); let preview=null, pending=null, result=null, choice=null;
  return Object.freeze({attempt,
    reveal(thinkMs) { return preview ||= adapter.preview(attempt,thinkMs); },
    grade(rating) {
      if (!preview || !preview.intents[rating]) return Promise.reject(Error('answer-not-revealed'));
      if (choice!==null && choice!==rating) return Promise.reject(Error('retry-original-rating'));
      choice=rating;
      if (result) return Promise.resolve(result);
      if (pending) return pending;
      pending=adapter.submit(preview.intents[rating]).then(value=>{if(value.kind!=='failed')result=value;return value;}).finally(()=>{pending=null;});
      return pending;
    },
  });
}
