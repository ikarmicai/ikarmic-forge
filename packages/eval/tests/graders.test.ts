import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import type { AgentRunResult } from '@ikarmic/forge-core';

import {
  commandRuns,
  completed,
  contains,
  directoryHas,
  equals,
  fileExists,
  fileMatches,
  fileMissing,
  finalTextNonEmpty,
  regex,
  toolNotCalled,
  toolWasCalled,
} from '../src/graders/index.js';
import type { GraderContext, ToolInvocation } from '../src/graders/index.js';

/**
 * Build a synthetic GraderContext for unit tests. We only need the fields
 * each grader actually reads; everything else gets a stand-in.
 */
function makeCtx(overrides: Partial<GraderContext> = {}): GraderContext {
  const cwd = overrides.cwd ?? process.cwd();
  const result: AgentRunResult = overrides.result ?? {
    finalText: '',
    iterations: 1,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    reason: 'completed',
    costUsd: 0,
    costKnown: false,
    messages: [],
    ...(overrides.result ?? {}),
  };
  return {
    cwd,
    task: overrides.task ?? {
      id: 't',
      name: 'T',
      category: 'read',
      description: 'd',
    },
    result,
    toolInvocations: overrides.toolInvocations ?? [],
  };
}

describe('regex grader', () => {
  it('passes when finalText matches', async () => {
    const r = await regex(/version \d+\.\d+\.\d+/)(
      makeCtx({ result: { ...makeCtx().result, finalText: 'Package version 4.2.1 released today.' } })
    );
    expect(r.passed).toBe(true);
  });

  it('fails when finalText does not match', async () => {
    const r = await regex(/version \d+\.\d+\.\d+/)(
      makeCtx({ result: { ...makeCtx().result, finalText: 'no version here' } })
    );
    expect(r.passed).toBe(false);
  });

  it('honors case-insensitive flag', async () => {
    const r = await regex(/VERSION/i)(
      makeCtx({ result: { ...makeCtx().result, finalText: 'the version is 1.0.0' } })
    );
    expect(r.passed).toBe(true);
  });
});

describe('contains grader', () => {
  it('passes when substring is present', () => {
    const r = contains('Astra')(makeCtx({ result: { ...makeCtx().result, finalText: 'Project Astra 2030' } }));
    expect(r.passed).toBe(true);
  });

  it('fails when substring is missing', () => {
    const r = contains('Nope')(makeCtx({ result: { ...makeCtx().result, finalText: 'Astra 2030' } }));
    expect(r.passed).toBe(false);
  });
});

describe('equals grader', () => {
  it('passes on exact match (modulo trim)', () => {
    const r = equals('1.2.3')(
      makeCtx({ result: { ...makeCtx().result, finalText: '  1.2.3  ' } })
    );
    expect(r.passed).toBe(true);
  });

  it('fails on content mismatch with diff in details', () => {
    const r = equals('1.2.3')(makeCtx({ result: { ...makeCtx().result, finalText: '1.2.4' } }));
    expect(r.passed).toBe(false);
    expect(r.details).toContain('expected');
    expect(r.details).toContain('actual');
  });
});

describe('fs graders', () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'forge-eval-graders-'));
    await writeFile(join(cwd, 'present.txt'), 'PRESENT', 'utf8');
    await writeFile(join(cwd, 'data.json'), '{"k":"v","stale":"x"}', 'utf8');
    await mkdir(join(cwd, 'sub'), { recursive: true });
    await writeFile(join(cwd, 'sub', 'one.txt'), 'one');
    await writeFile(join(cwd, 'sub', 'two.txt'), 'two');
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it('fileExists passes when file is present', async () => {
    const r = await fileExists('present.txt')(makeCtx({ cwd }));
    expect(r.passed).toBe(true);
  });

  it('fileExists fails when file is absent', async () => {
    const r = await fileExists('nope.txt')(makeCtx({ cwd }));
    expect(r.passed).toBe(false);
  });

  it('fileExists rejects paths that escape cwd', async () => {
    const r = await fileExists('../escape.txt')(makeCtx({ cwd }));
    expect(r.passed).toBe(false);
    expect(r.message).toMatch(/escaped/);
  });

  it('fileMissing passes when file is absent', async () => {
    const r = await fileMissing('nope.txt')(makeCtx({ cwd }));
    expect(r.passed).toBe(true);
  });

  it('fileMissing fails when file is present', async () => {
    const r = await fileMissing('present.txt')(makeCtx({ cwd }));
    expect(r.passed).toBe(false);
  });

  it('fileMatches substring', async () => {
    const r = await fileMatches('present.txt', 'PRESENT')(makeCtx({ cwd }));
    expect(r.passed).toBe(true);
  });

  it('fileMatches regex', async () => {
    const r = await fileMatches('data.json', /"k":\s*"v"/)(makeCtx({ cwd }));
    expect(r.passed).toBe(true);
  });

  it('fileMatches equality', async () => {
    const r = await fileMatches('present.txt', { equals: 'PRESENT' })(makeCtx({ cwd }));
    expect(r.passed).toBe(true);
  });

  it('directoryHas counts entries', async () => {
    const r = await directoryHas('sub', 2)(makeCtx({ cwd }));
    expect(r.passed).toBe(true);
  });

  it('directoryHas fails on low count', async () => {
    const r = await directoryHas('sub', 5)(makeCtx({ cwd }));
    expect(r.passed).toBe(false);
  });
});

describe('commandRuns grader', () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'forge-eval-shell-'));
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it('passes when command exits 0 and output matches', async () => {
    const r = await commandRuns({ command: ['node', '-e', "console.log('hello')"], contains: 'hello' })(
      makeCtx({ cwd })
    );
    expect(r.passed).toBe(true);
  });

  it('fails when output does not match', async () => {
    const r = await commandRuns({ command: ['node', '-e', "console.log('hello')"], contains: 'goodbye' })(
      makeCtx({ cwd })
    );
    expect(r.passed).toBe(false);
  });

  it('fails when command exits non-zero', async () => {
    const r = await commandRuns({ command: ['node', '-e', "process.exit(1)"] })(makeCtx({ cwd }));
    expect(r.passed).toBe(false);
  });
});

describe('behavior graders', () => {
  const toolCalls: ToolInvocation[] = [
    { name: 'read_file', args: { path: 'a.ts' }, result: 'content', isError: false },
    { name: 'write_file', args: { path: 'b.ts', content: '...' }, result: 'ok', isError: false },
  ];

  it('toolWasCalled passes when count >= min', () => {
    const r = toolWasCalled('read_file')(makeCtx({ toolInvocations: toolCalls }));
    expect(r.passed).toBe(true);
  });

  it('toolWasCalled fails when count < min', () => {
    const r = toolWasCalled('read_file', 5)(makeCtx({ toolInvocations: toolCalls }));
    expect(r.passed).toBe(false);
  });

  it('toolNotCalled passes when absent', () => {
    const r = toolNotCalled('edit_file')(makeCtx({ toolInvocations: toolCalls }));
    expect(r.passed).toBe(true);
  });

  it('toolNotCalled fails when present', () => {
    const r = toolNotCalled('read_file')(makeCtx({ toolInvocations: toolCalls }));
    expect(r.passed).toBe(false);
  });

  it('finalTextNonEmpty fails on empty', () => {
    const r = finalTextNonEmpty()(makeCtx({ result: { ...makeCtx().result, finalText: '   ' } }));
    expect(r.passed).toBe(false);
  });

  it('completed passes on reason=completed', () => {
    const r = completed()(makeCtx());
    expect(r.passed).toBe(true);
  });

  it('completed fails on reason=error', () => {
    const r = completed()(
      makeCtx({ result: { ...makeCtx().result, reason: 'error' as const } })
    );
    expect(r.passed).toBe(false);
  });
});
