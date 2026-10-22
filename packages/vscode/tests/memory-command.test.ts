import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runMemoryCommand } from '../src/chat/memory-command.js';

async function setup() {
  const cwd = await mkdtemp(join(tmpdir(), 'memcmd-'));
  const said: string[] = [];
  let opened = 0;
  const deps = { cwd, open: async () => void opened++, say: (t: string) => void said.push(t) };
  return { cwd, said, deps, opened: () => opened, file: () => readFile(join(cwd, '.forge', 'MEMORY.md'), 'utf8') };
}

describe('runMemoryCommand', () => {
  it('no arguments opens the memory file', async () => {
    const s = await setup();
    await runMemoryCommand('', s.deps);
    expect(s.opened()).toBe(1);
  });

  it('add writes a section to the project memory and confirms', async () => {
    const s = await setup();
    await runMemoryCommand('add always run pnpm lint before committing', s.deps);
    const text = await s.file();
    expect(text).toContain('## Note: always run pnpm lint before committing');
    expect(text).toContain('always run pnpm lint before committing');
    expect(s.said[0]).toContain('Saved');
  });

  it('add with no text says how to use it and writes nothing', async () => {
    const s = await setup();
    await runMemoryCommand('add   ', s.deps);
    expect(s.said[0]).toContain('/memory add');
    await expect(s.file()).rejects.toThrow();
  });

  it('list shows the headings, or says there is no memory yet', async () => {
    const s = await setup();
    await runMemoryCommand('list', s.deps);
    expect(s.said[0]).toMatch(/no project memory/i);
    await runMemoryCommand('add use tabs', s.deps);
    await runMemoryCommand('list', s.deps);
    expect(s.said[s.said.length - 1]).toContain('Note: use tabs');
  });

  it('forget removes a section by heading, case and spacing ignored, and reports a miss', async () => {
    const s = await setup();
    await runMemoryCommand('add use tabs', s.deps);
    await runMemoryCommand('forget note:  USE tabs', s.deps);
    expect(await s.file()).not.toContain('use tabs');
    expect(s.said[s.said.length - 1]).toContain('Forgot');
    await runMemoryCommand('forget nothing here', s.deps);
    expect(s.said[s.said.length - 1]).toContain('No memory section');
  });

  it('an unknown subcommand lists the choices', async () => {
    const s = await setup();
    await runMemoryCommand('dance', s.deps);
    expect(s.said[0]).toContain('add');
    expect(s.said[0]).toContain('forget');
  });
});
