# Feed verification tools

All evidence and test profiles belong under `~/.dharma` or CI `RUNNER_TEMP`. No tool here launches the installed operator app or shares publisher metadata through a server.

Run the network and service checks against the canonical staged artifact:

```sh
KAIRO_SITE_DIR=/absolute/staged/site \
KAIRO_EVIDENCE_DIR=/absolute/external/evidence \
node --test prototypes/bunki-desktop/test/feed-network.test.cjs prototypes/bunki-desktop/test/feed-service.test.cjs
```

The network cases use actual temporary loopback HTTPS connections with explicit test-only DNS/transport injection. They exercise public/private DNS, rebinding across redirects, exact endpoint restrictions, conditional headers, byte limits, invalid encoding, stalled DNS/body timeout, cancellation and HTTP failure responses. The production adapter contains no environment bypass for these boundaries. Without `KAIRO_SITE_DIR`, the service test uses the existing canonical staging helper outside the checkout.

The actual Electron bridge journey uses the installed local project Electron and an isolated profile/port:

```sh
node tools/feed/verify-native.mjs --site /absolute/staged/site --out /absolute/fresh/external/evidence
```

`qa-electron-main.cjs` injects synthetic responses before loading the actual desktop main/preload/service. It is outside the packaged host file list. The journey checks the sandbox bridge, malformed source requests, child-frame boundaries, inert parsed metadata, restart cadence and source-isolated rate limiting. It exercises the bridge; source shelf presentation is covered by the app's separate user journey tests.

The following command makes **live** direct personal-device metadata requests:

```sh
node tools/feed/probe-live.mjs --live --site /absolute/staged/site \
  --profile /absolute/external/retained-qa-profile --out /absolute/fresh/external/evidence
```

By default it selects one channel per independent publisher. Unresolved catalog rows make no request. `--sources asahi,mainichi` narrows the selection to exact registered IDs. Reuse the profile on later runs so cadence and `Retry-After` survive. There are no automatic retries. The receipt records status, publication freshness, item counts, response hashes, artifact identity and the separate source basis; it never saves publisher XML, titles or article bodies. Any selected active feed that does not return an updated/not-modified result makes the command nonzero, including a cadence-deferred run. A single smoke does not establish sustained availability, editorial quality or full-reader rights.

Primary network boundary references: [Node HTTPS request](https://nodejs.org/api/https.html#httpsrequestoptions-callback), [Electron IPC sender validation](https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages), and [IANA IPv6 special-purpose allocations](https://www.iana.org/assignments/iana-ipv6-special-registry/).
