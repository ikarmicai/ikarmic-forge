import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseOptions, toAgentConfig } from '../src/options.js';

const argv = (...a: string[]): string[] => ['node', 'forge', ...a];
let saved: { HOME?: string; USERPROFILE?: string };
let home: string;
let cwd: string;

beforeEach(() => {
  // A scratch home: these tests read ~/.forge/config.json and must never touch the real one (RB-4).
  saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  const root = mkdtempSync(path.join(tmpdir(), 'forge-cli-shared-'));
  home = path.join(root, 'home');
  cwd = path.join(root, 'work');
  mkdirSync(path.join(home, '.forge'), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  process.env.HOME = home;
  process.env.USERPROFILE = home;
});
afterEach(() => {
  for (const k of ['HOME', 'USERPROFILE'] as const) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('the CLI honours the same user config keys as VS Code', () => {
  it('reads skills from the folders in skillPaths', async () => {
    const team = path.join(home, 'team-skills');
    mkdirSync(team, { recursive: true });
    writeFileSync(path.join(team, 'deploy-check.md'), '---\nname: deploy-check\ndescription: Checks a deploy\n---\nCheck it.\n');
    writeFileSync(path.join(home, '.forge', 'config.json'), JSON.stringify({ skillPaths: [team] }));
    const opts = parseOptions(argv('--cwd', cwd, 'task')).options;
    const cfg = await toAgentConfig(opts, { provider: 'openai', model: 'gpt-4o' }, async () => false);
    const names = (cfg.skills?.registry?.list() ?? []).map((s) => s.name);
    expect(names).toContain('deploy-check');
  });

  // RB-90: the CLI never hid old tool results, so a 60-step run resent 394,000 tokens on every step.
  it('hides old tool results like VS Code does, unless --no-mask-old-results', async () => {
    const on = await toAgentConfig(parseOptions(argv('--cwd', cwd, 'task')).options, { provider: 'openai', model: 'gpt-4o' }, async () => false);
    expect(on.maskOldResults).toEqual({ keepRecentTurns: 6 });
    const off = await toAgentConfig(parseOptions(argv('--cwd', cwd, '--no-mask-old-results', 'task')).options, { provider: 'openai', model: 'gpt-4o' }, async () => false);
    expect(off.maskOldResults).toBe(false);
  });

  it('runs sub-agents on subagentModel', async () => {
    writeFileSync(path.join(home, '.forge', 'config.json'), JSON.stringify({ subagentModel: 'openai:gpt-4o-mini' }));
    const opts = parseOptions(argv('--cwd', cwd, 'task')).options;
    const cfg = await toAgentConfig(opts, { provider: 'openai', model: 'gpt-4o' }, async () => false);
    expect(cfg.subAgentModel).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini' });
  });
});

// Live "Build a CRM" run in the terminal app, 2026-11-06: the run stopped after 10 minutes of wall clock, mid-work,
// and the model said it could not look at the page it built (no browser tools). The VS Code chat has neither limit.
describe('the terminal app runs like the VS Code chat', () => {
  const build = async (...flags: string[]) =>
    toAgentConfig(parseOptions(argv('--cwd', cwd, ...flags, 'task')).options, { provider: 'openai', model: 'gpt-4o' }, async () => false);

  it('has no wall-clock limit unless --max-duration sets one', async () => {
    expect(parseOptions(argv('task')).options.maxDurationMs).toBeNull();
    expect((await build()).maxDurationMs).toBe(Number.POSITIVE_INFINITY);
    expect((await build('--max-duration', '5000')).maxDurationMs).toBe(5000);
  });

  it('has no step limit unless --max-iterations sets one', async () => {
    expect(parseOptions(argv('task')).options.maxIterations).toBeNull();
    expect((await build()).maxIterations).toBe(Number.POSITIVE_INFINITY);
    expect((await build('--max-iterations', '30')).maxIterations).toBe(30);
  });

  it('has the browser tools unless --no-browser, and still accepts --browser', async () => {
    expect(parseOptions(argv('task')).options.browser).toBe(true);
    expect(parseOptions(argv('--browser', 'task')).options.browser).toBe(true);
    expect(parseOptions(argv('--no-browser', 'task')).options.browser).toBe(false);
    expect((await build()).browser).toBe(true);
    expect((await build('--no-browser')).browser).toBeUndefined();
  });
});
