import { describe, expect, it, vi } from 'vitest';
import { handleSettingsMessage, markBuiltin } from '../src/settings/settings-protocol.js';
import type { CredentialStore } from '@ikarmic/forge-core';

function baseDeps(overrides: Record<string, unknown> = {}) {
  return {
    store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() } as CredentialStore,
    loadForgeConfigFile: vi.fn(),
    saveForgeConfigFile: vi.fn(),
    saveSpecialistsToConfig: vi.fn(),
    listSpecialists: vi.fn().mockReturnValue([]),
    exportSettings: vi.fn(),
    importSettings: vi.fn(),
    loadToolSandboxConfig: vi.fn().mockResolvedValue({ sandbox: {}, warnings: [], sources: [] }),
    saveToolSandboxConfig: vi.fn(),
    ...overrides,
  } as never;
}

describe('handleSettingsMessage', () => {
  it('load returns the current config', async () => {
    const loadForgeConfigFile = vi.fn().mockResolvedValue({ config: { provider: 'anthropic' }, warnings: [] });
    const response = await handleSettingsMessage({ type: 'load' }, baseDeps({ loadForgeConfigFile }));
    expect(response).toEqual({ type: 'loaded', config: { provider: 'anthropic' } });
  });

  it('save patches the config file and returns the merged result', async () => {
    const saveForgeConfigFile = vi.fn().mockResolvedValue(undefined);
    const loadForgeConfigFile = vi.fn().mockResolvedValue({ config: { provider: 'anthropic' }, warnings: [] });

    const response = await handleSettingsMessage(
      { type: 'save', patch: { model: 'claude-opus-4-5' } },
      baseDeps({ loadForgeConfigFile, saveForgeConfigFile })
    );

    expect(saveForgeConfigFile).toHaveBeenCalledWith({ model: 'claude-opus-4-5' }, undefined);
    expect(response).toEqual({ type: 'saved', config: { provider: 'anthropic' } });
  });

  it('loadAllowedCommands lists the always-allowed commands, sorted', async () => {
    const loadForgeConfigFile = vi.fn().mockResolvedValue({
      config: { autoApproveCommands: { '/b': [{ command: 'git status' }], '/a': [{ command: 'pnpm test', fingerprint: 'x' }, { command: 'cargo test' }] } },
      warnings: [],
    });
    expect(await handleSettingsMessage({ type: 'loadAllowedCommands' }, baseDeps({ loadForgeConfigFile }))).toEqual({
      type: 'allowedCommandsListed',
      commands: [
        { workspace: '/a', command: 'cargo test' },
        { workspace: '/a', command: 'pnpm test' },
        { workspace: '/b', command: 'git status' },
      ],
    });
  });

  it('removeAllowedCommand drops exactly that entry, saves, and returns the new list', async () => {
    const loadForgeConfigFile = vi.fn().mockResolvedValue({
      config: { autoApproveCommands: { '/a': [{ command: 'pnpm test', fingerprint: 'x' }, { command: 'cargo test' }] } },
      warnings: [],
    });
    const saveForgeConfigFile = vi.fn().mockResolvedValue(undefined);
    const response = await handleSettingsMessage(
      { type: 'removeAllowedCommand', workspace: '/a', command: 'pnpm test' },
      baseDeps({ loadForgeConfigFile, saveForgeConfigFile })
    );
    expect(saveForgeConfigFile).toHaveBeenCalledWith({ autoApproveCommands: { '/a': [{ command: 'cargo test' }] } }, undefined);
    expect(response).toEqual({ type: 'allowedCommandsListed', commands: [{ workspace: '/a', command: 'cargo test' }] });
  });

  it('setKey writes to the CredentialStore, never to the config file', async () => {
    const store: CredentialStore = { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined), delete: vi.fn() };
    const saveForgeConfigFile = vi.fn();

    const response = await handleSettingsMessage(
      { type: 'setKey', provider: 'openai', key: 'sk-test' },
      baseDeps({ store, saveForgeConfigFile })
    );

    expect(store.set).toHaveBeenCalledWith('openai', 'sk-test');
    expect(saveForgeConfigFile).not.toHaveBeenCalled();
    expect(response).toEqual({ type: 'keySaved', provider: 'openai' });
  });

  it('deleteKey removes from the CredentialStore', async () => {
    const store: CredentialStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn().mockResolvedValue(undefined) };
    const response = await handleSettingsMessage({ type: 'deleteKey', provider: 'anthropic' }, baseDeps({ store }));
    expect(store.delete).toHaveBeenCalledWith('anthropic');
    expect(response).toEqual({ type: 'keyDeleted', provider: 'anthropic' });
  });

  it('surfaces a thrown error as an error response instead of throwing', async () => {
    const saveForgeConfigFile = vi.fn().mockRejectedValue(new Error('disk full'));
    const response = await handleSettingsMessage({ type: 'save', patch: {} }, baseDeps({ saveForgeConfigFile }));
    expect(response).toEqual({ type: 'error', message: 'disk full' });
  });
});

describe('model pinned in VS Code settings', () => {
  it('load shows the pinned provider and model over the shared file, so the page matches the chat', async () => {
    const loadForgeConfigFile = vi.fn().mockResolvedValue({ config: { provider: 'openai', model: 'gpt-x' }, warnings: [] });
    const modelPin = { get: () => ({ provider: 'minimax', model: 'MiniMax-M2.7' }), sync: vi.fn() };
    const response = await handleSettingsMessage({ type: 'load' }, baseDeps({ loadForgeConfigFile, modelPin }));
    expect(response).toMatchObject({ type: 'loaded', config: { provider: 'minimax', model: 'MiniMax-M2.7' } });
  });

  it('save keeps a pinned value in step, and clears it when the choice is cleared', async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const deps = baseDeps({
      saveForgeConfigFile: vi.fn().mockResolvedValue(undefined),
      loadForgeConfigFile: vi.fn().mockResolvedValue({ config: {}, warnings: [] }),
      modelPin: { get: () => ({}), sync },
    });
    await handleSettingsMessage({ type: 'save', patch: { provider: 'google', model: 'gemini-flash-latest' } }, deps);
    expect(sync).toHaveBeenLastCalledWith({ provider: 'google', model: 'gemini-flash-latest' });
    await handleSettingsMessage({ type: 'save', patch: { model: null } as never }, deps);
    expect(sync).toHaveBeenLastCalledWith({ model: undefined });
    await handleSettingsMessage({ type: 'save', patch: { reasoningEffort: 'low' } }, deps);
    expect(sync).toHaveBeenCalledTimes(2);
  });
});

describe('markBuiltin', () => {
  it('flags the built-in specialists and leaves custom ones alone', () => {
    const builtin = { id: 'plan' };
    const custom = { id: 'mine' };
    expect(markBuiltin([builtin, custom], [builtin])).toEqual([{ id: 'plan', builtin: true }, { id: 'mine' }]);
  });
});

describe('handleSettingsMessage — agents', () => {
  it('loadAgents returns listSpecialists()', async () => {
    const agents = [{ id: 'x', description: 'x', systemPrompt: 'x', allowedTools: [], forbiddenTools: [] }];
    const listSpecialists = vi.fn().mockReturnValue(agents);
    const response = await handleSettingsMessage({ type: 'loadAgents' }, baseDeps({ listSpecialists }));
    expect(response).toEqual({ type: 'agentsLoaded', agents });
  });

  it('saveAgents validates and persists via saveSpecialistsToConfig', async () => {
    const saveSpecialistsToConfig = vi.fn().mockResolvedValue(undefined);
    const response = await handleSettingsMessage(
      { type: 'saveAgents', agents: [{ id: 'x', description: 'x', systemPrompt: 'x', allowedTools: [] }] },
      baseDeps({ saveSpecialistsToConfig })
    );
    expect(saveSpecialistsToConfig).toHaveBeenCalled();
    expect(response).toEqual({ type: 'agentsSaved' });
  });

  it('saveAgents surfaces validation errors instead of throwing uncaught', async () => {
    const saveSpecialistsToConfig = vi.fn().mockRejectedValue(new Error('specialist[x].description is required'));
    const response = await handleSettingsMessage(
      { type: 'saveAgents', agents: [{ id: 'x', description: '', systemPrompt: 'x', allowedTools: [] }] },
      baseDeps({ saveSpecialistsToConfig })
    );
    expect(response).toEqual({ type: 'error', message: 'specialist[x].description is required' });
  });
});

describe('handleSettingsMessage — export/import', () => {
  it('exportSettings returns the bundled data', async () => {
    const data = { config: { provider: 'anthropic' }, specialists: [] };
    const exportSettings = vi.fn().mockResolvedValue(data);
    const response = await handleSettingsMessage({ type: 'exportSettings' }, baseDeps({ exportSettings }));
    expect(response).toEqual({ type: 'settingsExported', data });
  });

  it('importSettings applies the bundle and confirms', async () => {
    const importSettings = vi.fn().mockResolvedValue(undefined);
    const data = { config: { provider: 'openai' }, specialists: [] };
    const response = await handleSettingsMessage({ type: 'importSettings', data }, baseDeps({ importSettings }));
    expect(importSettings).toHaveBeenCalledWith(data, { configPath: undefined, specialistsPath: undefined });
    expect(response).toEqual({ type: 'settingsImported' });
  });
});

describe('handleSettingsMessage — sandbox', () => {
  it('loadSandbox returns the effective sandbox for the given cwd', async () => {
    const loadToolSandboxConfig = vi.fn().mockResolvedValue({ sandbox: { denyTools: ['run_command'] }, warnings: [], sources: [] });
    const response = await handleSettingsMessage(
      { type: 'loadSandbox', cwd: '/repo' },
      baseDeps({ loadToolSandboxConfig })
    );
    expect(loadToolSandboxConfig).toHaveBeenCalledWith('/repo', { trustedProjectSettings: expect.any(Boolean) });
    expect(response).toEqual({ type: 'sandboxLoaded', sandbox: { denyTools: ['run_command'] } });
  });

  it('saveSandbox persists via saveToolSandboxConfig', async () => {
    const saveToolSandboxConfig = vi.fn().mockResolvedValue(undefined);
    const response = await handleSettingsMessage(
      { type: 'saveSandbox', sandbox: { allowTools: ['read_file'] } },
      baseDeps({ saveToolSandboxConfig })
    );
    expect(saveToolSandboxConfig).toHaveBeenCalledWith({ allowTools: ['read_file'] }, undefined);
    expect(response).toEqual({ type: 'sandboxSaved' });
  });
});

describe('handleSettingsMessage: keys, MCP and skills', () => {
  const st = (o: Record<string, unknown> = {}) => ({ name: 'github', state: 'connected', scope: 'user', toolCount: 2, ...o });

  function mcpDeps(servers: unknown[] = [st()]) {
    return {
      enabled: () => true,
      projectSkipped: () => false,
      status: vi.fn().mockResolvedValue(servers),
      tools: vi.fn().mockReturnValue(['create_issue', 'list_commits']),
      actions: {
        setMcpServerDisabled: vi.fn().mockResolvedValue(undefined),
        uninstallMcpServer: vi.fn().mockResolvedValue(undefined),
        registerMcpServer: vi.fn().mockResolvedValue(undefined),
        installMcpServer: vi.fn().mockResolvedValue(undefined),
        reload: vi.fn().mockResolvedValue(undefined),
      },
      catalog: vi.fn().mockResolvedValue({
        entries: [{ name: 'memory', displayName: 'Memory', description: 'Remember things', github: 'o/r', serverConfig: { command: 'npx', args: ['-y', 'mem'] } }],
        installed: ['github'],
      }),
      confirm: vi.fn().mockResolvedValue(true),
      openConfig: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('loadKeys reports which providers have a key, never the key', async () => {
    const store = { get: vi.fn(async (p: string) => (p === 'minimax' ? 'sk-secret' : undefined)), set: vi.fn(), delete: vi.fn() };
    const r = await handleSettingsMessage({ type: 'loadKeys' }, baseDeps({ store, providers: ['minimax', 'openai'] }));
    expect(r).toMatchObject({ type: 'keysLoaded', set: ['minimax'] });
    expect(JSON.stringify(r)).not.toContain('sk-secret');
  });

  it('loadKeys says which environment variable supplies a key that is not saved', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-from-env');
    try {
      const store = { get: vi.fn(async () => undefined), set: vi.fn(), delete: vi.fn() };
      const r = await handleSettingsMessage({ type: 'loadKeys' }, baseDeps({ store, providers: ['openai', 'ollama'] }));
      expect(r).toEqual({ type: 'keysLoaded', set: [], env: { openai: 'OPENAI_API_KEY' } });
      expect(JSON.stringify(r)).not.toContain('sk-from-env');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('load includes the model the chat will actually use', async () => {
    const r = await handleSettingsMessage({ type: 'load' }, baseDeps({ loadForgeConfigFile: vi.fn().mockResolvedValue({ config: {}, warnings: [] }), effective: async () => 'minimax/MiniMax-M3' }));
    expect(r).toMatchObject({ type: 'loaded', effective: 'minimax/MiniMax-M3' });
  });

  it('mcpList returns server views with tool names', async () => {
    const r = await handleSettingsMessage({ type: 'mcpList' }, baseDeps({ mcp: mcpDeps() }));
    expect(r).toEqual({
      type: 'mcpListed', enabled: true, projectSkipped: false,
      servers: [{ name: 'github', state: 'connected', scope: 'user', toolCount: 2, tools: ['create_issue', 'list_commits'], description: 'connected · 2 tools' }],
    });
  });

  it('mcpToggle looks the server up again and toggles it', async () => {
    const mcp = mcpDeps();
    const r = await handleSettingsMessage({ type: 'mcpToggle', name: 'github' }, baseDeps({ mcp }));
    expect(mcp.actions.setMcpServerDisabled).toHaveBeenCalledWith({ name: 'github', disabled: true });
    expect(r).toMatchObject({ type: 'mcpListed' });
  });

  it('mcpToggle refuses a workspace server even if the webview thinks otherwise', async () => {
    const mcp = mcpDeps([st({ scope: 'workspace' })]);
    const r = await handleSettingsMessage({ type: 'mcpToggle', name: 'github' }, baseDeps({ mcp }));
    expect(mcp.actions.setMcpServerDisabled).not.toHaveBeenCalled();
    expect(r).toEqual({ type: 'notice', message: 'This server is defined in the workspace .forge/mcp.json. Edit that file to change it.' });
  });

  it('mcpToggle / mcpRemove on an unknown name report it and do nothing', async () => {
    const mcp = mcpDeps([]);
    expect(await handleSettingsMessage({ type: 'mcpToggle', name: 'ghost' }, baseDeps({ mcp }))).toEqual({ type: 'notice', message: 'MCP server "ghost" is no longer configured.' });
    expect(await handleSettingsMessage({ type: 'mcpRemove', name: 'ghost' }, baseDeps({ mcp }))).toEqual({ type: 'notice', message: 'MCP server "ghost" is no longer configured.' });
  });

  it('mcpRemove asks first and does nothing when declined', async () => {
    const mcp = mcpDeps();
    mcp.confirm.mockResolvedValue(false);
    const r = await handleSettingsMessage({ type: 'mcpRemove', name: 'github' }, baseDeps({ mcp }));
    expect(mcp.confirm).toHaveBeenCalledWith('Remove MCP server "github"?', undefined, 'Remove');
    expect(mcp.actions.uninstallMcpServer).not.toHaveBeenCalled();
    expect(r).toEqual({ type: 'none' });
  });

  it('mcpCatalog marks installed entries and shows the command each would run', async () => {
    const r = await handleSettingsMessage({ type: 'mcpCatalog' }, baseDeps({ mcp: mcpDeps() }));
    expect(r).toEqual({ type: 'mcpCatalogListed', entries: [{ name: 'memory', displayName: 'Memory', description: 'Remember things', command: 'npx -y mem', installed: false }] });
  });

  it('mcpInstall confirms with the exact command, then installs', async () => {
    const mcp = mcpDeps();
    await handleSettingsMessage({ type: 'mcpInstall', name: 'memory' }, baseDeps({ mcp }));
    expect(mcp.confirm.mock.calls[0]![1]).toContain('npx -y mem');
    expect(mcp.actions.registerMcpServer).toHaveBeenCalled();
  });

  it('skillsList flattens skills with their scope and path', async () => {
    const skills = {
      list: vi.fn().mockResolvedValue([{ name: 'release-notes', description: 'Writes notes', source: { kind: 'project', path: '/w/.forge/skills/release-notes.md' } }]),
      open: vi.fn(), catalog: vi.fn(), install: vi.fn(),
    };
    expect(await handleSettingsMessage({ type: 'skillsList' }, baseDeps({ skills }))).toEqual({
      type: 'skillsListed', skills: [{ name: 'release-notes', description: 'Writes notes', scope: 'project', path: '/w/.forge/skills/release-notes.md' }],
    });
  });

  it('skillOpen only opens a path the skills list actually contains', async () => {
    const skills = {
      list: vi.fn().mockResolvedValue([{ name: 'a', description: '', source: { kind: 'global', path: '/h/.forge/skills/a.md' } }]),
      open: vi.fn().mockResolvedValue(undefined), catalog: vi.fn(), install: vi.fn(),
    };
    await handleSettingsMessage({ type: 'skillOpen', path: '/etc/passwd' }, baseDeps({ skills }));
    expect(skills.open).not.toHaveBeenCalled();
    await handleSettingsMessage({ type: 'skillOpen', path: '/h/.forge/skills/a.md' }, baseDeps({ skills }));
    expect(skills.open).toHaveBeenCalledWith('/h/.forge/skills/a.md');
  });

  it('reports a missing MCP / skills backend instead of throwing', async () => {
    expect(await handleSettingsMessage({ type: 'mcpList' }, baseDeps())).toEqual({ type: 'mcpListed', enabled: false, projectSkipped: false, servers: [] });
    expect(await handleSettingsMessage({ type: 'skillsList' }, baseDeps())).toEqual({ type: 'skillsListed', skills: [] });
  });
});

describe('handleSettingsMessage: review fixes', () => {
  it('turns null patch values into deletions (spread undefined, dropped by JSON)', async () => {
    const saveForgeConfigFile = vi.fn().mockResolvedValue(undefined);
    const loadForgeConfigFile = vi.fn().mockResolvedValue({ config: {}, warnings: [] });
    await handleSettingsMessage({ type: 'save', patch: { reasoningEffort: null } as never }, baseDeps({ saveForgeConfigFile, loadForgeConfigFile }));
    const patch = saveForgeConfigFile.mock.calls[0]![0] as Record<string, unknown>;
    expect('reasoningEffort' in patch).toBe(true);
    expect(patch.reasoningEffort).toBeUndefined();
  });

  it('sends regex rules to the page as their source strings', async () => {
    const loadToolSandboxConfig = vi.fn().mockResolvedValue({
      sandbox: { denyTools: ['fetch_url'], policies: { run_command: { deniedCommands: [/^git push/], deniedPaths: ['**/.env*'] } } },
      warnings: [], sources: [],
    });
    const r = await handleSettingsMessage({ type: 'loadSandbox', cwd: '' }, baseDeps({ loadToolSandboxConfig }));
    expect(r).toEqual({ type: 'sandboxLoaded', sandbox: { denyTools: ['fetch_url'], policies: { run_command: { deniedCommands: ['^git push'], deniedPaths: ['**/.env*'] } } } });
  });
});
