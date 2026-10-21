import { describe, expect, it } from 'vitest';

import { applyHunks, computeHunks, describeRejected, hunkExcerpt, hunkLabel } from '../src/chat/hunks.js';

const lines = (n: number, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);
const join = (l: string[]) => l.join('\n') + '\n';

describe('computeHunks', () => {
  it('returns no hunks for identical text', () => {
    expect(computeHunks('a\nb\n', 'a\nb\n')).toEqual([]);
  });

  it('finds one hunk for one nearby edit, with context', () => {
    const a = lines(20);
    const b = [...a];
    b[9] = 'CHANGED';
    const hunks = computeHunks(join(a), join(b));
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines.filter((l) => l.t === '-').map((l) => l.s)).toEqual(['line 10']);
    expect(hunks[0]!.lines.filter((l) => l.t === '+').map((l) => l.s)).toEqual(['CHANGED']);
    expect(hunks[0]!.oldStart).toBe(7); // 3 lines of context before line 10
  });

  it('splits distant edits into separate hunks and merges near ones', () => {
    const a = lines(40);
    const far = [...a];
    far[2] = 'X';
    far[35] = 'Y';
    expect(computeHunks(join(a), join(far))).toHaveLength(2);
    const near = [...a];
    near[10] = 'X';
    near[13] = 'Y';
    expect(computeHunks(join(a), join(near))).toHaveLength(1);
  });

  it('handles pure insertion, pure deletion, empty old and empty new', () => {
    expect(computeHunks('a\nb\n', 'a\nNEW\nb\n')[0]!.lines.some((l) => l.t === '+' && l.s === 'NEW')).toBe(true);
    expect(computeHunks('a\nGONE\nb\n', 'a\nb\n')[0]!.lines.some((l) => l.t === '-' && l.s === 'GONE')).toBe(true);
    expect(computeHunks('', 'x\n').length).toBe(1);
    expect(computeHunks('x\n', '').length).toBe(1);
  });
});

describe('applyHunks', () => {
  const a = join(lines(40));
  const b = (() => {
    const l = lines(40);
    l[2] = 'FIRST';
    l.splice(20, 0, 'INSERTED');
    l[36] = 'LAST';
    return join(l);
  })();
  const hunks = computeHunks(a, b);

  it('all accepted reproduces the new text; none accepted reproduces the old', () => {
    expect(hunks.length).toBe(3);
    expect(applyHunks(a, hunks, new Set(hunks.map((h) => h.id)))).toBe(b);
    expect(applyHunks(a, hunks, new Set())).toBe(a);
  });

  it('a partial selection applies exactly the chosen hunks', () => {
    const out = applyHunks(a, hunks, new Set([hunks[1]!.id]));
    expect(out).toContain('INSERTED');
    expect(out).not.toContain('FIRST');
    expect(out).not.toContain('LAST');
    expect(out).toContain('line 3');
    expect(out).toContain('line 37');
  });

  it('every subset of hunks yields text that differs from the old one only in chosen hunks', () => {
    for (let mask = 0; mask < 1 << hunks.length; mask++) {
      const chosen = new Set(hunks.filter((_, i) => mask & (1 << i)).map((h) => h.id));
      const out = applyHunks(a, hunks, chosen);
      const redo = computeHunks(a, out);
      expect(redo.length).toBe(chosen.size);
    }
  });

  it('randomized round-trip on mutated text', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let iter = 0; iter < 40; iter++) {
      const base = lines(30 + Math.floor(rnd() * 30));
      const mutated = [...base];
      for (let k = 0; k < 1 + Math.floor(rnd() * 6); k++) {
        const i = Math.floor(rnd() * mutated.length);
        const r = rnd();
        if (r < 0.4) mutated[i] = `mut ${iter}.${k}`;
        else if (r < 0.7) mutated.splice(i, 1);
        else mutated.splice(i, 0, `ins ${iter}.${k}`);
      }
      const A = join(base);
      const B = join(mutated);
      const h = computeHunks(A, B);
      expect(applyHunks(A, h, new Set(h.map((x) => x.id)))).toBe(B);
      expect(applyHunks(A, h, new Set())).toBe(A);
    }
  });
});

describe('labels', () => {
  it('formats header, excerpt and rejected description', () => {
    const a = join(lines(20));
    const bl = lines(20);
    bl[9] = 'CHANGED';
    const [h] = computeHunks(a, join(bl));
    expect(hunkLabel(h!)).toMatch(/^@@ -7,\d+ \+7,\d+ @@ - line 10$/);
    expect(hunkExcerpt(h!)).toContain('-line 10');
    expect(hunkExcerpt(h!)).toContain('+CHANGED');
    expect(describeRejected([h!], new Set())).toBe('hunk 1 (old lines 7-13)');
    expect(describeRejected([h!], new Set([0]))).toBe('');
  });
});

describe('large files', () => {
  it('diffs a whole-file rewrite quickly, as one removed block and one added block', () => {
    const a = join(lines(8000, 'old'));
    const b = join(lines(8000, 'new'));
    const t = Date.now();
    const hunks = computeHunks(a, b);
    expect(Date.now() - t).toBeLessThan(2000);
    expect(hunks).toHaveLength(1);
    expect(applyHunks(a, hunks, new Set([0]))).toBe(b);
    expect(applyHunks(a, hunks, new Set())).toBe(a);
  });

  it('still finds a small edit in the middle of a big file', () => {
    const a = lines(8000);
    const b = [...a];
    b[4000] = 'CHANGED';
    const hunks = computeHunks(join(a), join(b));
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines.filter((l) => l.t !== ' ')).toEqual([
      { t: '-', s: 'line 4001' },
      { t: '+', s: 'CHANGED' },
    ]);
  });
});
