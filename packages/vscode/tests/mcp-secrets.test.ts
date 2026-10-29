import { describe, expect, it, vi } from 'vitest';

import { createMcpSecretStore } from '../src/mcp/mcp-secrets.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

function fakeSecretStorage() {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k: string) => data.get(k),
    store: async (k: string, v: string) => void data.set(k, v),
    delete: async (k: string) => void data.delete(k),
    onDidChange: () => ({ dispose() {} }),
  };
}

describe('createMcpSecretStore', () => {
  it('stores and reads a secret per server and id', async () => {
    const backing = fakeSecretStorage();
    const store = createMcpSecretStore(backing as never);
    await store.set('github', 'token', 'ghp_value');
    expect(await store.get('github', 'token')).toBe('ghp_value');
    expect(await store.has('github', 'token')).toBe(true);
  });

  it('keeps servers apart: the same id on two servers is two secrets', async () => {
    const store = createMcpSecretStore(fakeSecretStorage() as never);
    await store.set('a', 'token', '1');
    await store.set('b', 'token', '2');
    expect(await store.get('a', 'token')).toBe('1');
    expect(await store.get('b', 'token')).toBe('2');
    expect(await store.get('c', 'token')).toBeUndefined();
  });

  it('uses a namespaced key that cannot collide with a provider key', async () => {
    const backing = fakeSecretStorage();
    await createMcpSecretStore(backing as never).set('github', 'token', 'x');
    expect([...backing.data.keys()]).toEqual(['forge.mcp:github:token']);
  });

  it('removes the secret when set to an empty value', async () => {
    const backing = fakeSecretStorage();
    const store = createMcpSecretStore(backing as never);
    await store.set('github', 'token', 'x');
    await store.set('github', 'token', '');
    expect(await store.has('github', 'token')).toBe(false);
    expect(backing.data.size).toBe(0);
  });
});

describe('Settings: mcpSecretSet', () => {
  const status = (o: Record<string, unknown> = {}) => ({ name: 'github', state: 'failed', scope: 'user', toolCount: 0, ...o });

  function deps(over: { servers?: unknown[]; ids?: string[]; has?: boolean } = {}) {
    const secrets = {
      idsOf: vi.fn().mockResolvedValue(over.ids ?? ['token']),
      has: vi.fn().mockResolvedValue(over.has ?? false),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const mcp = {
      enabled: () => true,
      projectSkipped: () => false,
      status: vi.fn().mockResolvedValue(over.servers ?? [status()]),
      tools: vi.fn().mockReturnValue([]),
      actions: {
        setMcpServerDisabled: vi.fn(),
        uninstallMcpServer: vi.fn().mockResolvedValue(undefined),
        registerMcpServer: vi.fn(),
        installMcpServer: vi.fn(),
        reload: vi.fn().mockResolvedValue(undefined),
      },
      catalog: vi.fn(),
      confirm: vi.fn().mockResolvedValue(true),
      openConfig: vi.fn(),
      secrets,
    };
    return { mcp, secrets, all: { mcp } as unknown as SettingsDeps };
  }

  it('stores the value, reloads the servers, and never sends the value back', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'mcpSecretSet', server: 'github', id: 'token', value: 'ghp_topsecret' }, d.all);
    expect(d.secrets.set).toHaveBeenCalledWith('github', 'token', 'ghp_topsecret');
    expect(d.mcp.actions.reload).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ type: 'mcpListed' });
    expect(JSON.stringify(r)).not.toContain('ghp_topsecret');
  });

  it('removes the secret when the value is empty and still reloads', async () => {
    const d = deps();
    await handleSettingsMessage({ type: 'mcpSecretSet', server: 'github', id: 'token', value: '' }, d.all);
    expect(d.secrets.set).toHaveBeenCalledWith('github', 'token', '');
    expect(d.mcp.actions.reload).toHaveBeenCalled();
  });

  it('lists which secrets a server needs and whether each is set, never the value', async () => {
    const d = deps({ has: true });
    const r = await handleSettingsMessage({ type: 'mcpList' }, d.all);
    expect(r).toMatchObject({ type: 'mcpListed', servers: [{ name: 'github', secrets: [{ id: 'token', set: true }] }] });
  });

  it('labels a secret in words: the catalog label for a built-in server, a sentence-case id for one the person added', async () => {
    const d = deps({ servers: [status({ name: 'github' }), status({ name: 'mine' })], ids: ['token', 'my-key'] });
    const r = (await handleSettingsMessage({ type: 'mcpList' }, d.all)) as { servers: Array<{ name: string; secrets: Array<{ id: string; label: string }> }> };
    expect(r.servers[0]!.secrets.find((s) => s.id === 'token')!.label).toBe('GitHub token');
    expect(r.servers[1]!.secrets.find((s) => s.id === 'my-key')!.label).toBe('My key');
  });

  it('refuses an id the server does not ask for (the page is not trusted)', async () => {
    const d = deps({ ids: ['token'] });
    const r = await handleSettingsMessage({ type: 'mcpSecretSet', server: 'github', id: 'other', value: 'x' }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect(d.secrets.set).not.toHaveBeenCalled();
  });

  it('refuses a project server: a project file has no stored secrets', async () => {
    const d = deps({ servers: [status({ scope: 'workspace' })] });
    const r = await handleSettingsMessage({ type: 'mcpSecretSet', server: 'github', id: 'token', value: 'x' }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect(d.secrets.set).not.toHaveBeenCalled();
  });

  it('refuses a server that is no longer configured', async () => {
    const d = deps({ servers: [] });
    const r = await handleSettingsMessage({ type: 'mcpSecretSet', server: 'github', id: 'token', value: 'x' }, d.all);
    expect(r).toEqual({ type: 'notice', message: 'MCP server "github" is no longer configured.' });
    expect(d.secrets.set).not.toHaveBeenCalled();
  });

  it('forgets the stored secrets when the server is removed', async () => {
    const d = deps({ servers: [status({ state: 'connected' })] });
    await handleSettingsMessage({ type: 'mcpRemove', name: 'github' }, d.all);
    expect(d.mcp.actions.uninstallMcpServer).toHaveBeenCalled();
    expect(d.secrets.set).toHaveBeenCalledWith('github', 'token', '');
  });
});
