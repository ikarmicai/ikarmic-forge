import path from 'node:path';

import * as vscode from 'vscode';

import { parseTasks } from '@ikarmic/forge-core';

import { codeLensTargets } from './codelens-model.js';

export class TasksCodeLensProvider implements vscode.CodeLensProvider {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;

  constructor(private readonly specsRoot: string) {}

  refresh(): void {
    this.emitter.fire();
  }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const specDir = path.dirname(doc.uri.fsPath);
    if (path.resolve(path.dirname(specDir)) !== path.resolve(this.specsRoot)) return [];
    const specId = path.basename(specDir);
    return codeLensTargets(parseTasks(doc.getText())).flatMap((t) => {
      const range = new vscode.Range(t.line, 0, t.line, 0);
      const args = { specId, taskId: t.taskId, title: t.title };
      return [
        new vscode.CodeLens(range, { title: '▶ Run (fresh session)', command: 'forge.spec.runTask', arguments: [args] }),
        new vscode.CodeLens(range, { title: '▶ Run (current chat)', command: 'forge.spec.runTaskCurrent', arguments: [args] }),
      ];
    });
  }
}
