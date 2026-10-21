import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@ikarmic/forge-core';

import { ChatSession } from '../src/chat/chat-session.js';

const model = { provider: 'anthropic', model: 'claude-sonnet-5-5' } as const;
const turn = (text: string, over: Record<string, unknown> = {}) => ({
  messages: [
    { role: 'system', content: 'sys' },
    { role: 'user', content: text },
    { role: 'assistant', content: 'ok' },
  ] as never,
  inputTokens: 10,
  outputTokens: 5,
  costUsd: 0.01,
  costKnown: true,
  ...over,
});

function deps(over: Record<string, unknown> = {}) {
  let n = 0;
  return {
    sessionDir: path.join('/home', 'u', '.forge', 'sessions'),
    saveSession: vi.fn().mockResolvedValue('/saved.json'),
    generateSessionId: () => `sess-${++n}`,
    now: () => new Date('2026-09-29T12:00:00.000Z'),
    ...over,
  } as never;
}

describe('ChatSession', () => {
  it('rewindTo puts the history back and keeps the usage totals', async () => {
    const s = new ChatSession(deps());
    await s.recordTurn(turn('one'), model, '/ws');
    const before = s.history;
    await s.recordTurn(turn('two'), model, '/ws');
    s.rewindTo(before);
    expect(s.history).toBe(before);
    expect(s.totalCostUsd).toBeCloseTo(0.02);
    s.rewindTo(undefined);
    expect(s.hasHistory).toBe(false);
    s.rewindTo([]);
    expect(s.history).toBeUndefined();
  });

  it('starts fresh with a generated id and no history', () => {
    const s = new ChatSession(deps());
    expect(s.id).toBe('sess-1');
    expect(s.history).toBeUndefined();
    expect(s.hasHistory).toBe(false);
    expect(s.sessionPath).toBe(path.join('/home', 'u', '.forge', 'sessions', 'sess-1'));
  });

  it('recordTurn stores history and saves a full Session', async () => {
    const d = deps();
    const s = new ChatSession(d);
    const outcome = await s.recordTurn(turn('hi'), model, '/ws');
    expect(outcome).toEqual({ ok: true, filePath: '/saved.json' });
    expect(s.hasHistory).toBe(true);
    expect(s.history).toHaveLength(3);
    const [saved, dir] = (d as { saveSession: ReturnType<typeof vi.fn> }).saveSession.mock.calls[0];
    expect(dir).toBe(path.join('/home', 'u', '.forge', 'sessions'));
    expect(saved).toMatchObject({
      id: 'sess-1',
      createdAt: '2026-09-29T12:00:00.000Z',
      updatedAt: '2026-09-29T12:00:00.000Z',
      cwd: '/ws',
      model,
      totalInputTokens: 10,
      totalOutputTokens: 5,
      totalCostUsd: 0.01,
      costKnown: true,
    });
  });

  it('accumulates totals across turns and keeps costKnown false once unknown', async () => {
    const d = deps();
    const s = new ChatSession(d);
    await s.recordTurn(turn('a'), model, '/ws');
    await s.recordTurn(turn('b', { costKnown: false, costUsd: 0 }), model, '/ws');
    await s.recordTurn(turn('c'), model, '/ws');
    const last = (d as { saveSession: ReturnType<typeof vi.fn> }).saveSession.mock.calls[2][0] as Session;
    expect(last.totalInputTokens).toBe(30);
    expect(last.totalOutputTokens).toBe(15);
    expect(last.totalCostUsd).toBeCloseTo(0.02);
    expect(last.costKnown).toBe(false);
  });

  it('records history even when the run was aborted (save still attempted)', async () => {
    const s = new ChatSession(deps());
    await s.recordTurn(turn('partial', { outputTokens: 0 }), model, '/ws');
    expect(s.hasHistory).toBe(true);
  });

  it('returns ok:false instead of throwing when save fails, history still updated', async () => {
    const s = new ChatSession(deps({ saveSession: vi.fn().mockRejectedValue(new Error('EACCES')) }));
    const outcome = await s.recordTurn(turn('x'), model, '/ws');
    expect(outcome).toEqual({ ok: false, error: 'EACCES' });
    expect(s.hasHistory).toBe(true);
  });

  it('treats an empty messages array as no history', async () => {
    const s = new ChatSession(deps());
    await s.recordTurn(turn('x', { messages: [] }), model, '/ws');
    expect(s.hasHistory).toBe(false);
  });

  it('reset gives a new id and clears history and totals', async () => {
    const d = deps();
    const s = new ChatSession(d);
    await s.recordTurn(turn('a'), model, '/ws');
    s.reset();
    expect(s.id).toBe('sess-2');
    expect(s.hasHistory).toBe(false);
    await s.recordTurn(turn('b'), model, '/ws');
    const saved = (d as { saveSession: ReturnType<typeof vi.fn> }).saveSession.mock.calls[1][0] as Session;
    expect(saved.totalInputTokens).toBe(10);
  });

  it('fromSession restores id, createdAt, label, history and totals', async () => {
    const d = deps();
    const loaded: Session = {
      id: 'old-1',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
      label: 'refactor',
      cwd: '/ws',
      model,
      messages: [{ role: 'user', content: 'earlier' }] as never,
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalCostUsd: 1,
      costKnown: true,
    };
    const s = ChatSession.fromSession(d, loaded);
    expect(s.id).toBe('old-1');
    expect(s.hasHistory).toBe(true);
    await s.recordTurn(turn('more'), model, '/ws');
    const saved = (d as { saveSession: ReturnType<typeof vi.fn> }).saveSession.mock.calls[0][0] as Session;
    expect(saved).toMatchObject({ id: 'old-1', createdAt: '2026-09-01T00:00:00.000Z', label: 'refactor', totalInputTokens: 110 });
  });

  it('fromSession treats missing costKnown as unknown', async () => {
    const d = deps();
    const s = ChatSession.fromSession(d, {
      id: 'legacy', createdAt: 'c', updatedAt: 'u', cwd: '/', model, messages: [] as never,
    });
    await s.recordTurn(turn('x'), model, '/ws');
    const saved = (d as { saveSession: ReturnType<typeof vi.fn> }).saveSession.mock.calls[0][0] as Session;
    expect(saved.costKnown).toBe(false);
  });

  it("exposes the cwd the session started in and keeps it when resumed elsewhere", async () => {
    const fresh = new ChatSession(deps());
    expect(fresh.cwd).toBeUndefined();
    await fresh.recordTurn(turn("a"), model, "/projA");
    expect(fresh.cwd).toBe("/projA");
    await fresh.recordTurn(turn("b"), model, "/projB");
    expect(fresh.cwd).toBe("/projA");

    const d = deps();
    const resumed = ChatSession.fromSession(d, {
      id: "old", createdAt: "c", updatedAt: "u", cwd: "/projA", model, messages: [] as never,
    });
    expect(resumed.cwd).toBe("/projA");
    await resumed.recordTurn(turn("x"), model, "/projB");
    const saved = (d as { saveSession: ReturnType<typeof vi.fn> }).saveSession.mock.calls[0][0] as Session;
    expect(saved.cwd).toBe("/projA");
  });
});
