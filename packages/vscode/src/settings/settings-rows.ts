/**
 * Settings rows for the `forge.*` VS Code settings: one row per setting, grouped into pages, saved the moment
 * a value changes. Pure (no `vscode`), bundled into the Settings page as part of `window.ForgeSettings`.
 * A test compares this table with package.json, so a new setting cannot ship without a row (or an entry in
 * EXCLUDED_KEYS saying where it is edited instead).
 */

export type RowSection = 'context' | 'safety' | 'tools' | 'git' | 'advanced';

export interface SettingRow {
  key: string;
  section: RowSection;
  kind: 'boolean' | 'number' | 'enum' | 'string';
  label: string;
  enum?: string[];
  min?: number;
  max?: number;
  integer?: boolean;
}

export const SECTION_LABELS: Record<RowSection, string> = {
  context: 'Context and memory',
  safety: 'Safety and cost',
  tools: 'Tools and web',
  git: 'Git and quality',
  advanced: 'Advanced',
};

const b = (key: string, section: RowSection, label: string): SettingRow => ({ key, section, kind: 'boolean', label });
const s = (key: string, section: RowSection, label: string): SettingRow => ({ key, section, kind: 'string', label });
const n = (key: string, section: RowSection, label: string, extra: Partial<SettingRow> = {}): SettingRow => ({ key, section, kind: 'number', label, ...extra });
const e = (key: string, section: RowSection, label: string, values: string[]): SettingRow => ({ key, section, kind: 'enum', label, enum: values });

export const SETTING_ROWS: readonly SettingRow[] = [
  // Context and memory
  b('forge.compaction.enabled', 'context', 'Condense long chats'),
  n('forge.compaction.threshold', 'context', 'Condense when this full', { min: 0.3, max: 0.95 }),
  n('forge.compaction.keepRecent', 'context', 'Recent messages kept when condensing', { min: 1, max: 50, integer: true }),
  n('forge.context.budgetTokens', 'context', 'Context budget (tokens)', { min: 0 }),
  b('forge.context.maskOldResults', 'context', 'Hide old tool results'),
  n('forge.context.keepRecentTurns', 'context', 'Recent turns kept in full', { min: 2 }),
  b('forge.memory.enabled', 'context', 'Project memory'),
  b('forge.memory.sessionDigest', 'context', 'Save a summary when a chat ends'),
  n('forge.memory.injectionBudgetBytes', 'context', 'Memory sent per run (bytes)', { min: 0 }),
  n('forge.memory.maxBodyChars', 'context', 'Longest memory entry (characters)', { min: 1 }),
  b('forge.memory.autoApproveWrites', 'context', 'Save memory without asking'),
  n('forge.repoMap.tokens', 'context', 'Repo map size (tokens)', { min: 0, integer: true }),
  b('forge.cachePrompts', 'context', 'Prompt caching'),
  b('forge.checkpoints.enabled', 'context', 'Checkpoints'),
  b('forge.checkpoints.captureCommands', 'context', 'Checkpoint before commands'),

  // Safety and cost
  n('forge.maxCostUsd', 'safety', 'Spending cap per run (USD)', { min: 0 }),
  n('forge.loopGuardThreshold', 'safety', 'Stop after identical calls', { min: 0 }),
  n('forge.goalMaxTurns', 'safety', 'Most turns in one /goal', { min: 1, integer: true }),
  b('forge.notifications.enabled', 'safety', 'Notify when a run ends'),
  e('forge.language', 'safety', 'Language', ['auto', 'en', 'es', 'zh-cn']),
  b('forge.keepAwake', 'safety', 'Keep the computer awake during a run'),
  b('forge.notifications.sound', 'safety', 'Play a sound when a run ends'),
  b('forge.notifications.osToast', 'safety', 'Show a desktop notification when a run ends'),
  n('forge.notifications.minSeconds', 'safety', 'Only for runs longer than (seconds)', { min: 0 }),
  b('forge.audit.enabled', 'safety', 'Audit log'),
  s('forge.router.cheapModel', 'safety', 'Cheaper model for exploring'),
  s('forge.commitMessage.prompt', 'git', 'Commit message instructions'),
  s('forge.enhancePrompt.instruction', 'advanced', 'Enhance prompt instructions'),

  b('forge.shiftTabCyclesVariant', 'advanced', 'Shift+Tab cycles reasoning effort'),
  // Tools and web
  e('forge.semantic.embedder', 'tools', 'Embedder for code search', ['env', 'hashing', 'openai', 'ollama', 'custom']),
  s('forge.semantic.model', 'tools', 'Embedding model'),
  s('forge.semantic.baseUrl', 'tools', 'Embedding endpoint (custom)'),
  s('forge.semantic.apiKeyEnv', 'tools', 'Environment variable with the embedding key (custom)'),
  n('forge.semantic.batchSize', 'tools', 'Texts per embedding request (0 = default)', { min: 0, integer: true }),
  n('forge.semantic.resultLimit', 'tools', 'Code search results (0 = default)', { min: 0, max: 20, integer: true }),
  n('forge.semantic.minScore', 'tools', 'Least similar code search hit (0 = no cut)', { min: 0, max: 1 }),
  s('forge.semantic.extensions', 'tools', 'File types to index (comma list)'),
  n('forge.tools.maxOutputChars', 'tools', 'Longest command output (characters)', { min: 5000, integer: true }),
  b('forge.browser.enabled', 'tools', 'Browser tools'),
  b('forge.browser.headless', 'tools', 'Run the browser without a window'),
  e('forge.webSearch.provider', 'tools', 'Web search', ['off', 'auto', 'brave', 'tavily', 'searxng']),
  s('forge.webSearch.searxngUrl', 'tools', 'SearXNG address'),
  b('forge.semanticSearch', 'tools', 'Search by meaning'),
  b('forge.github.enabled', 'tools', 'GitHub tools'),
  b('forge.terminal.integrated', 'tools', 'Run commands in a visible terminal'),
  b('forge.mcp.enabled', 'tools', 'MCP servers'),

  // Git and quality
  b('forge.autoCommit.enabled', 'git', 'Commit after each run'),
  b('forge.autoCommit.dirtyCommits', 'git', 'Commit your own changes first'),
  b('forge.autoCommit.attribute', 'git', 'Credit Forge in commits'),
  b('forge.autoCommit.runHooks', 'git', 'Run git hooks when committing'),
  b('forge.autoLint.enabled', 'git', 'Check files after writing'),
  b('forge.architect.enabled', 'git', 'Plan with one model, edit with another'),
  s('forge.architect.editorModel', 'git', 'Editor model'),
  e('forge.verify.auto', 'git', 'Run project checks after edits', ['ask', 'on', 'off']),
  b('forge.verify.lsp', 'git', 'Include editor problems in checks'),

  // Advanced
  s('forge.completionModel', 'advanced', 'Inline completion model'),
  n('forge.completionDebounceMs', 'advanced', 'Completion delay (ms)', { min: 0, max: 3000 }),
  n('forge.completionMaxTokens', 'advanced', 'Completion length (tokens)', { min: 32, max: 2048 }),
  b('forge.completionTelemetry', 'advanced', 'Count completion accepts'),
  b('forge.completionEnabled', 'advanced', 'Inline completion'),
  b('forge.completionAutomatic', 'advanced', 'Suggest while typing'),
  b('forge.suggestSpec', 'advanced', 'Suggest a spec for big requests'),
  b('forge.chatViewEnabled', 'advanced', 'Show Forge in the sidebar'),
  b('forge.voice.enabled', 'advanced', 'Voice input'),
  s('forge.voice.language', 'advanced', 'Voice language'),
  b('forge.voice.autoSubmit', 'advanced', 'Send voice input automatically'),
  b('forge.voice.continuous', 'advanced', 'Keep listening'),
  b('forge.voice.interimResults', 'advanced', 'Show words as you speak'),
  s('forge.providers.awsRegion', 'advanced', 'AWS region (Bedrock)'),
  s('forge.providers.vertexProject', 'advanced', 'Vertex project'),
  s('forge.providers.vertexLocation', 'advanced', 'Vertex location'),
  s('forge.providers.azureResourceName', 'advanced', 'Azure resource name'),
  s('forge.providers.azureBaseUrl', 'advanced', 'Azure base URL'),
  s('forge.providers.openaiCompatibleBaseUrl', 'advanced', 'OpenAI-compatible base URL'),
  s('forge.providers.lmstudioBaseUrl', 'advanced', 'LM Studio base URL'),
  s('forge.providers.ollamaBaseUrl', 'advanced', 'Ollama base URL'),
];

/** Settings edited somewhere else on the page, or too structured for a row (edit them in settings.json). */
export const EXCLUDED_KEYS: readonly string[] = [
  'forge.provider', // Model section
  'forge.model', // Model section
  'forge.apiKeys.openai', // legacy: keys live in secret storage (API keys section)
  'forge.apiKeys.anthropic',
  'forge.apiKeys.google',
  'forge.docs', // a name → URL map
  'forge.autoLint.commands', // an extension → command map
  'forge.verify.commands', // a list of commands
  'forge.caCertificates', // a list of file paths (or caCertificates in ~/.forge/config.json)
];

export type Coerced = { ok: true; value: unknown } | { ok: false; message: string };

/** Check a value from the page against the row's rules; the host saves only what passes. */
export function coerceRow(row: SettingRow, raw: unknown): Coerced {
  switch (row.kind) {
    case 'boolean':
      return typeof raw === 'boolean' ? { ok: true, value: raw } : { ok: false, message: 'Choose on or off.' };
    case 'enum':
      return typeof raw === 'string' && row.enum?.includes(raw) ? { ok: true, value: raw } : { ok: false, message: `Choose one of: ${row.enum?.join(', ')}.` };
    case 'string':
      return typeof raw === 'string' ? { ok: true, value: raw.trim() } : { ok: false, message: 'Enter text.' };
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return { ok: false, message: 'Enter a number.' };
      if (row.integer && !Number.isInteger(raw)) return { ok: false, message: 'Enter a whole number.' };
      if (row.min !== undefined && raw < row.min) return { ok: false, message: `Must be at least ${row.min}.` };
      if (row.max !== undefined && raw > row.max) return { ok: false, message: `Must be at most ${row.max}.` };
      return { ok: true, value: raw };
    }
  }
}

/** A DOM id for a row, shared by the page and the search index. */
export function rowId(key: string): string {
  return 'row-' + key.replace(/\./g, '-');
}

/** A shorter help line for a row whose package.json description is longer than two sentences (the native Settings editor keeps the long one). */
export const SHORT_HELP: Record<string, string> = {
  "forge.context.budgetTokens": "Largest prompt Forge sends on each step; older turns are summarized past it. 0 uses only the model's own window.",
  "forge.memory.sessionDigest": "When a new chat starts, save a short summary of the last one into project memory. Off by default; turning it on is your consent.",
  "forge.memory.injectionBudgetBytes": "How many bytes of memory go into each run's prompt. Larger memory is cut to an index plus the entries most relevant to your request.",
  "forge.repoMap.tokens": "Add a ranked outline of the codebase, about this many tokens, to the system prompt. 0 turns it off.",
  "forge.cachePrompts": "Add prompt-cache breakpoints for Anthropic models, which cuts the cost of long runs. Other providers cache automatically.",
  "forge.maxCostUsd": "Stop a run once its cost reaches this many USD (0 = no cap). Only applies to models with known pricing.",
  "forge.router.cheapModel": "Model for read-only exploration: an id, an alias or provider:model. Empty uses the main model; planning and edits always do.",
  "forge.commitMessage.prompt": "Your own instructions for drafting commit messages (language, style, length). Replaces the built-in instruction; empty = conventional commits.",
  "forge.enhancePrompt.instruction": "Your own instructions for the Enhance prompt button, for example a numbered checklist. Replaces the built-in rewrite when set.",
  "forge.semantic.embedder": "Which embedder ranks code search results: env, hashing (offline), openai, ollama or custom. Custom uses the endpoint below.",
  "forge.webSearch.provider": "Give the agent a web_search tool. 'auto' uses the first backend that has a key; queries go to that service.",
  "forge.github.enabled": "Give the agent GitHub pull-request tools for this repository. Uses your VS Code GitHub sign-in or GITHUB_TOKEN; opening a PR always asks first.",
  "forge.autoCommit.enabled": "Commit what the agent changed after each completed run, with a message drafted from the diff. Forge commits are marked; off by default.",
  "forge.autoCommit.dirtyCommits": "With auto-commit on, commit your own uncommitted changes first, so the agent's commit holds only its own.",
  "forge.verify.auto": "Run the project's typecheck, lint and tests after edits and send failures back to the model. ask = once per command set, on = always, off = never.",
  "forge.completionTelemetry": "Count how often completions are shown and accepted, locally with no network calls. Shows the accept rate in the status bar tooltip.",
  "forge.voice.language": "BCP-47 language code for speech recognition, such as en-US or fr-FR. Empty uses the browser default.",
  "forge.providers.openaiCompatibleBaseUrl": "Base URL of any OpenAI-compatible endpoint, such as http://localhost:8000/v1. The key comes from OPENAI_COMPATIBLE_API_KEY.",
};

export interface RowGroup { label: string; rows: SettingRow[] }

/** "autoCommit" -> "Auto commit". */
function familyLabel(segment: string): string {
  const words = segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Rows of one page grouped by setting family (`forge.<family>.<name>`), in first-seen order. A family with a
 * single row goes under "Other", last, so a lone setting never sits under a heading that is not its own.
 */
export function groupRows(rows: readonly SettingRow[]): RowGroup[] {
  const byFamily = new Map<string, SettingRow[]>();
  for (const r of rows) {
    const parts = r.key.split('.');
    const family = parts.length > 2 ? parts[1]! : '';
    byFamily.set(family, [...(byFamily.get(family) ?? []), r]);
  }
  const groups: RowGroup[] = [];
  const other: SettingRow[] = [];
  for (const [family, list] of byFamily) {
    if (family && list.length >= 2) groups.push({ label: familyLabel(family), rows: list });
    else other.push(...list);
  }
  if (other.length) groups.push({ label: 'Other', rows: other });
  return groups;
}

/** "Texts per request (0 = default)" -> the label without the parenthetical, and the parenthetical as a hint for beside the control. */
export function splitHint(label: string): { label: string; hint: string } {
  const m = /^(.*?)\s*\((0 = [^)]+)\)\s*$/.exec(label);
  return m ? { label: m[1]!, hint: m[2]! } : { label, hint: '' };
}
