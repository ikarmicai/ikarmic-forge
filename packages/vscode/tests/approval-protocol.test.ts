import { describe, expect, it } from 'vitest';

import { MAX_NOTE, denyAllPending, toApprovalDecision } from '../src/chat/approval-protocol.js';

describe('toApprovalDecision', () => {
  it('returns a bare boolean without a note', () => {
    expect(toApprovalDecision(true)).toBe(true);
    expect(toApprovalDecision(false)).toBe(false);
  });

  it('ignores empty, whitespace and non-string notes', () => {
    expect(toApprovalDecision(false, '   ')).toBe(false);
    expect(toApprovalDecision(false, 42)).toBe(false);
    expect(toApprovalDecision(true, null)).toBe(true);
  });

  it('wraps a real note, trimmed', () => {
    expect(toApprovalDecision(false, '  use a factory  ')).toEqual({ approved: false, note: 'use a factory' });
  });

  it('truncates long notes instead of rejecting them', () => {
    const d = toApprovalDecision(false, 'x'.repeat(5000));
    expect(d).toEqual({ approved: false, note: 'x'.repeat(MAX_NOTE) });
    expect(MAX_NOTE).toBe(2000);
  });
});

describe('denyAllPending', () => {
  it('answers every waiting approval with false and empties the map, so a blocked run can unwind', () => {
    const answers: unknown[] = [];
    const pending = new Map<string, (d: unknown) => void>([
      ['a', (d) => answers.push(['a', d])],
      ['b', (d) => answers.push(['b', d])],
    ]);
    denyAllPending(pending);
    expect(answers).toEqual([['a', false], ['b', false]]);
    expect(pending.size).toBe(0);
  });
});
