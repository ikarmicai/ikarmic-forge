import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';
import { findRunFile, mergeRunFiles, newRunReview, runReviewMessage, settleRunFiles, undoTargets } from '../src/chat/run-review.js';

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

describe('files a command changed, next to the files the edit tools changed', () => {
  const cmdCreated = { path: 'out.txt', status: 'created' as const, added: 4, removed: 0, byCommand: true };
  const cmdChanged = { path: 'src/c.ts', status: 'modified' as const, added: 0, removed: 0, byCommand: true, undoable: false };

  // commandChanges lists a path the edit tools have only when a command changed it before their first edit (the live
  // CRM run: a command moved a file, then edit_file changed it), so its row, counted from the start of the run, wins.
  it('puts both lists in one, sorted by path, and keeps the command row when a path is in both', () => {
    const dup = { ...cmdCreated, path: 'src/a.ts', added: 224 };
    const merged = mergeRunFiles(FILES, [cmdChanged, dup, cmdCreated]);
    expect(merged.map((f) => f.path)).toEqual(['out.txt', 'src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(merged.find((f) => f.path === 'src/a.ts')).toEqual(dup);
  });

  it('undoes only files that have an earlier copy or did not exist', () => {
    const run = newRunReview('t', mergeRunFiles(FILES, [cmdCreated, cmdChanged]))!;
    expect(undoTargets(run).map((f) => f.path)).toEqual(['out.txt', 'src/a.ts', 'src/b.ts']);
    expect(undoTargets(run, 'src/c.ts')).toEqual([]);
    expect(undoTargets(run, 'out.txt').map((f) => f.path)).toEqual(['out.txt']);
    expect(undoTargets(run, 'nope.ts')).toEqual([]);
  });

  it('keeps the earlier copies on the host: they survive Keep and Undo, and never go to the page', () => {
    const cmdModified = { path: 'src/d.ts', status: 'modified' as const, added: 1, removed: 1, byCommand: true };
    const earlier = new Map([['src/d.ts', Buffer.from('before')]]);
    const run = newRunReview('t', [cmdModified, cmdCreated], earlier)!;
    expect(undoTargets(run).map((f) => f.path)).toEqual(['src/d.ts', 'out.txt']);
    expect(settleRunFiles(run, ['out.txt'], 'kept').earlier?.get('src/d.ts')?.toString()).toBe('before');
    const msg = runReviewMessage(run);
    expect(Object.keys(msg).sort()).toEqual(['files', 'kept', 'type', 'undone']);
    expect(JSON.stringify(msg)).not.toContain('before');
  });
});

describe('chat page run review bar', () => {
  const html = chatHtml();
  const fn = html.slice(html.indexOf('let runReviewOpen'), html.indexOf('function appendStatusLine'));

  it('marks a file a command made or changed, and gives no Undo (or counts) for a file with no earlier copy', () => {
    expect(fn).toContain('byCommand');
    expect(fn).toContain("'ik-badge ik-badge--outline'");
    expect(fn).toContain("'Command'");
    expect(fn).toContain('undoable !== false');
  });

  it('says what the command did to the file in the badge tooltip', () => {
    expect(fn).toContain("'Created by a command'");
    expect(fn).toContain("'Changed by a command'");
    expect(fn).toContain("'Deleted by a command'");
    expect(fn).toContain("'Deleted by a command, so there is no earlier copy to restore'");
    expect(fn).toContain("'Changed by a command, so there is no earlier copy to restore'");
  });

  // Live CRM run, 2026-11-06: screenshots a command saved read "+0 −0".
  it('says "Binary" for a binary file instead of line counts', () => {
    expect(fn).toContain("if (f.binary) actions.appendChild(rvSpan('ik-muted', 'Binary'));");
  });

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
