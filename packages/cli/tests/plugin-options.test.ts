import { describe, expect, it } from 'vitest';

import { parseOptions } from '../src/options.js';

const argv = (...a: string[]) => ['node', 'forge', ...a];

describe('forge plugin parsing', () => {
  it('parses list, show, install and remove', () => {
    expect(parseOptions(argv('plugin', 'list')).pluginCommand).toEqual({ list: true });
    expect(parseOptions(argv('plugin', 'show', 'demo')).pluginCommand).toEqual({ show: { name: 'demo' } });
    expect(parseOptions(argv('plugin', 'install', 'acme/demo')).pluginCommand).toEqual({
      install: { source: 'acme/demo', overwrite: false, project: false },
    });
    expect(parseOptions(argv('plugin', 'install', './p', '--force', '--project')).pluginCommand).toEqual({
      install: { source: './p', overwrite: true, project: true },
    });
    expect(parseOptions(argv('plugin', 'remove', 'demo', '--project')).pluginCommand).toEqual({
      remove: { name: 'demo', project: true },
    });
  });

  it('is null for ordinary tasks and --verify-lsp parses', () => {
    expect(parseOptions(argv('fix the bug')).pluginCommand).toBeNull();
    expect(parseOptions(argv('--verify-lsp', 'task')).options.verifyLsp).toBe(true);
    expect(parseOptions(argv('task')).options.verifyLsp).toBe(false);
  });
});

describe('forge session tail parsing', () => {
  it('defaults to the latest session', () => {
    expect(parseOptions(argv('session', 'tail', 'abc')).sessionCommand).toEqual({ tail: { id: 'abc' } });
    expect(parseOptions(argv('session', 'tail')).sessionCommand).toEqual({ tail: { id: 'latest' } });
    expect(parseOptions(argv('session', 'search', 'login', 'bug')).sessionCommand).toEqual({ search: { query: 'login bug', limit: 20 } });
  });
});
