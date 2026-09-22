import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { SqliteReplicationStore } from '../../src/replication/index.ts';
import { openNodeSqliteDriver } from '../../src/sqlite/node-driver.ts';
import { ACTOR, FaultDriver, LOCAL_FAULTS, POLICY } from './fixtures.ts';

const [location, requestFile, stage, marker] = process.argv.slice(2);
const driver = new FaultDriver(openNodeSqliteDriver({ location }), () => {
  writeFileSync(marker, JSON.stringify({ stage, pid: process.pid, node: process.version }));
  process.kill(process.pid, 'SIGKILL');
  throw new Error('SIGKILL did not terminate the child');
});
const store = SqliteReplicationStore.open(driver, { policy: POLICY, actor: ACTOR });
if (stage === 'after-commit') driver.failCommit = 'after';
else driver.armed = LOCAL_FAULTS[stage];
if (!driver.failCommit && !driver.armed) throw new Error('Unknown fault stage');
await store.commitLocal(JSON.parse(readFileSync(requestFile, 'utf8')));
writeFileSync(marker + '.acknowledged', 'The caller received an acknowledgement.');
await store.close();
