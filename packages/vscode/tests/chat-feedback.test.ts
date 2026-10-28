import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadSession, saveSession } from '@ikarmic/forge-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChatSession } from '../src/chat/chat-session.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'forge-fb-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

const deps = () => ({ sessionDir: dir, saveSession, generateSessionId: () => 'chat-fb' });
const turn = (text: string) => ({
  messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: text }] as never,
  turnMessages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: text }] as never,
  inputTokens: 1,
  outputTokens: 1,
  costUsd: 0,
  costKnown: true,
});
const model = { provider: 'openai', model: 'gpt-4o' } as never;

describe('rating a reply (F3)', () => {
  it('is saved in the session file at once, and read back from the real store', async () => {
    const s = new ChatSession(deps());
    await s.recordTurn(turn('a'), model, '/ws');
    const out = await s.setFeedback(1, 'up');
    expect(out.ok).toBe(true);
    expect((await loadSession('chat-fb', dir)).feedback?.['1']).toMatchObject({ rating: 'up' });
  });

  it('keeps a note on a down, and drops one given with an up', async () => {
    const s = new ChatSession(deps());
    await s.recordTurn(turn('a'), model, '/ws');
    await s.setFeedback(1, 'down', 'wrong file');
    expect((await loadSession('chat-fb', dir)).feedback?.['1']).toMatchObject({ rating: 'down', note: 'wrong file' });
    await s.setFeedback(1, 'up', 'ignored');
    expect((await loadSession('chat-fb', dir)).feedback?.['1']).toEqual(expect.objectContaining({ rating: 'up' }));
    expect((await loadSession('chat-fb', dir)).feedback?.['1']).not.toHaveProperty('note');
  });

  it('clears a rating when it is taken back, and leaves no empty field', async () => {
    const s = new ChatSession(deps());
    await s.recordTurn(turn('a'), model, '/ws');
    await s.setFeedback(1, 'up');
    await s.setFeedback(1, null);
    expect((await loadSession('chat-fb', dir)).feedback).toBeUndefined();
  });

  it('is kept by the next turn and by reopening the chat', async () => {
    const s = new ChatSession(deps());
    await s.recordTurn(turn('a'), model, '/ws');
    await s.setFeedback(1, 'down', 'meh');
    await s.recordTurn(turn('b'), model, '/ws');
    const stored = await loadSession('chat-fb', dir);
    expect(stored.feedback?.['1']).toMatchObject({ rating: 'down' });
    const reopened = ChatSession.fromSession(deps(), stored);
    expect(reopened.feedback['1']).toMatchObject({ rating: 'down', note: 'meh' });
    await reopened.setFeedback(2, 'up');
    expect(Object.keys((await loadSession('chat-fb', dir)).feedback ?? {}).sort()).toEqual(['1', '2']);
  });

  it('is dropped for the turns a retry throws away, but not for earlier ones', async () => {
    const s = new ChatSession(deps());
    await s.recordTurn(turn('a'), model, '/ws');
    await s.setFeedback(1, 'up');
    await s.setFeedback(2, 'down');
    await s.setFeedback(3, 'up');
    s.pruneFeedback(1); // the chat was rewound to one turn
    expect(Object.keys(s.feedback)).toEqual(['1']);
    await s.recordTurn(turn('again'), model, '/ws');
    expect(Object.keys((await loadSession('chat-fb', dir)).feedback ?? {})).toEqual(['1']);
  });

  it('a new chat starts with none', async () => {
    const s = new ChatSession(deps());
    await s.recordTurn(turn('a'), model, '/ws');
    await s.setFeedback(1, 'up');
    s.reset();
    expect(s.feedback).toEqual({});
  });

  it('a rating given before the reply is saved is saved with it', async () => {
    const s = new ChatSession(deps());
    expect((await s.setFeedback(1, 'up')).ok).toBe(true);
    await s.recordTurn(turn('a'), model, '/ws');
    expect((await loadSession('chat-fb', dir)).feedback?.['1']).toMatchObject({ rating: 'up' });
  });
});
