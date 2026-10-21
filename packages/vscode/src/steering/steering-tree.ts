import * as vscode from 'vscode';

import { loadSteering } from '@ikarmic/forge-core';

import { buildSteeringTree, type SteeringNode } from './steering-model.js';

export class SteeringTreeProvider implements vscode.TreeDataProvider<SteeringNode> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly root: string) {}

  refresh(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.emitter.fire(), 150);
  }

  async getChildren(node?: SteeringNode): Promise<SteeringNode[]> {
    if (node) return node.kind === 'group' ? node.children : [];
    const trusted = vscode.workspace.isTrusted;
    const { docs, warnings } = await loadSteering(this.root, { includeProject: trusted });
    return buildSteeringTree({ docs, warnings, projectSkipped: !trusted });
  }

  getTreeItem(node: SteeringNode): vscode.TreeItem {
    switch (node.kind) {
      case 'group':
        return new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      case 'doc': {
        const item = new vscode.TreeItem(node.doc.name, vscode.TreeItemCollapsibleState.None);
        item.description = node.description;
        item.tooltip = node.doc.source.path;
        item.contextValue = node.doc.enabled ? 'forgeSteering-enabled' : 'forgeSteering-disabled';
        item.iconPath = new vscode.ThemeIcon(node.doc.enabled ? 'lightbulb' : 'circle-slash');
        item.command = { command: 'forge.steering.open', title: 'Open', arguments: [node] };
        return item;
      }
      case 'message':
        return new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    }
  }
}
