/**
 * What the Source Control "Generate commit message" command sends to the model. vscode-free so it is
 * unit-testable; commands.ts reads the repository and shows the result.
 */

/** Longest diff sent to the model, in characters; a larger one is cut so a huge change cannot flood the prompt. */
export const MAX_DIFF_CHARS = 40_000;

export interface CommitMessageInput {
  diff: string;
  files: string[];
}

/**
 * The staged diff and staged files when anything is staged (that is what a commit will contain),
 * otherwise the working-tree diff and files, with the diff capped at MAX_DIFF_CHARS.
 */
export function buildCommitMessageInput(stagedFiles: string[], workingFiles: string[], stagedDiff: string, workingDiff: string): CommitMessageInput {
  const staged = stagedDiff.trim() !== '';
  const chosen = staged ? stagedDiff : workingDiff.trim() ? workingDiff : '';
  const diff = chosen.length > MAX_DIFF_CHARS ? `${chosen.slice(0, MAX_DIFF_CHARS)}\n[diff truncated: ${chosen.length - MAX_DIFF_CHARS} more characters not shown]` : chosen;
  return { diff, files: staged ? stagedFiles : workingFiles };
}
