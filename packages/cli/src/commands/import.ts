/**
 * `forge import claude [apply]`: bring a Claude Code setup (MCP servers, skills, agents, commands) over to Forge.
 * Without `apply` it only lists what would be written.
 */
import os from 'node:os';
import process from 'node:process';

import { applyClaudeImport, planClaudeImport } from '@ikarmic/forge-core';

export interface ParsedImportCommand {
  source: 'claude';
  apply: boolean;
}

export interface ImportEnv {
  home?: string;
  cwd?: string;
  write?: (text: string) => void;
}

export async function handleImportCommand(cmd: ParsedImportCommand, env: ImportEnv = {}): Promise<number> {
  const home = env.home ?? os.homedir();
  const cwd = env.cwd ?? process.cwd();
  const write = env.write ?? ((s: string) => void process.stdout.write(s));
  try {
    const plan = await planClaudeImport({ home, cwd });
    const lines: string[] = [];
    for (const m of plan.mcp) lines.push(`  MCP server  ${m.name} (${m.scope})`);
    for (const p of plan.skillPaths) lines.push(`  skills      ${p}`);
    for (const a of plan.agents) lines.push(`  agent       ${a.name} (${a.scope})`);
    for (const c of plan.commands) lines.push(`  command     /${c.name} (${c.scope})`);
    if (lines.length === 0) {
      write('Nothing to import from Claude Code.\n');
    } else if (!cmd.apply) {
      write(`Found in your Claude Code setup:\n${lines.join('\n')}\n\nRun "forge import claude apply" to write these into Forge. Nothing already there is replaced.\n`);
    } else {
      const result = await applyClaudeImport(plan, { home, cwd });
      write(`Wrote ${result.written.length} file${result.written.length === 1 ? '' : 's'}:\n${result.written.map((f) => `  ${f}`).join('\n')}\n`);
      if (result.skipped.length > 0) write(`Kept what was already there:\n${result.skipped.map((s) => `  ${s}`).join('\n')}\n`);
    }
    if (plan.notes.length > 0) write(`\nNot carried over:\n${plan.notes.map((n) => `  ${n}`).join('\n')}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`forge: ${(err as Error).message}\n`);
    return 1;
  }
}
