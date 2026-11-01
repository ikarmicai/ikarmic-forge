/**
 * What the chat tells the person after an agent could not do something, and the one next step it offers (RB-122).
 * Pure and vscode-free so it is unit-testable. The agent is picked here by `agentThatCan`, not by the model.
 */
import { agentThatCan, NEED_TOOLS, type AgentNeed, type SpecialistConfig } from '@ikarmic/forge-core';

import { humanize } from '../human-text.js';

export interface BlockedInfo {
  kind: 'agent' | 'never' | 'rule';
  tool: string;
  target: string;
}

export type BlockedCard =
  | { action: 'switch'; agentId: string; title: string; text: string; primary: string }
  | { action: 'copy'; command: string; title: string; text: string; primary: string }
  | { action: 'settings'; title: string; text: string; primary: string };

const NEED_WORDS: Record<AgentNeed, string> = { change_files: 'change files', run_commands: 'run commands', read_web: 'read the web' };

function switchCard(agentId: string, text: string): BlockedCard {
  const label = humanize(agentId);
  return { action: 'switch', agentId, title: 'Another agent can do this', text: `${text} ${label} can.`, primary: `Switch to ${label} and continue` };
}

export function blockedCard(o: {
  blocked?: BlockedInfo;
  need?: AgentNeed;
  modeId: string;
  specialists: readonly SpecialistConfig[];
  cwd: string;
}): BlockedCard | undefined {
  const mode = humanize(o.modeId);
  if (o.blocked?.kind === 'rule') {
    return { action: 'settings', title: 'Blocked by your rule', text: 'One of your permission rules blocks this.', primary: 'Open permissions' };
  }
  if (o.blocked?.kind === 'never') {
    return { action: 'copy', command: o.blocked.target, title: 'Not run', text: `Forge does not run this from ${mode}. Run it yourself when you are ready:`, primary: 'Copy command' };
  }
  if (o.blocked) {
    const agentId = agentThatCan(o.specialists, 'write_file', { path: o.blocked.target }, o.cwd, o.modeId);
    return agentId ? switchCard(agentId, `${mode} can't change ${o.blocked.target}.`) : undefined;
  }
  if (o.need) {
    const agentId = agentThatCan(o.specialists, NEED_TOOLS[o.need], {}, o.cwd, o.modeId);
    return agentId ? switchCard(agentId, `${mode} can't ${NEED_WORDS[o.need]}.`) : undefined;
  }
  return undefined;
}
