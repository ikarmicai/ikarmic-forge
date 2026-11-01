import { BUILTIN_SPECIALISTS } from '@ikarmic/forge-core';
import { describe, expect, it } from 'vitest';

import { blockedCard } from '../src/chat/blocked-card.js';

const base = { specialists: BUILTIN_SPECIALISTS, cwd: process.cwd() };

describe('blockedCard', () => {
  it('offers Code when Testing may not change a source file', () => {
    expect(blockedCard({ ...base, modeId: 'testing', blocked: { kind: 'agent', tool: 'write_file', target: 'src/a.ts' } })).toEqual({
      action: 'switch',
      agentId: 'code',
      title: 'Another agent can do this',
      text: "Testing can't change src/a.ts. Code can.",
      primary: 'Switch to Code and continue',
    });
  });

  it('offers an agent for what the model said it cannot do', () => {
    const card = blockedCard({ ...base, modeId: 'ask', need: 'change_files' });
    expect(card).toMatchObject({ action: 'switch', agentId: 'code', text: "Ask can't change files. Code can." });
  });

  it('never offers a switch for a release command, only the command', () => {
    const card = blockedCard({ ...base, modeId: 'devops', blocked: { kind: 'never', tool: 'run_command', target: 'git push' } });
    expect(card).toMatchObject({ action: 'copy', command: 'git push', primary: 'Copy command' });
    expect(card).not.toHaveProperty('agentId');
  });

  it('points to the person\'s own rules', () => {
    expect(blockedCard({ ...base, modeId: 'code', blocked: { kind: 'rule', tool: 'run_command', target: 'rm x' } })).toMatchObject({ action: 'settings', primary: 'Open permissions' });
  });

  it('shows nothing when no agent can do it or nothing was blocked', () => {
    expect(blockedCard({ ...base, specialists: [], modeId: 'ask', need: 'change_files' })).toBeUndefined();
    expect(blockedCard({ ...base, modeId: 'ask' })).toBeUndefined();
  });

  it('names agents in words', () => {
    expect(blockedCard({ ...base, modeId: 'devops', need: 'read_web', specialists: BUILTIN_SPECIALISTS.filter((s) => s.id === 'code') })?.text).toBe("DevOps can't read the web. Code can.");
  });
});
