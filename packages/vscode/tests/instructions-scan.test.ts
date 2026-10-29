import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { INSTRUCTION_STARTER, createInstructionFile, scanInstructionFiles } from '../src/settings/instructions-scan.js';

/** Works in a folder made for the test; it never reads the real workspace or ~/.forge (RB-4). */
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'forge-instr-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const view = async () => Object.fromEntries((await scanInstructionFiles(root)).map((f) => [f.name, f]));

describe('scanInstructionFiles', () => {
  it('lists the three files Forge reads, in the order it reads them, each missing in an empty folder', async () => {
    const files = await scanInstructionFiles(root);
    expect(files.map((f) => f.name)).toEqual(['AGENTS.md', 'CLAUDE.md', 'CONVENTIONS.md']);
    expect(files.every((f) => f.state === 'missing' && f.chars === 0 && !f.cut)).toBe(true);
  });

  it('says a file with text is used, with its length, and a file with only blank space is empty', async () => {
    await writeFile(path.join(root, 'AGENTS.md'), '  Run npm test before you finish.  \n');
    await writeFile(path.join(root, 'CLAUDE.md'), ' \n\n ');
    const v = await view();
    expect(v['AGENTS.md']).toMatchObject({ state: 'used', chars: 'Run npm test before you finish.'.length, cut: false });
    expect(v['CLAUDE.md']).toMatchObject({ state: 'empty', chars: 0 });
    expect(v['CONVENTIONS.md']).toMatchObject({ state: 'missing' });
  });

  it('says when a file is longer than Forge reads, so the person can shorten it', async () => {
    await writeFile(path.join(root, 'AGENTS.md'), 'x'.repeat(20_000));
    await writeFile(path.join(root, 'CLAUDE.md'), 'y'.repeat(100));
    const v = await view();
    expect(v['AGENTS.md']).toMatchObject({ state: 'used', cut: true });
    expect(v['CLAUDE.md']).toMatchObject({ state: 'used', cut: false });
  });

  it('does not read a file far larger than any instruction file just to count it', async () => {
    await writeFile(path.join(root, 'AGENTS.md'), 'z'.repeat(2_000_000));
    const v = await view();
    expect(v['AGENTS.md']).toMatchObject({ state: 'used', cut: true });
  });
});

describe('createInstructionFile', () => {
  it('writes a short starter that has words to replace, and says it created it', async () => {
    expect(await createInstructionFile(root, 'AGENTS.md')).toBe('created');
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe(INSTRUCTION_STARTER);
    expect(INSTRUCTION_STARTER.length).toBeLessThan(800);
  });

  it('never overwrites a file that is already there, whatever is in it', async () => {
    await writeFile(path.join(root, 'AGENTS.md'), 'my own notes');
    expect(await createInstructionFile(root, 'AGENTS.md')).toBe('exists');
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe('my own notes');
  });

  it('only creates the three names Forge reads', async () => {
    for (const bad of ['../AGENTS.md', 'notes.md', 'sub/AGENTS.md', 'agents.md.bak', '']) {
      await expect(createInstructionFile(root, bad), bad).rejects.toThrow();
    }
  });
});

describe('the length limit', () => {
  it('is the length core cuts each file at (a guard against the two drifting apart)', async () => {
    const { buildProjectInstructionsBlock } = await import('@ikarmic/forge-core');
    const { INSTRUCTION_READ_LIMIT } = await import('../src/settings/instructions-scan.js');
    await writeFile(path.join(root, 'AGENTS.md'), 'a'.repeat(INSTRUCTION_READ_LIMIT));
    expect(await buildProjectInstructionsBlock(root)).not.toContain('…(truncated)');
    await writeFile(path.join(root, 'AGENTS.md'), 'a'.repeat(INSTRUCTION_READ_LIMIT + 1));
    expect(await buildProjectInstructionsBlock(root)).toContain('…(truncated)');
  });
});
