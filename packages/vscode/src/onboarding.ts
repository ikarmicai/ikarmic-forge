import * as vscode from 'vscode';

import { defaultSessionDir, listSessions, type CredentialStore } from '@ikarmic/forge-core';

import type { ForgeChatViewProvider } from './chat/chat-view.js';
import { resolveModel } from './config.js';
import { loadRuntimeConfig } from './runtime-config.js';
import { computeStats, formatStatsMarkdown } from './stats-model.js';
import { t } from './l10n.js';

const ONBOARDED_KEY = 'forge.onboarded';
const WALKTHROUGH_ID = 'ikarmic.ikarmic-forge#forge.getStarted';

const STATS_SCHEME = 'forge-usage';
let statsContent = '';
const statsChanged = new vscode.EventEmitter<vscode.Uri>();

/** Getting-started walkthrough (once, when no model is configured), usage stats and session resume. */
export function registerOnboarding(
  context: vscode.ExtensionContext,
  chat: ForgeChatViewProvider,
  credentialStore: CredentialStore
): void {
  const openWalkthrough = (): Thenable<unknown> =>
    vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID, false);

  context.subscriptions.push(
    vscode.commands.registerCommand('forge.getStarted', openWalkthrough),
    vscode.workspace.registerTextDocumentContentProvider(STATS_SCHEME, { onDidChange: statsChanged.event, provideTextDocumentContent: () => statsContent }),

    vscode.commands.registerCommand('forge.showStats', async () => {
      const entries = await listSessions(defaultSessionDir()).catch(() => []);
      // A virtual, read-only document: an untitled one asks "save changes?" every time it is closed.
      statsContent = formatStatsMarkdown(computeStats(entries, 30));
      const uri = vscode.Uri.parse(`${STATS_SCHEME}:Forge usage.md`);
      statsChanged.fire(uri);
      await vscode.commands.executeCommand('markdown.showPreview', uri).then(undefined, async () => {
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
      });
    }),

    // Handoff: any session saved by the CLI (`forge`) or this extension shows up here and opens with full history.
    vscode.commands.registerCommand('forge.sessions.resume', async () => {
      const entries = await listSessions(defaultSessionDir()).catch(() => []);
      if (entries.length === 0) {
        void vscode.window.showInformationMessage(t('Forge: no saved sessions yet.'));
        return;
      }
      const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const items = entries.slice(0, 50).map((e) => ({
        label: e.label || e.preview || e.id,
        description: `${new Date(e.updatedAt).toLocaleString()}${e.cwd === workspace ? '' : `  ·  ${e.cwd}`}`,
        detail: `${e.model.provider}/${e.model.model}`,
        id: e.id,
      }));
      const pick = await vscode.window.showQuickPick(items, { placeHolder: t('Resume a session in the chat'), matchOnDescription: true });
      if (pick) await chat.resumeSession(pick.id);
    })
  );

  // First run: if nothing is configured yet, show the walkthrough instead of leaving the user at an error.
  if (!context.globalState.get<boolean>(ONBOARDED_KEY)) {
    void context.globalState.update(ONBOARDED_KEY, true);
    void (async () => {
      try {
        resolveModel(await loadRuntimeConfig(credentialStore));
      } catch {
        await openWalkthrough();
      }
    })();
  }
}
