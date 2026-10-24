/**
 * The composer's approval picker: how much a chat run may do without asking.
 * Ask first is the configured auto-approve list; Accept edits adds the file-writing tools
 * (commands, the browser and sub-agents still ask); Autonomous is the run-level `auto` flag.
 * Chosen per message in the page, never read from a project file (see RB-12).
 */
import { FILE_WRITE_TOOL_NAMES, resolveAutoApprove } from '@ikarmic/forge-core';

export type ApprovalLevel = 'ask' | 'edits' | 'auto';

const LEVELS: readonly ApprovalLevel[] = ['ask', 'edits', 'auto'];

/** The level a page message names; an unknown value is Ask first, never a wider level. */
export function approvalLevelOf(raw: unknown, legacyAuto?: boolean): ApprovalLevel {
  if (raw === undefined) return legacyAuto ? 'auto' : 'ask';
  return LEVELS.includes(raw as ApprovalLevel) ? (raw as ApprovalLevel) : 'ask';
}

/** The tools that run without asking at this level, on top of the person's `autoApproveTools`. */
export function autoApproveFor(level: ApprovalLevel, configured: readonly string[] | undefined): string[] {
  const base = resolveAutoApprove(configured);
  if (level !== 'edits') return base;
  return [...new Set([...base, ...FILE_WRITE_TOOL_NAMES])];
}
