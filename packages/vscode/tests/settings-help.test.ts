import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SETTING_ROWS, SHORT_HELP } from '../src/settings/settings-rows.js';

const root = path.join(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { contributes: { configuration: { properties: Record<string, { description?: string }> } } };
const nls = JSON.parse(readFileSync(path.join(root, 'package.nls.json'), 'utf8')) as Record<string, string>;

/** The help line a row shows: the short override when there is one, else the package.json description. */
function helpFor(key: string): string {
  if (SHORT_HELP[key]) return SHORT_HELP[key]!;
  const d = pkg.contributes.configuration.properties[key]?.description ?? '';
  const ref = /^%(.+)%$/.exec(d)?.[1];
  return (ref ? nls[ref] : d) ?? '';
}
const sentences = (t: string) => t.split(/[.!?](?:\s|$)/).filter(Boolean).length;

describe('Settings row help (S4, H5)', () => {
  it.each(SETTING_ROWS.map((r) => [r.key] as const))('%s: help is at most two sentences and 200 characters', (key) => {
    const h = helpFor(key);
    expect(h, 'has help').not.toBe('');
    expect(sentences(h), h).toBeLessThanOrEqual(2);
    expect(h.length, h).toBeLessThanOrEqual(200);
  });

  it('a short help line exists only for a row that is in the table', () => {
    for (const k of Object.keys(SHORT_HELP)) expect(SETTING_ROWS.some((r) => r.key === k), k).toBe(true);
  });
});
