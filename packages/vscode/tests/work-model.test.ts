import { describe, expect, it } from 'vitest';

import type { SpecTask } from '@ikarmic/forge-core';

import { buildTreeModel } from '../src/specs/tree-model.js';
import { buildSteeringTree } from '../src/steering/steering-model.js';
import { parseSpecAction, parseSteeringAction, specsView, steeringView } from '../src/work/work-model.js';

const task = (id: string, title: string, done = false, requirements: string[] = []): SpecTask => ({ id, title, done, requirements, line: 3, level: 0 });
const summary = (id: string, t: string) => ({ id, task: t, approvedAt: '2026-01-01', dir: `/w/${id}` });

describe('specsView', () => {
  it('flattens drafts, specs, progress and task status', () => {
    const nodes = buildTreeModel({
      drafts: [{ id: 'd1', task: 'Add login' }] as never,
      specs: [
        { summary: summary('s1', 'Billing'), tasks: [{ task: task('1', 'Schema', true) }, { task: task('2', 'API', false, ['1.1']) }] },
        { summary: summary('s2', 'Empty'), tasks: [] },
      ],
    });
    const v = specsView(nodes);
    expect(v.drafts).toEqual([{ id: 'd1', task: 'Add login' }]);
    expect(v.specs[0]).toMatchObject({ id: 's1', done: 1, total: 2, needsConvert: false });
    expect(v.specs[0]!.tasks.map((t) => [t.title, t.status, t.requirements])).toEqual([
      ['Schema', 'done', ''],
      ['API', 'pending', 'Req 1.1'],
    ]);
    expect(v.specs[1]).toMatchObject({ id: 's2', needsConvert: true, tasks: [] });
  });

  it('is empty when there is nothing', () => {
    expect(specsView(buildTreeModel({ drafts: [], specs: [] }))).toEqual({ drafts: [], specs: [] });
  });
});

describe('steeringView', () => {
  const doc = (name: string, over: Record<string, unknown> = {}) =>
    ({ name, inclusion: 'always', enabled: true, source: { kind: 'project', path: `/w/${name}.md` }, ...over }) as never;

  it('lists rows with their source and whether the switch can change them', () => {
    const v = steeringView(
      buildSteeringTree({
        docs: [doc('style'), doc('old', { enabled: false, disabledBy: 'file' }), doc('mine', { source: { kind: 'global', path: '/h/mine.md' } })],
        warnings: ['bad frontmatter in x.md'],
        projectSkipped: false,
      })
    );
    expect(v.rows.map((r) => [r.name, r.source, r.enabled, r.editInFile])).toEqual([
      ['style', 'project', true, false],
      ['old', 'project', false, true],
      ['mine', 'global', true, false],
    ]);
    expect(v.notes).toEqual(['⚠ bad frontmatter in x.md']);
  });

  it('leaves the plain "nothing yet" case to the page but keeps the untrusted-workspace note', () => {
    expect(steeringView(buildSteeringTree({ docs: [], warnings: [], projectSkipped: false }))).toEqual({ rows: [], notes: [] });
    expect(steeringView(buildSteeringTree({ docs: [], warnings: [], projectSkipped: true })).notes[0]).toContain('untrusted');
  });
});

describe('action validation', () => {
  it('accepts well-formed spec actions and rejects the rest', () => {
    expect(parseSpecAction({ action: 'generate' })).toEqual({ action: 'generate' });
    expect(parseSpecAction({ action: 'sync', specId: 's' })).toEqual({ action: 'sync', specId: 's' });
    expect(parseSpecAction({ action: 'sync' })).toBeNull();
    expect(parseSpecAction({ action: 'run', specId: 's', taskId: '1', title: 'T', current: true })).toEqual({
      action: 'run',
      specId: 's',
      taskId: '1',
      title: 'T',
      current: true,
    });
    expect(parseSpecAction({ action: 'open', specId: 's', line: 4.9 })).toEqual({ action: 'open', specId: 's', line: 4 });
    expect(parseSpecAction({ action: 'openDraft', draftId: 'd', file: 'design.md' })).toEqual({ action: 'openDraft', draftId: 'd', file: 'design.md' });
    expect(parseSpecAction({ action: 'openDraft', draftId: 'd', file: '../../etc/passwd' })).toBeNull();
    expect(parseSpecAction({ action: 'approve' })).toBeNull();
    expect(parseSpecAction({ action: 'rm -rf' })).toBeNull();
    expect(parseSpecAction(null)).toBeNull();
    expect(parseSpecAction({ action: 'convert', specId: 'x'.repeat(400) })).toBeNull();
  });

  it('accepts well-formed steering actions and rejects the rest', () => {
    expect(parseSteeringAction({ action: 'new' })).toEqual({ action: 'new' });
    expect(parseSteeringAction({ action: 'toggle', name: 'style', source: 'project' })).toEqual({ action: 'toggle', name: 'style', source: 'project' });
    expect(parseSteeringAction({ action: 'toggle', name: 'style', source: 'elsewhere' })).toBeNull();
    expect(parseSteeringAction({ action: 'open', source: 'global' })).toBeNull();
  });
});
