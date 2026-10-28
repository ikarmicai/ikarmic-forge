/**
 * How the chat shows its blocks: whether a tool row starts open, and what happens to the model's reasoning.
 * `display.blocks` in the config file sets this per kind; without it `blockDefault` and `showReasoning` apply
 * as before. Pure, and exported to the page through webview-lib.ts.
 */

export type BlockKind = 'terminal' | 'edit' | 'mcp' | 'other';
export type BlockMode = 'collapsed' | 'expanded';
export type ReasoningMode = 'hidden' | 'collapsed' | 'expanded';

export interface DisplayLike {
  blockDefault?: BlockMode;
  showReasoning?: boolean;
  blocks?: { reasoning?: ReasoningMode; terminal?: BlockMode; edit?: BlockMode; mcp?: BlockMode };
}

const EDIT_TOOLS = new Set(['write_file', 'edit_file', 'apply_patch', 'edit_notebook']);

export function toolBlockKind(toolName: string): BlockKind {
  if (toolName === 'run_command' || toolName === 'bg_start') return 'terminal';
  if (EDIT_TOOLS.has(toolName)) return 'edit';
  if (toolName.startsWith('mcp__')) return 'mcp';
  return 'other';
}

/** Whether a finished tool row starts open. An edit with a diff has always opened; a setting for edits can close it. */
export function blockOpen(toolName: string, display: DisplayLike, hasDiff: boolean): boolean {
  const kind = toolBlockKind(toolName);
  const own = kind === 'other' ? undefined : display.blocks?.[kind];
  if (own) return own === 'expanded';
  if (kind === 'edit' && hasDiff) return true;
  return display.blockDefault === 'expanded';
}

export function reasoningMode(display: DisplayLike): ReasoningMode {
  return display.blocks?.reasoning ?? (display.showReasoning === false ? 'hidden' : 'collapsed');
}
