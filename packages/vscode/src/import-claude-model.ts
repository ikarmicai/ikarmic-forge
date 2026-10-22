/** The pick list for "Import from Claude Code", free of the vscode module so it can be unit-tested. */
import type { ClaudeImportPlan } from '@ikarmic/forge-core';

export interface ImportChoice {
  kind: 'mcp' | 'skills' | 'agent' | 'command';
  /** Index into the plan's list of that kind. */
  index: number;
  label: string;
  description: string;
}

export function importChoices(plan: ClaudeImportPlan): ImportChoice[] {
  const out: ImportChoice[] = [];
  plan.mcp.forEach((m, index) => out.push({ kind: 'mcp', index, label: `MCP server ${m.name}`, description: m.scope }));
  plan.skillPaths.forEach((p, index) => out.push({ kind: 'skills', index, label: `Skills in ${p}`, description: 'added to skillPaths' }));
  plan.agents.forEach((a, index) => out.push({ kind: 'agent', index, label: `Agent ${a.name}`, description: a.scope }));
  plan.commands.forEach((c, index) => out.push({ kind: 'command', index, label: `Command /${c.name}`, description: c.scope }));
  return out;
}

export function selectPlan(plan: ClaudeImportPlan, picked: readonly ImportChoice[]): ClaudeImportPlan {
  const take = (kind: ImportChoice['kind']): Set<number> => new Set(picked.filter((p) => p.kind === kind).map((p) => p.index));
  const mcp = take('mcp');
  const skills = take('skills');
  const agents = take('agent');
  const commands = take('command');
  return {
    mcp: plan.mcp.filter((_, i) => mcp.has(i)),
    skillPaths: plan.skillPaths.filter((_, i) => skills.has(i)),
    agents: plan.agents.filter((_, i) => agents.has(i)),
    commands: plan.commands.filter((_, i) => commands.has(i)),
    notes: plan.notes,
  };
}
