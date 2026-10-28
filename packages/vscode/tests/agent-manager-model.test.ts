import { describe, expect, it } from 'vitest';

import { finishSession, managerRows, newSessions, pollableSessions, restoreSessions, type AgentSession } from '../src/agent-manager/manager-model.js';

const NOW = 1_000_000;

describe('newSessions', () => {
  it('makes one session per version, numbered when there is more than one', () => {
    const s = newSessions({ prompt: 'Add dark mode', count: 3, useWorktree: true, auto: false }, NOW, () => 'id');
    expect(s.map((x) => x.label)).toEqual(['Add dark mode (1)', 'Add dark mode (2)', 'Add dark mode (3)']);
    expect(s.every((x) => x.status === 'starting' && x.useWorktree && x.startedAt === NOW)).toBe(true);
  });

  it('caps parallel versions at 4 and shortens a long prompt for the label', () => {
    const s = newSessions({ prompt: 'x'.repeat(200), count: 9, useWorktree: false, auto: true }, NOW, () => 'id');
    expect(s).toHaveLength(4);
    expect(s[0]!.label.length).toBeLessThanOrEqual(64);
  });
});

describe('finishSession', () => {
  const base: AgentSession = { id: 'a', label: 'L', prompt: 'p', useWorktree: true, auto: false, status: 'running', startedAt: NOW, worktree: { path: '/w', branch: 'forge/L' } };

  it('marks a completed run done with its changed files', () => {
    expect(finishSession(base, { reason: 'completed', changedFiles: ['a.ts'] }, NOW + 5)).toMatchObject({ status: 'done', changedFiles: ['a.ts'], endedAt: NOW + 5 });
  });

  it('marks a stopped run stopped and a failed one failed with the reason', () => {
    expect(finishSession(base, { reason: 'aborted' }, NOW).status).toBe('stopped');
    expect(finishSession(base, { reason: 'error', error: 'boom' }, NOW)).toMatchObject({ status: 'failed', error: 'boom' });
    expect(finishSession(base, { reason: 'max_iterations' }, NOW).status).toBe('stopped');
  });
});

describe('managerRows', () => {
  it('offers merge and discard only for a finished worktree session with changes', () => {
    const done: AgentSession = { id: 'a', label: 'L', prompt: 'p', useWorktree: true, auto: false, status: 'done', startedAt: NOW, endedAt: NOW + 61_000, worktree: { path: '/w', branch: 'forge/L' }, changedFiles: ['a.ts', 'b.ts'] };
    const [row] = managerRows([done], NOW + 61_000);
    expect(row).toMatchObject({ id: 'a', status: 'done', detail: '2 files changed · forge/L', actions: ['open', 'terminal', 'pr', 'merge', 'discard'], elapsed: '1m 1s' });
  });

  it('offers stop while running, and nothing to merge without a worktree', () => {
    const running: AgentSession = { id: 'b', label: 'L', prompt: 'p', useWorktree: false, auto: false, status: 'running', startedAt: NOW };
    expect(managerRows([running], NOW + 3000)[0]!.actions).toEqual(['open', 'stop']);
    const doneHere: AgentSession = { ...running, status: 'done', changedFiles: ['x'] };
    expect(managerRows([doneHere], NOW)[0]!.actions).toEqual(['open', 'remove']);
  });

  it('lets a merged or discarded session only be removed from the list', () => {
    const merged: AgentSession = { id: 'c', label: 'L', prompt: 'p', useWorktree: true, auto: false, status: 'merged', startedAt: NOW };
    expect(managerRows([merged], NOW)[0]!.actions).toEqual(['remove']);
  });
});

describe('a terminal per session (F10)', () => {
  const wt = { path: '/w', branch: 'forge/L' };
  const mk = (status: AgentSession['status'], withWorktree = true): AgentSession => ({
    id: status, label: 'L', prompt: 'p', useWorktree: withWorktree, auto: false, status, startedAt: NOW,
    ...(withWorktree ? { worktree: wt } : {}),
  });

  it('is offered for a session that has a worktree, while it runs and after', () => {
    expect(managerRows([mk('running')], NOW)[0]!.actions).toEqual(['open', 'terminal', 'stop']);
    expect(managerRows([mk('failed')], NOW)[0]!.actions).toContain('terminal');
    expect(managerRows([mk('stopped')], NOW)[0]!.actions).toContain('terminal');
  });

  it('is not offered without a worktree (the workspace has its own terminal), or once merged or discarded', () => {
    expect(managerRows([mk('running', false)], NOW)[0]!.actions).not.toContain('terminal');
    expect(managerRows([mk('merged')], NOW)[0]!.actions).toEqual(['remove']);
    expect(managerRows([mk('discarded')], NOW)[0]!.actions).toEqual(['remove']);
  });

  it('names the terminal after the session, short and on one line', async () => {
    const { terminalName } = await import('../src/agent-manager/manager-model.js');
    expect(terminalName({ ...mk('done'), label: 'Add a dark mode toggle' })).toBe('Forge: Add a dark mode toggle');
    const long = terminalName({ ...mk('done'), label: 'x'.repeat(200) + '\nsecond line' });
    expect(long.length).toBeLessThanOrEqual(48);
    expect(long).not.toContain('second line');
  });
});

describe('restoreSessions', () => {
  it('keeps saved sessions and marks any still running as interrupted (the window was reloaded)', () => {
    const saved = [{ id: 'a', label: 'L', prompt: 'p', useWorktree: true, auto: false, status: 'running', startedAt: NOW, worktree: { path: '/w', branch: 'b' } }];
    expect(restoreSessions(saved)[0]).toMatchObject({ status: 'stopped', error: 'The window was reloaded while this session ran.' });
  });

  it('drops entries that are not sessions', () => {
    expect(restoreSessions([null, 3, { id: 1 }, 'x'])).toEqual([]);
    expect(restoreSessions(undefined)).toEqual([]);
  });
});

describe('worktree numbers in a row (F9)', () => {
  const wt = { path: '/w', branch: 'forge/L' };
  const base: AgentSession = { id: 'a', label: 'L', prompt: 'p', useWorktree: true, auto: false, status: 'done', startedAt: NOW, endedAt: NOW + 1000, worktree: wt, changedFiles: ['a.ts'] };

  it('says how far a branch is ahead and behind yours, in words', () => {
    const [row] = managerRows([{ ...base, stats: { ahead: 2, behind: 1, changed: 1 } }], NOW + 1000);
    expect(row!.detail).toBe('1 file changed · forge/L · 2 commits ahead · 1 behind');
  });

  it('says nothing about a branch that is level with yours', () => {
    expect(managerRows([{ ...base, stats: { ahead: 0, behind: 0, changed: 1 } }], NOW)[0]!.detail).toBe('1 file changed · forge/L');
  });

  it('shows the live count of changed files while the session still runs', () => {
    const running: AgentSession = { ...base, status: 'running', changedFiles: undefined, stats: { ahead: 0, behind: 0, changed: 3 } };
    expect(managerRows([running], NOW)[0]!.detail).toBe('3 files changed so far · forge/L');
  });

  it('uses no identifier in the text', () => {
    const text = managerRows([{ ...base, stats: { ahead: 3, behind: 4, changed: 5 } }], NOW)[0]!.detail;
    expect(text).not.toMatch(/\b[a-z]+_[a-z_]+\b|\b[a-z]+[A-Z][A-Za-z]+\b/);
  });

  it('polls only sessions that still have a worktree', () => {
    const mk = (status: AgentSession['status'], withWt = true): AgentSession => ({ ...base, id: status, status, ...(withWt ? {} : { worktree: undefined }) });
    const ids = pollableSessions([mk('running'), mk('done'), mk('failed'), mk('merged'), mk('discarded'), mk('done', false)]).map((s) => s.id);
    expect(ids).toEqual(['running', 'done', 'failed']);
  });
});
