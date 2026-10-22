/**
 * `@agent-name do the thing` at the start of a message: ask the model to delegate the task to that agent through
 * `sub_agent`. Undefined when the message is not a mention of a known agent with a task.
 */
export function expandAgentMention(text: string, agentNames: readonly string[]): string | undefined {
  const m = /^@([a-z0-9][a-z0-9_-]*)\s+([\s\S]*\S)\s*$/.exec(text.trim());
  if (!m || !agentNames.includes(m[1]!)) return undefined;
  return `Delegate this task with the sub_agent tool, using agent "${m[1]}" and passing the task below as it is. Then report what the agent found or did.\n\nTask:\n${m[2]}`;
}
