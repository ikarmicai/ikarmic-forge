/**
 * Budget / throughput graders for the eval harness. v2.13.
 *
 * These graders inspect {@link AgentRunResult} aggregate fields
 * (tokens, cost, duration, iterations) and pass when they fall under
 * a caller-supplied ceiling. They let eval tasks answer questions
 * like "did the agent come in under budget?" without writing custom
 * predicates against raw numbers.
 *
 * Why a budget grader family?
 *   - Cost is a first-class eval signal for an LLM agent. If a task
 *     routinely hits 10x expected cost, that's a regression worth
 *     catching even if the answer is technically correct.
 *   - Latency ceilinging catches "agent goes into a long loop" bugs
 *     that correctness graders don't.
 *   - Pair `tokensUnder` / `costUnder` with `completed()` to assert
 *     "this task finishes correctly AND cheaply".
 */
import type { Grader, GraderContext, GraderResult } from './types.js';

/** Options for {@link tokensUnder}. */
export interface TokensUnderOptions {
  /**
   * Which token counter to budget against.
   *   - `'total'` (default): input + output, the most useful general signal
   *   - `'input'`: "agent didn't shovel huge context"
   *   - `'output'`: "agent didn't ramble"
   */
  kind?: 'input' | 'output' | 'total';
}

/**
 * Grader that passes when the chosen token counter is `<= max`.
 * The cap is a soft ceiling; the grader doesn't measure cost, just
 * raw token counts. Use {@link costUnder} for budget enforcement in
 * dollars.
 *
 * ```ts
 * graders: [
 *   completed(),
 *   tokensUnder(2000),                  // total <= 2000
 *   tokensUnder(800, { kind: 'input' }),// input alone <= 800
 * ],
 * ```
 */
export function tokensUnder(max: number, options: TokensUnderOptions = {}): Grader {
  const kind = options.kind ?? 'total';
  return (ctx: GraderContext): GraderResult => {
    const i = ctx.result.inputTokens;
    const o = ctx.result.outputTokens;
    const actual = kind === 'input' ? i : kind === 'output' ? o : i + o;
    return actual <= max
      ? { passed: true, message: `${kind} tokens ${actual} <= ${max}` }
      : { passed: false, message: `${kind} tokens ${actual} exceeded ${max}` };
  };
}

/**
 * Grader that passes when total cost is `<= maxUsd`. Fails when the
 * agent's model has no known pricing (the cost isn't knowable, so
 * "under budget" can't be verified).
 *
 * Used with cost-tracking models; for free-tier / on-device models
 * pricing is unknown and this grader will always fail, so omit it
 * from those tasks.
 */
export function costUnder(maxUsd: number): Grader {
  return (ctx: GraderContext): GraderResult => {
    const r = ctx.result;
    if (!r.costKnown) {
      return {
        passed: false,
        message: `cost unknown for model: cannot enforce <= $${maxUsd}`,
      };
    }
    return r.costUsd <= maxUsd
      ? { passed: true, message: `cost $${r.costUsd.toFixed(6)} <= $${maxUsd}` }
      : {
          passed: false,
          message: `cost $${r.costUsd.toFixed(6)} exceeded $${maxUsd}`,
        };
  };
}

/** Grader that passes when the wall-clock run duration is `<= maxMs`. */
export function durationUnder(maxMs: number): Grader {
  return (ctx: GraderContext): GraderResult => {
    const actual = ctx.result.durationMs;
    return actual <= maxMs
      ? { passed: true, message: `duration ${actual}ms <= ${maxMs}ms` }
      : { passed: false, message: `duration ${actual}ms exceeded ${maxMs}ms` };
  };
}

/** Grader that passes when the agent finished in `<= max` iterations. */
export function iterationsUnder(max: number): Grader {
  return (ctx: GraderContext): GraderResult => {
    const actual = ctx.result.iterations;
    return actual <= max
      ? { passed: true, message: `iterations ${actual} <= ${max}` }
      : { passed: false, message: `iterations ${actual} exceeded ${max}` };
  };
}
