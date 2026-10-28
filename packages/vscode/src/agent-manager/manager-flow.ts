/**
 * The Agent Manager's git steps: a worktree per session, its changes committed on the session branch when the run
 * ends, then merged into the workspace's branch or thrown away. Built on core's worktree and branch helpers.
 */
import { execFile } from 'node:child_process';

import { branchChangedFiles, commitAllInWorktree, deleteBranch, mergeBranch, setupWorktree, WorktreeManager, type SetupOutcome } from '@ikarmic/forge-core';

export interface SessionWorktree {
  path: string;
  branch: string;
}

interface Inspected<T> {
  defaultValue?: T;
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
}

/**
 * The setup script and copy list from VS Code's `inspect()`. Only the user's own value counts (RB-12): both settings are
 * machine-scoped, and a workspace or folder value is ignored here as well, because a command that runs in every new
 * worktree must never come from a repository.
 */
export function setupSettingsFrom(script: Inspected<string> | undefined, files: Inspected<string[]> | undefined): { setupScript: string; copyFiles: string[] } {
  const text = script?.globalValue ?? script?.defaultValue;
  const list = files?.globalValue ?? files?.defaultValue;
  return {
    setupScript: typeof text === 'string' ? text.trim() : '',
    copyFiles: Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string' && p.trim() !== '').map((p) => p.trim()) : [],
  };
}

/** Copy the chosen files and run the setup script in a new worktree; the first failure ends it. */
export function prepareSetup(repoRoot: string, wt: SessionWorktree, settings: { setupScript: string; copyFiles: string[] }): Promise<SetupOutcome> {
  return setupWorktree(repoRoot, wt.path, { setupScript: settings.setupScript, copyFiles: settings.copyFiles });
}

/** Push the session branch to origin. Hooks the person's repository has for pushing run, as for any push they confirm. */
export function pushBranch(worktreePath: string, branch: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('git', ['push', '-u', '--', 'origin', branch], { cwd: worktreePath, timeout: 120_000, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, _out, stderr) => {
      if (!err) return resolve();
      const lines = String(stderr || err.message).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const own = lines.filter((l) => /^(fatal|error|remote: )/i.test(l));
      reject(new Error(`Could not push ${branch}: ${(own.length ? own.slice(-3) : lines.slice(-2)).join(' ').slice(0, 300)}`));
    });
  });
}

export async function prepareWorktree(repoRoot: string, label: string): Promise<SessionWorktree> {
  const info = await new WorktreeManager(repoRoot).create({ label });
  return { path: info.path, branch: info.branch };
}

/** Commit what the session left in its worktree and list every file its branch changes. */
export async function collectChanges(repoRoot: string, wt: SessionWorktree, prompt: string): Promise<string[]> {
  await commitAllInWorktree(wt.path, `Forge Agent Manager: ${prompt.split('\n')[0]!.slice(0, 72)}`);
  return branchChangedFiles(repoRoot, wt.branch);
}

/** Merge the session branch into the workspace's branch; on success the worktree and branch are removed. */
export async function mergeWorktree(repoRoot: string, wt: SessionWorktree, prompt: string): Promise<{ ok: true } | { ok: false; message: string }> {
  await commitAllInWorktree(wt.path, `Forge Agent Manager: ${prompt.split('\n')[0]!.slice(0, 72)}`);
  const merged = await mergeBranch(repoRoot, wt.branch, `Merge Forge session: ${prompt.split('\n')[0]!.slice(0, 60)}`);
  if (!merged.ok) return { ok: false, message: merged.message };
  await discardWorktree(repoRoot, wt);
  return { ok: true };
}

/** Remove the session's worktree and branch; the workspace is not touched. */
export async function discardWorktree(repoRoot: string, wt: SessionWorktree): Promise<void> {
  await new WorktreeManager(repoRoot).remove(wt.path, { force: true });
  await deleteBranch(repoRoot, wt.branch).catch(() => undefined);
}
