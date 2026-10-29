import { describe, expect, it, vi } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

const status = (o: Record<string, unknown> = {}) => ({ name: 'acme', state: 'connected', scope: 'user', toolCount: 5, ...o });

function deps(over: { servers?: unknown[]; installed?: string[]; shown?: string[] } = {}) {
  let shown = over.shown ?? [];
  const mcp = {
    enabled: () => true,
    projectSkipped: () => false,
    status: vi.fn().mockResolvedValue(over.servers ?? []),
    tools: vi.fn().mockReturnValue([]),
    actions: {
      setMcpServerDisabled: vi.fn(),
      uninstallMcpServer: vi.fn(),
      registerMcpServer: vi.fn().mockResolvedValue(undefined),
      installMcpServer: vi.fn(),
      reload: vi.fn().mockResolvedValue(undefined),
    },
    catalog: vi.fn().mockResolvedValue({ entries: [], installed: over.installed ?? [] }),
    confirm: vi.fn().mockResolvedValue(true),
    openConfig: vi.fn(),
    showDuplicates: vi.fn(async () => shown),
    setShowDuplicates: vi.fn(async (names: string[]) => void (shown = names)),
  };
  return { mcp, all: { mcp } as unknown as SettingsDeps };
}

describe('Settings: Add your own server, preview', () => {
  it('shows the exact command that would run and the placeholders it uses', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'mcpAddPreview', text: 'GH=${GH_TOKEN} npx -y @acme/gh --token ${input:token}' }, d.all);
    expect(r).toEqual({
      type: 'mcpAddPreviewed',
      ok: true,
      name: 'gh',
      kind: 'command',
      command: 'npx -y @acme/gh --token ${input:token}',
      environment: ['GH=${GH_TOKEN}'],
      secrets: ['token'],
      variables: ['GH_TOKEN'],
    });
  });

  it('says why a pasted program is refused', async () => {
    const r = await handleSettingsMessage({ type: 'mcpAddPreview', text: 'node server.js' }, deps().all);
    expect(r).toMatchObject({ type: 'mcpAddPreviewed', ok: false });
    expect((r as { reason: string }).reason).toContain('npx');
  });

  it('never echoes a secret that was pasted by mistake', async () => {
    const r = await handleSettingsMessage({ type: 'mcpAddPreview', text: 'npx -y @acme/gh --token ghp_abcdefghijklmnopqrstuvwxyz0123456789' }, deps().all);
    expect(r).toMatchObject({ ok: false });
    expect(JSON.stringify(r)).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });
});

describe('Settings: Add your own server, confirm', () => {
  it('asks with the exact command, registers the server under the chosen name and reloads', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'mcpAddConfirm', name: 'memory2', text: 'npx -y @modelcontextprotocol/server-memory' }, d.all);
    expect(d.mcp.confirm.mock.calls[0]![1]).toContain('npx -y @modelcontextprotocol/server-memory');
    expect(d.mcp.actions.registerMcpServer).toHaveBeenCalledWith({ name: 'memory2', spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] } });
    expect(d.mcp.actions.reload).toHaveBeenCalled();
    expect(r).toMatchObject({ type: 'mcpListed' });
  });

  it('shows the variables and headers it would set, not only the command, in the dialog', async () => {
    const d = deps();
    await handleSettingsMessage({ type: 'mcpAddConfirm', name: 'x', text: '{ "command": "npx", "args": ["-y", "pkg"], "env": { "NODE_OPTIONS": "--require /tmp/x.js" } }' }, d.all);
    expect(d.mcp.confirm.mock.calls[0]![1]).toContain('NODE_OPTIONS=--require /tmp/x.js');
  });

  it('does nothing when the person declines', async () => {
    const d = deps();
    d.mcp.confirm.mockResolvedValue(false);
    await handleSettingsMessage({ type: 'mcpAddConfirm', name: 'x', text: 'npx -y pkg' }, d.all);
    expect(d.mcp.actions.registerMcpServer).not.toHaveBeenCalled();
  });

  it('reads the text again and refuses what no longer passes (the page is not trusted)', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'mcpAddConfirm', name: 'x', text: 'bash -c evil' }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect(d.mcp.confirm).not.toHaveBeenCalled();
    expect(d.mcp.actions.registerMcpServer).not.toHaveBeenCalled();
  });

  it('refuses a name the registry would not accept, or one the person already has', async () => {
    const d = deps({ installed: ['taken'] });
    expect(await handleSettingsMessage({ type: 'mcpAddConfirm', name: '../evil', text: 'npx -y pkg' }, d.all)).toMatchObject({ type: 'notice' });
    const r = await handleSettingsMessage({ type: 'mcpAddConfirm', name: 'taken', text: 'npx -y pkg' }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect(d.mcp.actions.registerMcpServer).not.toHaveBeenCalled();
  });
});

describe('Settings: duplicates of Forge tools', () => {
  it('shows how many tools were hidden and whether the person turned them back on', async () => {
    const d = deps({ servers: [status({ toolCount: 5, hiddenToolCount: 3 })], shown: [] });
    const r = await handleSettingsMessage({ type: 'mcpList' }, d.all);
    expect(r).toMatchObject({ servers: [{ name: 'acme', hiddenToolCount: 3, overlapShown: false }] });
  });

  it('switches the duplicates on and off for one server, and reloads', async () => {
    const d = deps({ servers: [status({ hiddenToolCount: 3 })] });
    const on = await handleSettingsMessage({ type: 'mcpOverlapToggle', name: 'acme' }, d.all);
    expect(d.mcp.setShowDuplicates).toHaveBeenLastCalledWith(['acme']);
    expect(d.mcp.actions.reload).toHaveBeenCalledTimes(1);
    expect(on).toMatchObject({ servers: [{ name: 'acme', overlapShown: true }] });
    await handleSettingsMessage({ type: 'mcpOverlapToggle', name: 'acme' }, d.all);
    expect(d.mcp.setShowDuplicates).toHaveBeenLastCalledWith([]);
  });

  it('still sends the switch for a server the person turned duplicates on for, though nothing is hidden now', async () => {
    const d = deps({ servers: [status({ toolCount: 8 })], shown: ['acme'] });
    const r = await handleSettingsMessage({ type: 'mcpList' }, d.all);
    expect(r).toMatchObject({ servers: [{ name: 'acme', overlapShown: true }] });
    expect((r as { servers: Array<{ hiddenToolCount?: number }> }).servers[0]!.hiddenToolCount).toBeUndefined();
  });

  it('refuses a server that is gone or defined in the project', async () => {
    const d = deps({ servers: [status({ name: 'p', scope: 'workspace' })] });
    expect(await handleSettingsMessage({ type: 'mcpOverlapToggle', name: 'ghost' }, d.all)).toMatchObject({ type: 'notice' });
    expect(await handleSettingsMessage({ type: 'mcpOverlapToggle', name: 'p' }, d.all)).toMatchObject({ type: 'notice' });
    expect(d.mcp.setShowDuplicates).not.toHaveBeenCalled();
  });
});

describe('Settings page: Add your own and secrets on a server row', () => {
  const html = getSettingsHtml();

  it('ends the Browse view with an Add your own card that previews before it adds', () => {
    expect(html).toContain('Add your own');
    expect(html).toContain("type: 'mcpAddPreview'");
    expect(html).toContain("type: 'mcpAddConfirm'");
  });

  it('draws the switch for a server whose duplicates are shown, so it can be turned off again', () => {
    expect((html.match(/s\.overlapShown \|\| s\.hiddenToolCount|s\.hiddenToolCount \|\| s\.overlapShown/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the Add your own card outside the part that search redraws, so it is there when nothing matches', () => {
    const draw = html.slice(html.indexOf('function drawMcpCards'), html.indexOf('function addYourOwnCard'));
    expect(draw).not.toContain('addYourOwnCard()');
    const render = html.slice(html.indexOf('function renderMcpCatalog'), html.indexOf('function drawMcpCards'));
    expect(render).toContain('addYourOwnCard()');
  });

  it('labels a stored secret with its name in words, not its id', () => {
    expect(html).toMatch(/lab\.textContent = x\.label/);
  });

  it('lets a server row take a missing secret and says how many tools were hidden', () => {
    expect(html).toContain("type: 'mcpSecretSet'");
    expect(html).toContain('Show duplicate tools');
    expect(html).toMatch(/Forge already has/);
  });
});
