import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as vscode from 'vscode';

import {
  defaultUserMcpPath,
  installMcpServer,
  listInstalledServers,
  loadMcpCatalog,
  registerMcpServer,
  setMcpServerDisabled,
  uninstallMcpServer,
  type McpManager,
  type McpServerStatus,
} from '@ikarmic/forge-core';

import { installEntry, removeServer, toggleServer, type McpActionDeps } from './mcp-actions.js';
import { catalogPickItems, commandPreview } from './mcp-model.js';
import { t } from '../l10n.js';

/** What the toggle/remove commands receive; only reachable from code now that the tree view is gone. */
type ServerNode = { kind: 'server'; status: McpServerStatus };

export function registerMcp(context: vscode.ExtensionContext, manager: McpManager): void {
  const reload = async (): Promise<void> => {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Reloading MCP servers' }, () => manager.reload());
    vscode.window.setStatusBarMessage(t('Forge: MCP servers reloaded.'), 3000);
  };
  const actionDeps: McpActionDeps = { setMcpServerDisabled, uninstallMcpServer, registerMcpServer, installMcpServer, reload };

  context.subscriptions.push(
    vscode.commands.registerCommand('forge.mcp.reload', reload),
    vscode.commands.registerCommand('forge.mcp.signIn', async (name?: string) => {
      await manager.ensureConnected();
      const waiting = manager.status().filter((s) => s.state === 'needs-auth');
      const target =
        name && waiting.some((s) => s.name === name)
          ? name
          : waiting.length === 1
            ? waiting[0]!.name
            : (await vscode.window.showQuickPick(waiting.map((s) => s.name), { placeHolder: t('Sign in to which MCP server?') }));
      if (!target) {
        if (waiting.length === 0) void vscode.window.showInformationMessage(t('Forge: no MCP server needs you to sign in.'));
        return;
      }
      try {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: t('Signing in to {0}… finish in your browser.', target) }, () => manager.signIn(target));
        void vscode.window.showInformationMessage(t('Forge: signed in to {0}.', target));
      } catch (err) {
        void vscode.window.showWarningMessage(t('Forge: sign-in to {0} did not finish: {1}', target, (err as Error).message));
      }
    }),
    vscode.commands.registerCommand('forge.mcp.openConfig', async () => {
      const file = defaultUserMcpPath();
      if (!existsSync(file)) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, '{\n  "mcpServers": {}\n}\n', 'utf8');
      }
      await vscode.window.showTextDocument(vscode.Uri.file(file));
    }),
    vscode.commands.registerCommand('forge.mcp.browse', async () => {
      const [{ servers, warning }, installed] = await Promise.all([loadMcpCatalog(), listInstalledServers().catch(() => [])]);
      if (warning) void vscode.window.showWarningMessage(t('Forge: {0}', warning));
      const pick = await vscode.window.showQuickPick(catalogPickItems(servers, new Set(installed.map((s) => s.name))), {
        placeHolder: t('Install an MCP server'),
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (!pick) return;
      if (pick.installed) {
        void vscode.window.showInformationMessage(t('Forge: "{0}" is already installed.', pick.entry.name));
        return;
      }
      const cmd = commandPreview(pick.entry);
      const ok = await vscode.window.showWarningMessage(
        t('Install MCP server "{0}"?', pick.entry.displayName),
        {
          modal: true,
          detail: `Forge will run this on your machine whenever the server starts:\n\n${cmd}\n\nOnly install servers you trust.`,
        },
        'Install'
      );
      if (ok !== 'Install') return;
      const result = await installEntry(pick.entry, actionDeps);
      if (!result.ok) void vscode.window.showErrorMessage(t('Forge: {0}', result.message));
    }),
    vscode.commands.registerCommand('forge.mcp.toggle', async (node?: ServerNode) => {
      if (node?.kind !== 'server') return;
      const result = await toggleServer(node.status, actionDeps);
      if (!result.ok) void vscode.window.showInformationMessage(t('Forge: {0}', result.message));
    }),
    vscode.commands.registerCommand('forge.mcp.remove', async (node?: ServerNode) => {
      if (node?.kind !== 'server' || node.status.scope === 'workspace') return;
      const ok = await vscode.window.showWarningMessage(t('Remove MCP server "{0}"?', node.status.name), { modal: true }, 'Remove');
      if (ok !== 'Remove') return;
      await removeServer(node.status, actionDeps);
    }),
    { dispose: () => void manager.dispose() }
  );

}
