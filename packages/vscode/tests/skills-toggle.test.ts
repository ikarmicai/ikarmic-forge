import { describe, expect, it, vi } from 'vitest';

import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';
import { getSettingsHtml } from '../src/settings/settings-html.js';

const skill = (name: string, kind: 'builtin' | 'global' = 'global') => ({
  name,
  description: `${name} does a thing.`,
  body: 'b',
  source: { kind, path: kind === 'builtin' ? `(built into Forge: ${name})` : `/skills/${name}.md` },
});

function deps(initial: string[] = []) {
  let disabled = [...initial];
  const loadForgeConfigFile = vi.fn(async () => ({ config: disabled.length ? { disabledSkills: [...disabled] } : {}, warnings: [] }));
  const saveForgeConfigFile = vi.fn(async (partial: { disabledSkills?: string[] }) => {
    disabled = partial.disabledSkills ?? [];
  });
  const skills = {
    list: vi.fn(async () => [skill('forge-config', 'builtin'), skill('mine')]),
    open: vi.fn(),
    catalog: vi.fn(),
    install: vi.fn(),
  };
  return { loadForgeConfigFile, saveForgeConfigFile, skills, all: { loadForgeConfigFile, saveForgeConfigFile, skills } as unknown as SettingsDeps };
}

describe('Settings: skills switch', () => {
  it('lists every skill with whether it is on, and a bundled skill with its own kind', async () => {
    const d = deps(['mine']);
    const r = await handleSettingsMessage({ type: 'skillsList' }, d.all);
    expect(r).toMatchObject({
      type: 'skillsListed',
      skills: [
        { name: 'forge-config', scope: 'builtin', enabled: true },
        { name: 'mine', scope: 'global', enabled: false },
      ],
    });
  });

  it('switches a bundled skill off by writing its name to the user config', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'skillToggle', name: 'forge-config' }, d.all);
    expect(d.saveForgeConfigFile).toHaveBeenCalledWith({ disabledSkills: ['forge-config'] }, undefined);
    expect(r).toMatchObject({ type: 'skillsListed', skills: [{ name: 'forge-config', enabled: false }, { name: 'mine', enabled: true }] });
  });

  it('switches it back on, and keeps the other names', async () => {
    const d = deps(['forge-config', 'mine']);
    const r = await handleSettingsMessage({ type: 'skillToggle', name: 'forge-config' }, d.all);
    expect(d.saveForgeConfigFile).toHaveBeenCalledWith({ disabledSkills: ['mine'] }, undefined);
    expect(r).toMatchObject({ type: 'skillsListed', skills: [{ name: 'forge-config', enabled: true }, { name: 'mine', enabled: false }] });
  });

  it('ignores a name that is not a skill the page was shown (the page is not trusted)', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'skillToggle', name: 'ghost' }, d.all);
    expect(d.saveForgeConfigFile).not.toHaveBeenCalled();
    expect(r).toMatchObject({ type: 'notice' });
  });
});

describe('Settings page: skills switch', () => {
  const html = getSettingsHtml();

  it('groups bundled skills under their own heading and labels the switch for assistive technology', () => {
    expect(html).toContain('Built into Forge');
    expect(html).toContain("'Turn ' + s.name + ' on or off for the model'");
  });

  it('tells the person the switch applies to every skill of that name', () => {
    expect(html).toMatch(/every skill with that name/i);
  });

  it('shows no snake_case in the new text', () => {
    const block = html.slice(html.indexOf('function renderSkills'), html.indexOf('function say('));
    const text = block.match(/'[A-Z][^']{8,}'/g) ?? [];
    for (const t of text) expect(t).not.toMatch(/[a-z]+_[a-z]+/);
  });
});
