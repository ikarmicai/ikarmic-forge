import { describe, expect, it, vi } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { SETTINGS_INDEX } from '../src/settings/settings-model.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

/**
 * The first questions in a bug report are "which version?" and "where is the log?". The Settings page had neither.
 * The page never sends an address: it names a destination and the extension opens the one it already knows.
 */
function deps() {
  const about = { version: '5.4.1', openLog: vi.fn(), openLink: vi.fn().mockResolvedValue(undefined) };
  return { about, all: { about } as unknown as SettingsDeps };
}

describe('About: host side', () => {
  it('reports the version of the extension', async () => {
    const d = deps();
    expect(await handleSettingsMessage({ type: 'loadAbout' }, d.all)).toEqual({ type: 'aboutLoaded', version: '5.4.1' });
  });

  it('opens the log, the issue page or the documentation, and nothing else', async () => {
    const d = deps();
    await handleSettingsMessage({ type: 'aboutOpen', what: 'log' }, d.all);
    expect(d.about.openLog).toHaveBeenCalledTimes(1);
    await handleSettingsMessage({ type: 'aboutOpen', what: 'issues' }, d.all);
    await handleSettingsMessage({ type: 'aboutOpen', what: 'docs' }, d.all);
    expect(d.about.openLink.mock.calls.map((c) => c[0])).toEqual(['issues', 'docs']);
    const bad = await handleSettingsMessage({ type: 'aboutOpen', what: 'https://evil.example' as never }, d.all);
    expect(bad).toMatchObject({ type: 'error' });
    expect(d.about.openLink).toHaveBeenCalledTimes(2);
  });

  it('answers with nothing where there is no extension to ask', async () => {
    expect(await handleSettingsMessage({ type: 'loadAbout' }, {} as SettingsDeps)).toEqual({ type: 'none' });
  });
});

describe('About: the page', () => {
  const html = getSettingsHtml();

  it('is a section in the sidebar, in the narrow-window list and in search', () => {
    expect(html).toContain('data-section="about"');
    expect(html).toContain('<option value="about">About</option>');
    expect(html).toContain('id="sec-about"');
    expect(SETTINGS_INDEX.some((e) => e.section === 'about')).toBe(true);
  });

  it('has a button for each destination, named for what it opens', () => {
    for (const [id, text] of [['about-log', 'Open the log'], ['about-issues', 'Report an issue'], ['about-docs', 'Read the documentation']]) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(text);
    }
  });

  it('sends a destination, never an address', () => {
    expect(html).toContain("type: 'aboutOpen'");
    expect(html).not.toMatch(/aboutOpen[^}]*https?:/);
  });
});
