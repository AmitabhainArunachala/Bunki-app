import { newFrameworkReceipt, finishFrameworkReceipt, fileEvidence } from './framework-receipt.mjs';

// In Playwright 1.63, CLI grep/file filters are applied separately from FullConfig.grep.
// Only scope-preserving CLI options may accompany the canonical test/config/reporter call.
function cliNarrowers(argv) {
  const command = argv.indexOf('test');
  if (command < 0) return []; // Direct reporter hook fixtures are not a CLI execution.
  const values = new Set([
    '--config',
    '-c',
    '--reporter',
    '--workers',
    '-j',
    '--timeout',
    '--global-timeout',
    '--output',
    '--retries',
  ]);
  const switches = new Set(['--forbid-only', '--quiet', '--headed']);
  const reasons = [];
  for (let i = command + 1; i < argv.length; i++) {
    const argument = argv[i],
      option = argument.split('=')[0];
    if (values.has(option)) {
      if (!argument.includes('=')) i++;
    } else if (!switches.has(option))
      reasons.push(argument.startsWith('-') ? option : 'positional-test-filter');
  }
  return [...new Set(reasons)];
}
const narrowedGrep = (value) =>
  value !== undefined && value !== null && value.toString() !== '/.*/';
export default class ReceiptReporter {
  receipt = newFrameworkReceipt('playwright');
  onBegin(config, suite) {
    this.receipt.version = config.version;
    const reasons = cliNarrowers(process.argv.slice(2));
    if (config.shard || config.maxFailures || config.grepInvert || narrowedGrep(config.grep))
      reasons.push('config-filter');
    if (config.projects?.some((project) => project.grepInvert || narrowedGrep(project.grep)))
      reasons.push('project-filter');
    // The pinned Playwright Suite keeps focused items after its .only filtering.
    // Real focused-run fixtures protect this version-specific observation seam.
    if (suite._getOnlyItems?.().length) reasons.push('focused-tests');
    this.receipt.narrowingReasons = reasons;
    this.receipt.filtered = reasons.length > 0;
    this.receipt.collected = suite
      .allTests()
      .map((t) => ({ id: t.id, name: t.titlePath().join(' > '), file: t.location.file }));
    this.receipt.scheduledFiles = [...new Set(this.receipt.collected.map((t) => t.file))];
    this.receipt.files = this.receipt.scheduledFiles.map(fileEvidence);
  }
  onTestEnd(test, result) {
    this.receipt.completed.push({
      id: test.id,
      status: result.status,
      retry: result.retry,
      expectedFailure: test.expectedStatus !== 'passed',
    });
  }
  onError(error) {
    this.receipt.errors.push(String(error.message || error));
  }
  onEnd(result) {
    if (result.status !== 'passed') this.receipt.errors.push(`Run ended ${result.status}`);
    finishFrameworkReceipt(this.receipt);
  }
}
