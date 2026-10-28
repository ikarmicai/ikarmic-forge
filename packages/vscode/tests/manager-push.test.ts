import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prepareWorktree, pushBranch } from '../src/agent-manager/manager-flow.js';

let root: string;
let repo: string;
let origin: string;
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'forge-push-')));
  repo = path.join(root, 'repo');
  origin = path.join(root, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', origin]);
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  git(repo, 'config', 'user.email', 'a@b.test');
  git(repo, 'config', 'user.name', 'T');
  git(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(path.join(repo, 'a.txt'), 'a');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  git(repo, 'remote', 'add', 'origin', origin);
  git(repo, 'push', '-q', 'origin', 'main');
});
afterEach(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

describe('pushBranch (F8)', () => {
  it('pushes the session branch to origin and sets it up to track', async () => {
    const wt = await prepareWorktree(repo, 'push-me');
    writeFileSync(path.join(wt.path, 'new.txt'), 'n');
    git(wt.path, 'add', '.');
    git(wt.path, 'commit', '-q', '-m', 'work');
    await pushBranch(wt.path, wt.branch);
    expect(git(origin, 'branch', '--list', wt.branch)).toContain(wt.branch);
    expect(git(wt.path, 'rev-parse', '--abbrev-ref', '@{u}')).toBe(`origin/${wt.branch}`);
  });

  it('says what went wrong in git\'s own words when the push fails', async () => {
    const wt = await prepareWorktree(repo, 'cannot-push');
    git(repo, 'remote', 'set-url', 'origin', path.join(root, 'does-not-exist.git'));
    const err = await pushBranch(wt.path, wt.branch).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^Could not push /);
    expect((err as Error).message).toMatch(/fatal|does not appear|repository/i);
  });

  it('does not treat a branch name as an option', async () => {
    const wt = await prepareWorktree(repo, 'safe');
    await expect(pushBranch(wt.path, '--receive-pack=touch /tmp/x')).rejects.toThrow(/Could not push/);
  });
});
