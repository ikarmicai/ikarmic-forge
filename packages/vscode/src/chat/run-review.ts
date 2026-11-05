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
}

/** A type alias, not an interface, so it can go through `post`, which takes a plain record. */
export type RunReviewMessage = {
  type: 'run_changes';
  files: RunFileChange[];
  kept: number;
  undone: number;
};

/** A review for a run that changed these files; undefined when it changed none. */
export function newRunReview(startedAtIso: string, files: RunFileChange[]): RunReview | undefined {
  return files.length > 0 ? { startedAtIso, files: [...files], kept: 0, undone: 0 } : undefined;
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
