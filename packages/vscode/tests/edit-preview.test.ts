import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isPreviewable, proposedContent, resolveInsideWorkspace } from '../src/chat/edit-preview.js';

describe('isPreviewable', () => {
  it('is true only for write_file and edit_file', () => {
    expect(isPreviewable('write_file')).toBe(true);
    expect(isPreviewable('edit_file')).toBe(true);
    expect(isPreviewable('run_command')).toBe(false);
  });
});

describe('proposedContent', () => {
  it('write_file returns args.content (new or existing file)', () => {
    expect(proposedContent('write_file', { path: 'a', content: 'new' }, null)).toEqual({ ok: true, content: 'new' });
    expect(proposedContent('write_file', { path: 'a', content: 'new' }, 'old')).toEqual({ ok: true, content: 'new' });
  });

  it('edit_file replaces a unique match literally ($& stays literal)', () => {
    const out = proposedContent('edit_file', { path: 'a', old_text: 'foo', new_text: 'x$&y' }, 'a foo b');
    expect(out).toEqual({ ok: true, content: 'a x$&y b' });
  });

  it('edit_file replace_all replaces every match', () => {
    expect(proposedContent('edit_file', { path: 'a', old_text: 'o', new_text: '0', replace_all: true }, 'foo')).toEqual({
      ok: true,
      content: 'f00',
    });
  });

  it('edit_file mirrors core errors', () => {
    expect(proposedContent('edit_file', { path: 'a', old_text: 'z', new_text: '' }, null)).toEqual({ ok: false, reason: 'File not found: a' });
    expect(proposedContent('edit_file', { path: 'a', old_text: 'z', new_text: '' }, 'abc')).toEqual({
      ok: false,
      reason: 'old_text not found in a. Re-read the file (it may have changed) and try again.',
    });
    expect(proposedContent('edit_file', { path: 'a', old_text: 'o', new_text: '' }, 'foo')).toEqual({
      ok: false,
      reason: 'old_text matches 2 times in a. Pass more context to make it unique, or set replace_all=true to replace all occurrences.',
    });
  });

  it('edit_file shows the same result the tool writes for a CRLF file and LF old_text', () => {
    expect(proposedContent('edit_file', { path: 'a', old_text: 'a\nb', new_text: 'a\nB' }, 'a\r\nb\r\n')).toEqual({ ok: true, content: 'a\r\nB\r\n' });
  });

  it('rejects malformed args and non-previewable tools', () => {
    expect(proposedContent('write_file', { path: 'a' }, null)).toEqual({ ok: false, reason: 'malformed arguments' });
    expect(proposedContent('run_command', { command: 'ls' }, null)).toEqual({ ok: false, reason: 'not previewable' });
  });
});

describe('resolveInsideWorkspace', () => {
  const root = path.resolve('/ws/project');
  it('resolves relative and absolute paths inside the root', () => {
    expect(resolveInsideWorkspace(root, 'src/a.ts')).toBe(path.join(root, 'src', 'a.ts'));
    expect(resolveInsideWorkspace(root, path.join(root, 'b.ts'))).toBe(path.join(root, 'b.ts'));
  });
  it('returns null for paths escaping the root', () => {
    expect(resolveInsideWorkspace(root, '../other/x')).toBeNull();
    expect(resolveInsideWorkspace(root, path.resolve('/etc/passwd'))).toBeNull();
    expect(resolveInsideWorkspace(root, path.resolve('/ws/project-evil/x'))).toBeNull();
  });
});

describe('which approvals can be previewed', () => {
  it('a patch can be shown as a diff, but is kept or refused whole (no per-hunk review)', async () => {
    const { isHunkReviewable, isPreviewable } = await import('../src/chat/edit-preview.js');
    expect(isPreviewable('apply_patch')).toBe(true);
    expect(isHunkReviewable('apply_patch')).toBe(false);
    expect(isHunkReviewable('edit_file')).toBe(true);
    expect(isPreviewable('run_command')).toBe(false);
  });
});
