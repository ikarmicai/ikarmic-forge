import type { Grader, GraderContext, GraderResult } from './types.js';

/** Options for {@link regex}. */
export interface RegexGraderOptions {
  /** Match flags. Default: none. 'i' for case-insensitive. */
  flags?: string;
  /**
   * When true (default), treat `result.finalText` as multiline so `^` / `$`
   * match line boundaries. Useful when the model emits bulleted answers.
   */
  multiline?: boolean;
}

/**
 * Grader that passes when {@link AgentRunResult.finalText} matches a regex.
 *
 * ```ts
 * graders: [regex(/version.*?\d+\.\d+\.\d+/i)]
 * ```
 */
export function regex(pattern: RegExp, options: RegexGraderOptions = {}): Grader {
  const { flags = '', multiline = true } = options;
  const merged = mergeFlags(pattern, flags, multiline);
  return (_ctx: GraderContext): GraderResult => {
    const text = _ctx.result.finalText ?? '';
    const matched = merged.test(text);
    return matched
      ? { passed: true, message: `regex ${merged} matched` }
      : {
          passed: false,
          message: `regex ${merged} did not match`,
          details: truncate(text),
        };
  };
}

/** Grader that passes when `finalText` includes a substring (case-sensitive). */
export function contains(substring: string): Grader {
  return (ctx: GraderContext): GraderResult => {
    const text = ctx.result.finalText ?? '';
    return text.includes(substring)
      ? { passed: true, message: `contains "${substring}"` }
      : { passed: false, message: `does not contain "${substring}"`, details: truncate(text) };
  };
}

/**
 * Grader that passes when `finalText.trim()` exactly equals `expected.trim()`.
 * Use this for tasks where the answer is deterministic (e.g. the agent is
 * supposed to read a single file and report a single value).
 */
export function equals(expected: string): Grader {
  return (ctx: GraderContext): GraderResult => {
    const actual = (ctx.result.finalText ?? '').trim();
    const want = expected.trim();
    return actual === want
      ? { passed: true, message: `equals "${want}"` }
      : {
          passed: false,
          message: `text mismatch`,
          details: `expected: ${JSON.stringify(want)}\nactual:   ${JSON.stringify(actual)}`,
        };
  };
}

/**
 * Merge new flags with an existing RegExp's flags, deduplicating. Order doesn't
 * matter for the regex engine; we just need to not pass `g/.../g` which would
 * change `test()` to stateful behaviour.
 */
function mergeFlags(src: RegExp, extra: string, multiline: boolean): RegExp {
  const set = new Set(src.flags.split(''));
  for (const c of extra) set.add(c);
  if (multiline) set.add('m');
  // `g` would make `.test()` stateful across graders: strip it.
  set.delete('g');
  return new RegExp(src.source, Array.from(set).join(''));
}

function truncate(s: string, max = 240): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}
