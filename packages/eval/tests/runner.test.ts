import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LanguageModelFactory, ModelConfig } from '@ikarmic/forge-core';

import { completed, fileExists, regex, toolWasCalled } from '../src/graders/index.js';
import type { TaskDefinition } from '../src/graders/index.js';
import { runSuite, runTask } from '../src/runner.js';

/**
 * In-process mock model for runner tests. We don't need the full AI SDK
 * protocol here — we just need to confirm the runner wires up the agent,
 * passes events through, and applies graders.
 *
 * This mock returns "hello world" on every call. To exercise the tool-call
 * path, see `tasks.test.ts` which uses the core's MockLanguageModelV1.
 */
import { MockLanguageModelV1 } from './mock-provider.js';

const MODEL: ModelConfig = { provider: 'openai', model: 'mock' };

let model: MockLanguageModelV1;
let modelFactory: LanguageModelFactory;

beforeEach(() => {
  model = new MockLanguageModelV1('mock-eval');
  modelFactory = () => model as unknown as ReturnType<LanguageModelFactory>;
});

afterEach(() => {
  // mock holds no resources; nothing to clean.
});

describe('runTask', () => {
  it('creates an isolated cwd, runs setup, and cleans up', async () => {
    const created: string[] = [];
    const task: TaskDefinition = {
      id: 'cleanup-test',
      name: 'Cleanup',
      category: 'read',
      description: '',
      task: 'noop',
      setup: async (cwd) => {
        await writeFile(join(cwd, 'marker.txt'), 'hi', 'utf8');
        created.push(cwd);
      },
      graders: [fileExists('marker.txt')],
    };

    model.pushResponse({ text: 'done' });

    const result = await runTask(task, MODEL, { modelFactory });
    expect(result.passed).toBe(true);
    expect(created.length).toBe(1);
    // After runTask returns, the temp dir should be cleaned up.
    expect(existsSync(created[0]!)).toBe(false);
  });

  it('passes when grader matches', async () => {
    model.pushResponse({ text: 'The answer is 42.' });
    const task: TaskDefinition = {
      id: 't',
      name: 't',
      category: 'read',
      description: '',
      task: 'say 42',
      graders: [completed(), regex(/\b42\b/)],
    };
    const result = await runTask(task, MODEL, { modelFactory });
    expect(result.passed).toBe(true);
    expect(result.graderResults.length).toBe(2);
    expect(result.graderResults.every((g) => g.passed)).toBe(true);
  });

  it('fails when grader does not match', async () => {
    model.pushResponse({ text: 'something else entirely' });
    const task: TaskDefinition = {
      id: 't',
      name: 't',
      category: 'read',
      description: '',
      task: 'say 42',
      graders: [completed(), regex(/\b42\b/)],
    };
    const result = await runTask(task, MODEL, { modelFactory });
    expect(result.passed).toBe(false);
    expect(result.graderResults.filter((g) => !g.passed).length).toBe(1);
  });

  it('honors an explicit cwd and does not delete it', async () => {
    const explicitCwd = join(tmpdir(), `forge-eval-explicit-${Date.now()}`);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(explicitCwd, { recursive: true });
    await writeFile(join(explicitCwd, 'pre.txt'), 'preset', 'utf8');

    model.pushResponse({ text: 'ok' });
    const task: TaskDefinition = {
      id: 't',
      name: 't',
      category: 'read',
      description: '',
      task: 'noop',
      graders: [fileExists('pre.txt')],
    };
    const result = await runTask(task, MODEL, { cwd: explicitCwd, modelFactory });
    expect(result.passed).toBe(true);
    // Explicit cwd was preserved.
    expect(result.cwd).toBe(explicitCwd);
    expect(readFileSync(join(explicitCwd, 'pre.txt'), 'utf8')).toBe('preset');
  });

  it('captures tool invocations from events', async () => {
    model.pushResponses([
      {
        toolCalls: [{ name: 'read_file', args: { path: 'a.txt' } }],
      },
      { text: 'read it' },
    ]);
    const task: TaskDefinition = {
      id: 't',
      name: 't',
      category: 'read',
      description: '',
      task: 'read a.txt',
      graders: [completed(), toolWasCalled('read_file')],
    };
    const result = await runTask(task, MODEL, { modelFactory });
    expect(result.passed).toBe(true);
    expect(result.toolInvocations.length).toBe(1);
    expect(result.toolInvocations[0]!.name).toBe('read_file');
  });

  it('reports a setup failure as an errored run', async () => {
    const task: TaskDefinition = {
      id: 'boom',
      name: 'boom',
      category: 'edit',
      description: '',
      task: 'noop',
      setup: () => {
        throw new Error('setup blew up');
      },
      graders: [],
    };
    const result = await runTask(task, MODEL, { modelFactory });
    expect(result.passed).toBe(false);
    expect(result.error).toContain('setup blew up');
  });
});

describe('runSuite', () => {
  it('aggregates pass/fail counts and durations', async () => {
    model.pushResponse({ text: '42' });
    model.pushResponse({ text: 'something else' });

    const tasks: TaskDefinition[] = [
      {
        id: 'a',
        name: 'a',
        category: 'read',
        description: '',
        task: 'say 42',
        graders: [completed(), regex(/42/)],
      },
      {
        id: 'b',
        name: 'b',
        category: 'read',
        description: '',
        task: 'say 42',
        graders: [completed(), regex(/42/)],
      },
    ];

    const suite = await runSuite(tasks, MODEL, { modelFactory });
    expect(suite.summary.total).toBe(2);
    expect(suite.summary.passed).toBe(1);
    expect(suite.summary.failed).toBe(1);
    expect(suite.summary.passRate).toBe(0.5);
    expect(suite.summary.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns an empty suite for an empty task list', async () => {
    const suite = await runSuite([], MODEL, { modelFactory });
    expect(suite.summary.total).toBe(0);
    expect(suite.results).toEqual([]);
  });
});
