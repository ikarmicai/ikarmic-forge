import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleMemoryCommand } from '../src/commands/memory.js';
import { parseOptions } from '../src/options.js';

const argv = (...a: string[]) => ['node', 'forge', ...a];

describe('forge memory parsing', () => {
  it('parses list, check and forget (with and without --global)', () => {
    expect(parseOptions(argv('memory', 'list')).memoryCommand).toEqual({ list: true });
    expect(parseOptions(argv('memory', 'check')).memoryCommand).toEqual({ check: true });
    expect(parseOptions(argv('memory', 'forget', 'Package', 'manager')).memoryCommand).toEqual({
      forget: { heading: 'Package manager', global: false },
    });
    expect(parseOptions(argv('memory', 'forget', 'Style', '--global')).memoryCommand).toEqual({
      forget: { heading: 'Style', global: true },
    });
  });

  it('is null for ordinary tasks', () => {
    expect(parseOptions(argv('fix the bug')).memoryCommand).toBeNull();
  });
});

describe('handleMemoryCommand', () => {
  let root: string;
  let project: string;
  let file: string;
  let prevGlobal: string | undefined;
  let out: string;
  let err: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'forge-memcli-'));
    project = path.join(root, 'proj');
    await mkdir(path.join(project, '.forge'), { recursive: true });
    await mkdir(path.join(project, 'src'), { recursive: true });
    await writeFile(path.join(project, 'src', 'here.ts'), 'x', 'utf8');
    file = path.join(project, '.forge', 'MEMORY.md');
    prevGlobal = process.env.FORGE_GLOBAL_MEMORY_DIR;
    process.env.FORGE_GLOBAL_MEMORY_DIR = path.join(root, 'no-global');
    out = '';
    err = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => ((out += String(chunk)), true));
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => ((err += String(chunk)), true));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (prevGlobal === undefined) delete process.env.FORGE_GLOBAL_MEMORY_DIR;
    else process.env.FORGE_GLOBAL_MEMORY_DIR = prevGlobal;
    await rm(root, { recursive: true, force: true });
  });

  const write = (text: string) => writeFile(file, text, 'utf8');

  it('list prints one line per section with scope, type, date and heading', async () => {
    await write('## Package manager\n\n<!-- forge: type=correction, updated=2026-10-12 -->\nUse pnpm.\n\n## Style\n\nTabs.\n');
    expect(await handleMemoryCommand({ list: true }, project)).toBe(0);
    expect(out).toContain('project correction 2026-10-12 Package manager');
    expect(out).toMatch(/project convention \d{4}-\d{2}-\d{2} Style/);
  });

  it('check exits 1 and names a stale section', async () => {
    await write('## Legacy\n\n<!-- forge: type=decision, updated=2026-01-01, refs=src/gone.ts -->\nOld.\n');
    expect(await handleMemoryCommand({ check: true }, project)).toBe(1);
    expect(out).toContain('stale: Legacy');
    expect(out).toContain('src/gone.ts no longer exists');
  });

  it('check exits 0 on a clean file', async () => {
    await write('## Fresh\n\n<!-- forge: type=convention, updated=2026-01-01, refs=src/here.ts -->\nStill true.\n');
    expect(await handleMemoryCommand({ check: true }, project)).toBe(0);
    expect(out).not.toContain('stale:');
  });

  it('check reports a near-duplicate pair without failing', async () => {
    await write(
      '## Package manager\n\nAlways use pnpm for installs and scripts in this workspace.\n\n## Installs\n\nAlways use pnpm for installs and scripts in this workspace please.\n'
    );
    expect(await handleMemoryCommand({ check: true }, project)).toBe(0);
    expect(out).toContain('duplicate?: Package manager ~ Installs');
  });

  it('forget removes by normalized heading', async () => {
    await write('## Package manager\n\nUse pnpm.\n\n## Style\n\nTabs.\n');
    expect(await handleMemoryCommand({ forget: { heading: ' package   MANAGER', global: false } }, project)).toBe(0);
    const text = await readFile(file, 'utf8');
    expect(text).not.toContain('Package manager');
    expect(text).toContain('## Style');
  });

  it('forget exits 1 when the heading is absent', async () => {
    await write('## Style\n\nTabs.\n');
    expect(await handleMemoryCommand({ forget: { heading: 'Nope', global: false } }, project)).toBe(1);
    expect(err).toContain('no section named');
    expect(await readFile(file, 'utf8')).toBe('## Style\n\nTabs.\n');
  });
});
