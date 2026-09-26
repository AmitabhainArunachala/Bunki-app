#!/usr/bin/env python3
"""Create byte-pinned public-size derivatives of locally rendered audio.

The source render and scripts remain unchanged. Encoding never supplies an
editorial approval: reviewers must inspect these final playback bytes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    source_path = args.manifest.resolve(strict=True)
    source_bytes = source_path.read_bytes()
    source = json.loads(source_bytes)
    assert source['schema'] == 'kairo-assessment-audio-render/1'
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    assets, derivatives = [], []
    source_size, total_size = 0, 0
    for original in source['assets']:
        path = (source_path.parent / original['path']).resolve(strict=True)
        assert path.is_relative_to(source_path.parent), 'Source asset escapes its manifest'
        raw = path.read_bytes()
        assert digest(raw) == original['bytesSha256'], 'Source audio changed'
        assert original['mimeType'] == 'audio/wav', 'Expected original PCM render'
        temporary = output / (original['bytesSha256'] + '.encoding.mp3')
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-n', '-i', str(path),
                        '-map', '0:a:0', '-map_metadata', '-1', '-ac', '1', '-ar', '44100',
                        '-c:a', 'libmp3lame', '-b:a', '64k', str(temporary)], check=True)
        probe = json.loads(subprocess.check_output([
            'ffprobe', '-v', 'error', '-show_entries',
            'format=duration:stream=codec_name,codec_type,channels,sample_rate',
            '-of', 'json', str(temporary)], text=True))
        assert len(probe['streams']) == 1
        stream = probe['streams'][0]
        assert stream['codec_name'] == 'mp3' and stream['codec_type'] == 'audio'
        assert stream['channels'] == 1 and stream['sample_rate'] == '44100'
        duration = round(float(probe['format']['duration']) * 1000)
        assert abs(duration - original['durationMs']) <= 100, 'Unexpected duration drift'
        encoded = temporary.read_bytes()
        encoded_sha = digest(encoded)
        filename = encoded_sha + '.mp3'
        final = output / filename
        assert not final.exists(), 'Duplicate playback asset'
        temporary.rename(final)
        asset = {**original, 'id': 'tts-' + encoded_sha[:32], 'path': filename,
                 'bytesSha256': encoded_sha, 'durationMs': duration, 'mimeType': 'audio/mpeg'}
        assets.append(asset)
        derivatives.append({'scriptId': original['scriptId'],
                            'sourceWavSha256': original['bytesSha256'],
                            'playbackSha256': encoded_sha,
                            'sourceBytes': len(raw), 'playbackBytes': len(encoded)})
        source_size += len(raw)
        total_size += len(encoded)
    receipt = {**source, 'assets': assets, 'reviewStatus': 'not-reviewed',
               'encoding': {'codec': 'mp3', 'bitrate': 64000, 'channels': 1,
                            'sampleRate': 44100, 'sourceManifestSha256': digest(source_bytes),
                            'toolSha256': digest(Path(__file__).read_bytes()),
                            'ffmpeg': subprocess.check_output(
                                ['ffmpeg', '-version'], text=True).splitlines()[0],
                            'derivatives': derivatives}}
    assert source_path.read_bytes() == source_bytes, 'Source manifest changed'
    (output / 'manifest.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': 'encoded-not-reviewed', 'manifest': str(output / 'manifest.json'),
                      'units': len(assets), 'sourceBytes': source_size, 'playbackBytes': total_size,
                      'durationMs': sum(asset['durationMs'] for asset in assets)}))


if __name__ == '__main__':
    main()
