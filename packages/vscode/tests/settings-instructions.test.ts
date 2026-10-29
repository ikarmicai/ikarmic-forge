import { describe, expect, it, vi } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { SETTINGS_INDEX } from '../src/settings/settings-model.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

/**
 * Forge reads AGENTS.md, CLAUDE.md and CONVENTIONS.md at the start of every chat, cutting each at a length. Nothing
 * on the Settings page said which of them it was using, or that one was cut. The page names a file; the extension
 * checks the name against the three it reads and holds the folder.
 */
function deps(over: { absent?: boolean; trusted?: boolean } = {}) {
  const instructions = {
    scan: vi.fn().mockResolvedValue({
      folder: true,
      trusted: over.trusted !== false,
      files: [{ name: 'AGENTS.md', state: 'used', chars: 120, cut: false }],
      steering: 2,
    }),
    open: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue('created'),
    newSteering: vi.fn().mockResolvedValue(undefined),
  };
  return { instructions, all: (over.absent ? {} : { instructions }) as unknown as SettingsDeps };
}

describe('Instructions: host side', () => {
  it('sends what the folder holds, and whether Forge may use it', async () => {
    const d = deps({ trusted: false });
    const r = await handleSettingsMessage({ type: 'loadInstructions' }, d.all);
    expect(r).toMatchObject({ type: 'instructionsLoaded', trusted: false, steering: 2, files: [{ name: 'AGENTS.md', state: 'used' }] });
  });

  it('opens and creates only the three names Forge reads', async () => {
    const d = deps();
    await handleSettingsMessage({ type: 'instructionOpen', name: 'CLAUDE.md' }, d.all);
    expect(d.instructions.open).toHaveBeenCalledWith('CLAUDE.md');
    for (const bad of ['../x.md', 'notes.md', '/etc/passwd', 'AGENTS.md/../../x']) {
      const r = await handleSettingsMessage({ type: 'instructionOpen', name: bad }, d.all);
      expect(r, bad).toMatchObject({ type: 'error' });
      const c = await handleSettingsMessage({ type: 'instructionCreate', name: bad }, d.all);
      expect(c, bad).toMatchObject({ type: 'error' });
    }
    expect(d.instructions.open).toHaveBeenCalledTimes(1);
    expect(d.instructions.create).not.toHaveBeenCalled();
  });

  it('opens the new file after creating it, and says when it was already there', async () => {
    const d = deps();
    await handleSettingsMessage({ type: 'instructionCreate', name: 'AGENTS.md' }, d.all);
    expect(d.instructions.create).toHaveBeenCalledWith('AGENTS.md');
    d.instructions.create.mockResolvedValueOnce('exists');
    const r = await handleSettingsMessage({ type: 'instructionCreate', name: 'AGENTS.md' }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect((r as { message: string }).message).toContain('already');
  });

  it('starts a new steering note through the command the Work view uses', async () => {
    const d = deps();
    await handleSettingsMessage({ type: 'steeringNew' }, d.all);
    expect(d.instructions.newSteering).toHaveBeenCalledTimes(1);
  });

  it('answers with nothing where there is no folder to look in', async () => {
    expect(await handleSettingsMessage({ type: 'loadInstructions' }, deps({ absent: true }).all)).toEqual({ type: 'none' });
  });
});

describe('Instructions: the page', () => {
  const html = getSettingsHtml();

  it('is a section in the sidebar, in the narrow-window list and in search', () => {
    expect(html).toContain('data-section="instructions"');
    expect(html).toContain('<option value="instructions">Instructions</option>');
    expect(html).toContain('id="sec-instructions"');
    expect(SETTINGS_INDEX.some((e) => e.section === 'instructions')).toBe(true);
  });

  it('says in words what each file is doing, and what to do about it', () => {
    const at = html.indexOf('function renderInstructions');
    const block = at < 0 ? '' : html.slice(at, html.indexOf('\n  // about', at));
    for (const word of ['Used', 'Empty', 'Not created', 'Cut off', 'Open', 'Create']) expect(block, word).toContain(word);
    expect(block).toContain('not trusted');
  });

  it('sends a file name, never a path', () => {
    expect(html).toMatch(/type: [^}]*'instructionOpen'/);
    expect(html).toMatch(/type: [^}]*'instructionCreate'/);
    expect(html).not.toMatch(/instruction(Open|Create)[^}]*[\\/]/);
  });
});
