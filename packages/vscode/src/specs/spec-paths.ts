/** Path helpers for the spec workflow. vscode-free. */
import path from 'node:path';

import { resolveInsideWorkspace } from '../chat/edit-preview.js';

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'edit_notebook']);

/** Workspace-relative posix path a successful write/edit touched, else null. */
export function changedFileFromToolResult(root: string, toolName: string, args: unknown, isError: boolean): string | null {
  if (isError || !WRITE_TOOLS.has(toolName)) return null;
  const p = (args as { path?: unknown } | undefined)?.path;
  if (typeof p !== 'string') return null;
  const abs = resolveInsideWorkspace(root, p);
  if (!abs) return null;
  return path.relative(root, abs).split(path.sep).join('/');
}

export interface OpenDoc {
  path: string;
  isDirty: boolean;
}

/** Open documents under `dir` with unsaved edits (saved before a draft is approved). */
export function dirtyDocsUnder<T extends OpenDoc>(dir: string, docs: readonly T[]): T[] {
  return docs.filter(
    (d) => d.isDirty && path.resolve(d.path) !== path.resolve(dir) && resolveInsideWorkspace(dir, d.path) !== null
  );
}
