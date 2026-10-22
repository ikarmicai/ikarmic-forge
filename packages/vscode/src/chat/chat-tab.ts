import * as vscode from 'vscode';

import { chatTabTitle } from './chat-tab-title.js';
import type { ForgeChatViewProvider } from './chat-view.js';

let opened = 0;

/**
 * "Open in Tab": a chat of its own in an editor tab. It is a second provider with its own conversation,
 * sharing the model, MCP servers and saved chats with the sidebar chat.
 */
export function openChatInTab(context: vscode.ExtensionContext, makeProvider: () => ForgeChatViewProvider): void {
  opened += 1;
  const panel = vscode.window.createWebviewPanel('forge.chatTab', chatTabTitle(opened), vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panel.iconPath = {
    light: vscode.Uri.joinPath(context.extensionUri, 'resources', 'tab-light.svg'),
    dark: vscode.Uri.joinPath(context.extensionUri, 'resources', 'tab-dark.svg'),
  };
  const provider = makeProvider();
  provider.resolveWebviewView({
    webview: panel.webview,
    onDidDispose: panel.onDidDispose,
    onDidChangeVisibility: panel.onDidChangeViewState as unknown as vscode.WebviewView['onDidChangeVisibility'],
  });
  panel.onDidDispose(() => provider.dispose());
}
