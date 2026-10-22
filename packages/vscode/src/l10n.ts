/**
 * Runtime message translation. Calling t(message, ...args) looks the English
 * message up in `l10n/bundle.l10n.<locale>.json` and falls back to the English text.
 * By default VS Code picks the file by display language; `forge.language` overrides that
 * (see setLanguage), because an extension cannot change the display language on its own.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { makeTranslator, parseLanguage, type Translate } from './l10n-core.js';

const host: Translate = (message, ...args) => vscode.l10n.t(message, ...args);
let current: Translate = host;

/** Read `forge.language` and switch `t` to it. Call at activation and when the setting changes. */
export function setLanguage(extensionPath: string): void {
  const language = parseLanguage(vscode.workspace.getConfiguration('forge').get('language'));
  let bundle: Record<string, string> | undefined;
  if (language !== 'auto' && language !== 'en') {
    try {
      bundle = JSON.parse(readFileSync(path.join(extensionPath, 'l10n', `bundle.l10n.${language}.json`), 'utf8')) as Record<string, string>;
    } catch {
      bundle = undefined;
    }
  }
  current = makeTranslator(language, bundle, host);
}

export function t(message: string, ...args: Array<string | number | boolean>): string {
  return current(message, ...args);
}
