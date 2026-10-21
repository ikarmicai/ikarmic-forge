import { describe, expect, it } from 'vitest';

import { activeCommands, listEntries, withEntry, withoutEntry } from '../src/chat/command-allow-store.js';

const W = '/work/a';
const all = {
  [W]: [
    { command: 'pnpm test', fingerprint: 'fp1' },
    { command: 'cargo test' },
  ],
  '/work/b': [{ command: 'git status' }],
};

describe('activeCommands', () => {
  it('returns this workspace only, and nothing when untrusted or empty', () => {
    expect(activeCommands(all, W, 'fp1', true).sort()).toEqual(['cargo test', 'pnpm test']);
    expect(activeCommands(all, '/work/b', 'fp1', true)).toEqual(['git status']);
    expect(activeCommands(all, W, 'fp1', false)).toEqual([]);
    expect(activeCommands(undefined, W, 'fp1', true)).toEqual([]);
    expect(activeCommands(all, '/nowhere', 'fp1', true)).toEqual([]);
  });

  it('drops a script-runner entry when the scripts changed, but keeps compiled-tool entries', () => {
    expect(activeCommands(all, W, 'fp2', true)).toEqual(['cargo test']);
  });
});

describe('withEntry and withoutEntry', () => {
  it('adds a normalised command with a fingerprint only for script runners', () => {
    const next = withEntry({}, W, '  pnpm   test ', 'fp1');
    expect(next).toEqual({ [W]: [{ command: 'pnpm test', fingerprint: 'fp1' }] });
    expect(withEntry({}, W, 'cargo test', 'fp1')).toEqual({ [W]: [{ command: 'cargo test' }] });
  });

  it('replaces an existing entry for the same command (new fingerprint) and leaves others alone', () => {
    const next = withEntry(all, W, 'pnpm test', 'fp9');
    expect(next[W]).toEqual([{ command: 'cargo test' }, { command: 'pnpm test', fingerprint: 'fp9' }]);
    expect(next['/work/b']).toEqual(all['/work/b']);
  });

  it('removes one entry, and the workspace key when it was the last', () => {
    expect(withoutEntry(all, W, 'pnpm test')[W]).toEqual([{ command: 'cargo test' }]);
    expect(withoutEntry(all, '/work/b', 'git status')).not.toHaveProperty('/work/b');
    expect(withoutEntry(all, W, 'nothing')).toEqual(all);
  });

  it('does not mutate its input', () => {
    const copy = JSON.parse(JSON.stringify(all));
    withEntry(all, W, 'make test', 'x');
    withoutEntry(all, W, 'pnpm test');
    expect(all).toEqual(copy);
  });
});

describe('listEntries', () => {
  it('flattens, sorted by workspace then command', () => {
    expect(listEntries(all)).toEqual([
      { workspace: '/work/a', command: 'cargo test' },
      { workspace: '/work/a', command: 'pnpm test' },
      { workspace: '/work/b', command: 'git status' },
    ]);
    expect(listEntries(undefined)).toEqual([]);
  });
});
