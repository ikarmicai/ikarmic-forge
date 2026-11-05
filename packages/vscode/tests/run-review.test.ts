import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';
import { findRunFile, newRunReview, runReviewMessage, settleRunFiles } from '../src/chat/run-review.js';

const FILES = [
  { path: 'src/a.ts', status: 'modified' as const, added: 3, removed: 1 },
  { path: 'src/b.ts', status: 'created' as const, added: 10, removed: 0 },
];

describe('run review state', () => {
  it('has nothing to review when the run changed no file', () => {
    expect(newRunReview('2026-01-01T00:00:00.000Z', [])).toBeUndefined();
  });

  it('finds only a path the run changed (the page is not trusted)', () => {
    const run = newRunReview('t', FILES)!;
    expect(findRunFile(run, 'src/a.ts')?.added).toBe(3);
    expect(findRunFile(run, '../secret.txt')).toBeUndefined();
    expect(findRunFile(run, 'src/other.ts')).toBeUndefined();
    expect(findRunFile(run, 42)).toBeUndefined();
    expect(findRunFile(undefined, 'src/a.ts')).toBeUndefined();
  });

  it('moves a settled file out of the waiting list and counts it', () => {
    const run = newRunReview('t', FILES)!;
    const next = settleRunFiles(run, ['src/a.ts'], 'kept');
    expect(next.files.map((f) => f.path)).toEqual(['src/b.ts']);
    expect(next.kept).toBe(1);
    expect(next.undone).toBe(0);
    const last = settleRunFiles(next, ['src/b.ts'], 'undone');
    expect(last.files).toEqual([]);
    expect(last.undone).toBe(1);
  });

  it('does not count a path that is not waiting', () => {
    const run = newRunReview('t', FILES)!;
    const next = settleRunFiles(run, ['nope.ts', 'src/a.ts', 'src/a.ts'], 'kept');
    expect(next.kept).toBe(1);
  });

  it('tells the page what is waiting and what is already decided', () => {
    const run = settleRunFiles(newRunReview('t', FILES)!, ['src/a.ts'], 'undone');
    expect(runReviewMessage(run)).toEqual({
      type: 'run_changes',
      files: [{ path: 'src/b.ts', status: 'created', added: 10, removed: 0 }],
      kept: 0,
      undone: 1,
    });
  });
});

describe('chat page run review bar', () => {
  const html = chatHtml();
  const fn = html.slice(html.indexOf('let runReviewOpen'), html.indexOf('function appendStatusLine'));

  it('docks the bar above the message box, outside the scrolling conversation', () => {
    const bar = html.indexOf('id="run-review"');
    expect(bar).toBeGreaterThan(html.indexOf('<div id="chipbar">'));
    expect(bar).toBeLessThan(html.indexOf('<div class="composer">'));
    expect(fn).not.toContain('messagesEl.appendChild');
  });

  it('makes the task chip as wide as the bar when both show', () => {
    expect(html).toContain('#chipbar.has-review #todo-chip { flex-basis: 100%; }');
    expect(fn).toContain("classList.add('has-review')");
    expect(fn).toContain("classList.remove('has-review')");
  });

  it('has a minimize chevron like the task list, with words for both states', () => {
    expect(fn).toContain("'Hide files'");
    expect(fn).toContain("'Show files'");
    expect(fn).toContain('ik-review__chev');
  });

  it('handles the run_changes message with the file list', () => {
    expect(html).toContain("case 'run_changes':");
    expect(html).toContain('showRunChanges(msg)');
  });

  it('posts a message for every action', () => {
    for (const t of ['keep_file', 'revert_file', 'keep_run', 'revert_run', 'open_run_file']) {
      expect(fn).toContain(`type: '${t}'`);
    }
  });

  it('shows words a person reads', () => {
    for (const w of ['Keep all', 'Undo all', "'Keep'", "'Undo'", ' changed']) expect(fn).toContain(w);
  });

  it('builds the bar with textContent (file names come from the model)', () => {
    expect(fn).toContain('textContent');
    expect(fn).not.toContain('innerHTML');
  });

  it('uses design-system buttons, not bare ones', () => {
    expect(fn).toContain('ik-btn ik-btn--primary');
    expect(fn).toContain('ik-btn ik-btn--link');
  });
});

describe('the end-of-run prune keeps the run under review', () => {
  // A prune to the newest 20 checkpoints with no start time dropped the oldest checkpoints of a long run, so its
  // bar missed files and an Undo put a file back to a middle version. Every checkpoint prune in the extension must
  // pass the start of the run whose bar it serves.
  it('passes the run start to every checkpoint prune', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'chat', 'chat-view.ts'), 'utf8');
    const calls = src.match(/checkpointStore\([^)]*\)\.prune\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toMatch(/\.prune\([^)]*,\s*runStartedAtIso\)/);
  });
});
