import type { Grader, GraderContext, GraderResult } from './types.js';

/**
 * Grader that passes when the agent called a given tool at least `min` times
 * during the run. Use this to assert the model took the right path (vs. just
 * guessing in its final text).
 */
export function toolWasCalled(name: string, min = 1): Grader {
  return (ctx: GraderContext): GraderResult => {
    const calls = ctx.toolInvocations.filter((t) => t.name === name).length;
    return calls >= min
      ? { passed: true, message: `tool ${name} called ${calls}x` }
      : { passed: false, message: `tool ${name} called ${calls}x (need ${min})` };
  };
}

/**
 * Grader that passes when the agent never called a given tool. Useful for
 * "the agent should have done this without writing a file" tasks.
 */
export function toolNotCalled(name: string): Grader {
  return (ctx: GraderContext): GraderResult => {
    const calls = ctx.toolInvocations.filter((t) => t.name === name).length;
    return calls === 0
      ? { passed: true, message: `tool ${name} was not called` }
      : { passed: false, message: `tool ${name} was called ${calls}x but should not have been` };
  };
}

/**
 * Grader that passes when `finalText` is non-empty. Catches "model went
 * silent" runs that some graders above would also catch indirectly.
 */
export function finalTextNonEmpty(): Grader {
  return (ctx: GraderContext): GraderResult => {
    const text = ctx.result.finalText?.trim() ?? '';
    return text.length > 0
      ? { passed: true, message: 'finalText is non-empty' }
      : { passed: false, message: 'finalText is empty' };
  };
}

/**
 * Grader that passes when the agent finished with `reason === 'completed'`.
 * Catches runs that aborted early (max_iterations, error, etc.): even if
 * the other graders happened to pass.
 */
export function completed(): Grader {
  return (ctx: GraderContext): GraderResult => {
    return ctx.result.reason === 'completed'
      ? { passed: true, message: `reason: completed` }
      : { passed: false, message: `reason: ${ctx.result.reason}` };
  };
}

/**
 * Options for {@link toolCount}.
 *
 * At least one of `min` / `max` / `exact` must be provided. If
 * multiple are passed they're AND-ed together: `exact` is the
 * strongest constraint.
 */
export interface ToolCountOptions {
  min?: number;
  max?: number;
  exact?: number;
  /** Default 0: for `min`. */
}

/**
 * Grader that passes when the call count for `name` falls within
 * `min` / `max` (inclusive). Use this to assert a budget
 * ("didn't spam the read tool") or a minimum ("read at least once
 * before guessing").
 */
export function toolCount(name: string, options: ToolCountOptions = {}): Grader {
  if (options.min === undefined && options.max === undefined && options.exact === undefined) {
    throw new Error('toolCount requires at least one of min/max/exact');
  }
  const { min = 0, max = Number.POSITIVE_INFINITY, exact } = options;
  const effectiveMin = exact ?? min;
  const effectiveMax = exact ?? max;
  return (ctx: GraderContext): GraderResult => {
    const calls = ctx.toolInvocations.filter((t) => t.name === name).length;
    if (calls < effectiveMin) {
      return {
        passed: false,
        message: `tool ${name} called ${calls}x (need at least ${effectiveMin})`,
      };
    }
    if (calls > effectiveMax) {
      return {
        passed: false,
        message: `tool ${name} called ${calls}x (at most ${effectiveMax})`,
      };
    }
    return {
      passed: true,
      message: `tool ${name} called ${calls}x (in [${effectiveMin}, ${effectiveMax}])`,
    };
  };
}

/**
 * Grader that passes when at least one call to `name` had
 * `predicate(args)` return true. Use this to assert the agent
 * invoked a tool with the right arguments (not just the right tool
 * name): e.g. "the agent called `edit_file` with a non-empty diff"
 * vs. "the agent called `edit_file` 5 times on autopilot".
 */
export function toolCalledWith(
  name: string,
  predicate: (args: unknown) => boolean
): Grader {
  return (ctx: GraderContext): GraderResult => {
    const calls = ctx.toolInvocations.filter((t) => t.name === name);
    if (calls.length === 0) {
      return { passed: false, message: `tool ${name} was never called` };
    }
    const matching = calls.filter((t) => predicate(t.args));
    if (matching.length > 0) {
      return {
        passed: true,
        message: `tool ${name} called with matching args ${matching.length}x of ${calls.length}`,
      };
    }
    return {
      passed: false,
      message: `tool ${name} called ${calls.length}x but no call's args matched predicate`,
      details: `observed arg samples: ${calls
        .slice(0, 3)
        .map((c) => summarizeArgs(c.args))
        .join(' | ')}`,
    };
  };
}

/**
 * Grader that passes when no tool call during the run returned an
 * error. Useful as a baseline guard: any task that says "agent did
 * something" should also assert it didn't fall over partway.
 */
export function noToolErrors(): Grader {
  return (ctx: GraderContext): GraderResult => {
    const errs = ctx.toolInvocations.filter((t) => t.isError);
    if (errs.length === 0) {
      return { passed: true, message: 'no tool errors' };
    }
    return {
      passed: false,
      message: `${errs.length} tool call(s) errored`,
      details: errs
        .map((e) => `  - ${e.name}: ${shortError(e.result)}`)
        .join('\n'),
    };
  };
}

function shortError(result: unknown): string {
  if (result instanceof Error) return result.message;
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result).slice(0, 200);
  } catch {
    return '<unserializable>';
  }
}

function summarizeArgs(args: unknown): string {
  try {
    const s = JSON.stringify(args);
    return s.length > 80 ? s.slice(0, 77) + '…' : s;
  } catch {
    return '<unserializable>';
  }
}
