import { describe, expect, it } from 'vitest';

import { SETTINGS_STRINGS, settingsDictionary } from '../src/settings/settings-i18n.js';
import { getSettingsHtml } from '../src/settings/settings-html.js';

/** Static page text with no words to translate. */
const IGNORED = new Set(['●', 'https://api.example.com/v1']);

/** Every static text node and title / aria-label / placeholder of the page, before its script. */
function staticStrings(html: string): Set<string> {
  const start = html.indexOf('<body');
  const body = html.slice(start, html.indexOf('<script>', start + 10));
  const out = new Set<string>();
  for (const tag of body.matchAll(/<[^>]+>/g)) for (const m of tag[0].matchAll(/\b(?:title|aria-label|placeholder)="([^"]+)"/g)) out.add(m[1]!);
  for (const m of body.matchAll(/>([^<>]+)</g)) {
    const s = m[1]!.replace(/\s+/g, ' ').trim();
    if (s) out.add(s);
  }
  return out;
}

describe('Settings page translation (H3)', () => {
  const html = getSettingsHtml();
  const shown = staticStrings(html);

  it('lists every label the page shows, so a new one cannot ship untranslated', () => {
    expect([...shown].filter((s) => !IGNORED.has(s) && !SETTINGS_STRINGS.includes(s))).toEqual([]);
  });

  it('lists nothing the page no longer shows', () => {
    expect(SETTINGS_STRINGS.filter((s) => !shown.has(s))).toEqual([]);
  });

  it('only keeps the labels whose translation differs from English', () => {
    const dict = settingsDictionary((s) => (s === 'Save' ? 'Guardar' : s));
    expect(dict).toEqual({ Save: 'Guardar' });
  });

  it('applies a dictionary to the page and adds no script when there is nothing to translate', () => {
    const withDict = getSettingsHtml({ strings: { Save: 'Guardar' } });
    expect(withDict).toContain('"Save":"Guardar"');
    expect(withDict).toContain('MutationObserver');
    expect(html).not.toContain('MutationObserver');
  });
});
