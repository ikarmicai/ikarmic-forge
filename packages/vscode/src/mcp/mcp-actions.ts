/**
 * MCP server actions shared by the Command Palette commands and the Settings
 * page. Pure (core functions are injected) so the rules are unit-tested:
 * workspace-defined servers are read-only, and every change reloads.
 *
 */
import type {
  MarketplaceEntry,
  McpServerStatus,
  installMcpServer,
  registerMcpServer,
  setMcpServerDisabled,
  uninstallMcpServer,
} from '@ikarmic/forge-core';

export interface McpActionDeps {
  setMcpServerDisabled: typeof setMcpServerDisabled;
  uninstallMcpServer: typeof uninstallMcpServer;
  registerMcpServer: typeof registerMcpServer;
  installMcpServer: typeof installMcpServer;
  reload(): Promise<void>;
  /**
   * The secrets a person stored on a server's card. Removing the server forgets them, from whichever surface asks
   * (RB-106). Optional: a surface with no secret storage has nothing to forget.
   */
  secrets?: { idsOf(server: string): Promise<string[]>; set(server: string, id: string, value: string): Promise<void> };
}

export type McpActionResult = { ok: true } | { ok: false; message: string };

export const WORKSPACE_READONLY = 'This server is defined in the workspace .forge/mcp.json. Edit that file to change it.';

export async function toggleServer(s: McpServerStatus, deps: McpActionDeps): Promise<McpActionResult> {
  if (s.scope === 'workspace') return { ok: false, message: WORKSPACE_READONLY };
  await deps.setMcpServerDisabled({ name: s.name, disabled: s.state !== 'disabled' });
  await deps.reload();
  return { ok: true };
}

export async function removeServer(s: McpServerStatus, deps: McpActionDeps): Promise<McpActionResult> {
  if (s.scope === 'workspace') return { ok: false, message: WORKSPACE_READONLY };
  // Read the ids first: once the server is uninstalled, its entry and so its placeholders are gone.
  const secretIds = deps.secrets ? await deps.secrets.idsOf(s.name) : [];
  await deps.uninstallMcpServer({ name: s.name });
  for (const id of secretIds) await deps.secrets!.set(s.name, id, '');
  await deps.reload();
  return { ok: true };
}

export async function installEntry(entry: MarketplaceEntry, deps: McpActionDeps): Promise<McpActionResult> {
  try {
    if (entry.serverConfig) await deps.registerMcpServer({ name: entry.name, spec: entry.serverConfig });
    else await deps.installMcpServer({ source: entry });
  } catch (err) {
    return { ok: false, message: `Could not install "${entry.name}": ${(err as Error).message}` };
  }
  await deps.reload();
  return { ok: true };
}
