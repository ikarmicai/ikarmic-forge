import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { handleImportCommand } from '../src/commands/import.js';
import { parseOptions } from '../src/options.js';

const argv = (...a: string[]): string[] => ['node', 'forge', ...a];

describe('forge mcp login', () => {
  it('is parsed with the server name, and needs one', () => {
    expect(parseOptions(argv('mcp', 'login', 'github')).mcpCommand).toEqual({ login: { name: 'github' } });
    expect(parseOptions(argv('mcp', 'login')).mcpCommand).not.toHaveProperty('login');
  });
});

describe('forge import claude', () => {
  it('is parsed as a preview, and as a write with "apply"', () => {
    expect(parseOptions(argv('import', 'claude')).importCommand).toEqual({ source: 'claude', apply: false });
    expect(parseOptions(argv('import', 'claude', 'apply')).importCommand).toEqual({ source: 'claude', apply: true });
    expect(parseOptions(argv('fix the import of claude')).importCommand).toBeNull();
  });

  it('previews without writing, then writes into the scratch home only on apply', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-import-'));
    const home = path.join(root, 'home');
    const cwd = path.join(root, 'work');
    await mkdir(path.join(cwd, '.claude', 'commands'), { recursive: true });
    await mkdir(home, { recursive: true });
    await writeFile(path.join(cwd, '.claude', 'commands', 'fix.md'), '---\ndescription: Fix\n---\nFix it\n');
    let out = '';
    const write = (s: string): void => {
      out += s;
    };

    expect(await handleImportCommand({ source: 'claude', apply: false }, { home, cwd, write })).toBe(0);
    expect(out).toContain('fix');
    expect(out).toContain('forge import claude apply');
    await expect(readFile(path.join(cwd, '.forge', 'commands', 'fix.md'), 'utf8')).rejects.toThrow();

    out = '';
    expect(await handleImportCommand({ source: 'claude', apply: true }, { home, cwd, write })).toBe(0);
    expect(await readFile(path.join(cwd, '.forge', 'commands', 'fix.md'), 'utf8')).toContain('Fix it');
    expect(out).toContain('Wrote');
  });
});
