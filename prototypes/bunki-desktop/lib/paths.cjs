'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function externalPath(value, { fresh = false } = {}) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error('An absolute output/profile path is required.');
  const target = path.resolve(value);
  let parent = target;
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  const actual = path.resolve(fs.realpathSync(parent), path.relative(parent, target));
  const roots = [path.join(os.homedir(), '.dharma')];
  if (process.env.CI && process.env.RUNNER_TEMP) roots.push(process.env.RUNNER_TEMP);
  const allowed = roots.some((root) => {
    let existing = root;
    while (!fs.existsSync(existing)) existing = path.dirname(existing);
    return inside(path.resolve(fs.realpathSync(existing), path.relative(existing, root)), actual);
  });
  if (!allowed || (fresh && fs.existsSync(target))) {
    throw new Error('Use a fresh directory under ~/.dharma or CI RUNNER_TEMP; existing output is never replaced.');
  }
  return actual;
}

function runtimeOptions({ isPackaged, resourcesPath, appDirectory, env = process.env }) {
  const testing = env.BUNKI_TEST_MODE === '1';
  let profile;
  let evidence;
  let port = isPackaged ? 5198 : 5199;
  if (testing) {
    profile = externalPath(env.BUNKI_TEST_PROFILE);
    evidence = externalPath(env.BUNKI_TEST_EVIDENCE);
    port = Number(env.BUNKI_TEST_PORT);
    if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 5198) throw new Error('Tests require an isolated port other than 5198.');
  } else if (!isPackaged) {
    profile = path.join(os.homedir(), '.dharma', 'bunki-desktop', 'development-profile');
  }
  const site = isPackaged
    ? path.join(resourcesPath, 'site', 'corridor')
    : path.resolve(env.BUNKI_SRC_DIR || path.join(appDirectory, '..', 'corridor'));
  return { site, profile, evidence, port, testing, live: !isPackaged && env.BUNKI_LIVE === '1' };
}

module.exports = { externalPath, runtimeOptions };
