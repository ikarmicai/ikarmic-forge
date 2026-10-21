/**
 * JSON-schema / Zod-schema grader for the eval harness. v2.12.
 *
 * Validates `AgentRunResult.finalText` against a user-supplied Zod
 * schema. Pairs naturally with the v2.8 `--schema` mode: run the
 * agent in structured-output mode and grade the result with
 * `jsonSchema` for a fully deterministic CI pipeline (no LLM-as-judge
 * for tasks that have a clear JSON contract).
 *
 * The grader accepts the schema in two forms:
 *   - A Zod schema object (`z.object({...})`): the most ergonomic
 *     option, full TypeScript inference, no extra parse step.
 *   - A path to a `.json` / `.ts` / `.mjs` schema file: the most
 *     portable, lets the same schema be reused by the agent's
 *     `--schema` flag AND the grader.
 *
 * Extraction follows the same rules as the agent's structured-output
 * mode: try the raw text first, then a single ```json ... ``` fenced
 * block. See {@link validateFinalText} in `@ikarmic/forge-core` for
 * the reference implementation: this grader re-implements it
 * directly so the eval harness stays a leaf package (no dep on the
 * core's internal helpers).
 */
import type { z } from 'zod';

import { loadSchemaFile } from '@ikarmic/forge-core';

import type { Grader, GraderContext, GraderResult } from './types.js';

/** Options for {@link jsonSchema}. */
export interface JsonSchemaGraderOptions {
  /**
   * Only relevant when `schema` is a string. Default true: the
   * string is treated as a path to a schema file (`.ts` / `.js` /
   * `.mjs` / `.cjs` / `.json`) and loaded via {@link loadSchemaFile}
   * from `@ikarmic/forge-core` (dynamic import for JS/TS modules,
   * JSON-Schema-to-Zod conversion for `.json`). Set to false to make
   * the grader throw immediately instead of attempting to load the
   * string as a path.
   */
  schemaIsPath?: boolean;
  /**
   * Truncate the raw `finalText` in failure details to this many
   * characters. Default 400: long enough to see the offending JSON,
   * short enough to keep reports scannable.
   */
  maxDetailChars?: number;
}

/**
 * Grader that parses `finalText` as JSON and validates it against the
 * supplied schema. Returns `{ passed: true }` on a successful
 * validation, `{ passed: false, details }` with the validation error
 * + truncated text otherwise.
 *
 * ```ts
 * import { z } from 'zod';
 * import { jsonSchema } from '@ikarmic/forge-eval';
 *
 * const prSchema = z.object({
 *   title: z.string(),
 *   body: z.string().min(20),
 * });
 *
 * const task = defineTask({
 *   id: 'summarize-pr',
 *   graders: [jsonSchema(prSchema)],
 *   ...
 * });
 *
 * // Or load the same schema the agent uses via --schema:
 * const task = defineTask({
 *   id: 'extract-pr',
 *   graders: [jsonSchema('./schemas/pr-summary.ts')],
 *   ...
 * });
 * ```
 */
export function jsonSchema(
  schema: z.ZodTypeAny | string,
  options: JsonSchemaGraderOptions = {}
): Grader {
  const maxDetailChars = options.maxDetailChars ?? 400;
  if (typeof schema === 'string' && options.schemaIsPath === false) {
    throw new Error(
      'jsonSchema: schema was a string but schemaIsPath is false: string schemas are always loaded as a file path.'
    );
  }
  // Resolved lazily (loading a path requires a dynamic import, which is
  // async) and cached across grader invocations. When `schema` is already
  // a Zod schema object, `resolved` is set up-front and the grader stays
  // fully synchronous: no behavior change for existing callers.
  let resolved: z.ZodTypeAny | undefined = typeof schema === 'string' ? undefined : schema;
  let loadError: string | undefined;

  return (ctx: GraderContext): Promise<GraderResult> | GraderResult => {
    if (resolved !== undefined) {
      return gradeAgainstSchema(resolved, ctx, maxDetailChars);
    }
    if (loadError !== undefined) {
      return { passed: false, message: 'failed to load schema file', details: loadError };
    }
    return loadSchemaFile(schema as string).then(
      (s): GraderResult => {
        resolved = s;
        return gradeAgainstSchema(s, ctx, maxDetailChars);
      },
      (err: unknown): GraderResult => {
        loadError = (err as Error).message;
        return { passed: false, message: 'failed to load schema file', details: loadError };
      }
    );
  };
}

function gradeAgainstSchema(
  zodSchema: z.ZodTypeAny,
  ctx: GraderContext,
  maxDetailChars: number
): GraderResult {
  const text = ctx.result.finalText ?? '';
  const parsed = tryParseJson(text);
  if (parsed.parseError) {
    return {
      passed: false,
      message: 'finalText is not valid JSON',
      details: `${parsed.parseError}\n\ntext (first ${maxDetailChars} chars):\n${truncate(text, maxDetailChars)}`,
    };
  }
  const result = zodSchema.safeParse(parsed.value);
  if (result.success) {
    return { passed: true, message: 'JSON schema matched' };
  }
  return {
    passed: false,
    message: 'JSON schema mismatch',
    details: formatZodError(result.error, maxDetailChars, text),
  };
}

/**
 * Grader that validates the parsed JSON's *subset* of fields: useful
 * when the agent may add extra fields you don't want to grade but
 * the core fields must match. Behaves like {@link jsonSchema} but
 * wraps the user schema in `passthrough()` before validating, so any
 * extra fields are ignored rather than triggering a strict failure.
 *
 * Note: when `schema` is a path, it can't be inspected synchronously,
 * so the `passthrough()` wrapping is only applied to a Zod schema
 * object passed directly: a path-loaded schema is graded as-is.
 */
export function jsonSchemaPartial(
  schema: z.ZodTypeAny | string,
  options: JsonSchemaGraderOptions = {}
): Grader {
  // `passthrough()` keeps the schema's own type but ignores unknown
  // keys. For object schemas this means extra fields don't fail;
  // for non-object schemas it's a no-op. `passthrough` is only on
  // ZodObject, so we duck-type-check.
  const obj = schema as unknown as { passthrough?: () => z.ZodTypeAny };
  const tolerant = typeof obj.passthrough === 'function'
    ? obj.passthrough()
    : schema;
  return jsonSchema(tolerant, options);
}

// Helpers

interface ParseResult {
  value: unknown;
  parseError: string | null;
}

/**
 * Try to parse `text` as JSON. Falls back to extracting the content
 * of a single ```json ... ``` (or bare ``` ... ```) fenced block.
 * Mirrors `validateFinalText` from `@ikarmic/forge-core`'s structured
 * module: duplicated here so this leaf package doesn't pull in core.
 */
function tryParseJson(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { value: undefined, parseError: 'Response was empty' };
  }
  // Try raw text first.
  try {
    return { value: JSON.parse(trimmed), parseError: null };
  } catch {
    // Try a single fenced block.
  }
  const fence = extractFencedJson(trimmed);
  if (fence !== null) {
    try {
      return { value: JSON.parse(fence), parseError: null };
    } catch (err) {
      return { value: undefined, parseError: `Found a json fence but its contents are not valid JSON: ${(err as Error).message}` };
    }
  }
  return {
    value: undefined,
    parseError: 'Response is not valid JSON (and contains no ```json fence)',
  };
}

function extractFencedJson(text: string): string | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m && typeof m[1] === 'string') return m[1].trim();
  return null;
}

/**
 * Render a ZodError as a one-issue-per-line summary plus a truncated
 * version of the offending text. Designed for the report view, not
 * the model: humans read this.
 */
function formatZodError(
  err: z.ZodError,
  maxDetailChars: number,
  originalText: string
): string {
  const lines = err.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `  - ${path}: ${issue.message}`;
    })
    .join('\n');
  return `Validation errors:\n${lines}\n\ntext (first ${maxDetailChars} chars):\n${truncate(originalText, maxDetailChars)}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}
