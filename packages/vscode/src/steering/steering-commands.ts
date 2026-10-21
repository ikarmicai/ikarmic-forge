import { mkdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import * as vscode from 'vscode';

import { isSafeSteeringName, loadSteering, overrideFilePath, setSteeringDisabled, type SteeringInclusion } from '@ikarmic/forge-core';

import type { ForgeChatViewProvider } from '../chat/chat-view.js';
import { steeringView, type SteeringAction } from '../work/work-model.js';

import { scaffoldSteering, toggleAction, type SteeringNode } from './steering-model.js';
import { SteeringTreeProvider } from './steering-tree.js';
import { t } from '../l10n.js';

type DocNode = Extract<SteeringNode, { kind: 'doc' }>;

export function registerSteering(context: vscode.ExtensionContext, chat: ForgeChatViewProvider): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return;
  const tree = new SteeringTreeProvider(root);
  const onChange = () => tree.refresh();

  // The chat panel lists steering and drives it through the same commands the palette uses.
  chat.setSteeringSource({
    load: async () => steeringView(await tree.getChildren()),
    act: async (a: SteeringAction) => {
      if (a.action === 'new') return void (await vscode.commands.executeCommand('forge.steering.new'));
      const { docs } = await loadSteering(root, { includeProject: vscode.workspace.isTrusted });
      const doc = docs.find((d) => d.name === a.name && d.source.kind === a.source);
      if (!doc) return;
      const node: DocNode = { kind: 'doc', doc, description: '' };
      await vscode.commands.executeCommand(a.action === 'toggle' ? 'forge.steering.toggle' : 'forge.steering.open', node);
    },
  });
  tree.onDidChangeTreeData(() => chat.workChanged('steering'));

  // A watcher on a folder that doesn't exist yet never fires, so create the global ones up front.
  const globalDir = path.join(homedir(), '.forge', 'steering');
  const overrideDir = path.dirname(overrideFilePath(root));
  for (const dir of [globalDir, overrideDir]) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // Unwritable home: the manual Refresh command still works.
    }
  }

  const watchers = [
    vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '.forge/steering/*.md')),
    vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(globalDir), '*.md')
    ),
    vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(overrideDir), '*.json')),
  ];
  for (const w of watchers) {
    w.onDidCreate(onChange);
    w.onDidChange(onChange);
    w.onDidDelete(onChange);
  }

  context.subscriptions.push(
    ...watchers,
    vscode.workspace.onDidGrantWorkspaceTrust(onChange),
    vscode.commands.registerCommand('forge.steering.new', async () => {
      const name = await vscode.window.showInputBox({
        prompt: t('Steering file name (letters, digits, . _ -)'),
        validateInput: (v) => (isSafeSteeringName(v.trim()) ? undefined : 'Use letters, digits, . _ - (start with a letter or digit)'),
      });
      if (!name) return;
      const pick = await vscode.window.showQuickPick(
        [
          { label: 'always', description: 'Every new conversation' },
          { label: 'fileMatch', description: 'When a matching file is active, named, or touched by the agent' },
          { label: 'manual', description: 'Only when a message contains #name' },
        ],
        { placeHolder: t('When should this steering apply?') }
      );
      if (!pick) return;
      const inclusion = pick.label as SteeringInclusion;
      let pattern: string | undefined;
      if (inclusion === 'fileMatch') {
        pattern = (await vscode.window.showInputBox({ prompt: t('File pattern, e.g. **/*.test.ts or *.tsx'), value: '**/*.test.ts' }))?.trim();
        if (!pattern) return;
      }
      const file = path.join(root, '.forge', 'steering', `${name.trim()}.md`);
      try {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, scaffoldSteering(name.trim(), inclusion, pattern), { encoding: 'utf8', flag: 'wx' });
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        void vscode.window.showErrorMessage(
          code === 'EEXIST' ? `Forge: steering "${name.trim()}" already exists.` : `Forge: ${(err as Error).message}`
        );
        return;
      }
      await vscode.window.showTextDocument(vscode.Uri.file(file));
      tree.refresh();
    }),
    vscode.commands.registerCommand('forge.steering.toggle', async (node?: DocNode) => {
      if (!node || node.kind !== 'doc') return;
      if (toggleAction(node.doc) === 'editFile') {
        void vscode.window.showInformationMessage(
          t('Forge: "{0}" is disabled by "enabled: false" in the file. Remove that line to enable it.', node.doc.name)
        );
        await vscode.window.showTextDocument(vscode.Uri.file(node.doc.source.path));
        return;
      }
      try {
        await setSteeringDisabled(root, node.doc.name, node.doc.enabled);
      } catch (err) {
        void vscode.window.showErrorMessage(t('Forge: {0}', (err as Error).message));
      }
      tree.refresh();
    }),
    vscode.commands.registerCommand('forge.steering.open', async (node?: DocNode) => {
      if (node?.kind === 'doc') await vscode.window.showTextDocument(vscode.Uri.file(node.doc.source.path));
    }),
    vscode.commands.registerCommand('forge.steering.refresh', () => {
      onChange();
      vscode.window.setStatusBarMessage(t('Forge: steering refreshed.'), 3000);
    })
  );
}
