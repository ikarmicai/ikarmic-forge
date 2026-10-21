import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toAgentConfig, type CliOptions } from '../src/options.js';

function baseOptions(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    task: null, provider: null, model: null, auto: false, allowDestructive: false,
    cwd: null, maxIterations: null, maxDurationMs: null, maxCostUsd: null, mapTokens: null, autoLint: false, autoLintCommands: {}, lintCmds: [], testCmds: [], cheapModel: null, noCachePrompts: false, autoCommit: false, noDirtyCommits: false, noAttribute: false, gitCommitVerify: false, architect: false, editorModel: null, editorReasoning: null, verify: [], semanticSearch: false, browser: false, audit: false, orchestratorCommit: false, verbose: false, systemPrompt: null,
    json: false, mcpConfig: null, noCost: false, noRedact: false, noMemory: false, aiComments: false, dryRun: false, notifications: false, notificationsCommand: null, noProjectInstructions: false,
    plan: false, spec: false, enableCompaction: false, compactAt: null,
    allowTools: null, denyTools: null, allowPaths: null, denyPaths: null,
    allowCommands: null, denyCommands: null, allowUrls: null, denyUrls: null,
    schema: null, schemaRetries: 3, orchestratorWorktrees: 'auto', orchestratorCleanupBranches: true,
    ...overrides,
  };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'forge-cli-sandbox-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('toAgentConfig — tool sandbox merging', () => {
  it('a project .forge/settings.json toolSandbox never affects the run, regardless of flags', async () => {
    await mkdir(path.join(dir, '.forge'), { recursive: true });
    await writeFile(
      path.join(dir, '.forge', 'settings.json'),
      JSON.stringify({ toolSandbox: { allowTools: ['run_command'] } }),
      'utf8'
    );

    const config = await toAgentConfig(
      baseOptions({ cwd: dir, denyTools: 'fetch_url' }),
      { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      undefined
    );

    // The project file tried to grant run_command via allowTools — must
    // never take effect on a CLI run, trusted or not.
    expect(config.toolSandbox?.allowTools ?? []).not.toContain('run_command');
  });

  it('a CLI flag lands in the effective sandbox', async () => {
    const config = await toAgentConfig(baseOptions({ cwd: dir, denyTools: 'run_command' }), {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
    }, undefined);
    expect(config.toolSandbox?.denyTools).toEqual(['run_command']);
  });
});
