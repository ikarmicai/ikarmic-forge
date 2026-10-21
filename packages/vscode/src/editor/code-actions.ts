/**
 * Light-bulb actions: "Fix with Forge" on errors and warnings, and "Edit with Forge…" /
 * "Explain with Forge" on a selection. Each runs a command; nothing happens until chosen.
 */
import * as vscode from 'vscode';

import { t } from '../l10n.js';

/** At most this many "Fix" entries per light bulb, so a noisy line doesn't flood the menu. */
const MAX_FIXES = 3;

export const EXPLAIN_KIND = vscode.CodeActionKind.Refactor.append('forge.explain');

export class ForgeCodeActions implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.RefactorRewrite, EXPLAIN_KIND];

  provideCodeActions(doc: vscode.TextDocument, range: vscode.Range | vscode.Selection, ctx: vscode.CodeActionContext): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const problems = ctx.diagnostics.filter((d) => d.severity <= vscode.DiagnosticSeverity.Warning).slice(0, MAX_FIXES);
    for (const d of problems) {
      const first = d.message.split('\n')[0]!;
      const action = new vscode.CodeAction(t('Fix with Forge: {0}', first.length > 60 ? `${first.slice(0, 57)}…` : first), vscode.CodeActionKind.QuickFix);
      action.diagnostics = [d];
      action.command = {
        command: 'forge.fixDiagnostic',
        title: action.title,
        arguments: [doc.uri, d.range, d.message, d.source ?? '', typeof d.code === 'object' ? String(d.code.value) : String(d.code ?? '')],
      };
      actions.push(action);
    }
    if (!range.isEmpty) {
      const edit = new vscode.CodeAction(t('Edit with Forge…'), vscode.CodeActionKind.RefactorRewrite);
      edit.command = { command: 'forge.inlineEdit', title: edit.title };
      const explain = new vscode.CodeAction(t('Explain with Forge'), EXPLAIN_KIND);
      explain.command = { command: 'forge.explainSelection', title: explain.title };
      actions.push(edit, explain);
    }
    return actions;
  }
}
