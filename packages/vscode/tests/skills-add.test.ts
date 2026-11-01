import { describe, expect, it, vi } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

const skill = (name: string, kind: 'builtin' | 'global' | 'remote' = 'global') => ({
  name,
  description: `${name} does a thing.`,
  body: 'b',
  source: { kind, path: kind === 'builtin' ? `(built into Forge: ${name})` : `/skills/${name}.md` },
});

function deps(
  over: {
    listed?: unknown[];
    fetched?: { skills: unknown[]; warnings: string[] };
    picked?: { fileName: string; content: string } | undefined;
    paths?: string[];
    installed?: { installed: Array<{ name: string }>; skipped: Array<{ name: string; reason: string }> };
    installError?: string;
    /** The link was read and is not a skill (a list of skill files), as opposed to: it could not be read. */
    notASkill?: boolean;
  } = {}
) {
  let paths = over.paths ?? [];
  const loadForgeConfigFile = vi.fn(async () => ({ config: paths.length ? { skillPaths: [...paths] } : {}, warnings: [] }));
  const saveForgeConfigFile = vi.fn(async (partial: { skillPaths?: string[] }) => void (paths = partial.skillPaths ?? paths));
  const skills = {
    list: vi.fn(async () => over.listed ?? [skill('forge-config', 'builtin')]),
    open: vi.fn(),
    catalog: vi.fn(),
    install: vi.fn(),
    installLink: vi.fn(async () => {
      if (over.installError) throw Object.assign(new Error(over.installError), { notASkill: over.notASkill === true });
      return over.installed ?? { installed: [{ name: 'team-style' }], skipped: [] };
    }),
    fetchLink: vi.fn(async () => over.fetched ?? { skills: [skill('team-style', 'remote')], warnings: [] }),
    pickFile: vi.fn(async () => over.picked),
    saveOwn: vi.fn(async (fileName: string) => `/home/me/.forge/skills/${fileName}`),
  };
  return { loadForgeConfigFile, saveForgeConfigFile, skills, all: { loadForgeConfigFile, saveForgeConfigFile, skills } as unknown as SettingsDeps, paths: () => paths };
}

describe('Settings: add a skill by link', () => {
  it('downloads the skill and does not keep the link in the skill paths (RB-115)', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'skillAddLink', url: 'o/r' }, d.all);
    expect(d.skills.installLink).toHaveBeenCalledWith('o/r');
    expect(d.saveForgeConfigFile).not.toHaveBeenCalled();
    expect(r).toMatchObject({ type: 'skillsListed', note: 'Added team-style.' });
  });

  it('takes a GitHub address as well as owner/repo', async () => {
    const d = deps();
    await handleSettingsMessage({ type: 'skillAddLink', url: ' https://github.com/o/r/tree/main/skills/pdf ' }, d.all);
    expect(d.skills.installLink).toHaveBeenCalledWith('https://github.com/o/r/tree/main/skills/pdf');
  });

  it('passes on in words why a link could not be added, and saves nothing', async () => {
    const d = deps({ installError: 'Could not find o/r on GitHub, or the folder in it.' });
    const r = await handleSettingsMessage({ type: 'skillAddLink', url: 'o/r' }, d.all);
    expect(r).toMatchObject({ type: 'notice', message: 'Could not find o/r on GitHub, or the folder in it.' });
    expect(d.saveForgeConfigFile).not.toHaveBeenCalled();
  });

  it('says so when every skill in the link was installed already', async () => {
    const d = deps({ installed: { installed: [], skipped: [{ name: 'team-style', reason: 'already installed' }] } });
    const r = await handleSettingsMessage({ type: 'skillAddLink', url: 'o/r' }, d.all);
    expect(r).toMatchObject({ type: 'notice', message: expect.stringContaining('already installed') });
  });

  it('asks for something when the field is empty', async () => {
    const d = deps();
    expect(await handleSettingsMessage({ type: 'skillAddLink', url: '  ' }, d.all)).toMatchObject({ type: 'notice' });
    expect(d.skills.installLink).not.toHaveBeenCalled();
  });

  it('keeps a list of skill files as a live link, since there is no folder to copy', async () => {
    const d = deps({ installError: 'not a skill', notASkill: true, paths: ['~/team-skills'] });
    const r = await handleSettingsMessage({ type: 'skillAddLink', url: 'https://example.com/skills.json' }, d.all);
    expect(d.paths()).toEqual(['~/team-skills', 'https://example.com/skills.json']);
    expect(r).toMatchObject({ type: 'skillsListed' });
  });

  it('does not add a live link twice, and saves nothing when the list holds no skill', async () => {
    const twice = deps({ installError: 'not a skill', notASkill: true, paths: ['https://example.com/a.json'] });
    expect(await handleSettingsMessage({ type: 'skillAddLink', url: 'https://example.com/a.json' }, twice.all)).toMatchObject({ type: 'notice' });
    expect(twice.saveForgeConfigFile).not.toHaveBeenCalled();
    const empty = deps({ installError: 'It is not a skill.', notASkill: true, fetched: { skills: [], warnings: ['x'] } });
    expect(await handleSettingsMessage({ type: 'skillAddLink', url: 'https://example.com/b.json' }, empty.all)).toMatchObject({ type: 'notice', message: 'It is not a skill.' });
    expect(empty.saveForgeConfigFile).not.toHaveBeenCalled();
  });

  it('tells the real reason, not "already in your skill paths", when a saved address cannot be read now', async () => {
    const d = deps({ installError: 'Could not read https://example.com/a.json (the server answered 500).', paths: ['https://example.com/a.json'] });
    const r = await handleSettingsMessage({ type: 'skillAddLink', url: 'https://example.com/a.json' }, d.all);
    expect(r).toMatchObject({ type: 'notice', message: expect.stringContaining('500') });
    expect(d.skills.fetchLink).not.toHaveBeenCalled();
  });

  it('says why a catalog skill could not be installed', async () => {
    const d = deps();
    d.skills.install.mockResolvedValue('GitHub is limiting requests. Set a GitHub token, or try again later.');
    const r = await handleSettingsMessage({ type: 'skillInstall', name: 'x' }, d.all);
    expect(r).toMatchObject({ type: 'notice', message: expect.stringContaining('limiting requests') });
    d.skills.install.mockResolvedValue(false);
    expect(await handleSettingsMessage({ type: 'skillInstall', name: 'x' }, d.all)).toMatchObject({ type: 'notice', message: 'Could not install skill "x".' });
  });

  it('says when a skill takes precedence over a bundled one of the same name', async () => {
    const d = deps({ listed: [skill('forge-config', 'builtin')], installed: { installed: [{ name: 'forge-config' }], skipped: [] } });
    const r = await handleSettingsMessage({ type: 'skillAddLink', url: 'o/r' }, d.all);
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
