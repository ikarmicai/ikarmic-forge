import { describe, expect, it } from 'vitest';

import { buildReviewPrompt, parseReviewScope, reviewDiffArgs } from '../src/chat/review.js';

describe('parseReviewScope', () => {
  it('defaults to uncommitted changes', () => {
    expect(parseReviewScope('')).toEqual({ scope: 'uncommitted' });
    expect(parseReviewScope('  ')).toEqual({ scope: 'uncommitted' });
  });

  it('knows staged, unstaged, last and branch, with an optional base for branch', () => {
    expect(parseReviewScope('staged')).toEqual({ scope: 'staged' });
    expect(parseReviewScope('UNSTAGED')).toEqual({ scope: 'unstaged' });
    expect(parseReviewScope('last')).toEqual({ scope: 'last' });
    expect(parseReviewScope('branch')).toEqual({ scope: 'branch' });
    expect(parseReviewScope('branch develop')).toEqual({ scope: 'branch', base: 'develop' });
  });

  it('refuses an unknown scope with the list of choices, and a base that looks like an option', () => {
    expect(parseReviewScope('everything')).toEqual({ error: expect.stringContaining('staged') });
    expect(parseReviewScope('branch --output=x')).toEqual({ error: expect.stringContaining('base') });
  });
});

describe('reviewDiffArgs', () => {
  it('maps each scope to git arguments', () => {
    expect(reviewDiffArgs({ scope: 'uncommitted' })).toEqual(['diff', 'HEAD']);
    expect(reviewDiffArgs({ scope: 'staged' })).toEqual(['diff', '--cached']);
    expect(reviewDiffArgs({ scope: 'unstaged' })).toEqual(['diff']);
    expect(reviewDiffArgs({ scope: 'last' })).toEqual(['diff', 'HEAD~1', 'HEAD']);
    expect(reviewDiffArgs({ scope: 'branch' }, 'main')).toEqual(['diff', 'main...HEAD']);
    expect(reviewDiffArgs({ scope: 'branch', base: 'develop' }, 'main')).toEqual(['diff', 'develop...HEAD']);
  });
});

describe('buildReviewPrompt', () => {
  it('asks for a review of the diff and includes it', () => {
    const p = buildReviewPrompt({ diff: 'DIFFBODY', scopeLabel: 'staged changes' });
    expect(p).toContain('staged changes');
    expect(p).toContain('DIFFBODY');
    expect(p.toLowerCase()).toContain('review');
  });

  it('adds the REVIEW.md rules when there are any, and none when blank', () => {
    expect(buildReviewPrompt({ diff: 'd', scopeLabel: 'x', rules: 'Check for SQL injection.' })).toContain('Check for SQL injection.');
    expect(buildReviewPrompt({ diff: 'd', scopeLabel: 'x', rules: '  ' })).not.toContain('REVIEW.md');
  });

  it('clips a very large diff and says so', () => {
    const p = buildReviewPrompt({ diff: 'x'.repeat(200_000), scopeLabel: 'x' });
    expect(p.length).toBeLessThan(80_000);
    expect(p).toContain('diff truncated');
  });

  it('says plainly when there is nothing to review', () => {
    expect(buildReviewPrompt({ diff: '  ', scopeLabel: 'staged changes' })).toBeUndefined();
  });
});
