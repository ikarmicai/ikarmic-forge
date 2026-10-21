import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Resolve the built CLI entry. We test the compiled output (dist/bin/forge-eval.js)
 * so we're exercising what users actually run, not the source.
 *
 * Resolve via `import.meta.url` + `fileURLToPath` (instead of `__dirname`)
 * for portability — vitest's ESM-mode behavior with `__dirname` has shifted
 * between releases, and this works the same whether the test file is invoked
 * as CJS or ESM.
 */
const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'dist', 'bin', 'forge-eval.js');

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  if (!existsSync(CLI)) {
    throw new Error(`Built CLI not found at ${CLI}. Run \`pnpm build\` first.`);
  }
  const proc = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  return {
    status: proc.status,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  };
}

describe('forge-eval CLI', () => {
  it('prints help', () => {
    const r = runCli(['help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('forge-eval');
    expect(r.stdout).toContain('--model');
    expect(r.stdout).toContain('--task');
  });

  it('lists the task catalog', () => {
    const r = runCli(['list']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Tasks');
    // Spot-check a couple of known task ids.
    expect(r.stdout).toContain('read-package-version');
    expect(r.stdout).toContain('edit-write-hello');
    expect(r.stdout).toContain('multi-run-and-report');
  });

  it('exits 2 with a helpful message for unknown task ids', () => {
    const r = runCli(['run', '--task', 'does-not-exist']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown task id');
    expect(r.stderr).toContain('does-not-exist');
  });

  it('exits 2 when no model can be resolved', () => {
    // Strip all provider keys so resolveModel() has nothing to fall back on.
    const env = { ...process.env };
    for (const k of [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY',
      'OPENROUTER_API_KEY',
      'FORGE_DEFAULT_PROVIDER',
      'FORGE_DEFAULT_MODEL',
    ]) {
      delete env[k];
    }
    if (!existsSync(CLI)) throw new Error('CLI not built');
    const proc = spawnSync(process.execPath, [CLI, 'run', '--task', 'read-package-version'], {
      encoding: 'utf8',
      env,
    });
    expect(proc.status).toBe(2);
    expect(proc.stderr).toContain('No model resolved');
  });

  it('accepts --markdown flag', () => {
    const r = runCli(['run', '--help']);
    expect(r.status).toBe(0);
    // We don't assert on the actual run because no provider is configured
    // in CI; just confirm the parser recognizes the flag shape by checking
    // the help text mentions markdown output.
    expect(r.stdout).toContain('--markdown');
  });

  it('rejects unknown flags', () => {
    const r = runCli(['run', '--bogus']);
    expect(r.status).not.toBe(0);
  });

  it('built CLI file exists at expected path', () => {
    expect(existsSync(CLI)).toBe(true);
  });
});
