/**
 * MCP prompts in the chat: turning a server's prompts into slash entries, and a `/mcp-server-prompt args` message into
 * the text the model gets. Pure (no `vscode`), so it is unit-tested; chat-view.ts adds the translated wording.
 */
import { createHash } from 'node:crypto';

import { mcpPromptSlashName, parsePromptArgs, type McpPromptInfo } from '@ikarmic/forge-core';

import { expandMcpPrompt, type SlashEntry } from './slash-commands.js';

/**
 * The slash name of each prompt. Two prompts whose names are the same once cleaned (`Say Hello` and `say_hello`) both keep a
 * command: the later one gets a short hash of its own server and name. Worked out over the prompts alone, so the menu and the
 * run agree whatever the built-ins and skills take.
 */
export function promptSlashNames(prompts: readonly McpPromptInfo[]): Map<McpPromptInfo, string> {
  const seen = new Set<string>();
  const names = new Map<McpPromptInfo, string>();
  for (const p of prompts) {
    let name = mcpPromptSlashName(p.server, p.name);
    if (seen.has(name)) {
      const hash = createHash('sha256').update(`${p.server}\u0000${p.name}`).digest('hex').slice(0, 8);
      name = `${name.slice(0, 64 - hash.length - 1)}-${hash}`;
    }
    seen.add(name);
    names.set(p, name);
  }
  return names;
}

/** What a message that names an MCP prompt becomes: its text, or the reason it cannot run. */
export type McpPromptPlan = { text: string } | { problem: string };

/**
 * `undefined` when `name` is not the slash name of one of `prompts`. Arguments are checked before the server is asked, so
 * a missing one costs no round trip.
 */
export async function planMcpPrompt(
  name: string,
  args: string,
  prompts: readonly McpPromptInfo[],
  getText: (server: string, prompt: string, args: Record<string, string>) => Promise<string>
): Promise<McpPromptPlan | undefined> {
  const names = promptSlashNames(prompts);
  const prompt = prompts.find((p) => names.get(p) === name);
  if (!prompt) return undefined;
  const parsed = parsePromptArgs(prompt, args);
  if ('problem' in parsed) return { problem: parsed.problem };
  try {
    return { text: expandMcpPrompt(prompt, await getText(prompt.server, prompt.name, parsed.args)) };
  } catch (err) {
    return { problem: `The MCP server "${prompt.server}" could not give the prompt "${prompt.name}": ${(err as Error).message}` };
  }
}

/**
 * Slash entries for the prompts. A name already in `taken` (built-ins, custom commands, skills; lower case) is left out,
 * so a prompt never shadows one of them. `fromLabel` words "where it is from".
 */
export function mcpSlashEntries(prompts: readonly McpPromptInfo[], taken: ReadonlySet<string>, fromLabel: (server: string) => string): SlashEntry[] {
  const names = promptSlashNames(prompts);
  const entries: SlashEntry[] = [];
  for (const p of prompts) {
    const name = names.get(p)!;
    if (taken.has(name)) continue;
    entries.push({ name, description: p.description ?? fromLabel(p.server), source: 'mcp', takesArgs: p.arguments.length > 0 });
  }
  return entries;
}
