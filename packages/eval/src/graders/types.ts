import type { AgentRunResult } from '@ikarmic/forge-core';

/**
 * One tool invocation captured during a task run. Built up from the agent's
 * `tool_call` + `tool_result` events, correlated by id, so graders can inspect
 * what the model actually did (not just what it said).
 */
export interface ToolInvocation {
  /** Tool name as exposed to the model (e.g. "read_file", "edit_file"). */
  name: string;
  /** Raw arguments the model passed. */
  args: unknown;
  /** Tool's result (after redaction), or the error message if `isError` is true. */
  result: unknown;
  /** True when the tool threw or returned an error. */
  isError: boolean;
}

/**
 * The context a grader runs in. Everything a grader might need to make a
 * verdict: where the task ran, what the model said, what tools it called,
 * the original task description.
 */
export interface GraderContext {
  /** Absolute path to the task's isolated working directory. */
  cwd: string;
  /** The task that was just run (in case the grader wants metadata). */
  task: TaskInfo;
  /** The agent's run result: finalText, iterations, tokens, etc. */
  result: AgentRunResult;
  /** Ordered list of every tool the agent invoked, with args + results. */
  toolInvocations: ToolInvocation[];
}

/**
 * Lightweight task descriptor surfaced to graders. Full task defs include
 * the `setup` function which isn't relevant to grading.
 */
export interface TaskInfo {
  id: string;
  name: string;
  category: TaskCategory;
  description: string;
}

export type TaskCategory = 'read' | 'edit' | 'multi-step';

/** What a grader returns. `passed` drives the score; `message` shows in the report. */
export interface GraderResult {
  passed: boolean;
  /** Short label for the report ("regex matched", "file exists", ...). */
  message: string;
  /** Optional longer explanation when failing: included in the markdown report. */
  details?: string;
}

/**
 * A grader is just an async function. Sync return is wrapped automatically.
 */
export type Grader = (ctx: GraderContext) => Promise<GraderResult> | GraderResult;

/**
 * Internal type used by `defineTask`: keeps the grader list type-safe while
 * allowing setup/task to be optional in user code.
 */
export interface TaskDefinition {
  id: string;
  name: string;
  category: TaskCategory;
  description: string;
  /** The user prompt given to the agent. */
  task: string;
  /**
   * Optional setup: writes fixture files into the task's cwd before the agent
   * starts. The cwd is a fresh temp directory per run.
   */
  setup?: (cwd: string) => Promise<void> | void;
  /**
   * Run with project memory enabled. Default off: memory would add noise to the other tasks.
   * The user's global memory is hidden for these runs so the result does not depend on the host.
   */
  memory?: boolean;
  /** Graders run after the agent finishes. All must pass for the task to pass. */
  graders: Grader[];
  /** Optional tags for filtering (e.g. "windows", "needs-network"). */
  tags?: string[];
}
