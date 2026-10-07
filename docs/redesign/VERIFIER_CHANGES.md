# Deliberate verifier changes

Only chrome language and room-material selector pins change. Storage, SRS, ledgers, offline behavior, deck-front concealment, hit-size and contrast assertions remain intact.

| File | Assertion | Before → after | Reason |
| --- | --- | --- | --- |
| `prototypes/corridor/tools/verify-guided-session.mjs` | J3 attempt chrome material | `html.dataset.room === attempt` → `html.dataset.register === attempt` | F5 gives `data-room=guided` a stable room identity while preserving the exact stage-sensitive register and chrome assertion. |
