/**
 * Turns the webview's approval answer into what core's approval callback
 * expects. A deny (or approve) may carry a note the model sees with the tool
 * result (core: agent.ts "Denied by user. <note>").
 *
 */
import type { ApprovalDecision } from '@ikarmic/forge-core';

export const MAX_NOTE = 2000;

/**
 * Deny every approval still waiting, then forget them. Core blocks on the
 * approve promise and ignores the abort signal meanwhile, so dropping a
 * resolver without calling it would leave a cancelled run hanging forever.
 */
export function denyAllPending(pending: Map<string, (decision: ApprovalDecision) => void>): void {
  for (const resolve of pending.values()) resolve(false);
  pending.clear();
}

export function toApprovalDecision(approved: boolean, note?: unknown): ApprovalDecision {
  if (typeof note !== 'string') return approved;
  const trimmed = note.trim();
  if (!trimmed) return approved;
  return { approved, note: trimmed.slice(0, MAX_NOTE) };
}
