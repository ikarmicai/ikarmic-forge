import { describe, expect, it } from 'vitest';

import { checkCommands, parseLintCommands, parseMapTokens, parseOptions, sandboxConfigFor } from '../src/options.js';

const argv = (...args: string[]) => ['node', 'forge', ...args];

describe('CLI flags (set C)', () => {
  it('are off by default', () => {
    const o = parseOptions(argv('task')).options;
    expect([o.mapTokens, o.autoLint, o.autoLintCommands, o.lintCmds, o.testCmds]).toEqual([null, false, {}, [], []]);
  });

  it('--map-tokens takes a non-negative integer; 0 is off; junk is rejected', () => {
    expect(parseOptions(argv('--map-tokens', '2048', 'task')).options.mapTokens).toBe(2048);
    expect(parseOptions(argv('--map-tokens', '0', 'task')).options.mapTokens).toBeNull();
    for (const bad of ['-5', '1.5', 'lots', '']) expect(() => parseMapTokens(bad)).toThrow(/--map-tokens/);
  });

  it('--auto-lint alone checks syntax only; --auto-lint-cmd implies --auto-lint', () => {
    const syntaxOnly = parseOptions(argv('--auto-lint', 'task')).options;
    expect([syntaxOnly.autoLint, syntaxOnly.autoLintCommands]).toEqual([true, {}]);
    const withCmd = parseOptions(argv('--auto-lint-cmd', 'eslint --fix', 'task')).options;
    expect([withCmd.autoLint, withCmd.autoLintCommands]).toEqual([true, { '*': 'eslint --fix' }]);
  });

  it('--lint-cmd and --test-cmd are post-edit checks (like --verify), not the per-file linter', () => {
    const o = parseOptions(argv('--verify', 'tsc', '--lint-cmd', 'eslint .', '--lint-cmd', 'prettier -c .', '--test-cmd', 'vitest run', 'task')).options;
    expect([o.lintCmds, o.testCmds]).toEqual([['eslint .', 'prettier -c .'], ['vitest run']]);
    expect(checkCommands(o)).toEqual(['tsc', 'eslint .', 'prettier -c .', 'vitest run']);
    // They do not switch on auto-lint or define per-file linters.
    expect([o.autoLint, o.autoLintCommands]).toEqual([false, {}]);
    expect(checkCommands(parseOptions(argv('task')).options)).toEqual([]);
  });

  it('--auto-lint-cmd is repeatable and accepts extensions or language names before a colon', () => {
    expect(parseLintCommands(['ts: eslint', 'python: flake8', 'typescript: tsc-lint'])).toEqual({
      ts: 'tsc-lint',
      tsx: 'tsc-lint',
      py: 'flake8',
    });
    expect(parseLintCommands(['javascript: standard'])).toEqual({ js: 'standard', jsx: 'standard', mjs: 'standard', cjs: 'standard' });
    expect(parseLintCommands(['rb: rubocop'])).toEqual({ rb: 'rubocop' });
  });

  it('--auto-format-cmd collects formatters by extension and does not switch on auto-lint (G14)', () => {
    const o = parseOptions(argv('task', '--auto-format-cmd', 'go: gofmt -w', '--auto-format-cmd', 'prettier --write')).options;
    expect(o.autoFormatCommands).toEqual({ go: 'gofmt -w', '*': 'prettier --write' });
    expect(o.autoLint).toBe(false);
    expect(parseOptions(argv('task')).options.autoFormatCommands).toEqual({});
  });

  it('keeps a Windows path or a colon without a space as part of the command', () => {
    expect(parseLintCommands(['C:\\tools\\lint.exe --strict'])).toEqual({ '*': 'C:\\tools\\lint.exe --strict' });
    expect(parseLintCommands(['npx eslint --rule a:b'])).toEqual({ '*': 'npx eslint --rule a:b' });
    expect(() => parseLintCommands(['   '])).toThrow(/needs a command/);
  });
});

describe('--shell (G11)', () => {
  it('takes a Windows shell name, and refuses others with the choices', () => {
    expect(parseOptions(argv('task', '--shell', 'PowerShell')).options.shell).toBe('powershell');
    expect(parseOptions(argv('task')).options.shell).toBeUndefined();
    expect(() => parseOptions(argv('task', '--shell', 'fish'))).toThrow(/auto, pwsh, powershell, bash, cmd/);
  });
});

describe('--sandbox-allow-host and the sandbox on a system that cannot confine (F13)', () => {
  it('collects the allowed hosts', () => {
    const o = parseOptions(argv('task', '--sandbox', '--sandbox-allow-host', 'docs.example.com', '--sandbox-allow-host', '*.github.com')).options;
    expect(o.sandboxAllowHosts).toEqual(['docs.example.com', '*.github.com']);
    expect(parseOptions(argv('task')).options.sandboxAllowHosts).toEqual([]);
  });

  it('hands the hosts to the sandbox, and says nothing about confinement where there is a sandbox tool', () => {
    const cfg = sandboxConfigFor({ commandSandbox: 'on', sandboxAllowHosts: ['docs.example.com'] }, 'linux');
    expect(cfg).toEqual({ network: false, allowedHosts: ['docs.example.com'] });
    expect(sandboxConfigFor({ commandSandbox: 'on-network' }, 'darwin')).toEqual({ network: true });
  });

  it('on Windows tells the person on stderr, once, and lets core run the command (otherwise core refuses)', () => {
    const writes: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => (writes.push(String(chunk)), true)) as never;
    try {
      expect(sandboxConfigFor({ commandSandbox: 'on' }, 'win32')).toEqual({ network: false, allowUnconfined: true });
      sandboxConfigFor({ commandSandbox: 'on' }, 'win32');
    } finally {
      process.stderr.write = orig;
    }
    const notices = writes.filter((w) => /cannot confine commands on Windows/.test(w));
    expect(notices.length).toBeLessThanOrEqual(1);
  });
});
