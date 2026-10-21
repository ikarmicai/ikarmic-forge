import * as vscode from 'vscode';

import {
  branchChangedFiles,
  branchDiff,
  deleteBranch,
  mergeBranch,
  runOrchestrator,
  WorktreeManager,
  type CredentialStore,
} from '@ikarmic/forge-core';

import { resolveModel } from '../config.js';
import { loadRuntimeConfig } from '../runtime-config.js';

import {
  applyProgress,
  finishRun,
  newRun,
  runCardView,
  runsToRestore,
  setMergeState,
  type BoardRun,
  type BoardStep,
  type RunCardView,
} from './agents-model.js';
import { t } from '../l10n.js';

const STATE_KEY = 'forge.agents.runs';
const MAX_RUNS = 20;

/** What the review/merge/discard commands receive (from forge.agents.stepAction). */
type StepNode = { run: BoardRun; step: BoardStep };

export function registerAgents(
  context: vscode.ExtensionContext,
  credentialStore?: CredentialStore,
  chat?: { showRun(view: RunCardView): void; setRunsProvider?(fn: () => RunCardView[]): void }
): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return;

  let runs: BoardRun[] = context.workspaceState.get<BoardRun[]>(STATE_KEY, []);
  // A run that was still going when the window closed can never finish now.
  runs = runs.map((r) => (r.status === 'running' || r.status === 'planning' ? finishRun(r, r.totalCostUsd, 'interrupted (window closed)') : r));

  const save = (): void => {
    runs = runs.slice(-MAX_RUNS);
    void context.workspaceState.update(STATE_KEY, runs);
  };
  const update = (id: string, f: (r: BoardRun) => BoardRun): void => {
    runs = runs.map((r) => (r.id === id ? f(r) : r));
    save();
    const run = runs.find((r) => r.id === id);
    if (run) chat?.showRun(runCardView(run));
  };

  const repoRoot = async (): Promise<string | null> => WorktreeManager.resolveRepoRoot(root);
  // Unmerged branches stay reachable after New chat, resume or a window reload.
  chat?.setRunsProvider?.(() => runsToRestore(runs).map(runCardView));

  context.subscriptions.push(
    vscode.commands.registerCommand('forge.agents.run', async () => {
      if (!vscode.workspace.isTrusted) {
        void vscode.window.showWarningMessage(t('Forge: parallel agents edit files, so they are disabled in untrusted workspaces.'));
        return;
      }
      const repo = await repoRoot();
      if (!repo) {
        void vscode.window.showErrorMessage(t('Forge: parallel agents need a git repository with at least one commit (each agent works in its own git worktree).'));
        return;
      }
      const task = (await vscode.window.showInputBox({ prompt: t('What should the agents work on?'), placeHolder: t('e.g. fix the failing auth tests and update the docs') }))?.trim();
      if (!task) return;
      const ok = await vscode.window.showWarningMessage(
        t('Run parallel agents?'),
        {
          modal: true,
          detail: t('A planner splits the task, and specialists run without asking for approval, each in its own git worktree. Their changes land on separate branches that you review and merge from the Parallel Agents view. Nothing touches your current branch until you merge.'),
        },
        'Run'
      );
      if (ok !== 'Run') return;

      let model;
      try {
        model = resolveModel(await loadRuntimeConfig(credentialStore));
      } catch (err) {
        void vscode.window.showErrorMessage(t('Forge: {0}', (err as Error).message));
        return;
      }

      const id = `run-${Date.now()}`;
      runs = [...runs, newRun(id, task)];
      save();
      void vscode.commands.executeCommand('forge.chatView.focus');
      const started = runs.find((r) => r.id === id);
      if (started) chat?.showRun(runCardView(started));
      try {
        const result = await runOrchestrator({
          task,
          model,
          cwd: repo,
          worktrees: 'always',
          commitChanges: true,
          cleanupBranches: true,
          onProgress: (event) => update(id, (r) => applyProgress(r, event)),
        });
        update(id, (r) => finishRun(r, result.costKnown ? result.totalCostUsd : undefined));
      } catch (err) {
        update(id, (r) => finishRun(r, undefined, (err as Error).message));
      }
    }),

    vscode.commands.registerCommand('forge.agents.review', async (node?: StepNode) => {
      const branch = node?.step.branch;
      if (!branch) return;
      const repo = await repoRoot();
      if (!repo) return;
      try {
        const diff = await branchDiff(repo, branch);
        const doc = await vscode.workspace.openTextDocument({ language: 'diff', content: diff || '(no changes)' });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch (err) {
        void vscode.window.showErrorMessage(t('Forge: could not read {0}: {1}', branch, (err as Error).message));
      }
    }),

    vscode.commands.registerCommand('forge.agents.merge', async (node?: StepNode) => {
      const branch = node?.step.branch;
      if (!branch) return;
      const repo = await repoRoot();
      if (!repo) return;
      const files = await branchChangedFiles(repo, branch).catch(() => node.step.changedFiles ?? []);
      const ok = await vscode.window.showWarningMessage(
        t('Merge {0} into the current branch?', branch),
        { modal: true, detail: `${files.length} file(s): ${files.slice(0, 8).join(', ')}${files.length > 8 ? ', ...' : ''}` },
        'Merge'
      );
      if (ok !== 'Merge') return;
      const res = await mergeBranch(repo, branch, `Merge ${branch}: ${node.step.task.slice(0, 60)}`);
      if (!res.ok) {
        void vscode.window.showErrorMessage(t('Forge: could not merge {0}. {1} Nothing was changed.', branch, res.message));
        return;
      }
      await deleteBranch(repo, branch).catch(() => undefined);
      update(node.run.id, (r) => setMergeState(r, branch, 'merged'));
      void vscode.window.showInformationMessage(t('Forge: merged {0}.', branch));
    }),

    vscode.commands.registerCommand('forge.agents.discard', async (node?: StepNode) => {
      const branch = node?.step.branch;
      if (!branch) return;
      const ok = await vscode.window.showWarningMessage(t('Discard {0}? Its changes are deleted.', branch), { modal: true }, 'Discard');
      if (ok !== 'Discard') return;
      const repo = await repoRoot();
      if (!repo) return;
      await deleteBranch(repo, branch).catch((err: Error) => void vscode.window.showErrorMessage(t('Forge: {0}', err.message)));
      update(node.run.id, (r) => setMergeState(r, branch, 'discarded'));
    }),

    vscode.commands.registerCommand('forge.agents.stepAction', async (runId: string, index: number, action: 'review' | 'merge' | 'discard') => {
      const run = runs.find((r) => r.id === runId);
      const step = run?.steps.find((s) => s.index === index);
      if (!run || !step) return;
      await vscode.commands.executeCommand(`forge.agents.${action}`, { kind: 'step', run, step });
    }),

    vscode.commands.registerCommand('forge.agents.clear', () => {
      const before = runs.length;
      runs = runs.filter((r) => r.status === 'running' || r.status === 'planning');
      save();
      vscode.window.setStatusBarMessage(t('Forge: cleared {0} finished runs.', before - runs.length), 3000);
    })
  );
}
