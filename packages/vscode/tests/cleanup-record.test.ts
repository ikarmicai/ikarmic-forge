import { describe, expect, it, vi } from 'vitest';

import { cleanupLine, readCleanup, recordCleanup } from '../src/settings/cleanup-record.js';
import { getSettingsHtml } from '../src/settings/settings-html.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

/**
 * Old chats are deleted when VS Code starts, or on request, and nothing said it had happened. The Context page now
 * says when it last ran and how many chats it deleted.
 */
const DAY = 86_400_000;
const now = new Date('2026-10-29T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('cleanupLine', () => {
  it('says none has run yet', () => {
    expect(cleanupLine(undefined, now)).toBe('No cleanup has run yet.');
  });

  it('says when, in days a person would say, and how many chats went', () => {
    expect(cleanupLine({ at: ago(2 * 3_600_000), deleted: 4 }, now)).toBe('Last cleanup: today. 4 chats deleted.');
    expect(cleanupLine({ at: ago(DAY + 3_600_000), deleted: 1 }, now)).toBe('Last cleanup: yesterday. 1 chat deleted.');
    expect(cleanupLine({ at: ago(9 * DAY), deleted: 0 }, now)).toBe('Last cleanup: 9 days ago. No chats were old enough.');
  });

  it('does not trust a time it cannot read, or one in the future', () => {
    expect(cleanupLine({ at: 'not a date', deleted: 2 }, now)).toBe('No cleanup has run yet.');
    expect(cleanupLine({ at: new Date(now.getTime() + 5 * DAY).toISOString(), deleted: 2 }, now)).toBe('Last cleanup: today. 2 chats deleted.');
  });
});

describe('recordCleanup and readCleanup', () => {
  const memento = () => {
    const store = new Map<string, unknown>();
    return { get: (k: string) => store.get(k), update: async (k: string, v: unknown) => void store.set(k, v) };
  };

  it('keeps the last one', async () => {
    const m = memento();
    expect(readCleanup(m)).toBeUndefined();
    await recordCleanup(m, 3, now);
    expect(readCleanup(m)).toEqual({ at: now.toISOString(), deleted: 3 });
    await recordCleanup(m, 0, new Date(now.getTime() + DAY));
    expect(readCleanup(m)?.deleted).toBe(0);
  });

  it('ignores a stored value that is not the shape it wrote', () => {
    const m = memento();
    void m.update('forge.chatCleanup', { at: 5, deleted: 'x' });
    expect(readCleanup(m)).toBeUndefined();
  });
});

describe('on the Settings page', () => {
  function deps(days: number | undefined, count: number) {
    const prune = vi.fn(async () => ({ deleted: Array.from({ length: count }, (_, i) => `s${i}`), kept: 0 }));
    const record = vi.fn().mockResolvedValue(undefined);
    const last = vi.fn().mockReturnValue({ at: now.toISOString(), deleted: 2 });
    return {
      prune,
      record,
      all: {
        loadForgeConfigFile: vi.fn().mockResolvedValue({ config: days ? { sessionRetentionDays: days } : {} }),
        sessions: { dir: '/s', prune, confirm: vi.fn().mockResolvedValue(true), record, last },
      } as unknown as SettingsDeps,
    };
  }

  it('records a cleanup the person asked for, with how many chats went', async () => {
    const d = deps(30, 4);
    await handleSettingsMessage({ type: 'pruneChats' }, d.all);
    expect(d.record).toHaveBeenCalledWith(4);
  });

  it('records nothing when nothing was deleted because the person said no', async () => {
    const d = deps(30, 4);
    (d.all.sessions!.confirm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    await handleSettingsMessage({ type: 'pruneChats' }, d.all);
    expect(d.record).not.toHaveBeenCalled();
  });

  it('sends the last cleanup for the page to show', async () => {
    const d = deps(30, 0);
    expect(await handleSettingsMessage({ type: 'loadCleanup' }, d.all)).toEqual({ type: 'cleanupLoaded', last: { at: now.toISOString(), deleted: 2 } });
  });

  it('shows it under the days setting, and asks for it when Context and memory opens', () => {
    const html = getSettingsHtml();
    expect(html).toContain('id="cleanup-last"');
    expect(html.indexOf('id="cleanup-last"')).toBeGreaterThan(html.indexOf('id="retention-days"'));
    expect(html).toMatch(/name === 'context'[^\n]*loadCleanup/);
    expect(html).toContain('FS.cleanupLine(');
  });
});
