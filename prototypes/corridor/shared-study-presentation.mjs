/** Resolve selected canonical task IDs to shell-prepared presentation objects.
 * Grammar's renderer authenticates object identity in a WeakMap, so its prepared
 * records must stay in this realm. Selection/admission still belong to backend. */
export function bindStudyPresentation(backend,catalog) {
  const entries=new Map(catalog.map(entry=>[entry.taskKey,entry]));
  if(entries.size!==catalog.length)throw Error('duplicate-presentation-task');
  const resolve=entry=>{
    if(!entry)return entry;
    const presentation=entries.get(entry.taskKey);
    if(!presentation)return entry; // Canonical learner-created cards carry their own content.
    for(const field of['noteGuid','contractId','passageId','contentRevision'])if(presentation[field]!==entry[field])throw Error('presentation-identity-mismatch');
    return presentation;
  };
  return Object.freeze({...backend,
    catalogEntries:()=>backend.catalogEntries().map(resolve),
    queue:options=>backend.queue(options).map(resolve),
    sitting:options=>{const step=backend.sitting(options);return {...step,...(step.entry?{entry:resolve(step.entry)}:{})};},
    customSession:options=>{const session=backend.customSession(options);return {...session,entries:session.entries.map(resolve)};},
  });
}
