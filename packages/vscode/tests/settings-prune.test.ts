import { describe, expect, it, vi } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

/**
 * Chats older than "Days to keep chats" are deleted once, when VS Code starts. "Delete old chats now" does it on
 * request, and, being a delete, counts first, asks, and says how many went.
 */
function deps(over: { days?: number; count?: number; confirm?: boolean; absent?: boolean } = {}) {
  const prune = vi.fn(async (_dir: string, opts: { dryRun?: boolean }) => ({ deleted: Array.from({ length: over.count ?? 0 }, (_, i) => `s${i}`), kept: 3, dry: opts.dryRun === true }));
  const confirm = vi.fn().mockResolvedValue(over.confirm !== false);
  const loadForgeConfigFile = vi.fn().mockResolvedValue({ config: over.days === undefined ? {} : { sessionRetentionDays: over.days } });
  const all = {
    loadForgeConfigFile,
    configPath: '/cfg',
    ...(over.absent ? {} : { sessions: { dir: '/sessions', prune, confirm } }),
  } as unknown as SettingsDeps;
  return { prune, confirm, all };
}

describe('Delete old chats now', () => {
  it('asks to set the number of days first, and touches nothing, when none is saved', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'pruneChats' }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect((r as { message: string }).message).toContain('Days to keep chats');
    expect(d.prune).not.toHaveBeenCalled();
  });

  it('counts first without deleting, and says so when there is nothing to delete', async () => {
    const d = deps({ days: 30, count: 0 });
    const r = await handleSettingsMessage({ type: 'pruneChats' }, d.all);
    expect(d.prune).toHaveBeenCalledTimes(1);
    expect(d.prune.mock.calls[0]![1]).toMatchObject({ olderThanDays: 30, dryRun: true });
    expect(d.confirm).not.toHaveBeenCalled();
    expect((r as { message: string }).message).toContain('No chats');
  });

  it('asks with the number and the days, and deletes only if the person agrees', async () => {
    const yes = deps({ days: 30, count: 4 });
    const r = await handleSettingsMessage({ type: 'pruneChats' }, yes.all);
    const [message, detail, action] = yes.confirm.mock.calls[0]!;
    expect(message).toContain('4 chats');
    expect(message).toContain('30 days');
    expect(detail).toMatch(/cannot be undone/i);
    expect(action).toBe('Delete');
    expect(yes.prune).toHaveBeenCalledTimes(2);
    expect(yes.prune.mock.calls[1]![1]).toMatchObject({ olderThanDays: 30 });
    expect(yes.prune.mock.calls[1]![1].dryRun).not.toBe(true);
    expect((r as { message: string }).message).toContain('Deleted 4 chats');

    const no = deps({ days: 30, count: 4, confirm: false });
    expect(await handleSettingsMessage({ type: 'pruneChats' }, no.all)).toEqual({ type: 'none' });
    expect(no.prune).toHaveBeenCalledTimes(1);
  });

  it('says "1 chat" for one', async () => {
    const d = deps({ days: 7, count: 1 });
    await handleSettingsMessage({ type: 'pruneChats' }, d.all);
    expect(d.confirm.mock.calls[0]![0]).toContain('1 chat ');
  });

  it('does nothing where there is no chat folder to look in', async () => {
    expect(await handleSettingsMessage({ type: 'pruneChats' }, deps({ absent: true }).all)).toEqual({ type: 'none' });
  });
});

describe('the Context page', () => {
  const html = getSettingsHtml();
  it('has a button named for what it does, next to the days setting', () => {
    expect(html).toContain('id="prune-chats"');
    expect(html).toContain('Delete old chats now');
    expect(html).toContain("type: 'pruneChats'");
    expect(html.indexOf('id="prune-chats"')).toBeGreaterThan(html.indexOf('id="retention-days"'));
  });
});
