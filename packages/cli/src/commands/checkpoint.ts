/**
 * `forge checkpoint …` subcommand: list / show / restore / prune
 * the per-turn file snapshots the agent captures automatically.
 *
 * Mirrors the other soft-prefix subcommands (`session`, `skill`,
 * `hook`, `mcp`): no AI provider required, exits 0/1/2.
 */

import process from 'node:process';

import {
  CheckpointStore,
  compareWorktreeContexts,
  defaultSessionDir,
  listSessions,
  snapshotWorktreeContext,
  type Checkpoint,
  humanize,
  toolLabel,
} from '@ikarmic/forge-core';

import type { ParsedCheckpointCommand } from '../options.js';
import { sessionCheckpointStore } from '../session-checkpoints.js';

export async function handleCheckpointCommand(
  cmd: ParsedCheckpointCommand,
  cwd: string
): Promise<number> {
  // Checkpoints are per-session (`<sessions>/<id>/checkpoints`). Without
  // --session, default to the most recently updated session.
  const sessionsDir = defaultSessionDir();
  const sessionId = cmd.sessionId ?? (await listSessions(sessionsDir))[0]?.id;
  if (!sessionId) {
    process.stdout.write('(no sessions found: checkpoints appear after the first file-mutating tool call)\n');
    return 0;
  }
  const store = sessionCheckpointStore(sessionsDir, sessionId, cwd);

  if (cmd.list) {
    return listCheckpoints(store, cmd.list.limit ?? undefined);
  }
  if (cmd.show) {
    return showCheckpoint(store, cmd.show.id);
  }
  if (cmd.restore) {
    return restoreCheckpoint(store, cmd.restore.id, cmd.restore.yes);
  }
  if (cmd.prune) {
    return pruneCheckpoints(store, cmd.prune.keep ?? undefined);
  }
  process.stderr.write(
    'forge checkpoint: expected one of list|show|restore|prune. Try `forge checkpoint --help` (not yet implemented; read the README).\n'
  );
  return 2;
}

async function listCheckpoints(store: CheckpointStore, limit?: number): Promise<number> {
  const all = await store.list();
  const items = typeof limit === 'number' ? all.slice(-limit) : all;
  if (items.length === 0) {
    process.stdout.write(
      '(no checkpoints found: they appear after the first file-mutating tool call)\n'
    );
    return 0;
  }
  process.stdout.write('id                       turn  cause            files  size       when\n');
  process.stdout.write('────────────────────────────────────────────────────────────────────\n');
  for (const cp of items) {
    const id = cp.id.length > 24 ? cp.id.slice(0, 23) + '…' : cp.id.padEnd(24);
    const turn = String(cp.turnIndex).padEnd(5);
    const trigger = humanize(cp.trigger).padEnd(15);
    const files = String(cp.fileCount).padEnd(6);
    const size = formatBytes(cp.totalBytes).padEnd(10);
    const when = cp.createdAt.replace('T', ' ').slice(0, 19);
    process.stdout.write(`${id} ${turn} ${trigger} ${files} ${size} ${when}\n`);
  }
  return 0;
}

async function showCheckpoint(store: CheckpointStore, id: string): Promise<number> {
  const cp = await store.get(id);
  if (!cp) {
    process.stderr.write(`forge checkpoint: no checkpoint with id "${id}"\n`);
    return 2;
  }
  process.stdout.write(`Checkpoint ${cp.id}\n`);
  process.stdout.write(`  turn:       ${cp.turnIndex}\n`);
  process.stdout.write(`  cause:      ${humanize(cp.trigger)}\n`);
  process.stdout.write(`  when:       ${cp.createdAt}\n`);
  process.stdout.write(`  description: ${cp.description}\n`);
  if (cp.toolName) process.stdout.write(`  tool:       ${toolLabel(cp.toolName)}\n`);
  process.stdout.write(`  files:      ${cp.files.length} (${formatBytes(cp.totalBytes)})\n`);
  for (const f of cp.files) {
    process.stdout.write(`    [${f.status.padEnd(8)}] ${f.path}`);
    if (f.status !== 'deleted') process.stdout.write(` (${formatBytes(f.size)})`);
    process.stdout.write('\n');
  }
  return 0;
}

async function restoreCheckpoint(store: CheckpointStore, id: string, yes: boolean): Promise<number> {
  const cp = await store.get(id);
  if (!cp) {
    process.stderr.write(`forge checkpoint: no checkpoint with id "${id}"\n`);
    return 2;
  }

  // v2.12: worktree-aware restore warning. When the checkpoint was
  // captured inside a different git worktree (or a different repo
  // entirely), surface that to the user before we go overwriting
  // files. The store still operates on cwd-relative paths, so the
  // restore would silently succeed: just on the wrong tree.
  //
  // We probe the current cwd's worktree context on demand (cheap,
  // and skipped when not in a git repo). Best-effort: if the probe
  // fails, we proceed without a warning rather than blocking the
  // restore.
  let mismatch: { kind: string; message: string | null } | null = null;
  try {
    const currentSnap = await snapshotWorktreeContext(store.cwdPath());
    mismatch = compareWorktreeContexts(cp.worktreeContext, currentSnap);
  } catch {
    // ignore: proceed without warning
  }
  const worktreeWarning = mismatch?.message ?? null;

  if (!yes) {
    process.stderr.write(
      `About to restore ${cp.files.length} file${cp.files.length === 1 ? '' : 's'} from checkpoint "${cp.id}".\n`
    );
    if (worktreeWarning) {
      // Prefix with a clear marker so users (and CI logs) can grep
      // for the warning class.
      process.stderr.write(`  ⚠  worktree mismatch: ${worktreeWarning}\n`);
    }
    process.stderr.write('Re-run with --yes to confirm. Refusing to overwrite uncommitted work without an explicit flag.\n');
    return 2;
  }

  // Even with --yes, print the worktree warning before proceeding so
  // it's visible in logs / transcripts. Users can redirect to a
  // file to suppress the visual but the warning still surfaces.
  if (worktreeWarning) {
    process.stderr.write(`⚠  ${worktreeWarning}\n`);
  }

  const result = await store.restore(id);
  if (!result) {
    process.stderr.write(`forge checkpoint: failed to restore "${id}"\n`);
    return 1;
  }
  const parts: string[] = [];
  if (result.restored.length > 0) parts.push(`${result.restored.length} restored`);
  if (result.modified.length > 0) parts.push(`${result.modified.length} modified`);
  if (result.removed.length > 0) parts.push(`${result.removed.length} removed`);
  if (result.unchanged.length > 0) parts.push(`${result.unchanged.length} unchanged`);
  process.stdout.write(`restored ${id}: ${parts.join(', ') || 'no changes'}\n`);
  if (result.modified.length > 0) {
    process.stdout.write('  modified:\n');
    for (const f of result.modified) process.stdout.write(`    ${f}\n`);
  }
  if (result.restored.length > 0) {
    process.stdout.write('  restored:\n');
    for (const f of result.restored) process.stdout.write(`    ${f}\n`);
  }
  if (result.removed.length > 0) {
    process.stdout.write('  removed:\n');
    for (const f of result.removed) process.stdout.write(`    ${f}\n`);
  }
  return 0;
}

async function pruneCheckpoints(store: CheckpointStore, keep?: number): Promise<number> {
  const result = await store.prune(keep);
  process.stdout.write(
    `pruned: kept ${result.kept}, removed ${result.removed}, freed ${formatBytes(result.bytesFreed)}\n`
  );
  return 0;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
}

// Late import: keeps the file-relative path resolution at function call
// time (we already use the function above). The import is at the bottom
// so it doesn't disturb the soft-prefix handler shape.
import path from 'node:path';
void path;