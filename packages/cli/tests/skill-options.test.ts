import { describe, expect, it } from 'vitest';

import { parseOptions } from '../src/options.js';

const argv = (...a: string[]) => ['node', 'forge', ...a];

/** `forge skill install|update|remove` and their flags reach the handler as one parsed command. */
describe('forge skill options', () => {
  it('reads install with its choice flags', () => {
    expect(parseOptions(argv('skill', 'install', 'o/r', '--skill', 'a, b', '--force')).skillCommand).toEqual({
      install: { url: 'o/r', overwrite: true, only: ['a', 'b'], all: false, list: false },
    });
    expect(parseOptions(argv('skill', 'install', 'o/r', '--all')).skillCommand).toEqual({ install: { url: 'o/r', overwrite: false, only: [], all: true, list: false } });
    expect(parseOptions(argv('skill', 'install', 'o/r', '--list')).skillCommand).toEqual({ install: { url: 'o/r', overwrite: false, only: [], all: false, list: true } });
  });

  it('reads update, with names and --force, and remove with --yes', () => {
    expect(parseOptions(argv('skill', 'update')).skillCommand).toEqual({ update: { names: [], force: false } });
    expect(parseOptions(argv('skill', 'update', 'pdf', 'docx', '--force')).skillCommand).toEqual({ update: { names: ['pdf', 'docx'], force: true } });
    expect(parseOptions(argv('skill', 'remove', 'pdf')).skillCommand).toEqual({ remove: { name: 'pdf', yes: false } });
    expect(parseOptions(argv('skill', 'rm', 'pdf', '--yes')).skillCommand).toEqual({ remove: { name: 'pdf', yes: true } });
  });
});
