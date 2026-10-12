# Bunki / KAIRO versioning and releases

Established October 12, 2026. This is the operating contract for future work by
every contributor and AI provider. The first numbered release is **1.0.0**;
the verified application immediately before it is recorded, without inventing
an old version number, in `releases/baseline-2026-10-12.json`.

## One product and one production line

`main` is the production line. Short-lived task branches hold work until one
reviewable release PR integrates it. Every merge to `main` requires a higher
version and its own completed release notes; combine related changes on one
branch when they should ship together. Keep experiments on clearly named
branches, not on a second phone address or in a new competing app directory.

The production PWA remains at https://amitabhainarunachala.github.io/Bunki-app/.
The phone label is KAIRO; the repository and project name remain Bunki. These
names refer to the same product. The Expo/native harness and internal workspace
packages have their own development metadata; their `0.0.0` fields do not name
the shipped phone PWA or imply that a signed native release exists.

## Version meaning and compatibility contract

Use the structure defined by [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).
For this app, the compatibility contract covers supported imports/exports,
learner-record interpretation, stable card/source identities, and documented
external integration behavior. Internal component APIs are not the phone product API.

| Change                                                   | Example       | Requirement                                                                              |
| -------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| Compatible fix, dependency or release-maintenance change | 1.0.0 → 1.0.1 | Patch release with notes and relevant evidence                                           |
| Compatible new learning feature or content capability    | 1.0.1 → 1.1.0 | Minor release; retain existing learning history                                          |
| Incompatible contract change                             | 1.1.0 → 2.0.0 | Major release with explicit migration and recovery evidence                              |
| Candidate on a development branch                        | 1.1.0-rc.1    | Numbered alpha/beta/rc candidates may be tested; production accepts stable versions only |

The version number identifies a release, not its quality score or percentage
complete. A stable release means admitted to the daily-use production channel;
it does not promise every future feature, universal offline content, or a
physical-device test that did not occur.

Keep these identities distinct:

| Identity                          | Authority                                    | Purpose                                                        |
| --------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Product version/channel           | `release.json`                               | Human-readable release identity                                |
| Release commit and source tree    | Git tag and `release-record.json`            | Exact integrated source that was published                     |
| Build ID and original producer    | `build-identity.json`                        | Exact CI-produced build, including a PR merge producer         |
| Runtime and archive SHA-256       | Build/release records and `SHA256SUMS`       | Exact bytes, independent of branch names                       |
| Learner-data epoch                | `release.json`                               | Release compatibility boundary, not an IndexedDB schema number |
| FSRS algorithm/package/parameters | `data/fsrs-pin.json` and release record      | Scheduler identity, independent of product numbering           |
| Card/content identity             | Existing content records and artifact hashes | Preserve scheduling ownership and content provenance           |

Epoch 1 labels the existing data contract; introducing this label does not
rewrite data. Increment it only when the supported interpretation changes.
Such changes require a committed `docs/migrations/*.md` plan with **Upgrade**,
**Recovery**, and **Verification** sections. An incompatible downgrade requires
a major version, `rollbackCompatible: false`, and a recovery plan. Reviewers
must check these declarations against code; metadata alone cannot prove safety.

## Normal release procedure

1. Start a task branch from current `main`. Integrate product work there and
   establish the actual source ancestry of any donor branch.
2. Run `npm run release:prepare -- 1.0.1` (choose the correct higher number).
   This updates the authoritative manifest, root package/lock metadata, and the
   generated installed-version constant. Complete the new release notes; the
   gate rejects placeholders. Use `npm run release:sync` after an intentional
   metadata edit, then `npm run release:verify`.
3. Open a PR to `main`. The plan job rejects non-increasing versions, identity
   drift, rewritten release notes, missing migration plans and incomplete notes.
   All canonical and supplemental checks remain mandatory. Wait for
   **`bunki / required`** and inspect recorded retries; individual shard success
   alone is insufficient. If `main` advances, reconcile it and rerun admission.
4. Merge the reviewed PR with the expected head SHA. Pages independently admits
   full proof for the exact source tree and transfers the same artifact, or
   runs the complete battery. It checks an existing version's identity before
   deployment and refuses replacement with different source or build bytes.
5. The release job verifies the public manifest and core assets, retrieves the
   admitted package, re-verifies the original producer and full evidence, and
   creates a draft GitHub Release. It uploads all assets before publication.
   A failed upload remains a draft; reruns may reuse only byte-identical assets.
   Published versions and assets are never replaced by the automation.

Inspect the **entire Pages workflow**, including `retain and publish numbered
release`. A successful deployment with a failed release job is an incomplete
release record; fix/resume that record without claiming the process finished.

Each GitHub Release retains:

- `bunki-X.Y.Z-site.tar.gz`: the tested site, preserved without rebuilding.
- `build-identity.json`: complete file manifest and original producer.
- `ci-receipt.json`: full admission, required gates and observed retries/flakes.
- `release-record.json`: version, release/tree/build identities, deployment,
  compatibility epoch, FSRS pin, and archive hashes.
- `SHA256SUMS`: hashes of the retained package and evidence files.

These release assets outlive the short retention window of CI artifacts.
GitHub repository backups remain a separate concern; a public release is not
an off-site disaster-recovery backup or a licence grant for bundled content.

## Phone update and incident recovery

**Me → Settings** shows the version embedded in the installed code. It does not
fetch a new release number and mislabel an older cached installation. A link
opens that exact version's release notes.

Update on the existing origin: open online, let the worker finish downloading,
close all app windows/tabs, then reopen. Never clear website data as an update
step. Export a complete learner backup before any intentional data migration.

For a faulty release, prefer a **new patch release** reverting the offending
product change while preserving release history. State the affected version,
restore the known-good behavior in a task branch, prepare the next version,
run upgrade/data-integrity tests and full admission, then publish normally.
Do not reset `main`, move a version tag, or overwrite a published archive.

The retained archive makes exact historical recovery possible, but automatic
in-place downgrades are deliberately not provided. Before any emergency
restoration, compare learner-data epochs and migration evidence, export a
backup, and prove the older reader safely understands the data written since
that release. `rollbackCompatible: true` is a reviewed declaration, not a
substitute for an upgrade/restore test.

## Owner settings required in GitHub

At setup, GitHub reported no branch protection or repository rulesets. The
connected GitHub app can manage code/PRs but cannot administer these settings.
Do not describe the protections below as enabled until GitHub confirms them.

In **Settings → Rules → Rulesets**, create an active branch ruleset for `main`:

- Require a pull request and resolution of review conversations.
- Require the unique status check **`bunki / required`**, with branches up to date.
- Block force pushes and deletion. Apply enforcement to administrators as well;
  do not add a routine bypass for AI agents.
- For solo maintenance, zero required approving reviews permits the owner to
  merge after evidence review. Require an independent review when a second
  authorized reviewer is available, especially for data/scheduler changes.

In **Settings → General → Releases**, enable **release immutability**. The
publisher already stages assets in a draft, which supports GitHub's immutable
publication flow. Add tag protection for `v*` against update/deletion if needed
for tags outside immutable releases. Never disable those rules to reuse a number.

Keep the GitHub Pages environment limited to `main`. A manual environment
review is optional for this personal continuous-delivery workflow; full CI
and exact artifact admission are always required.

Official references:
[protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches),
[releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases),
[preventing release changes](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes).
