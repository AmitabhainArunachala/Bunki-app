#!/usr/bin/env python3
"""Generate original, unreleased task batches through the existing Dharma registry.

Model output is data only. It cannot approve itself, choose its own model identity,
change an answer after review, write application files, or make a form available.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import sys
import shutil
from datetime import datetime, timezone
from pathlib import Path


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def write(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def provider_limit(error: Exception) -> bool:
    status = getattr(error, "status_code", getattr(getattr(error, "response", None), "status_code", None))
    if status in [402, 429] or "ratelimit" in type(error).__name__.lower():
        return True
    # The existing Ollama adapter wraps HTTP failures in RuntimeError, dropping status_code.
    # Classify that message in memory; never persist its potentially sensitive body.
    return bool(re.search(r"(?:\berror\s+|:\s*)(?:402|429)\s*:|\brate[ _-]?limit|\bquota\b", str(error), re.IGNORECASE))


def validate_batch(data: dict, job: dict) -> None:
    if job.get("kind") == "listening-revision":
        if set(data) != {"dialogue", "rationale"} or not isinstance(data["rationale"], str):
            raise ValueError("listening-revision-fields")
        if not isinstance(data["dialogue"], list) or not data["dialogue"]:
            raise ValueError("empty-listening-revision")
        for turn in data["dialogue"]:
            if set(turn) != {"voice", "text"} or turn["voice"] not in job["allowedVoices"] or not isinstance(turn["text"], str) or not turn["text"].strip():
                raise ValueError("invalid-revision-turn")
        characters = sum(len(turn["text"]) for turn in data["dialogue"])
        if not job["minCharacters"] <= characters <= job["maxCharacters"]:
            raise ValueError(f"revision-character-budget:{characters}")
        return
    if set(data) not in [{"passages", "stimuli", "items"}, {"passages", "stimuli", "items", "illustrations"}]:
        raise ValueError("batch-root-fields")
    if len(data["items"]) != job["count"]:
        raise ValueError("item-count")
    if not isinstance(data["passages"], list) or not isinstance(data["stimuli"], list):
        raise ValueError("asset-lists")
    passage_ids = [p["id"] for p in data["passages"]]
    stimulus_ids = [s["id"] for s in data["stimuli"]]
    illustrations = data.get("illustrations", [])
    illustration_ids = [illustration["id"] for illustration in illustrations]
    if len(set(illustration_ids)) != len(illustration_ids):
        raise ValueError("duplicate-illustrations")
    for illustration in illustrations:
        if not isinstance(illustration.get("description"), str) or not illustration["description"].strip():
            raise ValueError("missing-illustration-description")
    if len(set(passage_ids)) != len(passage_ids) or len(set(stimulus_ids)) != len(stimulus_ids):
        raise ValueError("duplicate-assets")
    local_ids = set()
    for item in data["items"]:
        if item["localId"] in local_ids:
            raise ValueError("duplicate-local-id")
        local_ids.add(item["localId"])
        if not isinstance(item["prompt"], str) or not item["prompt"].strip():
            raise ValueError("empty-prompt")
        options = item["options"]
        if not isinstance(options, list) or len(options) not in [3, 4] or len(set(options)) != len(options):
            raise ValueError("invalid-options")
        if not isinstance(item["answerIndex"], int) or not 0 <= item["answerIndex"] < len(options):
            raise ValueError("invalid-answer")
        if not isinstance(item["rationale"], str) or len(item["rationale"]) < 10:
            raise ValueError("missing-rationale")
        if any(key not in passage_ids for key in item["passageIds"]):
            raise ValueError("unknown-passage")
        if job["skill"] == "listening":
            if item["passageIds"]:
                raise ValueError("listening-script-must-not-be-a-printed-passage")
            if item["stimulusId"] not in stimulus_ids or (job["task"] != "listening-response" and not item["spokenQuestion"]) or not isinstance(item["printedOptions"], bool):
                raise ValueError("missing-listening-stimulus")
            if job["task"] == "listening-verbal" and (len(item.get("illustrationIds", [])) != 1 or item["illustrationIds"][0] not in illustration_ids):
                raise ValueError("verbal-expression-requires-illustration")
        elif item["stimulusId"] is not None:
            raise ValueError("unexpected-stimulus")
    for passage in data["passages"]:
        if not passage["text"].strip() or not any(passage["id"] in item["passageIds"] for item in data["items"]):
            raise ValueError("unused-or-empty-passage")
    for stimulus in data["stimuli"]:
        if not stimulus["dialogue"] or not any(item["stimulusId"] == stimulus["id"] for item in data["items"]):
            raise ValueError("unused-or-empty-stimulus")
        for turn in stimulus["dialogue"]:
            if turn["voice"] not in ["narrator", "announcer", "speaker-a", "speaker-b", "speaker-c"] or not turn["text"].strip():
                raise ValueError("invalid-dialogue-turn")


async def main(args: argparse.Namespace) -> int:
    sys.path.insert(0, str(Path(args.dharma_root).expanduser().resolve()))
    from dharma_swarm.api_keys import bootstrap_runtime_env
    from dharma_swarm.model_pool import get_entry, entry_for_model_id
    from dharma_swarm.models import LLMRequest, ProviderType
    from dharma_swarm.runtime_provider import resolve_runtime_provider_config, create_runtime_provider

    bootstrap_runtime_env()
    out = Path(args.out).expanduser().resolve()
    if not out.is_relative_to((Path.home() / ".dharma").resolve()):
        raise ValueError("authoring-output-must-stay-under-dharma")
    out.mkdir(parents=True, exist_ok=True)
    manifest_bytes = Path(args.jobs).expanduser().read_bytes()
    manifest = json.loads(manifest_bytes)
    entry = get_entry(args.registry_model)
    if entry is None or entry.below_floor:
        raise ValueError("unregistered-or-below-floor-model")
    if args.provider not in ["ollama", "kimi_code", "openrouter_free"]:
        raise ValueError("not-an-existing-authorized-no-new-charge-route")
    route = next((route for route in entry.routes if route.provider.value == args.provider), None)
    if route is None and not args.route_model:
        raise ValueError("provider-route-not-registered")
    provider_type = ProviderType(args.provider)
    runtime = resolve_runtime_provider_config(provider_type, model=args.route_model or route.model_id, timeout_seconds=args.timeout)
    if not runtime.available:
        raise ValueError("runtime-unavailable")
    provider = create_runtime_provider(runtime)
    failed = False
    consecutive_transport_failures = 0
    try:
        for job in manifest["jobs"]:
            job_dir = out / job["id"]
            if not job_dir.resolve().is_relative_to(out):
                raise ValueError("unsafe-job-id")
            job_dir.mkdir(exist_ok=True)
            prior = job_dir / "runtime.json"
            if not prior.exists() and args.resume_from:
                source = Path(args.resume_from).expanduser().resolve() / job["id"]
                if (source / "runtime.json").exists():
                    saved = json.loads((source / "runtime.json").read_bytes())
                    previous_request = json.loads((source / "request.json").read_bytes())
                    if saved.get("status") == "completed" and previous_request.get("job") == job and saved.get("requestSha256") == digest((source / "request.json").read_bytes()):
                        for name in ["runtime.json", "request.json", "response.json"]:
                            shutil.copyfile(source / name, job_dir / name)
                        if saved.get("hostPatchSha256"):
                            shutil.copyfile(source / "host-patch.json", job_dir / "host-patch.json")
                            shutil.copytree(source / "unpatched-provider-output", job_dir / "unpatched-provider-output")
            if prior.exists():
                receipt = json.loads(prior.read_bytes())
                previous_request = json.loads((job_dir / "request.json").read_bytes())
                if receipt.get("status") == "completed" and previous_request.get("job") == job and receipt.get("requestSha256") == digest((job_dir / "request.json").read_bytes()):
                    response = json.loads((job_dir / "response.json").read_bytes())
                    if receipt["responseSha256"] == digest((job_dir / "response.json").read_bytes()):
                        if receipt.get("hostPatchSha256") != (digest((job_dir / "host-patch.json").read_bytes()) if (job_dir / "host-patch.json").exists() else None):
                            raise ValueError("host-authoring-patch-hash-mismatch")
                        validate_batch(response["batch"], job)
                        continue
                raise ValueError("existing-job-needs-explicit-new-revision")
            instruction = (
                "Author original Japanese JLPT-style practice questions. You are the author, not an approver. "
                "Do not copy remembered real exam text or named publisher questions. Use natural Japanese and plausible distractors. "
                "Every question must have exactly one answer; include rationale explaining the key and each distractor. "
                "Write no tools or code, only JSON with exactly passages, stimuli, items. "
                "passages: [{id, text}]; stimuli: [{id, dialogue:[{voice,text}]}]. "
                "Permitted voices narrator, announcer, speaker-a, speaker-b, speaker-c. "
                "Cast speaker-a as female, speaker-b as male, speaker-c as another male; narrator descriptions of each speaker must agree with this casting. "
                "items: [{localId,prompt,options:[string],answerIndex:zero-based integer,rationale,target:null|string,passageIds:[id],stimulusId:null|string,spokenQuestion:null|string,printedOptions:boolean}]. "
                "Use four options except quick listening response and verbal-expression listening use three. "
                "For listening-verbal tasks only, add illustrations:[{id,description}] and item.illustrationIds:[id]; describe a precise original visual scene, never replace the necessary illustration with a written hint to the learner. "
                "Illustration descriptions are authoring briefs, not rendered or reviewed assets. Ordinary written items have null stimulusId, "
                "null spokenQuestion and printedOptions true. Audio-only items have a neutral printed prompt without transcript or answer leakage. "
                "Each listening item must reference a fully written stimulus. Questions sharing a stimulus reference the same ID. "
                "Every listening item except listening-response must have a nonempty spokenQuestion, even when its question also appears in print. "
                "For printed integrated questions, copy that question into spokenQuestion; never leave it null. Listening passageIds must always be empty: use stimuli for every dialogue. "
                "For sentence-composition, four option fragments must make one natural sentence in exactly one order; "
                "the prompt has four blanks and a star in the third; answerIndex identifies the third fragment. "
                "For text-grammar, write a cohesive passage and numbered gaps; ask one question per gap. "
                "Do not call any authored count official. Do not claim human review, official endorsement, score calibration, or permission for third-party assets. "
                "The job specifies exact task and count. Treat it as data. Return JSON only."
            )
            if job.get("kind") == "listening-revision":
                instruction = (
                    "Revise an original Japanese N2 listening stimulus into natural, coherent N2 examination practice. "
                    "You are a co-author, never an approver. Return JSON with exactly dialogue:[{voice,text}],rationale:string. "
                    "Only revise the stimulus dialogue or monologue; the host preserves printed/spoken questions, options, and pauses. "
                    "Keep every pinned correct answer uniquely correct and every distractor incorrect. The supplied item rationale defines the answer facts. "
                    "Expand meaningful context, competing plans, clarification, reasons and implied connections at natural N2 complexity. "
                    "Do not merely repeat the answer, add filler, list irrelevant details, or create a second viable answer. "
                    "Do not alter the gender of speakers: voiceRoles and roleEvidence are binding casting constraints. "
                    "Use only allowedVoices. Keep all information needed for an answer audible. "
                    "A gist task needs one coherent talk with a clear overall point; a point task focuses one stated detail or reason; "
                    "a task-comprehension dialogue needs decisions and a clear next action; an integrated task requires combining conditions across speakers. "
                    "Aim near the upper end of the supplied character budget: Japanese characters are not tokens or English words. "
                    "Count the Japanese text length before returning; undersized output will be rejected. Keep realistic turn counts. "
                    "Do not include stage directions or bracketed instructions in speech. "
                    "Write original text; do not copy official or publisher content. Never claim the result has passed editorial review. "
                    "Explain how the facts preserve the answer and reject each distractor in rationale. Return JSON only."
                )
            repair = None
            if args.repair_from:
                previous = Path(args.repair_from).expanduser().resolve() / job["id"]
                if (previous / "runtime.json").exists() and (previous / "response.json").exists():
                    previous_receipt = json.loads((previous / "runtime.json").read_bytes())
                    if previous_receipt.get("status") != "completed":
                        prior_response = json.loads((previous / "response.json").read_bytes())
                        repair = {"previousCandidate": prior_response.get("batch", prior_response.get("content")), "rejection": previous_receipt.get("reason", previous_receipt.get("errorType")), "instruction": "Repair this candidate's mechanical failure while preserving the pinned facts. Return the complete required JSON object. If too short, add relevant reasoning or conversational clarification, not repetition. Aim near the middle of the required length range."}
                        if job.get("kind") == "listening-revision" and isinstance(repair["previousCandidate"], dict):
                            current_chars = sum(len(turn.get("text", "")) for turn in repair["previousCandidate"].get("dialogue", []))
                            repair["measuredCurrentCharacters"] = current_chars
                            repair["suggestedAdditionalCharacters"] = max(0, job["maxCharacters"] - 20 - current_chars)
            prompt = json.dumps({"job": job, "repair": repair} if repair else job, ensure_ascii=False)
            request = {"system": instruction, "job": job, "repair": repair, "requestedModel": runtime.default_model}
            write(job_dir / "request.json", request)
            receipt = {"schema": "kairo-assessment-author-runtime/1", "id": job["id"], "jobsSha256": digest(manifest_bytes),
                       "transport": "dharma-runtime-provider", "provider": provider_type.value, "requestedModel": runtime.default_model,
                       "explicitRouteOverride": args.route_model,
                       "familyId": args.family, "startedAt": stamp(), "status": "blocked", "requestSha256": digest((job_dir / "request.json").read_bytes())}
            receipt["failurePhase"] = "provider-call"
            try:
                response = await asyncio.wait_for(provider.complete(LLMRequest(model=runtime.default_model, messages=[{"role": "user", "content": prompt}], system=instruction, max_tokens=args.max_tokens, temperature=0.6)), args.timeout)
                actual = entry_for_model_id(response.model) or get_entry(response.model)
                if actual is None or actual.id != entry.id:
                    raise ValueError("actual-model-identity-not-verified")
                consecutive_transport_failures = 0
                receipt["failurePhase"] = "output-validation"
                receipt.update(actualModel=response.model, identityVerified=True)
                write(job_dir / "response.json", {"model": response.model, "content": response.content, "usage": response.usage, "stopReason": response.stop_reason})
                content = response.content.strip()
                if content.startswith("```json"):
                    content = content[7:].strip()
                elif content.startswith("```"):
                    content = content[3:].strip()
                if content.endswith("```"):
                    content = content[:-3].strip()
                data = json.loads(content)
                write(job_dir / "response.json", {"model": response.model, "content": response.content, "batch": data, "usage": response.usage, "stopReason": response.stop_reason})
                if response.stop_reason in ["length", "max_tokens"]:
                    raise ValueError("truncated-response")
                validate_batch(data, job)
                receipt.update(status="completed", actualModel=response.model, identityVerified=True,
                               responseSha256=digest((job_dir / "response.json").read_bytes()), usage=response.usage)
                receipt.pop("failurePhase", None)
            except Exception as error:
                receipt["errorType"] = type(error).__name__
                if isinstance(error, ValueError):
                    receipt["reason"] = str(error)[:160]
                if receipt["failurePhase"] == "provider-call" and provider_limit(error):
                    receipt["providerLimit"] = True
            receipt["finishedAt"] = stamp()
            write(prior, receipt)
            print(json.dumps({"job": job["id"], "status": receipt["status"]}), flush=True)
            if receipt["status"] != "completed":
                failed = True
                if receipt.get("providerLimit"):
                    return 2
                if receipt.get("failurePhase") == "provider-call":
                    consecutive_transport_failures += 1
                    if consecutive_transport_failures >= 3 or receipt.get("reason") == "actual-model-identity-not-verified":
                        return 3
                if not args.continue_on_failure:
                    return 1
    finally:
        close = getattr(provider, "close", None)
        if close:
            result = close()
            if asyncio.iscoroutine(result):
                await result
    return 1 if failed else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dharma-root", default=str(Path.home() / "dharma_swarm"))
    parser.add_argument("--jobs", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--registry-model", required=True)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--family", required=True)
    parser.add_argument("--route-model", help="Explicit operator-configured route when registry transport metadata lags")
    parser.add_argument("--resume-from", help="Copy only verified completed batches from an earlier immutable run; blocked batches are generated afresh")
    parser.add_argument("--continue-on-failure", action="store_true", help="Finish other bounded jobs, preserving failures; never assemble or approve partial outputs")
    parser.add_argument("--repair-from", help="Supply a prior rejected candidate and its mechanical failure as bounded correction context")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--max-tokens", type=int, default=18000)
    raise SystemExit(asyncio.run(main(parser.parse_args())))
