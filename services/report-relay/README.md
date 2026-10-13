# Report relay

A Cloudflare Worker that receives problem reports from the app's bug button and
files each one as a GitHub issue in this repository, with its screenshots. The
hourly fixer agent picks up those issues (label `kairo-report`), and the app
shows the issue's status and comments on the report. The whole pipeline and
the fixer's procedure are in `docs/operator/BUG_REPORTS.md`.

The relay speaks the report-service contract the app's report client already
uses (`prototypes/corridor/maintenance/README-backend.md`, "Browser API"). A
device reaches it at `https://<worker>.workers.dev/k/<REPORT_KEY>`, so only
devices set up with the key can file reports. The GitHub token stays in the
Worker and only needs Issues read/write on this one repository. Screenshots are
stored in Workers KV and linked from the issue by unguessable addresses.

The relay is a separate service. It never builds or publishes the phone app;
`pages-app.yml` remains the only phone publisher.

## One-time setup

1. **Cloudflare.** Create a free account at dash.cloudflare.com, open
   **Workers & Pages** once and choose a `workers.dev` subdomain. Then go to
   **My Profile → API Tokens → Create Token**, use the **Edit Cloudflare
   Workers** template, and copy the token. Copy the **Account ID** from the
   Workers & Pages overview.
2. **GitHub token.** Go to **Settings → Developer settings → Fine-grained
   tokens → Generate new token**. Set **Repository access** to _Only select
   repositories_ with `Bunki-app` selected, and **Permissions → Issues** to
   _Read and write_. Copy the token.
3. **Repository secrets.** In this repository's **Settings → Secrets and
   variables → Actions**, add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
   `REPORT_GITHUB_TOKEN` and `REPORT_KEY`. `REPORT_KEY` is 16–128 characters
   of A–Z, a–z, 0–9, `_` or `-`.
4. **Deploy.** Run the **report-relay** workflow (Actions → report-relay →
   Run workflow). It tests the relay, creates the KV namespace, deploys the
   Worker, stores the secrets and checks the live relay. Its summary shows the
   relay address. It also redeploys on every merge that changes this folder.
5. **Each device, once.** The setup link is
   `https://amitabhainarunachala.github.io/Bunki-app/?report-relay=<relay address>&report-key=<REPORT_KEY>`.
   Paste it in the app under **Me → Settings → Bug reports**, or open it in
   the browser that runs the app. A home-screen app keeps its own storage, so
   on a phone paste it in Settings. An opened link is removed from the address
   bar and waits in **Settings → Bug reports**, naming the host the reports
   would go to; nothing is stored until **Set up** is chosen. That way a link
   from someone else cannot quietly send a device's reports and screenshots to
   another relay. The app then keeps the address and key on the device.
   Reports saved on that device before setup are then sent automatically.
   `?report-relay=off` forgets the relay.

A device that is not set up still files reports, through a prefilled GitHub
issue that the learner submits.

## Endpoints

Under `/k/<REPORT_KEY>`:

| Request                                           | Result                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /api/config`                                 | Contract identity and limits (`ai.status: "none"`, `public_reports: true`)                                       |
| `POST /api/session`                               | A signed device identity (`token`, `actor_ref`)                                                                  |
| `POST /api/reports`                               | Files the issue; idempotent by `idempotency_key`; the receipt digest is the SHA-256 of the exact request bytes   |
| `GET /api/reports`, `GET /api/reports/:id`        | Report views built from the live issue: status from its state and `fixer:*` labels, comments as the conversation |
| `POST /api/reports/:id/messages`                  | Adds the app's reply as an issue comment (marked `<!-- kairo-app-message -->`) and removes `fixer:needs-info`    |
| `POST /api/reports/:id/reopen`                    | Comments "Still happening" with the current screen, reopens the issue and removes its `fixer:*` labels           |
| `GET /api/reports/:id/attachments/:attachment_id` | The original screenshot                                                                                          |

Public: `GET /health`, and `GET /v1/shots/<id>` for the screenshot images in issues.
The issues are public, so their screenshots are too: the app says so before a
report is sent (`public_reports: true` in the config).

Every keyed request beyond the config and the session counts against an hourly
ceiling for the whole relay: 20 new issues, 30 report lists and 200 other report
requests. Past it the relay answers `429 rate_limited`, and the app keeps the
report and retries later. A learner files a few reports a day; the ceilings stop a
leaked key from filing issues as the owner without end or spending the GitHub
token's API quota. If the key leaks, change `REPORT_KEY` and set up each device
again.

Only `https://amitabhainarunachala.github.io` gets CORS access, plus loopback
pages when `ALLOW_LOOPBACK=1` (local verification only).

## Verification

```sh
node --test services/report-relay/test/worker.test.mjs        # relay unit tests (mock GitHub, in-memory KV)
node prototypes/corridor/tools/verify-report-delivery.mjs     # the app against a local relay, in Chromium and WebKit
```

Both run in CI as the `report-relay` and `report-delivery` gates. The Worker
was also run in the Workers runtime (`wrangler dev --local`) against the mock
GitHub API: config, session, filing with a screenshot, image serving and listing
all answered as in the tests.
