/**
 * `--auto-commit`: commit the user's dirty work before a run, then what the
 * agent changed after it, with a message drafted by the cheap model (or the
 * main one). Always a no-op outside a git repo.
 */
import { afterRun, beforeRun, isGitRepo, loadForgeConfigFile, resolveModelAlias } from '@ikarmic/forge-core';
import type { ForgeCommit, GitCommitOptions, ModelConfig } from '@ikarmic/forge-core';
import type { CliOptions } from './options.js';

export interface GitWorkflow {
  /** Call before the agent starts. Returns the commit that saved your own changes, if any. */
  before(): Promise<ForgeCommit | null>;
  /** Call after a completed run. Returns the commit holding the agent's changes, if any. */
  after(task: string): Promise<ForgeCommit | null>;
}

export function gitCommitOptions(options: Pick<CliOptions, 'noAttribute' | 'gitCommitVerify'>): GitCommitOptions {
  return { attribute: !options.noAttribute, verify: options.gitCommitVerify };
}

/** Commit messages use the cheap model when one is configured, else the main model. */
export async function resolveCommitModel(options: Pick<CliOptions, 'cheapModel'>, model: ModelConfig): Promise<ModelConfig> {
  if (!options.cheapModel) return model;
  const { config } = await loadForgeConfigFile();
  return { ...model, ...resolveModelAlias(options.cheapModel, config.aliases, model.provider) };
}

export async function createGitWorkflow(
  options: Pick<CliOptions, 'autoCommit' | 'noDirtyCommits' | 'noAttribute' | 'gitCommitVerify' | 'cheapModel'> & { dryRun?: boolean },
  cwd: string,
  model: ModelConfig
): Promise<GitWorkflow | null> {
  if (!options.autoCommit || options.dryRun || !(await isGitRepo(cwd))) return null;
  const commitModel = await resolveCommitModel(options, model);
  const commitOptions = gitCommitOptions(options);
  let leftDirty: string[] = [];
  return {
    async before() {
      const state = await beforeRun(cwd, { ...commitOptions, dirtyCommits: !options.noDirtyCommits });
      leftDirty = state.leftDirty;
      return state.dirtyCommit;
    },
    after(task) {
      return afterRun(cwd, { leftDirty }, { ...commitOptions, model: commitModel, task });
    },
  };
}

export function formatCommitLine(commit: ForgeCommit): string {
  const first = commit.message.split('\n')[0] ?? '';
  return `committed ${commit.commit.slice(0, 7)} ${first} (${commit.files.length} file${commit.files.length === 1 ? '' : 's'})`;
}
