import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAiCommentHandler } from '../src/commands/ai-comments.js';
import { parseOptions } from '../src/options.js';

const argv = (...a: string[]) => ['node', 'forge', ...a];

describe('group E flags', () => {
  it('are off by default', () => {
    const o = parseOptions(argv('task')).options;
    expect([o.noProjectInstructions, o.aiComments]).toEqual([false, false]);
  });

  it('parse', () => {
    const o = parseOptions(argv('--no-project-instructions', '--ai-comments', 'task')).options;
    expect([o.noProjectInstructions, o.aiComments]).toEqual([true, true]);
  });
});

describe('AI comment handler', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'forge-ai-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('runs the agent for AI! and AI? but not for plain notes', async () => {
    writeFileSync(path.join(dir, 'a.ts'), 'const a = 1; // AI! rename a\n');
    writeFileSync(path.join(dir, 'b.ts'), '# AI? why\n');
    writeFileSync(path.join(dir, 'c.ts'), '// AI just a note\n');
    const calls: Array<[string, string]> = [];
    const logs: string[] = [];
    const handle = createAiCommentHandler({
      cwd: dir,
      run: async (task, mode) => {
        calls.push([mode, task]);
        return 'done';
      },
      log: (l) => logs.push(l),
    });
    await handle('a.ts');
    await handle('b.ts');
    await handle('c.ts');
    await handle('missing.ts');
    expect(calls.map((c) => c[0])).toEqual(['change', 'question']);
    expect(calls[0]![1]).toContain('a.ts');
    expect(logs.join('\n')).toContain('done');
  });

  it('ignores saves that arrive while a run is in flight', async () => {
    writeFileSync(path.join(dir, 'a.ts'), '// AI! go\n');
    let release!: () => void;
    let runs = 0;
    const handle = createAiCommentHandler({
      cwd: dir,
      run: () => {
        runs++;
        return new Promise<string>((r) => (release = () => r('')));
      },
      log: () => {},
    });
    const first = handle('a.ts');
    // Wait until the first run has really started (not a fixed sleep: a loaded machine needs longer).
    for (let waited = 0; runs === 0 && waited < 5000; waited += 10) await new Promise((r) => setTimeout(r, 10));
    expect(runs).toBe(1);
    await handle('a.ts');
    release();
    await first;
    expect(runs).toBe(1);
  });
});
