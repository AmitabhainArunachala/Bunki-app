/** Synthetic baseline fixture derived from canonical backlog-integration-fixture.
 * Dependencies are explicit so the same initializer runs in Node and the real
 * bound browser host. It grants no permits and never reads a live profile. */
export async function seedBunkiBacklog({store,engine,api,schedulerApi,fsrs,pin,at,count=60}) {
  if(store.scope.learner!=='test-bunki-backlog'||store.scope.environment!=='test-bunki-backlog'||
      store.scope.installation!=='test-bunki-backlog-local')throw Error('backlog-fixture-scope');
  if(!Number.isSafeInteger(count)||count<3||!Number.isFinite(at))throw Error('backlog-fixture-input');
  const day=86400000,initial=engine.replay([]),seen=new Set();
  const tasks=Object.values(initial.tasks).filter(task=>{
    if(task.module!=='n2'||task.contract!=='vocabulary.read.v1'||seen.has(task.lexicalKey))return false;
    seen.add(task.lexicalKey);return true;
  }).slice(0,count);
  if(tasks.length!==count)throw Error('backlog-fixture-catalog');
  const scheduler=schedulerApi.createScheduler(fsrs,pin);
  const sample=schedulerApi.grade(fsrs,scheduler,schedulerApi.emptyState('baseline-fixture'),
    tasks[0].taskKey,4,new Date(at-30*day)).cards[tasks[0].taskKey];
  const events=tasks.map((task,index)=>{
    const data={taskKey:task.taskKey,parent:null,contract:task.contract,
      card:{...sample,state:2,stability:index===count-1?.2:index===count-2?1:100,
        last_review:new Date(at-30*day).toISOString(),due:new Date(at-(count-index)*day).toISOString(),scheduled_days:20},
      repair:null,suspended:false,known:false,sourceHash:'1'.repeat(64),cutoff:0,
      missingHistory:'snapshot-with-capped-legacy-history'};
    data.snapshotHash=api.baselineHash(data);
    const event={v:4,id:`test-bunki-backlog-history:${index+1}`,learner:store.scope.learner,
      install:'test-bunki-backlog-history',dseq:index+1,base:index,ts:at,epoch:0,
      policy:'nsrs-policy-v1',type:'baseline',data};
    return {event,seq:index+1,rt:at,authority:'device',bodyHash:api.payloadHash(event)};
  });
  await store.reconcile({events,head:events.length});
  const projection=(await store.readState()).projection;
  if(projection.appliedSeq!==count||Object.values(projection.outcomes).some(row=>row.status!=='applied'))
    throw Error('backlog-fixture-baseline-refused');
  const keys=tasks.map(task=>task.taskKey);
  const expected=keys.map((key,index)=>({key,index,
    r:scheduler.get_retrievability(projection.tasks[key].card,new Date(at),false)}))
    .sort((a,b)=>a.r-b.r||a.index-b.index).map(row=>row.key);
  if(expected[0]!==keys.at(-1)||expected[1]!==keys.at(-2))throw Error('backlog-fixture-not-discriminating');
  return {keys,expected,at,count};
}
