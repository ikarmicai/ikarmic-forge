import type { SuiteRunResult, TaskRunResult } from './runner.js';

/** Pretty-print a model identifier the same way the CLI does it. */
function modelLabel(model: { provider: string; model: string }): string {
  return `${model.provider}/${model.model}`;
}

/** Render a human-friendly markdown table for a suite run. */
export function formatMarkdownReport(suite: SuiteRunResult): string {
  const lines: string[] = [];
  lines.push(`# Forge eval: ${modelLabel(suite.model)}`);
  lines.push('');
  lines.push(`Started:  ${suite.startedAt}`);
  lines.push(`Finished: ${suite.finishedAt}`);
  lines.push('');
  lines.push(
    `**${suite.summary.passed}/${suite.summary.total}** tasks passed ` +
      `(${pct(suite.summary.passRate)}%) in ${(suite.summary.totalDurationMs / 1000).toFixed(1)}s.`
  );
  if (suite.summary.totalCostUsd > 0) {
    lines.push(`Total cost: $${suite.summary.totalCostUsd.toFixed(4)}`);
  }
  lines.push('');

  // Per-task table.
  lines.push('| # | Task | Category | Result | Duration | Graders |');
  lines.push('|---|------|----------|--------|----------|---------|');
  for (const [i, r] of suite.results.entries()) {
    const idx = String(i + 1).padStart(2, ' ');
    const result = r.error
      ? `error: ${truncate(r.error, 40)}`
      : r.passed
        ? 'pass'
        : `fail (${r.graderResults.filter((g) => !g.passed).length}/${r.graderResults.length})`;
    const dur = `${(r.durationMs / 1000).toFixed(1)}s`;
    const passedCount = r.graderResults.filter((g) => g.passed).length;
    const graderStr = r.graderResults.length === 0 ? '-' : `${passedCount}/${r.graderResults.length}`;
    lines.push(
      `| ${idx} | ${r.task.id} | ${r.task.category} | ${result} | ${dur} | ${graderStr} |`
    );
  }
  lines.push('');

  // Failing-task detail blocks: only the ones worth reading.
  for (const r of suite.results) {
    if (r.passed && !r.error) continue;
    lines.push(`## ${r.task.id}: ${r.task.name}`);
    if (r.error) {
      lines.push('');
      lines.push(`Run error: \`${r.error}\``);
      lines.push('');
      continue;
    }
    lines.push('');
    lines.push(`Reason: \`${r.agentResult.reason}\` · iterations: ${r.agentResult.iterations}`);
    lines.push('');
    lines.push('Graders:');
    lines.push('');
    for (const [i, g] of r.graderResults.entries()) {
      const mark = g.passed ? '✓' : '✗';
      lines.push(`- ${mark} **[${i + 1}]** ${g.message}`);
      if (!g.passed && g.details) {
        for (const dl of g.details.split('\n')) lines.push(`  ${dl}`);
      }
    }
    lines.push('');
    lines.push('<details><summary>Final text</summary>');
    lines.push('');
    lines.push('```');
    lines.push(truncate(r.agentResult.finalText, 1200));
    lines.push('```');
    lines.push('</details>');
    lines.push('');
  }

  return lines.join('\n');
}

/** Render a compact single-line summary for the terminal. */
export function formatTerminalSummary(suite: SuiteRunResult): string {
  const s = suite.summary;
  const lines = [
    `forge-eval: ${s.passed}/${s.total} passed (${pct(s.passRate)}%) in ${(s.totalDurationMs / 1000).toFixed(1)}s`,
    `  model: ${modelLabel(suite.model)}`,
  ];
  if (s.totalCostUsd > 0) {
    lines.push(`  cost:  $${s.totalCostUsd.toFixed(4)}`);
  }
  for (const r of suite.results) {
    const mark = r.passed ? '✓' : '✗';
    const dur = `${(r.durationMs / 1000).toFixed(1)}s`.padStart(6, ' ');
    lines.push(`  ${mark} ${r.task.id.padEnd(34, ' ')} ${dur}`);
  }
  return lines.join('\n');
}

/** JSON shape: stable, machine-readable, includes everything graders saw. */
export interface JsonReport {
  model: { provider: string; model: string };
  startedAt: string;
  finishedAt: string;
  summary: SuiteRunResult['summary'];
  tasks: Array<{
    id: string;
    name: string;
    category: string;
    passed: boolean;
    durationMs: number;
    iterations: number;
    reason: string;
    graderResults: Array<{ passed: boolean; message: string; details?: string }>;
    toolInvocations: Array<{ name: string; args: unknown; isError: boolean }>;
    finalText: string;
    error?: string;
  }>;
}

export function formatJsonReport(suite: SuiteRunResult): JsonReport {
  return {
    model: suite.model,
    startedAt: suite.startedAt,
    finishedAt: suite.finishedAt,
    summary: suite.summary,
    tasks: suite.results.map((r) => ({
      id: r.task.id,
      name: r.task.name,
      category: r.task.category,
      passed: r.passed,
      durationMs: r.durationMs,
      iterations: r.agentResult.iterations,
      reason: r.agentResult.reason,
      graderResults: r.graderResults,
      toolInvocations: r.toolInvocations.map((t) => ({
        name: t.name,
        args: t.args,
        isError: t.isError,
      })),
      finalText: r.agentResult.finalText,
      ...(r.error ? { error: r.error } : {}),
    })),
  };
}

function pct(rate: number): string {
  return (rate * 100).toFixed(0);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

// Suppress an unused-import warning for TaskRunResult: we expose it via
// the SuiteRunResult shape.
export type { TaskRunResult };
