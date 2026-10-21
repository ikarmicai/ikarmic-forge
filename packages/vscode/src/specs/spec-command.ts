/** `/spec <task>` in the chat input → generate a spec draft. */
export function parseSpecCommand(text: string): { task: string } | null {
  const m = /^\/spec\s+([\s\S]*\S)\s*$/.exec(text.trimStart());
  return m ? { task: m[1]!.trim() } : null;
}
