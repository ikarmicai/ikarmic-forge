/**
 * "Edit with Forge" (Ctrl+Alt+Shift+I): rewrite the selection (or the current line)
 * as instructed, show the change as a diff, and apply it only when you choose Apply
 * and the file hasn't changed in the meantime.
 */
import * as vscode from 'vscode';

import { generateText } from 'ai';

import { assertProviderAllowed, createLanguageModel, getOrgPolicy, withModelRetry, type CredentialStore } from '@ikarmic/forge-core';

import { resolveModel } from '../config.js';
import { loadRuntimeConfig } from '../runtime-config.js';
import { t } from '../l10n.js';
import { contextAround, extractReplacement, INLINE_EDIT_SYSTEM, inlineEditPrompt } from './editor-tasks.js';

export const INLINE_EDIT_SCHEME = 'forge-inline-edit';

/** The proposed file, shown on the right of the diff. */
export class InlineEditContent implements vscode.TextDocumentContentProvider {
  private readonly docs = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;
  private seq = 0;

  set(name: string, content: string): vscode.Uri {
    const uri = vscode.Uri.from({ scheme: INLINE_EDIT_SCHEME, path: `/${++this.seq}/${name}` });
    this.docs.set(uri.path, content);
    this.emitter.fire(uri);
    return uri;
  }

  delete(uri: vscode.Uri): void {
    this.docs.delete(uri.path);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.docs.get(uri.path) ?? '';
  }
}

export async function runInlineEdit(store: CredentialStore, content: InlineEditContent, preset?: { instruction?: string }): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage(t('Forge: open a file first.'));
    return;
  }
  const doc = editor.document;
  // No selection: the whole current line(s).
  const sel = editor.selection;
  const range = sel.isEmpty
    ? doc.lineAt(sel.active.line).rangeIncludingLineBreak
    : new vscode.Range(sel.start, sel.end);
  const instruction =
    preset?.instruction ??
    (await vscode.window.showInputBox({
      prompt: t('Edit with Forge: what should change?'),
      placeHolder: t('e.g. add error handling, convert to async/await, rename x to count'),
      ignoreFocusOut: true,
    }));
  if (!instruction?.trim()) return;

  const cfg = await loadRuntimeConfig(store);
  let model;
  try {
    model = resolveModel(cfg);
    assertProviderAllowed(model.provider, getOrgPolicy()?.policy);
  } catch (err) {
    void vscode.window.showErrorMessage(t('Forge: {0}', (err as Error).message));
    return;
  }

  const version = doc.version;
  const original = doc.getText(range);
  const lines = doc.getText().split(/\r?\n/);
  // A range ending at column 0 of the next line (a whole-line selection) ends on the line before.
  const endLine = range.end.character === 0 && range.end.line > range.start.line ? range.end.line - 1 : range.end.line;
  const { before, after } = contextAround(lines, range.start.line, endLine);
  const file = vscode.workspace.asRelativePath(doc.uri);

  let reply: string;
  try {
    reply = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t('Forge is editing {0}…', file), cancellable: true },
      async (_progress, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());
        // think-tags: handled in extractReplacement() (editor-tasks.ts), which strips <think> blocks.
        const { text } = await withModelRetry(
          () =>
            generateText({
              model: createLanguageModel(model),
              system: INLINE_EDIT_SYSTEM,
              prompt: inlineEditPrompt({ instruction, file, language: doc.languageId, before, selection: original, after }),
              abortSignal: controller.signal,
              maxRetries: 0,
            }),
          { maxRetries: 2, abortSignal: controller.signal }
        );
        return text;
      }
    );
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    void vscode.window.showErrorMessage(t('Forge: {0}', (err as Error).message));
    return;
  }

  const replacement = extractReplacement(reply, original);
  if (replacement === original) {
    void vscode.window.showInformationMessage(t('Forge: no change for that instruction.'));
    return;
  }
  const full = doc.getText();
  const proposed = full.slice(0, doc.offsetAt(range.start)) + replacement + full.slice(doc.offsetAt(range.end));
  const right = content.set(doc.uri.path.split('/').pop() ?? 'proposed', proposed);
  await vscode.commands.executeCommand('vscode.diff', doc.uri, right, t('{0} ↔ Forge edit', file), { preview: true });
  const apply = t('Apply');
  const choice = await vscode.window.showInformationMessage(t('Apply Forge\'s edit to {0}?', file), apply, t('Discard'));
  content.delete(right);
  // Close the diff tab we opened.
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputTextDiff && tab.input.modified.toString() === right.toString()) {
        await vscode.window.tabGroups.close(tab);
      }
    }
  }
  if (choice !== apply) return;
  if (doc.version !== version) {
    void vscode.window.showWarningMessage(t('Forge: {0} changed while the edit was pending, so it was not applied. Run Edit with Forge again.', file));
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, range, replacement);
  await vscode.workspace.applyEdit(edit);
}
