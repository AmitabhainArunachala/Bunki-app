import { newFrameworkReceipt, finishFrameworkReceipt, fileEvidence } from './framework-receipt.mjs';
export default class ReceiptReporter {
  receipt = newFrameworkReceipt('vitest');
  onInit(ctx) {
    this.receipt.version = ctx.version;
    this.receipt.filtered = !!(
      ctx.config.testNamePattern ||
      ctx.config.shard ||
      ctx.config.changed ||
      ctx.config.related ||
      ctx.config.only
    );
  }
  onTestRunStart(specs) {
    this.receipt.scheduledFiles = specs.map((s) => s.moduleId);
    if (
      specs.some(
        (s) =>
          s.testLines?.length || s.testNamePattern || s.testIds?.length || s.testTagsFilter?.length,
      )
    )
      this.receipt.filtered = true;
  }
  onTestModuleCollected(module) {
    this.receipt.files.push(fileEvidence(module.moduleId));
    for (const test of module.children.allTests())
      this.receipt.collected.push({ id: test.id, name: test.fullName, file: module.moduleId });
  }
  onTestCaseResult(test) {
    const result = test.result();
    this.receipt.completed.push({
      id: test.id,
      status: result.state,
      retry: test.diagnostic()?.retryCount || 0,
      expectedFailure: !!test.options.fails,
    });
  }
  onTestRunEnd(modules, errors, reason) {
    this.receipt.errors.push(...errors.map((e) => String(e.message || e)));
    if (reason !== 'passed' || modules.some((m) => !m.ok()))
      this.receipt.errors.push(`Run ended ${reason}`);
    finishFrameworkReceipt(this.receipt);
  }
}
