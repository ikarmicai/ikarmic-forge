import { readFile } from 'node:fs/promises';
import path from 'node:path';

import * as vscode from 'vscode';

import {
  SpecStore,
  convertToCheckboxes,
  isSafeSpecId,
  parseTasks,
  setTaskDone,
  slugifyTaskForSpecId,
  specDrift,
  splitSpecSections,
  syncSpecTask,
  type SpecSections,
} from '@ikarmic/forge-core';

import type { ForgeChatViewProvider } from '../chat/chat-view.js';

import { SpecController, type RunMode, type SpecResult } from './spec-controller.js';
import { dirtyDocsUnder } from './spec-paths.js';
import { SpecsTreeProvider } from './specs-tree.js';
import { TasksCodeLensProvider } from './tasks-codelens.js';
import { specsView, type SpecAction } from '../work/work-model.js';
import type { SpecFile, TreeNode } from './tree-model.js';
import { t } from '../l10n.js';

type TaskArg = { specId: string; taskId: string; title: string } | Extract<TreeNode, { kind: 'task' }>;

async function readLive(uri: vscode.Uri): Promise<string> {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  return open ? open.getText() : readFile(uri.fsPath, 'utf8');
}

/** Replace the whole document; save only if the user had no unsaved edits in it. */
async function writeLive(uri: vscode.Uri, text: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const wasDirty = doc.isDirty;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), text);
  await vscode.workspace.applyEdit(edit);
  if (!wasDirty) await doc.save();
}

function report(result: SpecResult): SpecResult {
  if (result.status === 'error') void vscode.window.showErrorMessage(t('Forge: {0}', result.error));
  if (result.status === 'ok' && result.warning) void vscode.window.showWarningMessage(t('Forge: {0}', result.warning));
  return result;
}

export function registerSpecs(context: vscode.ExtensionContext, chat: ForgeChatViewProvider): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return;
  const store = new SpecStore(root);
  // Ids come from tree nodes and command arguments; never build a path from an unsafe one.
  const safe = (id: string): string => {
    if (!isSafeSpecId(id)) throw new Error(`invalid spec id: ${id}`);
    return id;
  };
  const specUri = (specId: string, file: SpecFile) => vscode.Uri.file(path.join(store.rootPath(), safe(specId), file));
  const draftDir = (id: string) => path.join(store.rootPath(), '.drafts', safe(id));
  const lens = new TasksCodeLensProvider(store.rootPath());
  let echoNextGeneration = false;

  let tree: SpecsTreeProvider | undefined;
  const controller = new SpecController({
    store,
    isTrusted: () => vscode.workspace.isTrusted,
    isSafeSpecId,
    newSpecId: slugifyTaskForSpecId,
    splitSpecSections,
    parseTasks,
    setTaskDone,
    convertToCheckboxes,
    readSpecFile: (specId, file) => readLive(specUri(specId, file)),
    writeTasks: (specId, md) => writeLive(specUri(specId, 'tasks.md'), md),
    generateInChat: (task) => chat.runSpecGeneration(task, echoNextGeneration),
    runInChat: (prompt, label, mode) => chat.runSpecTask(prompt, label, mode),
    confirm: async (message, action) =>
      (await vscode.window.showWarningMessage(message, { modal: true }, action)) === action,
    onDidChange: () => {
      tree?.refresh();
      lens.refresh();
    },
    sync: {
      docs: (specId) => store.readDocs(specId),
      task: async (specId, docs) => {
        const spec = await store.get(specId);
        if (!spec) throw new Error(`Spec ${specId} not found.`);
        return syncSpecTask(spec, docs, await specDrift(root, spec, docs));
      },
      runInChat: (task, label) => chat.runSpecGeneration(task, label),
      review: (specId, before, after) => reviewSync(specId, before, after),
      write: async (specId, sections) => {
        await store.update(specId, sections);
      },
    },
  });

  /** Diff each changed document against the proposal, then ask once to apply them all. */
  const syncContent = new SyncProposalContent();
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(SYNC_SCHEME, syncContent));
  const reviewSync = async (specId: string, before: SpecSections, after: SpecSections): Promise<boolean> => {
    const opened: vscode.Uri[] = [];
    for (const file of ['requirements.md', 'design.md', 'tasks.md'] as const) {
      const key = file.replace('.md', '') as keyof SpecSections;
      if (before[key] === after[key]) continue;
      const right = syncContent.set(`${specId}/${file}`, after[key]);
      opened.push(right);
      await vscode.commands.executeCommand('vscode.diff', specUri(specId, file), right, t('{0} ↔ synced with code', `${specId}/${file}`), { preview: false });
    }
    const apply = t('Apply');
    const choice = await vscode.window.showInformationMessage(t('Update spec {0} to match the code? The current version is kept in its history folder.', specId), apply, t('Discard'));
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputTextDiff && opened.some((u) => u.toString() === (tab.input as vscode.TabInputTextDiff).modified.toString())) {
          await vscode.window.tabGroups.close(tab);
        }
      }
    }
    syncContent.clear();
    return choice === apply;
  };
  const specsTree = new SpecsTreeProvider(store, root, () => controller.running);
  tree = specsTree;

  // The chat panel lists and drives specs; every action goes through the same commands the palette uses.
  chat.setSpecsSource({
    load: async () => specsView(await specsTree.getChildren()),
    act: async (a: SpecAction) => {
      switch (a.action) {
        case 'generate':
          return void (await vscode.commands.executeCommand('forge.spec.generate'));
        case 'approve':
          return void (await vscode.commands.executeCommand('forge.spec.approve', { draftId: a.draftId }));
        case 'discard':
          return void (await vscode.commands.executeCommand('forge.spec.discard', { draftId: a.draftId }));
        case 'convert':
          return void (await vscode.commands.executeCommand('forge.spec.convert', { specId: a.specId }));
        case 'sync':
          return void (await vscode.commands.executeCommand('forge.spec.sync', { specId: a.specId }));
        case 'run':
          return void (await vscode.commands.executeCommand(a.current ? 'forge.spec.runTaskCurrent' : 'forge.spec.runTask', { specId: a.specId, taskId: a.taskId, title: a.title }));
        case 'open':
          return void (await vscode.commands.executeCommand('forge.spec.openFile', specUri(a.specId, 'tasks.md'), a.line));
        case 'openDraft':
          return void (await vscode.commands.executeCommand('forge.spec.openFile', vscode.Uri.file(path.join(draftDir(a.draftId), a.file))));
      }
    },
  });
  specsTree.onDidChangeTreeData(() => chat.workChanged('specs'));

  const generate = async (task: string, echo: boolean): Promise<void> => {
    echoNextGeneration = echo;
    const res = report(await controller.generateDraft(task));
    if (res.status === 'ok' && res.draftId) {
      await vscode.window.showTextDocument(vscode.Uri.file(path.join(draftDir(res.draftId), 'requirements.md')));
    }
  };
  const run = async (arg: TaskArg | undefined, mode: RunMode): Promise<void> => {
    if (!arg) return;
    const ref = 'task' in arg ? { specId: arg.specId, taskId: arg.task.id, title: arg.task.title } : arg;
    report(await controller.runTask(ref.specId, { id: ref.taskId, title: ref.title }, mode));
  };

  chat.setSpecHandler((task) => void generate(task, false));

  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '.forge/specs/**'));
  const onFs = () => {
    specsTree.refresh();
    lens.refresh();
  };
  watcher.onDidCreate(onFs);
  watcher.onDidChange(onFs);
  watcher.onDidDelete(onFs);

  const registerLens = () =>
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        { scheme: 'file', pattern: new vscode.RelativePattern(root, '.forge/specs/*/tasks.md') },
        lens
      )
    );
  if (vscode.workspace.isTrusted) registerLens();
  else context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(registerLens));

  context.subscriptions.push(
    watcher,
    vscode.commands.registerCommand('forge.spec.generate', async () => {
      const task = await vscode.window.showInputBox({ prompt: t('Describe the feature to spec'), ignoreFocusOut: true });
      if (task?.trim()) await generate(task.trim(), true);
    }),
    vscode.commands.registerCommand('forge.spec.approve', async (node?: { draftId?: string }) => {
      const id = node?.draftId;
      if (!id) return;
      if (!isSafeSpecId(id)) {
        void vscode.window.showErrorMessage(t('Forge: invalid spec id: {0}', id));
        return;
      }
      const docs = vscode.workspace.textDocuments.map((doc) => ({ path: doc.uri.fsPath, isDirty: doc.isDirty, doc }));
      for (const d of dirtyDocsUnder(draftDir(id), docs)) await d.doc.save();
      const res = report(await controller.approve(id));
      if (res.status === 'ok') await vscode.window.showTextDocument(specUri(id, 'tasks.md'));
    }),
    vscode.commands.registerCommand('forge.spec.discard', async (node?: { draftId?: string }) => {
      if (node?.draftId) report(await controller.discard(node.draftId));
    }),
    vscode.commands.registerCommand('forge.spec.runTask', (arg?: TaskArg) => run(arg, 'fresh')),
    vscode.commands.registerCommand('forge.spec.runTaskCurrent', (arg?: TaskArg) => run(arg, 'current')),
    vscode.commands.registerCommand('forge.spec.convert', async (node?: { specId?: string }) => {
      if (node?.specId) report(await controller.convertTasks(node.specId));
    }),
    vscode.commands.registerCommand('forge.spec.sync', async (node?: { specId?: string }) => {
      if (node?.specId) report(await controller.sync(node.specId));
    }),
    vscode.commands.registerCommand('forge.spec.openFile', async (uri: vscode.Uri, line?: number) => {
      const editor = await vscode.window.showTextDocument(uri);
      if (typeof line === 'number') {
        const pos = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      }
    }),
    vscode.commands.registerCommand('forge.spec.refresh', () => {
      onFs();
      vscode.window.setStatusBarMessage(t('Forge: specs refreshed.'), 3000);
    })
  );
}

const SYNC_SCHEME = 'forge-spec-sync';

/** The proposed documents of a spec sync, shown on the right of each diff. */
class SyncProposalContent implements vscode.TextDocumentContentProvider {
  private readonly docs = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  set(name: string, content: string): vscode.Uri {
    const uri = vscode.Uri.from({ scheme: SYNC_SCHEME, path: `/${name}` });
    this.docs.set(uri.path, content);
    this.emitter.fire(uri);
    return uri;
  }

  clear(): void {
    this.docs.clear();
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.docs.get(uri.path) ?? '';
  }
}

