/** Resolve selected canonical task IDs to shell-prepared presentation objects.
 * Grammar's renderer authenticates object identity in a WeakMap, so its prepared
 * records must stay in this realm. Selection/admission still belong to backend. */
export function bindStudyPresentation(backend,catalog) {
  const entries=new Map(catalog.map(entry=>[entry.taskKey,entry]));
  if(entries.size!==catalog.length)throw Error('duplicate-presentation-task');
  const resolve=entry=>{
    if(!entry)return entry;
    const presentation=entries.get(entry.taskKey);
    if(!presentation)return structuredClone(entry); // Canonical learner-created cards carry their own content.
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

/** Follow canonical current identity, including a revealed card restored by Undo. */
export function bindSharedStudyViewport({app,root,onCardStart}) {
  // Older/custom same-origin hosts may not expose the optional viewport port.
  if(typeof onCardStart!=='function')return ()=>{};
  const win=root.ownerDocument.defaultView;
  let disposed=false,lastCurrent=null,pendingCurrent=null,frame=null;
  const cancel=()=>{
    if(frame!==null)win.cancelAnimationFrame(frame);
    frame=null;pendingCurrent=null;
  };
  const schedule=()=>{
    if(disposed)return;
    const {screen,busy,current}=app.read();
    if(!root.isConnected||screen!=='study'||busy||!current||current===lastCurrent){cancel();return;}
    if(current===pendingCurrent)return;
    cancel();pendingCurrent=current;
    frame=win.requestAnimationFrame(()=>{
      frame=win.requestAnimationFrame(()=>{
        frame=null;pendingCurrent=null;
        if(disposed||!root.isConnected)return;
        const state=app.read();
        if(state.screen!=='study'||state.busy||state.current!==current||current===lastCurrent)return;
        onCardStart();lastCurrent=current;
      });
    });
  };
  const observer=new win.MutationObserver(schedule);
  observer.observe(root,{childList:true,subtree:true,attributes:true,characterData:true});
  schedule();
  return ()=>{
    if(disposed)return;
    disposed=true;observer.disconnect();cancel();
  };
}
