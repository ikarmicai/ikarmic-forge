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

  it('runs sub-agents on subagentModel', async () => {
    writeFileSync(path.join(home, '.forge', 'config.json'), JSON.stringify({ subagentModel: 'openai:gpt-4o-mini' }));
    const opts = parseOptions(argv('--cwd', cwd, 'task')).options;
    const cfg = await toAgentConfig(opts, { provider: 'openai', model: 'gpt-4o' }, async () => false);
    expect(cfg.subAgentModel).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini' });
  });
});
