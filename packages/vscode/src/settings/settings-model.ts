/**
 * Pure model behind the Settings page: the editable draft, which parts of it
 * changed, the messages a Save sends, and the search index. Bundled into the
 * page as `window.ForgeSettings` (settings-lib.ts) and unit-tested here.
 *
 */

import { SECTION_LABELS, SETTING_ROWS, rowId } from './settings-rows.js';

export type DraftKey = 'provider' | 'model' | 'reasoningEffort' | 'disabledProviders' | 'modeModels' | 'blockDefault' | 'showReasoning' | 'blockModes' | 'autoApprove' | 'permissionRules' | 'compactionModel' | 'subagentModel' | 'sessionRetentionDays' | 'sandbox' | 'agents';

/** One ordered permission rule (allow, ask or deny); the last matching rule wins. Mirrors core's PermissionConfig, flattened. */
export interface PermissionRuleDraft { permission: string; pattern: string; action: 'allow' | 'ask' | 'deny' }
export type PermissionConfigLike = Record<string, 'allow' | 'ask' | 'deny' | Record<string, 'allow' | 'ask' | 'deny'>>;

export interface PolicyRule { tool: string; dimension: string; pattern: string }
export interface SandboxDraft { allowTools: string[]; denyTools: string[]; rules: PolicyRule[] }
/** `extra` carries every saved field the page doesn't edit (model, limits, …) so a save never drops it. */
export interface AgentDraft { id: string; description: string; systemPrompt: string; allowedTools: string[]; extra: Record<string, unknown> }

export interface BlockModesDraft { reasoning: string; terminal: string; edit: string; mcp: string }
const BLOCK_MODE_KEYS = ['reasoning', 'terminal', 'edit', 'mcp'] as const;

export interface SettingsDraft {
  provider: string;
  model: string;
  reasoningEffort: string;
  disabledProviders: string[];
  /** Mode id → model for modes without their own; blank values are dropped on save. */
  modeModels: Record<string, string>;
  blockDefault: 'collapsed' | 'expanded';
  showReasoning: boolean;
  /** Per kind of block: '' follows the defaults above, otherwise collapsed or expanded (reasoning can also be hidden). */
  blockModes: BlockModesDraft;
  /** Tools that run without a prompt, sorted. */
  autoApprove: string[];
  /** Ordered pattern rules; blank patterns are dropped on save. */
  permissionRules: PermissionRuleDraft[];
  /** The model that summarises long chats; blank uses the main model. */
  compactionModel: string;
  /** The model sub-agents run on; blank uses the model of the chat that started them. */
  subagentModel: string;
  /** Days to keep saved chats, as typed; blank keeps them all. */
  sessionRetentionDays: string;
  sandbox: SandboxDraft;
  agents: AgentDraft[];
}

export interface ConfigLike {
  provider?: string;
  model?: string;
  reasoningEffort?: string;
  disabledProviders?: string[];
  modeModels?: Record<string, string>;
  autoApproveTools?: string[];
  permission?: PermissionConfigLike;
  compactionModel?: string;
  subagentModel?: string;
  sessionRetentionDays?: number;
  display?: { blockDefault?: 'collapsed' | 'expanded'; showReasoning?: boolean; blocks?: Partial<Record<keyof BlockModesDraft, string>> };
}

export interface SandboxLike {
  allowTools?: string[];
  denyTools?: string[];
  policies?: Record<string, Record<string, string[] | undefined>>;
}

export type SaveMessage =
  | { type: 'save'; patch: Record<string, unknown> }
  | { type: 'saveSandbox'; sandbox: SandboxLike }
  | { type: 'saveAgents'; agents: Record<string, unknown>[] };

/** Mirrors READ_ONLY_TOOLS in core (this file is bundled into the page, so it cannot import core; a test keeps them equal). */
export const DEFAULT_AUTO_APPROVE: readonly string[] = ['read_file', 'list_files', 'search_files', 'find_symbol', 'list_symbols', 'find_references', 'git_diff', 'codebase_search', 'memory_read', 'sub_agent_wait', 'skill', 'suggest_plan'];

export function sortedTools(list: readonly string[]): string[] {
  return [...new Set(list)].sort();
}

export const CONFIG_KEYS: readonly DraftKey[] = ['provider', 'model', 'reasoningEffort', 'disabledProviders', 'modeModels', 'blockDefault', 'showReasoning', 'blockModes', 'autoApprove', 'permissionRules', 'compactionModel', 'subagentModel', 'sessionRetentionDays'];
const ALL_KEYS: readonly DraftKey[] = [...CONFIG_KEYS, 'sandbox', 'agents'];

export function emptyDraft(): SettingsDraft {
  return {
    provider: '',
    model: '',
    reasoningEffort: '',
    disabledProviders: [],
    modeModels: {},
    blockDefault: 'collapsed',
    showReasoning: true,
    blockModes: { reasoning: '', terminal: '', edit: '', mcp: '' },
    autoApprove: sortedTools(DEFAULT_AUTO_APPROVE),
    permissionRules: [],
    compactionModel: '',
    subagentModel: '',
    sessionRetentionDays: '',
    sandbox: { allowTools: [], denyTools: [], rules: [] },
    agents: [],
  };
}

export function applyConfig(d: SettingsDraft, config: ConfigLike): SettingsDraft {
  return {
    ...d,
    provider: config.provider ?? '',
    model: config.model ?? '',
    reasoningEffort: config.reasoningEffort ?? '',
    disabledProviders: [...(config.disabledProviders ?? [])],
    modeModels: { ...(config.modeModels ?? {}) },
    blockDefault: config.display?.blockDefault ?? 'collapsed',
    showReasoning: config.display?.showReasoning !== false,
    blockModes: {
      reasoning: config.display?.blocks?.reasoning ?? '',
      terminal: config.display?.blocks?.terminal ?? '',
      edit: config.display?.blocks?.edit ?? '',
      mcp: config.display?.blocks?.mcp ?? '',
    },
    autoApprove: sortedTools(config.autoApproveTools ?? DEFAULT_AUTO_APPROVE),
    permissionRules: flattenPermission(config.permission),
    compactionModel: config.compactionModel ?? '',
    subagentModel: config.subagentModel ?? '',
    sessionRetentionDays: config.sessionRetentionDays === undefined ? '' : String(config.sessionRetentionDays),
  };
}

/** Why the retention box cannot be saved, or undefined when it is blank or a whole number of days from 1 up. */
export function retentionProblem(text: string): string | undefined {
  const t = text.trim();
  if (!t) return undefined;
  return /^[1-9]\d*$/.test(t) ? undefined : 'Enter a whole number of days, 1 or more.';
}

function flattenPermission(config: PermissionConfigLike | undefined): PermissionRuleDraft[] {
  const out: PermissionRuleDraft[] = [];
  for (const [permission, value] of Object.entries(config ?? {})) {
    if (typeof value === 'string') out.push({ permission, pattern: '*', action: value });
    else for (const [pattern, action] of Object.entries(value ?? {})) out.push({ permission, pattern, action });
  }
  return out;
}

/** Back to the config shape: grouped by permission in first-seen order, blank patterns dropped, a lone catch-all kept bare. */
export function buildPermission(rules: readonly PermissionRuleDraft[]): PermissionConfigLike | null {
  const grouped = new Map<string, Array<[string, PermissionRuleDraft['action']]>>();
  for (const r of rules) {
    const pattern = String(r.pattern ?? '').trim();
    if (!pattern || !r.permission) continue;
    const list = grouped.get(r.permission) ?? [];
    list.push([pattern, r.action]);
    grouped.set(r.permission, list);
  }
  if (grouped.size === 0) return null;
  const out: PermissionConfigLike = {};
  for (const [permission, list] of grouped) {
    out[permission] = list.length === 1 && list[0]![0] === '*' ? list[0]![1] : Object.fromEntries(list);
  }
  return out;
}

/** Loaded custom agents → drafts. Runtime-only keys (`builtin`) are not carried back to disk. */
export function agentsToDraft(list: readonly Record<string, unknown>[]): AgentDraft[] {
  return list.map((a) => {
    const { id, description, systemPrompt, allowedTools, builtin: _builtin, ...extra } = a;
    return {
      id: String(id ?? ''),
      description: String(description ?? ''),
      systemPrompt: String(systemPrompt ?? ''),
      allowedTools: Array.isArray(allowedTools) ? allowedTools.map(String) : [],
      extra,
    };
  });
}

export function sandboxToDraft(s: SandboxLike): SandboxDraft {
  const rules: PolicyRule[] = [];
  for (const [tool, policy] of Object.entries(s.policies ?? {})) {
    for (const [dimension, patterns] of Object.entries(policy)) {
      for (const pattern of patterns ?? []) rules.push({ tool, dimension, pattern });
    }
  }
  return { allowTools: [...(s.allowTools ?? [])], denyTools: [...(s.denyTools ?? [])], rules };
}

export function draftToSandbox(s: SandboxDraft): SandboxLike {
  const policies: Record<string, Record<string, string[]>> = {};
  for (const r of s.rules) {
    const pattern = String(r.pattern ?? '').trim();
    if (!pattern) continue;
    const forTool = (policies[r.tool] ??= {});
    (forTool[r.dimension] ??= []).push(pattern);
  }
  return {
    ...(s.allowTools.length ? { allowTools: [...s.allowTools] } : {}),
    ...(s.denyTools.length ? { denyTools: [...s.denyTools] } : {}),
    ...(Object.keys(policies).length ? { policies } : {}),
  };
}

/** What would be saved for a key: an empty or blank mode-model box saves nothing, so it is not a change. */
function comparable(draft: SettingsDraft, k: DraftKey): string {
  if (k !== 'modeModels') return JSON.stringify(draft[k]);
  return JSON.stringify(Object.entries(draft.modeModels).map(([id, ref]) => [id, ref.trim()] as const).filter(([, ref]) => ref !== '').sort(([a], [b]) => a.localeCompare(b)));
}

export function dirtyKeys(saved: SettingsDraft, draft: SettingsDraft): DraftKey[] {
  return ALL_KEYS.filter((k) => comparable(saved, k) !== comparable(draft, k));
}

export function saveMessages(draft: SettingsDraft, dirty: readonly DraftKey[]): SaveMessage[] {
  const out: SaveMessage[] = [];
  const patch: Record<string, unknown> = {};
  if (dirty.includes('provider')) patch.provider = draft.provider;
  if (dirty.includes('model')) patch.model = draft.model;
  // null, not undefined: postMessage drops undefined keys, and the host turns null into a deletion.
  if (dirty.includes('reasoningEffort')) patch.reasoningEffort = draft.reasoningEffort || null;
  if (dirty.includes('disabledProviders')) patch.disabledProviders = [...draft.disabledProviders];
  if (dirty.includes('modeModels')) {
    const kept = Object.fromEntries(Object.entries(draft.modeModels).map(([id, ref]) => [id, ref.trim()] as const).filter(([, ref]) => ref !== ''));
    patch.modeModels = Object.keys(kept).length ? kept : null;
  }
  if (dirty.includes('blockDefault') || dirty.includes('showReasoning') || dirty.includes('blockModes')) {
    const blocks = Object.fromEntries(BLOCK_MODE_KEYS.filter((k) => draft.blockModes[k]).map((k) => [k, draft.blockModes[k]] as const));
    patch.display = { blockDefault: draft.blockDefault, showReasoning: draft.showReasoning, ...(Object.keys(blocks).length ? { blocks } : {}) };
  }
  // The default set is stored as "not set"; only a changed list is written.
  if (dirty.includes('autoApprove')) {
    patch.autoApproveTools = JSON.stringify(sortedTools(draft.autoApprove)) === JSON.stringify(sortedTools(DEFAULT_AUTO_APPROVE)) ? null : sortedTools(draft.autoApprove);
  }
  if (dirty.includes('permissionRules')) patch.permission = buildPermission(draft.permissionRules);
  if (dirty.includes('compactionModel')) patch.compactionModel = draft.compactionModel.trim() || null;
  if (dirty.includes('subagentModel')) patch.subagentModel = draft.subagentModel.trim() || null;
  if (dirty.includes('sessionRetentionDays') && !retentionProblem(draft.sessionRetentionDays)) {
    patch.sessionRetentionDays = draft.sessionRetentionDays.trim() === '' ? null : Number(draft.sessionRetentionDays);
  }
  if (Object.keys(patch).length) out.push({ type: 'save', patch });
  if (dirty.includes('sandbox')) out.push({ type: 'saveSandbox', sandbox: draftToSandbox(draft.sandbox) });
  if (dirty.includes('agents')) {
    out.push({
      type: 'saveAgents',
      agents: draft.agents.map((a) => ({ ...a.extra, id: a.id, description: a.description, systemPrompt: a.systemPrompt, allowedTools: a.allowedTools })),
    });
  }
  return out;
}

/** After a save succeeded for `keys`, the saved baseline takes the draft's values for exactly those keys. */
export function markSaved(saved: SettingsDraft, draft: SettingsDraft, keys: readonly DraftKey[]): SettingsDraft {
  const next = { ...saved } as Record<DraftKey, unknown>;
  for (const k of keys) next[k] = JSON.parse(JSON.stringify(draft[k]));
  return next as unknown as SettingsDraft;
}

export interface IndexEntry { section: string; sectionLabel: string; rowId: string; label: string; description: string; keywords?: string }

const RAW_INDEX: readonly IndexEntry[] = [
  { section: 'model', sectionLabel: 'Model', rowId: 'row-provider', label: 'Provider', description: 'The provider Forge uses for chat, specs and agents' },
  { section: 'model', sectionLabel: 'Model', rowId: 'row-model', label: 'Model', description: 'Model for the selected provider' },
  { section: 'model', sectionLabel: 'Model', rowId: 'row-effort', label: 'Reasoning effort', description: 'Only used by models that support reasoning' },
  { section: 'model', sectionLabel: 'Model', rowId: 'row-hidden', label: 'Providers', description: 'Turn a provider off to skip it in auto-detect and leave it out of the model pickers' },
  { section: 'model', sectionLabel: 'Model', rowId: 'row-mode-models', label: 'Model per mode', description: 'Give Ask, Debug, Plan and other built-in modes their own model; blank uses the main model' },
  { section: 'model', sectionLabel: 'Model', rowId: 'row-compaction-model', label: 'Compaction model', description: 'The model that summarises long chats; blank uses the main model' },
  { section: 'model', sectionLabel: 'Model', rowId: 'row-subagent-model', label: 'Sub-agent model', description: 'The model helper agents use; blank uses the chat model' },
  { section: 'providers', sectionLabel: 'Providers', rowId: 'row-providers', label: 'Custom providers', description: 'Add an OpenAI-compatible service or start from a preset such as Groq or DeepSeek' },
  { section: 'model', sectionLabel: 'Model', rowId: 'row-retention', label: 'Delete old chats', description: 'Delete saved chats not used for this many days when Forge starts' },
  { section: 'keys', sectionLabel: 'API keys', rowId: 'row-keys', label: 'API keys', description: 'Stored in VS Code secret storage, never in settings files' },
  { section: 'agents', sectionLabel: 'Agents', rowId: 'row-agents', label: 'Custom agents', description: 'Agents in the chat mode menu and parallel runs' },
  { section: 'mcp', sectionLabel: 'MCP servers', rowId: 'row-mcp', label: 'MCP servers', description: 'Servers that give Forge extra tools; turn on or off, install from the catalog' },
  { section: 'skills', sectionLabel: 'Skills', rowId: 'row-skills', label: 'Skills', description: 'Markdown instructions loaded when a task matches; browse the catalog' },
  { section: 'instructions', sectionLabel: 'Instructions', rowId: 'row-instructions', label: 'Instruction files', description: 'AGENTS.md, CLAUDE.md and CONVENTIONS.md: which Forge reads, which are cut off; start one' },
  { section: 'perm', sectionLabel: 'Permissions', rowId: 'row-tools', label: 'Tools: ask, allow or block', description: 'Per tool: confirm each call, run without asking, or hide it from Forge' },
  { section: 'perm', sectionLabel: 'Permissions', rowId: 'row-allow', label: 'Allowed tools', description: 'Only these tools are offered; empty allows all' },
  { section: 'perm', sectionLabel: 'Permissions', rowId: 'row-pattern-rules', label: 'Pattern rules', description: 'Ordered allow, ask or deny rules for reads, edits, shell commands and web access; the last match wins' },
  { section: 'perm', sectionLabel: 'Permissions', rowId: 'row-rules', label: 'Rules', description: 'Limit a tool to, or keep it away from, paths, commands or URLs' },
  { section: 'display', sectionLabel: 'Display', rowId: 'row-blocks', label: 'Tool rows', description: 'Whether tool calls in the chat start open or closed' },
  { section: 'display', sectionLabel: 'Display', rowId: 'row-show-reasoning', label: 'Show reasoning', description: "Show the model's reasoning above each reply" },
  { section: 'display', sectionLabel: 'Display', rowId: 'row-block-modes', label: 'Blocks by kind', description: 'Reasoning, command output, file edits and MCP results: hidden, collapsed or expanded' },
  { section: 'about', sectionLabel: 'About', rowId: 'row-about', label: 'Version and help', description: 'Which version is running; open the log, report an issue, read the documentation' },
  { section: 'backup', sectionLabel: 'Backup', rowId: 'row-backup', label: 'Export and import', description: 'Settings, agents, MCP servers and permissions as JSON; keys are never exported' },
];

/** Words people search for that the labels do not contain: provider names, tool names, synonyms. */
const KEYWORDS: Record<string, string> = {
  'row-provider': 'openai anthropic claude gemini google minimax openrouter bedrock vertex azure ollama lm studio auto detect',
  'row-model': 'custom model id refresh list live gpt claude gemini minimax llm',
  'row-effort': 'thinking reasoning low medium high',
  'row-hidden': 'hide show enable disable provider',
  'row-mode-models': 'agent mode cheap fast strong small subagent override',
  'row-compaction-model': 'summary summarise condense cheap small',
  'row-retention': 'history sessions prune cleanup days keep',
  'row-subagent-model': 'subagent sub-agent helper delegate cheap small',
  'row-providers': 'groq deepseek mistral xai cerebras together fireworks custom endpoint base url openai compatible proxy gateway preset',
  'row-keys': 'openai anthropic claude gemini google minimax openrouter bedrock vertex azure ollama lm studio token secret password paste test key',
  'row-agents': 'specialist mode plan code debug ask review prompt',
  'row-mcp': 'server tools install reload json model context protocol',
  'row-skills': 'catalog markdown instructions install rescan',
  'row-tools': 'approve approval ask allow block deny permission read_file write_file edit_file edit_notebook run_command fetch_url memory sub_agent read_image list_files search_files find_symbol list_symbols find_references autonomous',
  'row-allow': 'whitelist only specific tools',
  'row-rules': 'path glob regex command url sandbox deny allow policy',
  'row-pattern-rules': 'permission rules bash command glob env secrets external directory ask allow deny order',
  'row-blocks': 'collapse expand tool calls chat',
  'row-show-reasoning': 'thinking thought think',
  'row-backup': 'export import json restore settings file',
  'row-instructions': 'agents claude conventions rules steering prompt project notes system',
  'row-about': 'version build log output bug report help support docs readme',
};

/** Every `forge.*` row is searchable by its label and its setting name (forge.maxCostUsd). */
const ROW_INDEX: readonly IndexEntry[] = SETTING_ROWS.map((r) => ({ section: r.section, sectionLabel: SECTION_LABELS[r.section], rowId: rowId(r.key), label: r.label, description: r.key }));

export const SETTINGS_INDEX: readonly IndexEntry[] = [...RAW_INDEX, ...ROW_INDEX].map((e) => ({ ...e, ...(KEYWORDS[e.rowId] ? { keywords: KEYWORDS[e.rowId]! } : {}) }));

/** Every typed word must match; a hit in the label outranks one in the description or keywords. */
export function filterSettings(index: readonly IndexEntry[], query: string): IndexEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: Array<{ entry: IndexEntry; score: number }> = [];
  for (const entry of index) {
    const label = entry.label.toLowerCase();
    const rest = `${entry.description} ${entry.sectionLabel} ${entry.keywords ?? ''}`.toLowerCase();
    let score = 0;
    let all = true;
    for (const t of terms) {
      if (label.includes(t)) score += label.startsWith(t) ? 3 : 2;
      else if (rest.includes(t)) score += 1;
      else { all = false; break; }
    }
    if (all) scored.push({ entry, score });
  }
  // Array.prototype.sort is stable, so equal scores keep the page order.
  return scored.sort((a, b) => b.score - a.score).map((x) => x.entry);
}
