/**
 * Compute what a write_file / edit_file call WOULD produce, so the chat
 * can open a native diff before the user approves it. edit_file goes
 * through core's applyTextEdit, the same function the tool writes with.
 */
import path from 'node:path';

import { applyTextEdit } from '@ikarmic/forge-core';

export type PreviewResult = { ok: true; content: string } | { ok: false; reason: string };

/** Tools whose change can be shown as a diff before approval. */
const PREVIEWABLE = new Set(['write_file', 'edit_file', 'apply_patch']);
/** Tools whose change can be split into hunks to keep or reject (a patch is approved or refused as a whole). */
const HUNK_REVIEWABLE = new Set(['write_file', 'edit_file']);

export function isPreviewable(toolName: string): boolean {
  return PREVIEWABLE.has(toolName);
}

export function isHunkReviewable(toolName: string): boolean {
  return HUNK_REVIEWABLE.has(toolName);
}

export function proposedContent(toolName: string, args: unknown, current: string | null): PreviewResult {
  if (!isHunkReviewable(toolName)) return { ok: false, reason: 'not previewable' };
  const a = (args ?? {}) as Record<string, unknown>;
  if (typeof a.path !== 'string') return { ok: false, reason: 'malformed arguments' };

  if (toolName === 'write_file') {
    if (typeof a.content !== 'string') return { ok: false, reason: 'malformed arguments' };
    return { ok: true, content: a.content };
  }

  if (typeof a.old_text !== 'string' || typeof a.new_text !== 'string') {
    return { ok: false, reason: 'malformed arguments' };
  }
  if (current === null) return { ok: false, reason: `File not found: ${a.path}` };
  try {
    return { ok: true, content: applyTextEdit(current, a.old_text, a.new_text, a.replace_all === true, a.path).content };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/** Resolve `p` against `root`; null when the result escapes the workspace. */
export function resolveInsideWorkspace(root: string, p: string): string | null {
  const abs = path.resolve(root, p);
  const rel = path.relative(root, abs);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || rel.startsWith('../') || path.isAbsolute(rel)) return null;
  return abs;
}
