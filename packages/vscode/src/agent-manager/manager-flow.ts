/**
 * The Agent Manager's git steps: a worktree per session, its changes committed on the session branch when the run
 * ends, then merged into the workspace's branch or thrown away. Built on core's worktree and branch helpers.
 */
import { branchChangedFiles, commitAllInWorktree, deleteBranch, mergeBranch, WorktreeManager } from '@ikarmic/forge-core';

export interface SessionWorktree {
  path: string;
  branch: string;
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
