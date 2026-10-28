import { describe, expect, it } from 'vitest';

import { managerRows, managerView, newSessions, type AgentSession } from '../src/agent-manager/manager-model.js';

const NOW = 10_000_000;
const MIN = 60_000;
let n = 0;
const ids = () => `id-${++n}`;

function session(over: Partial<AgentSession> & Pick<AgentSession, 'id' | 'status'>): AgentSession {
  return { label: 'L', prompt: 'Add a dark mode toggle', useWorktree: true, auto: false, startedAt: NOW - 5 * MIN, worktree: { path: '/w', branch: `forge/${over.id}` }, ...over };
}

describe('versions of one prompt are one task', () => {
  it('shares a task id and numbers the versions', () => {
    n = 0;
    const s = newSessions({ prompt: 'Add dark mode', count: 3, useWorktree: true, auto: false }, NOW, ids);
    expect(new Set(s.map((x) => x.taskId)).size).toBe(1);
    expect(s.map((x) => x.id)).toHaveLength(new Set(s.map((x) => x.id)).size);
    expect(s.map((x) => [x.version, x.versions])).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it('is its own task for a single version, and two prompts are two tasks', () => {
    const a = newSessions({ prompt: 'One', count: 1, useWorktree: true, auto: false }, NOW, ids);
    const b = newSessions({ prompt: 'Two', count: 1, useWorktree: true, auto: false }, NOW, ids);
    expect(a[0]).toMatchObject({ version: 1, versions: 1 });
    expect(a[0]!.taskId).not.toBe(b[0]!.taskId);
  });
});

describe('a row carries its facts as fields, not one sentence', () => {
  it('has the file count, lines, branch, commits and time', () => {
    const s = session({ id: 'a', status: 'done', endedAt: NOW - 2 * MIN, changedFiles: ['a.ts', 'b.ts', 'c.ts'], stats: { ahead: 3, behind: 1, changed: 3, added: 212, removed: 58 } });
    expect(managerRows([s], NOW)[0]).toMatchObject({ files: 3, added: 212, removed: 58, branch: 'forge/a', ahead: 3, behind: 1, elapsed: '3m 0s' });
  });

  it('shows files so far from the live numbers while a session runs, and no lines until git has counted them', () => {
    const s = session({ id: 'b', status: 'running', stats: { ahead: 0, behind: 0, changed: 2 } });
    const row = managerRows([s], NOW)[0]!;
    expect(row.files).toBe(2);
    expect(row.added).toBeUndefined();
    expect(row.removed).toBeUndefined();
  });

  it('keeps the error text, and the pull request line in words', () => {
    const failed = session({ id: 'c', status: 'failed', error: 'The provider returned an error.' });
    expect(managerRows([failed], NOW)[0]!.error).toBe('The provider returned an error.');
    const withPr = session({ id: 'd', status: 'done', changedFiles: ['x'], pr: { number: 142, url: 'https://github.com/o/r/pull/142', state: 'open', draft: false, checks: 'passing', review: 'none' } });
    expect(managerRows([withPr], NOW)[0]!.pr).toBe('Pull request #142 · open · checks passing');
  });

  it('says whether a version can be picked for merging', () => {
    expect(managerRows([session({ id: 'e', status: 'done', changedFiles: ['x'] })], NOW)[0]!.canPick).toBe(true);
    expect(managerRows([session({ id: 'f', status: 'done', changedFiles: [] })], NOW)[0]!.canPick).toBe(false);
    expect(managerRows([session({ id: 'g', status: 'running' })], NOW)[0]!.canPick).toBe(false);
    expect(managerRows([session({ id: 'h', status: 'failed' })], NOW)[0]!.canPick).toBe(false);
  });
});

describe('managerView', () => {
  it('groups versions by task, in the order they were started, and an old session without a task is its own', () => {
    const view = managerView(
      [
        session({ id: 'a1', taskId: 't1', version: 1, versions: 2, status: 'done', changedFiles: ['x'] }),
        session({ id: 'b1', status: 'done', changedFiles: ['x'], prompt: 'Older work' }),
        session({ id: 'a2', taskId: 't1', version: 2, versions: 2, status: 'done', changedFiles: ['x'] }),
      ],
      NOW,
    );
    expect(view.tasks.map((t) => t.versions.map((v) => v.id))).toEqual([['a1', 'a2'], ['b1']]);
  });

  it('puts tasks that need a decision first, then running ones, then ones with nothing to merge', () => {
    const view = managerView(
      [
        session({ id: 'run', taskId: 'r', status: 'running' }),
        session({ id: 'bad', taskId: 'b', status: 'failed', error: 'x' }),
        session({ id: 'dec', taskId: 'd', status: 'done', changedFiles: ['x'] }),
      ],
      NOW,
    );
    expect(view.tasks.map((t) => [t.id, t.state])).toEqual([['d', 'decide'], ['r', 'working'], ['b', 'quiet']]);
  });

  it('counts versions running, done and failed across open tasks', () => {
    const view = managerView(
      [
        session({ id: '1', taskId: 'a', status: 'running' }),
        session({ id: '2', taskId: 'a', status: 'starting' }),
        session({ id: '3', taskId: 'b', status: 'done', changedFiles: ['x'] }),
        session({ id: '4', taskId: 'b', status: 'failed', error: 'x' }),
        session({ id: '5', taskId: 'c', status: 'merged' }),
      ],
      NOW,
    );
    expect(view.summary).toEqual({ running: 2, done: 1, failed: 1 });
  });

  it('moves a task to the finished list only when every version of it is merged or discarded', () => {
    const view = managerView(
      [
        session({ id: 'm1', taskId: 'x', status: 'merged' }),
        session({ id: 'm2', taskId: 'x', status: 'discarded' }),
        session({ id: 'p1', taskId: 'y', status: 'merged' }),
        session({ id: 'p2', taskId: 'y', status: 'done', changedFiles: ['x'] }),
      ],
      NOW,
    );
    expect(view.finished.map((r) => r.id)).toEqual(['m1', 'm2']);
    expect(view.tasks.map((t) => t.id)).toEqual(['y']);
    expect(view.tasks[0]!.versions.map((v) => v.status)).toEqual(['merged', 'done']);
  });

  it('gives a task a one-line title, the autonomous flag and when it started in words', () => {
    const long = 'Fix the flaky test\n\n' + 'because '.repeat(40);
    const t = managerView([session({ id: 'z', taskId: 'z', status: 'running', prompt: long, auto: true, startedAt: NOW - 90 * MIN })], NOW).tasks[0]!;
    expect(t.title).not.toContain('\n');
    expect(t.title.length).toBeLessThanOrEqual(120);
    expect(t.title.startsWith('Fix the flaky test')).toBe(true);
    expect(t.auto).toBe(true);
    expect(t.started).toBe('Started 1 hour ago');
  });

  it('says when it started in plain words at every scale', () => {
    const at = (ms: number) => managerView([session({ id: 'k', taskId: 'k', status: 'running', startedAt: NOW - ms })], NOW).tasks[0]!.started;
    expect(at(10_000)).toBe('Started just now');
    expect(at(MIN)).toBe('Started 1 minute ago');
    expect(at(6 * MIN)).toBe('Started 6 minutes ago');
    expect(at(3 * 60 * MIN)).toBe('Started 3 hours ago');
    expect(at(2 * 24 * 60 * MIN)).toBe('Started 2 days ago');
  });

  it('is empty for no sessions', () => {
    expect(managerView([], NOW)).toEqual({ summary: { running: 0, done: 0, failed: 0 }, tasks: [], finished: [] });
  });
});
