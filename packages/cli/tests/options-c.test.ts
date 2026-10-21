import { describe, expect, it } from 'vitest';

import { checkCommands, parseLintCommands, parseMapTokens, parseOptions } from '../src/options.js';

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

  it('keeps a Windows path or a colon without a space as part of the command', () => {
    expect(parseLintCommands(['C:\\tools\\lint.exe --strict'])).toEqual({ '*': 'C:\\tools\\lint.exe --strict' });
    expect(parseLintCommands(['npx eslint --rule a:b'])).toEqual({ '*': 'npx eslint --rule a:b' });
    expect(() => parseLintCommands(['   '])).toThrow(/needs a command/);
  });
});
