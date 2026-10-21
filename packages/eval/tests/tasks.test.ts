import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildMemoryBlock, type LanguageModelFactory, type ModelConfig } from '@ikarmic/forge-core';

import { TASKS } from '../src/tasks/index.js';
import type { TaskDefinition } from '../src/graders/index.js';
import { runTask } from '../src/runner.js';

import { MockLanguageModelV1, type MockResponse } from './mock-provider.js';

const MODEL: ModelConfig = { provider: 'openai', model: 'mock' };

/**
 * Run a task with a queue of scripted mock responses. Each entry is consumed
 * by one agent iteration. A test passes if the task's graders all agree.
 */
async function runWithScript(task: TaskDefinition, responses: MockResponse[]): Promise<{
  passed: boolean;
  failedGraders: string[];
}> {
  const model = new MockLanguageModelV1();
  model.pushResponses(responses);
  const modelFactory: LanguageModelFactory = () => model as unknown as ReturnType<LanguageModelFactory>;
  const result = await runTask(task, MODEL, { modelFactory });
  return {
    passed: result.passed,
    failedGraders: result.graderResults.filter((g) => !g.passed).map((g) => g.message),
  };
}

describe('task catalog', () => {
  it('exports 11 tasks', () => {
    expect(TASKS.length).toBe(11);
  });

  it('every task has the required shape', () => {
    const ids = new Set<string>();
    for (const t of TASKS) {
      expect(t.id).toMatch(/^[a-z0-9-]+$/);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.task.length).toBeGreaterThan(0);
      expect(t.graders.length).toBeGreaterThan(0);
      expect(['read', 'edit', 'multi-step']).toContain(t.category);
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
    }
  });

  it('covers all three categories', () => {
    const cats = new Set(TASKS.map((t) => t.category));
    expect(cats.has('read')).toBe(true);
    expect(cats.has('edit')).toBe(true);
    expect(cats.has('multi-step')).toBe(true);
  });
});

describe('memory-recall-relevant', () => {
  const task = TASKS.find((t) => t.id === 'memory-recall-relevant')!;

  async function withFixture<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
    const cwd = await mkdtemp(join(tmpdir(), 'forge-eval-memtest-'));
    const prev = process.env.FORGE_GLOBAL_MEMORY_DIR;
    process.env.FORGE_GLOBAL_MEMORY_DIR = join(cwd, 'no-global');
    try {
      await task.setup!(cwd);
      return await fn(cwd);
    } finally {
      if (prev === undefined) delete process.env.FORGE_GLOBAL_MEMORY_DIR;
      else process.env.FORGE_GLOBAL_MEMORY_DIR = prev;
      await rm(cwd, { recursive: true, force: true });
    }
  }

  it('is the only task that opts into memory', () => {
    expect(task).toBeDefined();
    expect(TASKS.filter((t) => t.memory === true).map((t) => t.id)).toEqual(['memory-recall-relevant']);
  });

  it('has a fixture with 12+ sections, a correction, and a section whose ref is gone', async () => {
    await withFixture(async (cwd) => {
      const text = await readFile(join(cwd, '.forge', 'MEMORY.md'), 'utf8');
      expect(text.match(/^## /gm)!.length).toBeGreaterThanOrEqual(12);
      expect(text).toContain('type=correction');
      expect(text).toContain('refs=src/legacy/api.ts');
      await expect(readFile(join(cwd, 'src', 'legacy', 'api.ts'))).rejects.toThrow();
    });
  });

  it('reaches the model as index + the pnpm correction + the stale marker', async () => {
    await withFixture(async (cwd) => {
      const block = await buildMemoryBlock(cwd, undefined, { task: task.task });
      expect(block).toContain('## Memory index');
      expect(block).toContain('Use pnpm, never npm');
      expect(block).toContain('(possibly stale: src/legacy/api.ts no longer exists)');
    });
  });

  it('passes when the agent answers pnpm test, and memory_read works only because the task opted in', async () => {
    const model = new MockLanguageModelV1();
    model.pushResponses([{ toolCalls: [{ name: 'memory_read', args: {} }] }, { text: 'pnpm test' }]);
    const modelFactory: LanguageModelFactory = () => model as unknown as ReturnType<LanguageModelFactory>;
    const result = await runTask(task, MODEL, { modelFactory });
    expect(result.passed).toBe(true);
    const read = result.toolInvocations.find((t) => t.name === 'memory_read');
    expect(read?.isError).toBe(false);
  });

  it('fails an answer that says npm test', async () => {
    const r = await runWithScript(task, [{ text: 'npm test' }]);
    expect(r.passed).toBe(false);
  });
});

describe('read tasks', () => {
  it('read-list-typescript-files passes with list_files + .ts mention', async () => {
    const r = await runWithScript(TASKS[0]!, [
      { toolCalls: [{ name: 'list_files', args: { path: '.' } }] },
      { text: 'I found a.ts and b.ts — two TypeScript files in the root.' },
    ]);
    expect(r.passed).toBe(true);
  });

  it('read-package-version passes with read_file + version reply', async () => {
    const r = await runWithScript(TASKS[1]!, [
      { toolCalls: [{ name: 'read_file', args: { path: 'package.json' } }] },
      { text: '4.2.1' },
    ]);
    expect(r.passed).toBe(true);
  });

  it('read-search-todos passes with search_files + filenames in reply', async () => {
    const r = await runWithScript(TASKS[2]!, [
      { toolCalls: [{ name: 'search_files', args: { pattern: 'TODO', path: '.' } }] },
      { text: 'Found TODO comments in alpha.ts and beta.ts.' },
    ]);
    expect(r.passed).toBe(true);
  });
});

describe('edit tasks', () => {
  it('edit-write-hello passes with a single write_file', async () => {
    const r = await runWithScript(TASKS[3]!, [
      { toolCalls: [{ name: 'write_file', args: { path: 'hello.txt', content: 'Hello, Forge!' } }] },
      { text: 'Done. Created hello.txt.' },
    ]);
    expect(r.passed).toBe(true);
  });

  it('edit-replace-greeting passes with a precise edit_file call', async () => {
    const r = await runWithScript(TASKS[4]!, [
      { toolCalls: [
        { name: 'edit_file', args: { path: 'greeting.txt', old_text: 'Hello', new_text: 'Bonjour' } },
      ] },
      { text: 'Done. Replaced Hello with Bonjour.' },
    ]);
    expect(r.passed).toBe(true);
  });

  it('edit-remove-section passes with a JSON edit that drops the stale key', async () => {
    const r = await runWithScript(TASKS[5]!, [
      { toolCalls: [
        {
          name: 'edit_file',
          args: {
            path: 'config.json',
            old_text: ',\n  "stale": {\n    "value": "old",\n    "note": "remove me"\n  }',
            new_text: '',
            replace_all: false,
          },
        },
      ] },
      { text: 'Done. Removed the stale key.' },
    ]);
    expect(r.passed).toBe(true);
  });

  it('edit-rename-symbol passes with search + edit_file per file', async () => {
    const r = await runWithScript(TASKS[6]!, [
      { toolCalls: [{ name: 'search_files', args: { pattern: 'foo', path: '.' } }] },
      { toolCalls: [
        { name: 'edit_file', args: { path: 'a.ts', old_text: 'foo', new_text: 'bar', replace_all: true } },
        { name: 'edit_file', args: { path: 'b.ts', old_text: 'foo', new_text: 'bar', replace_all: true } },
      ] },
      { text: 'Done. Renamed foo to bar in a.ts and b.ts.' },
    ]);
    expect(r.passed).toBe(true);
  });
});

describe('multi-step tasks', () => {
  it('multi-run-and-report passes with run_command + "4" in reply', async () => {
    const r = await runWithScript(TASKS[7]!, [
      { toolCalls: [{ name: 'run_command', args: { command: 'node -e "console.log(2 + 2)"' } }] },
      { text: 'The command printed 4.' },
    ]);
    expect(r.passed).toBe(true);
  });

  it('multi-refactor-move passes when greet is moved to b.ts and removed from a.ts', async () => {
    // The mock needs to:
    // 1) read a.ts to inspect it
    // 2) write b.ts containing the greet function
    // 3) edit a.ts to remove the greet function (leaving VERSION intact)
    // 4) reply "done"
    const r = await runWithScript(TASKS[8]!, [
      { toolCalls: [{ name: 'read_file', args: { path: 'a.ts' } }] },
      { toolCalls: [
        {
          name: 'write_file',
          args: {
            path: 'b.ts',
            content:
              "import { greet } from './a';\n" +
              "export function greet(name: string): string { return `Hello, ${name}!`; }\n" +
              "export const PLACEHOLDER = true;\n",
          },
        },
      ] },
      { toolCalls: [
        {
          name: 'edit_file',
          args: {
            path: 'a.ts',
            old_text: "export function greet(name: string): string { return `Hello, ${name}!`; }\n",
            new_text: '',
            replace_all: false,
          },
        },
      ] },
      { text: 'Done. Moved greet from a.ts to b.ts.' },
    ]);
    expect(r.passed).toBe(true);
  });

  it('multi-summarize-two-files passes when reply mentions both key facts', async () => {
    const r = await runWithScript(TASKS[9]!, [
      { toolCalls: [
        { name: 'read_file', args: { path: 'alpha.txt' } },
        { name: 'read_file', args: { path: 'beta.txt' } },
      ] },
      { text: 'Astra is the company-wide 2030 initiative to unify tools.' },
    ]);
    expect(r.passed).toBe(true);
  });
});
