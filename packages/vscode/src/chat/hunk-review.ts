/**
 * Turns a per-hunk accept/reject choice into the ApprovalDecision the agent
 * understands. Pure; the QuickPick UI lives in chat-view.
 */
import type { ApprovalDecision } from '@ikarmic/forge-core';

import { applyHunks, computeHunks, describeRejected, type Hunk } from './hunks.js';

export interface ReviewSubject {
  toolName: 'write_file' | 'edit_file';
  args: Record<string, unknown> & { path: string };
  /** File content before the edit, or null when the file does not exist yet. */
  current: string | null;
  /** Content the tool call would produce (see proposedContent). */
  proposed: string;
}

export function hunksFor(subject: ReviewSubject): Hunk[] {
  return computeHunks(subject.current ?? '', subject.proposed);
}

export function decisionFromSelection(subject: ReviewSubject, hunks: readonly Hunk[], accepted: ReadonlySet<number>): ApprovalDecision {
  if (hunks.length === 0 || accepted.size >= hunks.length) return true;
  if (accepted.size === 0) {
    return { approved: false, note: 'The user reviewed the change hunk by hunk and rejected all of it. Do not retry the same edit.' };
  }
  const old = subject.current ?? '';
  const partial = applyHunks(old, hunks, accepted);
  const args =
    subject.toolName === 'write_file'
      ? { ...subject.args, content: partial }
      : // edit_file replaces one unique substring; the whole old file is unique by construction.
        { path: subject.args.path, old_text: old, new_text: partial };
  return {
    approved: true,
    args,
    note:
      `The user accepted only part of this edit and rejected ${describeRejected(hunks, accepted)}. ` +
      `The file now differs from what you proposed: re-read it before making further changes, and do not re-apply the rejected hunks.`,
  };
}
