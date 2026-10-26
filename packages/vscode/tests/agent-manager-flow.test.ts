/** The Agent Manager's git steps against a real repository: a worktree per session, then merge or discard. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { collectChanges, discardWorktree, mergeWorktree, prepareWorktree } from '../src/agent-manager/manager-flow.js';

function repo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'forge-am-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t.test');
  git('config', 'user.name', 't');
  git('config', 'core.autocrlf', 'false');
  writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return dir;
}
const branches = (dir: string) => execFileSync('git', ['branch', '--format=%(refname:short)'], { cwd: dir }).toString().split('\n').filter(Boolean);

describe('Agent Manager git flow', () => {
  it('gives a session its own worktree, lists what it changed, and merges it back', async () => {
    const root = repo();
    const wt = await prepareWorktree(root, 'Add dark mode (1)');
    expect(existsSync(wt.path)).toBe(true);
    expect(wt.branch).toMatch(/^forge\//);

    writeFileSync(path.join(wt.path, 'a.txt'), 'two\n');
    writeFileSync(path.join(wt.path, 'b.txt'), 'new\n');
    expect((await collectChanges(root, wt, 'Add dark mode')).sort()).toEqual(['a.txt', 'b.txt']);

    const merged = await mergeWorktree(root, wt, 'Add dark mode');
    expect(merged).toEqual({ ok: true });
    expect(readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('two\n');
    expect(existsSync(wt.path)).toBe(false);
    expect(branches(root)).toEqual(['main']);
  });

  it('discards a session: worktree and branch gone, workspace untouched', async () => {
    const root = repo();
    const wt = await prepareWorktree(root, 'try');
    writeFileSync(path.join(wt.path, 'a.txt'), 'changed\n');
    await discardWorktree(root, wt);
    expect(existsSync(wt.path)).toBe(false);
    expect(branches(root)).toEqual(['main']);
    expect(readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('one\n');
  });

  it('reports a merge conflict and leaves the worktree to resolve or discard', async () => {
    const root = repo();
    const wt = await prepareWorktree(root, 'clash');
    writeFileSync(path.join(wt.path, 'a.txt'), 'theirs\n');
    await collectChanges(root, wt, 'clash');
    writeFileSync(path.join(root, 'a.txt'), 'mine\n');
    execFileSync('git', ['commit', '-qam', 'mine'], { cwd: root });
    const out = await mergeWorktree(root, wt, 'clash');
    expect(out).toMatchObject({ ok: false });
    expect(out.ok === false && out.message).toContain('a.txt');
    expect(existsSync(wt.path)).toBe(true);
  });

  it('refuses a workspace that is not a git repository, with a reason', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'forge-am-nogit-'));
    await expect(prepareWorktree(dir, 'x')).rejects.toThrow(/git/i);
  });
});
