/**
 * Slash commands in the chat composer: the built-in list, parsing `/name args`, filtering for the menu, and
 * deciding when the menu is open. Pure; the page calls `filterSlash` and `slashMenuQuery` through
 * `window.ForgeUI` (webview-lib.ts) and the host runs the command (chat-view.ts `runSlash`).
 */
export interface SlashEntry {
  name: string;
  description: string;
  source: 'builtin' | 'custom' | 'skill' | 'mcp';
  takesArgs: boolean;
}

export const BUILTIN_SLASH: readonly SlashEntry[] = [
  { name: 'new', description: 'Start a new chat', source: 'builtin', takesArgs: false },
  { name: 'compact', description: 'Condense the conversation to free up context', source: 'builtin', takesArgs: false },
  { name: 'export', description: 'Save this chat as a Markdown file', source: 'builtin', takesArgs: false },
  { name: 'model', description: 'Choose the model', source: 'builtin', takesArgs: false },
  { name: 'mode', description: 'Choose the mode', source: 'builtin', takesArgs: false },
  { name: 'variant', description: 'Cycle the reasoning effort for this chat', source: 'builtin', takesArgs: false },
  { name: 'goal', description: 'Keep working on one objective: /goal <objective>, pause, resume or clear', source: 'builtin', takesArgs: true },
  { name: 'memory', description: 'Open or edit project memory (add, list, forget)', source: 'builtin', takesArgs: true },
  { name: 'settings', description: 'Open Forge settings', source: 'builtin', takesArgs: false },
  { name: 'review', description: 'Review your changes: /review, staged, unstaged, last or branch [base]', source: 'builtin', takesArgs: true },
  { name: 'cmd', description: 'Write a shell command for a task: /cmd <what you want>', source: 'builtin', takesArgs: true },
  { name: 'reload', description: 'Re-read agents, skills, commands and MCP servers', source: 'builtin', takesArgs: false },
  { name: 'help', description: 'List the slash commands', source: 'builtin', takesArgs: false },
];

const SLASH = /^\/([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/;

/** The command `text` names, or undefined. A custom command beats a built-in of the same name (it was there first). */
export function parseSlash(text: string, known: readonly SlashEntry[]): { name: string; args: string; entry: SlashEntry } | undefined {
  const m = SLASH.exec(text.trim());
  if (!m) return undefined;
  const name = m[1]!.toLowerCase();
  const entry = known.find((e) => e.source === 'custom' && e.name === name) ?? known.find((e) => e.name === name);
  return entry ? { name, args: (m[2] ?? '').trim(), entry } : undefined;
}

/** The prompt a `/skill-name args` message becomes: the skill's instructions, then what to apply them to. */
export function expandSkillCommand(skill: { name: string; body: string }, args: string): string {
  const task = args.trim() || 'the work in this conversation';
  return `Follow the skill "${skill.name}" below.\n\n<skill name="${skill.name}">\n${skill.body.trim()}\n</skill>\n\nApply it to: ${task}`;
}

/**
 * The prompt a `/mcp-server-prompt args` message becomes: what the server's prompt says, quoted as coming from that server.
 * The text is the server's, so it cannot end the block early (RB-35) and the names cannot leave their attributes.
 */
export function expandMcpPrompt(prompt: { server: string; name: string }, text: string): string {
  // A name from the server stays one plain word run inside its attribute: no quote, no tag character, no line break.
  const attr = (s: string): string => s.replace(/["<>\r\n]/g, '');
  const body = text.trim().replace(/<\/mcp-prompt/gi, '&lt;/mcp-prompt');
  return `Use the prompt "${attr(prompt.name)}" from the MCP server "${attr(prompt.server)}" below.\n\n<mcp-prompt server="${attr(prompt.server)}" name="${attr(prompt.name)}">\n${body}\n</mcp-prompt>`;
}

/** Entries matching `query`: names starting with it first, then names containing it, each in the original order. */
export function filterSlash(entries: readonly SlashEntry[], query: string): SlashEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return [...entries.filter((e) => e.name.startsWith(q)), ...entries.filter((e) => !e.name.startsWith(q) && e.name.includes(q))];
}

/**
 * The word typed after a leading `/`, when the menu should be open: the slash is the first character, the caret
 * is still inside that first word, and the word looks like a command name (so `/usr/bin/x` never opens it).
 */
export function slashMenuQuery(text: string, caret: number): string | undefined {
  if (!text.startsWith('/')) return undefined;
  const word = /^[^\s]*/.exec(text.slice(1))![0];
  if (!/^[A-Za-z0-9_-]*$/.test(word)) return undefined;
  return caret <= 1 + word.length ? word : undefined;
}
