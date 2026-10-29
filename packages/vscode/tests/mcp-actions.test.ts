import { describe, expect, it, vi } from 'vitest';
import type { MarketplaceEntry, McpServerStatus } from '@ikarmic/forge-core';

import { WORKSPACE_READONLY, installEntry, removeServer, toggleServer } from '../src/mcp/mcp-actions.js';

const status = (o: Partial<McpServerStatus> = {}): McpServerStatus => ({ name: 'github', state: 'connected', scope: 'user', toolCount: 3, ...o });

function deps() {
  return {
    setMcpServerDisabled: vi.fn().mockResolvedValue(undefined),
    uninstallMcpServer: vi.fn().mockResolvedValue(undefined),
    registerMcpServer: vi.fn().mockResolvedValue(undefined),
    installMcpServer: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
  };
}

describe('toggleServer', () => {
  it('disables a running user server, then reloads', async () => {
    const d = deps();
    expect(await toggleServer(status(), d as never)).toEqual({ ok: true });
    expect(d.setMcpServerDisabled).toHaveBeenCalledWith({ name: 'github', disabled: true });
    expect(d.reload).toHaveBeenCalledOnce();
  });

  it('enables a disabled server', async () => {
    const d = deps();
    await toggleServer(status({ state: 'disabled' }), d as never);
    expect(d.setMcpServerDisabled).toHaveBeenCalledWith({ name: 'github', disabled: false });
  });

  it('refuses workspace servers and touches nothing', async () => {
    const d = deps();
    expect(await toggleServer(status({ scope: 'workspace' }), d as never)).toEqual({ ok: false, message: WORKSPACE_READONLY });
    expect(d.setMcpServerDisabled).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });
});

describe('removeServer', () => {
  it('uninstalls a user server, then reloads', async () => {
    const d = deps();
    expect(await removeServer(status(), d as never)).toEqual({ ok: true });
    expect(d.uninstallMcpServer).toHaveBeenCalledWith({ name: 'github' });
    expect(d.reload).toHaveBeenCalledOnce();
  });

  it('refuses workspace servers', async () => {
    const d = deps();
    expect((await removeServer(status({ scope: 'workspace' }), d as never)).ok).toBe(false);
    expect(d.uninstallMcpServer).not.toHaveBeenCalled();
  });

  // RB-106: the secrets a person typed on a server's card are kept in the editor's secret storage; removing the
  // server from the Command Palette used to leave them behind, because only the Settings page cleared them.
  describe('the secrets stored for the server', () => {
    const withSecrets = (ids: string[]) => {
      const calls: string[] = [];
      const secrets = {
        idsOf: vi.fn(async () => {
          calls.push('idsOf');
          return ids;
        }),
        set: vi.fn(async (server: string, id: string, value: string) => {
          calls.push(`set ${server}/${id}=${JSON.stringify(value)}`);
        }),
      };
      return { secrets, calls };
    };

    it('are cleared once the server is gone, whoever asked for the removal', async () => {
      const d = deps();
      const { secrets, calls } = withSecrets(['token', 'url']);
      d.uninstallMcpServer.mockImplementation(async () => void calls.push('uninstall'));
      expect(await removeServer(status(), { ...d, secrets } as never)).toEqual({ ok: true });
      // The ids are read first: once the server is uninstalled its entry, and so its placeholders, are gone.
      expect(calls).toEqual(['idsOf', 'uninstall', 'set github/token=""', 'set github/url=""']);
    });

    it('stay when the removal fails, so nothing is lost for a server that is still there', async () => {
      const d = deps();
      d.uninstallMcpServer.mockRejectedValue(new Error('disk full'));
      const { secrets } = withSecrets(['token']);
      await expect(removeServer(status(), { ...d, secrets } as never)).rejects.toThrow('disk full');
      expect(secrets.set).not.toHaveBeenCalled();
    });

    it('are never touched for a server a project defined', async () => {
      const d = deps();
      const { secrets } = withSecrets(['token']);
      await removeServer(status({ scope: 'workspace' }), { ...d, secrets } as never);
      expect(secrets.idsOf).not.toHaveBeenCalled();
      expect(secrets.set).not.toHaveBeenCalled();
    });

    it('both callers hand them over: the Command Palette and the Settings page', async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const palette = readFileSync(join(__dirname, '../src/mcp/mcp-commands.ts'), 'utf8');
      expect(palette).toMatch(/const actionDeps: McpActionDeps = \{[^}]*secrets/);
      const settings = readFileSync(join(__dirname, '../src/settings/settings-protocol.ts'), 'utf8');
      const removal = settings.slice(settings.indexOf('Remove MCP server'));
      expect(removal.slice(0, 700)).toMatch(/removeServer\(s, \{[^}]*secrets/);
    });
  });
});

describe('installEntry', () => {
  const entry = (o: Partial<MarketplaceEntry> = {}): MarketplaceEntry => ({ name: 'memory', displayName: 'Memory', description: 'd', github: 'o/r', ...o });

  it('registers entries that carry a server config', async () => {
    const d = deps();
    const spec = { command: 'npx', args: ['-y', 'memory'] };
    await installEntry(entry({ serverConfig: spec } as never), d as never);
    expect(d.registerMcpServer).toHaveBeenCalledWith({ name: 'memory', spec });
    expect(d.installMcpServer).not.toHaveBeenCalled();
    expect(d.reload).toHaveBeenCalledOnce();
  });

  it('installs from source otherwise', async () => {
    const d = deps();
    const e = entry();
    await installEntry(e, d as never);
    expect(d.installMcpServer).toHaveBeenCalledWith({ source: e });
  });

  it('reports a failed install without reloading', async () => {
    const d = deps();
    d.installMcpServer.mockRejectedValue(new Error('git not found'));
    expect(await installEntry(entry(), d as never)).toEqual({ ok: false, message: 'Could not install "memory": git not found' });
    expect(d.reload).not.toHaveBeenCalled();
  });
});
