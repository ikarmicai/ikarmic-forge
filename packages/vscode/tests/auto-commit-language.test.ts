import { describe, expect, it, vi } from 'vitest';

const afterRun = vi.hoisted(() => vi.fn(async () => null));
vi.mock('@ikarmic/forge-core', async (orig) => ({
  ...(await orig<typeof import('@ikarmic/forge-core')>()),
  isGitRepo: async () => true,
  beforeRun: async () => ({ dirtyCommit: null, leftDirty: [] }),
  afterRun,
}));

import { startAutoCommit } from '../src/chat/auto-commit.js';

const on = { enabled: true, dirtyCommits: true, attribute: true, runHooks: false };

describe('auto-commit passes the commit message settings on', () => {
  it('hands the instruction and the language to core', async () => {
    const run = (await startAutoCommit('/x', { ...on, instruction: 'Use gitmoji.', language: 'German' }, undefined))!;
    await run.finish('task');
    expect(afterRun).toHaveBeenCalledWith('/x', { leftDirty: [] }, expect.objectContaining({ instruction: 'Use gitmoji.', language: 'German' }));
  });
});
