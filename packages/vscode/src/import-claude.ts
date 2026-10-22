import os from 'node:os';

import * as vscode from 'vscode';

import { applyClaudeImport, planClaudeImport } from '@ikarmic/forge-core';
import type { McpManager } from '@ikarmic/forge-core';

import { importChoices, selectPlan, type ImportChoice } from './import-claude-model.js';
import { t } from './l10n.js';

/** "Forge: Import from Claude Code": pick what to bring over, write it into Forge's own locations, never replace. */
export function registerImportClaude(context: vscode.ExtensionContext, root: string, mcp: McpManager | undefined): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.importClaudeCode', async () => {
      const plan = await planClaudeImport({ home: os.homedir(), cwd: root });
      const choices = importChoices(plan);
      if (choices.length === 0) {
        void vscode.window.showInformationMessage(t('Nothing to import from Claude Code.'));
        return;
      }
      const picked = await vscode.window.showQuickPick<vscode.QuickPickItem & { choice: ImportChoice }>(
        choices.map((choice) => ({ label: choice.label, description: choice.description, picked: true, choice })),
        { canPickMany: true, title: t('Import from Claude Code'), placeHolder: t('Nothing already in Forge is replaced.') }
      );
      if (!picked || picked.length === 0) return;
      const result = await applyClaudeImport(selectPlan(plan, picked.map((p) => p.choice)), { home: os.homedir(), cwd: root });
      await mcp?.reload().catch(() => undefined);
      const left = plan.notes.length > 0 ? ' ' + t('{0} things could not be carried over.', plan.notes.length) : '';
      void vscode.window.showInformationMessage(t('Imported {0} files from Claude Code.', result.written.length) + left);
    })
  );
}
