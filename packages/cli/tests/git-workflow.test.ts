import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGitWorkflow, formatCommitLine, gitCommitOptions } from '../src/git-workflow.js';
import { parseOptions } from '../src/options.js';

// Each test runs a dozen real git processes; on a loaded Windows runner that can pass the 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const run = promisify(execFile);
const g = (cwd: string, ...args: string[]) => run('git', args, { cwd }).then((r) => r.stdout.trim());
const argv = (...a: string[]) => ['node', 'forge', ...a];
const model = { provider: 'openai', model: 'm' } as never;
const base = { autoCommit: true, noDirtyCommits: false, noAttribute: false, gitCommitVerify: false, cheapModel: null };

let repo: string;
beforeEach(async () => {
  repo = mkdtempSync(path.join(tmpdir(), 'forge-cli-git-'));
  await run('git', ['init', '-q', '-b', 'main', repo]);
  await g(repo, 'config', 'user.email', 'dev@example.com');
  await g(repo, 'config', 'user.name', 'Dev');
  await g(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(path.join(repo, 'a.txt'), 'base\n');
  await g(repo, 'add', '-A');
  await g(repo, 'commit', '-q', '-m', 'init');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('git flags', () => {
  it('are off by default and parse when given', () => {
    const d = parseOptions(argv('task')).options;
    expect([d.autoCommit, d.noDirtyCommits, d.noAttribute, d.gitCommitVerify]).toEqual([false, false, false, false]);
    const o = parseOptions(argv('--auto-commit', '--no-dirty-commits', '--no-attribute', '--git-commit-verify', 'task')).options;
    expect([o.autoCommit, o.noDirtyCommits, o.noAttribute, o.gitCommitVerify]).toEqual([true, true, true, true]);
    expect(gitCommitOptions(o)).toEqual({ attribute: false, verify: true });
  });
});

describe('createGitWorkflow', () => {
  it('is null when --auto-commit is off or outside a repo', async () => {
    expect(await createGitWorkflow({ ...base, autoCommit: false }, repo, model)).toBeNull();
    expect(await createGitWorkflow(base, tmpdir(), model)).toBeNull();
  });

  it('saves your work, then commits the agent changes (fallback message with no model reply)', async () => {
    const wf = (await createGitWorkflow(base, repo, model))!;
    writeFileSync(path.join(repo, 'a.txt'), 'mine\n');
    const saved = await wf.before();
    expect(saved?.files).toEqual(['a.txt']);
    writeFileSync(path.join(repo, 'b.txt'), 'agent\n');
    const commit = await wf.after('add b');
    expect(commit?.files).toEqual(['b.txt']);
    expect(formatCommitLine(commit!)).toMatch(/^committed [0-9a-f]{7} .* \(1 file\)$/);
  });

  it('with --no-dirty-commits keeps your edits out of the agent commit', async () => {
    const wf = (await createGitWorkflow({ ...base, noDirtyCommits: true }, repo, model))!;
    writeFileSync(path.join(repo, 'a.txt'), 'mine\n');
    expect(await wf.before()).toBeNull();
    writeFileSync(path.join(repo, 'b.txt'), 'agent\n');
    expect((await wf.after('x'))?.files).toEqual(['b.txt']);
    expect(await g(repo, 'status', '--porcelain')).toBe('M a.txt');
  });
});
