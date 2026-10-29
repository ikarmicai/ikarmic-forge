import { describe, expect, it, vi } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

const skill = (name: string, kind: 'builtin' | 'global' | 'remote' = 'global') => ({
  name,
  description: `${name} does a thing.`,
  body: 'b',
  source: { kind, path: kind === 'builtin' ? `(built into Forge: ${name})` : `/skills/${name}.md` },
});

function deps(over: { listed?: unknown[]; fetched?: { skills: unknown[]; warnings: string[] }; picked?: { fileName: string; content: string } | undefined; paths?: string[] } = {}) {
  let paths = over.paths ?? [];
  const loadForgeConfigFile = vi.fn(async () => ({ config: paths.length ? { skillPaths: [...paths] } : {}, warnings: [] }));
  const saveForgeConfigFile = vi.fn(async (partial: { skillPaths?: string[] }) => void (paths = partial.skillPaths ?? paths));
  const skills = {
    list: vi.fn(async () => over.listed ?? [skill('forge-config', 'builtin')]),
    open: vi.fn(),
    catalog: vi.fn(),
    install: vi.fn(),
    fetchLink: vi.fn(async () => over.fetched ?? { skills: [skill('team-style', 'remote')], warnings: [] }),
    pickFile: vi.fn(async () => over.picked),
    saveOwn: vi.fn(async (fileName: string) => `/home/me/.forge/skills/${fileName}`),
  };
  return { loadForgeConfigFile, saveForgeConfigFile, skills, all: { loadForgeConfigFile, saveForgeConfigFile, skills } as unknown as SettingsDeps, paths: () => paths };
}

describe('Settings: add a skill by link', () => {
  it('reads the link first, then adds it to the user skill paths', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'skillAddLink', url: 'https://example.com/skills.json' }, d.all);
    expect(d.skills.fetchLink).toHaveBeenCalledWith('https://example.com/skills.json');
    expect(d.saveForgeConfigFile).toHaveBeenCalledWith({ skillPaths: ['https://example.com/skills.json'] }, undefined);
    expect(r).toMatchObject({ type: 'skillsListed' });
  });

  it('keeps the links already there', async () => {
    const d = deps({ paths: ['~/team-skills'] });
    await handleSettingsMessage({ type: 'skillAddLink', url: 'https://example.com/a.md' }, d.all);
    expect(d.paths()).toEqual(['~/team-skills', 'https://example.com/a.md']);
  });

  it('refuses anything but https, and saves nothing', async () => {
    const d = deps();
    for (const url of ['http://example.com/a.md', 'file:///etc/passwd', 'example.com/a.md', '  ']) {
      expect(await handleSettingsMessage({ type: 'skillAddLink', url }, d.all)).toMatchObject({ type: 'notice' });
    }
    expect(d.skills.fetchLink).not.toHaveBeenCalled();
    expect(d.saveForgeConfigFile).not.toHaveBeenCalled();
  });

  it('saves nothing when the link holds no skill, and passes on why', async () => {
    const d = deps({ fetched: { skills: [], warnings: ['https://example.com/a.md answered 404'] } });
    const r = await handleSettingsMessage({ type: 'skillAddLink', url: 'https://example.com/a.md' }, d.all);
    expect(r).toMatchObject({ type: 'notice', message: expect.stringContaining('404') });
    expect(d.saveForgeConfigFile).not.toHaveBeenCalled();
  });

  it('does not add the same link twice', async () => {
    const d = deps({ paths: ['https://example.com/a.md'] });
    const r = await handleSettingsMessage({ type: 'skillAddLink', url: 'https://example.com/a.md' }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect(d.saveForgeConfigFile).not.toHaveBeenCalled();
  });

  it('says when a skill takes precedence over a bundled one of the same name', async () => {
    const d = deps({ fetched: { skills: [skill('forge-config', 'remote')], warnings: [] } });
    const r = await handleSettingsMessage({ type: 'skillAddLink', url: 'https://example.com/a.md' }, d.all);
    expect(r).toMatchObject({ type: 'skillsListed', note: expect.stringContaining('forge-config') });
  });
});

describe('Settings: add a skill from a file', () => {
  const GOOD = '---\nname: my-style\ndescription: How we write.\n---\nBe brief.\n';

  it('copies a chosen skill file into the person\'s skills folder', async () => {
    const d = deps({ picked: { fileName: 'my-style.md', content: GOOD } });
    const r = await handleSettingsMessage({ type: 'skillAddFile' }, d.all);
    expect(d.skills.saveOwn).toHaveBeenCalledWith('my-style.md', GOOD);
    expect(r).toMatchObject({ type: 'skillsListed' });
  });

  it('does nothing when the person closes the file chooser', async () => {
    const d = deps({ picked: undefined });
    expect(await handleSettingsMessage({ type: 'skillAddFile' }, d.all)).toEqual({ type: 'none' });
    expect(d.skills.saveOwn).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a skill, without copying it', async () => {
    const d = deps({ picked: { fileName: 'notes.md', content: 'just some notes, no front matter at all' } });
    const r = await handleSettingsMessage({ type: 'skillAddFile' }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect(d.skills.saveOwn).not.toHaveBeenCalled();
  });

  it('refuses a file name that could leave the skills folder', async () => {
    const d = deps({ picked: { fileName: '../../evil.md', content: GOOD } });
    expect(await handleSettingsMessage({ type: 'skillAddFile' }, d.all)).toMatchObject({ type: 'notice' });
    expect(d.skills.saveOwn).not.toHaveBeenCalled();
  });
});

describe('Settings page: Add your own skill', () => {
  const html = getSettingsHtml();
  it('has a link field and a file button under the skills list', () => {
    expect(html).toContain("type: 'skillAddLink'");
    expect(html).toContain("type: 'skillAddFile'");
    expect(html).toContain('Choose a file');
  });
  it('shows a note the host sends after adding', () => {
    expect(html).toMatch(/msg\.note/);
  });
});
