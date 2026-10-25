/**
 * RB-39: `forge orchestrator run` hands its steps the person's limits: the auto-approve list, permission
 * rules and the tool sandbox from ~/.forge/settings.json, as the CLI's own runs apply them. Uses temp files,
 * never the real ~/.forge (RB-4).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { orchestratorLimits } from '../src/commands/orchestrator.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'forge-orch-limits-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('orchestratorLimits', () => {
  it("passes the person's sandbox, permission rules and auto-approve list", async () => {
    const configPath = path.join(dir, 'config.json');
    const settingsPath = path.join(dir, 'settings.json');
    writeFileSync(configPath, JSON.stringify({ autoApproveTools: ['read_file'], permission: { edit: 'deny' } }));
    writeFileSync(settingsPath, JSON.stringify({ toolSandbox: { denyTools: ['fetch_url'] } }));
    const limits = await orchestratorLimits(dir, { configPath, settingsPath });
    expect(limits.autoApproveTools).toEqual(['read_file']);
    expect(limits.permissionRules).toEqual({ edit: 'deny' });
    expect(limits.toolSandbox?.denyTools).toEqual(['fetch_url']);
  });

  it('falls back to the read-only tools and no sandbox when nothing is set', async () => {
    const limits = await orchestratorLimits(dir, { configPath: path.join(dir, 'none.json'), settingsPath: path.join(dir, 'none2.json') });
    expect(limits.autoApproveTools).toContain('read_file');
    expect(limits.permissionRules).toBeUndefined();
    expect(limits.toolSandbox).toBeUndefined();
  });
});
