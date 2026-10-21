import { readFile } from 'node:fs/promises';
import path from 'node:path';

import * as vscode from 'vscode';

import { parseTasks, runKey, type SpecStore } from '@ikarmic/forge-core';

import { buildTreeModel, type RunningRef, type TreeInput, type TreeNode } from './tree-model.js';
import { t } from '../l10n.js';

const STATUS_ICON = {
  done: ['pass', 'testing.iconPassed'],
  running: ['sync~spin', 'charts.blue'],
  failed: ['error', 'testing.iconFailed'],
  pending: ['circle-outline', 'descriptionForeground'],
} as const;

export class SpecsTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private timer: NodeJS.Timeout | undefined;
  private readonly warnedCorrupt = new Set<string>();

  constructor(
    private readonly store: SpecStore,
    private readonly workspaceRoot: string,
    private readonly running: () => RunningRef | undefined
  ) {}

  /** Debounced: file-watcher bursts collapse into one rebuild. */
  refresh(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.emitter.fire(), 150);
  }

  async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    if (node) return 'children' in node ? node.children : [];
    return buildTreeModel(await this.load());
  }

  private async load(): Promise<TreeInput> {
    const [drafts, summaries] = await Promise.all([this.store.listDrafts(), this.store.list()]);
    const specs = await Promise.all(
      summaries.map(async (summary) => {
        const md = await readFile(path.join(summary.dir, 'tasks.md'), 'utf8').catch(() => '');
        const runs = await this.store.getRuns(summary.id);
        if (runs.corrupt && !this.warnedCorrupt.has(summary.id)) {
          this.warnedCorrupt.add(summary.id);
          void vscode.window.showWarningMessage(t('Forge: runs.json for spec {0} is unreadable; run history starts fresh.', summary.id));
        }
        const tasks = parseTasks(md).map((task) => {
          const list = runs.tasks[runKey(task.id, task.title)];
          return { task, lastRun: list?.[list.length - 1] };
        });
        return { summary, tasks };
      })
    );
    return { drafts, specs, running: this.running() };
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    const None = vscode.TreeItemCollapsibleState.None;
    const specsRoot = this.store.rootPath();
    switch (node.kind) {
      case 'group':
        return new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      case 'draft': {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
        item.description = 'draft';
        item.contextValue = 'forgeDraft';
        item.iconPath = new vscode.ThemeIcon('edit');
        return item;
      }
      case 'draftFile': {
        const item = new vscode.TreeItem(node.file, None);
        const uri = vscode.Uri.file(path.join(specsRoot, '.drafts', node.draftId, node.file));
        item.command = { command: 'forge.spec.openFile', title: 'Open', arguments: [uri] };
        item.iconPath = new vscode.ThemeIcon('markdown');
        return item;
      }
      case 'spec': {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
        item.description = node.progress.total > 0 ? `${node.progress.done}/${node.progress.total} tasks` : node.specId;
        item.tooltip = node.specId;
        item.contextValue = 'forgeSpec';
        item.iconPath = new vscode.ThemeIcon('book');
        return item;
      }
      case 'task': {
        const item = new vscode.TreeItem(
          node.task.title,
          node.children.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : None
        );
        item.description = node.description;
        item.contextValue = `forgeTask-${node.status}`;
        const [icon, color] = STATUS_ICON[node.status];
        item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
        const uri = vscode.Uri.file(path.join(specsRoot, node.specId, 'tasks.md'));
        item.command = { command: 'forge.spec.openFile', title: 'Open', arguments: [uri, node.task.line] };
        return item;
      }
      case 'file': {
        const uri = vscode.Uri.file(path.join(this.workspaceRoot, node.path));
        const item = new vscode.TreeItem(uri, None);
        item.label = node.path;
        item.command = { command: 'forge.spec.openFile', title: 'Open', arguments: [uri] };
        return item;
      }
      case 'convert': {
        const item = new vscode.TreeItem('No checkbox tasks: convert…', None);
        item.iconPath = new vscode.ThemeIcon('wand');
        item.command = { command: 'forge.spec.convert', title: 'Convert', arguments: [node] };
        return item;
      }
      case 'message':
        return new vscode.TreeItem(node.label, None);
    }
  }
}
