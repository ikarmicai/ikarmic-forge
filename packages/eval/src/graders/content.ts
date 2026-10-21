/**
 * Structured content extraction graders. v2.13.
 *
 * Helpers for tasks where the agent's final text is expected to
 * contain extractable structured content (a JSON object, a fenced
 * code block in a specific language). These complement the
 * full-schema graders in `./schema.ts`: where `jsonSchema` requires a
 * Zod schema, `jsonContains` accepts a plain predicate so you don't
 * need to write a schema for "the response is roughly shaped like X".
 */
import type { Grader, GraderContext, GraderResult } from './types.js';

/** Options for {@link languageBlock}. */
export interface LanguageBlockOptions {
  /**
   * Truncate the extracted block content in failure details to this
   * many characters. Default 320.
   */
  maxDetailChars?: number;
  /**
   * When true (default), the grader fails when the fenced block is
   * missing. When false, a missing block is acceptable and yields a
   * pass.
   */
  requireBlock?: boolean;
}

/**
 * Grader that extracts the first <code>```&lt;lang&gt; ... ```</code>
 * fenced block from `finalText` and passes when `predicate(block)`
 * returns true. Language matching is case-insensitive.
 *
 * Use this for tasks like "agent produced a runnable Python snippet
 * with a `solve()` function" without parsing the whole response
 * manually.
 *
 * ```ts
 * graders: [
 *   languageBlock('ts', (code) => /export function/.test(code)),
 * ]
 * ```
 */
export function languageBlock(
  lang: string,
  predicate: (code: string) => boolean,
  options: LanguageBlockOptions = {}
): Grader {
  const maxDetailChars = options.maxDetailChars ?? 320;
  const requireBlock = options.requireBlock ?? true;
  return (ctx: GraderContext): GraderResult => {
    const text = ctx.result.finalText ?? '';
    const block = extractFencedBlock(text, lang);
    if (block === null) {
      return requireBlock
        ? {
            passed: false,
            message: `no \`\`\`${lang} ... \`\`\` block found in finalText`,
            details: truncate(text, maxDetailChars),
          }
        : { passed: true, message: `no \`\`\`${lang} block (not required)` };
    }
    return predicate(block)
      ? { passed: true, message: `\`\`\`${lang} block matched predicate` }
      : {
          passed: false,
          message: `\`\`\`${lang} block did not match predicate`,
          details: truncate(block, maxDetailChars),
        };
  };
}

/**
 * Predicate-driven JSON shape check. Parses `finalText` as JSON: raw
 * text first, then a single fenced block: then calls
 * `predicate(value)`. Passes when the predicate accepts.
 *
 * Use this instead of {@link jsonSchema} when the field set is loose,
 * you want to assert a single property, or you don't want a Zod
 * dependency in this task's grading.
 *
 * ```ts
 * jsonContains((v) => {
 *   return v && typeof v === 'object' &&
 *     'name' in v && 'price' in v && (v as any).price > 0;
 * })
 * ```
 */
export function jsonContains(predicate: (value: unknown) => boolean): Grader {
  return (ctx: GraderContext): GraderResult => {
    const text = ctx.result.finalText ?? '';
    const parsed = tryParseJsonLoose(text);
    if (parsed.parseError) {
      return {
        passed: false,
        message: 'finalText is not valid JSON',
        details: `${parsed.parseError}\n\ntext: ${truncate(text, 240)}`,
      };
    }
    return predicate(parsed.value)
      ? { passed: true, message: 'JSON matched predicate' }
      : {
          passed: false,
          message: 'JSON did not match predicate',
          details: `value: ${truncate(JSON.stringify(parsed.value), 240)}`,
        };
  };
}

// Helpers

/**
 * Extract the first fenced code block matching the language tag.
 * Case-insensitive. The same regex is used for both the typed
 * (`` ```ts ```) and generic (`` ``` ```) cases: passing an empty
 * `lang` matches any fenced block, which `jsonContains` uses as a
 * fallback when the raw text isn't valid JSON.
 */
function extractFencedBlock(text: string, lang: string): string | null {
  if (lang === '') {
    const fallback = text.match(/```[^\n]*\n?([\s\S]*?)```/);
    if (fallback && typeof fallback[1] === 'string') return fallback[1].trim();
    return null;
  }
  const pattern = new RegExp(
    '```' + escapeRegex(lang.toLowerCase()) + '[\\s\\S]*?\\n([\\s\\S]*?)```',
    'i'
  );
  const m = text.match(pattern);
  if (m && typeof m[1] === 'string') return m[1].trim();
  return null;
}

interface ParseResult {
  value: unknown;
  parseError: string | null;
}

/**
 * Try to parse `text` as JSON. Falls back to extracting a fenced
 * block first. Mirrors `validateFinalText` from `forge-core`'s
 * structured module so the two stay in sync structurally (without
 * forcing this leaf package to depend on core).
 */
function tryParseJsonLoose(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { value: undefined, parseError: 'response was empty' };
  try {
    return { value: JSON.parse(trimmed), parseError: null };
  } catch {
    /* try fenced block */
  }
  const fence = extractFencedBlock(trimmed, '');
  if (fence !== null) {
    try {
      return { value: JSON.parse(fence), parseError: null };
    } catch (err) {
      return {
        value: undefined,
        parseError: `fenced block not valid JSON: ${(err as Error).message}`,
      };
    }
  }
  return { value: undefined, parseError: 'no JSON found (and no fenced block)' };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}
