import { execFile } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { describeCommit, startAutoCommit, type AutoCommitSettings } from '../src/chat/auto-commit.js';

// Each test runs real git processes; give a slow runner room.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const run = promisify(execFile);
const g = (cwd: string, ...args: string[]) => run('git', args, { cwd }).then((r) => r.stdout.trim());
const on: AutoCommitSettings = { enabled: true, dirtyCommits: true, attribute: true, runHooks: false };

let repo: string;
const put = (name: string, text: string) => writeFileSync(path.join(repo, name), text);
beforeEach(async () => {
  repo = mkdtempSync(path.join(tmpdir(), 'forge-vsc-commit-'));
  await run('git', ['init', '-q', '-b', 'main', repo]);
  await g(repo, 'config', 'user.email', 'dev@example.com');
  await g(repo, 'config', 'user.name', 'Dev');
  await g(repo, 'config', 'commit.gpgsign', 'false');
  put('a.txt', 'base\n');
  await g(repo, 'add', '-A');
  await g(repo, 'commit', '-q', '-m', 'init');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('startAutoCommit', () => {
  it('does nothing when disabled or outside a git repository', async () => {
    expect(await startAutoCommit(repo, { ...on, enabled: false }, undefined)).toBeNull();
    const plain = mkdtempSync(path.join(tmpdir(), 'forge-vsc-plain-'));
    try {
      expect(await startAutoCommit(plain, on, undefined)).toBeNull();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('saves the user\'s own changes first, then commits only what the agent changed', async () => {
    put('a.txt', 'my edit\n');
    const run1 = (await startAutoCommit(repo, on, undefined))!;
    expect(run1.saved?.files).toEqual(['a.txt']);
    put('b.txt', 'agent\n');
    const commit = await run1.finish('add b');
    expect(commit?.files).toEqual(['b.txt']);
    expect(await g(repo, 'rev-list', '--count', 'HEAD')).toBe('3');
    expect(await g(repo, 'log', '-1', '--pretty=%an')).toBe('Dev (forge)');
    expect(await g(repo, 'status', '--porcelain')).toBe('');
  });

  it('with dirtyCommits off, leaves the user\'s files uncommitted and out of the agent commit', async () => {
    put('a.txt', 'my edit\n');
    const run1 = (await startAutoCommit(repo, { ...on, dirtyCommits: false }, undefined))!;
    expect(run1.saved).toBeNull();
    put('b.txt', 'agent\n');
    expect((await run1.finish('add b'))?.files).toEqual(['b.txt']);
    expect(await g(repo, 'status', '--porcelain')).toBe('M a.txt');
  });

  it('attribute off keeps the plain author name; no changes means no commit', async () => {
    const run1 = (await startAutoCommit(repo, { ...on, attribute: false }, undefined))!;
    expect(await run1.finish('nothing')).toBeNull();
    put('b.txt', 'agent\n');
    await run1.finish('add b');
    expect(await g(repo, 'log', '-1', '--pretty=%an')).toBe('Dev');
  });

  it.skipIf(process.platform === 'win32')('a failing pre-commit hook does not block the run unless runHooks is on', async () => {
    const hook = path.join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    chmodSync(hook, 0o755);
    const skipped = (await startAutoCommit(repo, on, undefined))!;
    put('b.txt', 'agent\n');
    expect((await skipped.finish('add b'))?.files).toEqual(['b.txt']);

    put('a.txt', 'my edit\n');
    // With hooks on, the failing hook stops the save-your-work commit: run without committing.
    expect(await startAutoCommit(repo, { ...on, runHooks: true }, undefined)).toBeNull();
    expect(await g(repo, 'status', '--porcelain')).toBe('M a.txt');
  });
});

describe('describeCommit', () => {
  it('shows a short hash, the subject line and the file count', () => {
    expect(describeCommit({ commit: 'abcdef1234567', message: 'feat: x\n\nbody', files: ['a', 'b'] })).toBe('abcdef1 feat: x (2 files)');
    expect(describeCommit({ commit: 'abcdef1234567', message: 'fix', files: ['a'] })).toBe('abcdef1 fix (1 file)');
  });
});
