/**
 * Compute what a write_file / edit_file call WOULD produce, so the chat
 * can open a native diff before the user approves it. edit_file
 * semantics (and error wording) mirror core's editFileTool exactly:
 * keep them in sync with it.
 */
import path from 'node:path';

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

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
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
  const oldText = a.old_text;
  const newText = a.new_text;
  const occurrences = countOccurrences(current, oldText);
  if (occurrences === 0) {
    return { ok: false, reason: `old_text not found in ${a.path}. Re-read the file (it may have changed) and try again.` };
  }
  const replaceAll = a.replace_all === true;
  if (!replaceAll && occurrences > 1) {
    return {
      ok: false,
      reason: `old_text matches ${occurrences} times in ${a.path}. Pass more context to make it unique, or set replace_all=true to replace all occurrences.`,
    };
  }
  const content = replaceAll ? current.split(oldText).join(newText) : current.replace(oldText, () => newText);
  return { ok: true, content };
}

/** Resolve `p` against `root`; null when the result escapes the workspace. */
export function resolveInsideWorkspace(root: string, p: string): string | null {
  const abs = path.resolve(root, p);
  const rel = path.relative(root, abs);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || rel.startsWith('../') || path.isAbsolute(rel)) return null;
  return abs;
}
