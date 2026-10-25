"""Import-only r3 custody around the one native FULL. No gate dispatch or acceptance substitution."""
import hashlib, importlib.util, json, os, signal, subprocess, sys
from pathlib import Path
P=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert len(sys.argv)==3 and sys.argv[1] in ('--validate-only','--launch'), 'explicit mode and frozen plan hash required'
assert sha(P/'FULL-LAUNCH-PLAN.json')==sys.argv[2], 'launch plan pin'
x=json.loads((P/'FULL-LAUNCH-PLAN.json').read_text())
assert sha(__file__)==x['launcherSha256']
for path,want in x['pins'].items():assert sha(path)==want, 'changed pin: '+path
spec=importlib.util.spec_from_file_location('rp',x['supervisor']);rp=importlib.util.module_from_spec(spec);spec.loader.exec_module(rp)
signal.signal(signal.SIGINT,lambda s,f:rp.STOP.update(signal=signal.Signals(s).name))
signal.signal(signal.SIGTERM,lambda s,f:rp.STOP.update(signal=signal.Signals(s).name))
W=Path(x['cwd']);evidence=Path(x['custodyEvidence']);out=Path(x['nativeOut'])
assert str(rp.OWNED)==x['sharedOwned'] and str(rp.latch_path())==x['sharedLatch']
def stopped():
    if rp.STOP['signal']:raise SystemExit('STOP '+rp.STOP['signal'])
def validate():
    stopped()
    for path,want in x['pins'].items():assert sha(path)==want, 'changed pin: '+path
    assert subprocess.check_output(['git','-C',str(W),'rev-parse','HEAD'],text=True).strip()==x['head']
    assert not subprocess.check_output(['git','-C',str(W),'status','--porcelain'],text=True).strip(), 'dirty source'
    c=json.loads(Path(x['contract']).read_text());review=json.loads(Path(x['review']).read_text())
    assert review['status']=='approved' and review['contractSha256']==sha(x['contract'])
    assert review['sourceHead']==x['head'] and review['artifactSha256']==x['artifact']
    assert review['footprint']['status']=='approved'
    for path,want in c['sourcePins'].items():assert sha(W/path)==want,path
    assert not list(evidence.parent.glob(evidence.name+'*')), 'prefix already exists; never retry'
    rows=rp.snapshot();lineage=rp.runner_lineage(rows)
    assert not [r for r in rows if str(evidence) in r['args'] and r['pid'] not in lineage], 'namespace already active'
    assert not rp.owned_from_earlier_proof_alive(), 'shared ownership or latch unresolved'
    admission=rp.admission();assert admission['admitted'], 'fresh load/disk/memory admission refused'
    stopped();return admission
admission=validate()
if sys.argv[1]=='--validate-only':
    print(json.dumps({'status':'static-launch-binding-valid-no-launch','admission':admission,'head':x['head'],'artifact':x['artifact'],'planSha256':sys.argv[2]}));raise SystemExit(0)
pre=json.loads(Path(x['preflightProgress']).read_text())
assert pre['status']=='preflight-passed-no-gates-run' and pre['expectedHead']==x['head'] and pre['expectedArtifact']==x['artifact']
assert pre['pins']['engineContract']['sha256']==sha(x['contract']) and pre['pins']['contractReview']['sha256']==sha(x['review'])
assert not (P/'FULL-START.json').exists(), 'start already recorded; never retry'
env={**os.environ,**x['env']}
start={'at':rp.stamp(),'supervisorPid':os.getpid(),'argv':x['argv'],'cwd':str(W),'admission':admission,'planSha256':sys.argv[2],'launcherSha256':sha(__file__),'head':x['head'],'artifact':x['artifact'],'custodyEvidence':str(evidence),'nativeOut':str(out)}
(P/'FULL-START.json').write_text(json.dumps(start,indent=2)+'\n')
stopped()
status,details=rp.supervise('M1-FULL',x['argv'],W,env,evidence,x['timeoutSeconds'])
result={**start,'finishedAt':rp.stamp(),'status':status,**details,'fullVerdict':'native progress is authoritative; closure is not acceptance'}
if (out/'progress.json').is_file():
    p=json.loads((out/'progress.json').read_text());result['native']={k:p.get(k) for k in ['status','fullAcceptance','allFinalGateOutcomesPassed','completedAt','expectedHead','expectedArtifact']}
(P/'FULL-CLOSURE.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
raise SystemExit(0 if status=='closed' and details.get('exit')==0 else 1)
