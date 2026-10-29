import { describe, expect, it } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { EXCLUDED_KEYS, SETTING_ROWS, coerceRow } from '../src/settings/settings-rows.js';

/**
 * Seven settings were left out of the Settings page because they are a list or a name-to-value map, so the only way
 * to change them was to edit settings.json. Among them are the hosts a sandboxed command may reach, the commands
 * that check a run, and the certificate files for a proxy. They now have a row of their own kind.
 */
const row = (key: string) => SETTING_ROWS.find((r) => r.key === key)!;

const LISTS = ['forge.commandSandbox.allowedHosts', 'forge.verify.commands', 'forge.agentManager.copyFiles', 'forge.caCertificates'];
const MAPS = ['forge.autoLint.commands', 'forge.autoFormat.commands', 'forge.docs'];

describe('list and map settings have a row', () => {
  it('no longer leaves them to settings.json', () => {
    for (const k of [...LISTS, ...MAPS]) {
      expect(EXCLUDED_KEYS, k).not.toContain(k);
      expect(row(k), k).toBeDefined();
    }
  });

  it('gives each one a kind, and a word for one item so the buttons can say what they add', () => {
    for (const k of LISTS) {
      expect(row(k).kind, k).toBe('list');
      expect(row(k).item, k).toBeTruthy();
    }
    for (const k of MAPS) {
      expect(row(k).kind, k).toBe('map');
      expect(row(k).item, k).toBeTruthy();
      expect(row(k).valueItem, k).toBeTruthy();
    }
  });
});

describe('coerceRow for a list', () => {
  it('keeps the order, trims each item and drops empty ones and repeats', () => {
    expect(coerceRow(row('forge.verify.commands'), [' npm test ', '', 'npm run lint', 'npm test'])).toEqual({
      ok: true,
      value: ['npm test', 'npm run lint'],
    });
  });

  it('accepts an empty list, which clears the setting', () => {
    expect(coerceRow(row('forge.caCertificates'), [])).toEqual({ ok: true, value: [] });
  });

  it('rejects anything that is not a list of text', () => {
    expect(coerceRow(row('forge.verify.commands'), 'npm test')).toMatchObject({ ok: false });
    expect(coerceRow(row('forge.verify.commands'), ['ok', 3])).toMatchObject({ ok: false });
    expect(coerceRow(row('forge.verify.commands'), null)).toMatchObject({ ok: false });
  });

  it('refuses a list so long it can only be a mistake', () => {
    expect(coerceRow(row('forge.caCertificates'), Array.from({ length: 201 }, (_, i) => `c${i}`))).toMatchObject({ ok: false });
  });
});

describe('coerceRow for a map', () => {
  it('trims the names, keeps the values as typed and drops a row with no name', () => {
    expect(coerceRow(row('forge.autoLint.commands'), { ' ts ': 'eslint --fix', '': 'x' })).toEqual({ ok: true, value: { ts: 'eslint --fix' } });
  });

  it('rejects a value that is not text and a map that is not an object', () => {
    expect(coerceRow(row('forge.docs'), { a: 1 })).toMatchObject({ ok: false });
    expect(coerceRow(row('forge.docs'), ['a'])).toMatchObject({ ok: false });
    expect(coerceRow(row('forge.docs'), null)).toMatchObject({ ok: false });
  });

  it('refuses names that would change what every object inherits', () => {
    for (const bad of ['__proto__', 'constructor', 'prototype']) {
      const raw = JSON.parse(`{"${bad}": "x"}`) as unknown;
      expect(coerceRow(row('forge.docs'), raw), bad).toMatchObject({ ok: false });
    }
  });
});

describe('the Settings page edits them', () => {
  const html = getSettingsHtml();
  const at = html.indexOf('function listEditor');
  const editor = at < 0 ? '' : html.slice(at, html.indexOf('function renderRow', at));

  it('has one editor for lists and maps, built from the row', () => {
    expect(editor).toContain("r.kind === 'map'");
    expect(editor).toContain('r.item');
    expect(html).toMatch(/r\.kind === 'list' \|\| r\.kind === 'map'/);
  });

  it('says what each button adds or removes, in words', () => {
    expect(editor).toMatch(/'Add ' \+ /);
    expect(editor).toMatch(/'Remove ' \+ /);
  });

  it('saves the whole value each time it changes, through the same message as every other row', () => {
    expect(editor).toContain('send(');
  });

  it('never shows the setting key in place of a word', () => {
    expect(editor).not.toMatch(/forge\./);
  });
});
