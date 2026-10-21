import { describe, expect, it } from 'vitest';
import { getUnifiedDiffText, summarizeResult } from '../src/tool-display.js';

describe('summarizeResult', () => {
  it("caps at 10 lines in compact mode (matches today's behavior)", () => {
    const result = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const out = summarizeResult(result, false, 'compact');
    expect(out.split('\n')).toHaveLength(12); // header + 10 lines + truncated notice
    expect(out).toContain('... (truncated)');
  });

  it('shows everything in full mode', () => {
    const result = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const out = summarizeResult(result, false, 'full');
    expect(out).not.toContain('truncated');
    expect(out.split('\n')).toHaveLength(21); // header + 20 lines
  });

  it('defaults to compact when detail is omitted', () => {
    const result = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    expect(summarizeResult(result, false)).toBe(summarizeResult(result, false, 'compact'));
  });
});

describe('getUnifiedDiffText', () => {
  it('returns a diff for edit_file using old_text/new_text from args', () => {
    const diff = getUnifiedDiffText('edit_file', { old_text: 'foo', new_text: 'bar' }, undefined);
    expect(diff).toContain('-foo');
    expect(diff).toContain('+bar');
  });

  it('returns a diff for write_file only when the result says created: true', () => {
    const created = getUnifiedDiffText('write_file', { content: 'hello' }, { created: true });
    expect(created).toContain('+hello');
    const overwritten = getUnifiedDiffText('write_file', { content: 'hello' }, { created: false });
    expect(overwritten).toBeNull();
    const pending = getUnifiedDiffText('write_file', { content: 'hello' }, undefined);
    expect(pending).toBeNull();
  });

  it('returns null for any other tool', () => {
    expect(getUnifiedDiffText('read_file', { path: 'x' }, 'contents')).toBeNull();
  });

  it('returns null when edit_file args are malformed', () => {
    expect(getUnifiedDiffText('edit_file', { old_text: 'foo' }, undefined)).toBeNull();
    expect(getUnifiedDiffText('edit_file', null, undefined)).toBeNull();
  });
});
