/** The engine copy is the Nihongo Study release this tree names, and the check that says so fails
 * on a planted difference: another commit, one changed byte, a file too many, a file too few.
 * Every control runs on a scratch copy of the real vendored folder. */
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import {
  SHARED_STUDY_PATHS,
  closureOf,
  readRelease,
  verifySharedStudyRelease,
} from '../scripts/verify-shared-study-release.mjs';

const SCRIPT = fileURLToPath(
  new URL('../scripts/verify-shared-study-release.mjs', import.meta.url),
);
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const release = readRelease(),
  pin = json(SHARED_STUDY_PATHS.pin),
  OTHER_COMMIT = 'a'.repeat(40);
let scratch, vendor;
const manifestPath = () => join(vendor, 'engine-manifest.json');
const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const cliOnCopy = () =>
  cli('--vendor', vendor, '--release', SHARED_STUDY_PATHS.release, '--pin', SHARED_STUDY_PATHS.pin);
/** Change a file of the scratch copy, judge, and put the file back whatever the judgement was. */
async function withFile(path, change, judge) {
  const full = join(vendor, path),
    original = readFileSync(full);
  try {
    change(full, original);
    return await judge();
  } finally {
    writeFileSync(full, original);
  }
}
const judgeCopy = (options = {}) => verifySharedStudyRelease({ vendor, release, pin, ...options });
const refusal = (run) => {
  try {
    run();
  } catch (error) {
    return error.message;
  }
  return null;
};

beforeAll(() => {
  scratch = mkdtempSync(join(realpathSync(tmpdir()), 'bunki-engine-release-'));
  vendor = join(scratch, 'shared-study-engine');
  cpSync(SHARED_STUDY_PATHS.vendor, vendor, { recursive: true });
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('the engine copy is the named Nihongo Study release', () => {
  it('holds for the committed copy, the reviewed pin and the release record', () => {
    const manifest = json(join(SHARED_STUDY_PATHS.vendor, 'engine-manifest.json'));
    expect(verifySharedStudyRelease({ pin })).toEqual({
      repository: 'nihongo-srs',
      commit: release.commit,
      reducerSha256: release.reducerSha256,
      closureSha256: release.closureSha256,
      files: manifest.files.length,
      named: release.date,
    });
    expect(manifest.surface).toBe('engine-and-study-ui');
    const result = cli();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      engineCopyIsNamedRelease: true,
      commit: release.commit,
      closureSha256: release.closureSha256,
    });
  });

  it('holds for an untouched scratch copy, so each failure below has one planted cause', () => {
    expect(judgeCopy().commit).toBe(release.commit);
    expect(cliOnCopy().status).toBe(0);
  });

  it('fails when the manifest names a different commit', async () => {
    await withFile(
      'engine-manifest.json',
      (full, original) => {
        const manifest = JSON.parse(original);
        manifest.source.commit = OTHER_COMMIT;
        writeFileSync(full, `${JSON.stringify(manifest, null, 2)}\n`);
      },
      () => {
        expect(refusal(judgeCopy)).toContain(
          `it was exported from commit ${OTHER_COMMIT}, the release is ${release.commit}`,
        );
        const result = cliOnCopy();
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('not the named Nihongo Study release');
      },
    );
  });

  it('fails for a whole consistent copy of another commit that the distributed verifier accepts', async () => {
    await withFile(
      'engine-manifest.json',
      (full, original) => {
        const manifest = JSON.parse(original);
        manifest.source.commit = OTHER_COMMIT;
        manifest.closureSha256 = closureOf(manifest);
        writeFileSync(full, `${JSON.stringify(manifest, null, 2)}\n`);
      },
      async () => {
        const drifted = json(manifestPath());
        expect(drifted.closureSha256).not.toBe(release.closureSha256);
        // The copy agrees with itself: the verifier it ships with passes it under its own closure.
        const { verifyEngineDistribution } =
          await import('../prototypes/corridor/vendor/shared-study-engine/tools/verify_engine.mjs');
        expect(
          verifyEngineDistribution(vendor, { expectedClosureSha256: drifted.closureSha256 }).source
            .commit,
        ).toBe(OTHER_COMMIT);
        // A pin moved along with the copy is refused, and so is the copy without any pin.
        const movedPin = {
          ...pin,
          sourceCommit: OTHER_COMMIT,
          closureSha256: drifted.closureSha256,
        };
        expect(refusal(() => judgeCopy({ pin: movedPin }))).toContain(
          `the reviewed pin names commit ${OTHER_COMMIT}, the release is ${release.commit}`,
        );
        expect(refusal(() => judgeCopy({ pin: null }))).toContain(
          `it was exported from commit ${OTHER_COMMIT}`,
        );
      },
    );
  });

  it.each(['client/app/app.mjs', 'client/replay.mjs', 'themes/tokens.json'])(
    'fails on one changed byte in %s',
    async (path) => {
      await withFile(
        path,
        (full, original) => {
          const bytes = Buffer.from(original),
            at = Math.floor(bytes.length / 2);
          bytes[at] ^= 1;
          expect(bytes.length).toBe(original.length);
          writeFileSync(full, bytes);
        },
        () => {
          expect(refusal(judgeCopy)).toContain(`${path} does not have the release's bytes`);
          expect(cliOnCopy().status).toBe(1);
        },
      );
    },
  );

  it('fails when a file is added to the copy', () => {
    const extra = join(vendor, 'client/app/not-in-the-release.mjs');
    try {
      writeFileSync(extra, 'export {};\n');
      expect(refusal(judgeCopy)).toContain('not in the release: client/app/not-in-the-release.mjs');
      expect(cliOnCopy().status).toBe(1);
    } finally {
      rmSync(extra, { force: true });
    }
  });

  it('fails when a file is removed from the copy', () => {
    const path = 'client/audio/voice-lines.mjs',
      full = join(vendor, path),
      original = readFileSync(full);
    try {
      rmSync(full);
      expect(refusal(judgeCopy)).toContain(`missing from the copy: ${path}`);
      expect(cliOnCopy().status).toBe(1);
    } finally {
      writeFileSync(full, original);
    }
  });

  it('refuses a link inside the copy', () => {
    const link = join(vendor, 'client/app/linked.mjs');
    try {
      symlinkSync(join(vendor, 'client/app/app.mjs'), link);
      expect(refusal(judgeCopy)).toContain('client/app/linked.mjs is a link');
    } finally {
      rmSync(link, { force: true });
    }
  });

  it('fails when the reviewed pin and the release record disagree', () => {
    expect(refusal(() => judgeCopy({ pin: { ...pin, sourceCommit: OTHER_COMMIT } }))).toContain(
      `the reviewed pin names commit ${OTHER_COMMIT}`,
    );
    expect(refusal(() => judgeCopy({ pin: { ...pin, closureSha256: 'b'.repeat(64) } }))).toContain(
      `the reviewed pin names closure ${'b'.repeat(64)}`,
    );
  });

  it('fails when the release record names another commit, closure or reducer', () => {
    expect(
      refusal(() => judgeCopy({ pin: null, release: { ...release, commit: OTHER_COMMIT } })),
    ).toContain(`the release is ${OTHER_COMMIT}`);
    expect(
      refusal(() =>
        judgeCopy({ pin: null, release: { ...release, closureSha256: 'c'.repeat(64) } }),
      ),
    ).toContain(`the release is ${'c'.repeat(64)}`);
    expect(
      refusal(() =>
        judgeCopy({ pin: null, release: { ...release, reducerSha256: 'd'.repeat(64) } }),
      ),
    ).toContain(`its reducer is ${release.reducerSha256}, the release is ${'d'.repeat(64)}`);
  });

  it.each(['commit', 'reducerSha256', 'closureSha256', 'date', 'note', 'repository', 'format'])(
    'refuses a release record without its %s',
    (field) => {
      const path = join(scratch, `release-without-${field}.json`),
        record = { ...release };
      delete record[field];
      writeFileSync(path, JSON.stringify(record));
      expect(refusal(() => readRelease(path))).toContain('the release record is incomplete');
      const result = cli('--vendor', vendor, '--release', path, '--pin', SHARED_STUDY_PATHS.pin);
      expect(result.status).toBe(1);
    },
  );

  it('says that the record stands in for a release pointer still to come', () => {
    expect(release.note).toMatch(/stands in for the release pointer/u);
  });
});
