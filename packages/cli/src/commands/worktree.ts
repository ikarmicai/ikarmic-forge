/**
 * `forge worktree …` CLI subcommand. v2.11 + v2.14.
 *
 *   forge worktree list: show active worktrees
 *   forge worktree cleanup [--with-branches|--no-branches] [-f]
 *: remove all (confirms)
 *   forge worktree cleanup --force: remove without confirm
 *   forge worktree prune: orphan worktrees only
 *   forge worktree sweep  [--force]: remove orphans + delete
 *                                                         their auto-branches
 *
 * v2.14: cleanup now also deletes the auto-created branches by
 * default (pass `--no-branches` to keep them). The new `sweep`
 * subcommand is the one-shot "I'm done with this repo" cleanup: 
 * orphans get their branches deleted too.
 *
 * Mirrors the soft-prefix pattern of the other CLI subcommands: 
 * doesn't need an AI provider.
 */

import { WorktreeManager } from '@ikarmic/forge-core';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import type { ParsedWorktreeCommand } from '../options.js';

export async function handleWorktreeCommand(
  cmd: ParsedWorktreeCommand,
  cwd: string
): Promise<number> {
  const repoRoot = await WorktreeManager.resolveRepoRoot(cwd);
  if (!repoRoot) {
    process.stderr.write(
      `forge worktree: ${cwd} is not inside a git repository. Nothing to manage.\n`
    );
    return 1;
  }
  const manager = new WorktreeManager(repoRoot);

  if (cmd.list) {
    return printWorktreeList(manager, repoRoot);
  }
  if (cmd.cleanup) {
    return cleanupWorktrees(
      manager,
      repoRoot,
      cmd.cleanup.force,
      cmd.cleanup.withBranches
    );
  }
  if (cmd.sweep) {
    return sweepWorktrees(manager, repoRoot, cmd.sweep.force);
  }
  if (cmd.prune) {
    const pruned = await manager.pruneStale();
    process.stdout.write(`Pruned ${pruned} orphan worktree${pruned === 1 ? '' : 's'}.\n`);
    return 0;
  }

  // Soft-prefix matched but no recognized subcommand.
  process.stderr.write(
    'forge worktree: expected one of list | cleanup | prune | sweep. Try `forge worktree --help`.\n'
  );
  return 2;
}

async function printWorktreeList(
  manager: WorktreeManager,
  repoRoot: string
): Promise<number> {
  const worktrees = await manager.list();
  if (worktrees.length === 0) {
    process.stdout.write(`No active worktrees under ${manager.worktreesDirectory}\n`);
    return 0;
  }
  process.stdout.write(`Worktrees under ${manager.worktreesDirectory} (repo: ${repoRoot}):\n`);
  // Pad to a sensible width.
  const labelWidth = Math.max(8, ...worktrees.map((w) => w.label.length));
  const branchWidth = Math.max(6, ...worktrees.map((w) => w.branch.length));
  for (const w of worktrees) {
    process.stdout.write(
      `  ${w.label.padEnd(labelWidth)}  ${w.branch.padEnd(branchWidth)}  ${w.commit.slice(0, 7)}  ${w.path}\n`
    );
  }
  return 0;
}

async function cleanupWorktrees(
  manager: WorktreeManager,
  repoRoot: string,
  force: boolean,
  withBranches: boolean
): Promise<number> {
  const worktrees = await manager.list();
  if (worktrees.length === 0) {
    process.stdout.write(`No active worktrees under ${manager.worktreesDirectory}\n`);
    return 0;
  }
  // Confirm before destructive action (unless --force).
  if (!force && output.isTTY) {
    const branchNote = withBranches
      ? ' and their auto-created branches'
      : ' (keeping their auto-created branches; pass --with-branches to delete them too)';
    process.stdout.write(
      `About to remove ${worktrees.length} worktree${worktrees.length === 1 ? '' : 's'} under ${manager.worktreesDirectory} (repo: ${repoRoot})${branchNote}:\n`
    );
    for (const w of worktrees) {
      process.stdout.write(`  - ${w.label}  (${w.branch})  ${w.path}\n`);
    }
    const rl = createInterface({ input, output });
    try {
      const answer = (await rl.question('Proceed? [y/N] ')).trim().toLowerCase();
      if (answer !== 'y' && answer !== 'yes') {
        process.stdout.write('Aborted.\n');
        return 1;
      }
    } finally {
      rl.close();
    }
  } else if (!force) {
    // No TTY and no --force: refuse to bulk-delete without confirmation.
    process.stderr.write(
      'forge worktree cleanup: refusing to remove without confirmation (no TTY). Pass --force to override.\n'
    );
    return 2;
  }

  let removed = 0;
  let branchesDeleted = 0;
  let failed = 0;
  for (const w of worktrees) {
    try {
      // For cleanup we use the public list() output: we don't have
      // the path stored in `owned` from this process. That's fine:
      // any `forge/...` branch on disk IS ours by convention, so we
      // ask the manager to check for other users via
      // deleteBranchIfOrphan and only delete when safe.
      await manager.remove(w.path, { force: true });
      removed++;
      if (withBranches && w.branch && w.branch !== '(detached)') {
        const ok = await manager.deleteBranchIfOrphan(w.branch);
        if (ok) branchesDeleted++;
      }
    } catch (err) {
      failed++;
      process.stderr.write(
        `forge worktree: failed to remove ${w.path}: ${(err as Error).message}\n`
      );
    }
  }
  const branchSummary = withBranches
    ? `, ${branchesDeleted} branch${branchesDeleted === 1 ? '' : 'es'} deleted`
    : '';
  process.stdout.write(
    `Removed ${removed} worktree${removed === 1 ? '' : 's'}${branchSummary}${failed > 0 ? `, ${failed} failed` : ''}.\n`
  );
  return failed > 0 ? 1 : 0;
}

/**
 * v2.14: "I'm done" cleanup. Removes worktrees, deletes their
 * auto-created branches, AND sweeps up any `forge/*` branch left
 * over with no worktree at all (a manually-deleted worktree folder,
 * or leftovers from an older Forge version): `cleanup` only handles
 * the first two.
 *
 * Prompts for confirmation the same way `cleanup` does unless
 * `--force` is passed: this deletes branches, which is a step
 * further than `cleanup`'s default, so it gets no less scrutiny.
 * `deleteBranchIfOrphan` (used throughout) refuses to delete anything
 * with commits not already reachable from HEAD, so this can't destroy
 * unmerged work even with `--force`.
 */
async function sweepWorktrees(
  manager: WorktreeManager,
  repoRoot: string,
  force: boolean
): Promise<number> {
  const worktrees = await manager.list();

  if (worktrees.length > 0) {
    if (!force && output.isTTY) {
      process.stdout.write(
        `About to remove ${worktrees.length} worktree${worktrees.length === 1 ? '' : 's'} under ${manager.worktreesDirectory} (repo: ${repoRoot}) and their auto-created branches (anything with unmerged commits is left alone):\n`
      );
      for (const w of worktrees) {
        process.stdout.write(`  - ${w.label}  (${w.branch})  ${w.path}\n`);
      }
      const rl = createInterface({ input, output });
      try {
        const answer = (await rl.question('Proceed? [y/N] ')).trim().toLowerCase();
        if (answer !== 'y' && answer !== 'yes') {
          process.stdout.write('Aborted.\n');
          return 1;
        }
      } finally {
        rl.close();
      }
    } else if (!force) {
      process.stderr.write(
        'forge worktree sweep: refusing to run without --force on a non-TTY input.\n'
      );
      return 2;
    }
  }

  let removed = 0;
  let branchesDeleted = 0;
  let failed = 0;
  for (const w of worktrees) {
    try {
      await manager.remove(w.path, { force: true });
      removed++;
      if (w.branch && w.branch !== '(detached)') {
        const ok = await manager.deleteBranchIfOrphan(w.branch);
        if (ok) branchesDeleted++;
      }
    } catch (err) {
      failed++;
      process.stderr.write(
        `forge worktree sweep: failed to remove ${w.path}: ${(err as Error).message}\n`
      );
    }
  }
  // Branches with no worktree left at all (cleanup/removal above only
  // handles branches still attached to a worktree entry).
  branchesDeleted += await manager.pruneOrphanBranches();

  process.stdout.write(
    `Swept ${removed} worktree${removed === 1 ? '' : 's'}, ${branchesDeleted} branch${branchesDeleted === 1 ? '' : 'es'} deleted${failed > 0 ? `, ${failed} failed` : ''}.\n`
  );
  return failed > 0 ? 1 : 0;
}
