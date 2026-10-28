/**
 * RB-55: `forge checkpoint` names what caused a snapshot in words, not as `tool_use`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleCheckpointCommand } from '../src/commands/checkpoint.js';
import { sessionCheckpointsConfig } from '../src/session-checkpoints.js';

describe('forge checkpoint output', () => {
  let cwd: string;
  let sessions: string;
  let out: string;
  const saved = process.env.FORGE_SESSION_DIR;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'forge-cli-ckw-cwd-'));
    sessions = mkdtempSync(path.join(tmpdir(), 'forge-cli-ckw-sess-'));
    process.env.FORGE_SESSION_DIR = sessions; // a scratch folder, never the real ~/.forge (RB-4)
    out = '';
    vi.spyOn(process.stdout, 'write').mockImplementation(((s: string) => ((out += s), true)) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (saved === undefined) delete process.env.FORGE_SESSION_DIR;
    else process.env.FORGE_SESSION_DIR = saved;
    rmSync(cwd, { recursive: true, force: true });
    rmSync(sessions, { recursive: true, force: true });
  });

  async function oneCheckpoint(): Promise<string> {
    writeFileSync(path.join(cwd, 'a.txt'), 'x');
    const cp = await sessionCheckpointsConfig(sessions, 's1', cwd).store.capture({ trigger: 'tool_use', toolName: 'edit_file', focusPath: 'a.txt' });
    return cp!.id;
  }

  it('the list says "Tool use", not tool_use', async () => {
    await oneCheckpoint();
    await handleCheckpointCommand({ list: { limit: null }, sessionId: 's1' }, cwd);
    expect(out).toContain('Tool use');
    expect(out).not.toMatch(/\btool_use\b/);
  });

  it('show names the cause and the tool in words', async () => {
    const id = await oneCheckpoint();
    out = '';
    await handleCheckpointCommand({ show: { id }, sessionId: 's1' } as never, cwd);
    expect(out).toMatch(/Tool use/);
    expect(out).toContain('Edit file');
    expect(out).not.toMatch(/\bedit_file\b/);
  });
});
