/**
 * Runtime message translation. Calling t(message, ...args) looks the English
 * message up in `l10n/bundle.l10n.<locale>.json` (VS Code picks the file by
 * display language) and falls back to the English text.
 */
import * as vscode from 'vscode';

export function t(message: string, ...args: Array<string | number | boolean>): string {
  return vscode.l10n.t(message, ...args);
}
