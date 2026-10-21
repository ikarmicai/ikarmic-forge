import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { changedFileFromToolResult, dirtyDocsUnder } from '../src/specs/spec-paths.js';

const root = path.resolve('/ws/project');

describe('changedFileFromToolResult', () => {
  it('returns a workspace-relative posix path for successful writes and edits', () => {
    expect(changedFileFromToolResult(root, 'write_file', { path: 'a.ts' }, false)).toBe('a.ts');
    expect(changedFileFromToolResult(root, 'edit_file', { path: path.join(root, 'src', 'b.ts') }, false)).toBe('src/b.ts');
  });
  it('returns null for errors, other tools, missing paths and paths outside the workspace', () => {
    expect(changedFileFromToolResult(root, 'write_file', { path: 'a.ts' }, true)).toBeNull();
    expect(changedFileFromToolResult(root, 'run_command', { command: 'ls' }, false)).toBeNull();
    expect(changedFileFromToolResult(root, 'edit_file', {}, false)).toBeNull();
    expect(changedFileFromToolResult(root, 'edit_file', undefined, false)).toBeNull();
    expect(changedFileFromToolResult(root, 'write_file', { path: '../x.ts' }, false)).toBeNull();
  });
});

describe('dirtyDocsUnder', () => {
  const dir = path.join(root, '.forge', 'specs', '.drafts', 'd-1');
  it('picks only dirty documents inside the directory', () => {
    const docs = [
      { path: path.join(dir, 'tasks.md'), isDirty: true },
      { path: path.join(dir, 'design.md'), isDirty: false },
      { path: path.join(root, 'src', 'x.ts'), isDirty: true },
      { path: `${dir}-evil${path.sep}tasks.md`, isDirty: true },
    ];
    expect(dirtyDocsUnder(dir, docs)).toEqual([docs[0]]);
  });
});
