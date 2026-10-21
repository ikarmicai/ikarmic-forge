import {
  Agent,
  runStructuredAgent,
  StructuredOutputError,
  isStructuredOutputError,
  type StructuredRunResult,
} from '@ikarmic/forge-core';
import type {
  AgentConfig,
  AgentEvent,
  AgentRunOptions,
  AgentRunResult,
  ApprovalRequest,
  ZodTypeAny,
} from '@ikarmic/forge-core';

/**
 * Plain callbacks the UI implements. The runner is UI-agnostic: it just
 * forwards events and resolves approval promises from whatever the UI
 * decides.
 */
export interface RunnerHooks {
  onEvent: (event: AgentEvent) => void;
  /** Called when the agent needs approval for a tool call. */
  requestApproval: (request: ApprovalRequest) => Promise<boolean>;
}

export interface RunRequest {
  /** Base agent config (model, cwd, etc.). The runner attaches hooks for you. */
  baseConfig: AgentConfig;
  /** The user task string. */
  task: string;
  hooks: RunnerHooks;
  abortSignal?: AbortSignal;
}

export interface RunHandle {
  promise: Promise<AgentRunResult>;
  abort: () => void;
}

/**
 * Start an agent run and return a handle so the UI can abort it (e.g. on
 * Ctrl+C). The hooks are wired into the agent config so the agent can ask
 * for approval and stream events back to the UI.
 */
export function startAgent(req: RunRequest): RunHandle {
  const controller = new AbortController();
  if (req.abortSignal) {
    req.abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const config: AgentConfig = {
    ...req.baseConfig,
    abortSignal: controller.signal,
    approve: req.hooks.requestApproval,
  };

  const promise = new Agent(config).run({
    task: req.task,
    abortSignal: controller.signal,
    onEvent: req.hooks.onEvent,
  });

  return {
    promise,
    abort: () => controller.abort(),
  };
}

// Structured-output mode

/**
 * Same shape as {@link RunRequest} plus the schema the final response must
 * match. Returns a handle wrapping a {@link StructuredRunResult} so the
 * caller can distinguish between the agent's final text and the
 * schema-validated payload.
 */
export interface StructuredRunRequest {
  baseConfig: AgentConfig;
  task: string;
  /** Zod schema the final response must validate against. */
  schema: ZodTypeAny;
  /** Max validation-retry rounds. */
  maxRetries: number;
  hooks: RunnerHooks;
  abortSignal?: AbortSignal;
}

export interface StructuredRunHandle {
  promise: Promise<StructuredRunResult>;
  abort: () => void;
}

/**
 * Start a structured-output agent run. The agent runs normally (with all
 * tools, hooks, sub-agents); on every completed attempt we validate the
 * final text against `req.schema` and retry with feedback if it doesn't
 * match. After `maxRetries` failed attempts we throw a
 * {@link StructuredOutputError} so the caller can distinguish the failure
 * from generic agent errors.
 */
export function startStructuredAgent(req: StructuredRunRequest): StructuredRunHandle {
  const controller = new AbortController();
  if (req.abortSignal) {
    req.abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const config: AgentConfig = {
    ...req.baseConfig,
    abortSignal: controller.signal,
    approve: req.hooks.requestApproval,
  };

  const promise = runStructuredAgent({
    baseConfig: config,
    task: req.task,
    schema: req.schema,
    maxRetries: req.maxRetries,
    abortSignal: controller.signal,
    onEvent: req.hooks.onEvent,
  });

  return {
    promise,
    abort: () => controller.abort(),
  };
}

// Re-exports so callers don't have to dig into `@ikarmic/forge-core` for
// the error type.
export { isStructuredOutputError, StructuredOutputError };
export type { StructuredRunResult };
export type { AgentRunOptions };
export type { ZodTypeAny };
