# Local maintenance service

This is a Python standard-library service with SQLite receipts, screenshot storage, a local Ollama triage worker, and a provider-neutral CLI queue. It does not execute commands, edit application files, deploy, or declare a report fixed. A proposal has `execution_authority: "none"`; an independently authenticated operator must issue a scoped work order before a maintenance adapter can claim work.

## Run a new owned service

Python 3.10 or newer is required. No dependency installation, model download, remote model subscription, or paid credential is used.

From this directory:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 server.py \
  --port 57032 \
  --source-root /absolute/path/to/authorized/worktree \
  --app-root /absolute/path/to/built/app \
  --ollama-model mistral:latest
```

`--app-root` is optional; without it the service serves only the API. `--source-root` defaults to the containing corridor directory and defines the exact host checkout for work orders. Pass the same roots to CLI calls. Only `127.0.0.1` binding is supported. Existing application servers are not changed. The service prints its new origin and build identity once; it never prints keys or report bodies.

`--state-dir` defaults to `~/.dharma/bunki_maintenance/`. That private directory contains `maintenance.sqlite3` plus its WAL, the durable `events` audit table, and separate `worker.key` and `operator.key` files (0600). Reports, images, conversations, proposals, work orders, leases, and results survive process restart. SQLite `synchronous=FULL` transactions commit before intake acknowledgment. Back up the state directory using SQLite's backup mechanism while running, or copy the complete directory while stopped. Guest bearer credentials are hashed in SQLite. The client must retain its bearer credential to reconnect; no account or cross-device identity service is implied.

Startup applies additive schema migrations inside a serialized transaction. The report-generation migration counts previous user messages for existing reports, but leaves legacy proposal/order generation unknown; it never guesses which evidence an old worker saw. Such orders can retain submitted results but cannot promote a report's status. Reload the owned service onto the updated backend before using the updated CLI against its state.

The static server exposes runtime extensions only, under root app files, `data/`, `modules/`, `fonts/`, `audio/`, `vendor/`, and the two report-client JS/CSS files. It rejects hidden paths, traversal, symlinks, Python, databases, keys, and directory listings. Put only public app assets in the app root. Build identity combines the source checkout's read-only `git rev-parse HEAD` with a digest of the actual allowlisted app assets. `build-identity.json` is excluded from the digest to avoid a self-reference. Content references must occur as IDs in shipped data JSON.

## Browser API

Allowed browser origins are the service's own exact origin and `http://127.0.0.1:57031`. Unknown `Host` and `Origin` values are rejected. Every write requires an allowed `Origin` and `Content-Type: application/json`. Every report operation also requires `Authorization: Bearer <guest token>`. CORS is explicit, with no wildcard and no operator credential in the browser.

| Request | Payload / response |
| --- | --- |
| `GET /api/config` | `{schema_version,service_version,build,content_ids,limits,ai}` |
| `POST /api/session` | `{}` → `{token,actor_ref}`; persist this guest credential |
| `POST /api/reports` | `{idempotency_key,report,attachments}` → report view; 201 first acceptance, 200 identical retry |
| `GET /api/reports` | `{reports:[view]}` for the authenticated reporter only |
| `GET /api/reports/:id` | One report view |
| `GET /api/reports/:id/attachments/:attachment_id` | Authenticated original screenshot bytes |
| `POST /api/reports/:id/messages` | `{idempotency_key,text}` → updated view |
| `POST /api/reports/:id/reopen` | `{idempotency_key,text,context}` → updated view; previous thread retained |
| `POST /api/reports/:id/propose` | `{}` → `{queued,report_id}`; background local triage, never a synchronous model request |

`report` follows `SCHEMA.definitions.LearnerReport` in `contract.py`, copied from the reviewed draft. It rejects unknown fields. The host verifies `origin.actor_ref` against the guest session; user reports must have `origin.kind="user"`, `origin.model_ref=null`, `revision=1`, and `execution_authority="none"`. Optional expected behavior can use the explicit value `"Not specified"`. Viewport and typed action traces fit in `action_trace` evidence summaries, rather than unknown context fields.

A browser served from this service can use `/api/config`'s exact build. Another application origin must not claim this service's artifact identity: use `{git_sha:null,artifact_sha256:null}` when its build is unknown. Any non-null identity must exactly match a registered build. Unknown content IDs are rejected; observations without registered IDs can remain in user wording/evidence.

Each attachment is `{id,name,mime_type,data_base64}`. Supported screenshots are PNG, JPEG, and WebP, with a matching byte signature. This checks MIME signatures and transport integrity, not a complete image decode. Each image is at most 2 MiB; at most four images and 6 MiB total are allowed per report. The report's `attachment_ids` must exactly match supplied images. Screenshot evidence points to `artifact_ref: "attachment:<id>"`. Other arbitrary artifact URLs are rejected. In total, the local store accepts 200 reports per guest, 2,000 reports, and 256 MiB of images.

The response view is:

```json
{
  "receipt": {"receipt_id":"receipt_…","report_id":"report_…","received_at":"…","payload_sha256":"…"},
  "report": {},
  "generation": 1,
  "status": "received",
  "triage": {"state":"pending","reason":"Awaiting local model"},
  "conversation": [{"id":"msg_…","actor":"user","text":"…","created_at":"…","context":null}],
  "proposals": []
}
```

The digest is SHA256 of the canonical complete submitted envelope, including the idempotency key and attachment base64. Preserve the exact payload and key for retries; changed payload with the same key returns 409. Reports and conversations use separate keys in a single reporter-scoped namespace. Errors are `{error:{code,message}}`. A 401 means the browser must recover its original guest credential; silently issuing a new identity would lose access to its thread.

Every newly accepted message or reopen advances the server-owned report generation; an idempotent retry does not. Proposals freeze the source generation they were based on, and work orders carry that generation forward. A result for an earlier generation remains durable evidence with explicit `completion_relevance`, but cannot change the newer report's status. Transaction ordering also preserves a newer active order or completed candidate when an older worker finishes later. Isolated Unicode surrogate strings are rejected as invalid payloads before storage.

Visible server states are `received`, `looking_into_it` after validated AI triage, `preparing_fix` after an operator work order, and `ready_for_review` after an agent submits a result. `ready_for_review` means submitted evidence, including failed or blocked checks, awaits independent review. It is never proof of passing tests, release, or a fix. This implementation has no release/fixed endpoint.

A future release adapter must require an authenticated deployment receipt identifying the actual released artifact, its included candidate, and independent verification before presenting `Fixed in [version]`. A passing worker result alone is insufficient. That deployment integration is intentionally still an external boundary.

## Local AI behavior

The default Ollama endpoint is `http://127.0.0.1:11434`. `--ollama-endpoint` accepts an HTTP numeric loopback origin only. Proxies, redirects, credentials in URLs, cloud-tagged models, and models advertising `remote_host` or `remote_model` are rejected. `--ollama-model` selects an already installed local model. Without it, the smallest installed local GGUF completion model is selected. The adapter never pulls models or starts/stops Ollama. `--no-ai` leaves reports honestly pending.

The background worker acquires a fenced triage lease and sends only one selected report and up to 12 messages from that report to the local model. It does not send other reports, application storage, source files, account secrets, or screenshot bytes. The selected textual input is capped at 32,000 characters. Requests have a 100-second timeout and an output budget. Missing models, malformed JSON, invalid references, unsupported claims, and oversized context leave the report pending with a reason. They never produce a synthetic AI summary. A valid result receives host-assigned actor, model, model digest, source report, and loopback provenance. The original learner wording stays unchanged.

The maintenance system prompt explicitly prohibits answering assessment questions, selecting correct options, evaluating learner answers, providing readings/translations/hints, or revealing protected unanswered content. It asks for interface diagnosis and maintenance verification only. Reports remain untrusted task data, including reports captured during timed sessions.

The current adapter requires exactly one existing source report per proposal, even though the interchange schema permits more. This bounds disclosure to the selected report and prevents cross-reporter leakage. Evidence must resolve unchanged to that source. A reported symptom cannot be promoted to an inspected fact: `inspection` claims require actual inspection/test evidence, which guest submissions cannot assert.

## Agent and operator CLI

All commands print a JSON envelope `{ok,result}` or `{ok:false,error}`. Credentials are read from private files; never put their contents in command arguments or browser code. `--credential-file` can explicitly select a restricted key. Other agents can consume the same CLI without parsing model prose.

```sh
python3 cli.py --source-root /authorized/worktree --app-root /built/app list
python3 cli.py --source-root /authorized/worktree --app-root /built/app report report_abc
python3 cli.py --source-root /authorized/worktree --app-root /built/app submit-proposal < proposal.json
python3 cli.py --source-root /authorized/worktree --app-root /built/app create-work-order < work-order.json
python3 cli.py --source-root /authorized/worktree --app-root /built/app claim --worker codex --seconds 120
python3 cli.py --source-root /authorized/worktree --app-root /built/app heartbeat work_abc --worker codex --fence 1
python3 cli.py --source-root /authorized/worktree --app-root /built/app complete work_abc --worker codex --fence 1 < result.json
python3 cli.py --source-root /authorized/worktree --app-root /built/app triage-once --ollama-model mistral:latest
```

`submit-proposal` takes the complete BuildProposal interchange object. Attribution is assigned to the authenticated host adapter; an agent's self-declared model is not treated as verified provenance. It never creates a work order. `report <id>` exports one selected report for an adapter; there is no bulk report export command.

Only `create-work-order` uses `operator.key`. Its input is:

```json
{
  "proposal_id":"proposal_abc",
  "proposal_revision":1,
  "repository":"/absolute/path/to/authorized/worktree",
  "base_build":{"git_sha":"40 lower-case hex characters","artifact_sha256":"64 lower-case hex characters"},
  "permitted_paths":["prototypes/corridor/assessment-question-view.mjs"],
  "permitted_actions":["inspect","edit","test"],
  "test_budget_seconds":120,
  "expires_at":1790200000
}
```

Use the current base from `cli.py ... config`; expiry is a Unix timestamp in the next 24 hours. Paths are concrete relative files/directories within the configured checkout; traversal, hidden segments, globs, and release/deploy actions are rejected. The host assigns order ID, host ID, proposal digest, creation time, and authority. The order records scope; a separate agent must honor that scope when performing authorized work. The queue itself never executes commands or grants an OS sandbox.

`claim` returns `null` when no unexpired work order is available. Otherwise it returns an order with `worker`, `fence`, and `lease_until`. Orders whose base no longer matches the host are retained with state `stale_base` and skipped, so they cannot block later valid orders. Heartbeats renew 10–600 second leases without exceeding order expiry. Expired leases can be reclaimed by another adapter with a strictly higher fence. Old workers cannot heartbeat or complete after expiry/reclaim.

Completion takes:

```json
{
  "base_build":{"git_sha":null,"artifact_sha256":"64 hex characters matching the order"},
  "candidate_build":{"git_sha":null,"artifact_sha256":"64 hex characters identifying the candidate"},
  "changed_files":["prototypes/corridor/assessment-question-view.mjs"],
  "reproduction":{"status":"reproduced","details":"How the report was reproduced"},
  "tests":[{"command":"test command recorded as evidence only","outcome":"passed","details":"Actual outcome"}],
  "artifacts":["receipt:local-artifact-reference"],
  "summary":"Candidate submitted for independent review"
}
```

Reproduction status is `reproduced`, `not_reproduced`, or `blocked`. Test outcomes are `passed`, `failed`, `blocked`, or `not_run`. Base identity must match the order; changed files must remain within permitted paths and require `edit` authority. Candidate artifacts and test claims are recorded as unverified evidence. The exact repeated completion is idempotent; a different result or stale lease is rejected. An authorized result based on earlier report evidence is stored without status promotion. The order's `completion_relevance` lists `current_report_ids`, `stale_report_ids`, `untracked_report_ids`, and the generation comparison at completion. No direct push, PR, deploy, or release action exists here.

## Verification

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s . -p test_backend.py -v
```

The suite uses temporary state, temporary app files, and short-lived ephemeral loopback test servers. It covers durable restart/retry, strict schema and reference checks, attachment failures, per-reporter access, Host/origin/auth enforcement, reopening, local-model absence/cloud exclusion, bounded model input/provenance, proposal-versus-work-order authority, stale bases, worker crash/reclaim, fenced writes, and release-state spoof rejection. Model tests inject deterministic responses and do not claim a live inference occurred; run an actual selected report through the live service to verify the installed model separately.

The 2026-09-24 live smoke test used a synthetic report and the already installed `mistral:latest`: it produced one strictly validated proposal in 6.98 seconds with no work order. The real output and model digest are recorded outside the repository at `~/.dharma/bunki_maintenance/verification/local-model-smoke-mistral-20260924.json`. The smaller installed `llama3.2:latest` repeatedly produced invalid output and correctly remained pending; select the verified Mistral model explicitly on this host. This is evidence of one successful inference, not a guarantee of proposal quality or future completion.
