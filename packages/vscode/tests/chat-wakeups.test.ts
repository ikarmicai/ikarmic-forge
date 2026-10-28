import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listSessions } from '@ikarmic/forge-core';

import { ChatWakeups, fileWakeupStore, wakeupFile } from '../src/chat/chat-wakeups.js';

let dir: string;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(Date.parse('2026-10-27T12:00:00Z'));
  dir = mkdtempSync(path.join(tmpdir(), 'forge-wk-'));
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

function host(over: Partial<ConstructorParameters<typeof ChatWakeups>[0]> = {}) {
  const delivered: string[] = [];
  const notices: string[] = [];
  const wk = new ChatWakeups({ sessionDir: dir, busy: () => false, deliver: (t) => void delivered.push(t), notice: (m) => void notices.push(m), ...over });
  return { wk, delivered, notices };
}

describe('ChatWakeups', () => {
  it('delivers a due wakeup as an automatic message and tells the person', async () => {
    const { wk, delivered, notices } = host();
    await wk.forChat('chat1').schedule({ delay: '1m', reason: 'check the build' });
    await tick(61_000);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatch(/automatic message/i);
    expect(notices).toEqual(['check the build']);
  });

  it('waits while the chat is busy', async () => {
    let busy = true;
    const { wk, delivered } = host({ busy: () => busy });
    await wk.forChat('chat1').schedule({ delay: '30s', reason: 'x' });
    await tick(40_000);
    expect(delivered).toHaveLength(0);
    busy = false;
    await tick(16_000);
    expect(delivered).toHaveLength(1);
  });

  it('keeps pending wakeups in a file, and a reopened chat gets them back', async () => {
    const first = host();
    await first.wk.forChat('chat1').schedule({ delay: '2h', reason: 'later' });
    expect(JSON.parse(readFileSync(wakeupFile(dir, 'chat1'), 'utf8'))).toHaveLength(1);
    first.wk.release();

    const second = host();
    const scheduler = second.wk.forChat('chat1');
    await vi.waitFor(() => expect(scheduler.list().map((w) => w.reason)).toEqual(['later']));
    await tick(7_300_000);
    expect(second.delivered).toHaveLength(1);
    await vi.waitFor(() => expect(existsSync(wakeupFile(dir, 'chat1'))).toBe(false));
  });

  it('keeps one chat\'s wakeups apart from another\'s, and stops the old timers when the chat changes', async () => {
    const { wk, delivered } = host();
    await wk.forChat('a').schedule({ delay: '1m', reason: 'for a' });
    wk.forChat('b');
    await tick(120_000);
    expect(delivered).toHaveLength(0);
    expect(JSON.parse(readFileSync(wakeupFile(dir, 'a'), 'utf8'))[0].reason).toBe('for a');
  });

  it('Stop cancels everything pending, in memory and in the file', async () => {
    const { wk, delivered } = host();
    await wk.forChat('chat1').schedule({ delay: '1m', reason: 'x' });
    await wk.cancelAll();
    await tick(120_000);
    expect(delivered).toHaveLength(0);
    expect(existsSync(wakeupFile(dir, 'chat1'))).toBe(false);
  });

  it('reads a damaged file as empty instead of failing', async () => {
    mkdirSync(path.dirname(wakeupFile(dir, 'bad')), { recursive: true });
    writeFileSync(wakeupFile(dir, 'bad'), '{ not json');
    expect(await fileWakeupStore(wakeupFile(dir, 'bad')).load()).toEqual([]);
    writeFileSync(wakeupFile(dir, 'bad'), JSON.stringify([{ id: 'x' }, { id: 'w', reason: 'ok', dueAt: 1, created: 0 }]));
    expect((await fileWakeupStore(wakeupFile(dir, 'bad')).load()).map((w) => w.id)).toEqual(['w']);
  });

  it('a chat id cannot reach outside the folder', () => {
    expect(path.relative(dir, wakeupFile(dir, '../../etc/x'))).toMatch(/^wakeups[\\/]/);
  });

  it('does not show up in the list of saved chats', async () => {
    const { wk } = host();
    await wk.forChat('chat1').schedule({ delay: '1m', reason: 'x' });
    expect(await listSessions(dir)).toEqual([]);
  });
});
