/**
 * Words for internal names (RB-55). A person never reads `max_iterations`, `perChat` or `on-network`: every
 * identifier that reaches a page goes through one of these. Pure, so both pages can bundle it.
 */

import type { AgentRunReason } from '@ikarmic/forge-core';

const ACRONYMS: Record<string, string> = { mcp: 'MCP', api: 'API', url: 'URL', lsp: 'LSP', ai: 'AI', pr: 'PR', os: 'OS' };

/** `max_iterations`, `perChat` and `on-network` become "Max iterations", "Per chat" and "On network". */
export function humanize(id: string): string {
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (words.length === 0) return id;
  const first = words[0]!;
  words[0] = ACRONYMS[first] ?? first.charAt(0).toUpperCase() + first.slice(1);
  for (let i = 1; i < words.length; i++) words[i] = ACRONYMS[words[i]!] ?? words[i]!;
  return words.join(' ');
}

/** Tools whose name does not read well once its underscores are gone ("Bg start"). */
const TOOL_LABELS: Record<string, string> = {
  bg_start: 'Start background command',
  bg_read: 'Read background output',
  bg_stop: 'Stop background command',
  todo_write: 'Update task list',
  todo_read: 'Read task list',
  memory_read: 'Read memory',
  memory_write: 'Save memory',
  memory_forget: 'Forget memory',
  sub_agent: 'Helper agent',
  sub_agent_wait: 'Wait for helper agent',
  repo_clone: 'Clone repository',
};

/** The name of a tool as a person would say it. */
export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? humanize(name);
}

// A Record over the reason type: a new way for a run to end is a compile error until it has words here.
const RUN_REASONS: Record<AgentRunReason, string> = {
  completed: 'Completed',
  max_iterations: 'Step limit reached',
  max_duration: 'Time limit reached',
  budget_exceeded: 'Cost limit reached',
  loop_detected: 'Stopped: repeating the same step',
  aborted: 'Stopped',
  error: 'Failed',
  no_provider_key: 'No API key',
  plan: 'Plan ready',
  spec: 'Spec ready',
};

/** Why a run ended, for the line under a reply. */
export function runReasonLabel(reason: string): string {
  return (RUN_REASONS as Record<string, string | undefined>)[reason] ?? humanize(reason);
}

const ENUM_LABELS: Record<string, Record<string, string>> = {
  'forge.chat.promptHistory': { shared: 'Shared across chats', perChat: 'Separate for each chat' },
  'forge.commandSandbox': { off: 'Off', on: 'On', 'on-network': 'On, with network access' },
  'forge.language': { auto: 'Automatic', en: 'English', es: 'Español', 'zh-cn': '简体中文' },
  'forge.provider': {
    auto: 'Automatic',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google Gemini',
    openrouter: 'OpenRouter',
    minimax: 'MiniMax',
    ollama: 'Ollama (local)',
    lmstudio: 'LM Studio (local)',
    'openai-compatible': 'OpenAI-compatible endpoint',
    azure: 'Azure OpenAI',
    bedrock: 'Amazon Bedrock',
    vertex: 'Google Vertex AI',
  },
};

/** The text of one choice in a setting's drop-down. The stored value stays as it is. */
export function enumLabel(settingKey: string, value: string): string {
  return ENUM_LABELS[settingKey]?.[value] ?? humanize(value);
}
