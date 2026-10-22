import { expandCustomCommand, type CustomCommand } from '@ikarmic/forge-core';

import { expandAgentMention } from './agent-mention.js';

export interface CommandRunPlan {
  text: string;
  /** Run in this mode (agent), when the command names one. */
  modeId?: string;
  /** A model (name, alias or provider:model) for this run only. */
  model?: string;
  /** Reasoning effort for this run only. */
  variant?: 'low' | 'medium' | 'high';
  /** Why part of the front matter was not used. */
  problem?: string;
}

/**
 * What running `/name args` means once its front matter is read: the prompt, and the mode and effort to run it with.
 * `agent` is a mode when one has that id; with `subtask: true` and an agent file of that name the work is delegated
 * through sub_agent instead. vscode-free, so it is unit-tested.
 */
export function planCommandRun(
  command: Pick<CustomCommand, 'template' | 'agent' | 'model' | 'variant' | 'subtask'>,
  args: string,
  ctx: { agentNames: readonly string[]; modeIds: readonly string[] }
): CommandRunPlan {
  const text = expandCustomCommand(command, args);
  const model = command.model?.trim();
  const plan: CommandRunPlan = { text, ...(model ? { model } : {}), ...(command.variant ? { variant: command.variant } : {}) };
  const agent = command.agent;
  if (!agent) return plan;
  if (command.subtask && ctx.agentNames.includes(agent)) {
    const delegated = expandAgentMention(`@${agent} ${text}`, ctx.agentNames);
    if (delegated) return { ...plan, text: delegated };
  }
  if (ctx.modeIds.includes(agent)) return { ...plan, modeId: agent };
  return { ...plan, problem: `The command names agent "${agent}", but no mode or agent file has that name.` };
}
