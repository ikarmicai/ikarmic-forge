import { describe, expect, it } from 'vitest';

import { MAX_DIFF_CHARS, buildCommitMessageInput } from '../src/commit-message-input.js';

describe('buildCommitMessageInput', () => {
  it('uses the staged diff and only the staged files when something is staged', () => {
    expect(buildCommitMessageInput(['a.ts'], ['a.ts', 'wip.ts'], 'STAGED', 'WORKING')).toEqual({ diff: 'STAGED', files: ['a.ts'] });
  });

  it('falls back to the working diff and the working files when nothing is staged', () => {
    expect(buildCommitMessageInput([], ['a.ts', 'b.ts'], '  \n', 'WORKING')).toEqual({ diff: 'WORKING', files: ['a.ts', 'b.ts'] });
  });

  it('returns an empty diff when both are empty, so core falls back to the file-list message', () => {
    expect(buildCommitMessageInput([], ['a.ts'], '', '')).toEqual({ diff: '', files: ['a.ts'] });
  });

  it('cuts a diff longer than MAX_DIFF_CHARS and says so, so one giant change cannot flood the prompt', () => {
    const { diff } = buildCommitMessageInput(['big.ts'], [], 'x'.repeat(MAX_DIFF_CHARS + 500), '');
    expect(diff.length).toBeLessThan(MAX_DIFF_CHARS + 200);
    expect(diff.startsWith('x'.repeat(100))).toBe(true);
    expect(diff).toMatch(/diff truncated/);
  });

  it('leaves a diff of exactly MAX_DIFF_CHARS alone', () => {
    const exact = 'y'.repeat(MAX_DIFF_CHARS);
    expect(buildCommitMessageInput([], [], exact, '').diff).toBe(exact);
  });
});
