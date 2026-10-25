import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getSpecialist, type LanguageModelFactory, type ModelConfig } from '@ikarmic/forge-core';

import { regexAbsent } from '../src/graders/index.js';
import type { GraderContext, TaskDefinition } from '../src/graders/index.js';
import { runTask } from '../src/runner.js';
import { citesLine } from '../src/tasks/agents.fixtures.js';
import { DEFAULT_TASKS, TASKS } from '../src/tasks/index.js';

import { MockLanguageModelV1 } from './mock-provider.js';

const MODEL: ModelConfig = { provider: 'openai', model: 'mock' };

function mockWith(...responses: Parameters<MockLanguageModelV1['pushResponse']>[0][]) {
  const model = new MockLanguageModelV1('mock');
  model.pushResponses(responses);
  // This mock records nothing, so keep the first prompt it is sent.
  const sent: { first?: unknown } = {};
  for (const method of ['doStream', 'doGenerate'] as const) {
    const original = (model[method] as (o: { prompt: unknown }) => Promise<unknown>).bind(model);
    (model as unknown as Record<string, unknown>)[method] = (o: { prompt: unknown }) => {
      sent.first ??= o.prompt;
      return original(o);
    };
  }
  const modelFactory: LanguageModelFactory = () => model as unknown as ReturnType<LanguageModelFactory>;
  return { model, modelFactory, sent };
}

describe('a task run as a built-in agent', () => {
  it("uses the agent's prompt and refuses tools outside its list", async () => {
    const { modelFactory, sent } = mockWith(
      { toolCalls: [{ name: 'write_file', args: { path: 'out.txt', content: 'x' } }] },
      { text: 'done', finishReason: 'stop' }
    );
    let cwdSeen = '';
    const task: TaskDefinition = {
      id: 't-ask',
      name: 'ask',
      category: 'agents',
      description: 'd',
      task: 'write out.txt',
      specialist: 'ask',
      graders: [(ctx) => ((cwdSeen = ctx.cwd), { passed: !existsSync(join(ctx.cwd, 'out.txt')), message: 'no file' })],
    };
    const result = await runTask(task, MODEL, { modelFactory });
    expect(result.passed).toBe(true);
    expect(cwdSeen).not.toBe('');
    const system = JSON.stringify((sent.first as Array<{ role: string; content: unknown }>)[0]);
    expect(system).toContain(JSON.stringify(getSpecialist('ask')!.systemPrompt).slice(1, 60));
  });

  it('fails a task that names an agent that does not exist', async () => {
    const { modelFactory } = mockWith({ text: 'done', finishReason: 'stop' });
    const task: TaskDefinition = { id: 't-nope', name: 'n', category: 'agents', description: 'd', task: 'x', specialist: 'nope', graders: [] };
    const result = await runTask(task, MODEL, { modelFactory });
    expect(result.passed).toBe(false);
    expect(result.error).toContain('unknown specialist "nope"');
  });
});

describe('citesLine', () => {
  it('accepts the ways a reply names a file and line', () => {
    for (const text of ['src/config.js:7', '`src/config.js` at line 7', 'config.js, line 7', 'line 7 of `config.js`', '**`src/config.js` (line 7)**']) {
      expect(citesLine('config.js', 7).test(text), text).toBe(true);
    }
  });
  it('does not accept another line or another file', () => {
    for (const text of ['config.js:17', 'config.js line 70', 'server.js:7', 'line 7 of server.js']) {
      expect(citesLine('config.js', 7).test(text), text).toBe(false);
    }
  });
});

describe('regexAbsent', () => {
  const ctx = (finalText: string) => ({ result: { finalText } }) as unknown as GraderContext;
  it('passes when the text does not match, fails when it does', async () => {
    expect((await regexAbsent(/BLOCKING/)(ctx('all good'))).passed).toBe(true);
    expect((await regexAbsent(/BLOCKING/)(ctx('BLOCKING: x'))).passed).toBe(false);
  });
});

describe('the agent tasks', () => {
  const agentTasks = TASKS.filter((t) => t.category === 'agents');

  it('cover every built-in agent, Security included', () => {
    const ids = new Set(agentTasks.map((t) => t.specialist));
    for (const id of ['plan', 'code', 'debug', 'ask', 'review', 'security']) expect(ids.has(id), id).toBe(true);
    expect(agentTasks.map((t) => t.id).sort()).toEqual([
      'agents-ask-deep-chain',
      'agents-ask-traced',
      'agents-ask-where',
      'agents-code-fix',
      'agents-code-installed-api',
      'agents-code-many-files',
      'agents-code-remembered-api',
      'agents-debug-indirect',
      'agents-debug-off-by-one',
      'agents-plan-callers',
      'agents-plan-feature',
      'agents-review-planted-bug',
      'agents-security-find',
      'agents-security-no-fix',
    ]);
  });

  it('are tagged agents (or agents-hard) and with their agent', () => {
    for (const t of agentTasks) expect([['agents', t.specialist], ['agents-hard', t.specialist]], t.id).toContainEqual(t.tags);
  });

  it('build their fixtures without throwing', async () => {
    for (const t of agentTasks) {
      const dir = await mkdtemp(join(tmpdir(), `forge-eval-fixture-${t.id}-`));
      try {
        await t.setup?.(dir);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });
});

describe('the default run', () => {
  it('leaves the agent tasks out: they are opt-in with --tag, so the nightly run keeps its size', () => {
    expect(DEFAULT_TASKS.some((t) => t.category === 'agents')).toBe(false);
    expect(DEFAULT_TASKS).toHaveLength(TASKS.filter((t) => t.category !== 'agents').length);
    expect(DEFAULT_TASKS.length).toBeGreaterThan(0);
  });
});
