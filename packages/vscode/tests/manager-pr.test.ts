import { describe, expect, it } from 'vitest';

import { managerRows, type AgentSession } from '../src/agent-manager/manager-model.js';
import { nextPollDelay, PR_POLL_MS, prDraftFor, prLine, validatePrForm } from '../src/agent-manager/manager-pr.js';

const NOW = 1_000_000;
const done: AgentSession = {
  id: 'a', label: 'L', prompt: 'p', useWorktree: true, auto: false, status: 'done', startedAt: NOW, endedAt: NOW + 1000,
  worktree: { path: '/w', branch: 'forge/L' }, changedFiles: ['a.ts', 'b.ts'],
};

describe('prDraftFor', () => {
  it('titles the pull request with the first line of the request and lists what changed', () => {
    const d = prDraftFor({ label: 'x', prompt: 'Add a dark mode toggle\nso it follows the system theme', changedFiles: ['src/a.ts', 'src/b.ts'] });
    expect(d.title).toBe('Add a dark mode toggle');
    expect(d.body).toContain('Add a dark mode toggle');
    expect(d.body).toContain('- src/a.ts');
    expect(d.body).toContain('- src/b.ts');
  });
  it('keeps a long title to one short line and a long file list short', () => {
    const d = prDraftFor({ label: 'x', prompt: 'w '.repeat(200), changedFiles: Array.from({ length: 80 }, (_, i) => `f${i}.ts`) });
    expect(d.title.length).toBeLessThanOrEqual(120);
    expect(d.title).not.toContain('\n');
    expect(d.body).toContain('and 50 more');
    expect(d.body).not.toContain('f79.ts');
  });
});

describe('validatePrForm (the page is not trusted)', () => {
  const ok = { title: 'T', body: 'B', base: 'main', draft: true };
  it('accepts a sensible form and trims it', () => {
    expect(validatePrForm({ ...ok, title: '  T  ' })).toEqual({ ok: true, ...ok });
  });
  it('defaults to a draft and an empty body', () => {
    expect(validatePrForm({ title: 'T', base: 'main' })).toEqual({ ok: true, title: 'T', body: '', base: 'main', draft: true });
    expect(validatePrForm({ title: 'T', base: 'main', draft: false })).toMatchObject({ draft: false });
  });
  it.each([
    [{ ...ok, title: '   ' }, /title/i],
    [{ ...ok, title: 'x'.repeat(257) }, /title/i],
    [{ ...ok, body: 'x'.repeat(60_001) }, /description|body/i],
    [{ ...ok, base: '' }, /branch/i],
    [{ ...ok, base: '--upload-pack=x' }, /branch/i],
    [{ ...ok, base: '/main' }, /branch/i],
    [{ ...ok, base: 'a b' }, /branch/i],
    [{ ...ok, base: 'a..b' }, /branch/i],
    [null, /form/i],
    [{ ...ok, title: 7 }, /title/i],
  ])('refuses %j', (input, why) => {
    const r = validatePrForm(input);
    expect(r.ok).toBe(false);
    expect((r as { message: string }).message).toMatch(why);
  });
});

describe('prLine', () => {
  it('reads as words', () => {
    expect(prLine({ number: 12, url: 'u', state: 'open', draft: false, checks: 'passing', review: 'approved' })).toBe('Pull request #12 · open · checks passing · approved');
    expect(prLine({ number: 3, url: 'u', state: 'open', draft: true, checks: 'failing', review: 'changes requested' })).toBe('Pull request #3 · draft · checks failing · changes requested');
    expect(prLine({ number: 4, url: 'u', state: 'merged', draft: false, checks: 'pending', review: 'none' })).toBe('Pull request #4 · merged · checks running');
    expect(prLine({ number: 5, url: 'u', state: 'closed', draft: false, checks: 'none', review: 'none' })).toBe('Pull request #5 · closed');
  });
  it('uses no identifier', () => {
    expect(prLine({ number: 1, url: 'u', state: 'open', draft: false, checks: 'pending', review: 'changes requested' })).not.toMatch(/\b[a-z]+_[a-z_]+\b|\b[a-z]+[A-Z][A-Za-z]+\b/);
  });
});

describe('nextPollDelay', () => {
  it('is a minute while all is well, doubles after each failure up to ten minutes, and resets on success', () => {
    expect(nextPollDelay(PR_POLL_MS, false)).toBe(60_000);
    expect(nextPollDelay(60_000, true)).toBe(120_000);
    expect(nextPollDelay(120_000, true)).toBe(240_000);
    expect(nextPollDelay(480_000, true)).toBe(600_000);
    expect(nextPollDelay(600_000, true)).toBe(600_000);
    expect(nextPollDelay(600_000, false)).toBe(60_000);
  });
});

describe('a session row with a pull request', () => {
  const pr = { number: 12, url: 'https://github.com/a/b/pull/12', state: 'open' as const, draft: false, checks: 'passing' as const, review: 'approved' as const };

  it('offers to create one for finished work, and to open it once there is one', () => {
    expect(managerRows([done], NOW)[0]!.actions).toEqual(['open', 'terminal', 'pr', 'merge', 'discard']);
    expect(managerRows([{ ...done, pr }], NOW)[0]!.actions).toEqual(['open', 'terminal', 'open-pr', 'merge', 'discard']);
  });
  it('offers nothing about a pull request for a session with no changes, or still running', () => {
    expect(managerRows([{ ...done, changedFiles: [] }], NOW)[0]!.actions).not.toContain('pr');
    expect(managerRows([{ ...done, status: 'running' }], NOW)[0]!.actions).not.toContain('pr');
  });
  it('shows the pull request in the detail', () => {
    expect(managerRows([{ ...done, pr }], NOW)[0]!.detail).toBe('2 files changed · forge/L · Pull request #12 · open · checks passing · approved');
  });
});
