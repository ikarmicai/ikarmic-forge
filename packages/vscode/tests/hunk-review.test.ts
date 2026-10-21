import { describe, expect, it } from 'vitest';

import { decisionFromSelection, hunksFor, type ReviewSubject } from '../src/chat/hunk-review.js';

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`);
const join = (l: string[]) => l.join('\n') + '\n';

function subject(toolName: 'write_file' | 'edit_file'): ReviewSubject {
  const cur = lines(40);
  const next = [...cur];
  next[2] = 'A';
  next[36] = 'B';
  const current = join(cur);
  const proposed = join(next);
  return {
    toolName,
    args: toolName === 'write_file' ? { path: 'f.txt', content: proposed } : { path: 'f.txt', old_text: 'line 3', new_text: 'A' },
    current,
    proposed,
  };
}

describe('decisionFromSelection', () => {
  it('accepting everything is a plain approval', () => {
    const s = subject('write_file');
    const h = hunksFor(s);
    expect(decisionFromSelection(s, h, new Set(h.map((x) => x.id)))).toBe(true);
  });

  it('accepting nothing denies with a note', () => {
    const s = subject('write_file');
    const d = decisionFromSelection(s, hunksFor(s), new Set());
    expect(d).toMatchObject({ approved: false });
    expect((d as { note: string }).note).toMatch(/rejected all/);
  });

  it('partial write_file: edited content plus a note naming the rejected hunk', () => {
    const s = subject('write_file');
    const h = hunksFor(s);
    expect(h).toHaveLength(2);
    const d = decisionFromSelection(s, h, new Set([h[0]!.id])) as { approved: boolean; args: { path: string; content: string }; note: string };
    expect(d.approved).toBe(true);
    expect(d.args.content).toContain('A');
    expect(d.args.content).not.toContain('B');
    expect(d.args.path).toBe('f.txt');
    expect(d.note).toMatch(/hunk 2/);
    expect(d.note).toMatch(/re-read/);
  });

  it('partial edit_file becomes a whole-file replacement (unique by construction)', () => {
    const s = subject('edit_file');
    const h = hunksFor(s);
    const d = decisionFromSelection(s, h, new Set([h[1]!.id])) as { args: { path: string; old_text: string; new_text: string } };
    expect(d.args.old_text).toBe(s.current);
    expect(d.args.new_text).toContain('B');
    expect(d.args.new_text).not.toContain('A\n');
  });

  it('a brand-new file (current=null) has one all-add hunk', () => {
    const s: ReviewSubject = { toolName: 'write_file', args: { path: 'n.txt', content: 'x\n' }, current: null, proposed: 'x\n' };
    expect(hunksFor(s)).toHaveLength(1);
  });
});
