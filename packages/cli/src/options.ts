import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command, Option } from 'commander';

import {
  createExploreEditRouter,
  createFileAuditSink,
  detectProvider,
  defaultModelFor,
  expandModelAlias,
  HooksBus,
  loadForgeConfigFile,
  applyResolved,
  resolveAutoApprove,
  loadHooksConfig,
  loadSkillsRegistryAsync,
  loadSteering,
  loadToolSandboxConfig,
  mergeToolSandbox,
  resolveModelAlias,
  SPEC_READONLY_TOOLS,
  splitModelRef,
  githubFromEnv,
  type GitHubConfig,
  WEB_SEARCH_PROVIDERS,
  webSearchFromEnv,
  type WebSearchConfig,
  type WebSearchProvider,
} from '@ikarmic/forge-core';
import type { AgentConfig, ModelAliases, ModelConfig, ProviderEndpoint, ProviderName, ToolSandbox } from '@ikarmic/forge-core';

type ReasoningEffort = NonNullable<ModelConfig['reasoningEffort']>;
const REASONING_EFFORTS: readonly ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export interface CliOptions {
  task: string | null;
  provider: ProviderName | null;
  model: string | null;
  /** Set when `--model id:model` names a preset or customProviders id: where that provider is reached. */
  endpoint?: ProviderEndpoint;
  auto: boolean;
  allowDestructive: boolean;
  cwd: string | null;
  maxIterations: number | null;
  maxDurationMs: number | null;
  /** `--max-cost <usd>`: stop the run once its USD cost reaches this. */
  maxCostUsd: number | null;
  /** `--loop-guard <n>`: stop the run after this many identical tool calls in a row. */
  loopGuardThreshold: number | null;
  /** `--sandbox [network]`: run commands in the OS sandbox. */
  commandSandbox: 'off' | 'on' | 'on-network';
  /** `--sandbox-allow-host <host>` (repeatable): hosts Forge's own network tools may reach while the sandbox has the network off. */
  sandboxAllowHosts?: string[];
  /** `--cheap-model <id>`: same-provider model for read-only exploration steps. */
  cheapModel: string | null;
  /** `--no-cache-prompts`: skip Anthropic prompt-cache breakpoints. */
  noCachePrompts: boolean;
  /** `--no-mask-old-results`: keep every old tool result in the prompt (RB-90). */
  noMaskOldResults?: boolean;
  /** `--architect`: main model plans read-only, `--editor-model` applies the plan. */
  architect: boolean;
  /** `--editor-model <id|alias>`: model that applies the architect plan. */
  editorModel: string | null;
  /** `--editor-reasoning <level>`: reasoning effort for the editor model only (the main model keeps the configured effort). */
  editorReasoning: ReasoningEffort | null;
  /** `--auto-commit`: commit what the agent changed after each run, with a drafted message. */
  autoCommit: boolean;
  /** `--no-dirty-commits`: do not commit your uncommitted work before a run (it is left out of the agent commit). */
  noDirtyCommits: boolean;
  /** `--no-attribute`: do not append "(forge)" to the commit author name. */
  noAttribute: boolean;
  /** `--git-commit-verify`: run pre-commit hooks on Forge commits. */
  gitCommitVerify: boolean;
  /** `--map-tokens <n>`: put a ranked repo map of about this many tokens in the system prompt (null/0 = off). */
  mapTokens: number | null;
  /** `--web-search [provider]`: 'auto' takes the backend from the environment. */
  webSearch: WebSearchProvider | 'auto' | null;
  /** `--auto-lint`: syntax-check each file the agent writes and feed problems back. */
  autoLint: boolean;
  /** `--auto-lint-cmd [ext:] <cmd>` (repeatable), parsed by extension (`*` = any file); implies auto-lint. */
  autoLintCommands: Record<string, string>;
  /** `--auto-format-cmd [ext:] <cmd>` (repeatable): formatter run on each file the agent writes, before the check. */
  autoFormatCommands: Record<string, string>;
  /** `--shell <name>`: Windows shell for run_command (auto, pwsh, powershell, bash, cmd). */
  shell?: 'auto' | 'pwsh' | 'powershell' | 'bash' | 'cmd';
  /** `--lint-cmd <cmd>` (repeatable): lint checks run after edits, like `--verify`; also used by `/lint`. */
  lintCmds: string[];
  /** `--test-cmd <cmd>` (repeatable): test checks run after edits, like `--verify`; also used by `/test`. */
  testCmds: string[];
  /** `--verify <cmd>` (repeatable): checks run after edits; failures are fed back to the model. */
  verify: string[];
  /** `--verify-lsp`: also feed language-server errors for edited files back to the model. */
  verifyLsp: boolean;
  /** `--confirm-reads`: ask before read-only tools too (they are approved without a prompt by default). */
  confirmReads: boolean;
  /** `--dry-run`: the agent may read and search but cannot modify files, run commands or write memory. */
  dryRun: boolean;
  /** `--notifications`: desktop notification when a run finishes. */
  notifications: boolean;
  /** `--notifications-command <cmd>`: run this instead of the OS notifier (message in FORGE_NOTIFY_MESSAGE). */
  notificationsCommand: string | null;
  /** `--ai-comments` (with `forge watch`): act on AI!/AI? comments in saved files. */
  aiComments: boolean;
  /** `--no-project-instructions`: do not inject AGENTS.md / CLAUDE.md / CONVENTIONS.md. */
  noProjectInstructions: boolean;
  /** `--semantic-search`: add the `codebase_search` tool (embedder from FORGE_EMBED_PROVIDER). */
  semanticSearch: boolean;
  /** `--browser`: add the browser / browser_act tools (needs Chrome, Edge or Chromium). */
  browser: boolean;
  /** `--github`: add the GitHub pull-request tools. */
  github: boolean;
  /** `--audit`: append every run and tool call to ~/.forge/audit.log. */
  audit: boolean;
  verbose: boolean;
  systemPrompt: string | null;
  json: boolean;
  mcpConfig: string | null;
  /** Disable cost accumulation and display. */
  noCost: boolean;
  /** Disable secret redaction in tool output. */
  noRedact: boolean;
  /** Disable project memory (loading + memory_read / memory_write tools). */
  noMemory: boolean;
  /**
   * Plan mode. The agent emits a numbered plan as text and stops, instead
   * of executing tools. One-shot mode prints the plan and exits 0; the
   * REPL prompts the user to approve / edit / cancel.
   */
  plan: boolean;
  /**
   * Spec-driven planning mode, one-shot invocation. Same shape as `plan`
   *: a boolean flag, task comes from the positional argument(s). The
   * agent explores the codebase with read-only tools, then emits
   * requirements.md / design.md / tasks.md as text. Prints the raw text
   * and exits 0: mirrors `--plan`'s one-shot behavior exactly (no
   * interactive approve/edit/cancel outside the REPL, so nothing is
   * written to `.forge/specs/` in one-shot mode; use `/spec` in the REPL
   * for that).
   */
  spec: boolean;
  /** Enable automatic context compaction. Default off (opt-in). */
  enableCompaction: boolean;
  /** Fraction of model window at which compaction fires. Default 0.7. */
  compactAt: number | null;
  /** Comma-separated tool names to whitelist (e.g. "read_file,list_files,search_files"). */
  allowTools: string | null;
  /** Comma-separated tool names to blacklist (e.g. "run_command,fetch_url"). */
  denyTools: string | null;
  /** Comma-separated glob patterns. File tools may only operate on paths matching one of these. */
  allowPaths: string | null;
  /** Comma-separated glob patterns. File tools refuse paths matching any of these. */
  denyPaths: string | null;
  /** Comma-separated regexes. run_command: command must match at least one. */
  allowCommands: string | null;
  /** Comma-separated regexes. run_command: command must NOT match any. */
  denyCommands: string | null;
  /** Comma-separated regexes. fetch_url: URL must match at least one. */
  allowUrls: string | null;
  /** Comma-separated regexes. fetch_url: URL must NOT match any. */
  denyUrls: string | null;
  /**
   * Structured-output mode. Path to a Zod schema (`.ts` / `.js` /
   * `.mjs`) or a JSON Schema document (`.json`). When set, the agent's
   * final response is validated against the schema and retried on
   * mismatch; in `--json` mode the validated object is the single
   * `data` event.
   */
  schema: string | null;
  /** Max validation-retry rounds in `--schema` mode. Default 3. */
  schemaRetries: number;
  /** Orchestrator worktree isolation mode. Default 'auto'. */
  orchestratorWorktrees: 'auto' | 'always' | 'never';
  /**
   * v2.14: when the orchestrator removes a specialist's worktree,
   * also delete the auto-created `forge/<label>-<sha>` branch (when
   * no other worktree still uses it). Default true.
   */
  orchestratorCleanupBranches: boolean;
  /** `--orchestrator-commit`: commit each worktree specialist's edits onto a kept branch for review and merge. */
  orchestratorCommit: boolean;
}

/**
 * Build the `forge` commander program. Kept in its own module so tests can
 * poke at parsing without spawning a process.
 */
export function buildProgram(): Command {
  const program = new Command();
  const pkg = readPackageVersion();

  program
    .name('forge')
    .description('IKarmic AI Forge: an agentic AI coding assistant.')
    .version(pkg)
    .argument('[task...]', 'plain-English task for the agent (omit to launch the interactive REPL)')
    .option('-p, --provider <name>', 'provider: openai | anthropic | google | openrouter | ollama | minimax | bedrock | vertex | azure | lmstudio | openai-compatible')
    .option('-m, --model <id>', 'model id within the chosen provider')
    .option('-a, --auto', 'run autonomously without approval prompts', false)
    .option('--allow-destructive', 'allow destructive tools (e.g. run_command) in --auto mode', false)
    .option('-c, --cwd <path>', 'working directory for file tools', process.cwd())
    .option('--max-iterations <n>', 'max agent iterations', (v) => parseInt(v, 10), 50)
    .option('--max-duration <ms>', 'max wall-clock ms', (v) => parseInt(v, 10), 10 * 60 * 1000)
    .option('--max-cost <usd>', 'stop the run once its cost reaches this many USD', (v) => parseFloat(v))
    .option('--loop-guard <n>', 'stop the run after this many identical tool calls in a row (off by default)', (v) => parseInt(v, 10))
    .option('--sandbox-allow-host <host>', 'with --sandbox: a host fetch_url, repo_clone, the browser and GitHub may still reach (repeatable; *.example.com or *)', (v: string, prev: string[] = []) => [...prev, v])
    .option('--sandbox [network]', 'run commands in an OS sandbox (bubblewrap / sandbox-exec; not Windows); "network" keeps internet access')
    .option('--verify <cmd>', 'run this check after edits and self-fix on failure (repeatable)', (v: string, prev: string[] = []) => [...prev, v])
    .option('--force', 'with `plugin install`: replace an installed plugin of the same name', false)
    .option('--project', 'with `plugin install|remove`: use the project (.forge/plugins) instead of ~/.forge/plugins', false)
    .option('--global', 'with `memory forget`: edit ~/.forge/MEMORY.md instead of the project memory', false)
    .option('--confirm-reads', 'ask before read-only tools too (by default read, list and search run without a prompt)', false)
    .option('--verify-lsp', 'after edits, check the changed files with their language server and self-fix on errors', false)
    .option('--no-project-instructions', 'do not load AGENTS.md / CLAUDE.md / CONVENTIONS.md into the system prompt')
    .option('--dry-run', 'read-only run: the agent can read and search but cannot edit files, run commands or write memory; it describes what it would change', false)
    .option('--notifications', 'send a desktop notification when a run finishes', false)
    .option('--notifications-command <cmd>', 'run this command instead of the OS notifier (message in $FORGE_NOTIFY_MESSAGE); implies --notifications')
    .option('--ai-comments', 'with `forge watch`: act on AI! (apply) and AI? (answer) comments when a file is saved', false)
    .option('--audit', 'append a redacted record of every run and tool call to ~/.forge/audit.log')
    .option('--yes', 'confirm a subcommand that changes or deletes saved data (checkpoint restore, spec cancel, spec sync)')
    .option('--github', 'add GitHub pull-request tools: read a PR\'s reviews, comments and checks, and open a PR (always asks first). Token from GITHUB_TOKEN, GH_TOKEN or `gh auth token`')
    .option('--web-search [provider]', `add a web_search tool (${WEB_SEARCH_PROVIDERS.join(', ')}; default: from TAVILY_API_KEY, BRAVE_API_KEY or SEARXNG_URL). Queries go to that service`)
    .option('--browser', 'add browser tools: open a URL, screenshot, read console errors (needs Chrome/Edge/Chromium; FORGE_CHROME_PATH overrides)')
    .option('--semantic-search', 'add the codebase_search tool (set FORGE_EMBED_PROVIDER=openai|ollama for meaning-based ranking)')
    .option('--cheap-model <id>', 'route read-only exploration steps to this cheaper model (id, alias, or provider:model)')
    .option('--no-cache-prompts', 'do not add prompt-cache breakpoints for Anthropic models')
    .option('--no-mask-old-results', 'keep every old tool result in the prompt instead of hiding older ones as the run grows')
    .option('--architect', 'two-phase run: the main model plans read-only, then --editor-model applies the plan', false)
    .option('--editor-model <id>', 'model (id, alias, or provider:model) that applies the architect plan')
    .option('--editor-reasoning <level>', `reasoning effort for the editor model (${REASONING_EFFORTS.join(', ')}); requires --architect`)
    .option('--auto-commit', 'commit what the agent changed after each run, with a drafted message (undo with /undo in the REPL)', false)
    .option('--no-dirty-commits', 'with --auto-commit: do not commit your uncommitted work before the run; it stays out of the agent commit')
    .option('--no-attribute', 'with --auto-commit: do not append "(forge)" to the commit author name')
    .option('--git-commit-verify', 'with --auto-commit: run pre-commit hooks on Forge commits (skipped by default)', false)
    .option('--map-tokens <n>', 'put a ranked map of the codebase (about <n> tokens) in the system prompt; 0 turns it off')
    .option('--auto-lint', 'syntax-check each file the agent writes and feed problems back to it', false)
    .option('--shell <name>', 'shell for run_command on Windows: auto (default: pwsh, then Windows PowerShell, Git Bash, cmd), pwsh, powershell, bash or cmd')
    .option('--auto-format-cmd <cmd>', 'formatter run on each file the agent writes, e.g. "prettier --write" or "go: gofmt -w" (repeatable)', (v: string, prev: string[] = []) => [...prev, v])
    .option('--auto-lint-cmd <cmd>', 'linter run on each file the agent writes, e.g. "eslint --fix" or "python: flake8" (repeatable; implies --auto-lint)', (v: string, prev: string[] = []) => [...prev, v])
    .option('--lint-cmd <cmd>', 'run this lint check after edits and self-fix on failure; also used by /lint (repeatable)', (v: string, prev: string[] = []) => [...prev, v])
    .option('--test-cmd <cmd>', 'run this test command after edits and self-fix on failure; also used by /test (repeatable)', (v: string, prev: string[] = []) => [...prev, v])
    .option('--system <prompt>', 'override the default system prompt')
    .option('--mcp-config <path>', 'path to a forge.mcp.json file describing MCP servers to connect to')
    .option('--resume [id]', "resume a saved session by id, or omit the value / pass 'latest' for the most recent")
    .option('--json', 'emit structured JSON events instead of a TUI (useful for scripting)', false)
    .option('-v, --verbose', 'enable verbose logging to stderr', false)
    .option('--no-cost', 'disable cost tracking and display')
    .option('--no-redact', 'disable secret redaction in tool output')
    .option('--no-memory', 'disable project memory loading and the memory_read/memory_write tools')
    .option('--plan', 'produce a numbered plan as text and stop (no tool execution); CLI prompts to approve/edit/cancel', false)
    .option('--spec', 'generate requirements.md/design.md/tasks.md for the task (read-only exploration, prints text, exits 0)', false)
    .option('--enable-compaction', 'enable automatic context compaction when approaching the model window', false)
    .option('--compact-at <fraction>', 'compaction threshold (fraction of model window); default 0.7', (v) => parseFloat(v))
    // Tool sandbox (allow/deny + per-tool policies)
    .option('--allow-tools <list>', 'comma-separated whitelist of tool names (only these are exposed to the model)')
    .option('--deny-tools <list>', 'comma-separated blacklist of tool names (these are removed from the model)')
    .option('--allow-paths <list>', 'comma-separated glob patterns; file tools may only operate on matching paths')
    .option('--deny-paths <list>', 'comma-separated glob patterns; file tools refuse paths matching any')
    .option('--allow-commands <list>', 'comma-separated regexes; run_command requires command to match at least one')
    .option('--deny-commands <list>', 'comma-separated regexes; run_command refuses commands matching any')
    .option('--allow-urls <list>', 'comma-separated regexes; fetch_url requires URL to match at least one')
    .option('--deny-urls <list>', 'comma-separated regexes; fetch_url refuses URLs matching any')
    .option(
      '--schema <path>',
      'structured-output mode: path to a Zod schema (.ts/.js/.mjs) or JSON Schema (.json). ' +
        'Agent retries its final response until it matches. Combine with --json for batch/CI use.'
    )
    .option(
      '--schema-retries <n>',
      'max validation retries in --schema mode (default 3)',
      (v) => parseInt(v, 10),
      3
    )
    .option(
      '--orchestrator-worktrees <mode>',
      'git worktree isolation for parallel specialists: auto | always | never (default auto). ' +
        'When auto, only steps in a parallelGroup (>1 step) get a worktree.',
      (v) => {
        if (v === 'auto' || v === 'always' || v === 'never') return v;
        throw new Error(`--orchestrator-worktrees must be auto|always|never (got "${v}")`);
      },
      'auto'
    )
    .option(
      '--orchestrator-commit',
      'commit each worktree specialist\'s edits onto its branch and keep the branch, so the work can be reviewed (git diff) and merged (git merge --no-ff)'
    )
    .option(
      '--orchestrator-cleanup-branches',
      'after the orchestrator runs, delete the auto-created forge/<label>-<sha> branches ' +
        'alongside their worktrees (skipped if another worktree still uses the branch). Default enabled. Pass --no-... to keep them.',
      true
    )
    .option(
      '--with-branches',
      'forge worktree cleanup: also delete the auto-created forge/<label>-<sha> branches alongside their worktrees. Default enabled. Pass --no-branches to keep them. v2.14.',
      true
    )
    .option('--format <fmt>', 'output format for `forge session export` (md | json)', 'md')
    .option('--output <path>', 'write to a file instead of stdout (used by `forge session export`)')
    .option('--older-than <days>', 'age in days for `forge session prune`', (v) => parseFloat(v))
    .option('--context <n>', 'context lines for `forge diff` (default 3)', (v) => parseInt(v, 10))
    .option('--summary', 'print only the one-line summary for `forge diff`', false)
    .option('--from-stdin', 'read the second input from stdin (used by `forge diff`)', false)
    .addOption(
      new Option('--list-models', 'print the resolved model and exit').conflicts(['task'])
    );

  // We don't register `session` as a commander subcommand: commander's
  // strict subcommand routing would reject positional task arguments that
  // happen to start with words like "summarize". Instead, we treat
  // `forge session …` as a soft prefix and inspect `program.args` manually
  // after parsing.
  return program;
}

/**
 * Parse argv into typed options. Model resolution is **lazy**: the caller
 * invokes {@link resolveModelOrThrow} only when an actual model is needed
 * (i.e. when an agent run is about to start). This lets `forge session list`,
 * `forge session show`, etc. work without an AI provider configured.
 */
/** Every post-edit check, in order: `--verify`, then `--lint-cmd`, then `--test-cmd`. */
export function checkCommands(options: Pick<CliOptions, 'verify' | 'lintCmds' | 'testCmds'>): string[] {
  return [...options.verify, ...options.lintCmds, ...options.testCmds];
}

/**
 * The token for `--github`: GITHUB_TOKEN / GH_TOKEN, else the GitHub CLI's login
 * (`gh auth token`), else an error saying what to set.
 */
export function resolveGitHub(env: NodeJS.ProcessEnv = process.env, ghToken: () => string = ghAuthToken): GitHubConfig {
  const fromEnv = githubFromEnv(env);
  if (fromEnv) return fromEnv;
  const token = ghToken().trim();
  if (token) return { token };
  throw new Error('--github: set GITHUB_TOKEN (or GH_TOKEN), or sign in with `gh auth login`');
}

function ghAuthToken(): string {
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

/** `--web-search` alone means auto; with a value it must name a backend. */
export function parseWebSearch(raw: unknown): WebSearchProvider | 'auto' | null {
  if (raw === undefined || raw === false) return null;
  if (raw === true) return 'auto';
  const name = String(raw).trim().toLowerCase();
  if ((WEB_SEARCH_PROVIDERS as readonly string[]).includes(name)) return name as WebSearchProvider;
  throw new Error(`--web-search must be one of ${WEB_SEARCH_PROVIDERS.join(', ')}, got "${String(raw)}"`);
}

/** The backend for `--web-search`, or an error naming the variable to set. */
export function resolveWebSearch(choice: WebSearchProvider | 'auto', env: NodeJS.ProcessEnv = process.env): WebSearchConfig {
  const cfg = webSearchFromEnv(env, choice === 'auto' ? undefined : choice);
  if (cfg) return cfg;
  const need: Record<WebSearchProvider, string> = { brave: 'BRAVE_API_KEY', tavily: 'TAVILY_API_KEY', searxng: 'SEARXNG_URL' };
  throw new Error(
    choice === 'auto'
      ? '--web-search: set TAVILY_API_KEY, BRAVE_API_KEY or SEARXNG_URL (or FORGE_WEB_SEARCH plus its key)'
      : `--web-search ${choice}: set ${need[choice]}`
  );
}

/** `--map-tokens`: a non-negative integer; 0 or absent means off. */
export function parseMapTokens(raw: unknown): number | null {
  if (raw === undefined) return null;
  const n = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 0) throw new Error(`--map-tokens must be a non-negative integer, got "${String(raw)}"`);
  return n === 0 ? null : n;
}

/** Language names accepted before the colon in `--auto-lint-cmd "python: flake8"`. */
const LINT_LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript: ['ts', 'tsx'],
  javascript: ['js', 'jsx', 'mjs', 'cjs'],
  python: ['py'],
  go: ['go'],
  rust: ['rs'],
  java: ['java'],
};

/**
 * `--auto-lint-cmd` values into extension -> command. `"ts: eslint"` and `"typescript: eslint"`
 * apply to those files only; a value with no `name:` prefix applies to every file (`*`).
 * A colon not followed by a space (a Windows path) is part of the command.
 */
let warnedUnconfined = false;

/**
 * The command sandbox for a run. On a system with no sandbox tool (Windows) commands cannot be confined: the person is told
 * once, on stderr, and the run goes on (F13). Without that notice core refuses such a command instead of running it unconfined.
 */
export function sandboxConfigFor(options: Pick<CliOptions, 'commandSandbox' | 'sandboxAllowHosts'>, platform: NodeJS.Platform = process.platform): NonNullable<AgentConfig['commandSandbox']> {
  const windows = platform === 'win32';
  if (windows && !warnedUnconfined) {
    warnedUnconfined = true;
    process.stderr.write('forge: --sandbox cannot confine commands on Windows (there is no sandbox tool): commands run unconfined and still ask for approval. Forge\'s own network tools still follow the allowed hosts.\n');
  }
  return {
    network: options.commandSandbox === 'on-network',
    ...((options.sandboxAllowHosts ?? []).length > 0 ? { allowedHosts: options.sandboxAllowHosts } : {}),
    ...(windows ? { allowUnconfined: true } : {}),
  };
}

/** `--shell` value, or an error naming the choices. */
export function parseShell(value: string): NonNullable<CliOptions['shell']> {
  const v = value.trim().toLowerCase();
  if (v === 'auto' || v === 'pwsh' || v === 'powershell' || v === 'bash' || v === 'cmd') return v;
  throw new Error(`--shell must be one of: auto, pwsh, powershell, bash, cmd (got "${value}")`);
}

export function parseLintCommands(values: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const value of values) {
    const m = /^([A-Za-z][A-Za-z0-9]*):\s+(\S.*)$/.exec(value.trim());
    if (!m) {
      const cmd = value.trim();
      if (!cmd) throw new Error('--auto-lint-cmd needs a command');
      out['*'] = cmd;
      continue;
    }
    const key = m[1]!.toLowerCase();
    for (const ext of LINT_LANGUAGE_EXTENSIONS[key] ?? [key]) out[ext] = m[2]!.trim();
  }
  return out;
}

export function parseOptions(argv: string[]): {
  options: CliOptions;
  resolveModel: () => ModelConfig;
  listModels: boolean;
  sessionCommand: ParsedSessionCommand | null;
  skillCommand: ParsedSkillCommand | null;
  pluginCommand: ParsedPluginCommand | null;
  hookCommand: ParsedHookCommand | null;
  memoryCommand: ParsedMemoryCommand | null;
  mcpCommand: ParsedMcpCommand | null;
  checkpointCommand: ParsedCheckpointCommand | null;
  specCommand: ParsedSpecCommand | null;
  watchCommand: boolean;
  diffCommand: ParsedDiffCommand | null;
  orchestratorCommand: ParsedOrchestratorCommand | null;
  worktreeCommand: ParsedWorktreeCommand | null;
  configCommand: ParsedConfigCommand | null;
  /** `forge acp`: serve the Agent Client Protocol on stdio. */
  acpCommand: boolean;
  /** `forge policy`: print the active organization policy. */
  policyCommand: boolean;
  /** `forge import claude [apply]`: copy a Claude Code setup into Forge. */
  importCommand: { source: 'claude'; apply: boolean } | null;
  /** cli package version (for the ACP handshake). */
  version: string;
} {
  const program = buildProgram();
  program.parse(argv);
  const opts = program.opts<Record<string, unknown>>();

  const listModels = opts.listModels === true;
  const taskParts = program.args;
  const task = taskParts.length > 0 ? taskParts.join(' ') : null;

  // commander's `.conflicts()` can only reference other registered Options,
  // never a positional `.argument(...)`: so `--list-models` combined with
  // a task string would otherwise silently discard the task. Check by hand.
  if (listModels && task) {
    throw new Error(`--list-models cannot be combined with a task ("${task}")`);
  }
  if (opts.editorReasoning !== undefined) {
    if (opts.architect !== true) throw new Error('--editor-reasoning requires --architect');
    if (!REASONING_EFFORTS.includes(opts.editorReasoning as ReasoningEffort)) {
      throw new Error(`--editor-reasoning must be one of: ${REASONING_EFFORTS.join(', ')}`);
    }
  }
  if (opts.architect === true) {
    if (typeof opts.editorModel !== 'string' || opts.editorModel.length === 0) {
      throw new Error('--architect requires --editor-model <id|alias>');
    }
    if (opts.plan === true || opts.spec === true) {
      throw new Error('--architect cannot be combined with --plan or --spec');
    }
    if (opts.resume !== undefined || opts.schema !== undefined) {
      throw new Error('--architect cannot be combined with --resume or --schema');
    }
    if (!task) {
      throw new Error('--architect needs a task (it does not apply to the interactive REPL)');
    }
  }

  const cliOptions: CliOptions = {
    task,
    provider: (opts.provider as ProviderName | undefined) ?? null,
    model: (opts.model as string | undefined) ?? null,
    auto: opts.auto === true,
    allowDestructive: opts.allowDestructive === true,
    cwd: (opts.cwd as string | undefined) ?? null,
    maxIterations: (opts.maxIterations as number | undefined) ?? null,
    maxDurationMs: (opts.maxDuration as number | undefined) ?? null,
    maxCostUsd: typeof opts.maxCost === 'number' && Number.isFinite(opts.maxCost) && opts.maxCost > 0 ? opts.maxCost : null,
    loopGuardThreshold: typeof opts.loopGuard === 'number' && Number.isInteger(opts.loopGuard) && opts.loopGuard > 0 ? opts.loopGuard : null,
    commandSandbox: opts.sandbox === 'network' ? 'on-network' : opts.sandbox ? 'on' : 'off',
    sandboxAllowHosts: Array.isArray(opts.sandboxAllowHost) ? (opts.sandboxAllowHost as string[]) : [],
    cheapModel: (opts.cheapModel as string | undefined) ?? null,
    noCachePrompts: opts.cachePrompts === false,
    noMaskOldResults: opts.maskOldResults === false,
    architect: opts.architect === true,
    editorModel: (opts.editorModel as string | undefined) ?? null,
    editorReasoning: (opts.editorReasoning as ReasoningEffort | undefined) ?? null,
    autoCommit: opts.autoCommit === true,
    noDirtyCommits: opts.dirtyCommits === false,
    noAttribute: opts.attribute === false,
    gitCommitVerify: opts.gitCommitVerify === true,
    mapTokens: parseMapTokens(opts.mapTokens),
    webSearch: parseWebSearch(opts.webSearch),
    ...(typeof opts.shell === 'string' ? { shell: parseShell(opts.shell) } : {}),
    autoFormatCommands: parseLintCommands(Array.isArray(opts.autoFormatCmd) ? (opts.autoFormatCmd as string[]) : []),
    autoLintCommands: parseLintCommands(Array.isArray(opts.autoLintCmd) ? (opts.autoLintCmd as string[]) : []),
    autoLint: opts.autoLint === true || (Array.isArray(opts.autoLintCmd) && opts.autoLintCmd.length > 0),
    lintCmds: Array.isArray(opts.lintCmd) ? (opts.lintCmd as string[]) : [],
    testCmds: Array.isArray(opts.testCmd) ? (opts.testCmd as string[]) : [],
    verify: Array.isArray(opts.verify) ? (opts.verify as string[]) : [],
    verifyLsp: opts.verifyLsp === true,
    confirmReads: opts.confirmReads === true,
    dryRun: opts.dryRun === true,
    notifications: opts.notifications === true || typeof opts.notificationsCommand === 'string',
    notificationsCommand: (opts.notificationsCommand as string | undefined) ?? null,
    aiComments: opts.aiComments === true,
    noProjectInstructions: opts.projectInstructions === false,
    semanticSearch: opts.semanticSearch === true,
    browser: opts.browser === true,
    github: opts.github === true,
    audit: opts.audit === true,
    verbose: opts.verbose === true,
    systemPrompt: (opts.system as string | undefined) ?? null,
    json: opts.json === true,
    mcpConfig: (opts.mcpConfig as string | undefined) ?? null,
    noCost: opts.cost === false,
    noRedact: opts.redact === false,
    noMemory: opts.memory === false,
    plan: opts.plan === true,
    spec: opts.spec === true,
    enableCompaction: opts.enableCompaction === true,
    compactAt: typeof opts.compactAt === 'number' ? opts.compactAt : null,
    allowTools: (opts.allowTools as string | undefined) ?? null,
    denyTools: (opts.denyTools as string | undefined) ?? null,
    allowPaths: (opts.allowPaths as string | undefined) ?? null,
    denyPaths: (opts.denyPaths as string | undefined) ?? null,
    allowCommands: (opts.allowCommands as string | undefined) ?? null,
    denyCommands: (opts.denyCommands as string | undefined) ?? null,
    allowUrls: (opts.allowUrls as string | undefined) ?? null,
    denyUrls: (opts.denyUrls as string | undefined) ?? null,
    schema: (opts.schema as string | undefined) ?? null,
    schemaRetries: (opts.schemaRetries as number | undefined) ?? 3,
    orchestratorWorktrees: (opts.orchestratorWorktrees as 'auto' | 'always' | 'never' | undefined) ?? 'auto',
    orchestratorCleanupBranches: (opts.orchestratorCleanupBranches as boolean | undefined) ?? true,
    orchestratorCommit: opts.orchestratorCommit === true,
  };

  const sessionCommand = extractSessionCommand(program);
  const skillCommand = extractSkillCommand(program, opts);
  const pluginCommand = extractPluginCommand(program, opts);
  const hookCommand = extractHookCommand(program);
  const memoryCommand = extractMemoryCommand(program, opts);
  const mcpCommand = extractMcpCommand(program, opts);
  const checkpointCommand = extractCheckpointCommand(program, opts);
  const specCommand = extractSpecCommand(program, opts);
  // `forge watch` has no sub-forms (see options.ts's header note on
  // ParsedWatchCommand vs. a plain boolean): a single positional-word
  // check, not a soft-prefix parser function.
  const watchCommand = program.args[0] === 'watch';
  const diffCommand = extractDiffCommand(program, opts);
  const orchestratorCommand = extractOrchestratorCommand(program);
  const worktreeCommand = extractWorktreeCommand(program, opts);
  const configCommand = extractConfigCommand(program);
  const acpCommand = program.args[0] === 'acp';
  const policyCommand = program.args[0] === 'policy';
  const importCommand = program.args[0] === 'import' && program.args[1] === 'claude' ? { source: 'claude' as const, apply: program.args[2] === 'apply' } : null;
  const resolveModel = (): ModelConfig => resolveModelNow(cliOptions);

  return {
    options: cliOptions,
    resolveModel,
    listModels,
    sessionCommand,
    skillCommand,
    pluginCommand,
    hookCommand,
    memoryCommand,
    mcpCommand,
    checkpointCommand,
    specCommand,
    watchCommand,
    diffCommand,
    orchestratorCommand,
    worktreeCommand,
    configCommand,
    acpCommand,
    policyCommand,
    importCommand,
    version: readPackageVersion(),
  };
}

/** `forge config`: interactive settings wizard, no subcommands. */
export interface ParsedConfigCommand {
  run: true;
}

/** Soft-prefix parser for `forge config` (no sub-forms: always just runs the wizard). */
function extractConfigCommand(program: Command): ParsedConfigCommand | null {
  const args = program.args;
  if (args[0] !== 'config') return null;
  return { run: true };
}

/**
 * Rewrite `--model` through the user's aliases (`~/.forge/config.json`).
 * A `provider:` prefix (typed directly or from an alias) also sets the provider. Cheap and
 * editor models are resolved later, against the main model's provider.
 */
export function applyModelAliases(options: CliOptions, aliases: ModelAliases | undefined): void {
  // `--provider deepseek --model x` means the same as `--model deepseek:x` for a preset or customProviders id (RB-85).
  if (options.provider && !isBuiltinProvider(options.provider)) {
    const id: string = options.provider;
    const resolved = resolveModelAlias(`${id}:${options.model ?? ''}`, undefined, 'openai');
    if (!resolved.endpoint || !options.model) {
      throw new Error(
        `Forge does not know the provider "${id}". Use a built-in provider, or one from "customProviders" in ~/.forge/config.json written as id:model (for example deepseek:deepseek-v4-pro).`
      );
    }
    options.provider = resolved.provider;
    options.model = resolved.model;
    options.endpoint = resolved.endpoint;
    return;
  }
  if (!options.model) return;
  const expanded = expandModelAlias(options.model, aliases);
  const { provider, model } = splitModelRef(expanded);
  if (!provider) {
    // `id:model` for a preset or customProviders id resolves to that endpoint (RB-85).
    const resolved = resolveModelAlias(expanded, undefined, options.provider ?? 'openai');
    if (resolved.endpoint) {
      options.provider = resolved.provider;
      options.model = resolved.model;
      options.endpoint = resolved.endpoint;
      return;
    }
  }
  options.model = model;
  if (provider) options.provider = provider;
}

function isBuiltinProvider(name: string): boolean {
  return splitModelRef(`${name}:x`).provider !== undefined;
}

function resolveModelNow(opts: CliOptions): ModelConfig {
  if (opts.provider && opts.model) {
    return { provider: opts.provider, model: opts.model, ...(opts.endpoint ? { endpoint: opts.endpoint } : {}) };
  }
  const provider = opts.provider ?? detectProvider();
  if (!provider) {
    throw new Error(
      'No AI provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, ' +
        'OPENROUTER_API_KEY, or MINIMAX_API_KEY (or run `ollama serve` for local models), or pass --provider and --model explicitly.'
    );
  }
  const model = opts.model ?? process.env.FORGE_DEFAULT_MODEL ?? defaultModelFor(provider);
  return { provider, model };
}

/**
 * Read the package version from package.json so `forge --version` stays in
 * sync with whatever we shipped. Falls back to "0.0.0" if package.json is
 * missing or unreadable (e.g. someone ran the CLI directly from a checked-out
 * tree without `pnpm build`).
 *
 * Note: we walk the path manually rather than `new URL('../package.json',
 * import.meta.url)`. The URL resolver mishandles Windows drive letters: for
 * `file:///D:/.../dist/options.js`, `..` crosses the `/D:/.../` boundary and
 * lands at the wrong directory. Same goes for `path.join` on Windows when
 * the path is reached via a non-`path.resolve` call.
 */
function readPackageVersion(): string {
  try {
    const here = fileURLToPath(import.meta.url);
    // here = `<...>/packages/cli/dist/options.js`
    // pkgPath = `<...>/packages/cli/package.json`
    const pkgPath = join(dirname(here), '..', 'package.json');
    const text = readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(text) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export type ResumeFlag =
  | { kind: 'none' }
  | { kind: 'latest' }
  | { kind: 'id'; id: string };

/**
 * After commander has parsed, figure out what `--resume` / `session …` the
 * user asked for. Returns `null` if neither flag nor subcommand was used.
 */
export interface ParsedSessionCommand {
  resume?: ResumeFlag;
  list?: { limit: number };
  show?: { id: string; full: boolean };
  delete?: string;
  /**
   * `forge session export <id> [--format md|json] [--output path]`.
   * Renders the session as Markdown (default) or JSON for sharing.
   */
  export?: { id: string; format: 'md' | 'json'; output?: string };
  /** `forge session tail <id|latest>`: print the session, then follow it live as another process continues it. */
  tail?: { id: string };
  /** `forge session search <words…>`: sessions whose messages contain every word. */
  search?: { query: string; limit: number };
  /** `forge session prune --older-than <days> [--dry-run]`; `olderThanDays` is null when the flag is missing or not a number. */
  prune?: { olderThanDays: number | null; dryRun: boolean };
}

/**
 * `forge skill …` subcommand. Soft prefix like `session` so it doesn't
 * collide with positional task arguments.
 */
export interface ParsedSkillCommand {
  list?: true;
  show?: { name: string };
  install?: { url: string; overwrite: boolean };
  search?: { query: string; limit: number | null };
  browse?: true;
}

/**
 * `forge memory list|check|forget <heading> [--global]`.
 */
export interface ParsedMemoryCommand {
  list?: true;
  check?: true;
  forget?: { heading: string; global: boolean };
}

/**
 * `forge plugin list|show <name>|install <source> [--force] [--project]|remove <name> [--project]`.
 * `<source>` is a local directory, a git URL or `owner/repo`.
 */
export interface ParsedPluginCommand {
  list?: true;
  show?: { name: string };
  install?: { source: string; overwrite: boolean; project: boolean };
  remove?: { name: string; project: boolean };
}

/**
 * `forge hook …` subcommand. Same soft-prefix pattern.
 */
export interface ParsedHookCommand {
  list?: true;
  test?: { event: string; tool?: string };
  log?: { limit: number };
}

/**
 * `forge mcp …` subcommand. Same soft-prefix pattern.
 */
export interface ParsedMcpCommand {
  list?: true;
  login?: { name: string };
  install?: { source: string; overwrite: boolean };
  remove?: { name: string };
  browse?: true;
}

/**
 * `forge checkpoint …` subcommand.
 *
 *   forge checkpoint list [--session <id>] [--limit N]
 *   forge checkpoint show <id> [--session <id>]
 *   forge checkpoint restore <id> --yes [--session <id>]
 *   forge checkpoint prune [--keep N]   [--session <id>]
 */
export interface ParsedCheckpointCommand {
  list?: { limit: number | null };
  show?: { id: string };
  restore?: { id: string; yes: boolean };
  prune?: { keep: number | null };
  /** Override the session dir; defaults to the active session. */
  sessionId?: string;
}

/**
 * `forge spec …` subcommand: management of already-approved specs.
 * Generation itself is `--spec "<task>"` (one-shot) or `/spec <task>`
 * (REPL): not a subcommand here, since there's nothing on disk for a
 * standalone "approve" command to act on (approval happens synchronously
 * during interactive review, exactly like `/plan`'s approve/edit/cancel).
 *
 *   forge spec list
 *   forge spec show <id>
 *   forge spec cancel <id> --yes
 */
export interface ParsedSpecCommand {
  list?: true;
  show?: { id: string };
  cancel?: { id: string; yes: boolean };
  /** `forge spec sync <id> [--yes]`: update the documents to match the code. */
  sync?: { id: string; yes: boolean };
}

/**
 * `forge orchestrator …` subcommand.
 *
 *   forge orchestrator list
 *   forge orchestrator run <task...>: full multi-agent dispatch
 *   forge orchestrator plan <task...>: preview the routing plan only
 */
export interface ParsedOrchestratorCommand {
  list?: true;
  run?: { task: string };
  plan?: { task: string };
}

/**
 * `forge diff …` subcommand. Soft prefix like the others so it doesn't
 * collide with positional task arguments.
 *
 *   forge diff <fileA> <fileB>
 *   forge diff --from-stdin <file>
 *   forge diff --context 5 <fileA> <fileB>
 *   forge diff --summary <fileA> <fileB>
 */
export interface ParsedDiffCommand {
  fileA: string;
  fileB?: string;
  contextLines?: number;
  fromStdin?: boolean;
  summaryOnly?: boolean;
}

/**
 * `forge worktree …` subcommand. v2.11 / v2.14.
 *
 *   forge worktree list: show active worktrees
 *   forge worktree cleanup [--force] [--with-branches|--no-branches]
 *: remove all of them (prompts)
 *   forge worktree prune: remove orphans only (no prompt)
 *   forge worktree sweep  [--force]: remove + delete orphan branches
 *
 * Doesn't need an AI provider. Mirrors the other soft-prefix subcommands.
 */
export interface ParsedWorktreeCommand {
  list?: true;
  cleanup?: { force: boolean; withBranches: boolean };
  prune?: true;
  sweep?: { force: boolean };
}

function extractSessionCommand(program: Command): ParsedSessionCommand | null {
  const args = program.args;
  const opts = program.opts<Record<string, unknown>>();
  const resumeFlag = parseResumeFlag(opts.resume);

  // Path 1: explicit `forge session <subcommand> [id] [--flag]` invocation.
  // We handle this as a "soft prefix" so it doesn't collide with positional
  // task arguments (`forge summarize files` must keep working).
  if (args[0] === 'session') {
    const sub = args[1];
    const id = args[2];

    if (sub === 'list' || sub === 'ls') {
      // Tail flags go to the program-level opts (e.g. --limit). We pull
      // `--limit` out of opts after the soft prefix; everything after the
      // subcommand is appended to opts by `parseOptions` via `parse()`.
      const limit = (opts.limit as number | undefined) ?? 20;
      return { list: { limit } };
    }
    if (sub === 'show' && id) {
      return { show: { id, full: (opts.full as boolean | undefined) === true } };
    }
    if (sub === 'delete' && id) {
      return { delete: id };
    }
    if (sub === 'export' && id) {
      const formatRaw = (opts.format as string | undefined) ?? 'md';
      const format: 'md' | 'json' = formatRaw === 'json' ? 'json' : 'md';
      const output = (opts.output as string | undefined) ?? undefined;
      return { export: { id, format, output } };
    }
    if (sub === 'tail') return { tail: { id: id ?? 'latest' } };
    if (sub === 'prune') {
      const days = opts.olderThan;
      return { prune: { olderThanDays: typeof days === 'number' && Number.isFinite(days) ? days : null, dryRun: opts.dryRun === true } };
    }
    if (sub === 'search') return { search: { query: args.slice(2).join(' '), limit: (opts.limit as number | undefined) ?? 20 } };
    if (sub === 'resume') {
      if ((opts.latest as boolean | undefined) === true) return { resume: { kind: 'latest' } };
      if (id) return { resume: { kind: 'id', id } };
      return { resume: { kind: 'latest' } };
    }
    return {};
  }

  // Path 2: top-level --resume flag.
  if (resumeFlag.kind !== 'none') {
    return { resume: resumeFlag };
  }

  return null;
}

function parseResumeFlag(raw: unknown): ResumeFlag {
  if (raw === undefined || raw === false) return { kind: 'none' };
  if (raw === true || raw === '') return { kind: 'latest' };
  if (raw === 'latest') return { kind: 'latest' };
  if (typeof raw === 'string') return { kind: 'id', id: raw };
  return { kind: 'none' };
}

/**
 * Soft-prefix parser for `forge skill list|show|install|search|browse`.
 * `forge skill install <source>`: `<source>` is a skill name (looked
 * up in the marketplace catalog), a GitHub URL, or `owner/repo[#subdir]`
 * shorthand.
 */
function extractSkillCommand(
  program: Command,
  opts: Record<string, unknown>
): ParsedSkillCommand | null {
  const args = program.args;
  if (args[0] !== 'skill') return null;
  const sub = args[1];
  if (sub === 'list' || sub === 'ls') return { list: true };
  if (sub === 'show' && args[2]) return { show: { name: args[2] } };
  if (sub === 'install' && args[2]) {
    return {
      install: {
        url: args[2],
        overwrite: opts.force === true || opts.overwrite === true,
      },
    };
  }
  if (sub === 'search') {
    const query = args.slice(2).join(' ').trim();
    if (!query) return {};
    const limit = typeof opts.limit === 'number' ? opts.limit : null;
    return { search: { query, limit } };
  }
  if (sub === 'browse') return { browse: true };
  return {};
}

/** Soft-prefix parser for `forge plugin …`. Returns `null` when the first positional arg isn't `plugin`. */
function extractPluginCommand(program: Command, opts: Record<string, unknown>): ParsedPluginCommand | null {
  const args = program.args;
  if (args[0] !== 'plugin') return null;
  const sub = args[1];
  const project = opts.project === true;
  if (sub === 'list' || sub === 'ls') return { list: true };
  if (sub === 'show' && args[2]) return { show: { name: args[2] } };
  if (sub === 'install' && args[2]) return { install: { source: args[2], overwrite: opts.force === true, project } };
  if ((sub === 'remove' || sub === 'rm') && args[2]) return { remove: { name: args[2], project } };
  return {};
}

/** Soft-prefix parser for `forge memory …`. Returns `null` when the first positional arg isn't `memory`. */
function extractMemoryCommand(program: Command, opts: Record<string, unknown>): ParsedMemoryCommand | null {
  const args = program.args;
  if (args[0] !== 'memory') return null;
  const sub = args[1];
  if (sub === 'list' || sub === 'ls') return { list: true };
  if (sub === 'check') return { check: true };
  if (sub === 'forget' && args[2]) return { forget: { heading: args.slice(2).join(' '), global: opts.global === true } };
  return {};
}

/**
 * Soft-prefix parser for `forge hook list|test|log`. Returns `null` when
 * the first positional arg isn't `hook`.
 */
function extractHookCommand(program: Command): ParsedHookCommand | null {
  const args = program.args;
  const opts = program.opts<Record<string, unknown>>();
  if (args[0] !== 'hook') return null;
  const sub = args[1];
  if (sub === 'list' || sub === 'ls') return { list: true };
  if (sub === 'log') {
    const limit = (opts.limit as number | undefined) ?? 20;
    return { log: { limit } };
  }
  if (sub === 'test' && args[2]) {
    return { test: { event: args[2], tool: args[3] } };
  }
  return {};
}

/**
 * Soft-prefix parser for `forge mcp list|install|remove|browse`.
 * `forge mcp install <source> [--overwrite]`: `<source>` is a GitHub
 * URL or `owner/repo[#subdir]` shorthand. `--force` / `--overwrite`
 * replaces an existing install.
 */
function extractMcpCommand(program: Command, opts: Record<string, unknown>): ParsedMcpCommand | null {
  const args = program.args;
  if (args[0] !== 'mcp') return null;
  const sub = args[1];
  if (sub === 'list' || sub === 'ls') return { list: true };
  if (sub === 'browse') return { browse: true };
  if (sub === 'install' && args[2]) {
    return {
      install: {
        source: args[2],
        overwrite: opts.force === true || opts.overwrite === true,
      },
    };
  }
  if (sub === 'remove' && args[2]) {
    return { remove: { name: args[2] } };
  }
  if (sub === 'login' && args[2]) {
    return { login: { name: args[2] } };
  }
  return {};
}

/**
 * Soft-prefix parser for `forge checkpoint list|show|restore|prune`.
 * Restore requires `--yes` (set via the parsed opts); we read it from
 * the program-level option bag the same way `session delete` does.
 */
function extractCheckpointCommand(
  program: Command,
  opts: Record<string, unknown>
): ParsedCheckpointCommand | null {
  const args = program.args;
  if (args[0] !== 'checkpoint') return null;
  const sub = args[1];
  const sessionId = (opts.session as string | undefined) ?? undefined;
  const base: ParsedCheckpointCommand = sessionId ? { sessionId } : {};
  if (sub === 'list' || sub === 'ls') {
    const limit = typeof opts.limit === 'number' ? opts.limit : null;
    return { ...base, list: { limit } };
  }
  if (sub === 'show' && args[2]) return { ...base, show: { id: args[2] } };
  if (sub === 'restore' && args[2]) {
    return {
      ...base,
      restore: { id: args[2], yes: opts.yes === true },
    };
  }
  if (sub === 'prune') {
    const keep = typeof opts.keep === 'number' ? opts.keep : null;
    return { ...base, prune: { keep } };
  }
  return base;
}

/**
 * Soft-prefix parser for `forge spec list|show|cancel`.
 */
function extractSpecCommand(
  program: Command,
  opts: Record<string, unknown>
): ParsedSpecCommand | null {
  const args = program.args;
  if (args[0] !== 'spec') return null;
  const sub = args[1];
  if (sub === 'list' || sub === 'ls') return { list: true };
  if (sub === 'show' && args[2]) return { show: { id: args[2] } };
  if (sub === 'cancel' && args[2]) {
    return { cancel: { id: args[2], yes: opts.yes === true } };
  }
  if (sub === 'sync' && args[2]) return { sync: { id: args[2], yes: opts.yes === true } };
  return {};
}

/**
 * Soft-prefix parser for `forge orchestrator list|run|plan`.
 * `run <task...>` and `plan <task...>` take the rest of argv as the task.
 */
function extractOrchestratorCommand(program: Command): ParsedOrchestratorCommand | null {
  const args = program.args;
  if (args[0] !== 'orchestrator') return null;
  const sub = args[1];
  if (sub === 'list' || sub === 'ls') return { list: true };
  const rest = args.slice(2).join(' ').trim();
  if (sub === 'run' && rest) return { run: { task: rest } };
  if (sub === 'plan' && rest) return { plan: { task: rest } };
  return {};
}

/**
 * Soft-prefix parser for `forge diff <fileA> <fileB> [--from-stdin]`.
 * Supports comparing a file to another file, or a file to stdin
 * (the latter for `forge diff --from-stdin package.json < new.json`).
 */
function extractDiffCommand(
  program: Command,
  opts: Record<string, unknown>
): ParsedDiffCommand | null {
  const args = program.args;
  if (args[0] !== 'diff') return null;
  const fromStdin = opts.fromStdin === true;
  const fileA = args[1];
  if (!fileA) return null;
  const fileB = fromStdin ? undefined : args[2];
  const ctxRaw = opts.context;
  const contextLines = typeof ctxRaw === 'number' ? ctxRaw : undefined;
  const summaryOnly = opts.summary === true;
  return {
    fileA,
    ...(fileB ? { fileB } : {}),
    ...(contextLines !== undefined ? { contextLines } : {}),
    ...(fromStdin ? { fromStdin: true } : {}),
    ...(summaryOnly ? { summaryOnly: true } : {}),
  };
}

/**
 * Soft-prefix parser for `forge worktree list | cleanup | prune | sweep`.
 * v2.11 + v2.14. Matches the other subcommand parsers in style.
 */
function extractWorktreeCommand(
  program: Command,
  opts: Record<string, unknown>
): ParsedWorktreeCommand | null {
  const args = program.args;
  if (args[0] !== 'worktree') return null;
  const sub = args[1];
  if (sub === 'list' || sub === 'ls') return { list: true };
  if (sub === 'cleanup') {
    return {
      cleanup: {
        force: opts.force === true,
        // v2.14: default to cleaning up branches. Pass --no-branches
        // to keep them. The flag is registered as a boolean on the
        // root program so commander normalises `--no-...` flips for us.
        withBranches: opts.withBranches !== false,
      },
    };
  }
  if (sub === 'prune') return { prune: true };
  // v2.14: new one-shot cleanup.
  if (sub === 'sweep') {
    return { sweep: { force: opts.force === true } };
  }
  return {};
}

/**
 * Convert parsed CLI options into an AgentConfig. The approval callback is
 * supplied by the UI layer (it varies between TUI and JSON modes), so it's
 * left as a parameter. `extraTools` (from MCP, sub-agents, etc.) are merged
 * in here.
 *
 * Always loads skills + hooks from disk when not opted out. Skills are
 * scanned from `<cwd>/skills/`, `<cwd>/.forge/skills/`, `~/.forge/skills/`.
 * Hooks are loaded from `~/.forge/settings.json` + `<cwd>/.forge/settings.json`.
 */
export async function toAgentConfig(
  options: CliOptions,
  model: ModelConfig,
  approve: AgentConfig['approve'],
  extraTools: AgentConfig['extraTools'] = [],
  mcpInstructions?: string
): Promise<AgentConfig> {
  const cwd = options.cwd ?? process.cwd();
  // The user config first: it names extra skill folders (skillPaths) the registry must read.
  const sharedConfig = await loadForgeConfigFile();
  const [skillsRegistry, hooksConfig, sandboxFromFile, steering] = await Promise.all([
    loadSkillsRegistryAsync(cwd, sharedConfig.config.skillPaths ?? [], {
      onWarning: (w) => process.stderr.write(`forge: skills: ${w}\n`),
    }),
    loadHooksConfig(cwd),
    // CLI never trusts project-level settings: matches the existing
    // hooks precedent (trustedProjectHooks is never true in the CLI).
    loadToolSandboxConfig(cwd, { trustedProjectSettings: false }),
    loadSteering(cwd),
  ]);
  for (const w of steering.warnings) process.stderr.write(`forge: ${w}\n`);

  const cliSandbox = buildSandbox(options) ?? {};
  const sandbox = mergeToolSandbox(sandboxFromFile.sandbox, cliSandbox);

  // Populate reasoningEffort onto the actual ModelConfig handed to Agent: 
  // it's stored/editable via both settings UIs but nothing wired it onto
  // the running model until now. Mutates the caller's `model` object (the
  // same reference used for both AgentConfig.model and the model prop
  // threaded to App/Repl) so the effect reaches both.
  if (!model.reasoningEffort && sharedConfig.config.reasoningEffort) {
    model.reasoningEffort = sharedConfig.config.reasoningEffort;
  }

  return {
    model,
    cwd: options.cwd ?? undefined,
    auto: options.auto,
    ...(options.confirmReads ? {} : { autoApproveTools: resolveAutoApprove(sharedConfig.config.autoApproveTools) }),
    ...(sharedConfig.config.permission && Object.keys(sharedConfig.config.permission).length > 0 ? { permissionRules: sharedConfig.config.permission } : {}),
    ...(sharedConfig.config.instructions?.length ? { extraInstructions: sharedConfig.config.instructions } : {}),
    ...(sharedConfig.config.subagentModel
      ? { subAgentModel: applyResolved(model, resolveModelAlias(sharedConfig.config.subagentModel, sharedConfig.config.aliases, model.provider)) }
      : {}),
    allowDestructive: options.allowDestructive,
    maxIterations: options.maxIterations ?? undefined,
    maxDurationMs: options.maxDurationMs ?? undefined,
    ...(options.maxCostUsd !== null ? { maxCostUsd: options.maxCostUsd } : {}),
    ...(options.loopGuardThreshold !== null ? { loopGuardThreshold: options.loopGuardThreshold } : {}),
    ...(options.commandSandbox !== 'off' ? { commandSandbox: sandboxConfigFor(options) } : {}),
    ...(options.audit ? { audit: createFileAuditSink() } : {}),
    ...(options.browser ? { browser: true as const } : {}),
    ...(options.github ? { github: resolveGitHub() } : {}),
    ...(options.webSearch ? { webSearch: resolveWebSearch(options.webSearch) } : {}),
    ...(options.semanticSearch ? { semanticSearch: {} } : {}),
    ...(checkCommands(options).length > 0 || options.verifyLsp
      ? { verify: { commands: checkCommands(options), ...(options.verifyLsp ? { lsp: true } : {}) } }
      : {}),
    ...(options.mapTokens ? { repoMap: { tokens: options.mapTokens } } : {}),
    ...(options.autoLint ? { autoLint: { commands: options.autoLintCommands } } : {}),
    ...(options.shell && options.shell !== 'auto' ? { shell: options.shell } : {}),
    ...(Object.keys(options.autoFormatCommands ?? {}).length > 0 ? { autoFormat: { commands: options.autoFormatCommands } } : {}),
    ...(options.noProjectInstructions ? { disableProjectInstructions: true } : {}),
    ...(options.cheapModel
      ? {
          modelRouter: createExploreEditRouter({
            strong: model,
            cheap: { ...model, ...resolveModelAlias(options.cheapModel, sharedConfig.config.aliases, model.provider) },
          }),
        }
      : {}),
    ...(options.noCachePrompts ? { cachePrompts: false } : {}),
    // Old tool results become stubs once the prompt is large, as in VS Code (forge.context.maskOldResults, RB-90).
    maskOldResults: options.noMaskOldResults ? false : { keepRecentTurns: 6 },
    systemPrompt: options.systemPrompt ?? undefined,
    extraTools,
    ...(mcpInstructions ? { mcpInstructions } : {}),
    approve,
    redact: options.noRedact ? { enabled: false } : {},
    disableCost: options.noCost,
    disableMemory: options.noMemory,
    planMode: options.plan,
    enableCompaction: options.enableCompaction,
    ...(options.compactAt !== null ? { compactionThreshold: options.compactAt } : {}),
    toolSandbox: sandbox,
    ...(steering.docs.length > 0 ? { steering: { docs: steering.docs } } : {}),
    // One-shot --spec generation needs the read-only sandbox + specMode
    // wired together: same "caller owns the sandbox" split as core's
    // AgentConfig.specMode itself (see specs/generate.ts's header comment).
    // Only takes effect when --spec was actually passed; a plain task run
    // is unaffected. Comes after the plain `sandbox` spread above so it
    // unconditionally overrides toolSandbox: spec mode's read-only
    // restriction always wins over --allow-tools/--deny-tools, exactly
    // like the REPL's /spec wiring (repl.tsx's runAgent overrides).
    ...(options.spec
      ? { specMode: true, toolSandbox: { allowTools: [...SPEC_READONLY_TOOLS] } }
      : {}),
    skills: { registry: skillsRegistry },
    hooks: new HooksBus(hooksConfig.config),
  };
}

/**
 * Build a {@link ToolSandbox} from CLI flags. Returns undefined when no
 * sandbox-related flag was supplied (so the agent runs unrestricted).
 *
 * Per-tool policies are layered on top of the path/command/url lists: any
 * field that matches a file tool gets the path policy; run_command gets
 * both the path policy (so --allow-paths/--deny-paths also cover it) and
 * the command policy; fetch_url gets the URL policy. This keeps the CLI
 * surface small while letting users do most of what they'd want.
 */
export function buildSandbox(options: CliOptions): ToolSandbox | undefined {
  const allowTools = parseCsv(options.allowTools);
  const denyTools = [...parseCsv(options.denyTools), ...(options.dryRun ? DRY_RUN_DENIED_TOOLS : [])];

  const policies: NonNullable<ToolSandbox['policies']> = {};

  // Path policy: applied to every file tool. Maps allowedPaths/deniedPaths.
  const allowedPaths = parseCsv(options.allowPaths);
  const deniedPaths = parseCsv(options.denyPaths);
  if (allowedPaths.length > 0 || deniedPaths.length > 0) {
    const pathPolicy: { allowedPaths?: string[]; deniedPaths?: string[] } = {};
    if (allowedPaths.length > 0) pathPolicy.allowedPaths = allowedPaths;
    if (deniedPaths.length > 0) pathPolicy.deniedPaths = deniedPaths;
    for (const name of FILE_TOOL_NAMES) {
      policies[name] = { ...(policies[name] ?? {}), ...pathPolicy };
    }
    // --allow-paths/--deny-paths previously only reached the 5 file tools,
    // so e.g. `--deny-paths "**/.env"` didn't stop `run_command({command:
    // "cat .env"})`. Attach the same path policy here too: the sandbox
    // check (checkPolicyViolation) evaluates deniedPaths/allowedPaths
    // whenever the tool call supplies a resolvedPath, and this ensures
    // run_command's policy entry carries the same patterns as the file
    // tools even before/if run_command starts resolving paths out of its
    // command text.
    policies.run_command = { ...(policies.run_command ?? {}), ...pathPolicy };
  }

  // Command policy: applied to run_command.
  const allowedCommands = parseRegexCsv(options.allowCommands);
  const deniedCommands = parseRegexCsv(options.denyCommands);
  if (allowedCommands.length > 0 || deniedCommands.length > 0) {
    const cmdPolicy: { allowedCommands?: RegExp[]; deniedCommands?: RegExp[] } = {};
    if (allowedCommands.length > 0) cmdPolicy.allowedCommands = allowedCommands;
    if (deniedCommands.length > 0) cmdPolicy.deniedCommands = deniedCommands;
    policies.run_command = { ...(policies.run_command ?? {}), ...cmdPolicy };
  }

  // URL policy: applied to fetch_url.
  const allowedUrls = parseRegexCsv(options.allowUrls);
  const deniedUrls = parseRegexCsv(options.denyUrls);
  if (allowedUrls.length > 0 || deniedUrls.length > 0) {
    const urlPolicy: { allowedUrls?: RegExp[]; deniedUrls?: RegExp[] } = {};
    if (allowedUrls.length > 0) urlPolicy.allowedUrls = allowedUrls;
    if (deniedUrls.length > 0) urlPolicy.deniedUrls = deniedUrls;
    policies.fetch_url = { ...(policies.fetch_url ?? {}), ...urlPolicy };
  }

  if (allowTools.length === 0 && denyTools.length === 0 && Object.keys(policies).length === 0) {
    return undefined;
  }

  const sandbox: ToolSandbox = {};
  if (allowTools.length > 0) sandbox.allowTools = allowTools;
  if (denyTools.length > 0) sandbox.denyTools = denyTools;
  if (Object.keys(policies).length > 0) sandbox.policies = policies;
  return sandbox;
}

const FILE_TOOL_NAMES = ['read_file', 'write_file', 'edit_file', 'list_files', 'search_files'];

function parseCsv(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseRegexCsv(raw: string | null): RegExp[] {
  if (!raw) return [];
  const out: RegExp[] = [];
  for (const part of parseCsv(raw)) {
    try {
      out.push(new RegExp(part));
    } catch (err) {
      throw new Error(`Invalid regex in sandbox flag: "${part}": ${(err as Error).message}`);
    }
  }
  return out;
}

/** Tools that change anything outside the process; denied under `--dry-run`. */
export const DRY_RUN_DENIED_TOOLS = ['write_file', 'edit_file', 'edit_notebook', 'apply_patch', 'run_command', 'bg_start', 'repo_clone', 'browser_act', 'memory_write', 'memory_forget'];
