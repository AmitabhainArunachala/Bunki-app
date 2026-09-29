"""Render bundled readings in the explicitly selectable F1 neural voice.

Use the existing Style-Bert-VITS2 environment, cached Japanese BERT/model,
and ffmpeg. No model download or provider call occurs. Output belongs under
~/.dharma; copy a completed, verified manifest and its clips into corridor/audio.
Example: python render-article-narration.py --source prototypes/corridor
  --out ~/.dharma/bunki_voice/reading-render --voice-config /path/to/voices.json --device mps
The config uses the same bertModel and voices.speaker-a schema as JLPT audio.
Existing clips are retained byte-for-byte on either device. Separate runtime
receipts distinguish newly generated clips from caches whose device is unknown.
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile, time
from pathlib import Path
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
import numpy as np
import soundfile as sf
import torch
from loguru import logger
logger.remove(); logger.add(sys.stderr, level='WARNING')
from style_bert_vits2.constants import Languages
from style_bert_vits2.nlp import bert_models
from style_bert_vits2.tts_model import TTSModel
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--out',type=Path,required=True)
parser.add_argument('--voice-config',type=Path,required=True)
parser.add_argument('--device',choices=['cpu','mps'],default='cpu')
args=parser.parse_args()
if args.device == 'mps' and not torch.backends.mps.is_available():
    parser.error('MPS was requested but is unavailable in this Python/Torch environment')
torch.set_num_threads(2)
torch.set_num_interop_threads(1)
source=args.source; output=args.out; output.mkdir(parents=True,exist_ok=True)
config=json.loads(args.voice_config.read_text())
voice=config['voices']['speaker-a']
bert_models.load_model(Languages.JP,config['bertModel']).float().to(args.device)
bert_models.load_tokenizer(Languages.JP,config['bertModel'])
model=TTSModel(voice['model'],voice['config'],voice['styles'],args.device)
index=json.loads((source/'data/articles/index.json').read_text())['articles']
manifest={'v':1,'voice':'f1','voiceLabel':'F1 · neural Japanese','reviewStatus':'audition-pending','attribution':voice['attribution'],'licence':'CC BY-SA 4.0','articles':{}}
started=time.time()
receipt={'format':'bunki-article-narration-render/1','device':args.device,'torch':torch.__version__,
    'threads':torch.get_num_threads(),'pid':os.getpid(),'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
    'rendererSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'voiceConfigSha256':hashlib.sha256(args.voice_config.read_bytes()).hexdigest(),
    'voiceId':voice['id'],'cachePolicy':'preserve-existing-bytes; unknown prior device is not inferred',
    'status':'running','clips':{}}
receipt_dir=output/'render-receipts';receipt_dir.mkdir(parents=True,exist_ok=True)
receipt_path=receipt_dir/(time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+str(os.getpid())+'.json')
def save_receipt():
    temporary=receipt_path.with_suffix('.pending.json')
    temporary.write_text(json.dumps(receipt,ensure_ascii=False));temporary.replace(receipt_path)
save_receipt()
print(json.dumps({'status':'started','device':args.device,'receipt':str(receipt_path)},ensure_ascii=False),flush=True)
for n,row in enumerate(sorted(index,key=lambda x:str(x.get('date') or ''),reverse=True)):
    article=json.loads((source/'data/articles'/row['file']).read_text())
    text=article.get('text','').strip()
    if not text: continue
    segments=[]
    for sentence in re.findall(r'[^。！？\n]+[。！？]?',text):
        sentence=sentence.strip()
        if not sentence: continue
        # Bound the synthesizer's input without dropping any source characters.
        while len(sentence)>220:
            at=max(sentence.rfind('、',70,220),sentence.rfind('，',70,220))
            at=at+1 if at>=70 else 200
            segments.append(sentence[:at]);sentence=sentence[at:]
        if sentence:segments.append(sentence)
    clips=[]
    for ix,segment in enumerate(segments):
        identity=hashlib.sha256(('f1-neutral-v1\0'+segment).encode()).hexdigest()[:24]
        name=identity+'.m4a';path=output/'narration/f1'/name;path.parent.mkdir(parents=True,exist_ok=True)
        generated=False;clip_started=time.time()
        if not path.exists():
            torch.manual_seed(0)
            rate,wave=model.infer(text=segment,language=Languages.JP,style='Neutral',length=1.0)
            with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
                sf.write(tmp.name,np.asarray(wave),rate)
                tmpout=path.with_suffix('.pending.m4a')
                subprocess.run(['ffmpeg','-y','-loglevel','error','-i',tmp.name,'-ac','1','-ar','24000','-c:a','aac','-b:a','48k',str(tmpout)],check=True)
                tmpout.replace(path)
            generated=True
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        clips.append({'text':segment,'src':'audio/narration/f1/'+name,'sha256':digest})
        if name not in receipt['clips']:
            receipt['clips'][name]={'sha256':digest,'disposition':'generated' if generated else 'preserved',
                'device':args.device if generated else None,'seconds':round(time.time()-clip_started,4)}
    manifest['articles'][row['id']]={'textSha256':hashlib.sha256(text.encode()).hexdigest(),'clips':clips}
    target=output/'article-narration.json';temp=target.with_suffix('.pending.json');temp.write_text(json.dumps(manifest,ensure_ascii=False));temp.replace(target)
    receipt['articles']=len(manifest['articles']);receipt['manifestSha256']=hashlib.sha256(target.read_bytes()).hexdigest();save_receipt()
    print(json.dumps({'article':n+1,'of':len(index),'id':row['id'],'clips':len(clips),'seconds':round(time.time()-started)},ensure_ascii=False),flush=True)
receipt['status']='complete';receipt['seconds']=round(time.time()-started)
receipt['generatedClips']=sum(row['disposition']=='generated' for row in receipt['clips'].values())
receipt['preservedClips']=sum(row['disposition']=='preserved' for row in receipt['clips'].values());save_receipt()
print(json.dumps({'status':'complete','articles':len(manifest['articles']),'seconds':round(time.time()-started),
    'device':args.device,'generatedClips':receipt['generatedClips'],'preservedClips':receipt['preservedClips'],'receipt':str(receipt_path)}),flush=True)
