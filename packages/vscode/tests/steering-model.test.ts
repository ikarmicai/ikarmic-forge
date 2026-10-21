import { describe, expect, it } from 'vitest';
import type { SteeringDoc } from '@ikarmic/forge-core';

import { buildSteeringTree, scaffoldSteering, toggleAction } from '../src/steering/steering-model.js';

const doc = (name: string, kind: 'project' | 'global', over: Partial<SteeringDoc> = {}): SteeringDoc => ({
  name, inclusion: 'always', enabled: true, body: 'b', source: { kind, path: `/p/${name}.md` }, ...over,
});

describe('buildSteeringTree', () => {
  it('groups by source with inclusion descriptions and a disabled marker', () => {
    const docs = [
      doc('tests', 'project', { inclusion: 'fileMatch', fileMatchPattern: '*.test.ts' }),
      doc('api', 'project', { inclusion: 'manual', enabled: false }),
      doc('style', 'global'),
    ];
    expect(buildSteeringTree({ docs, warnings: [], projectSkipped: false })).toEqual([
      {
        kind: 'group', id: 'project', label: 'Project',
        children: [
          { kind: 'doc', doc: docs[0], description: 'fileMatch: *.test.ts' },
          { kind: 'doc', doc: docs[1], description: 'manual (#api) · disabled' },
        ],
      },
      { kind: 'group', id: 'global', label: 'Global', children: [{ kind: 'doc', doc: docs[2], description: 'always' }] },
    ]);
  });

  it('explains an empty project group, a trust-skipped project group, and warnings', () => {
    expect(buildSteeringTree({ docs: [], warnings: [], projectSkipped: false })).toEqual([
      { kind: 'group', id: 'project', label: 'Project', children: [{ kind: 'message', label: 'No project steering yet: use "New Steering File"' }] },
    ]);
    const skipped = buildSteeringTree({ docs: [], warnings: ['steering: bad'], projectSkipped: true });
    expect(skipped[0]).toEqual({
      kind: 'group', id: 'project', label: 'Project',
      children: [{ kind: 'message', label: 'Project steering is disabled in untrusted workspaces' }],
    });
    expect(skipped[1]).toEqual({ kind: 'message', label: '⚠ steering: bad' });
  });
});

describe('toggleAction', () => {
  it('toggles via the local override unless the file itself disables the doc', () => {
    expect(toggleAction(doc('a', 'project'))).toBe('override');
    expect(toggleAction(doc('a', 'project', { enabled: false, disabledBy: 'override' }))).toBe('override');
    expect(toggleAction(doc('a', 'project', { enabled: false, disabledBy: 'file' }))).toBe('editFile');
  });

  it('labels a file-disabled doc so the user knows where to change it', () => {
    const d = doc('api', 'project', { enabled: false, disabledBy: 'file' });
    const [group] = buildSteeringTree({ docs: [d], warnings: [], projectSkipped: false });
    expect(group).toMatchObject({ children: [{ description: 'always · disabled in file' }] });
  });
});

describe('scaffoldSteering', () => {
  it('writes frontmatter for each inclusion', () => {
    expect(scaffoldSteering('style', 'always')).toBe('---\ninclusion: always\n---\n\n# style\n\nDescribe how the agent should work here. Keep it short and specific.\n');
    expect(scaffoldSteering('tests', 'fileMatch', '**/*.test.ts')).toContain('inclusion: fileMatch\nfileMatchPattern: "**/*.test.ts"\n---');
    expect(scaffoldSteering('api', 'manual')).toContain('Include it with #api in a chat message.');
  });
});
