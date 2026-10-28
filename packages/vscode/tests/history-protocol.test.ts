import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  handleHistoryMessage,
  isHistoryMessage,
  isSafeId,
  transcriptFromMessages,
} from '../src/chat/history-protocol.js';
import { stripSteering } from '@ikarmic/forge-core';

const SESSION_DIR = path.join('/home', 'u', '.forge', 'sessions');

function deps(over: Record<string, unknown> = {}) {
  return {
    sessionDir: SESSION_DIR,
    activeSessionId: () => 'active-1',
    listSessions: vi.fn().mockResolvedValue([]),
    loadSession: vi.fn(),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    removeDir: vi.fn().mockResolvedValue(undefined),
    checkpoints: () => ({ list: vi.fn().mockResolvedValue([]), restore: vi.fn() }),
    confirm: vi.fn().mockResolvedValue(true),
    activeCwd: () => undefined,
    workspaceRoot: () => path.resolve("/ws"),
    ...over,
  } as never;
}

describe('isSafeId', () => {
  it('accepts generated session and checkpoint ids', () => {
    expect(isSafeId('2026-09-24T18-04-01Z-3f9c2a')).toBe(true);
    expect(isSafeId('tool_use_1727600000000_3')).toBe(true);
    expect(isSafeId('initial')).toBe(true);
  });
  it('rejects traversal and separators', () => {
    for (const bad of ['..', '.', '../x', 'a/b', 'a\\b', '', 'x y']) expect(isSafeId(bad)).toBe(false);
  });
});

describe('isHistoryMessage', () => {
  it('accepts well-formed messages', () => {
    expect(isHistoryMessage({ type: 'listSessions' })).toBe(true);
    expect(isHistoryMessage({ type: 'resumeSession', id: 'a' })).toBe(true);
  });
  it('rejects id-bearing messages without a string id, and unknown types', () => {
    expect(isHistoryMessage({ type: 'resumeSession' })).toBe(false);
    expect(isHistoryMessage({ type: 'restoreCheckpoint', id: 5 })).toBe(false);
    expect(isHistoryMessage({ type: 'user_input' })).toBe(false);
    expect(isHistoryMessage(null)).toBe(false);
  });
});

describe('transcriptFromMessages', () => {
  it('keeps user and assistant text, skips system and tool messages', () => {
    const items = transcriptFromMessages([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: [{ type: 'text', text: 'hi ' }, { type: 'tool-call', toolName: 'x' }, { type: 'text', text: 'there' }] },
      { role: 'tool', content: [{ type: 'tool-result' }] },
      { role: 'user', content: [{ type: 'text', text: 'part' }] },
      { role: 'assistant', content: [{ type: 'tool-call', toolName: 'y' }] },
    ]);
    expect(items).toEqual([
      { role: 'user', text: 'hello' },
      { role: 'assistant', text: 'hi there' },
      { role: 'user', text: 'part' },
    ]);
  });
});

describe('handleHistoryMessage', () => {
  it('listSessions returns core listing', async () => {
    const listSessions = vi.fn().mockResolvedValue([{ id: 's1' }]);
    const res = await handleHistoryMessage({ type: 'listSessions' }, deps({ listSessions }));
    expect(listSessions).toHaveBeenCalledWith(SESSION_DIR);
    expect(res).toEqual({ type: 'sessionsListed', sessions: [{ id: 's1' }] });
  });

  it('resumeSession returns session + transcript', async () => {
    const session = { id: 's1', messages: [{ role: 'user', content: 'q' }] };
    const loadSession = vi.fn().mockResolvedValue(session);
    const res = await handleHistoryMessage({ type: 'resumeSession', id: 's1' }, deps({ loadSession }));
    expect(loadSession).toHaveBeenCalledWith('s1', SESSION_DIR);
    expect(res).toEqual({ type: 'sessionResumed', session, transcript: [{ role: 'user', text: 'q' }] });
  });

  // RB-58: a reopened chat shows the whole conversation, not only what survived compaction.
  it('resumeSession shows the full transcript when the session has one', async () => {
    const session = {
      id: 's1',
      messages: [{ role: 'user', content: 'only the recent part' }],
      transcript: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'early answer' },
        { role: 'user', content: 'only the recent part' },
      ],
    };
    const res = await handleHistoryMessage({ type: 'resumeSession', id: 's1' }, deps({ loadSession: vi.fn().mockResolvedValue(session) }));
    expect((res as { transcript: unknown[] }).transcript).toHaveLength(3);
  });

  it('surfaces loadSession errors as error responses', async () => {
    const loadSession = vi.fn().mockRejectedValue(new Error('session s1 is corrupt: bad'));
    const res = await handleHistoryMessage({ type: 'resumeSession', id: 's1' }, deps({ loadSession }));
    expect(res).toEqual({ type: 'error', message: 'session s1 is corrupt: bad' });
  });

  it('rejects unsafe ids before touching the filesystem', async () => {
    const d = deps();
    for (const msg of [
      { type: 'resumeSession', id: '../x' },
      { type: 'deleteSession', id: '..' },
      { type: 'restoreCheckpoint', id: 'a/b' },
    ] as const) {
      const res = await handleHistoryMessage(msg, d);
      expect(res).toEqual({ type: 'error', message: `invalid id: ${msg.id}` });
    }
    const dd = d as Record<string, ReturnType<typeof vi.fn>>;
    expect(dd.loadSession).not.toHaveBeenCalled();
    expect(dd.deleteSession).not.toHaveBeenCalled();
    expect(dd.removeDir).not.toHaveBeenCalled();
  });

  it('deletes the open session after confirming, and says it was the open one', async () => {
    const d = deps();
    const res = await handleHistoryMessage({ type: 'deleteSession', id: 'active-1' }, d);
    const dd = d as Record<string, ReturnType<typeof vi.fn>>;
    expect(dd.confirm).toHaveBeenCalledWith(expect.stringContaining('open session'), 'Delete');
    expect(dd.deleteSession).toHaveBeenCalledWith('active-1', SESSION_DIR);
    expect(res).toEqual({ type: 'sessionDeleted', id: 'active-1', active: true });
  });

  it('deleteSession confirms, deletes json and the per-session dir', async () => {
    const d = deps();
    const res = await handleHistoryMessage({ type: 'deleteSession', id: 's2' }, d);
    const dd = d as Record<string, ReturnType<typeof vi.fn>>;
    expect(dd.confirm).toHaveBeenCalledWith('Delete session s2 and its checkpoints? This cannot be undone.', 'Delete');
    expect(dd.deleteSession).toHaveBeenCalledWith('s2', SESSION_DIR);
    expect(dd.removeDir).toHaveBeenCalledWith(path.join(SESSION_DIR, 's2'));
    expect(res).toEqual({ type: 'sessionDeleted', id: 's2' });
  });

  it('deleteSession returns cancelled when the user declines', async () => {
    const d = deps({ confirm: vi.fn().mockResolvedValue(false) });
    const res = await handleHistoryMessage({ type: 'deleteSession', id: 's2' }, d);
    expect(res).toEqual({ type: 'cancelled' });
    expect((d as Record<string, ReturnType<typeof vi.fn>>).deleteSession).not.toHaveBeenCalled();
  });

  it('sorts checkpoints newest first by createdAt', async () => {
    const list = vi.fn().mockResolvedValue([
      { id: 'initial', turnIndex: -1, createdAt: '2026-09-29T10:00:00.000Z' },
      { id: 'b', turnIndex: 1, createdAt: '2026-09-29T10:05:00.000Z' },
      { id: 'c', turnIndex: 3, createdAt: '2026-09-29T10:02:00.000Z' },
    ]);
    const res = await handleHistoryMessage({ type: 'listCheckpoints' }, deps({ checkpoints: () => ({ list, restore: vi.fn() }) }));
    expect(res.type).toBe('checkpointsListed');
    expect((res as { checkpoints: { id: string }[] }).checkpoints.map((c) => c.id)).toEqual(['b', 'c', 'initial']);
  });

  it('restoreCheckpoint confirms then restores', async () => {
    const result = { checkpointId: 'b', modified: ['a.ts'], restored: [], removed: [], unchanged: [] };
    const restore = vi.fn().mockResolvedValue(result);
    const d = deps({ checkpoints: () => ({ list: vi.fn(), restore }) });
    const res = await handleHistoryMessage({ type: 'restoreCheckpoint', id: 'b' }, d);
    expect((d as Record<string, ReturnType<typeof vi.fn>>).confirm).toHaveBeenCalledWith(
      'Restore checkpoint b? Files in the workspace will be overwritten with their saved versions.',
      'Restore'
    );
    expect(restore).toHaveBeenCalledWith('b');
    expect(res).toEqual({ type: 'checkpointRestored', result });
  });

  it('restoreCheckpoint: declined → cancelled, missing → error', async () => {
    const restore = vi.fn().mockResolvedValue(null);
    const declined = await handleHistoryMessage(
      { type: 'restoreCheckpoint', id: 'b' },
      deps({ confirm: vi.fn().mockResolvedValue(false), checkpoints: () => ({ list: vi.fn(), restore }) })
    );
    expect(declined).toEqual({ type: 'cancelled' });
    expect(restore).not.toHaveBeenCalled();
    const missing = await handleHistoryMessage({ type: 'restoreCheckpoint', id: 'b' }, deps({ checkpoints: () => ({ list: vi.fn(), restore }) }));
    expect(missing).toEqual({ type: 'error', message: 'checkpoint b not found' });
  });

  it("refuses to restore a checkpoint from a session started in a different folder", async () => {
    const restore = vi.fn();
    const d = deps({
      activeCwd: () => path.resolve("/projA"),
      workspaceRoot: () => path.resolve("/projB"),
      checkpoints: () => ({ list: vi.fn(), restore }),
    });
    const res = await handleHistoryMessage({ type: "restoreCheckpoint", id: "b" }, d);
    expect(res.type).toBe("error");
    expect((res as { message: string }).message).toContain(path.resolve("/projA"));
    expect((res as { message: string }).message).toContain(path.resolve("/projB"));
    expect(restore).not.toHaveBeenCalled();
    expect((d as Record<string, ReturnType<typeof vi.fn>>).confirm).not.toHaveBeenCalled();
  });

  it("allows restore when the session folder matches the workspace (trailing slash tolerated)", async () => {
    const restore = vi.fn().mockResolvedValue({ checkpointId: "b", modified: [], restored: [], removed: [], unchanged: [] });
    const d = deps({
      activeCwd: () => path.resolve("/ws") + path.sep,
      checkpoints: () => ({ list: vi.fn(), restore }),
    });
    const res = await handleHistoryMessage({ type: "restoreCheckpoint", id: "b" }, d);
    expect(res.type).toBe("checkpointRestored");
  });
});

describe('transcriptFromMessages with steering', () => {
  it('strips steering from user text and hides steering-only messages', () => {
    const items = transcriptFromMessages(
      [
        { role: 'user', content: '<steering name="api">\nAPI\n</steering>\n\nadd the endpoint' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: '<steering name="tests">\nT\n</steering>' },
      ],
      stripSteering
    );
    expect(items).toEqual([
      { role: 'user', text: 'add the endpoint' },
      { role: 'assistant', text: 'ok' },
    ]);
  });

  it('resumeSession uses deps.stripSteering', async () => {
    const session = { id: 's1', messages: [{ role: 'user', content: '<steering name="a">\nA\n</steering>\n\nq' }] };
    const res = await handleHistoryMessage(
      { type: 'resumeSession', id: 's1' },
      deps({ loadSession: vi.fn().mockResolvedValue(session), stripSteering })
    );
    expect(res).toMatchObject({ type: 'sessionResumed', transcript: [{ role: 'user', text: 'q' }] });
  });
});

describe('searchSessions', () => {
  const entry = (id: string) => ({ id, cwd: '/ws', model: { provider: 'openai', model: 'm' }, createdAt: 'x', updatedAt: 'x', sizeBytes: 1, preview: 'first message' });

  it('accepts a bounded string query only', () => {
    expect(isHistoryMessage({ type: 'searchSessions', q: 'login' })).toBe(true);
    expect(isHistoryMessage({ type: 'searchSessions' })).toBe(false);
    expect(isHistoryMessage({ type: 'searchSessions', q: 'x'.repeat(201) })).toBe(false);
  });

  it('returns matches with the snippet as the preview, and the full list for an empty query', async () => {
    const searchSessions = vi.fn().mockResolvedValue([{ entry: entry('a'), snippet: '…the login bug…', hits: 2 }]);
    const listSessions = vi.fn().mockResolvedValue([entry('b')]);
    const d = deps({ searchSessions, listSessions });
    const res = await handleHistoryMessage({ type: 'searchSessions', q: ' login ' }, d);
    expect(res).toEqual({ type: 'sessionsListed', sessions: [{ ...entry('a'), preview: '…the login bug…' }], query: 'login' });
    expect(searchSessions).toHaveBeenCalledWith(SESSION_DIR, 'login', { limit: 50 });
    expect(await handleHistoryMessage({ type: 'searchSessions', q: '  ' }, d)).toEqual({ type: 'sessionsListed', sessions: [entry('b')] });
  });
});

describe('renameSession', () => {
  const saved = { id: 'old-1', messages: [], label: 'before' };

  it('is a well-formed history message only with an id', () => {
    expect(isHistoryMessage({ type: 'renameSession', id: 'a' })).toBe(true);
    expect(isHistoryMessage({ type: 'renameSession' })).toBe(false);
  });

  it('asks for the name, stores it as the label, and sends back the refreshed list', async () => {
    const saveSession = vi.fn().mockResolvedValue('p');
    const askName = vi.fn().mockResolvedValue('  Refactor auth  ');
    const listSessions = vi.fn().mockResolvedValue([{ id: 'old-1', label: 'Refactor auth' }]);
    const res = await handleHistoryMessage({ type: 'renameSession', id: 'old-1' }, deps({ loadSession: vi.fn().mockResolvedValue({ ...saved }), saveSession, askName, listSessions }));
    expect(askName).toHaveBeenCalledWith('before');
    expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'old-1', label: 'Refactor auth' }), SESSION_DIR);
    expect(res).toMatchObject({ type: 'sessionsListed' });
  });

  it('an empty name removes the label; cancelling the prompt changes nothing', async () => {
    const saveSession = vi.fn().mockResolvedValue('p');
    const load = vi.fn().mockResolvedValue({ ...saved });
    await handleHistoryMessage({ type: 'renameSession', id: 'old-1' }, deps({ loadSession: load, saveSession, askName: vi.fn().mockResolvedValue('   ') }));
    expect(saveSession.mock.calls[0]![0]).not.toHaveProperty('label');
    saveSession.mockClear();
    const res = await handleHistoryMessage({ type: 'renameSession', id: 'old-1' }, deps({ loadSession: load, saveSession, askName: vi.fn().mockResolvedValue(undefined) }));
    expect(saveSession).not.toHaveBeenCalled();
    expect(res).toEqual({ type: 'cancelled' });
  });

  it('clips a long name to 120 characters', async () => {
    const saveSession = vi.fn().mockResolvedValue('p');
    await handleHistoryMessage({ type: 'renameSession', id: 'old-1' }, deps({ loadSession: vi.fn().mockResolvedValue({ ...saved }), saveSession, askName: vi.fn().mockResolvedValue('x'.repeat(300)) }));
    expect(saveSession.mock.calls[0]![0].label).toHaveLength(120);
  });

  it('renaming the open chat also updates the live session, so its next save keeps the name', async () => {
    const renameActive = vi.fn();
    await handleHistoryMessage({ type: 'renameSession', id: 'active-1' }, deps({ loadSession: vi.fn().mockResolvedValue({ ...saved, id: 'active-1' }), saveSession: vi.fn().mockResolvedValue('p'), askName: vi.fn().mockResolvedValue('Mine'), renameActive }));
    expect(renameActive).toHaveBeenCalledWith('Mine');
  });
});

