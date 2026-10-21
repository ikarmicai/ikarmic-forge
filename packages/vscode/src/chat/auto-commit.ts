/**
 * Auto-commit around an agent run: commit the user's own uncommitted work first
 * (so the agent's commit holds only the agent's changes), then what the agent
 * changed once the run completes. A no-op outside a git repository.
 */
import { afterRun, beforeRun, isGitRepo, type ForgeCommit, type ModelConfig } from '@ikarmic/forge-core';

export interface AutoCommitSettings {
  enabled: boolean;
  /** Commit the user's own uncommitted changes before the run. */
  dirtyCommits: boolean;
  /** Add " (forge)" to the commit author name. */
  attribute: boolean;
  /** Run git pre-commit hooks. */
  runHooks: boolean;
}

export interface AutoCommitRun {
  /** The commit that saved the user's own changes before the run, if there was one. */
  saved: ForgeCommit | null;
  /** Commit the agent's changes; null when it changed nothing. Never throws. */
  finish(task: string): Promise<ForgeCommit | null>;
}

/** Begin auto-commit for a run; null when it is off, or `cwd` is not a git repository. Never throws. */
export async function startAutoCommit(
  cwd: string,
  settings: AutoCommitSettings,
  commitModel: ModelConfig | undefined
): Promise<AutoCommitRun | null> {
  if (!settings.enabled || !(await isGitRepo(cwd))) return null;
  const options = { attribute: settings.attribute, verify: settings.runHooks };
  let leftDirty: string[] = [];
  let saved: ForgeCommit | null = null;
  try {
    const state = await beforeRun(cwd, { ...options, dirtyCommits: settings.dirtyCommits });
    saved = state.dirtyCommit;
    leftDirty = state.leftDirty;
  } catch {
    return null; // cannot touch the repository (locked index, hook failure): run without committing
  }
  return {
    saved,
    finish: (task) =>
      afterRun(cwd, { leftDirty }, { ...options, ...(commitModel ? { model: commitModel } : {}), task }).catch(() => null),
  };
}

/** `abc1234 feat: subject (3 files)`, for the chat. */
export function describeCommit(commit: ForgeCommit): string {
  const subject = commit.message.split('\n')[0] ?? '';
  return `${commit.commit.slice(0, 7)} ${subject} (${commit.files.length} file${commit.files.length === 1 ? '' : 's'})`;
}
