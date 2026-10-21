/**
 * Pure view helpers for MCP servers (settings page, catalog picker). No `vscode`
 * import, so it is unit-testable outside the extension host.
 */
import type { MarketplaceEntry, McpServerStatus } from '@ikarmic/forge-core';


export function serverDescription(s: McpServerStatus): string {
  const where = s.scope === 'workspace' ? ' · workspace' : '';
  switch (s.state) {
    case 'connected':
      return `connected · ${s.toolCount} tool${s.toolCount === 1 ? '' : 's'}${where}`;
    case 'disabled':
      return `disabled${where}`;
    case 'failed':
      return `failed${where}`;
  }
}

/** The command a catalog server will run, shown to the user before install. */
export function commandPreview(entry: MarketplaceEntry): string {
  const c = entry.serverConfig;
  if (!c) return `git clone ${entry.github}`;
  if (c.command) return [c.command, ...(c.args ?? [])].join(' ');
  return c.url ?? entry.github;
}

export interface CatalogPickItem {
  label: string;
  description: string;
  detail: string;
  entry: MarketplaceEntry;
  installed: boolean;
}

export function catalogPickItems(entries: readonly MarketplaceEntry[], installed: ReadonlySet<string>): CatalogPickItem[] {
  return entries.map((entry) => {
    const isInstalled = installed.has(entry.name);
    return {
      label: `${isInstalled ? '$(check) ' : ''}${entry.displayName}`,
      description: [entry.name, ...(entry.tags ?? [])].join(' · '),
      detail: `${entry.description}  ·  runs: ${commandPreview(entry)}`,
      entry,
      installed: isInstalled,
    };
  });
}
