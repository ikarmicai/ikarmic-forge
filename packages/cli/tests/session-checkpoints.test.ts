import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sessionCheckpointDir, sessionCheckpointsConfig } from '../src/session-checkpoints.js';

describe('session checkpoints', () => {
  let cwd: string;
  let sessions: string;
  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'forge-cli-ck-cwd-'));
    sessions = mkdtempSync(path.join(tmpdir(), 'forge-cli-ck-sess-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(sessions, { recursive: true, force: true });
  });

  it('nests checkpoints under the session id, not the shared sessions dir', () => {
    expect(sessionCheckpointDir(sessions, 's1')).toBe(path.join(sessions, 's1'));
    const cfg = sessionCheckpointsConfig(sessions, 's1', cwd);
    expect(cfg.store.rootPath()).toBe(path.join(sessions, 's1', 'checkpoints'));
  });

  it('records the real session id on captured checkpoints', async () => {
    writeFileSync(path.join(cwd, 'a.txt'), 'x');
    const cfg = sessionCheckpointsConfig(sessions, 's2', cwd);
    const cp = await cfg.store.capture({ trigger: 'tool_use', toolName: 'edit_file', focusPath: 'a.txt' });
    expect(cp?.sessionId).toBe('s2');
  });

  it('keeps sessions isolated from each other', async () => {
    writeFileSync(path.join(cwd, 'a.txt'), 'x');
    const a = sessionCheckpointsConfig(sessions, 'a', cwd);
    const b = sessionCheckpointsConfig(sessions, 'b', cwd);
    await a.store.capture({ trigger: 'tool_use', toolName: 'edit_file', focusPath: 'a.txt' });
    expect(await a.store.list()).toHaveLength(1);
    expect(await b.store.list()).toHaveLength(0);
  });

  it('skips the whole-workspace start snapshot', () => {
    expect(sessionCheckpointsConfig(sessions, 's', cwd).captureInitial).toBe(false);
  });
});
