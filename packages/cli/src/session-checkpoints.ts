/**
 * Per-session checkpoint wiring for the CLI. Checkpoints live at
 * `<sessionsDir>/<sessionId>/checkpoints/` so `Checkpoint.sessionId` is the
 * real session id and one session's `/rewind` never lists another's.
 */
import path from 'node:path';

import { CheckpointStore, type AgentConfig } from '@ikarmic/forge-core';

/** Tools whose pre-call state is snapshotted (file-scoped, or capped full walk for shell). */
const CAPTURE_BEFORE_TOOLS = ['write_file', 'edit_file', 'edit_notebook', 'apply_patch', 'run_command', 'bg_start'];

export function sessionCheckpointDir(sessionsDir: string, sessionId: string): string {
  return path.join(sessionsDir, sessionId);
}

export function sessionCheckpointStore(sessionsDir: string, sessionId: string, cwd: string): CheckpointStore {
  return new CheckpointStore(sessionCheckpointDir(sessionsDir, sessionId), cwd);
}

/** AgentConfig.checkpoints for a CLI session. Skips the whole-workspace start snapshot. */
export function sessionCheckpointsConfig(
  sessionsDir: string,
  sessionId: string,
  cwd: string
): NonNullable<AgentConfig['checkpoints']> {
  return {
    store: sessionCheckpointStore(sessionsDir, sessionId, cwd),
    captureInitial: false,
    captureWorktreeContext: true,
    captureBeforeTools: CAPTURE_BEFORE_TOOLS,
  };
}
