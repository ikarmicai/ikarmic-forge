import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { saveSession, type Session } from '@ikarmic/forge-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionFollower } from '../src/chat/session-follow.js';

const user = (text: string) => ({ role: 'user' as const, content: text });
const assistant = (text: string) => ({ role: 'assistant' as const, content: text });
const session = (messages: Session['messages']): Session => ({
  id: 's1', createdAt: 'a', updatedAt: 'b', cwd: '/x', model: { provider: 'openai', model: 'm' }, messages,
});

async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  if (!cond()) throw new Error('timed out');
}

describe('SessionFollower', () => {
  let dir: string;
  let follower: SessionFollower | undefined;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'forge-follow-'));
  });
  afterEach(() => {
    follower?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  function make(local: { history: Session['messages'] | undefined }, busy = () => false) {
    const external: Session[] = [];
    follower = new SessionFollower({
      dir,
      pollMs: 20,
      current: () => ({ id: 's1', history: local.history }),
      busy,
      onExternal: (s) => external.push(s),
    });
    follower.start();
    return external;
  }

  it('ignores our own save but reports a change made elsewhere', async () => {
    const local = { history: [user('hi')] as Session['messages'] | undefined };
    await saveSession(session(local.history!), dir);
    const external = make(local);
    await new Promise((r) => setTimeout(r, 100));

    // our own turn: memory and disk agree
    local.history = [user('hi'), assistant('hello')];
    await saveSession(session(local.history), dir);
    await new Promise((r) => setTimeout(r, 150));
    expect(external).toEqual([]);

    // the CLI continues the session
    await saveSession(session([...local.history, user('from cli')]), dir);
    await until(() => external.length === 1);
    expect(external[0]!.messages).toHaveLength(3);
  });

  it('holds back while a local run is in flight', async () => {
    const local = { history: [user('hi')] as Session['messages'] | undefined };
    await saveSession(session(local.history!), dir);
    const external = make(local, () => true);
    await new Promise((r) => setTimeout(r, 100));
    await saveSession(session([user('hi'), user('other')]), dir);
    await new Promise((r) => setTimeout(r, 200));
    expect(external).toEqual([]);
  });
});
