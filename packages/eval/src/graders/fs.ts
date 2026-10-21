import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import type { Grader, GraderContext, GraderResult } from './types.js';

/**
 * Grader that passes when `cwd/<relPath>` exists. Resolves to an absolute
 * path so paths with `..` can't escape the task's cwd.
 */
export function fileExists(relPath: string): Grader {
  return (ctx: GraderContext): GraderResult => {
    const abs = safeResolve(ctx.cwd, relPath);
    if (abs === null) {
      return {
        passed: false,
        message: `path "${relPath}" escaped task cwd`,
        details: `cwd: ${ctx.cwd}`,
      };
    }
    if (existsSync(abs)) {
      return { passed: true, message: `file exists: ${relPath}` };
    }
    return {
      passed: false,
      message: `file missing: ${relPath}`,
      details: `expected at: ${abs}`,
    };
  };
}

/**
 * Grader that passes when `cwd/<relPath>` exists AND its contents match the
 * given predicate (substring, regex, or equality).
 */
export function fileMatches(
  relPath: string,
  predicate: string | RegExp | { equals: string }
): Grader {
  return (ctx: GraderContext): GraderResult => {
    const abs = safeResolve(ctx.cwd, relPath);
    if (abs === null) {
      return { passed: false, message: `path "${relPath}" escaped task cwd` };
    }
    if (!existsSync(abs)) {
      return { passed: false, message: `file missing: ${relPath}`, details: `expected at: ${abs}` };
    }
    const text = readFileSync(abs, 'utf8');
    if (typeof predicate === 'string') {
      return text.includes(predicate)
        ? { passed: true, message: `file ${relPath} contains "${predicate}"` }
        : {
            passed: false,
            message: `file ${relPath} does not contain "${predicate}"`,
            details: truncate(text),
          };
    }
    if (predicate instanceof RegExp) {
      return predicate.test(text)
        ? { passed: true, message: `file ${relPath} matches ${predicate}` }
        : {
            passed: false,
            message: `file ${relPath} does not match ${predicate}`,
            details: truncate(text),
          };
    }
    const want = predicate.equals.trim();
    const got = text.trim();
    return got === want
      ? { passed: true, message: `file ${relPath} equals expected` }
      : {
          passed: false,
          message: `file ${relPath} content mismatch`,
          details: `expected: ${JSON.stringify(want)}\nactual:   ${JSON.stringify(got)}`,
        };
  };
}

/**
 * Grader that passes when `cwd/<relPath>` does NOT exist. Inverse of
 * {@link fileExists} for tasks like "delete stale.txt".
 */
export function fileMissing(relPath: string): Grader {
  return (ctx: GraderContext): GraderResult => {
    const abs = safeResolve(ctx.cwd, relPath);
    if (abs === null) {
      return { passed: true, message: `path "${relPath}" not in cwd (treated as missing)` };
    }
    return !existsSync(abs)
      ? { passed: true, message: `file absent: ${relPath}` }
      : { passed: false, message: `file should be missing: ${relPath}`, details: `still exists at: ${abs}` };
  };
}

/**
 * Grader that passes when `cwd/<relPath>` is a directory containing at least
 * `min` files matching the (optional) extension filter.
 */
export function directoryHas(relPath: string, min = 1, ext?: string): Grader {
  return (ctx: GraderContext): GraderResult => {
    const abs = safeResolve(ctx.cwd, relPath);
    if (abs === null) {
      return { passed: false, message: `path "${relPath}" escaped task cwd` };
    }
    if (!existsSync(abs)) {
      return { passed: false, message: `directory missing: ${relPath}` };
    }
    const st = statSync(abs);
    if (!st.isDirectory()) {
      return { passed: false, message: `not a directory: ${relPath}` };
    }
    const entries = readdirSync(abs);
    const matched = ext ? entries.filter((e) => e.endsWith(ext)) : entries;
    if (matched.length >= min) {
      return {
        passed: true,
        message: `directory ${relPath} has ${matched.length} entries${ext ? ` (${ext})` : ''}`,
      };
    }
    return {
      passed: false,
      message: `directory ${relPath} has only ${matched.length} entries (need ${min}${ext ? ` ${ext}` : ''})`,
    };
  };
}

/**
 * Resolve `relPath` against `cwd` and reject any escape attempts (`..`
 * segments, absolute paths, symlink games are not in scope: we trust the
 * grader author to use safe paths; this just defends against typos).
 */
function safeResolve(cwd: string, relPath: string): string | null {
  const abs = resolve(cwd, relPath);
  const root = resolve(cwd);
  if (abs !== root && !abs.startsWith(root + sep)) {
    return null;
  }
  return abs;
}

function truncate(s: string, max = 240): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}
