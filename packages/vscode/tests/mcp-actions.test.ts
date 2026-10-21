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
