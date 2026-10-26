import * as vscode from 'vscode';

import { chatTabTitle } from './chat-tab-title.js';
import type { ForgeChatViewProvider } from './chat-view.js';

let opened = 0;

/**
 * "Open in Tab": a chat of its own in an editor tab. It is a second provider with its own conversation,
 * sharing the model, MCP servers and saved chats with the sidebar chat.
 */
export function openChatInTab(
  context: vscode.ExtensionContext,
  makeProvider: () => ForgeChatViewProvider,
  opts: { title?: string; column?: vscode.ViewColumn; root?: string } = {}
): { panel: vscode.WebviewPanel; provider: ForgeChatViewProvider } {
  opened += 1;
  const panel = vscode.window.createWebviewPanel('forge.chatTab', opts.title ?? chatTabTitle(opened), opts.column ?? vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panel.iconPath = {
    light: vscode.Uri.joinPath(context.extensionUri, 'resources', 'tab-light.svg'),
    dark: vscode.Uri.joinPath(context.extensionUri, 'resources', 'tab-dark.svg'),
  };
  const provider = makeProvider();
  if (opts.root) provider.setWorkspaceRoot(opts.root);
  provider.resolveWebviewView({
    webview: panel.webview,
    onDidDispose: panel.onDidDispose,
    get visible() {
      return panel.visible;
    },
    onDidChangeVisibility: panel.onDidChangeViewState as unknown as vscode.WebviewView['onDidChangeVisibility'],
  });
  panel.onDidDispose(() => provider.dispose());
  return { panel, provider };
}
