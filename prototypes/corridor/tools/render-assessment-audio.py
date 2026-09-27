#!/usr/bin/env python3
"""Render pinned assessment scripts locally; never mark generated audio reviewed.

Inputs are explicit voice/model paths. Output and reusable speech cache belong
outside the checkout. The manifest binds script, model and actual WAV bytes.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--scripts', type=Path, required=True)
    parser.add_argument('--voices', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--threads', type=int, default=4)
    args = parser.parse_args()
    os.environ.setdefault('HF_HUB_OFFLINE', '1')
    os.environ.setdefault('TRANSFORMERS_OFFLINE', '1')
    import numpy as np
    import soundfile as sf
    import torch
    from style_bert_vits2.constants import Languages
    from style_bert_vits2.nlp import bert_models
    from style_bert_vits2.tts_model import TTSModel

    torch.set_num_threads(args.threads)
    script_bytes = args.scripts.read_bytes()
    packet = json.loads(script_bytes)
    assert packet['schema'] == 'kairo-assessment-audio-scripts/1'
    config = json.loads(args.voices.read_text())
    assert config['schema'] == 'kairo-assessment-local-voices/1'
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    cache = output.parent / 'speech-cache'
    cache.mkdir(exist_ok=True)
    voices = {}
    for name, voice in config['voices'].items():
        for key in ['model', 'config', 'styles']:
            path = Path(voice[key]).absolute()
            assert path.is_file(), f'Missing voice asset: {key}'
            voice[key] = str(path)
        voice['fileSha256'] = {key: digest(Path(voice[key]).read_bytes())
                               for key in ['model', 'config', 'styles']}
        assert voice.get('rightsBasisRef') and voice.get('attribution')
        voices[name] = voice
    bert_models.load_model(Languages.JP, config['bertModel'])
    bert_models.load_tokenizer(Languages.JP, config['bertModel'])
    models = {}
    assets = []
    for unit in packet['units']:
        assert digest(unit['transcript'].encode()) == unit['transcriptSha256']
        assert '\n'.join(cue['text'] for cue in unit['cues'] if cue['kind'] == 'speech') == unit['transcript']
        roles = unit['voiceRoles']
        roles_hash = digest(json.dumps(roles, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode())
        chunks, cue_receipts, rate, used = [], [], None, []
        for index, cue in enumerate(unit['cues']):
            start = sum(len(chunk) for chunk in chunks)
            if cue['kind'] == 'planned-silence':
                assert rate is not None and 0 <= cue['milliseconds'] <= 120_000
                wave = np.zeros(round(rate * cue['milliseconds'] / 1000), dtype=np.float32)
                detail = {'kind': cue['kind'], 'milliseconds': cue['milliseconds']}
            else:
                assert cue['kind'] == 'speech' and cue['text'].strip()
                voice = voices[cue['voice']]
                role = roles[cue['voice']]
                if voice.get('role') != role:
                    voice = voices[config['roleVoices'][role]]
                assert voice['role'] == role
                voice_id = voice['id']
                used.append(voice_id)
                identity = {'voiceId': voice_id, 'modelHashes': voice['fileSha256'], 'text': cue['text'],
                            'style': voice.get('style', 'Neutral'), 'length': voice.get('length', 1.0),
                            'renderer': 'style-bert-vits2/2.5.0', 'seed': 0}
                cache_id = digest(json.dumps(identity, sort_keys=True, ensure_ascii=False).encode())
                cached = cache / f'{cache_id}.wav'
                if cached.exists():
                    wave, sample_rate = sf.read(cached, dtype='float32')
                else:
                    if voice_id not in models:
                        models[voice_id] = TTSModel(voice['model'], voice['config'], voice['styles'], 'cpu')
                    torch.manual_seed(0)
                    sample_rate, wave = models[voice_id].infer(text=cue['text'], language=Languages.JP,
                        style=voice.get('style', 'Neutral'), length=voice.get('length', 1.0))
                    if wave.dtype.kind in 'iu':
                        wave = wave.astype(np.float32) / max(abs(np.iinfo(wave.dtype).min), np.iinfo(wave.dtype).max)
                    sf.write(cached, wave, sample_rate, subtype='PCM_16')
                    wave, sample_rate = sf.read(cached, dtype='float32')
                assert wave.ndim == 1 and np.isfinite(wave).all() and len(wave) > 0
                if rate is None:
                    rate = sample_rate
                assert rate == sample_rate, 'Voice sample rates must agree'
                detail = {'kind': 'speech', 'voiceId': voice_id, 'textSha256': digest(cue['text'].encode()),
                          'cacheId': cache_id, 'modelHashes': voice['fileSha256']}
            chunks.append(wave)
            cue_receipts.append({'index': index, 'startMs': round(start * 1000 / rate),
                                 'endMs': round((start + len(wave)) * 1000 / rate), **detail})
            if cue['kind'] == 'speech':
                chunks.append(np.zeros(round(rate * .35), dtype=np.float32))
        wave = np.concatenate(chunks)
        filename = digest((unit['id'] + unit['transcriptSha256']).encode()) + '.wav'
        path = output / filename
        sf.write(path, wave, rate, subtype='PCM_16')
        byte_hash = digest(path.read_bytes())
        asset = {'id': 'tts-' + byte_hash[:32], 'scriptId': unit['id'], 'itemIds': unit['itemIds'],
                 'path': filename, 'bytesSha256': byte_hash, 'durationMs': round(len(wave) * 1000 / rate),
                 'mimeType': 'audio/wav', 'voiceIds': sorted(set(used)),
                 'rightsBasisRef': 'kairo-local-tts-voices-20260923',
                 'sourceTranscriptSha256': unit['transcriptSha256'], 'sourceVoiceRolesSha256': roles_hash}
        assets.append(asset)
        receipt = {'schema': 'kairo-assessment-audio-render/1', 'formId': packet['formId'],
                   'scriptFileSha256': digest(script_bytes), 'assets': assets,
                   'reviewStatus': 'not-reviewed', 'voices': voices}
        (output / 'manifest.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
        (output / (filename + '.cues.json')).write_text(json.dumps(cue_receipts, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'unit': unit['id'], 'durationMs': asset['durationMs'], 'bytesSha256': byte_hash}), flush=True)
    assert args.scripts.read_bytes() == script_bytes, 'Scripts changed during rendering; do not admit manifest'
    print(json.dumps({'status': 'rendered-not-reviewed', 'manifest': str(output / 'manifest.json'), 'units': len(assets)}))


if __name__ == '__main__':
    main()
