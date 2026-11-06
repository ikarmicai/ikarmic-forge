/**
 * The terminal app's list of what a run changed (/changes) and its way to put files back (/revert). The list and the
 * undo come from core, the same code as the VS Code changed-files bar; this file only words them for the terminal.
 */
import { listRunChanges, snapshotWorkspace, undoRunFile, type CheckpointStore, type RunFileChange, type WorkspaceSnapshot } from '@ikarmic/forge-core';

const MINUS = '−';

export interface RunChanges {
  startedAtIso: string;
  cwd: string;
  store: CheckpointStore;
  /** Files still to keep or put back. */
  files: RunFileChange[];
  /** The copies Undo writes back for files a command changed or deleted. */
  earlier: ReadonlyMap<string, Uint8Array>;
  undone: number;
}

/** The workspace before a run (or after it, taken like `before`). A failure is said in words and the list falls back to the edit tools' files. */
export async function snapshotForRun(cwd: string, before?: WorkspaceSnapshot): Promise<{ snapshot: WorkspaceSnapshot } | { warning: string }> {
  try {
    return { snapshot: await snapshotWorkspace(cwd, before ? { like: before } : {}) };
  } catch (err) {
    return { warning: `Files that commands changed are not listed: ${(err as Error).message}` };
  }
}

/** What the run changed, or undefined when it changed nothing. */
export async function runChangesAfter(
  store: CheckpointStore,
  cwd: string,
  startedAtIso: string,
  snapshots: { before: WorkspaceSnapshot; after: WorkspaceSnapshot } | undefined
): Promise<RunChanges | undefined> {
  const { files, earlier } = await listRunChanges(store, cwd, startedAtIso, snapshots);
  return files.length > 0 ? { startedAtIso, cwd, store, files, earlier, undone: 0 } : undefined;
}

function rowCounts(f: RunFileChange): string {
  if (f.binary) return 'Binary';
  if (f.large) return 'Large file';
  if (f.byCommand && f.undoable === false) return '';
  return `+${f.added} ${MINUS}${f.removed}`;
}

function rowNotes(f: RunFileChange): string {
  const notes: string[] = [];
  if (f.status === 'created') notes.push('new');
  if (f.status === 'deleted') notes.push('deleted');
  if (f.byCommand) notes.push('by a command');
  if (f.undoable === false) notes.push('no earlier copy, so it cannot be put back');
  return notes.join(', ');
}

/** "N files changed +a −r", one line per file, and how to put them back. */
export function formatRunChanges(run: RunChanges | undefined): string {
  if (!run || run.files.length === 0) {
    return run && run.undone > 0 ? `Put back ${run.undone} file${run.undone === 1 ? '' : 's'}; nothing else from the last run is left to review.` : 'The last run changed no files.';
  }
  const added = run.files.reduce((n, f) => n + f.added, 0);
  const removed = run.files.reduce((n, f) => n + f.removed, 0);
  const lines = [`${run.files.length} file${run.files.length === 1 ? '' : 's'} changed +${added} ${MINUS}${removed}`];
  for (const f of run.files) lines.push(['  ' + f.path, rowCounts(f), rowNotes(f)].filter(Boolean).join('  '));
  lines.push('/revert <file> or /revert all puts them back as the run found them; /changes shows this list again.');
  return lines.join('\n');
}

/**
 * `/revert all` or `/revert <file>`: put files back as the run found them, and say what happened in words.
 * Files put back leave the list; the rest stay with the reason.
 */
export async function revertRunChanges(run: RunChanges | undefined, args: string): Promise<{ text: string; isError: boolean; run: RunChanges | undefined }> {
  const what = args.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!what) return { text: 'Usage: /revert <file> or /revert all. /changes lists the files the last run changed.', isError: true, run };
  if (!run || run.files.length === 0) return { text: 'Nothing to put back: the last run changed no files that are still listed.', isError: true, run };
  const targets = what === 'all' ? run.files : run.files.filter((f) => f.path === what);
  if (targets.length === 0) return { text: `${what} is not in the list of files the last run changed. /changes shows that list.`, isError: true, run };
  const done: string[] = [];
  let tracked = 0;
  let refused = 0;
  let missing = 0;
  for (const f of targets) {
    try {
      const res = await undoRunFile(run.store, run.cwd, run.startedAtIso, f, run.earlier);
      if (res === 'done') done.push(f.path);
      else if (res === 'tracked') tracked++;
      else if (res === 'refused') refused++;
      else missing++;
    } catch (err) {
      return { text: `Could not put ${f.path} back: ${(err as Error).message}`, isError: true, run };
    }
  }
  const left = new Set(done);
  const next: RunChanges = { ...run, files: run.files.filter((f) => !left.has(f.path)), undone: run.undone + done.length };
  const parts: string[] = [];
  if (done.length > 0) parts.push(done.length === 1 ? `Put back ${done[0]} as the run found it.` : `Put back ${done.length} files as the run found them.`);
  if (tracked > 0) parts.push(`Left ${tracked} file(s) in place: git has them now (for example in the automatic commit), so removing them would not be safe.`);
  if (refused > 0) parts.push(`Left ${refused} file(s) in place: they are not plain files inside the workspace.`);
  if (missing > 0) parts.push(`Could not put back ${missing} file(s): there is no saved copy of how they were.`);
  return { text: parts.join(' '), isError: done.length < targets.length, run: next };
}
