/**
 * `forge diff <file1> <file2>` subcommand: print a unified diff between
 * two files (or a file and stdin). Pure CLI surface over the
 * {@link computeUnifiedDiff} core helper; no AI provider needed.
 *
 * Examples:
 *   forge diff before.txt after.txt
 *   forge diff --from-stdin package.json < updated-package.json
 *   forge diff --context 5 src/old.ts src/new.ts
 *
 * The output is pipe-friendly: same format as `git diff`, so it
 * composes with `less`, `diff-so-fancy`, etc.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

import { computeDiffSummary, computeUnifiedDiff, type DiffOptions } from '@ikarmic/forge-core';

export interface DiffCommandOptions {
  fileA: string;
  fileB?: string;
  contextLines?: number;
  fromStdin?: boolean;
  /** When set, only print the one-line summary (no diff text). */
  summaryOnly?: boolean;
  cwd?: string;
}

/**
 * Run the `forge diff` subcommand. Resolves file paths relative to
 * `cwd` and prints the unified diff (or summary) to stdout. Returns
 * the shell exit code: 0 = files identical, 1 = files differ, 2 = error.
 */
export function handleDiffCommand(opts: DiffCommandOptions): number {
  let before: string;
  let after: string;
  try {
    before = readFileSync(resolvePath(opts.cwd ?? process.cwd(), opts.fileA), 'utf8');
  } catch (err) {
    process.stderr.write(`forge diff: failed to read ${opts.fileA}: ${(err as Error).message}\n`);
    return 2;
  }
  if (opts.fromStdin) {
    try {
      after = readStdinSync();
    } catch (err) {
      process.stderr.write(`forge diff: failed to read stdin: ${(err as Error).message}\n`);
      return 2;
    }
  } else {
    const fileB = opts.fileB;
    if (!fileB) {
      process.stderr.write('forge diff: missing <fileB> (or pass --from-stdin)\n');
      return 2;
    }
    try {
      after = readFileSync(resolvePath(opts.cwd ?? process.cwd(), fileB), 'utf8');
    } catch (err) {
      process.stderr.write(`forge diff: failed to read ${fileB}: ${(err as Error).message}\n`);
      return 2;
    }
  }

  const diffOpts: DiffOptions = {
    filePath: opts.fileB ?? opts.fileA,
    ...(opts.contextLines !== undefined ? { contextLines: opts.contextLines } : {}),
  };
  const result = computeUnifiedDiff(before, after, diffOpts);

  if (opts.summaryOnly) {
    const summary = computeDiffSummary(before, after, diffOpts);
    process.stdout.write(`${summary.summary}\n`);
  } else if (!result.unchanged) {
    process.stdout.write(result.text);
    if (!result.text.endsWith('\n')) process.stdout.write('\n');
  }

  return result.unchanged ? 0 : 1;
}

function resolvePath(cwd: string, p: string): string {
  // Simple path resolver: accepts absolute paths as-is, otherwise
  // joins with cwd. Node's path.resolve would also normalize `..` but
  // we keep it minimal here. Also recognizes Windows UNC paths
  // (`\\server\share\file`) as absolute.
  if (p.startsWith('/') || p.startsWith('\\\\') || /^[a-zA-Z]:[\\/]/.test(p)) return p;
  return `${cwd}/${p}`;
}

function readStdinSync(): string {
  // Node 18+ exposes fs.readFileSync('/dev/stdin') as a synchronous
  // stdin read. On Windows this falls back to reading 0 via `readFileSync`
  // which works for short inputs. Errors (e.g. a known partial-read/EAGAIN
  // behavior on non-regular-file descriptors for large piped input on
  // Windows) propagate to the caller rather than being swallowed into ''
  //: silently treating a read failure as empty stdin would make `forge
  // diff --from-stdin` claim the whole file was deleted with no warning.
  return readFileSync(0, 'utf8');
}