/**
 * Turns the `forge.*` agent settings into the AgentConfig fields they control.
 * Pure (type-only imports), so it is unit-tested without the extension host.
 */
import {
  DEFAULT_INJECTION_BUDGET,
  MAX_BODY_CHARS,
  createExploreEditRouter,
  createFileAuditSink,
  expandModelAlias,
  resolveModelAlias,
  webSearchFromEnv,
  type AgentConfig,
  type ModelAliases,
  type ModelConfig,
  type WebSearchConfig,
  type WebSearchProvider,
} from '@ikarmic/forge-core';

/** Per-check cap for commands detected from the project (explicit commands keep the 5-minute default). */
const AUTO_VERIFY_TIMEOUT_MS = 120_000;

/** `forge.autoLint.commands` as extension -> command: leading dots dropped, empty or non-string entries ignored. */
export function cleanLintCommands(raw: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    const ext = key.trim().replace(/^\./, '');
    if (ext && typeof value === 'string' && value.trim()) out[ext] = value.trim();
  }
  return out;
}

export interface RunExtrasSettings {
  compaction: { enabled: boolean; threshold: number };
  context: { budgetTokens: number; maskOldResults: boolean; keepRecentTurns: number };
  memory: { enabled: boolean; injectionBudgetBytes: number; maxBodyChars: number; autoApproveWrites: boolean };
  maxCostUsd: number;
  /** Stop a run after this many identical tool calls in a row; 0 or absent = off. */
  loopGuardThreshold?: number;
  cheapModel: string;
  verifyCommands: string[];
  verifyLsp?: boolean;
  semanticSearch: boolean;
  browser: { enabled: boolean; headless: boolean };
  audit: { enabled: boolean };
  cachePrompts: boolean;
  /** Size of the repo map in the system prompt; 0 or absent = off. */
  repoMapTokens?: number;
  /** Per-file check after each write; absent or disabled = off. */
  autoLint?: { enabled: boolean; commands: Record<string, string> };
  webSearch?: { provider: 'off' | 'auto' | WebSearchProvider; searxngUrl: string };
}

/** The web_search backend for these settings, or null when it is off or nothing is configured. */
export function webSearchFor(settings: RunExtrasSettings['webSearch'], env: NodeJS.ProcessEnv = process.env): WebSearchConfig | null {
  if (!settings || settings.provider === 'off') return null;
  const withUrl = settings.searxngUrl ? { ...env, SEARXNG_URL: settings.searxngUrl } : env;
  return webSearchFromEnv(withUrl, settings.provider === 'auto' ? undefined : settings.provider) ?? null;
}

/**
 * First alias error (loop / chain too long) among the models a run will use,
 * so the chat can report it before it claims the run slot. Empty names skip.
 */
export function aliasProblem(names: string[], aliases: ModelAliases | undefined): string | undefined {
  for (const name of names) {
    if (!name) continue;
    try {
      expandModelAlias(name, aliases);
    } catch (err) {
      return (err as Error).message;
    }
  }
  return undefined;
}

export function buildRunExtras(
  settings: RunExtrasSettings,
  model: ModelConfig,
  opts: {
    readOnly: boolean;
    aliases?: ModelAliases;
    /** The commands were detected from the project: cap them at 120s and skip slow ones; `approve` asks first. */
    verifyAuto?: { approve?: (commands: string[]) => Promise<boolean> };
  }
): Partial<AgentConfig> {
  // Spec generation is a read-only exploration: no compaction/verify/budget games, just search.
  const extras: Partial<AgentConfig> = settings.semanticSearch ? { semanticSearch: {} } : {};
  // Auditing applies to every run, including read-only ones.
  if (settings.audit.enabled) extras.audit = createFileAuditSink();
  if (!settings.cachePrompts) extras.cachePrompts = false;
  // Memory applies to every run; only non-default values are passed on.
  if (!settings.memory.enabled) extras.disableMemory = true;
  if (settings.memory.injectionBudgetBytes !== DEFAULT_INJECTION_BUDGET) extras.memoryInjectionBudget = settings.memory.injectionBudgetBytes;
  if (settings.memory.maxBodyChars !== MAX_BODY_CHARS) extras.memoryMaxBodyChars = settings.memory.maxBodyChars;
  if (settings.memory.autoApproveWrites) extras.memoryAutoApproveWrites = true;
  // The outline helps read-only exploration too (spec generation).
  if ((settings.repoMapTokens ?? 0) > 0) extras.repoMap = { tokens: settings.repoMapTokens };
  if (opts.readOnly) return extras;
  const webSearch = webSearchFor(settings.webSearch);
  if (webSearch) extras.webSearch = webSearch;
  if (settings.autoLint?.enabled) extras.autoLint = { commands: settings.autoLint.commands };

  if (settings.compaction.enabled) {
    extras.enableCompaction = true;
    extras.compactionThreshold = settings.compaction.threshold;
  }
  if (settings.context.budgetTokens > 0) extras.contextBudgetTokens = settings.context.budgetTokens;
  extras.maskOldResults = settings.context.maskOldResults ? { keepRecentTurns: settings.context.keepRecentTurns } : false;
  if (settings.maxCostUsd > 0) extras.maxCostUsd = settings.maxCostUsd;
  if ((settings.loopGuardThreshold ?? 0) > 0) extras.loopGuardThreshold = settings.loopGuardThreshold;
  const cheap = settings.cheapModel.trim();
  if (cheap) {
    const cheapModel = { ...model, ...resolveModelAlias(cheap, opts.aliases, model.provider) };
    if (cheapModel.model !== model.model || cheapModel.provider !== model.provider) {
      extras.modelRouter = createExploreEditRouter({ strong: model, cheap: cheapModel });
    }
  }
  if (settings.verifyCommands.length > 0 || settings.verifyLsp) {
    extras.verify = {
      commands: settings.verifyCommands,
      ...(settings.verifyLsp ? { lsp: true } : {}),
      ...(opts.verifyAuto
        ? {
            timeoutMs: AUTO_VERIFY_TIMEOUT_MS,
            slowCheckPolicy: 'skip' as const,
            ...(opts.verifyAuto.approve ? { approve: opts.verifyAuto.approve } : {}),
          }
        : {}),
    };
  }
  if (settings.browser.enabled) extras.browser = { headless: settings.browser.headless };
  return extras;
}
