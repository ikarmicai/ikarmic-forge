import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Agent, createLanguageModel } from '@ikarmic/forge-core';
import type {
  AgentConfig,
  AgentEvent,
  AgentRunResult,
  LanguageModelFactory,
  ModelConfig,
} from '@ikarmic/forge-core';

import type {
  GraderContext,
  GraderResult,
  TaskDefinition,
  TaskInfo,
  ToolInvocation,
} from './graders/index.js';

/** What a single task run produced: passed to the report formatter. */
export interface TaskRunResult {
  task: TaskInfo;
  passed: boolean;
  /** Per-grader results, in the order the task defined them. */
  graderResults: GraderResult[];
  /** The agent's raw run result (kept for the JSON report). */
  agentResult: AgentRunResult;
  /** Tool invocations the agent made (also embedded in grader context). */
  toolInvocations: ToolInvocation[];
  /** Total wall-clock time for setup + run + grading. */
  durationMs: number;
  /** The cwd the task ran in: useful for debugging a failing run. */
  cwd: string;
  /** Error message if the run itself blew up (vs. just one grader failing). */
  error?: string;
}

/** What a whole batch run produced. */
export interface SuiteRunResult {
  model: ModelConfig;
  startedAt: string;
  finishedAt: string;
  /** One entry per task that ran (skipped tasks are not included). */
  results: TaskRunResult[];
  /** Summary numbers: precomputed so the CLI doesn't re-iterate. */
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    totalDurationMs: number;
    totalCostUsd: number;
  };
}

/** Options for {@link runTask}. */
export interface RunTaskOptions {
  /** Override the model factory (defaults to `createLanguageModel`). */
  modelFactory?: LanguageModelFactory;
  /** Override the per-task cwd (otherwise a fresh temp dir is created). */
  cwd?: string;
  /** Stream events for this run (used by the CLI to mirror to stdout). */
  onEvent?: (event: AgentEvent) => void;
}

/**
 * Run a single task end-to-end: create cwd, run setup, execute the agent,
 * grade the result, return everything. Always cleans up the temp dir on
 * exit (success or failure): the CLI uses the cwd only during the run.
 */
export async function runTask(
  task: TaskDefinition,
  model: ModelConfig,
  options: RunTaskOptions = {}
): Promise<TaskRunResult> {
  const start = Date.now();
  const ownsCwd = options.cwd === undefined;
  const cwd = options.cwd ?? (await mkdtemp(join(tmpdir(), `forge-eval-${task.id}-`)));
  const toolInvocations: ToolInvocation[] = [];
  const pendingCalls = new Map<string, ToolInvocation>();

  let agentResult!: AgentRunResult;
  let error: string | undefined;
  let graderResults: GraderResult[] = [];
  let passed = false;

  // A memory task must not read the host's ~/.forge/MEMORY.md.
  const prevGlobalMemory = process.env.FORGE_GLOBAL_MEMORY_DIR;
  if (task.memory) process.env.FORGE_GLOBAL_MEMORY_DIR = join(cwd, '.no-global-memory');

  try {
    // Setup the fixture files (if any).
    if (task.setup) {
      await task.setup(cwd);
    }

    // Build an Agent with everything disabled that would add noise: cost
    // tracking (we sum it ourselves), memory (per-task temp dir makes
    // persistent state confusing; a task can opt back in), cache (each task is unique).
    const config: AgentConfig = {
      model,
      cwd,
      auto: true, // evals are autonomous: no interactive approval prompts
      allowDestructive: true, // same reason
      disableCost: true,
      disableMemory: task.memory !== true,
      disableCache: true,
      ...(options.modelFactory ? { modelFactory: options.modelFactory } : {}),
    };
    const agent = new Agent(config);

    agentResult = await agent.run({
      task: task.task,
      onEvent: (event: AgentEvent) => {
        if (event.type === 'tool_call') {
          pendingCalls.set(event.id, { name: event.name, args: event.args, result: undefined, isError: false });
        } else if (event.type === 'tool_result') {
          const pending = pendingCalls.get(event.id);
          if (pending) {
            pending.result = event.result;
            pending.isError = event.isError;
            toolInvocations.push(pending);
            pendingCalls.delete(event.id);
          }
        }
        options.onEvent?.(event);
      },
    });

    // Run graders *before* cleaning up the temp dir so filesystem graders
    // can inspect files the agent created.
    const ctx: GraderContext = {
      cwd,
      task: taskInfo(task),
      result: agentResult,
      toolInvocations,
    };

    passed = true;
    for (const grader of task.graders) {
      try {
        const r = await grader(ctx);
        graderResults.push(r);
        if (!r.passed) passed = false;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        graderResults.push({ passed: false, message: 'grader threw', details: message });
        passed = false;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    if (task.memory) {
      if (prevGlobalMemory === undefined) delete process.env.FORGE_GLOBAL_MEMORY_DIR;
      else process.env.FORGE_GLOBAL_MEMORY_DIR = prevGlobalMemory;
    }
    if (ownsCwd) {
      await rm(cwd, { recursive: true, force: true });
    }
  }

  if (error) {
    return {
      task: taskInfo(task),
      passed: false,
      graderResults,
      agentResult: agentResult ?? emptyAgentResult(),
      toolInvocations,
      durationMs: Date.now() - start,
      cwd,
      error,
    };
  }

  return {
    task: taskInfo(task),
    passed,
    graderResults,
    agentResult,
    toolInvocations,
    durationMs: Date.now() - start,
    cwd,
  };
}

/** Run every task in `tasks` (or the whole catalog if omitted) sequentially. */
export async function runSuite(
  tasks: readonly TaskDefinition[],
  model: ModelConfig,
  options: RunTaskOptions = {}
): Promise<SuiteRunResult> {
  const startedAt = new Date().toISOString();
  const results: TaskRunResult[] = [];
  let totalCostUsd = 0;

  for (const task of tasks) {
    const result = await runTask(task, model, options);
    results.push(result);
    if (result.agentResult.costKnown) {
      totalCostUsd += result.agentResult.costUsd;
    }
  }

  const finishedAt = new Date().toISOString();
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  return {
    model,
    startedAt,
    finishedAt,
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      passRate: results.length === 0 ? 0 : passed / results.length,
      totalDurationMs,
      totalCostUsd,
    },
  };
}

/** Resolve a ModelConfig using the same precedence as the CLI. */
export function resolveModel(override?: string): ModelConfig {
  if (override) {
    const [provider, model] = override.split('/');
    if (!provider || !model) {
      throw new Error(
        `Invalid --model "${override}". Expected "<provider>/<model>" e.g. "anthropic/claude-3-5-haiku-latest".`
      );
    }
    return { provider: provider as ModelConfig['provider'], model };
  }
  return createLanguageModelFallback();
}

/** Re-export for the CLI to use directly. */
export { createLanguageModel };

/**
 * A tiny wrapper around `createLanguageModel` so we don't have to import the
 * core types directly here. Keeps the runner decoupled from the provider
 * implementation.
 */
function createLanguageModelFallback(): ModelConfig {
  // Same precedence as the CLI: env vars, then Ollama probe.
  // We delegate to the core helper when available; fall back to a hard error.
  const provider = process.env.FORGE_DEFAULT_PROVIDER;
  if (provider === 'ollama') {
    return { provider: 'ollama', model: process.env.FORGE_DEFAULT_MODEL ?? 'llama3.1' };
  }
  const envModel = process.env.FORGE_DEFAULT_MODEL;
  if (envModel && envModel.includes('/')) {
    const [p, m] = envModel.split('/');
    if (!p || !m) {
      throw new Error(`Invalid FORGE_DEFAULT_MODEL "${envModel}". Expected "<provider>/<model>".`);
    }
    return { provider: p as ModelConfig['provider'], model: m };
  }
  // Try Anthropic, OpenAI, Google, OpenRouter in that order: same as core.
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', model: envModel ?? 'claude-3-5-sonnet-latest' };
  if (process.env.OPENAI_API_KEY) return { provider: 'openai', model: envModel ?? 'gpt-4o-mini' };
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return { provider: 'google', model: envModel ?? 'gemini-2.0-flash-exp' };
  if (process.env.OPENROUTER_API_KEY) return { provider: 'openrouter', model: envModel ?? 'anthropic/claude-3.5-haiku' };
  throw new Error(
    'No model resolved. Pass --model <provider>/<model> or set FORGE_DEFAULT_MODEL and a provider API key ' +
      '(ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, OPENROUTER_API_KEY) or run `ollama serve`.'
  );
}

function taskInfo(task: TaskDefinition): TaskInfo {
  return {
    id: task.id,
    name: task.name,
    category: task.category,
    description: task.description,
  };
}

function emptyAgentResult(): AgentRunResult {
  return {
    finalText: '',
    iterations: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    reason: 'error',
    costUsd: 0,
    costKnown: false,
    messages: [],
  };
}
