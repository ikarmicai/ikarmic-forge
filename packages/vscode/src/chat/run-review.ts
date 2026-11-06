/**
 * The state behind the "N files changed" bar under a run: which files still wait for Keep or Undo, and how
 * many were already decided. Pure data, so the host can test it. The page is not trusted: a path it sends
 * is acted on only when it is one the run changed.
 */

import type { RunFileChange } from '@ikarmic/forge-core';

export interface RunReview {
  startedAtIso: string;
  /** Files still waiting for Keep or Undo. */
  files: RunFileChange[];
  kept: number;
  undone: number;
  /** How files a command changed or deleted were before the run, what their Undo writes back. Host only: never posted to the page. */
  earlier?: ReadonlyMap<string, Uint8Array>;
}

/** A type alias, not an interface, so it can go through `post`, which takes a plain record. */
export type RunReviewMessage = {
  type: 'run_changes';
  files: RunFileChange[];
  kept: number;
  undone: number;
};

/** A review for a run that changed these files; undefined when it changed none. */
export function newRunReview(startedAtIso: string, files: RunFileChange[], earlier?: ReadonlyMap<string, Uint8Array>): RunReview | undefined {
  return files.length > 0 ? { startedAtIso, files: [...files], kept: 0, undone: 0, ...(earlier ? { earlier } : {}) } : undefined;
}

/** The waiting file at `relPath`, or undefined for anything the run did not change. */
export function findRunFile(run: RunReview | undefined, relPath: unknown): RunFileChange | undefined {
  if (!run || typeof relPath !== 'string') return undefined;
  return run.files.find((f) => f.path === relPath);
}

/** Mark files as kept or undone: they leave the waiting list and are counted once. */
export function settleRunFiles(run: RunReview, paths: string[], as: 'kept' | 'undone'): RunReview {
  const settle = new Set(paths);
  const settled = run.files.filter((f) => settle.has(f.path)).length;
  return {
    ...run,
    files: run.files.filter((f) => !settle.has(f.path)),
    kept: run.kept + (as === 'kept' ? settled : 0),
    undone: run.undone + (as === 'undone' ? settled : 0),
  };
}

export function runReviewMessage(run: RunReview): RunReviewMessage {
  return { type: 'run_changes', files: run.files, kept: run.kept, undone: run.undone };
}

/**
 * The edit tools' rows and the rows for files commands changed, in one list sorted by path. A path in both keeps the
 * command's row: `commandChanges` lists a path the edit tools have only when a command changed it before their first
 * edit, so their earlier copy is not how the run found it.
 */
export function mergeRunFiles(fromTools: RunFileChange[], fromCommands: RunFileChange[]): RunFileChange[] {
  const have = new Set(fromCommands.map((f) => f.path));
  return [...fromCommands, ...fromTools.filter((f) => !have.has(f.path))].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** What Undo may act on: the waiting files that can be put back (all of them, or the one at `relPath`). A file a command changed has no earlier copy and is never a target. */
export function undoTargets(run: RunReview, relPath?: string): RunFileChange[] {
  return run.files.filter((f) => f.undoable !== false && (relPath === undefined || f.path === relPath));
}
