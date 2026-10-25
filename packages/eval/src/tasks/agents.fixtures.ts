import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * A reply that names `file` and `line` in any usual form: `config.js:7`, "`src/config.js` at line 7",
 * "config.js, line 7", "line 7 of config.js". Not another line (17, 70) and not another file.
 */
export function citesLine(file: string, line: number): RegExp {
  const f = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?<![\\w-])${f}[\`*]*(?:\\s*:\\s*|[^\\n]{0,24}?\\blines?\\s+)${line}(?!\\d)|\\blines?\\s+${line}(?!\\d)[^\\n]{0,24}?(?<![\\w-])${f}`,
    'i'
  );
}

/** Write each file (creating folders), relative to `cwd`. */
export async function writeFiles(cwd: string, files: Record<string, string>): Promise<void> {
  for (const [rel, text] of Object.entries(files)) {
    const full = join(cwd, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, text);
  }
}

/** A git repository with `committed` as its first commit, then `changed` written on top and left uncommitted. */
export async function gitWithChange(cwd: string, committed: Record<string, string>, changed: Record<string, string>): Promise<void> {
  const git = (...args: string[]) => run('git', args, { cwd });
  await mkdir(cwd, { recursive: true });
  await git('init', '-q', '-b', 'main');
  await git('config', 'user.email', 'eval@forge.local');
  await git('config', 'user.name', 'forge-eval');
  await git('config', 'commit.gpgsign', 'false');
  await git('config', 'core.autocrlf', 'false');
  await writeFiles(cwd, committed);
  await git('add', '-A');
  await git('commit', '-q', '-m', 'init');
  await writeFiles(cwd, changed);
}
