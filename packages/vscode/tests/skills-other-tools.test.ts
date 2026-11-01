import { describe, expect, it, vi } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

/** RB-117: skills installed for Claude Code and Cursor are read by default; the Skills page can switch that off. */
function deps(config: { otherToolSkills?: boolean } = {}) {
  let stored = { ...config };
  const loadForgeConfigFile = vi.fn(async () => ({ config: { ...stored }, warnings: [] }));
  const saveForgeConfigFile = vi.fn(async (partial: { otherToolSkills?: boolean }) => void (stored = { ...stored, ...partial }));
  const skills = { list: vi.fn(async () => []), open: vi.fn(), catalog: vi.fn(), install: vi.fn() };
  return { saveForgeConfigFile, all: { loadForgeConfigFile, saveForgeConfigFile, skills } as unknown as SettingsDeps };
}

describe('Settings: skills from Claude Code and Cursor', () => {
  it('lists them as on unless the config says false', async () => {
    expect(await handleSettingsMessage({ type: 'skillsList' }, deps().all)).toMatchObject({ type: 'skillsListed', otherTools: true });
    expect(await handleSettingsMessage({ type: 'skillsList' }, deps({ otherToolSkills: false }).all)).toMatchObject({ otherTools: false });
  });

  it('saves the choice to the user config and lists again', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'skillOtherTools', enabled: false }, d.all);
    expect(d.saveForgeConfigFile).toHaveBeenCalledWith({ otherToolSkills: false }, undefined);
    expect(r).toMatchObject({ type: 'skillsListed', otherTools: false });
  });

  it('says what the switch does, in words, on the page', () => {
    const html = getSettingsHtml();
    expect(html).toContain("type: 'skillOtherTools'");
    expect(html).toContain('Use skills installed for Claude Code and Cursor');
    expect(html).not.toContain('otherToolSkills');
  });
});
