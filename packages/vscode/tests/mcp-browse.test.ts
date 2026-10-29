import { describe, expect, it, vi } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

const entry = (over: Record<string, unknown> = {}) => ({
  name: 'github',
  displayName: 'GitHub',
  description: 'Work with issues and pull requests.',
  github: 'github/github-mcp-server',
  vertical: 'Code hosting',
  lastChecked: '2026-10-28',
  serverConfig: { command: 'npx', args: ['-y', '@acme/github-mcp'], env: { GITHUB_TOKEN: '${input:token}' } },
  secrets: [{ id: 'token', label: 'GitHub token', help: 'Create one in your GitHub settings. It needs read access to repositories.' }],
  ...over,
});

function deps(over: { entries?: unknown[]; installed?: string[]; registerFails?: boolean; withSecrets?: boolean } = {}) {
  const secrets = { idsOf: vi.fn().mockResolvedValue([]), has: vi.fn().mockResolvedValue(false), set: vi.fn().mockResolvedValue(undefined) };
  const mcp = {
    enabled: () => true,
    projectSkipped: () => false,
    status: vi.fn().mockResolvedValue([]),
    tools: vi.fn().mockReturnValue([]),
    actions: {
      setMcpServerDisabled: vi.fn(),
      uninstallMcpServer: vi.fn(),
      registerMcpServer: over.registerFails ? vi.fn().mockRejectedValue(new Error('disk full')) : vi.fn().mockResolvedValue(undefined),
      installMcpServer: vi.fn(),
      reload: vi.fn().mockResolvedValue(undefined),
    },
    catalog: vi.fn().mockResolvedValue({ entries: over.entries ?? [entry()], installed: over.installed ?? [] }),
    confirm: vi.fn().mockResolvedValue(true),
    openConfig: vi.fn(),
    ...(over.withSecrets === false ? {} : { secrets }),
  };
  return { mcp, secrets, all: { mcp } as unknown as SettingsDeps };
}

describe('Settings: MCP catalog cards', () => {
  it('sends the group, the secret fields and the command the card shows', async () => {
    const d = deps({ entries: [entry(), entry({ name: 'sentry', displayName: 'Sentry', vertical: 'Monitoring', secrets: undefined, remote: true, serverConfig: { url: 'https://mcp.sentry.dev/mcp' } })] });
    const r = await handleSettingsMessage({ type: 'mcpCatalog' }, d.all);
    expect(r).toMatchObject({
      type: 'mcpCatalogListed',
      entries: [
        { name: 'github', vertical: 'Code hosting', remote: false, command: 'npx -y @acme/github-mcp', secrets: [{ id: 'token', label: 'GitHub token' }] },
        { name: 'sentry', vertical: 'Monitoring', remote: true, command: 'https://mcp.sentry.dev/mcp', secrets: [] },
      ],
    });
  });

  it('puts an entry from a remote catalog with no group under "Other"', async () => {
    const d = deps({ entries: [entry({ vertical: undefined, secrets: undefined })] });
    const r = await handleSettingsMessage({ type: 'mcpCatalog' }, d.all);
    expect(r).toMatchObject({ entries: [{ vertical: 'Other' }] });
  });
});

describe('Settings: installing a card with secrets', () => {
  it('refuses to install until every secret has a value, and stores nothing', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'mcpInstall', name: 'github', secretValues: { token: '  ' } }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect((r as { message: string }).message).toContain('GitHub token');
    expect(d.secrets.set).not.toHaveBeenCalled();
    expect(d.mcp.actions.registerMcpServer).not.toHaveBeenCalled();
    expect(d.mcp.confirm).not.toHaveBeenCalled();
  });

  it('asks first, then stores each secret under the server name and registers the server', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'mcpInstall', name: 'github', secretValues: { token: 'ghp_topsecret' } }, d.all);
    expect(d.mcp.confirm).toHaveBeenCalledTimes(1);
    expect(d.secrets.set).toHaveBeenCalledWith('github', 'token', 'ghp_topsecret');
    expect(d.mcp.actions.registerMcpServer).toHaveBeenCalledWith({ name: 'github', spec: expect.objectContaining({ command: 'npx' }) });
    expect(JSON.stringify(r)).not.toContain('ghp_topsecret');
  });

  it('keeps the placeholder in the registered spec, never the value', async () => {
    const d = deps();
    await handleSettingsMessage({ type: 'mcpInstall', name: 'github', secretValues: { token: 'ghp_topsecret' } }, d.all);
    const call = d.mcp.actions.registerMcpServer.mock.calls[0]![0];
    expect(JSON.stringify(call)).not.toContain('ghp_topsecret');
    expect(JSON.stringify(call)).toContain('${input:token}');
  });

  it('stores nothing when the person declines the dialog', async () => {
    const d = deps();
    d.mcp.confirm.mockResolvedValue(false);
    await handleSettingsMessage({ type: 'mcpInstall', name: 'github', secretValues: { token: 'x' } }, d.all);
    expect(d.secrets.set).not.toHaveBeenCalled();
    expect(d.mcp.actions.registerMcpServer).not.toHaveBeenCalled();
  });

  it('takes the secrets back out when the install fails', async () => {
    const d = deps({ registerFails: true });
    const r = await handleSettingsMessage({ type: 'mcpInstall', name: 'github', secretValues: { token: 'x' } }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect(d.secrets.set).toHaveBeenLastCalledWith('github', 'token', '');
  });

  it('says so when this editor cannot keep secrets, instead of installing a server that cannot start', async () => {
    const d = deps({ withSecrets: false });
    const r = await handleSettingsMessage({ type: 'mcpInstall', name: 'github', secretValues: { token: 'x' } }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect(d.mcp.actions.registerMcpServer).not.toHaveBeenCalled();
  });

  it('does not replace a server the person already has under that name', async () => {
    const d = deps({ installed: ['github'] });
    const r = await handleSettingsMessage({ type: 'mcpInstall', name: 'github', secretValues: { token: 'x' } }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect(d.mcp.actions.registerMcpServer).not.toHaveBeenCalled();
    expect(d.secrets.set).not.toHaveBeenCalled();
  });

  it('installs an entry with no secrets exactly as before', async () => {
    const d = deps({ entries: [entry({ name: 'memory', secrets: undefined, serverConfig: { command: 'npx', args: ['-y', 'mem'] } })] });
    await handleSettingsMessage({ type: 'mcpInstall', name: 'memory' }, d.all);
    expect(d.mcp.actions.registerMcpServer).toHaveBeenCalledWith({ name: 'memory', spec: expect.objectContaining({ command: 'npx' }) });
    expect(d.secrets.set).not.toHaveBeenCalled();
  });
});

describe('Settings page: Browse view', () => {
  const html = getSettingsHtml();
  const block = html.slice(html.indexOf('function renderMcpCatalog'), html.indexOf('// skills (immediate)'));

  it('groups the cards by vertical and has a search box', () => {
    expect(block).toContain('vertical');
    expect(block).toContain('Search servers');
  });

  it('asks for each secret in a labelled password field, in the dialog (see mcp-browse-dialog.test.ts)', () => {
    expect(block).toContain("type = 'password'");
    expect(block).toContain('secretValues');
    expect(block).toContain('lab.htmlFor');
  });

  it('shows no identifier in the text it builds', () => {
    for (const t of block.match(/'[A-Z][^']{6,}'/g) ?? []) expect(t).not.toMatch(/[a-z]+_[a-z]+/);
  });
});
