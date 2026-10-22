import * as path from 'node:path';

import * as vscode from 'vscode';

import {
  generateCommitMessage,
  checkStale,
  findProjectMemoryRoot,
  loadMemory,
  readMemoryFile,
  removeSection,
  writeMemoryFile,
  type CredentialStore,
} from '@ikarmic/forge-core';

import type { ForgeChatViewProvider } from './chat/chat-view.js';
import { resolveCheapModel } from './cheap-model.js';
import { buildCommitMessageInput } from './commit-message-input.js';
import { SettingsViewProvider, type SettingsViewOptions } from './settings/settings-view.js';
import { t } from './l10n.js';
import { ForgeCodeActions } from './editor/code-actions.js';
import { IMPROVE_INSTRUCTION, contextMention, explainTask, fixTask, terminalExplainTask, terminalFixTask } from './editor/editor-tasks.js';
import { INLINE_EDIT_SCHEME, InlineEditContent, runInlineEdit } from './editor/inline-edit.js';
import { buildMemoryItems, type MemoryItem } from './memory/memory-model.js';

/** The slice of the built-in Git extension's API this file uses (vscode.git exports no types we can import). */
interface GitApiLike {
  repositories: Array<{
    rootUri: vscode.Uri;
    inputBox: { value: string };
    state: { indexChanges: Array<{ uri: vscode.Uri }>; workingTreeChanges: Array<{ uri: vscode.Uri }> };
    diff(cached?: boolean): Promise<string>;
  }>;
}

/**
 * All command implementations for the Forge extension. Each command is a
 * thin wrapper that gathers user input (where needed) and delegates to the
 * chat view.
 */
export class CommandRegistry {
  private settingsView: SettingsViewProvider | undefined;
  private readonly inlineEditContent = new InlineEditContent();

  constructor(
    private readonly chat: ForgeChatViewProvider,
    private readonly credentialStore: CredentialStore,
    private readonly settingsOpts?: SettingsViewOptions
  ) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('forge.openChat', () => this.openChat()),
      vscode.commands.registerCommand('forge.runTask', () => this.runTask(false)),
      vscode.commands.registerCommand('forge.runTaskAuto', () => this.runTask(true)),
      vscode.commands.registerCommand('forge.runOnSelection', () => this.runOnSelection(false)),
      vscode.commands.registerCommand('forge.cancelTask', () => {
        const stopped = this.chat.cancel();
        vscode.window.setStatusBarMessage(stopped ? t('Forge: stopped.') : t('Forge: nothing is running.'), 3000);
      }),
      vscode.commands.registerCommand('forge.configureProvider', () => this.configureProvider()),
      vscode.commands.registerCommand('forge.openMemory', () => this.openMemory()),
      vscode.commands.registerCommand('forge.generateCommitMessage', (scm?: { rootUri?: vscode.Uri }) => this.generateCommitMessage(scm)),
      vscode.commands.registerCommand('forge.manageMemory', () => this.manageMemory()),
      vscode.commands.registerCommand('forge.startVoiceInput', () => this.chat.toggleVoice()),
      vscode.commands.registerCommand('forge.openSettings', () => this.openSettings()),
      vscode.commands.registerCommand('forge.inlineEdit', () => runInlineEdit(this.credentialStore, this.inlineEditContent)),
      vscode.commands.registerCommand('forge.explainSelection', () => this.explainSelection()),
      vscode.commands.registerCommand('forge.addToContext', () => this.addToContext()),
      vscode.commands.registerCommand('forge.improveSelection', () => runInlineEdit(this.credentialStore, this.inlineEditContent, { instruction: IMPROVE_INSTRUCTION })),
      vscode.commands.registerCommand('forge.terminalExplain', () => this.terminalTask('explain')),
      vscode.commands.registerCommand('forge.terminalFix', () => this.terminalTask('fix')),
      vscode.commands.registerCommand('forge.fixDiagnostic', (uri: vscode.Uri, range: vscode.Range, message: string, source?: string, code?: string) =>
        this.fixDiagnostic(uri, range, message, source, code)
      ),
      vscode.workspace.registerTextDocumentContentProvider(INLINE_EDIT_SCHEME, this.inlineEditContent),
      vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, new ForgeCodeActions(), {
        providedCodeActionKinds: ForgeCodeActions.kinds,
      })
    );
  }

  /**
   * Draft a commit message for the repository's staged changes (or, with nothing staged, its working
   * changes) and put it in the Source Control message box. Falls back to a file-list message when no
   * model is available or the call fails (core's generateCommitMessage never throws).
   */
  private async generateCommitMessage(scm?: { rootUri?: vscode.Uri }): Promise<void> {
    const api = vscode.extensions.getExtension<{ getAPI(version: 1): GitApiLike }>('vscode.git')?.exports?.getAPI(1);
    const repo = api?.repositories.find((r) => scm?.rootUri && r.rootUri.fsPath === scm.rootUri.fsPath) ?? api?.repositories[0];
    if (!repo) {
      void vscode.window.showInformationMessage(t('Forge: no Git repository found.'));
      return;
    }
    await vscode.window.withProgress({ location: vscode.ProgressLocation.SourceControl }, async () => {
      const [staged, working] = await Promise.all([repo.diff(true), repo.diff(false)]);
      const relative = (changes: Array<{ uri: vscode.Uri }>): string[] => [...new Set(changes.map((c) => path.relative(repo.rootUri.fsPath, c.uri.fsPath)))];
      const stagedFiles = relative(repo.state.indexChanges);
      const workingFiles = relative(repo.state.workingTreeChanges);
      if (stagedFiles.length === 0 && workingFiles.length === 0 && !staged.trim() && !working.trim()) {
        void vscode.window.showInformationMessage(t('Forge: there are no changes to describe.'));
        return;
      }
      const input = buildCommitMessageInput(stagedFiles, workingFiles, staged, working);
      repo.inputBox.value = await generateCommitMessage(
        input.diff,
        input.files,
        await resolveCheapModel(this.credentialStore),
        undefined,
        undefined,
        vscode.workspace.getConfiguration('forge').get<string>('commitMessage.prompt') || undefined
      );
    });
  }

  private openSettings(): void {
    if (!this.settingsView) {
      this.settingsView = new SettingsViewProvider(this.credentialStore, this.settingsOpts);
    }
    this.settingsView.open();
  }

  /**
   * List every memory section (project and global) with its type, date and any
   * stale-ref warning; open its file or delete it. Edits happen in the markdown.
   */
  private async manageMemory(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      void vscode.window.showWarningMessage(t('Forge: open a workspace folder first.'));
      return;
    }
    const cwd = folders[0]!.uri.fsPath;
    const loaded = await loadMemory(cwd);
    if (loaded.sections.length === 0) {
      void vscode.window.showInformationMessage(t('Forge: no memory found.'));
      return;
    }
    const stale = await checkStale(loaded.sections, (await findProjectMemoryRoot(cwd)) ?? cwd);
    const pick = await vscode.window.showQuickPick(
      buildMemoryItems(loaded, stale).map((item) => ({
        label: item.heading,
        description: `${item.scope} · ${item.description}`,
        ...(item.detail ? { detail: item.detail } : {}),
        item,
      })),
      { placeHolder: t('Forge: pick a memory section'), matchOnDescription: true }
    );
    if (!pick) return;
    const action = await vscode.window.showQuickPick([t('Open file'), t('Delete')], { placeHolder: pick.item.heading });
    if (action === t('Open file')) {
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(pick.item.source)));
    } else if (action === t('Delete')) {
      await this.deleteMemorySection(pick.item);
    }
  }

  private async deleteMemorySection(item: MemoryItem): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(t('Delete "{0}" from memory?', item.heading), { modal: true }, t('Delete'));
    if (confirm !== t('Delete')) return;
    const { content, removed } = removeSection(await readMemoryFile(item.source), item.heading);
    if (!removed) return;
    await writeMemoryFile(item.source, content);
    void vscode.window.showInformationMessage(t('Forge: removed "{0}" from memory.', item.heading));
  }

  private async openChat(): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.forge');
    await vscode.commands.executeCommand('forge.chatView.focus');
  }

  /**
   * Open the project's `.forge/MEMORY.md` in an editor tab. If the file
   * doesn't exist yet, prompt the user to create it (and seed it with the
   * default section headings).
   */
  private async openMemory(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      void vscode.window.showWarningMessage(t('Forge: open a workspace folder first.'));
      return;
    }
    const root = folders[0]!.uri.fsPath;
    const memoryPath = vscode.Uri.file(`${root}/.forge/MEMORY.md`);
    try {
      await vscode.workspace.fs.stat(memoryPath);
    } catch {
      // File missing: offer to create it with a starter template.
      const choice = await vscode.window.showInformationMessage(
        t('Forge: no `.forge/MEMORY.md` yet: create one with a starter template?'),
        { modal: false },
        'Create'
      );
      if (choice !== 'Create') return;
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(`${root}/.forge`));
      await vscode.workspace.fs.writeFile(
        memoryPath,
        Buffer.from(
          '# Project Memory\n\n' +
            'Sections added here are auto-loaded into every Forge session ' +
            'as part of the system prompt. Use it to record build commands, ' +
            'code style, deployment steps, and any other project convention ' +
            "the agent should remember.\n\n" +
            '## Build commands\n\n' +
            '_Replace this with your actual commands._\n\n' +
            '## Code style\n\n' +
            '_Replace this with your conventions._\n\n' +
            '## Deployment\n\n' +
            '_Replace this with how this project ships._\n',
          'utf8'
        )
      );
    }
    await vscode.window.showTextDocument(memoryPath);
  }

  private async runTask(auto: boolean): Promise<void> {
    await this.openChat();
    const task = await vscode.window.showInputBox({
      prompt: t('What should Forge do?'),
      placeHolder: t('e.g. refactor src/index.ts to use async/await'),
      ignoreFocusOut: true,
    });
    if (!task) return;
    await this.chat.runTask(task, auto);
  }

  private async runOnSelection(auto: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage(t('Forge: open a file and select some code first.'));
      return;
    }
    const selection = editor.selection;
    if (selection.isEmpty) {
      void vscode.window.showWarningMessage(t('Forge: select the code you want to work on.'));
      return;
    }
    const selectedText = editor.document.getText(selection);
    const lang = editor.document.languageId;
    const file = vscode.workspace.asRelativePath(editor.document.uri);

    await this.openChat();
    const task = await vscode.window.showInputBox({
      prompt: `What should Forge do with this ${lang} code from ${file}?`,
      placeHolder: t('e.g. add error handling, write tests, explain what it does'),
      ignoreFocusOut: true,
    });
    if (!task) return;
    const composed = `${task}\n\nFile: ${file}\nLanguage: ${lang}\n\`\`\`${lang}\n${selectedText}\n\`\`\``;
    await this.chat.runTask(composed, auto);
  }

  /** "Fix with Forge" from the light bulb: the problem and the code around it go to the chat. */
  private async fixDiagnostic(uri: vscode.Uri, range: vscode.Range, message: string, source?: string, code?: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);
    const first = Math.max(0, range.start.line - 10);
    const last = Math.min(doc.lineCount - 1, range.end.line + 10);
    const excerpt = Array.from({ length: last - first + 1 }, (_, i) => `${first + i + 1}: ${doc.lineAt(first + i).text}`).join('\n');
    const file = vscode.workspace.asRelativePath(uri);
    const task = fixTask(
      { message, line: range.start.line + 1, ...(source ? { source } : {}), ...(code ? { code } : {}) },
      file,
      doc.languageId,
      excerpt
    );
    await this.chat.runFromEditor(t('Fix {0}:{1}: {2}', file, range.start.line + 1, message.split('\n')[0]!), task);
  }

  /** "Explain with Forge": the selection goes to the chat in Ask mode, which cannot edit files. */
  private async explainSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      void vscode.window.showWarningMessage(t('Forge: select the code you want to work on.'));
      return;
    }
    const file = vscode.workspace.asRelativePath(editor.document.uri);
    const start = editor.selection.start.line + 1;
    const task = explainTask(file, editor.document.languageId, editor.document.getText(editor.selection), start);
    await this.chat.runFromEditor(t('Explain {0}:{1}', file, start), task, 'ask');
  }

  /** "Add to Forge context": the file, or the selected lines of it, as an @ mention in the message box. */
  private async addToContext(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      void vscode.window.showWarningMessage(t('Forge: open a file to add it to the chat.'));
      return;
    }
    const file = vscode.workspace.asRelativePath(editor.document.uri);
    const sel = editor.selection;
    // A selection that ends at the start of a line does not include that line.
    const endLine = sel.end.character === 0 && sel.end.line > sel.start.line ? sel.end.line : sel.end.line + 1;
    await this.chat.addToComposer(contextMention(file, sel.isEmpty ? undefined : { startLine: sel.start.line + 1, endLine }));
  }

  /** The text selected in the integrated terminal, read through the clipboard (which is put back afterwards). */
  private async terminalSelection(): Promise<string> {
    const marker = `forge-no-selection-${Date.now()}`;
    const previous = await vscode.env.clipboard.readText();
    await vscode.env.clipboard.writeText(marker);
    try {
      await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
      const text = await vscode.env.clipboard.readText();
      return text === marker ? '' : text;
    } finally {
      await vscode.env.clipboard.writeText(previous);
    }
  }

  /** "Explain / Fix terminal output": the selected terminal text goes to the chat (Explain in Ask mode, which cannot edit). */
  private async terminalTask(kind: 'explain' | 'fix'): Promise<void> {
    const text = (await this.terminalSelection()).trim();
    if (!text) {
      void vscode.window.showWarningMessage(t('Forge: select the terminal text you want to work on.'));
      return;
    }
    if (kind === 'explain') await this.chat.runFromEditor(t('Explain terminal output'), terminalExplainTask(text), 'ask');
    else await this.chat.runFromEditor(t('Fix terminal error'), terminalFixTask(text));
  }

  cancel(): void {
    // The chat view owns the abort controller. Forward the request.
    void this.chat.cancel();
  }

  private async configureProvider(): Promise<void> {
    const action = await vscode.window.showInformationMessage(
      t('Configure Forge in Settings: provider, model, and API keys (or use environment variables).'),
      'Open Settings',
      'Copy .env template'
    );
    if (action === 'Open Settings') {
      this.openSettings();
    } else if (action === 'Copy .env template') {
      const envExample = `# Set at least one provider key\nOPENAI_API_KEY=\nANTHROPIC_API_KEY=\nGOOGLE_GENERATIVE_AI_API_KEY=\n`;
      await vscode.env.clipboard.writeText(envExample);
      void vscode.window.showInformationMessage(t('Forge: .env template copied to clipboard.'));
    }
  }
}
