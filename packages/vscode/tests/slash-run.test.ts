import { describe, expect, it } from 'vitest';

import { BUILTIN_SLASH, type SlashEntry } from '../src/chat/slash-commands.js';
import { runSlash, type SlashDeps } from '../src/chat/slash-run.js';

function setup() {
  const calls: string[] = [];
  const deps: SlashDeps = {
    newChat: () => { calls.push('new'); },
    compact: async () => { calls.push('compact'); },
    exportChat: async () => { calls.push('export'); },
    openModelMenu: () => { calls.push('model'); },
    openModeSelect: () => { calls.push('mode'); },
    cycleVariant: () => { calls.push('variant'); },
    goal: async (args) => { calls.push(`goal:${args}`); },
    memory: async (args) => { calls.push(args ? `memory:${args}` : 'memory'); },
    openSettings: async () => { calls.push('settings'); },
    review: async (args) => { calls.push(args ? `review:${args}` : 'review'); },
    reload: async () => { calls.push('reload'); },
    terminalCommand: async (args) => { calls.push(`cmd:${args}`); },
    help: (text) => { calls.push(`help:${text}`); },
  };
  return { calls, deps };
}

describe('runSlash', () => {
  it('runs each built-in command through its dependency, exactly once', async () => {
    const expected: Record<string, string> = {
      new: 'new', compact: 'compact', export: 'export', model: 'model', mode: 'mode', variant: 'variant', memory: 'memory', settings: 'settings', review: 'review', reload: 'reload',
    };
    for (const [name, call] of Object.entries(expected)) {
      const { calls, deps } = setup();
      expect(await runSlash(name, '', deps, BUILTIN_SLASH)).toBe(true);
      expect(calls).toEqual([call]);
    }
  });

  it('passes the arguments of /goal through untouched', async () => {
    const { calls, deps } = setup();
    await runSlash('goal', 'ship the README', deps, BUILTIN_SLASH);
    await runSlash('goal', 'pause', deps, BUILTIN_SLASH);
    expect(calls).toEqual(['goal:ship the README', 'goal:pause']);
  });

  it('/help lists every built-in and custom command with its description', async () => {
    const { calls, deps } = setup();
    const custom: SlashEntry = { name: 'deploy', description: 'Deploy to staging', source: 'custom', takesArgs: true };
    await runSlash('help', '', deps, [...BUILTIN_SLASH, custom]);
    const text = calls[0]!;
    expect(text).toContain('/new');
    expect(text).toContain('/goal');
    expect(text).toContain('/deploy');
    expect(text).toContain('Deploy to staging');
  });

  it('returns false and does nothing for a name that is not a built-in', async () => {
    const { calls, deps } = setup();
    expect(await runSlash('deploy', '', deps, [...BUILTIN_SLASH, { name: 'deploy', description: 'd', source: 'custom', takesArgs: true }])).toBe(false);
    expect(await runSlash('nope', '', deps, BUILTIN_SLASH)).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('runSlash /memory arguments', () => {
  it('passes the subcommand text through', async () => {
    const { calls, deps } = setup();
    await runSlash('memory', 'add use tabs', deps, BUILTIN_SLASH);
    expect(calls).toEqual(['memory:add use tabs']);
  });
});

describe('runSlash /review arguments', () => {
  it('passes the scope through', async () => {
    const { calls, deps } = setup();
    await runSlash('review', 'branch main', deps, BUILTIN_SLASH);
    expect(calls).toEqual(['review:branch main']);
  });
});

