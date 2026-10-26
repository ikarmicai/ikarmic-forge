import * as vscode from 'vscode';

import { defaultModelFor, fastDefaultFor, hasProviderKey } from '@ikarmic/forge-core';
import type { ModelConfig, ProviderName } from '@ikarmic/forge-core';

import { namedProviderModel } from './model-ref.js';
import { emptyApiKeys, type ProviderEnvSettings, type ResolvedApiKeys } from './api-keys.js';
import { storedApprovalOf, type StoredApproval } from './chat/approval-level.js';
import { cleanLintCommands } from './chat/run-extras.js';
import type { VoiceConfig } from './chat/voice-types.js';
import { clampSetting } from './setting-range.js';

/**
 * Forge extension configuration. Pulls from VS Code's `forge.*` settings and
 * falls back to environment variables for API keys (so the same key set
 * works in the CLI and the extension).
 */
export interface ExtensionConfig {
  provider: ProviderName | 'auto';
  model: string;
  completionModel: string;
  completionDebounceMs: number;
  /**
   * Max tokens the model may emit for an inline completion. Higher values
   * allow multi-line suggestions; lower values keep responses snappy.
   */
  completionMaxTokens: number;
  /**
   * Opt-in: count how often completions are shown / accepted and surface the
   * rate in the status bar tooltip. Strictly local: no network calls, no
   * persisted history beyond the active session.
   */
  completionTelemetry: boolean;
  /** Master switch for inline completion. */
  completionEnabled: boolean;
  /** False: suggest only when the user presses the trigger key. */
  completionAutomatic: boolean;
  /**
   * Voice input settings. The webview reads these via a `voice_config`
   * message on `ready` and after every settings change.
   */
  voice: VoiceConfig;
  /** Chat checkpoint capture (spec 2026-09-29-vscode-chat-foundation §5). */
  checkpoints: { enabled: boolean; captureCommands: boolean };
  /** Summarize older turns as the conversation nears the model window. */
  compaction: { enabled: boolean; threshold: number; keepRecent: number };
  /** Semantic index and search: which embedder, how many results, how similar a hit must be, which files. */
  semantic: { embedder: 'env' | 'hashing' | 'openai' | 'ollama' | 'custom'; model: string; baseUrl: string; apiKeyEnv: string; batchSize: number; resultLimit: number; minScore: number; extensions: string };
  /** Limits on what tools hand back to the model. */
  tools: { maxOutputChars: number };
  /** Spend fewer prompt tokens: a token budget for compaction, and masking of old tool results. */
  context: { budgetTokens: number; maskOldResults: boolean; keepRecentTurns: number };
  /** Project memory: load it, how much goes in the prompt, how long a saved entry may be, and whether saving asks. */
  memory: { enabled: boolean; injectionBudgetBytes: number; maxBodyChars: number; autoApproveWrites: boolean };
  /** Per-run spend cap in USD; 0 = no cap. */
  maxCostUsd: number;
  /** Hold the computer awake while a chat run is working. */
  keepAwake: boolean;
  /** Stop a run after this many identical tool calls in a row; 0 = off. */
  loopGuardThreshold: number;
  /** Steps one run may take before it stops with a summary; 0 = no limit. */
  maxSteps: number;
  /** Run commands under the OS sandbox (Linux and macOS). */
  commandSandbox: 'off' | 'on' | 'on-network';
  /** The most turns one /goal runs before it pauses. */
  goalMaxTurns: number;
  /** Notify when a run finishes while the window is not focused. */
  notifications: { enabled: boolean; minSeconds: number; sound: boolean; osToast: boolean };
  /** Show the tokens-per-second badge on replies. */
  showSpeed: boolean;
  /** Which earlier prompts the arrow keys bring back: all chats or this one. */
  promptHistory: 'shared' | 'perChat';
  /** The approval level new chats start at, from the first-run card. */
  approvalDefault: StoredApproval;
  /** Model id (same provider) for read-only exploration steps; empty = always use the main model. */
  cheapModel: string;
  /** Add Anthropic prompt-cache breakpoints (default true). */
  cachePrompts: boolean;
  /** Ranked codebase outline of about this many tokens in the system prompt; 0 = off. */
  repoMapTokens: number;
  /** Check each file the agent writes (syntax, plus linter commands by extension) and feed problems back. */
  autoLint: { enabled: boolean; commands: Record<string, string> };
  /** Commit the agent's changes after each completed run (git repositories only). */
  autoCommit: { enabled: boolean; dirtyCommits: boolean; attribute: boolean; runHooks: boolean; instruction?: string; language?: string };
  /** Architect mode: main model plans read-only, `editorModel` applies the plan. */
  architect: { enabled: boolean; editorModel: string };
  /** Checks run after edits; failures are fed back to the model. */
  verifyCommands: string[];
  verifyLsp: boolean;
  /** Run the project's own typecheck/lint/test commands after edits: ask once, always, or never. */
  verifyAuto: 'ask' | 'on' | 'off';
  /** Add the `codebase_search` tool. */
  semanticSearch: boolean;
  /** Browser tools (open a page, screenshot, console errors). */
  browser: { enabled: boolean; headless: boolean };
  github: { enabled: boolean };
  webSearch: { provider: 'off' | 'auto' | 'brave' | 'tavily' | 'searxng'; searxngUrl: string };
  /** `forge.docs`: @docs:<name> sources. */
  docs: Record<string, string>;
  /** Append a redacted record of every run and tool call to ~/.forge/audit.log. */
  audit: { enabled: boolean };
  /** Run agent shell commands in a visible VS Code terminal instead of a hidden child process. */
  terminal: { integrated: boolean };
  /** Connect MCP servers from ~/.forge/mcp.json (and the workspace, when trusted). */
  mcp: { enabled: boolean };
  providerEnv: ProviderEnvSettings;
  apiKeys: ResolvedApiKeys;
}

const CONFIG_SECTION = 'forge';

export function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const apiKeys = emptyApiKeys();
  apiKeys.openai = cfg.get<string>('apiKeys.openai') ?? process.env.OPENAI_API_KEY ?? '';
  apiKeys.anthropic = cfg.get<string>('apiKeys.anthropic') ?? process.env.ANTHROPIC_API_KEY ?? '';
  apiKeys.google =
    cfg.get<string>('apiKeys.google') ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
  apiKeys.openrouter = cfg.get<string>('apiKeys.openrouter') ?? process.env.OPENROUTER_API_KEY ?? '';
  apiKeys.minimax = cfg.get<string>('apiKeys.minimax') ?? process.env.MINIMAX_API_KEY ?? '';
  apiKeys.bedrock = process.env.AWS_BEARER_TOKEN_BEDROCK ?? '';
  apiKeys.azure = process.env.AZURE_API_KEY ?? '';
  apiKeys['openai-compatible'] = process.env.OPENAI_COMPATIBLE_API_KEY ?? '';
  return {
    provider: (cfg.get<string>('provider') ?? 'auto') as ExtensionConfig['provider'],
    model: cfg.get<string>('model') ?? '',
    completionModel: cfg.get<string>('completionModel') ?? '',
    completionDebounceMs: clampSetting(cfg.get<number>('completionDebounceMs'), 350, 0, 3000),
    completionMaxTokens: clampSetting(cfg.get<number>('completionMaxTokens'), 512, 32, 2048),
    completionTelemetry: cfg.get<boolean>('completionTelemetry') ?? false,
    completionEnabled: cfg.get<boolean>('completionEnabled') ?? true,
    completionAutomatic: cfg.get<boolean>('completionAutomatic') ?? true,
    voice: {
      enabled: cfg.get<boolean>('voice.enabled') ?? true,
      language: cfg.get<string>('voice.language') ?? '',
      autoSubmit: cfg.get<boolean>('voice.autoSubmit') ?? false,
      continuous: cfg.get<boolean>('voice.continuous') ?? false,
      interimResults: cfg.get<boolean>('voice.interimResults') ?? true,
    },
    checkpoints: {
      enabled: cfg.get<boolean>('checkpoints.enabled') ?? true,
      captureCommands: cfg.get<boolean>('checkpoints.captureCommands') ?? false,
    },
    compaction: {
      enabled: cfg.get<boolean>('compaction.enabled') ?? true,
      threshold: clampSetting(cfg.get<number>('compaction.threshold'), 0.7, 0.3, 0.95),
      keepRecent: Math.floor(clampSetting(cfg.get<number>('compaction.keepRecent'), 4, 1, 50)),
    },
    tools: { maxOutputChars: Math.max(5000, cfg.get<number>('tools.maxOutputChars') ?? 200000) },
    semantic: {
      embedder: (cfg.get<string>('semantic.embedder') ?? 'env') as ExtensionConfig['semantic']['embedder'],
      model: cfg.get<string>('semantic.model') ?? '',
      baseUrl: cfg.get<string>('semantic.baseUrl') ?? '',
      apiKeyEnv: cfg.get<string>('semantic.apiKeyEnv') ?? '',
      batchSize: Math.max(0, cfg.get<number>('semantic.batchSize') ?? 0),
      resultLimit: Math.max(0, cfg.get<number>('semantic.resultLimit') ?? 0),
      minScore: Math.max(0, cfg.get<number>('semantic.minScore') ?? 0),
      extensions: cfg.get<string>('semantic.extensions') ?? '',
    },
    context: {
      budgetTokens: Math.max(0, cfg.get<number>('context.budgetTokens') ?? 60000),
      maskOldResults: cfg.get<boolean>('context.maskOldResults') ?? true,
      keepRecentTurns: Math.max(2, cfg.get<number>('context.keepRecentTurns') ?? 6),
    },
    memory: {
      enabled: cfg.get<boolean>('memory.enabled') ?? true,
      injectionBudgetBytes: Math.max(0, cfg.get<number>('memory.injectionBudgetBytes') ?? 8000),
      maxBodyChars: Math.max(1, cfg.get<number>('memory.maxBodyChars') ?? 1200),
      autoApproveWrites: cfg.get<boolean>('memory.autoApproveWrites') ?? false,
    },
    maxCostUsd: clampSetting(cfg.get<number>('maxCostUsd'), 0, 0),
    keepAwake: cfg.get<boolean>('keepAwake') ?? false,
    loopGuardThreshold: Math.max(0, Math.floor(cfg.get<number>('loopGuardThreshold') ?? 0)),
    maxSteps: Math.max(0, Math.floor(cfg.get<number>('maxSteps') ?? 50)),
    commandSandbox: (['on', 'on-network'] as const).find((v) => v === cfg.get<string>('commandSandbox')) ?? 'off',
    goalMaxTurns: Math.max(1, Math.floor(cfg.get<number>('goalMaxTurns') ?? 25)),
    notifications: {
      enabled: cfg.get<boolean>('notifications.enabled') ?? false,
      minSeconds: Math.max(0, cfg.get<number>('notifications.minSeconds') ?? 20),
      sound: cfg.get<boolean>('notifications.sound') ?? false,
      osToast: cfg.get<boolean>('notifications.osToast') ?? false,
    },
    showSpeed: cfg.get<boolean>('chat.showSpeed') ?? true,
    promptHistory: cfg.get<string>('chat.promptHistory') === 'perChat' ? 'perChat' : 'shared',
    approvalDefault: storedApprovalOf(cfg.get<string>('approvalDefault')),
    cheapModel: cfg.get<string>('router.cheapModel') ?? '',
    cachePrompts: cfg.get<boolean>('cachePrompts') ?? true,
    repoMapTokens: Math.max(0, Math.floor(cfg.get<number>('repoMap.tokens') ?? 0)),
    autoLint: {
      enabled: cfg.get<boolean>('autoLint.enabled') ?? false,
      commands: cleanLintCommands(cfg.get<Record<string, unknown>>('autoLint.commands')),
    },
    autoCommit: {
      enabled: cfg.get<boolean>('autoCommit.enabled') ?? false,
      dirtyCommits: cfg.get<boolean>('autoCommit.dirtyCommits') ?? true,
      attribute: cfg.get<boolean>('autoCommit.attribute') ?? true,
      runHooks: cfg.get<boolean>('autoCommit.runHooks') ?? false,
      ...(cfg.get<string>('commitMessage.prompt')?.trim() ? { instruction: cfg.get<string>('commitMessage.prompt')!.trim() } : {}),
      ...(cfg.get<string>('commitMessage.language')?.trim() ? { language: cfg.get<string>('commitMessage.language')!.trim() } : {}),
    },
    architect: {
      enabled: cfg.get<boolean>('architect.enabled') ?? false,
      editorModel: (cfg.get<string>('architect.editorModel') ?? '').trim(),
    },
    verifyCommands: (cfg.get<string[]>('verify.commands') ?? []).filter((c) => c.trim().length > 0),
    verifyLsp: cfg.get<boolean>('verify.lsp') ?? false,
    verifyAuto: ((v) => (v === 'on' || v === 'off' ? v : 'ask'))(cfg.get<string>('verify.auto')),
    semanticSearch: cfg.get<boolean>('semanticSearch') ?? false,
    github: { enabled: cfg.get<boolean>('github.enabled') ?? false },
    webSearch: {
      provider: (['off', 'auto', 'brave', 'tavily', 'searxng'] as const).find((p) => p === cfg.get<string>('webSearch.provider')) ?? 'off',
      searxngUrl: (cfg.get<string>('webSearch.searxngUrl') ?? '').trim(),
    },
    docs: Object.fromEntries(
      Object.entries(cfg.get<Record<string, unknown>>('docs') ?? {}).filter(
        (e): e is [string, string] => typeof e[1] === 'string' && /^https?:\/\//.test(e[1])
      ).map(([k, v]) => [k.toLowerCase(), v])
    ),
    browser: {
      enabled: cfg.get<boolean>('browser.enabled') ?? false,
      headless: cfg.get<boolean>('browser.headless') ?? true,
    },
    audit: { enabled: cfg.get<boolean>('audit.enabled') ?? false },
    terminal: { integrated: cfg.get<boolean>('terminal.integrated') ?? true },
    mcp: { enabled: cfg.get<boolean>('mcp.enabled') ?? true },
    providerEnv: {
      awsRegion: cfg.get<string>('providers.awsRegion') ?? '',
      vertexProject: cfg.get<string>('providers.vertexProject') ?? '',
      vertexLocation: cfg.get<string>('providers.vertexLocation') ?? '',
      azureResourceName: cfg.get<string>('providers.azureResourceName') ?? '',
      azureBaseUrl: cfg.get<string>('providers.azureBaseUrl') ?? '',
      openaiCompatibleBaseUrl: cfg.get<string>('providers.openaiCompatibleBaseUrl') ?? '',
      lmstudioBaseUrl: cfg.get<string>('providers.lmstudioBaseUrl') ?? '',
      ollamaBaseUrl: cfg.get<string>('providers.ollamaBaseUrl') ?? '',
    },
    apiKeys,
  };
}

/**
 * Resolve the effective model based on config + which API keys are present.
 * Same precedence as the CLI: explicit setting > env var fallback > default.
 */
export function resolveModel(cfg: ExtensionConfig): ModelConfig {
  // `id:model` on a named provider needs no built-in key at all.
  const named = namedProviderModel(cfg.model, cfg.provider);
  if (named) return named;
  const provider = pickProvider(cfg);
  if (!provider) {
    throw new Error(
      'No Forge provider configured. Set forge.provider + an API key in Settings, ' +
        'or export OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY.'
    );
  }
  const defaultModel = defaultModelFor(provider);
  return {
    provider,
    model: cfg.model.trim() || defaultModel,
  };
}

/**
 * Resolve the model used for inline completions. If the user set
 * `forge.completionModel`, use that; otherwise pick a fast model.
 */
export function resolveCompletionModel(cfg: ExtensionConfig): ModelConfig {
  const provider = pickProvider(cfg);
  if (!provider) {
    throw new Error('No provider configured: see forge.provider in Settings.');
  }
  if (cfg.completionModel.trim()) {
    return { provider, model: cfg.completionModel.trim() };
  }
  return { provider, model: fastDefaultFor(provider) };
}

/** Auto-detection order. Cloud-account providers (Bedrock, Vertex, Azure) are never auto-picked from ambient credentials. */
const AUTO_ORDER = ['anthropic', 'openai', 'google', 'openrouter', 'minimax'] as const;

function pickProvider(cfg: ExtensionConfig): ProviderName | null {
  if (cfg.provider !== 'auto') return cfg.provider;
  for (const p of AUTO_ORDER) if (cfg.apiKeys[p]) return p;
  return null;
}

/** True when the chosen provider has what it needs (used to give early, specific errors). */
export function providerReady(provider: ProviderName, cfg: ExtensionConfig): boolean {
  return cfg.apiKeys[provider as keyof ResolvedApiKeys] ? true : hasProviderKey(provider);
}
