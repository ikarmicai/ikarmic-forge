/**
 * The composer's approval picker: how much a chat run may do without asking.
 * Ask first is the configured auto-approve list; Accept edits adds the file-writing tools
 * (commands, the browser and sub-agents still ask); Autonomous is the run-level `auto` flag.
 * Chosen per message in the page, never read from a project file (see RB-12).
 */
import { FILE_WRITE_TOOL_NAMES, resolveAutoApprove, type ApprovalSource } from '@ikarmic/forge-core';

import type { WhyRan } from './why-ran.js';

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

/**
 * Why a call ran without asking, as the chat names it; undefined when the person approved it (or it never asks).
 * Core reports Accept edits as the auto-approve list, because `autoApproveFor` folds the level into that list.
 */
export function whyRan(source: ApprovalSource | undefined, tool: string, level: ApprovalLevel, configured: readonly string[] | undefined): WhyRan | undefined {
  if (!source || source === 'person') return undefined;
  if (source === 'list' && level === 'edits' && (FILE_WRITE_TOOL_NAMES as readonly string[]).includes(tool) && !resolveAutoApprove(configured).includes(tool)) return 'edits';
  return source;
}

/** What `forge.approvalDefault` holds: a level the person chose on the first-run card, or nothing yet. */
export type StoredApproval = 'unset' | ApprovalLevel;

export function storedApprovalOf(raw: unknown): StoredApproval {
  return LEVELS.includes(raw as ApprovalLevel) ? (raw as ApprovalLevel) : 'unset';
}

/** The level a new chat starts at. A stored Autonomous applies only in a trusted workspace. */
export function startingLevel(stored: StoredApproval, trusted: boolean): ApprovalLevel {
  if (stored === 'unset') return 'ask';
  if (stored === 'auto' && !trusted) return 'ask';
  return stored;
}
