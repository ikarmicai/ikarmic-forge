import * as vscode from 'vscode';

export const PROPOSED_SCHEME = 'forge-proposed';

/**
 * In-memory documents for the right-hand side of the "Open diff" view on
 * write_file / edit_file approvals. Keyed by approval id; entries are
 * dropped when the approval resolves or the task ends.
 */
export class ProposedContentProvider implements vscode.TextDocumentContentProvider {
  private readonly docs = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  set(key: string, content: string): vscode.Uri {
    this.docs.set(key, content);
    const uri = vscode.Uri.from({ scheme: PROPOSED_SCHEME, path: `/${key}` });
    this.emitter.fire(uri);
    return uri;
  }

  delete(key: string): void {
    this.docs.delete(key);
  }

  clear(): void {
    this.docs.clear();
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.docs.get(uri.path.replace(/^\//, '')) ?? '';
  }
}
