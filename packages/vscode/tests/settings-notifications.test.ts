import { describe, expect, it } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { SECTION_LABELS, SETTING_ROWS } from '../src/settings/settings-rows.js';

/**
 * The four settings that decide whether, how and when Forge tells you a run is over were mixed in with spending
 * caps and step limits under "Safety and cost". Someone looking for "notifications" had nowhere to look.
 */
const NOTIFY = ['forge.notifications.enabled', 'forge.notifications.sound', 'forge.notifications.osToast', 'forge.notifications.minSeconds'];

describe('Notifications settings', () => {
  it('are their own section, with a name', () => {
    expect(SECTION_LABELS.notifications).toBe('Notifications');
    expect(SETTING_ROWS.filter((r) => r.section === 'notifications').map((r) => r.key).sort()).toEqual([...NOTIFY].sort());
  });

  it('left nothing about a run ending behind in Safety and cost', () => {
    const rest = SETTING_ROWS.filter((r) => r.section === 'safety').map((r) => r.key);
    expect(rest.filter((k) => k.startsWith('forge.notifications.'))).toEqual([]);
  });

  describe('on the page', () => {
    const html = getSettingsHtml();

    it('have a place in the sidebar, in the narrow-window list and on the page', () => {
      expect(html).toContain('data-section="notifications"');
      expect(html).toContain('<option value="notifications">Notifications</option>');
      expect(html).toContain('<section id="sec-notifications" hidden>');
      expect(html).toContain('<div id="rows-notifications"></div>');
    });

    it('are cleared and drawn with the other row sections', () => {
      expect(html).toMatch(/\['context', 'safety', 'notifications', 'tools', 'git', 'advanced'\]\.forEach/);
    });

    it('say what the page is for, and Safety and cost no longer claims it', () => {
      expect(html).toContain('When and how Forge tells you a run has finished.');
      expect(html).toContain('Limits that stop a run early.');
      expect(html).not.toContain('and when Forge tells you it is done');
    });
  });
});
