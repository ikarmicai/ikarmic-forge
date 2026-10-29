import { describe, expect, it, vi } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { SETTING_ROWS } from '../src/settings/settings-rows.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

/**
 * "Reset all" puts the settings on the Settings pages back to their defaults. It is destructive, so it asks first,
 * touches only those rows (never keys, MCP servers, agents or permissions) and says how many it changed.
 */
function deps(over: { changed?: string[]; confirm?: boolean | 'absent' } = {}) {
  const changed = new Set(over.changed ?? []);
  const update = vi.fn().mockResolvedValue(undefined);
  const confirm = vi.fn().mockResolvedValue(over.confirm !== false);
  const rows = {
    get: (key: string) => (changed.has(key) ? 'changed' : 'default'),
    defaultOf: () => 'default',
    describe: () => '',
    update,
    ...(over.confirm === 'absent' ? {} : { confirm }),
  };
  return { update, confirm, all: { rows } as unknown as SettingsDeps };
}

describe('Reset all settings', () => {
  it('asks first, says how many it will reset and what it leaves alone', async () => {
    const d = deps({ changed: ['forge.maxSteps', 'forge.goalMaxTurns'] });
    await handleSettingsMessage({ type: 'resetRows' }, d.all);
    expect(d.confirm).toHaveBeenCalledTimes(1);
    const [message, detail, action] = d.confirm.mock.calls[0]!;
    expect(message).toContain('2 settings');
    expect(detail).toMatch(/API keys/);
    expect(detail).toMatch(/MCP servers/);
    expect(action).toBe('Reset');
  });

  it('resets only the rows that are not at their default, and nothing when the person says no', async () => {
    const yes = deps({ changed: ['forge.maxSteps', 'forge.goalMaxTurns'] });
    await handleSettingsMessage({ type: 'resetRows' }, yes.all);
    expect(yes.update.mock.calls.map((c) => c[0]).sort()).toEqual(['forge.goalMaxTurns', 'forge.maxSteps']);
    expect(yes.update.mock.calls.every((c) => c[1] === undefined)).toBe(true);

    const no = deps({ changed: ['forge.maxSteps'], confirm: false });
    expect(await handleSettingsMessage({ type: 'resetRows' }, no.all)).toEqual({ type: 'none' });
    expect(no.update).not.toHaveBeenCalled();
  });

  it('only ever touches a key that has a row', async () => {
    const d = deps({ changed: SETTING_ROWS.map((r) => r.key) });
    await handleSettingsMessage({ type: 'resetRows' }, d.all);
    const keys = new Set(SETTING_ROWS.map((r) => r.key));
    expect(d.update.mock.calls.every((c) => keys.has(c[0] as string))).toBe(true);
    expect(d.update).toHaveBeenCalledTimes(SETTING_ROWS.length);
  });

  it('says so, and asks nothing, when everything is already at its default', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'resetRows' }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it('shows the rows again after a reset', async () => {
    const d = deps({ changed: ['forge.maxSteps'] });
    const r = await handleSettingsMessage({ type: 'resetRows' }, d.all);
    expect(r).toMatchObject({ type: 'rowsLoaded' });
  });

  it('refuses, and changes nothing, where there is no way to ask', async () => {
    const d = deps({ changed: ['forge.maxSteps'], confirm: 'absent' });
    const r = await handleSettingsMessage({ type: 'resetRows' }, d.all);
    expect(r).toMatchObject({ type: 'error' });
    expect(d.update).not.toHaveBeenCalled();
  });
});

describe('the Backup page', () => {
  const html = getSettingsHtml();

  it('has a Reset all settings button, named for what it does, that asks the host', () => {
    expect(html).toContain('id="reset-rows"');
    expect(html).toContain('Reset all settings');
    expect(html).toContain("type: 'resetRows'");
  });

  it('refuses a file too large to be a settings export, in words, before reading it', () => {
    expect(html).toContain('file.size >');
    expect(html).toContain('too large to be a settings export');
  });
});
