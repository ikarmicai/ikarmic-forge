#!/usr/bin/env node
import { createRequire } from 'node:module';
import process from 'node:process';
import { isatty } from 'node:tty';
import React from 'react';
import { render } from 'ink';

import type { AgentConfig, AgentEvent, ModelConfig, ToolDefinition, ZodTypeAny } from '@ikarmic/forge-core';
import {
  Agent,
  SPEC_READONLY_TOOLS,
  architectPhaseConfig,
  defaultSessionDir,
  editorLimits,
  editorPhaseConfig,
  editorTask,
  formatCost,
  isUsableArchitectPlan,
  resolveModelAlias,
  runArchitect,
  findLatestSession,
  formatAliasTable,
  generateSessionId,
  loadForgeConfigFile,
  loadSchemaFile,
  loadSession,
  runReasonLabel,
  WorktreeManager,
} from '@ikarmic/forge-core';

import type { ModelMessage } from 'ai';

import { App, type AppProps } from '../app.js';
import { loadMcpTools } from '../mcp-loader.js';
import { applyModelAliases, parseOptions, toAgentConfig, type CliOptions, type ParsedSessionCommand, type ParsedSkillCommand, type ParsedPluginCommand, type ParsedHookCommand, type ParsedMemoryCommand, type ParsedMcpCommand, type ParsedCheckpointCommand, type ParsedSpecCommand, type ParsedDiffCommand, type ParsedOrchestratorCommand, type ParsedWorktreeCommand, type ParsedConfigCommand, type ResumeFlag } from '../options.js';
import { Repl } from '../repl.js';
import { isStructuredOutputError, startAgent, startStructuredAgent } from '../runner.js';
import { handlePluginCommand } from '../commands/plugin.js';
import { handleSkillCommand } from '../commands/skill.js';
import { handleHookCommand } from '../commands/hook.js';
import { handleMemoryCommand } from '../commands/memory.js';
import { handleMcpCommand } from '../commands/mcp.js';
import { handleCheckpointCommand } from '../commands/checkpoint.js';
import { handleSpecCommand } from '../commands/spec.js';
import { handleWatchCommand } from '../commands/watch.js';
import { handleDiffCommand } from '../commands/diff.js';
import { handleOrchestratorCommand } from '../commands/orchestrator.js';
import { handleWorktreeCommand } from '../commands/worktree.js';
import { loadCustomSpecialists } from '../specialists-loader.js';
import { confirmPlan } from '../commands/architect.js';
import { createNotifier } from '../notify.js';
import { createGitWorkflow, formatCommitLine, resolveCommitModel } from '../git-workflow.js';

const require = createRequire(import.meta.url);

interface ParsedInvocation {
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
  acpCommand: boolean;
  policyCommand: boolean;
  importCommand: { source: 'claude'; apply: boolean } | null;
  version: string;
}

interface SessionTools {
  tools: ToolDefinition[];
  /** What the connected MCP servers say about using them; goes into the system prompt. */
  instructions?: string;
  cleanup: () => Promise<void>;
}

async function main(): Promise<void> {
  let parsed: ParsedInvocation;
  try {
    parsed = parseOptions(process.argv);
  } catch (err) {
    process.stderr.write(`forge: ${(err as Error).message}\n`);
    process.exit(2);
  }
  const { options, resolveModel, listModels, sessionCommand, skillCommand, pluginCommand, hookCommand, memoryCommand, mcpCommand, checkpointCommand, specCommand, watchCommand, diffCommand, orchestratorCommand, worktreeCommand, configCommand, acpCommand, policyCommand, importCommand, version } = parsed;

  // Model aliases (`~/.forge/config.json` "aliases") rewrite --model before any
  // command resolves it; resolveModel() reads the same mutated options object.
  const { config: startupConfig, warnings: configWarnings } = await loadForgeConfigFile();
  for (const w of configWarnings) process.stderr.write(`forge: ${w}\n`);
  try {
    applyModelAliases(options, startupConfig.aliases);
  } catch (err) {
    process.stderr.write(`forge: ${(err as Error).message}\n`);
    process.exit(2);
  }

  // Bootstrap custom specialists from ~/.forge/specialists.json so
  // they're available to every orchestrator command without each
  // command knowing about the file. Silently no-ops when the file is
  // missing; logs warnings + errors to stderr when it's malformed.
  // Done early so `forge orchestrator list` can show custom entries.
  loadCustomSpecialists();

  // v2.11: auto-prune worktree leftovers from prior crashed sessions.
  // Best-effort: if anything goes wrong (not a git repo, etc.) we
  // silently skip. The user sees a one-line summary in stderr when
  // anything was actually cleaned up.
  await pruneWorktreesOnStartup(options.cwd ?? process.cwd());

  if (listModels) {
    try {
      const model = resolveModel();
      process.stdout.write(`${model.provider}/${model.model}\n`);
    } catch (err) {
      process.stderr.write(`forge: ${(err as Error).message}\n`);
      process.exit(2);
    }
    return;
  }

  // Handle the session subcommand (list / show / resume / delete) before
  // anything else: it doesn't need an AI provider configured.
  const resumeFlag: ResumeFlag | null = sessionCommand?.resume ?? null;
  if (sessionCommand) {
    await handleSessionCommand(sessionCommand);
    return;
  }

  // Skill subcommand: `forge skill list|show|install|browse`.
  if (skillCommand) {
    const code = await handleSkillCommand(skillCommand, options.cwd ?? process.cwd());
    process.exit(code);
  }

  // Plugin subcommand: `forge plugin list|show|install|remove`.
  if (pluginCommand) {
    const code = await handlePluginCommand(pluginCommand, options.cwd ?? process.cwd());
    process.exit(code);
  }

  // Hook subcommand: `forge hook list|test|log`.
  if (hookCommand) {
    const code = await handleHookCommand(hookCommand, options.cwd ?? process.cwd());
    process.exit(code);
  }

  // Memory subcommand: `forge memory list|check|forget`.
  if (memoryCommand) {
    const code = await handleMemoryCommand(memoryCommand, options.cwd ?? process.cwd());
    process.exit(code);
  }

  // MCP subcommand: `forge mcp list|install|remove|browse`.
  if (mcpCommand) {
    const code = await handleMcpCommand(mcpCommand, options.cwd ?? process.cwd());
    process.exit(code);
  }

  // Organization policy + corporate proxy. The policy file is enforced by every Agent, so a
  // broken one must stop the run here with a clear message rather than fail open.
  try {
    const { getOrgPolicy, installProxy, loadForgeConfigFile, loadModelCatalog, proxyFromEnv, readCaCertificates } = await import('@ikarmic/forge-core');
    const policy = getOrgPolicy()?.policy;
    // Extra certificate authorities come from the user's config file only (a project file cannot add one).
    const ca = readCaCertificates((await loadForgeConfigFile().catch(() => undefined))?.config.caCertificates ?? []);
    for (const w of ca.warnings) process.stderr.write(`forge: ${w}
`);
    await installProxy({ ...proxyFromEnv(), ...(policy?.proxy ?? {}) }, ca.pems);
    // Model limits and prices: a fresh cache answers at once; a refresh from models.dev may hold a command up 1.5 s at most.
    await Promise.race([loadModelCatalog(), new Promise((resolve) => setTimeout(resolve, 1500).unref())]);
  } catch (err) {
    if (!policyCommand) {
      process.stderr.write(`forge: ${(err as Error).message}\n`);
      process.exit(2);
    }
  }

  // `forge policy` shows the active organization policy.
  if (policyCommand) {
    const { handlePolicyCommand } = await import('../commands/policy.js');
    process.exit(handlePolicyCommand());
  }

  // `forge import claude [apply]` copies a Claude Code setup into Forge.
  if (importCommand) {
    const { handleImportCommand } = await import('../commands/import.js');
    process.exit(await handleImportCommand(importCommand));
  }

  // `forge acp` speaks the Agent Client Protocol on stdio (JetBrains AI Chat, Zed, ...).
  if (acpCommand) {
    const { handleAcpCommand } = await import('../commands/acp.js');
    process.exit(await handleAcpCommand(options, resolveModel, version));
  }

  // Config subcommand: `forge config` (interactive settings wizard).
  if (configCommand) {
    const { createKeyringCredentialStore } = await import('../credential-store.js');
    const { runConfigWizard } = await import('../commands/config.js');
    const aliasTable = formatAliasTable(startupConfig.aliases);
    if (aliasTable) process.stdout.write(`${aliasTable}\n\n`);
    await runConfigWizard({ credentialStore: createKeyringCredentialStore() });
    process.exit(0);
  }

  // Checkpoint subcommand: `forge checkpoint list|show|restore|prune`.
  if (checkpointCommand) {
    const code = await handleCheckpointCommand(checkpointCommand, options.cwd ?? process.cwd());
    process.exit(code);
  }

  // Spec subcommand: `forge spec list|show|cancel`.
  if (specCommand) {
    const cwd = options.cwd ?? process.cwd();
    const code = await handleSpecCommand(specCommand, cwd, {
      // Only `spec sync` calls this: a read-only spec-mode run, like `--spec`.
      runSpecAgent: async (task) => {
        const agent = new Agent({
          model: resolveModel(),
          cwd,
          auto: true,
          specMode: true,
          toolSandbox: { allowTools: [...SPEC_READONLY_TOOLS] },
        });
        return agent.run({ task });
      },
    });
    process.exit(code);
  }

  // Watch subcommand: `forge watch`. Runs until Ctrl+C; no AI provider needed.
  if (watchCommand) {
    const code = await handleWatchCommand(options.cwd ?? process.cwd(), resolveModel, { aiComments: options.aiComments });
    process.exit(code);
  }

  // Diff subcommand: `forge diff <fileA> <fileB>` or `--from-stdin`.
  if (diffCommand) {
    const code = handleDiffCommand({
      fileA: diffCommand.fileA,
      ...(diffCommand.fileB ? { fileB: diffCommand.fileB } : {}),
      ...(diffCommand.contextLines !== undefined ? { contextLines: diffCommand.contextLines } : {}),
      ...(diffCommand.fromStdin ? { fromStdin: true } : {}),
      ...(diffCommand.summaryOnly ? { summaryOnly: true } : {}),
      cwd: options.cwd ?? process.cwd(),
    });
    process.exit(code);
  }

  // Worktree subcommand: `forge worktree list | cleanup`. Doesn't need
  // an AI provider. Mirrors the soft-prefix pattern of `session` / `skill`
  // / `checkpoint`.
  if (worktreeCommand) {
    const code = await handleWorktreeCommand(
      worktreeCommand,
      options.cwd ?? process.cwd()
    );
    process.exit(code);
  }

  // Orchestrator subcommand: needs a model resolved before dispatch.
  if (orchestratorCommand && (orchestratorCommand.run || orchestratorCommand.plan)) {
    let model: ModelConfig;
    try {
      model = resolveModel();
    } catch (err) {
      process.stderr.write(`forge: ${(err as Error).message}\n`);
      process.exit(2);
    }
    const code = await handleOrchestratorCommand(
      orchestratorCommand,
      options.cwd ?? process.cwd(),
      { provider: model.provider, model: model.model },
      {
        worktrees: options.orchestratorWorktrees,
        cleanupBranches: options.orchestratorCleanupBranches,
        commitChanges: options.orchestratorCommit,
      }
    );
    process.exit(code);
  }
  if (orchestratorCommand) {
    // list-only path: no model needed
    const code = await handleOrchestratorCommand(
      orchestratorCommand,
      options.cwd ?? process.cwd(),
      { provider: 'openai', model: 'noop' } // unused for list
    );
    process.exit(code);
  }

  // From here on we need a real model: resolve it now and surface any
  // missing-key error in the right place.
  let model: ModelConfig;
  try {
    model = resolveModel();
  } catch (err) {
    process.stderr.write(`forge: ${(err as Error).message}\n`);
    process.exit(2);
  }

  // Load MCP tools (if configured) once per process. The cleanup runs on exit.
  const session: SessionTools = options.mcpConfig
    ? await loadMcpTools(options.mcpConfig)
    : { tools: [], cleanup: async () => {} };

  // Every exit path (onResult/onError/onExit/SIGINT handlers below) already
  // awaits `session.cleanup()` explicitly before calling `process.exit(...)`.
  // Guard it so the `process.on('exit', ...)` fallback below becomes a no-op
  // in that (common) case instead of re-running teardown a second time: 
  // it stays as a genuine fallback for any exit path that doesn't go
  // through explicit cleanup.
  const rawCleanup = session.cleanup;
  let cleaned = false;
  session.cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await rawCleanup();
  };

  // Ensure MCP servers always get a chance to clean up.
  process.on('exit', () => {
    // Synchronous best-effort: async cleanup happens on 'beforeExit' below.
    void session.cleanup();
  });
  process.on('beforeExit', async () => {
    await session.cleanup();
  });
  if (resumeFlag && resumeFlag.kind !== 'none' && !options.task) {
    if (!isatty(1) || !isatty(0)) {
      process.stderr.write(
        'forge: --resume requires a TTY. Run inside a terminal or use `forge session show <id>` to inspect offline.\n'
      );
      process.exit(2);
    }
    await runReplMode(options, model, session, resumeFlag, version);
    return;
  }

  // No task → interactive REPL (requires a TTY).
  if (!options.task) {
    if (!isatty(1) || !isatty(0)) {
      process.stderr.write(
        'forge: REPL mode requires a TTY. Pass a task as an argument or run inside a terminal.\n'
      );
      process.exit(2);
    }
    await runReplMode(options, model, session, null, version);
    return;
  }

  if (options.json) {
    await runJsonMode(options, model, session);
    return;
  }

  await runInkMode(options, model, session);
}

async function handleSessionCommand(cmd: ParsedSessionCommand): Promise<void> {
  const dir = defaultSessionDir();
  if (cmd.list) {
    const entries = await import('@ikarmic/forge-core').then((m) => m.listSessions(dir));
    const rows = entries.slice(0, cmd.list.limit);
    if (rows.length === 0) {
      process.stdout.write(`(no saved sessions in ${dir})\n`);
      return;
    }
    for (const e of rows) {
      const label = e.label ? ` [${e.label}]` : '';
      const tok = e.totalInputTokens !== undefined ? ` · ${e.totalInputTokens + (e.totalOutputTokens ?? 0)} tok` : '';
      const cost = e.totalCostUsd !== undefined && e.totalCostUsd > 0
        ? ` · $${e.totalCostUsd < 0.01 ? e.totalCostUsd.toFixed(4) : e.totalCostUsd.toFixed(3)}`
        : '';
      process.stdout.write(
        `${e.id}${label}  ${e.updatedAt}  ${e.model.provider}/${e.model.model}${tok}${cost}\n` +
          `    cwd: ${e.cwd}\n` +
          `    ${e.preview ?? '(no preview)'}\n`
      );
    }
    return;
  }
  if (cmd.show) {
    const session = await loadSession(cmd.show.id, dir);
    process.stdout.write(JSON.stringify(session, null, 2) + '\n');
    return;
  }
  if (cmd.delete) {
    await import('@ikarmic/forge-core').then((m) => m.deleteSession(cmd.delete!, dir));
    process.stdout.write(`deleted ${cmd.delete}\n`);
    return;
  }
  if (cmd.export) {
    await handleSessionExport(cmd.export, dir);
    return;
  }
  if (cmd.tail) {
    await handleSessionTail(cmd.tail.id, dir);
    return;
  }
  if (cmd.prune) {
    if (cmd.prune.olderThanDays === null || cmd.prune.olderThanDays <= 0) {
      process.stderr.write('usage: forge session prune --older-than <days> [--dry-run]\n');
      process.exitCode = 2;
      return;
    }
    const { pruneSessions } = await import('@ikarmic/forge-core');
    const result = await pruneSessions(dir, { olderThanDays: cmd.prune.olderThanDays, dryRun: cmd.prune.dryRun });
    const verb = cmd.prune.dryRun ? 'would delete' : 'deleted';
    process.stdout.write(`${verb} ${result.deleted.length} session${result.deleted.length === 1 ? '' : 's'}, kept ${result.kept}\n`);
    for (const id of result.deleted) process.stdout.write(`  ${id}\n`);
    return;
  }
  if (cmd.search) {
    if (!cmd.search.query.trim()) {
      process.stderr.write('usage: forge session search <words…>\n');
      process.exitCode = 2;
      return;
    }
    const found = await import('@ikarmic/forge-core').then((m) => m.searchSessions(dir, cmd.search!.query, { limit: cmd.search!.limit }));
    if (found.length === 0) {
      process.stdout.write(`(no session mentions "${cmd.search.query}")\n`);
      return;
    }
    for (const f of found) {
      const label = f.entry.label ? ` [${f.entry.label}]` : '';
      process.stdout.write(`${f.entry.id}${label}  ${f.entry.updatedAt}  ${f.hits} hit${f.hits === 1 ? '' : 's'}\n    cwd: ${f.entry.cwd}\n    ${f.snippet}\n`);
    }
    return;
  }
}

/** Print the session so far, then follow it until Ctrl-C (e.g. while the VS Code chat continues it). */
async function handleSessionTail(idArg: string, dir: string): Promise<void> {
  const core = await import('@ikarmic/forge-core');
  const id = idArg === 'latest' ? (await core.findLatestSession(dir))?.id : idArg;
  if (!id) {
    process.stderr.write(`forge session tail: no saved sessions in ${dir}\n`);
    process.exitCode = 2;
    return;
  }
  const session = await loadSession(id, dir);
  const print = (messages: typeof session.messages) => {
    for (const m of messages) for (const line of core.summarizeMessage(m)) process.stdout.write(`${line}\n`);
  };
  process.stderr.write(`following ${id} (Ctrl-C to stop)\n`);
  print(core.displayMessages(session));
  await new Promise<void>((resolve) => {
    const stop = core.watchSession(
      id,
      dir,
      ({ session: next, appended }) => {
        if (appended === null) process.stdout.write('--- history rewritten (compaction or another branch) ---\n');
        print(appended ?? core.displayMessages(next));
      },
      { known: core.displayMessages(session), onError: () => undefined }
    );
    process.once('SIGINT', () => {
      stop();
      resolve();
    });
  });
}

async function handleSessionExport(
  cmd: NonNullable<ParsedSessionCommand['export']>,
  dir: string
): Promise<void> {
  const session = await loadSession(cmd.id, dir);
  const core = await import('@ikarmic/forge-core');
  const rendered =
    cmd.format === 'json'
      ? core.formatSessionJson(session)
      : core.formatSessionMarkdown(session);
  if (cmd.output) {
    const fs = await import('node:fs/promises');
    await fs.writeFile(cmd.output, rendered, 'utf8');
    process.stderr.write(
      `wrote ${rendered.length} bytes (${cmd.format}) to ${cmd.output}\n`
    );
    return;
  }
  process.stdout.write(rendered);
}

/**
 * Resolve the schema path passed via `--schema <path>`. Loads the file
 * via {@link loadSchemaFile} which auto-detects `.ts`/`.js` (Zod default
 * export) vs `.json` (JSON Schema → Zod). Throws on missing file / bad
 * format so the caller can surface a clean CLI error.
 */
async function resolveStructuredSchema(path: string): Promise<ZodTypeAny> {
  // loadSchemaFile handles both Zod modules (default export) and JSON
  // Schema documents (auto-converted). For .ts files, users running
  // `forge` directly need to either compile the schema or use tsx;
  // loadSchemaFile surfaces a friendly error in that case.
  return await loadSchemaFile(path);
}

/**
 * v2.11: On every CLI startup, prune worktrees left behind by
 * crashed sessions. The current process's `WorktreeManager` instance
 * doesn't own any worktrees yet (none have been created), so
 * `pruneStale()` removes everything under `<repo>/.forge/worktrees/`
 * that wasn't created in *this* process. Silently no-ops when the
 * cwd isn't in a git repo.
 */
async function pruneWorktreesOnStartup(cwd: string): Promise<void> {
  try {
    const repoRoot = await WorktreeManager.resolveRepoRoot(cwd);
    if (!repoRoot) return;
    const manager = new WorktreeManager(repoRoot);
    const pruned = await manager.pruneStale();
    if (pruned > 0) {
      process.stderr.write(
        `forge: pruned ${pruned} stale worktree${pruned === 1 ? '' : 's'} from a previous session\n`
      );
    }
  } catch {
    // Best-effort. Never let startup hygiene block the user's command.
  }
}

async function runJsonMode(options: CliOptions, model: ModelConfig, session: SessionTools): Promise<void> {
  const baseConfig: AgentConfig = await toAgentConfig(
    options,
    model,
    async () => false,
    session.tools,
    session.instructions
  );

  if (options.architect) {
    await runArchitectJsonMode(options, model, session, baseConfig);
    return;
  }

  // Structured-output mode takes a separate path so we can wrap the
  // agent loop with schema validation + retry. We emit the same event
  // stream (so existing tooling keeps working) plus a final `data`
  // event carrying the validated payload.
  if (options.schema) {
    await runStructuredJsonMode(options, model, session, baseConfig);
    return;
  }

  const workflow = options.plan || options.spec ? null : await createGitWorkflow(options, baseConfig.cwd ?? process.cwd(), model);
  const savedDirty = await workflow?.before();
  if (savedDirty) process.stdout.write(`${JSON.stringify({ type: 'commit', kind: 'dirty', ...savedDirty })}\n`);

  const handle = startAgent({
    baseConfig,
    task: options.task!,
    hooks: {
      onEvent: (event: AgentEvent): void => {
        process.stdout.write(`${JSON.stringify(event)}\n`);
      },
      // In JSON mode we never prompt: default-deny. Pass --auto to bypass.
      requestApproval: async () => options.auto,
    },
  });
  try {
    const result = await handle.promise;
    if (workflow && result.reason === 'completed') {
      const commit = await workflow.after(options.task!).catch(() => null);
      if (commit) process.stdout.write(`${JSON.stringify({ type: 'commit', kind: 'run', ...commit })}\n`);
    }
    if (options.plan && result.reason === 'plan') {
      // For --plan --json, emit the plan as a single top-level field so
      // scripts can parse without digging through events.
      process.stdout.write(`${JSON.stringify({ type: 'plan', plan: result.finalText })}\n`);
    } else if (options.spec && result.reason === 'spec') {
      // For --spec --json, emit the raw (un-split) spec text as a single
      // top-level field: same "scripts don't dig through events" reason
      // as --plan --json above.
      process.stdout.write(`${JSON.stringify({ type: 'spec', spec: result.finalText })}\n`);
    } else {
      process.stdout.write(`${JSON.stringify({ type: 'final', ...result })}\n`);
    }
  } finally {
    await session.cleanup();
  }
}

async function runStructuredJsonMode(
  options: CliOptions,
  _model: ModelConfig,
  session: SessionTools,
  baseConfig: AgentConfig
): Promise<void> {
  const schema = await resolveStructuredSchema(options.schema!);
  const handle = startStructuredAgent({
    baseConfig,
    task: options.task!,
    schema,
    maxRetries: options.schemaRetries,
    hooks: {
      onEvent: (event: AgentEvent): void => {
        process.stdout.write(`${JSON.stringify(event)}\n`);
      },
      // Same default-deny policy as the plain JSON mode.
      requestApproval: async () => options.auto,
    },
  });
  try {
    const result = await handle.promise;
    process.stdout.write(`${JSON.stringify({
      type: 'structured',
      data: result.data,
      retries: result.retries,
      iterations: result.result.iterations,
      inputTokens: result.result.inputTokens,
      outputTokens: result.result.outputTokens,
      costUsd: result.result.costUsd,
      durationMs: result.result.durationMs,
    })}\n`);
  } catch (err) {
    if (isStructuredOutputError(err)) {
      // Distinct exit code (3) so scripts can tell "schema validation
      // failed after N retries" apart from a generic crash (1).
      process.stdout.write(`${JSON.stringify({
        type: 'structured_error',
        error: err.message,
        attempts: err.attempts,
        lastError: err.lastError,
        lastText: err.lastText,
      })}\n`);
      await session.cleanup();
      process.exit(3);
    }
    throw err;
  } finally {
    await session.cleanup();
  }
}

/** The `--editor-model`, carrying `--editor-reasoning` when given (the main model's configured effort never reaches it). */
function resolveEditorModel(
  options: CliOptions,
  aliases: Parameters<typeof resolveModelAlias>[1],
  model: ModelConfig
): ModelConfig {
  const editor = resolveModelAlias(options.editorModel!, aliases, model.provider);
  return options.editorReasoning ? { ...editor, reasoningEffort: options.editorReasoning } : editor;
}

async function runArchitectJsonMode(
  options: CliOptions,
  model: ModelConfig,
  session: SessionTools,
  baseConfig: AgentConfig
): Promise<void> {
  const { config: shared } = await loadForgeConfigFile();
  const editorModel = resolveEditorModel(options, shared.aliases, model);
  try {
    const result = await runArchitect({
      task: options.task!,
      baseConfig: { ...baseConfig, approve: async () => options.auto },
      editorModel,
      onEvent: (event: AgentEvent): void => {
        process.stdout.write(`${JSON.stringify(event)}\n`);
      },
    });
    process.stdout.write(`${JSON.stringify({ type: 'final', ...result })}\n`);
    process.exitCode = result.reason === 'completed' ? 0 : 1;
  } finally {
    await session.cleanup();
  }
}

async function runInkMode(options: CliOptions, model: ModelConfig, session: SessionTools): Promise<void> {
  if (!isatty(1)) {
    process.stderr.write('forge: refusing to render the TUI without a TTY. Pass --json or run inside a terminal.\n');
    process.exit(2);
  }
  const baseConfig: AgentConfig = await toAgentConfig(options, model, async () => false, session.tools, session.instructions);
  const { config: sharedConfig } = await loadForgeConfigFile();

  if (options.architect) {
    await runArchitectInkMode(options, model, session, baseConfig, sharedConfig);
    return;
  }

  // Structured-output mode in the TUI runs the agent normally, but
  // validates the final response against the schema and prints the
  // validated payload to stdout (for piping) before exiting. The TUI
  // still shows the full agent run so the user can see the work.
  if (options.schema) {
    await runStructuredInkMode(options, baseConfig, session);
    return;
  }

  const workflow = options.plan || options.spec ? null : await createGitWorkflow(options, baseConfig.cwd ?? process.cwd(), model);
  const savedDirty = await workflow?.before();
  if (savedDirty) process.stdout.write(`${formatCommitLine(savedDirty)} (your earlier changes)\n`);

  const app = render(
    React.createElement(App, {
      task: options.task!,
      baseConfig,
      model,
      display: sharedConfig.display,
      onResult: (result): void => {
        app.unmount();
        if (options.notifications) createNotifier({ command: options.notificationsCommand })(`Forge finished: ${runReasonLabel(result.reason)}`);
        setImmediate(async () => {
          await session.cleanup();
          if (workflow && result.reason === 'completed') {
            const commit = await workflow.after(options.task!).catch(() => null);
            if (commit) process.stdout.write(`\n${formatCommitLine(commit)}\n`);
          }
          if (options.plan) {
            // Plan mode: print the plan to stdout for easy piping, then
            // exit 0 (the user can pipe it into `$EDITOR`, a file, etc).
            process.stdout.write(`\n# Forge plan\n\n${result.finalText}\n`);
            process.exit(0);
            return;
          }
          if (options.spec) {
            // Spec mode, one-shot: print the raw three-section text and
            // exit 0. Unlike `/spec` in the REPL, one-shot mode has no
            // approve/edit/cancel step: nothing is written to
            // `.forge/specs/`. Point the user at the REPL for that.
            process.stdout.write(
              `\n# Forge spec draft\n\n${result.finalText}\n\n` +
                `(nothing written to disk: run \`forge\` and use \`/spec\` in the REPL to review and persist this to .forge/specs/)\n`
            );
            process.exit(0);
            return;
          }
          process.exit(result.reason === 'completed' ? 0 : 1);
        });
      },
      onError: (err): void => {
        app.unmount();
        setImmediate(async () => {
          await session.cleanup();
          process.stderr.write(`forge: ${err.message}\n`);
          process.exit(1);
        });
      },
    })
  );

  process.on('SIGINT', () => {
    app.unmount();
    setImmediate(async () => {
      await session.cleanup();
      process.exit(130);
    });
  });
}

/**
 * TUI architect mode: renders the normal App once per phase, with a plain
 * approve prompt in between. Repeats runArchitect's sequencing on purpose: 
 * Ink owns stdin while App is mounted, so it must unmount between phases.
 */
type PhaseResult = Parameters<AppProps['onResult']>[0];

async function runArchitectInkMode(
  options: CliOptions,
  model: ModelConfig,
  session: SessionTools,
  baseConfig: AgentConfig,
  sharedConfig: Awaited<ReturnType<typeof loadForgeConfigFile>>['config']
): Promise<void> {
  const editorModel = resolveEditorModel(options, sharedConfig.aliases, model);
  let currentApp: { unmount: () => void } | null = null;
  process.on('SIGINT', () => {
    currentApp?.unmount();
    setImmediate(async () => {
      await session.cleanup();
      process.exit(130);
    });
  });
  const renderPhase = (task: string, config: AgentConfig, phaseModel: ModelConfig): Promise<PhaseResult> =>
    new Promise((resolve, reject) => {
      const app = render(
        React.createElement(App, {
          task,
          baseConfig: config,
          model: phaseModel,
          display: sharedConfig.display,
          onResult: (result: PhaseResult): void => {
            app.unmount();
            setImmediate(() => resolve(result));
          },
          onError: (err: Error): void => {
            app.unmount();
            setImmediate(() => reject(err));
          },
        })
      );
      currentApp = app;
    });

  const finish = async (code: number, message?: string): Promise<never> => {
    await session.cleanup();
    if (message) process.stderr.write(`forge: ${message}\n`);
    process.exit(code);
  };

  try {
    process.stdout.write(`architect: ${model.provider}/${model.model}\n`);
    const architect = await renderPhase(options.task!, architectPhaseConfig(baseConfig), model);
    if (!isUsableArchitectPlan(architect)) {
      return await finish(1, architect.reason === 'spec' ? 'architect produced no usable plan' : `architect phase ended: ${runReasonLabel(architect.reason)}`);
    }
    process.stdout.write(`\n# Architect plan\n\n${architect.finalText}\n\n`);
    if (!options.auto && !(await confirmPlan(`${editorModel.provider}/${editorModel.model}`))) {
      return await finish(1, 'plan rejected');
    }

    const editorConfig = {
      ...editorPhaseConfig(baseConfig, editorModel),
      ...editorLimits(baseConfig, { costUsd: architect.costUsd ?? 0, durationMs: architect.durationMs ?? 0 }),
    };
    process.stdout.write(`editor: ${editorModel.provider}/${editorModel.model}\n`);
    const editor = await renderPhase(editorTask(options.task!, architect.finalText), editorConfig, editorModel);
    const known = (architect.costKnown ?? false) && (editor.costKnown ?? false);
    process.stdout.write(`architect + editor: ${formatCost((architect.costUsd ?? 0) + (editor.costUsd ?? 0), known)}\n`);
    return await finish(editor.reason === 'completed' ? 0 : 1);
  } catch (err) {
    return await finish(1, (err as Error).message);
  }
}

/**
 * TUI wrapper for structured mode. Renders the App, but on completion
 * the final response is validated against the schema (with retry) and
 * the validated object is pretty-printed to stdout before exiting 0.
 */
async function runStructuredInkMode(
  options: CliOptions,
  baseConfig: AgentConfig,
  session: SessionTools
): Promise<void> {
  const schema = await resolveStructuredSchema(options.schema!);
  const handle = startStructuredAgent({
    baseConfig,
    task: options.task!,
    schema,
    maxRetries: options.schemaRetries,
    hooks: {
      onEvent: (event: AgentEvent): void => {
        // In the TUI the App owns the live event stream: we just
        // forward here by re-emitting through the same path App uses.
        // For v2.8.0 we keep it simple: TUI runs structured mode
        // through startStructuredAgent without rendering; the validated
        // payload is printed on completion.
        void event;
      },
      // Approval is disabled in structured mode by default: these
      // runs are typically scripted / CI. Pass --auto to override.
      requestApproval: async () => options.auto,
    },
  });
  try {
    const result = await handle.promise;
    process.stdout.write('\n# Forge structured output\n\n');
    process.stdout.write(`${JSON.stringify(result.data, null, 2)}\n`);
    process.exit(0);
  } catch (err) {
    if (isStructuredOutputError(err)) {
      process.stderr.write(
        `forge: structured output failed after ${err.attempts} attempt(s): ${err.lastError}\n`
      );
      await session.cleanup();
      process.exit(3);
    }
    process.stderr.write(`forge: ${(err as Error).message}\n`);
    await session.cleanup();
    process.exit(1);
  } finally {
    // Best-effort cleanup if we didn't exit above.
  }
}

async function runReplMode(
  options: CliOptions,
  model: ModelConfig,
  session: SessionTools,
  resumeFlag: ResumeFlag | null,
  version: string
): Promise<void> {
  const baseConfig: AgentConfig = await toAgentConfig(options, model, async () => false, session.tools, session.instructions);
  const { config: sharedConfig } = await loadForgeConfigFile();

  // Resolve which session id we're using: fresh, by-id, or --latest.
  const dir = defaultSessionDir();
  const { sessionId, initialHistory, initialLabel } = await resolveResume(resumeFlag, model, dir);

  const gitWorkflow = await createGitWorkflow(options, baseConfig.cwd ?? process.cwd(), model);
  const commitModel = await resolveCommitModel(options, model);

  const app = render(
    React.createElement(Repl, {
      baseConfig,
      model,
      display: sharedConfig.display,
      gitWorkflow,
      gitOptions: { noAttribute: options.noAttribute, gitCommitVerify: options.gitCommitVerify },
      commitModel,
      ...(options.notifications ? { notify: createNotifier({ command: options.notificationsCommand }) } : {}),
      aliases: sharedConfig.aliases,
      version,
      lintCmds: options.lintCmds,
      testCmds: options.testCmds,
      onExit: () => {
        app.unmount();
        setImmediate(async () => {
          await session.cleanup();
          process.exit(0);
        });
      },
      sessionId,
      initialHistory,
      sessionDir: dir,
      ...(initialLabel ? { initialLabel } : {}),
    })
  );

  process.on('SIGINT', () => {
    app.unmount();
    setImmediate(async () => {
      await session.cleanup();
      process.exit(130);
    });
  });
}

/**
 * Decide what session id / history to start the REPL with.
 */
async function resolveResume(
  flag: ResumeFlag | null,
  _model: ModelConfig,
  dir: string
): Promise<{ sessionId: string; initialHistory: ModelMessage[] | undefined; initialLabel: string | undefined }> {
  if (!flag || flag.kind === 'none') {
    return { sessionId: generateSessionId(), initialHistory: undefined, initialLabel: undefined };
  }
  let id: string;
  if (flag.kind === 'latest') {
    const latest = await findLatestSession(dir);
    if (!latest) {
      process.stderr.write(`forge: no saved sessions in ${dir}; starting a fresh one\n`);
      return { sessionId: generateSessionId(), initialHistory: undefined, initialLabel: undefined };
    }
    id = latest.id;
  } else {
    id = flag.id;
  }
  try {
    const persisted = await loadSession(id, dir);
    return {
      sessionId: persisted.id,
      initialHistory: persisted.messages,
      initialLabel: persisted.label,
    };
  } catch (err) {
    process.stderr.write(`forge: ${(err as Error).message}; starting a fresh session\n`);
    return { sessionId: generateSessionId(), initialHistory: undefined, initialLabel: undefined };
  }
}

main().catch((err: Error) => {
  process.stderr.write(`forge: ${err.message}\n`);
  process.exit(1);
});

void require;
