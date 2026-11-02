import { describe, expect, it, vi } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

/**
 * Settings → Skills: make a skill, bring one in from a folder or a zip, and share it as a pull request. The page only names
 * what to do; the host reads the files itself, checks them again, asks for a GitHub token only when sharing is confirmed,
 * and opens only addresses it knows (RB-76, RB-20, RB-121).
 */
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const file = (rel: string, text: string) => ({ rel, data: enc(text) });
const skillMd = (name: string) => `---\nname: ${name}\ndescription: ${name} does a thing.\n---\nBody.\n`;
const TOKEN = 'ghp_PAGETESTTOKEN0123456789abcdefghijklm';
const PR = 'https://github.com/ikarmicai/forge-skills/pull/9';

function setup(
  over: {
    own?: Record<string, ReturnType<typeof file>[]>;
    picked?: { files: ReturnType<typeof file>[]; folder: string | null } | undefined;
    pickError?: string;
    saveError?: string;
    token?: string | undefined;
    publishError?: string;
    /** Skills Forge installed from a link: name to the link. */
    sources?: Record<string, string>;
    tokenError?: string;
    /** The publish waits until it is stopped. */
    publishHangs?: boolean;
  } = {}
) {
  const own = over.own ?? { 'pdf-notes': [file('SKILL.md', skillMd('pdf-notes'))] };
  const skills = {
    list: vi.fn(async () => Object.keys(own).map((name) => ({ name, description: `${name} does a thing.`, body: 'b', source: { kind: 'global', path: `/home/me/.forge/skills/${name}/SKILL.md` } }))),
    open: vi.fn(),
    catalog: vi.fn(),
    install: vi.fn(),
    managed: vi.fn(async () => Object.keys(own).map((name) => ({ name, path: `/home/me/.forge/skills/${name}/SKILL.md`, ...(over.sources?.[name] ? { source: over.sources[name] } : {}) }))),
    save: vi.fn(async (_name: string, _files: unknown[], _overwrite: boolean) => {
      if (over.saveError) throw new Error(over.saveError);
    }),
    pickSource: vi.fn(async (_kind: 'folder' | 'zip') => {
      if (over.pickError) throw new Error(over.pickError);
      return over.picked;
    }),
    readOwn: vi.fn(async (name: string) => own[name] ?? []),
    githubToken: vi.fn(async () => {
      if (over.tokenError) throw new Error(over.tokenError);
      return 'token' in over ? over.token : TOKEN;
    }),
    publish: vi.fn(async (_input: any, _token: string, signal: AbortSignal) => {
      if (over.publishHangs) await new Promise((_r, reject) => signal.addEventListener('abort', () => reject(new Error('Sharing the skill was stopped. Your copy of the repository, ada/forge-skills, was kept; nothing was deleted.'))));
      if (over.publishError) throw new Error(over.publishError);
      return { url: PR, number: 9, draft: true, branch: 'skill/pdf-notes-x', fork: 'ada/forge-skills' };
    }),
    openUrl: vi.fn(async (_url: string) => {}),
    defaultHolder: vi.fn(async () => 'Ada Lovelace'),
  };
  const all = {
    loadForgeConfigFile: vi.fn(async () => ({ config: {}, warnings: [] })),
    saveForgeConfigFile: vi.fn(),
    skills,
  } as unknown as SettingsDeps;
  return { skills, all };
}
const send = (msg: Record<string, unknown>, d: ReturnType<typeof setup>) => handleSettingsMessage(msg as never, d.all) as Promise<any>;
const share = (over: Record<string, unknown> = {}) => ({ type: 'skillShare', name: 'pdf-notes', title: 'Add the pdf-notes skill', body: 'It does a thing.', draft: true, licence: 'MIT', holder: 'Ada', ...over });

describe('Settings: create a skill', () => {
  it('writes the skill the form describes and lists it', async () => {
    const d = setup();
    const r = await send({ type: 'skillCreate', name: 'release-notes', description: 'Writes release notes.', instructions: 'List the changes.' }, d);
    expect(d.skills.save).toHaveBeenCalledTimes(1);
    const [name, files, overwrite] = d.skills.save.mock.calls[0]!;
    expect(name).toBe('release-notes');
    expect(overwrite).toBe(false);
    expect(new TextDecoder().decode((files as any[])[0].data)).toBe('---\nname: release-notes\ndescription: Writes release notes.\n---\nList the changes.\n');
    expect(r).toMatchObject({ type: 'skillsListed', note: 'Created release-notes.' });
  });

  it('S1, S2: a name or description that cannot be used is a sentence, and nothing is written', async () => {
    const d = setup();
    for (const msg of [
      { name: '../evil', description: 'd.', instructions: 'i' },
      { name: 'Bad Name', description: 'd.', instructions: 'i' },
      { name: 'ok', description: '', instructions: 'i' },
      { name: 'ok', description: 'one\nname: other', instructions: 'i' },
      { name: 'ok', description: 'd.', instructions: '   ' },
    ]) {
      const r = await send({ type: 'skillCreate', ...msg }, d);
      expect(r.type).toBe('notice');
      expect(r.message).toMatch(/\S/);
    }
    expect(d.skills.save).not.toHaveBeenCalled();
  });

  it('S28: an existing skill is only replaced when the person says so', async () => {
    const d = setup({ saveError: 'A skill called pdf-notes is already in the folder. Choose another name, or replace it on purpose.' });
    const r = await send({ type: 'skillCreate', name: 'pdf-notes', description: 'd.', instructions: 'i' }, d);
    expect(r).toMatchObject({ type: 'notice' });
    expect(r.message).toMatch(/already/);
    await send({ type: 'skillCreate', name: 'pdf-notes', description: 'd.', instructions: 'i', overwrite: true }, d);
    expect(d.skills.save.mock.calls[1]![2]).toBe(true);
  });

  it('a page that sends the wrong kinds of values gets a notice, not a crash', async () => {
    const d = setup();
    const r = await send({ type: 'skillCreate', name: 5, description: null, instructions: {} }, d);
    expect(r.type).toBe('notice');
    expect(d.skills.save).not.toHaveBeenCalled();
  });
});

describe('Settings: bring in a skill from a folder or a zip', () => {
  it('saves what was picked, named by its SKILL.md', async () => {
    const d = setup({ picked: { files: [file('SKILL.md', skillMd('team-style')), file('scripts/run.sh', 'echo\n')], folder: 'some-folder' } });
    const r = await send({ type: 'skillUpload', kind: 'folder' }, d);
    expect(d.skills.pickSource).toHaveBeenCalledWith('folder');
    expect(d.skills.save.mock.calls[0]![0]).toBe('team-style');
    expect(r).toMatchObject({ type: 'skillsListed', note: 'Added team-style.' });
  });

  it('asks for a zip when the page says zip', async () => {
    const d = setup({ picked: { files: [file('SKILL.md', skillMd('team-style'))], folder: null } });
    await send({ type: 'skillUpload', kind: 'zip' }, d);
    expect(d.skills.pickSource).toHaveBeenCalledWith('zip');
  });

  it('does nothing when the chooser is closed', async () => {
    const d = setup({ picked: undefined });
    expect(await send({ type: 'skillUpload', kind: 'folder' }, d)).toEqual({ type: 'none' });
    expect(d.skills.save).not.toHaveBeenCalled();
  });

  it('S5-S8: a folder or zip that cannot be read is a sentence from the host', async () => {
    const d = setup({ pickError: 'notes.zip is not a zip archive.' });
    const r = await send({ type: 'skillUpload', kind: 'zip' }, d);
    expect(r).toEqual({ type: 'notice', message: 'notes.zip is not a zip archive.' });
    expect(d.skills.save).not.toHaveBeenCalled();
  });

  it('refuses a kind the page invented', async () => {
    const d = setup();
    const r = await send({ type: 'skillUpload', kind: 'file:///etc/passwd' }, d);
    expect(r.type).not.toBe('skillsListed');
    expect(d.skills.pickSource).not.toHaveBeenCalled();
  });

  it('uses the folder name when SKILL.md names no skill, and says so when neither does', async () => {
    const noName = [file('SKILL.md', '---\ndescription: d.\n---\nBody\n')];
    const named = setup({ picked: { files: noName, folder: 'from-folder' } });
    await send({ type: 'skillUpload', kind: 'folder' }, named);
    expect(named.skills.save.mock.calls[0]![0]).toBe('from-folder');
    const bare = setup({ picked: { files: noName, folder: null } });
    const r = await send({ type: 'skillUpload', kind: 'zip' }, bare);
    expect(r.type).toBe('notice');
    expect(bare.skills.save).not.toHaveBeenCalled();
  });

  it('S11, S13: the problems of the files come back as one notice', async () => {
    const d = setup({ saveError: '.env does not belong in a skill. scripts/x.sh looks like it holds a key or a password.' });
    d.skills.pickSource.mockResolvedValue({ files: [file('SKILL.md', skillMd('a'))], folder: null });
    const r = await send({ type: 'skillUpload', kind: 'folder' }, d);
    expect(r.message).toContain('.env');
    expect(r.message).toContain('scripts/x.sh');
  });
});

describe('Settings: the share card', () => {
  it('shows the card with the checks of the files, the title, and who the licence is for', async () => {
    const d = setup();
    const r = await send({ type: 'skillShareStart', name: 'pdf-notes' }, d);
    expect(r).toMatchObject({
      type: 'skillShareCard',
      name: 'pdf-notes',
      title: 'Add the pdf-notes skill',
      body: 'pdf-notes does a thing.',
      repo: 'ikarmicai/forge-skills',
      files: 1,
      needsLicence: true,
      holder: 'Ada Lovelace',
      problems: [],
    });
  });

  it('needs no licence choice when the folder has one', async () => {
    const d = setup({ own: { 'pdf-notes': [file('SKILL.md', skillMd('pdf-notes')), file('LICENSE', 'MIT License\n')] } });
    const r = await send({ type: 'skillShareStart', name: 'pdf-notes' }, d);
    expect(r.needsLicence).toBe(false);
  });

  it('S13: lists what stops the skill, and never repeats a key', async () => {
    const d = setup({ own: { 'pdf-notes': [file('SKILL.md', skillMd('pdf-notes')), file('scripts/x.sh', `export T=${TOKEN}\n`)] } });
    const r = await send({ type: 'skillShareStart', name: 'pdf-notes' }, d);
    expect(r.problems.join(' ')).toContain('scripts/x.sh');
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it('only for a skill in the person\'s own folder', async () => {
    const d = setup();
    const r = await send({ type: 'skillShareStart', name: 'not-mine' }, d);
    expect(r.type).toBe('notice');
    expect(d.skills.readOwn).not.toHaveBeenCalled();
  });

  it('asks for no token while the card is only shown', async () => {
    const d = setup();
    await send({ type: 'skillShareStart', name: 'pdf-notes' }, d);
    expect(d.skills.githubToken).not.toHaveBeenCalled();
    expect(d.skills.publish).not.toHaveBeenCalled();
  });
});

describe('Settings: share the skill', () => {
  it('reads the files itself, adds the licence, asks for the token now, and opens the pull request', async () => {
    const d = setup();
    const r = await send(share(), d);
    expect(d.skills.githubToken).toHaveBeenCalledTimes(1);
    const [input, token] = d.skills.publish.mock.calls[0]!;
    expect(token).toBe(TOKEN);
    expect(input.name).toBe('pdf-notes');
    expect(input.files.map((f: any) => f.rel).sort()).toEqual(['LICENSE', 'SKILL.md']);
    expect(input).toMatchObject({ title: 'Add the pdf-notes skill', body: 'It does a thing.', draft: true });
    expect(r).toEqual({ type: 'skillShared', url: PR, draft: true });
  });

  it('never takes the files from the page', async () => {
    const d = setup();
    await send({ ...share(), files: [file('SKILL.md', 'hostile')] }, d);
    const input = d.skills.publish.mock.calls[0]![0];
    expect(new TextDecoder().decode(input.files.find((f: any) => f.rel === 'SKILL.md').data)).toContain('pdf-notes does a thing');
  });

  it('S14, S15: no licence chosen, or no holder, is a sentence before any token is asked', async () => {
    const d = setup();
    for (const over of [{ licence: null }, { holder: '' }, { licence: 'GPL' }]) {
      const r = await send(share(over), d);
      expect(r.type).toBe('notice');
    }
    expect(d.skills.githubToken).not.toHaveBeenCalled();
    expect(d.skills.publish).not.toHaveBeenCalled();
  });

  it('keeps the skill\'s own licence and ignores the choice', async () => {
    const d = setup({ own: { 'pdf-notes': [file('SKILL.md', skillMd('pdf-notes')), file('LICENSE', 'Mine.\n')] } });
    await send(share({ licence: null, holder: '' }), d);
    const input = d.skills.publish.mock.calls[0]![0];
    expect(new TextDecoder().decode(input.files.find((f: any) => f.rel === 'LICENSE').data)).toBe('Mine.\n');
  });

  it('S16: no sign-in is a sentence that says what to do, and nothing is sent', async () => {
    const d = setup({ token: undefined });
    const r = await send(share(), d);
    expect(r.type).toBe('notice');
    expect(r.message).toMatch(/sign in to GitHub/i);
    expect(d.skills.publish).not.toHaveBeenCalled();
  });

  it('S13: a key in the skill stops the share before the token is asked', async () => {
    const d = setup({ own: { 'pdf-notes': [file('SKILL.md', skillMd('pdf-notes')), file('scripts/x.sh', `export T=${TOKEN}\n`)] } });
    const r = await send(share(), d);
    expect(r.type).toBe('notice');
    expect(r.message).toContain('scripts/x.sh');
    expect(r.message).not.toContain(TOKEN);
    expect(d.skills.githubToken).not.toHaveBeenCalled();
  });

  it('S19: a failure on GitHub reaches the page as the sentence core gave, without the token', async () => {
    const d = setup({ publishError: 'The pull request could not be opened. The branch skill/pdf-notes-x on ada/forge-skills was kept; nothing was deleted.' });
    const r = await send(share(), d);
    expect(r.type).toBe('notice');
    expect(r.message).toMatch(/kept/);
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it('a share for a skill that is not the person\'s own asks nothing', async () => {
    const d = setup();
    const r = await send(share({ name: 'not-mine' }), d);
    expect(r.type).toBe('notice');
    expect(d.skills.githubToken).not.toHaveBeenCalled();
  });

  it('S24: a draft box that is not true opens a ready pull request only when it is exactly false', async () => {
    const d = setup();
    await send(share({ draft: false }), d);
    await send(share({ draft: 'no' }), d);
    expect(d.skills.publish.mock.calls[0]![0].draft).toBe(false);
    expect(d.skills.publish.mock.calls[1]![0].draft).toBe(true);
  });
});

describe('Settings: open the pull request', () => {
  it('opens the address of a pull request in the skills repository', async () => {
    const d = setup();
    await send({ type: 'skillOpenShared', url: PR }, d);
    expect(d.skills.openUrl).toHaveBeenCalledWith(PR);
  });

  it.each([
    'https://evil.example.com/ikarmicai/forge-skills/pull/9',
    'https://github.com/other/repo/pull/9',
    'https://github.com/ikarmicai/forge-skills/pull/9/../../../../evil',
    'http://github.com/ikarmicai/forge-skills/pull/9',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://github.com/ikarmicai/forge-skills/pull/9@evil.com',
  ])('does not open %s', async (url) => {
    const d = setup();
    await send({ type: 'skillOpenShared', url }, d);
    expect(d.skills.openUrl).not.toHaveBeenCalled();
  });
});

describe('Settings page: the controls for making and sharing a skill', () => {
  const html = getSettingsHtml();

  it('has the create form, the upload buttons and the share card, in words', () => {
    for (const text of ['Create a skill', 'Create skill', 'Choose a folder…', 'Choose a zip file…', 'Title of the pull request', 'Name of the copyright holder', 'Nothing is sent until you press Share.', 'Pull request opened']) {
      expect(html).toContain(text);
    }
  });

  it('sends only names and text, never a path or the files, to the host', () => {
    for (const type of ['skillCreate', 'skillUpload', 'skillShareStart', 'skillShare', 'skillOpenShared']) expect(html).toContain(`'${type}'`);
    expect(html).not.toMatch(/type: 'skillShare'[^}]*files:/);
  });

  it('keeps the share button off until the host says nothing stops the skill', () => {
    expect(html).toContain('shareBtn.disabled = msg.problems.length > 0');
  });
});

describe('Settings page: the Skills tabs', () => {
  const html = getSettingsHtml();

  it('has Installed, Catalog and Add as tabs, each with its panel, and Installed first', () => {
    for (const name of ['installed', 'catalog', 'add']) {
      expect(html).toContain(`id="skills-tab-${name}"`);
      expect(html).toMatch(new RegExp(`id="skills-tab-${name}"[^>]*aria-controls="skills-(list|catalog|add)"`));
    }
    expect(html).toMatch(/id="skills-tab-installed" aria-selected="true"/);
    expect(html).toMatch(/id="skills-tab-catalog" aria-selected="false"/);
    expect(html).toMatch(/id="skills-tab-add" aria-selected="false"/);
    expect(html).toMatch(/id="skills-catalog" class="hidden"/);
    expect(html).toMatch(/id="skills-add" class="hidden"/);
  });

  it('reads the catalog when its tab is opened, not from a button in the heading', () => {
    expect(html).not.toContain('id="skills-browse"');
    // Read once (review bug 28), and again only from Rescan.
    expect(html).toContain("if (which === 'catalog' && !skillCatalogLoaded) { skillCatalogLoaded = true; vscode.postMessage({ type: 'skillCatalog' }); }");
    expect(html).toContain("if (skillCatalogLoaded) vscode.postMessage({ type: 'skillCatalog' });");
  });

  it('shows the skill again after something was added or made', () => {
    expect(html).toContain("skillsTab('installed')");
  });
});

describe('review fixes, 2026-11-02', () => {
  // Bug 2: the page hid Share on an installed skill, but the host shared whatever name it was sent.
  it("refuses to share a skill Forge installed from a link, in the host, and asks for no sign-in", async () => {
    const d = setup({ sources: { 'pdf-notes': 'anthropics/skills' } });
    const start = await send({ type: 'skillShareStart', name: 'pdf-notes' }, d);
    expect(start).toMatchObject({ type: 'notice' });
    expect(start.message).toContain('was installed from anthropics/skills');
    const r = await send(share(), d);
    expect(r.message).toContain("someone else's skill");
    expect(d.skills.githubToken).not.toHaveBeenCalled();
    expect(d.skills.publish).not.toHaveBeenCalled();
  });

  // Bug 13: every sign-in failure read as "Sign in to GitHub".
  it('says why the sign-in failed, and how else to give a token', async () => {
    const d = setup({ tokenError: 'No authentication provider for github is registered' });
    const r = await send(share(), d);
    expect(r.message).toContain('Forge could not sign in to GitHub: No authentication provider for github is registered');
    expect(r.message).toContain('GITHUB_TOKEN');
    expect(d.skills.publish).not.toHaveBeenCalled();
  });

  // Bug 16: the editor had no way to stop a share.
  it('Cancel stops a share that is running, and the answer says what was kept', async () => {
    const d = setup({ publishHangs: true });
    const pending = send(share(), d);
    await vi.waitFor(() => expect(d.skills.publish).toHaveBeenCalled());
    // A second Share while the first runs is refused.
    expect((await send(share(), d)).message).toContain('already being shared');
    expect(await send({ type: 'skillShareCancel', name: 'pdf-notes' }, d)).toEqual({ type: 'none' });
    const r = await pending;
    expect(r.message).toContain('Sharing the skill was stopped');
    expect(r.message).toContain('ada/forge-skills');
    // Once it ended, the skill can be shared again.
    d.skills.publish.mockImplementationOnce(async () => ({ url: PR, number: 9, draft: true, branch: 'b', fork: 'ada/forge-skills' }));
    expect(await send(share(), d)).toMatchObject({ type: 'skillShared', url: PR });
  });

  it('Cancel for a skill that is not being shared does nothing', async () => {
    const d = setup();
    expect(await send({ type: 'skillShareCancel', name: 'other' }, d)).toEqual({ type: 'none' });
  });

  // Bug 10: Upload could never replace a skill, although the refusal said to replace it on purpose.
  it('passes the Replace choice to the save for a folder or zip', async () => {
    const d = setup({ picked: { files: [file('SKILL.md', skillMd('pdf-notes'))], folder: 'pdf-notes' } });
    await send({ type: 'skillUpload', kind: 'folder', overwrite: true }, d);
    expect(d.skills.save.mock.calls[0]![2]).toBe(true);
    await send({ type: 'skillUpload', kind: 'zip' }, d);
    expect(d.skills.save.mock.calls[1]![2]).toBe(false);
  });

  // Bug 29: the create form kept its text, so a second click failed with "already exists".
  it('marks a list that follows a create, so the page empties the form', async () => {
    const d = setup();
    const r = await send({ type: 'skillCreate', name: 'release-notes', description: 'Writes release notes.', instructions: 'List.' }, d);
    expect(r).toMatchObject({ type: 'skillsListed', created: true });
    const html = getSettingsHtml();
    expect(html).toContain("if (msg.created) ['skill-create-name', 'skill-create-description', 'skill-create-instructions']");
  });

  it('says where an old copy was left when it could not be removed', async () => {
    const d = setup();
    d.skills.save.mockResolvedValueOnce({ leftover: '/home/me/.forge/skills/.pdf-notes.old-0badf00d' } as never);
    const r = await send({ type: 'skillCreate', name: 'pdf-notes', description: 'd.', instructions: 'i', overwrite: true }, d);
    expect(r.note).toContain('delete /home/me/.forge/skills/.pdf-notes.old-0badf00d when it is free');
  });

  describe('the page', () => {
    const html = getSettingsHtml();

    // Bug 1: Cancel while sharing, Rescan, or any new list removed the card, and the pull request's link was lost.
    it('keeps the share card when the list is drawn again', () => {
      expect(html).toContain("const keepShare = $('skill-share');");
      expect(html).toContain('if (keepShare) box.appendChild(keepShare);');
    });

    it('shows the link in a new card when the old one is gone', () => {
      const fn = html.slice(html.indexOf('function showShared(msg)'), html.indexOf("$('skills-add').appendChild(addYourOwnSkill());"));
      expect(fn).not.toContain("if (!card) return;");
      expect(fn).toContain("card.id = 'skill-share'");
    });

    it('turns Cancel during sharing into a stop request, not a closed card', () => {
      expect(html).toContain("vscode.postMessage({ type: 'skillShareCancel', name: msg.name });");
    });

    it('has one Replace choice in the Add tab, sent with create, folder and zip', () => {
      expect(html).toContain("box.id = 'skill-replace'");
      expect(html.match(/overwrite: replacing\(\)/g)).toHaveLength(3);
    });
  });
});
