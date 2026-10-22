/** Path helpers for the spec workflow. vscode-free. */
import path from 'node:path';

import { filesTouchedBy } from '@ikarmic/forge-core';

import { resolveInsideWorkspace } from '../chat/edit-preview.js';

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'edit_notebook', 'apply_patch']);

/** Workspace-relative posix paths of every file a successful write/edit/patch touched (a patch can touch several). */
export function changedFilesFromToolResult(root: string, toolName: string, args: unknown, isError: boolean): string[] {
  if (isError || !WRITE_TOOLS.has(toolName)) return [];
  const out: string[] = [];
  for (const p of filesTouchedBy(toolName, args)) {
    const abs = resolveInsideWorkspace(root, p);
    if (abs) out.push(path.relative(root, abs).split(path.sep).join('/'));
  }
  return out;
}

/** The first file a successful write/edit touched, else null (one-file tools; see changedFilesFromToolResult). */
export function changedFileFromToolResult(root: string, toolName: string, args: unknown, isError: boolean): string | null {
  return changedFilesFromToolResult(root, toolName, args, isError)[0] ?? null;
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
