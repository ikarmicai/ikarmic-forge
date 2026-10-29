/**
 * The editor's side of the code index (F12): the question before code is sent to a remote embedder, a status item with
 * the index's progress and last problem, and the command that deletes the index and forgets every answer.
 */
import { deleteSemanticIndex, type SemanticStatus } from '@ikarmic/forge-core';
import * as vscode from 'vscode';

import { statusItemFor } from './index-status.js';
import { t } from './l10n.js';
import { SemanticConsent } from './semantic-consent.js';

const CONSENT_KEY = 'forge.semantic.allowedDestinations';
export const DELETE_INDEX_COMMAND = 'forge.index.delete';

export class SemanticUi implements vscode.Disposable {
  /** The one instance of this window; absent in tests that load the chat without the extension. */
  static current: SemanticUi | undefined;

  readonly consent: SemanticConsent;
  private readonly item: vscode.StatusBarItem;
  private readonly changed = new vscode.EventEmitter<SemanticStatus | undefined>();
  /** What the index last said, for the Settings page; undefined before the first run and after a delete. */
  status: SemanticStatus | undefined;
  /** Fires when the index reports something new, or is deleted. */
  readonly onDidChangeStatus = this.changed.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: Pick<vscode.LogOutputChannel, 'info' | 'warn'>
  ) {
    this.consent = new SemanticConsent(
      { get: () => context.globalState.get<string[]>(CONSENT_KEY, []), set: (v) => context.globalState.update(CONSENT_KEY, v) },
      async (d) => {
        const allow = t('Allow');
        const pick = await vscode.window.showWarningMessage(
          t('Search by meaning would send chunks of your code to {0} (model {1}) to rank the results. Secrets are removed first, but the code itself leaves this machine. Allow it?', d.host, d.model),
          { modal: true },
          allow,
          t('Use word matching only')
        );
        return pick === allow;
      }
    );
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    this.item.command = DELETE_INDEX_COMMAND;
    this.item.name = t('Forge code index');
    SemanticUi.current = this;
  }

  /** Passed to the agent: updates the status item and writes a problem to Output > Forge (RB-18). */
  readonly onStatus = (s: SemanticStatus): void => {
    this.status = s;
    this.changed.fire(s);
    const { text, tooltip } = statusItemFor(s);
    this.item.text = text;
    this.item.tooltip = tooltip;
    this.item.show();
    if (s.phase === 'error') this.log.warn(s.message);
    else if (s.phase === 'ready') this.log.info(`Code index ready: ${s.files} files, ${s.chunks} pieces.`);
  };

  /** Forge: Delete Code Index and Forget Consent. */
  async deleteIndex(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const remove = t('Delete');
    const pick = await vscode.window.showWarningMessage(
      t('Delete the code index and forget which providers you allowed to receive your code? Forge rebuilds the index the next time you search by meaning.'),
      { modal: true },
      remove
    );
    if (pick !== remove) return;
    await this.consent.withdraw();
    if (root) await deleteSemanticIndex(root).catch(() => false);
    this.item.hide();
    this.status = undefined;
    this.changed.fire(undefined);
    void vscode.window.showInformationMessage(t('The code index is deleted and your choices are forgotten.'));
  }

  dispose(): void {
    this.item.dispose();
    this.changed.dispose();
    if (SemanticUi.current === this) SemanticUi.current = undefined;
  }
}
