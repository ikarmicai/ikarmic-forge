import { describe, expect, it } from 'vitest';

import { aliasProblem, autonomyFlags, buildRunExtras, chatRunLimits, cleanLintCommands, webSearchFor, type RunExtrasSettings } from '../src/chat/run-extras.js';

describe('autonomyFlags', () => {
  // The Autonomous toggle promises "Approvals are off: Forge runs tools without asking". Core still asks
  // for a destructive tool (run_command, browser, MCP, sub_agent) under `auto` alone, which showed a
  // hold-to-run card with Autonomous on.
  it('Autonomous on also lets destructive tools run without a card', () => {
    expect(autonomyFlags(true)).toEqual({ auto: true, allowDestructive: true });
  });

  it('Autonomous off asks for everything', () => {
    expect(autonomyFlags(false)).toEqual({ auto: false, allowDestructive: false });
  });
});

describe('forge.maxSteps', () => {
  it('sets the run step limit, with 0 meaning no limit', () => {
    expect(buildRunExtras({ ...base, maxSteps: 80 }, model, { readOnly: false }).maxIterations).toBe(80);
    expect(buildRunExtras({ ...base, maxSteps: 0 }, model, { readOnly: false }).maxIterations).toBe(Number.POSITIVE_INFINITY);
    expect(buildRunExtras(base, model, { readOnly: false })).not.toHaveProperty('maxIterations');
  });
});

describe('forge.commandSandbox', () => {
  it('turns into the run command sandbox, network cut unless allowed', () => {
    expect(buildRunExtras({ ...base, commandSandbox: 'on' }, model, { readOnly: false }).commandSandbox).toEqual({ network: false });
    expect(buildRunExtras({ ...base, commandSandbox: 'on-network' }, model, { readOnly: false }).commandSandbox).toEqual({ network: true });
    expect(buildRunExtras({ ...base, commandSandbox: 'off' }, model, { readOnly: false })).not.toHaveProperty('commandSandbox');
  });
});

describe('chatRunLimits', () => {
  // Core stops a run after 10 minutes by default, a guard for unattended CLI runs. In the chat a person is watching
  // and has Stop; a long task on a slow model (MiniMax takes up to 30 s a step) was cut off in the middle.
  it('puts no wall-clock limit on a chat run', () => {
    expect(chatRunLimits().maxDurationMs).toBe(Number.POSITIVE_INFINITY);
  });
});

const base: RunExtrasSettings = {
  compaction: { enabled: true, threshold: 0.7 },
  context: { budgetTokens: 60000, maskOldResults: true, keepRecentTurns: 6 },
  maxCostUsd: 0,
  cheapModel: '',
  verifyCommands: [],
  semanticSearch: false,
  browser: { enabled: false, headless: true },
  audit: { enabled: false },
  cachePrompts: true,
  memory: { enabled: true, injectionBudgetBytes: 8000, maxBodyChars: 1200, autoApproveWrites: false },
};
const model = { provider: 'openai', model: 'gpt-4o' } as const;

describe('buildRunExtras', () => {
  it('defaults: compaction only', () => {
    expect(buildRunExtras(base, model, { readOnly: false })).toEqual({
      enableCompaction: true,
      compactionThreshold: 0.7,
      contextBudgetTokens: 60000,
      maskOldResults: { keepRecentTurns: 6 },
    });
  });

  it('passes the compaction keep-recent count and the tool output cap when they are set', () => {
    const e = buildRunExtras({ ...base, compaction: { enabled: true, threshold: 0.7, keepRecent: 8 }, tools: { maxOutputChars: 50_000 } }, model, { readOnly: false });
    expect(e).toMatchObject({ compactionKeepRecent: 8, maxToolOutputChars: 50_000 });
  });

  it('semantic search carries the extension list, score floor and result limit; the embedder stays the environment one by default', () => {
    const e = buildRunExtras(
      { ...base, semanticSearch: true, semantic: { embedder: 'env', model: '', baseUrl: '', apiKeyEnv: '', batchSize: 0, resultLimit: 5, minScore: 0.3, extensions: '.ts, py' } },
      model,
      { readOnly: false },
    );
    expect(e.semanticSearch).toEqual({ extensions: ['.ts', '.py'], minScore: 0.3, defaultLimit: 5 });
  });

  it('a chosen embedder is built from the settings; custom needs its url and model or falls back to hashing', () => {
    const custom = buildRunExtras(
      { ...base, semanticSearch: true, semantic: { embedder: 'custom', model: 'my-embed', baseUrl: 'https://emb.test/v1', apiKeyEnv: '', batchSize: 16, resultLimit: 0, minScore: 0, extensions: '' } },
      model,
      { readOnly: false },
    );
    expect(custom.semanticSearch?.embedder?.id).toContain('my-embed');
    const broken = buildRunExtras(
      { ...base, semanticSearch: true, semantic: { embedder: 'custom', model: '', baseUrl: '', apiKeyEnv: '', batchSize: 0, resultLimit: 0, minScore: 0, extensions: '' } },
      model,
      { readOnly: false },
    );
    expect(broken.semanticSearch?.embedder?.id).toMatch(/^hashing/);
  });

  it('semantic settings do nothing while semantic search is off', () => {
    const e = buildRunExtras({ ...base, semanticSearch: false, semantic: { embedder: 'ollama', model: '', baseUrl: '', apiKeyEnv: '', batchSize: 0, resultLimit: 3, minScore: 0.2, extensions: 'ts' } }, model, { readOnly: false });
    expect(e).not.toHaveProperty('semanticSearch');
  });

  it('leaves both out when unset, so the core defaults apply', () => {
    const e = buildRunExtras(base, model, { readOnly: false });
    expect(e).not.toHaveProperty('compactionKeepRecent');
    expect(e).not.toHaveProperty('maxToolOutputChars');
  });

  it('maps each setting to its AgentConfig field', () => {
    const e = buildRunExtras(
      { ...base, maxCostUsd: 2.5, verifyCommands: ['pnpm test'], semanticSearch: true, browser: { enabled: true, headless: false } },
      model,
      { readOnly: false }
    );
    expect(e.maxCostUsd).toBe(2.5);
    expect(e.verify).toEqual({ commands: ['pnpm test'] });
    expect(e.semanticSearch).toEqual({});
    expect(e.browser).toEqual({ headless: false });
  });

  it('cheap model becomes a router on the same provider; same-as-main is ignored', () => {
    const routed = buildRunExtras({ ...base, cheapModel: ' gpt-4o-mini ' }, model, { readOnly: false });
    expect(routed.modelRouter).toBeTypeOf('function');
    expect(routed.modelRouter!({ iteration: 2, task: '', messagesCount: 1, lastToolNames: ['read_file'] })).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
    expect(buildRunExtras({ ...base, cheapModel: 'gpt-4o' }, model, { readOnly: false }).modelRouter).toBeUndefined();
  });

  it('passes loopGuardThreshold only when it is above 0 and the run is not read-only', () => {
    expect(buildRunExtras({ ...base, loopGuardThreshold: 4 }, model, { readOnly: false }).loopGuardThreshold).toBe(4);
    expect(buildRunExtras({ ...base, loopGuardThreshold: 0 }, model, { readOnly: false }).loopGuardThreshold).toBeUndefined();
    expect(buildRunExtras(base, model, { readOnly: false }).loopGuardThreshold).toBeUndefined();
    expect(buildRunExtras({ ...base, loopGuardThreshold: 4 }, model, { readOnly: true }).loopGuardThreshold).toBeUndefined();
  });

  it('audit is a sink on every run, even read-only ones', () => {
    expect(buildRunExtras({ ...base, audit: { enabled: true } }, model, { readOnly: false }).audit).toBeDefined();
    expect(buildRunExtras({ ...base, audit: { enabled: true } }, model, { readOnly: true }).audit).toBeDefined();
    expect(buildRunExtras(base, model, { readOnly: false }).audit).toBeUndefined();
  });

  it('read-only runs (spec generation) only get semantic search', () => {
    const e = buildRunExtras({ ...base, maxCostUsd: 1, verifyCommands: ['x'], semanticSearch: true, browser: { enabled: true, headless: true } }, model, { readOnly: true });
    expect(e).toEqual({ semanticSearch: {} });
  });

  it('maps the memory settings to AgentConfig, and adds nothing at the defaults', () => {
    expect(buildRunExtras(base, model, { readOnly: true })).toEqual({});
    const e = buildRunExtras(
      { ...base, memory: { enabled: false, injectionBudgetBytes: 4000, maxBodyChars: 600, autoApproveWrites: true } },
      model,
      { readOnly: true }
    );
    expect(e).toEqual({ disableMemory: true, memoryInjectionBudget: 4000, memoryMaxBodyChars: 600, memoryAutoApproveWrites: true });
  });

  it('turns prompt caching off only when the setting is false', () => {
    expect(buildRunExtras(base, model, { readOnly: false }).cachePrompts).toBeUndefined();
    expect(buildRunExtras({ ...base, cachePrompts: false }, model, { readOnly: false }).cachePrompts).toBe(false);
    expect(buildRunExtras({ ...base, cachePrompts: false }, model, { readOnly: true }).cachePrompts).toBe(false);
  });

  it('auto-detected checks get a 120s cap, skip slow ones, and ask first when given an approve hook', () => {
    const approve = async () => true;
    const e = buildRunExtras({ ...base, verifyCommands: ['pnpm run test'] }, model, { readOnly: false, verifyAuto: { approve } });
    expect(e.verify).toEqual({ commands: ['pnpm run test'], timeoutMs: 120_000, slowCheckPolicy: 'skip', approve });
  });

  it('auto-detected checks without consent need no approve hook', () => {
    const e = buildRunExtras({ ...base, verifyCommands: ['pnpm run test'] }, model, { readOnly: false, verifyAuto: {} });
    expect(e.verify).toEqual({ commands: ['pnpm run test'], timeoutMs: 120_000, slowCheckPolicy: 'skip' });
  });

  it('read-only runs get no verify even with verifyAuto', () => {
    expect(buildRunExtras({ ...base, verifyCommands: ['x'] }, model, { readOnly: true, verifyAuto: {} }).verify).toBeUndefined();
  });

  it('maps the context settings: budget, masking and how many recent turns stay unmasked', () => {
    const e = buildRunExtras({ ...base, context: { budgetTokens: 30000, maskOldResults: true, keepRecentTurns: 4 } }, model, { readOnly: false });
    expect(e.contextBudgetTokens).toBe(30000);
    expect(e.maskOldResults).toEqual({ keepRecentTurns: 4 });
  });

  it('a budget of 0 means the window alone, and masking can be turned off', () => {
    const e = buildRunExtras({ ...base, context: { budgetTokens: 0, maskOldResults: false, keepRecentTurns: 6 } }, model, { readOnly: false });
    expect(e.contextBudgetTokens).toBeUndefined();
    expect(e.maskOldResults).toBe(false);
  });

  it('read-only runs (spec generation) get no context settings', () => {
    const e = buildRunExtras(base, model, { readOnly: true });
    expect(e.contextBudgetTokens).toBeUndefined();
    expect(e.maskOldResults).toBeUndefined();
  });

  it('aliasProblem reports a broken alias in any of the run models, before anything throws later', () => {
    const aliases = { a: 'b', b: 'a', fast: 'anthropic:claude-haiku-4-5' };
    expect(aliasProblem(['gpt-4o', 'fast', ''], aliases)).toBeUndefined();
    expect(aliasProblem(['gpt-4o', '', 'a'], aliases)).toBe('Model alias loop: a → b → a');
    expect(aliasProblem(['a'], undefined)).toBeUndefined();
  });

  it('resolves the cheap model through aliases, including another provider', () => {
    const extras = buildRunExtras({ ...base, cheapModel: 'fast' }, model, {
      readOnly: false,
      aliases: { fast: 'anthropic:claude-haiku-4-5' },
    });
    expect(extras.modelRouter).toBeDefined();
    const routed = extras.modelRouter!({ iteration: 2, task: 't', messagesCount: 3, lastToolNames: ['read_file'] });
    expect(routed).toEqual({ ...model, provider: 'anthropic', model: 'claude-haiku-4-5' });
  });
});

describe('repo map and auto-lint settings', () => {
  it('are off by default', () => {
    const e = buildRunExtras(base, model, { readOnly: false });
    expect(e.repoMap).toBeUndefined();
    expect(e.autoLint).toBeUndefined();
    expect(buildRunExtras({ ...base, repoMapTokens: 0, autoLint: { enabled: false, commands: { ts: 'eslint' } } }, model, { readOnly: false }).autoLint).toBeUndefined();
  });

  it('repoMapTokens becomes the repo map size, also for read-only runs such as spec generation', () => {
    expect(buildRunExtras({ ...base, repoMapTokens: 2048 }, model, { readOnly: false }).repoMap).toEqual({ tokens: 2048 });
    expect(buildRunExtras({ ...base, repoMapTokens: 2048 }, model, { readOnly: true }).repoMap).toEqual({ tokens: 2048 });
  });

  it('autoLint passes its commands to the agent, but only for runs that can edit', () => {
    const autoLint = { enabled: true, commands: { ts: 'npx eslint', '*': 'check' } };
    expect(buildRunExtras({ ...base, autoLint }, model, { readOnly: false }).autoLint).toEqual({ commands: { ts: 'npx eslint', '*': 'check' } });
    expect(buildRunExtras({ ...base, autoLint: { enabled: true, commands: {} } }, model, { readOnly: false }).autoLint).toEqual({ commands: {} }); // syntax check only
    expect(buildRunExtras({ ...base, autoLint }, model, { readOnly: true }).autoLint).toBeUndefined();
  });
});

describe('cleanLintCommands', () => {
  it('keeps extension -> command entries, drops leading dots, blanks and non-strings', () => {
    expect(cleanLintCommands({ ts: ' npx eslint ', '.py': 'flake8', '*': 'check', js: '', go: 3, ' ': 'x' })).toEqual({
      ts: 'npx eslint',
      py: 'flake8',
      '*': 'check',
    });
    expect(cleanLintCommands(undefined)).toEqual({});
    expect(cleanLintCommands({})).toEqual({});
  });
});

describe('webSearchFor', () => {
  it('is off unless a provider is chosen and configured', () => {
    expect(webSearchFor(undefined, { BRAVE_API_KEY: 'k' })).toBeNull();
    expect(webSearchFor({ provider: 'off', searxngUrl: '' }, { BRAVE_API_KEY: 'k' })).toBeNull();
    expect(webSearchFor({ provider: 'auto', searxngUrl: '' }, {})).toBeNull();
    expect(webSearchFor({ provider: 'auto', searxngUrl: '' }, { BRAVE_API_KEY: 'k' })).toEqual({ provider: 'brave', apiKey: 'k' });
    expect(webSearchFor({ provider: 'searxng', searxngUrl: 'http://s' }, {})).toEqual({ provider: 'searxng', baseUrl: 'http://s' });
  });

  it('adds the tool to normal runs only (spec generation keeps its fixed read-only tools)', () => {
    const prev = process.env.TAVILY_API_KEY;
    process.env.TAVILY_API_KEY = 'tk';
    try {
      const settings = { ...base, webSearch: { provider: 'tavily' as const, searxngUrl: '' } };
      expect(buildRunExtras(settings, model, { readOnly: false }).webSearch).toEqual({ provider: 'tavily', apiKey: 'tk' });
      expect(buildRunExtras(settings, model, { readOnly: true }).webSearch).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.TAVILY_API_KEY;
      else process.env.TAVILY_API_KEY = prev;
    }
  });
});

