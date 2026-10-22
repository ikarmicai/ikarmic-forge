import * as vscode from 'vscode';

import { costFor, formatCost } from '@ikarmic/forge-core';
import type { ModelConfig } from '@ikarmic/forge-core';

import { CompletionState, snoozeEnd, statusText } from './completion-controls.js';
import { readConfig, resolveCompletionModel } from './config.js';
import { t } from './l10n.js';

const SNOOZE_MINUTES = [5, 15, 60];

/** Status bar item for inline completion: state, snooze, and what the completion model has cost this session. */
export class CompletionStatus {
  private readonly item: vscode.StatusBarItem;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly state: CompletionState) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.item.command = 'forge.completion.menu';
    this.item.show();
    this.refresh();
  }

  refresh(): void {
    const enabled = readConfig().completionEnabled;
    const now = Date.now();
    this.item.text = statusText({ enabled, snoozedUntil: this.state.snoozedUntil, now });
    const u = this.state.usage.snapshot();
    let cost = '';
    try {
      const model: ModelConfig = resolveCompletionModel(readConfig());
      const c = costFor(model, { input: u.input, output: u.output });
      cost = ` · ${formatCost(c.cost, c.known)}`;
    } catch {
      // no model configured: tokens only
    }
    this.item.tooltip = t('Forge autocomplete: {0} requests, {1} tokens in, {2} out{3}. Click to snooze or turn off.', u.requests, u.input, u.output, cost);
    if (this.timer) clearTimeout(this.timer);
    if (this.state.snoozedUntil > now) {
      this.timer = setTimeout(() => this.refresh(), this.state.snoozedUntil - now + 500);
    }
  }

  async menu(): Promise<void> {
    const enabled = readConfig().completionEnabled;
    const items: Array<vscode.QuickPickItem & { run: () => void | Thenable<void> }> = [];
    if (this.state.snoozedUntil > Date.now()) {
      items.push({ label: t('Resume now'), run: () => { this.state.snoozedUntil = 0; } });
    } else if (enabled) {
      for (const m of SNOOZE_MINUTES) {
        items.push({ label: t('Snooze for {0} minutes', m), run: () => { this.state.snoozedUntil = snoozeEnd(Date.now(), m); } });
      }
    }
    items.push({
      label: enabled ? t('Turn autocomplete off') : t('Turn autocomplete on'),
      run: () => vscode.workspace.getConfiguration('forge').update('completionEnabled', !enabled, vscode.ConfigurationTarget.Global),
    });
    items.push({ label: t('Reset the session count'), run: () => this.state.usage.reset() });
    const pick = await vscode.window.showQuickPick(items, { placeHolder: t('Forge autocomplete') });
    if (!pick) return;
    await pick.run();
    this.refresh();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.item.dispose();
  }
}
