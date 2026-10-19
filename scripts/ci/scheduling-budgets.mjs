/** Execution ceilings and explicit overhead reservations; these are not measured durations. */
import assert from 'node:assert/strict';

const MINUTE = 60_000;
export const SCHEDULING_POLICY = Object.freeze({
  kind: 'execution-ceilings-with-overhead-reservations',
  hostedJobMinutes: 360,
  stepLimitMinutes: 360,
  setupMinutes: 40,
  retentionMinutes: 20,
  wrapperMinutes: 2,
  perGateReceiptMinutes: 1,
});

export function scheduledBudget(gateTimeouts) {
  assert(Array.isArray(gateTimeouts) && gateTimeouts.length, 'Missing gate budgets');
  const names = new Set();
  for (const gate of gateTimeouts) {
    assert(typeof gate.name === 'string' && gate.name.length, 'Missing budget gate name');
    assert(!names.has(gate.name), `Duplicate budget: ${gate.name}`);
    names.add(gate.name);
    assert(
      Number.isSafeInteger(gate.timeoutMs) && gate.timeoutMs > 0,
      `Missing/invalid budget: ${gate.name}`,
    );
  }
  const gateTimeoutMs = gateTimeouts.reduce((sum, gate) => sum + gate.timeoutMs, 0);
  assert(Number.isSafeInteger(gateTimeoutMs), 'Gate budget sum overflow');
  const stepTimeoutMinutes =
    Math.ceil(gateTimeoutMs / MINUTE) +
    SCHEDULING_POLICY.wrapperMinutes +
    gateTimeouts.length * SCHEDULING_POLICY.perGateReceiptMinutes;
  return {
    ...SCHEDULING_POLICY,
    gateTimeouts: gateTimeouts.map(({ name, timeoutMs }) => ({ name, timeoutMs })),
    gateTimeoutMs,
    stepTimeoutMinutes,
    jobTimeoutMinutes:
      stepTimeoutMinutes + SCHEDULING_POLICY.setupMinutes + SCHEDULING_POLICY.retentionMinutes,
  };
}

export function budgetFits(gateTimeouts) {
  const budget = scheduledBudget(gateTimeouts);
  return (
    budget.stepTimeoutMinutes <= SCHEDULING_POLICY.stepLimitMinutes &&
    budget.jobTimeoutMinutes <= SCHEDULING_POLICY.hostedJobMinutes
  );
}

export function requireScheduledBudget(shard, actualGateTimeouts) {
  assert(Array.isArray(actualGateTimeouts), 'Missing gate budgets');
  assert.deepEqual(
    actualGateTimeouts.map((g) => g.name),
    shard.gates,
    'Budget gate membership/order mismatch',
  );
  const expected = scheduledBudget(actualGateTimeouts);
  assert(
    budgetFits(actualGateTimeouts),
    `Shard ${shard.id} exceeds hosted execution limit; split it`,
  );
  assert.deepEqual(shard.budget, expected, `Scheduled budget mismatch: ${shard.id}`);
  return expected;
}

export function shardMatrix(shards) {
  return {
    include: shards.map((s) => {
      requireScheduledBudget(s, s.budget?.gateTimeouts);
      return {
        shard: s.id,
        kind: s.kind,
        python: s.python,
        corpus: s.corpus,
        e2e: s.e2e,
        browsers: s.browsers.join(' '),
        stepTimeoutMinutes: s.budget.stepTimeoutMinutes,
        jobTimeoutMinutes: s.budget.jobTimeoutMinutes,
      };
    }),
  };
}

function cap(value, row, key) {
  if (value === '${{ matrix.' + key + ' }}') return row[key];
  assert(Number.isInteger(value) && value > 0, `Missing/unknown workflow ${key} binding`);
  return value;
}

/** Consume parsed YAML and the same matrix builder used for GITHUB_OUTPUT, not source-text matches. */
export function validateWorkflowSchedule(workflow, lanes) {
  const matrices = {
    fast: '${{ fromJSON(needs.plan.outputs.fast-matrix) }}',
    battery: '${{ fromJSON(needs.plan.outputs.matrix) }}',
    'fast-retry': '${{ fromJSON(needs.fast-retry-plan.outputs.matrix) }}',
    retry: '${{ fromJSON(needs.retry-plan.outputs.matrix) }}',
  };
  for (const [jobId, shards] of Object.entries(lanes)) {
    assert(Object.hasOwn(matrices, jobId), `Unknown workflow scheduling lane: ${jobId}`);
    const job = workflow.jobs?.[jobId];
    assert(job, `Missing workflow scheduling job: ${jobId}`);
    assert.equal(job.strategy?.matrix, matrices[jobId], `Wrong planned matrix source: ${jobId}`);
    assert.equal(job.strategy?.['fail-fast'], false, `Fail-continue matrix changed: ${jobId}`);
    const steps = job.steps || [];
    const indices = steps.flatMap((step, index) => (step.id === 'gates' ? [index] : []));
    assert.equal(indices.length, 1, `Missing/duplicate gate step: ${jobId}`);
    const index = indices[0],
      step = steps[index];
    if (['fast', 'battery'].includes(jobId))
      assert.equal(step['continue-on-error'], true, `First failures must be retained: ${jobId}`);
    else assert.notEqual(step['continue-on-error'], true, `Final retry must fail: ${jobId}`);
    const overhead = (items, phase) =>
      items.reduce((sum, item) => {
        const minutes = item['timeout-minutes'];
        assert(
          Number.isInteger(minutes) && minutes > 0 && minutes <= 360,
          `Unbounded ${phase} step: ${jobId}/${item.id || item.name || item.uses}`,
        );
        return sum + minutes;
      }, 0);
    assert(
      overhead(steps.slice(0, index), 'setup') <= SCHEDULING_POLICY.setupMinutes,
      `Setup exceeds reservation: ${jobId}`,
    );
    assert(
      overhead(steps.slice(index + 1), 'retention') <= SCHEDULING_POLICY.retentionMinutes,
      `Retention exceeds reservation: ${jobId}`,
    );
    for (const row of shardMatrix(shards).include) {
      const stepCap = cap(step['timeout-minutes'], row, 'stepTimeoutMinutes');
      const jobCap = cap(job['timeout-minutes'], row, 'jobTimeoutMinutes');
      assert(
        stepCap >= row.stepTimeoutMinutes && stepCap <= SCHEDULING_POLICY.stepLimitMinutes,
        `Step cap cannot cover scheduled gates: ${jobId}/${row.shard}`,
      );
      assert(
        jobCap >= row.jobTimeoutMinutes && jobCap <= SCHEDULING_POLICY.hostedJobMinutes,
        `Job cap cannot cover gates and overhead: ${jobId}/${row.shard}`,
      );
    }
    // Require the dynamic binding even for an empty retry matrix and future longer plans.
    assert.equal(
      step['timeout-minutes'],
      '${{ matrix.stepTimeoutMinutes }}',
      `Step cap must derive from matrix: ${jobId}`,
    );
    assert.equal(
      job['timeout-minutes'],
      '${{ matrix.jobTimeoutMinutes }}',
      `Job cap must derive from matrix: ${jobId}`,
    );
  }
  return true;
}
