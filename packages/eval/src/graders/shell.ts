import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

import { shellEnv } from '@ikarmic/forge-core';

import type { Grader, GraderContext, GraderResult } from './types.js';

const execFileAsync = promisify(execFile);

/** Options for {@link commandRuns}. */
export interface CommandRunsOptions {
  /**
   * The command to run, as a string (parsed with `shell: true`) or as
   * `[program, ...args]` for direct execution. Strings are easier for
   * shell pipelines; arrays are safer (no shell interpolation).
   */
  command: string | readonly string[];
  /** Wall-clock cap in ms. Default 30s. */
  timeoutMs?: number;
  /**
   * Optional substring or regex the command's stdout must match. The command
   * must still exit 0: this is an *additional* check.
   */
  contains?: string;
  /** Optional regex for stdout. */
  matches?: RegExp;
  /** When true, check stderr instead of stdout for `contains` / `matches`. */
  fromStderr?: boolean;
  /** Additional env vars to set for the command. */
  env?: Record<string, string>;
}

/**
 * Grader that runs a shell command in the task's cwd and passes when the
 * command exits 0 (and optionally matches a stdout/stderr predicate).
 *
 * Use this for tasks like "run the test suite" or "execute the script and
 * report exit code" where the side effect itself is the thing being graded.
 *
 * Cross-platform note: shell strings use `cmd.exe` on Windows and `sh`
 * elsewhere. For Windows-friendly commands prefer `node -e "..."` or a
 * `[program, ...args]` array.
 */
export function commandRuns(options: CommandRunsOptions): Grader {
  const timeoutMs = options.timeoutMs ?? 30_000;
  return async (ctx: GraderContext): Promise<GraderResult> => {
    const cwd = resolve(ctx.cwd);
    try {
      const { stdout, stderr } = await runCommand(options.command, cwd, timeoutMs, options.env);
      const stream = options.fromStderr ? stderr : stdout;
      if (options.contains !== undefined && !stream.includes(options.contains)) {
        return {
          passed: false,
          message: `command ran but output missing "${options.contains}"`,
          details: truncate(stream),
        };
      }
      if (options.matches && !options.matches.test(stream)) {
        return {
          passed: false,
          message: `command ran but output did not match ${options.matches}`,
          details: truncate(stream),
        };
      }
      return {
        passed: true,
        message: `command ok: ${summarize(options.command)}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        passed: false,
        message: `command failed: ${summarize(options.command)}`,
        details: message,
      };
    }
  };
}

async function runCommand(
  command: string | readonly string[],
  cwd: string,
  timeoutMs: number,
  extraEnv: Record<string, string> | undefined
): Promise<{ stdout: string; stderr: string }> {
  const env = shellEnv({ ...process.env, ...(extraEnv ?? {}) });
  if (typeof command === 'string') {
    // Use the platform default shell so users can write shell idioms
    // (pipelines, redirection, etc.). shell-quoting is the caller's job.
    return execFileAsync(command, { cwd, timeout: timeoutMs, env, shell: true, maxBuffer: 4 * 1024 * 1024 });
  }
  const [program, ...args] = command;
  if (!program) throw new Error('commandRuns: empty command array');
  return execFileAsync(program, args, { cwd, timeout: timeoutMs, env, maxBuffer: 4 * 1024 * 1024 });
}

function summarize(cmd: string | readonly string[]): string {
  return typeof cmd === 'string' ? cmd : cmd.join(' ');
}

function truncate(s: string, max = 240): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}
