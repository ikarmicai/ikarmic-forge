import { describe, expect, it } from 'vitest';

import { buildTreeModel, taskStatus } from '../src/specs/tree-model.js';

const t = (over = {}) => ({ id: '1', title: '1. First', done: false, requirements: [] as string[], line: 0, level: 0 as const, ...over });
const r = (over = {}) => ({
  taskId: '1', title: '1. First', sessionId: 's', mode: 'fresh' as const,
  startedAt: 'a', finishedAt: 'b', reason: 'completed', files: [] as string[], ...over,
});
const summary = { id: 's-1', task: 'dark mode', approvedAt: 'x', dir: '/d' };

describe('taskStatus', () => {
  it('prioritises running, then done, then a failed last run', () => {
    expect(taskStatus(t({ done: true }), r({ reason: 'aborted' }), true)).toBe('running');
    expect(taskStatus(t({ done: true }), r({ reason: 'aborted' }), false)).toBe('done');
    expect(taskStatus(t(), r({ reason: 'error' }), false)).toBe('failed');
    expect(taskStatus(t(), r(), false)).toBe('pending');
    expect(taskStatus(t(), undefined, false)).toBe('pending');
  });
});

describe('buildTreeModel', () => {
  it('returns nothing when nothing exists, so the view shows its welcome content', () => {
    expect(buildTreeModel({ drafts: [], specs: [] })).toEqual([]);
  });

  it('reports done/total task progress on each spec', () => {
    const t = (id: string, done: boolean) => ({ task: { id, title: id, done, requirements: [], line: 1 } as never });
    const nodes = buildTreeModel({ drafts: [], specs: [{ summary: { id: 's1', task: 'Session refactor', dir: '/x' } as never, tasks: [t('1', true), t('2', false), t('3', true)] }] });
    const spec = (nodes[0] as { children: Array<{ progress?: unknown }> }).children[0];
    expect(spec?.progress).toEqual({ done: 2, total: 3 });
  });

  it('lists drafts with their three files', () => {
    const [drafts] = buildTreeModel({ drafts: [{ id: 'd-1', task: 'add x', createdAt: 'c', dir: '/x' }], specs: [] });
    expect(drafts).toEqual({
      kind: 'group', id: 'drafts', label: 'Drafts',
      children: [{
        kind: 'draft', draftId: 'd-1', label: 'add x',
        children: [
          { kind: 'draftFile', draftId: 'd-1', file: 'requirements.md' },
          { kind: 'draftFile', draftId: 'd-1', file: 'design.md' },
          { kind: 'draftFile', draftId: 'd-1', file: 'tasks.md' },
        ],
      }],
    });
  });

  it('offers conversion for a spec without checkbox tasks', () => {
    const [specs] = buildTreeModel({ drafts: [], specs: [{ summary, tasks: [] }] });
    expect((specs as { children: unknown[] }).children).toEqual([
      { kind: 'spec', specId: 's-1', label: 'dark mode', progress: { done: 0, total: 0 }, children: [{ kind: 'convert', specId: 's-1' }] },
    ]);
  });

  it('builds task nodes with status, requirement description, last-run files and running state', () => {
    const tasks = [
      { task: t({ requirements: ['1.1', '2'] }), lastRun: r({ files: ['src/a.ts'] }) },
      { task: t({ id: '2', title: '2. Second', line: 3 }) },
    ];
    const [specs] = buildTreeModel({ drafts: [], specs: [{ summary, tasks }], running: { specId: 's-1', taskId: '2', title: '2. Second' } });
    const spec = (specs as { children: Array<{ children: unknown[] }> }).children[0]!;
    expect(spec.children).toEqual([
      { kind: 'task', specId: 's-1', task: tasks[0]!.task, status: 'pending', description: 'Req 1.1, 2', children: [{ kind: 'file', specId: 's-1', path: 'src/a.ts' }] },
      { kind: 'task', specId: 's-1', task: tasks[1]!.task, status: 'running', description: '', children: [] },
    ]);
  });
});
