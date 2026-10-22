/**
 * `/review [staged | unstaged | last | branch [base]]`: the pure parts of a local code review. The chat view runs
 * git and reads `REVIEW.md`; this module decides which diff to take and what to ask the model. vscode-free.
 */
export type ReviewScope = { scope: 'uncommitted' | 'staged' | 'unstaged' | 'last' | 'branch'; base?: string };

const CHOICES = 'staged, unstaged, last, or branch [base] (no argument reviews all uncommitted changes)';
const MAX_DIFF_CHARS = 60_000;

export function parseReviewScope(args: string): ReviewScope | { error: string } {
  const [word = '', base] = args.trim().split(/\s+/);
  switch (word.toLowerCase()) {
    case '':
    case 'uncommitted':
      return { scope: 'uncommitted' };
    case 'staged':
    case 'unstaged':
    case 'last':
      return { scope: word.toLowerCase() as 'staged' | 'unstaged' | 'last' };
    case 'branch':
      if (base && (base.startsWith('-') || !/^[\w./@^~-]+$/.test(base))) return { error: `"${base}" is not a usable base. Use a branch name, for example /review branch main.` };
      return base ? { scope: 'branch', base } : { scope: 'branch' };
    default:
      return { error: `Unknown review scope "${word}". Choose ${CHOICES}.` };
  }
}

/** The arguments for `git`; `defaultBase` is the branch `branch` compares against when none was named. */
export function reviewDiffArgs(s: ReviewScope, defaultBase = 'main'): string[] {
  switch (s.scope) {
    case 'staged':
      return ['diff', '--cached'];
    case 'unstaged':
      return ['diff'];
    case 'last':
      return ['diff', 'HEAD~1', 'HEAD'];
    case 'branch':
      return ['diff', `${s.base ?? defaultBase}...HEAD`];
    default:
      return ['diff', 'HEAD'];
  }
}

export function reviewScopeLabel(s: ReviewScope, defaultBase = 'main'): string {
  switch (s.scope) {
    case 'staged':
      return 'staged changes';
    case 'unstaged':
      return 'unstaged changes';
    case 'last':
      return 'the last commit';
    case 'branch':
      return `this branch against ${s.base ?? defaultBase}`;
    default:
      return 'all uncommitted changes';
  }
}

/** The message sent to the model, or undefined when the diff is empty. */
export function buildReviewPrompt(input: { diff: string; scopeLabel: string; rules?: string }): string | undefined {
  if (!input.diff.trim()) return undefined;
  const diff = input.diff.length > MAX_DIFF_CHARS ? `${input.diff.slice(0, MAX_DIFF_CHARS)}\n[diff truncated]` : input.diff;
  const rules = input.rules?.trim();
  return [
    `Review ${input.scopeLabel}. Look for bugs, missed edge cases, unsafe or insecure code, and missing tests. Name the file and line for each finding, say how serious it is, and suggest the fix. Do not rewrite code that is fine, and do not edit any file.`,
    rules ? `The project's review rules (REVIEW.md):\n${rules}` : '',
    `<diff>\n${diff}\n</diff>`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
