import { describe, expect, it } from 'vitest';

import { finishSession, managerRows, newSessions, restoreSessions, type AgentSession } from '../src/agent-manager/manager-model.js';

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
    expect(row).toMatchObject({ id: 'a', status: 'done', detail: '2 files changed · forge/L', actions: ['open', 'merge', 'discard'], elapsed: '1m 1s' });
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
