import { describe, expect, it, vi } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

/** RB-115: a link with several skills lets the person choose; what Forge installed can be updated and removed from Settings. */
const skill = (name: string, path: string) => ({ name, description: `${name} does a thing.`, body: 'b', source: { kind: 'global' as const, path } });
const PDF = '/h/.forge/skills/pdf/SKILL.md';
const MINE = '/h/.forge/skills/mine.md';
const OTHER = '/h/.agents/skills/theirs/SKILL.md';

function deps(over: { found?: Array<{ name: string; description: string; files: number }>; update?: unknown; remove?: boolean } = {}) {
  const loadForgeConfigFile = vi.fn(async () => ({ config: {}, warnings: [] }));
  const saveForgeConfigFile = vi.fn(async () => undefined);
  const skills = {
    list: vi.fn(async () => [skill('pdf', PDF), skill('mine', MINE), skill('theirs', OTHER)]),
    open: vi.fn(),
    catalog: vi.fn(),
    install: vi.fn(),
    inspectLink: vi.fn(async () => over.found ?? [{ name: 'pdf', description: 'pdf does a thing.', files: 2 }]),
    installLink: vi.fn(async (_link: string, names?: string[]) => ({ installed: (names ?? ['pdf']).map((name) => ({ name })), skipped: [] as Array<{ name: string; reason: string }> })),
    managed: vi.fn(async () => [{ name: 'pdf', path: PDF, source: 'o/r' }, { name: 'mine', path: MINE }]),
    update: vi.fn(async () => over.update ?? [{ name: 'pdf', status: 'updated' }]),
    remove: vi.fn(async () => over.remove ?? true),
  };
  return { skills, all: { loadForgeConfigFile, saveForgeConfigFile, skills } as unknown as SettingsDeps };
}

describe('Settings: choosing among the skills a link holds', () => {
  it('shows the choice when the link holds several skills, and installs nothing yet', async () => {
    const d = deps({ found: [{ name: 'a', description: 'a', files: 1 }, { name: 'b', description: 'b', files: 3 }] });
    const r = await handleSettingsMessage({ type: 'skillAddLink', url: 'o/r' }, d.all);
    expect(r).toMatchObject({ type: 'skillPick', link: 'o/r', skills: [{ name: 'a' }, { name: 'b', files: 3 }] });
    expect(d.skills.installLink).not.toHaveBeenCalled();
  });

  it('installs a link with one skill at once, without asking', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'skillAddLink', url: 'o/r' }, d.all);
    expect(d.skills.installLink).toHaveBeenCalledWith('o/r');
    expect(r).toMatchObject({ type: 'skillsListed', note: 'Added pdf.' });
  });

  it('installs the ones that were ticked', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'skillInstallPicked', link: 'o/r', names: ['a', 'c'] }, d.all);
    expect(d.skills.installLink).toHaveBeenCalledWith('o/r', ['a', 'c']);
    expect(r).toMatchObject({ type: 'skillsListed', note: 'Added a, c.' });
  });

  it('asks for at least one when none was ticked', async () => {
    const d = deps();
    expect(await handleSettingsMessage({ type: 'skillInstallPicked', link: 'o/r', names: [] }, d.all)).toMatchObject({ type: 'notice' });
    expect(d.skills.installLink).not.toHaveBeenCalled();
  });
});

describe('Settings: update and remove', () => {
  it('marks only the skills in the person\'s own folder as removable, and those Forge installed as updatable', async () => {
    const r = await handleSettingsMessage({ type: 'skillsList' }, deps().all);
    const by = Object.fromEntries((r as { skills: Array<{ name: string; removable?: boolean; updatable?: boolean; from?: string }> }).skills.map((s) => [s.name, s]));
    expect(by.pdf).toMatchObject({ removable: true, updatable: true, from: 'o/r' });
    expect(by.mine).toMatchObject({ removable: true, updatable: false });
    expect(by.theirs).toMatchObject({ removable: false, updatable: false });
  });

  it('removes a skill from the person\'s folder, and refuses one that is not theirs to remove', async () => {
    const d = deps();
    expect(await handleSettingsMessage({ type: 'skillRemove', name: 'pdf' }, d.all)).toMatchObject({ type: 'skillsListed', note: 'Removed pdf.' });
    expect(d.skills.remove).toHaveBeenCalledWith('pdf');
    const r = await handleSettingsMessage({ type: 'skillRemove', name: 'theirs' }, d.all);
    expect(r).toMatchObject({ type: 'notice', message: expect.stringContaining('theirs') });
    expect(d.skills.remove).toHaveBeenCalledTimes(1);
  });

  it('says in words what an update did', async () => {
    const d = deps({ update: [{ name: 'pdf', status: 'updated' }, { name: 'docx', status: 'up to date' }, { name: 'x', status: 'changed on this computer' }, { name: 'y', status: 'failed', message: 'Could not reach the server.' }] });
    const r = await handleSettingsMessage({ type: 'skillUpdate' }, d.all);
    expect(d.skills.update).toHaveBeenCalledWith(undefined, false);
    const note = (r as { note?: string }).note ?? '';
    expect(note).toContain('Updated pdf.');
    expect(note).toContain('docx is up to date.');
    expect(note).toContain('x was changed on this computer, so it was left alone.');
    expect(note).toContain('y: Could not reach the server.');
    expect(note).not.toMatch(/changed on this computer"|status/);
  });

  it('updates one skill by name', async () => {
    const d = deps();
    await handleSettingsMessage({ type: 'skillUpdate', name: 'pdf' }, d.all);
    expect(d.skills.update).toHaveBeenCalledWith('pdf', false);
  });
});

describe('Settings page: choose, update, remove', () => {
  const html = getSettingsHtml();
  it('has the messages and the words for them', () => {
    for (const type of ['skillInstallPicked', 'skillUpdate', 'skillRemove']) expect(html).toContain(`type: '${type}'`);
    expect(html).toContain("case 'skillPick'");
    for (const words of ['Install selected', 'Update all', 'Remove']) expect(html).toContain(words);
  });
});
