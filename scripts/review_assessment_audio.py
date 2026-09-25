#!/usr/bin/env python3
"""Task-local exact-$0 native-audio guard around the existing Dharma provider.

No independent inference client, global registry/config edits, retries or fallbacks.
The CLI sends a key/transcript-blind capability probe, never a release approval.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import fcntl
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
from uuid import uuid4

ROUTES = {
    "thinkingmachines/inkling:free": {
        "tag": "thinkingmachines/nvfp4", "provider": "Thinking Machines", "family": "thinkingmachines",
    },
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": {
        "tag": "nvidia", "provider": "Nvidia", "family": "nemotron",
    },
}


class AudioGuardError(ValueError):
    """Safe typed diagnostics: never expose SDK exception text or credentials."""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def external(path: Path) -> Path:
    result = path.expanduser().resolve()
    if not result.is_relative_to((Path.home() / ".dharma").resolve()):
        raise AudioGuardError("evidence-outside-dharma")
    result.mkdir(parents=True, exist_ok=True)
    return result


def save(path: Path, value: object) -> dict:
    data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    with path.open("xb") as stream:
        stream.write(data)
    return {"path": str(path), "sha256": sha(data)}


def zero(value: object) -> bool:
    try:
        return not isinstance(value, bool) and Decimal(str(value)).is_finite() and Decimal(str(value)) == 0
    except (InvalidOperation, ValueError):
        return False


def failure_observation(error: Exception) -> dict:
    status = getattr(error, 'status_code', None)
    # Classify in memory. SDK error strings/bodies may contain transport secrets.
    body = str(getattr(error, 'body', '')).lower()
    category = ('quota' if any(word in body for word in ('quota', 'rate limit', 'credits exhausted', 'limit exceeded'))
                else 'data-policy' if any(word in body for word in ('privacy', 'data policy', 'data collection'))
                else 'authentication' if status == 401 else 'permission-denied' if status == 403
                else 'guard-refusal' if isinstance(error, AudioGuardError) else 'transport-error')
    return {'errorType': type(error).__name__, 'httpStatus': status, 'category': category,
            **({'reason': str(error)} if isinstance(error, AudioGuardError) else {})}


def validate_metadata(model: str, models: dict, endpoints: dict) -> dict:
    spec = ROUTES.get(model)
    if not spec:
        raise AudioGuardError("model-not-in-exact-free-allowlist")
    row = next((row for row in models.get("data", []) if row.get("id") == model), None)
    data = endpoints.get("data", {})
    matches = [entry for entry in data.get("endpoints", []) if entry.get("tag") == spec["tag"]]
    if not row or data.get("id") != model or len(matches) != 1:
        raise AudioGuardError("free-model-or-endpoint-not-declared")
    endpoint = matches[0]
    for source in (row, data):
        if "audio" not in source.get("architecture", {}).get("input_modalities", []):
            raise AudioGuardError("native-audio-not-declared")
    for pricing in (row.get("pricing"), endpoint.get("pricing")):
        if not pricing or not {"prompt", "completion"}.issubset(pricing) or not all(zero(value) for value in pricing.values()):
            raise AudioGuardError("nonzero-or-unknown-public-pricing")
    if endpoint.get("model_id") != model or endpoint.get("provider_name") != spec["provider"]:
        raise AudioGuardError("endpoint-identity-changed")
    canonical = row.get("canonical_slug")
    named = endpoint.get("name", "").split(" | ")
    if not isinstance(canonical, str) or not canonical.startswith(model.split("/", 1)[0] + "/") or len(named) != 2 or named[0] != spec["provider"]:
        raise AudioGuardError("canonical-model-mapping-missing")
    # Only these explicitly published exact mappings, never suffix stripping.
    return {"model": model, **spec, "returnedModels": sorted({model, canonical, named[1]}), "catalogPricing": row["pricing"], "endpointPricing": endpoint["pricing"]}


def metadata(model: str, out: Path, stem: str) -> dict:
    if model not in ROUTES:
        raise AudioGuardError("model-not-in-exact-free-allowlist")
    documents, refs = [], []
    for label, url in (("models", "https://openrouter.ai/api/v1/models"), ("endpoints", "https://openrouter.ai/api/v1/models/" + model + "/endpoints")):
        request = urllib.request.Request(url, headers={"User-Agent": "Bunki-assessment-audio/1"})
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read(5_000_001)
        if len(data) > 5_000_000:
            raise AudioGuardError("metadata-budget-exceeded")
        path = out / f"{stem}.{label}.json"
        with path.open("xb") as stream:
            stream.write(data)
        documents.append(json.loads(data)); refs.append({"url": url, "path": str(path), "sha256": sha(data), "retrievedAt": stamp()})
    return {**validate_metadata(model, *documents), "evidence": refs}


def pinned_json(reference: dict) -> dict:
    path = Path(reference['path']).expanduser().resolve()
    if not path.is_relative_to((Path.home() / '.dharma').resolve()):
        raise AudioGuardError('capability-evidence-outside-dharma')
    data = path.read_bytes()
    if sha(data) != reference['sha256']:
        raise AudioGuardError('capability-evidence-changed')
    return json.loads(data)


def require_native_capability(reference: dict, model: str) -> dict:
    """Metadata/transport success and ASR never substitute for actual hearing."""
    receipt = pinned_json(reference)
    guard = receipt.get('guard') or {}
    if receipt.get('format') != 'kairo-native-audio-capability-probe' or receipt.get('status') != 'completed' or \
       receipt.get('requestedModel') != model or receipt.get('keyProvided') is not False or receipt.get('transcriptProvided') is not False or \
       guard.get('rawIdentityAndZeroCostVerified') is not True or guard.get('metadata', {}).get('model') != model or \
       guard.get('baseUrl') != 'https://openrouter.ai/api/v1' or guard.get('followRedirects') is not False:
        raise AudioGuardError('actual-native-audio-capability-not-established')
    raw = pinned_json(guard['rawResponse'])
    response = pinned_json(receipt['response'])
    if raw.get('model') != response.get('model') or raw.get('model') not in guard['metadata']['returnedModels'] or \
       raw.get('provider') != ROUTES[model]['provider'] or not zero((raw.get('usage') or {}).get('cost')):
        raise AudioGuardError('capability-raw-identity-or-cost-mismatch')
    content = response.get('content', '').strip()
    if content.startswith('```'):
        content = content.split('\n', 1)[1].rsplit('```', 1)[0].strip()
    finding = json.loads(content)
    if finding.get('directlyHeardAudio') is not True or len(finding.get('heardFacts', [])) < 3 or not finding.get('spokenQuestion'):
        raise AudioGuardError('probe-did-not-establish-direct-hearing')
    representation = receipt.get('representation', 'input_audio')
    if representation not in {'input_audio', 'audio_url'} or (representation == 'audio_url' and not receipt.get('transportDerivation')):
        raise AudioGuardError('capability-audio-representation-not-established')
    return {'reference': reference, 'audio': receipt['audio'], 'model': response['model'], 'declaredDirectHearing': True,
            'representation': representation, 'decodeWav': bool(receipt.get('transportDerivation')),
            'sourceFactVerificationStillRequired': True}


def decoded_wav(source: Path, out: Path, stem: str) -> tuple[bytes, dict]:
    decoder = Path(shutil.which('ffmpeg') or '').resolve()
    if not decoder.is_file():
        raise AudioGuardError('ffmpeg-decoder-unavailable')
    target = out / f'{stem}.decoded-16khz.wav'
    argv = [str(decoder), '-nostdin', '-v', 'error', '-i', str(source), '-map_metadata', '-1',
            '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', str(target)]
    subprocess.run(argv, check=True, capture_output=True, timeout=60)
    data = target.read_bytes()
    return data, {'format': 'decoded-native-audio-transport/1', 'source': {'path': str(source), 'sha256': sha(source.read_bytes())},
                  'decoded': {'path': str(target), 'sha256': sha(data)}, 'argv': argv,
                  'decoderSha256': sha(decoder.read_bytes()),
                  'decoderVersion': subprocess.run([str(decoder), '-version'], check=True, capture_output=True, text=True).stdout.splitlines()[0],
                  'transcriptOrASRUsed': False, 'trimmed': False, 'resampledHz': 16000, 'channels': 1}


class CallBudget:
    """One serial task ledger; reservations count even when a request fails."""
    def __init__(self, directory: Path):
        self.directory = external(directory)
        self.path = self.directory / "audio-call-budget.json"

    def update(self, entry: dict | None = None, stop: str | None = None, finished: str | None = None) -> int:
        with self.path.open("a+") as stream:
            fcntl.flock(stream, fcntl.LOCK_EX)
            stream.seek(0); source = stream.read()
            state = json.loads(source) if source else {"limit": 20, "calls": [], "stopped": None}
            if entry is not None:
                if state["stopped"] or state.get("active") or len(state["calls"]) >= 20:
                    raise AudioGuardError("audio-run-stopped-or-budget-exhausted")
                state["calls"].append({"at": stamp(), **entry})
                state['active'] = entry['requestStem']
            if finished is not None:
                if state.get('active') != finished:
                    raise AudioGuardError('active-audio-request-mismatch')
                state['active'] = None
            if stop:
                state["stopped"] = {"at": stamp(), "reason": stop}
            stream.seek(0); stream.truncate(); json.dump(state, stream, indent=2); stream.write("\n"); stream.flush()
            return len(state["calls"])


class NativeAudioGuard:
    def __init__(self, provider, pin: dict, attachments: list[dict], out: Path, stem: str, budget: CallBudget):
        self.pin, self.attachments, self.out, self.stem, self.budget = pin, attachments, out, stem, budget
        self.raw_evidence = None
        self.request_evidence = None
        self.failure = None
        self.identity_verified = False
        self.client = provider._client_or_raise()
        if str(self.client.base_url).rstrip('/') != 'https://openrouter.ai/api/v1':
            raise AudioGuardError('canonical-client-base-url-mismatch')
        self.client._client.follow_redirects = False
        self.client.max_retries = 0
        self.original = self.client.chat.completions.create
        self.calls = 0
        self.client.chat.completions.create = self.create

    async def create(self, **kwargs):
        if self.calls or kwargs.get("model") != self.pin["model"] or kwargs.get("stream") or kwargs.get("extra_body") or kwargs.get("tools"):
            raise AudioGuardError("unexpected-call-or-routing-override")
        audio = [part for message in kwargs.get("messages", []) if isinstance(message.get("content"), list)
                 for part in message["content"] if part.get("type") in {'input_audio', 'audio_url'}]
        observed = []
        for part in audio:
            if part['type'] == 'input_audio':
                value = part.get("input_audio", {})
                if value.get("format") not in {"mp3", "wav"}:
                    raise AudioGuardError("unexpected-audio-format")
                encoded = value.get('data', '')
            else:
                url = part.get('audio_url', {}).get('url', '')
                prefix = 'data:audio/wav;base64,'
                if not url.startswith(prefix):
                    raise AudioGuardError('audio-url-must-be-exact-inline-wav-bytes')
                encoded = url[len(prefix):]
            data = base64.b64decode(encoded, validate=True)
            if not data or len(data) > 20_000_000:
                raise AudioGuardError("audio-byte-budget")
            observed.append(sha(data))
        if not audio or Counter(observed) != Counter(row.get('transportSha256', row["sha256"]) for row in self.attachments):
            raise AudioGuardError("actual-attachment-hash-mismatch")
        kwargs["extra_body"] = {"provider": {"only": [self.pin["tag"]], "allow_fallbacks": False,
                                             "max_price": {"prompt": 0, "completion": 0, "request": 0, "image": 0}},
                                "usage": {"include": True}}
        self.budget.update({"model": self.pin["model"], "providerTag": self.pin["tag"], "attachments": self.attachments, "requestStem": self.stem})
        self.calls += 1
        self.request_evidence = save(self.out / f"{self.stem}.guard-request.json", kwargs)
        try:
            response = await self.original(**kwargs)
            raw = response.model_dump(mode="json")
            self.raw_evidence = save(self.out / f"{self.stem}.raw-response.json", raw)
            if raw.get("model") not in self.pin["returnedModels"] or raw.get("provider") != self.pin["provider"]:
                raise AudioGuardError("raw-model-or-provider-mismatch")
            usage = raw.get("usage") or {}
            if not zero(usage.get("cost")):
                raise AudioGuardError("raw-cost-nonzero-or-missing")
            for key, value in (usage.get("cost_details") or {}).items():
                if value is not None and not zero(value):
                    raise AudioGuardError("raw-cost-detail-nonzero")
            self.identity_verified = True
            return response
        except Exception as error:
            self.failure = failure_observation(error)
            status = self.failure['httpStatus']
            if isinstance(error, AudioGuardError) or status in {402, 429} or self.failure['category'] == 'quota':
                self.budget.update(stop=str(error) if isinstance(error, AudioGuardError) else f"http-{status}:{self.failure['category']}")
            raise
        finally:
            self.budget.update(finished=self.stem)

    async def close(self):
        self.client.chat.completions.create = self.original
        await self.client.close()

    def observation(self) -> dict:
        return {"format": "kairo-exact-free-native-audio-guard", "v": 1, "metadata": self.pin,
                "sdkRetries": 0, "allowFallbacks": False, "maxPrice": 0,
                "baseUrl": 'https://openrouter.ai/api/v1', "followRedirects": False,
                "calls": self.calls, "rawResponse": self.raw_evidence,
                "guardRequest": self.request_evidence,
                "failure": self.failure,
                "rawIdentityAndZeroCostVerified": self.identity_verified}


async def probe(args) -> int:
    sys.path.insert(0, str(Path(args.dharma_root).expanduser().resolve()))
    from dharma_swarm.api_keys import bootstrap_runtime_env
    from dharma_swarm.models import LLMRequest, ProviderType
    from dharma_swarm.runtime_provider import resolve_runtime_provider_config, create_runtime_provider
    out = external(Path(args.out)); stem = "audio-probe-" + uuid4().hex
    record = {"format": "kairo-native-audio-capability-probe", "v": 1, "startedAt": stamp(), "status": "blocked",
              "requestedModel": args.model, "keyProvided": False, "transcriptProvided": False,
              "nativeAudioInspected": False, "releaseAuthority": False}
    guard = None
    try:
        pin = metadata(args.model, out, stem)
        data = Path(args.audio).expanduser().read_bytes()
        record["audio"] = {"path": args.audio, "sha256": sha(data)}
        source_sha = sha(data)
        audio_format = 'mp3'
        if args.decode_wav:
            data, derivation = decoded_wav(Path(args.audio).expanduser().resolve(), out, stem)
            record['transportDerivation'] = derivation
            audio_format = 'wav'
        record['representation'] = args.representation
        env = {}; bootstrap_runtime_env(env=env, env_paths=[Path.home() / ".dharma/agent_keys.env"])
        record['credentialSourceFile'] = str(Path.home() / '.dharma/agent_keys.env')
        runtime = resolve_runtime_provider_config(ProviderType.OPENROUTER, model=args.model, env=env, timeout_seconds=args.timeout)
        if not runtime.available:
            raise AudioGuardError("existing-free-route-not-configured")
        provider = create_runtime_provider(runtime)
        guard = NativeAudioGuard(provider, pin, [{"sha256": source_sha, 'transportSha256': sha(data), "mediaId": "blind-capability-clip"}], out, stem, CallBudget(Path(args.budget)))
        prompt = ('Listen directly to the attached Japanese audio. No transcript, answer key, or question text is supplied. '
                  'Return JSON only: {"directlyHeardAudio": boolean, "language": string, "speakerCount": integer, '
                  '"spokenQuestion": string, "heardFacts": [string], "answerInJapanese": string, "qualityIssues": [string]}. '
                  'Include at least three concrete details actually heard and the spoken question. If the attachment is inaccessible, '
                  'say directlyHeardAudio=false and do not infer its contents. This is a capability probe, not exam approval.')
        audio_part = ({'type': 'audio_url', 'audio_url': {'url': 'data:audio/wav;base64,' + base64.b64encode(data).decode()}}
                      if args.representation == 'audio_url' and audio_format == 'wav' else
                      {'type': 'input_audio', 'input_audio': {'format': audio_format, 'data': base64.b64encode(data).decode()}})
        if args.representation == 'audio_url' and audio_format != 'wav':
            raise AudioGuardError('audio-url-probe-requires-decoded-wav')
        request = LLMRequest(model=args.model, messages=[{"role": "user", "content": [
            {"type": "text", "text": prompt}, audio_part]}],
            max_tokens=2500, temperature=0)
        save(out / f"{stem}.probe-request.json", {"prompt": prompt, "originalAudioSha256": source_sha, 'transportAudioSha256': sha(data), "model": args.model})
        response = await asyncio.wait_for(provider.complete(request), timeout=args.timeout)
        record["response"] = save(out / f"{stem}.response.json", {"model": response.model, "content": response.content, "stopReason": response.stop_reason})
        record["status"] = "completed"
        # Direct inspection is established only after the operator checks the actual response against the withheld source.
    except Exception as error:
        record.update(failure_observation(error))
    finally:
        if guard:
            record["guard"] = guard.observation(); await guard.close()
        record["finishedAt"] = stamp()
        result = save(out / f"{stem}.receipt.json", record)
        print(json.dumps({"status": record["status"], "receipt": result, "errorType": record.get("errorType"), "httpStatus": record.get("httpStatus"), "reason": record.get("reason")}))
    return 0 if record["status"] == "completed" else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=list(ROUTES), required=True)
    for name in ("audio", "out", "budget"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--dharma-root", default=str(Path.home() / "dharma_swarm"))
    parser.add_argument("--timeout", type=int, default=150)
    parser.add_argument('--decode-wav', action='store_true', help='Decode exact original MP3 to 16kHz mono PCM with source/decoder/output provenance')
    parser.add_argument('--representation', choices=['input_audio', 'audio_url'], default='input_audio')
    raise SystemExit(asyncio.run(probe(parser.parse_args())))
