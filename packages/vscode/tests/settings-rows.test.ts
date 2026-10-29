import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EXCLUDED_KEYS, SETTING_ROWS, SHORT_HELP, coerceRow } from '../src/settings/settings-rows.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
  contributes: { configuration: { properties: Record<string, { type: string; enum?: string[]; minimum?: number; maximum?: number }> } };
};
const properties = pkg.contributes.configuration.properties;
const row = (key: string) => SETTING_ROWS.find((r) => r.key === key)!;

describe('Settings rows cover every forge.* setting (guard against drift)', () => {
  it('every key in package.json has a row or an explicit reason to be left out, and no row names a missing key', () => {
    const covered = new Set([...SETTING_ROWS.map((r) => r.key), ...EXCLUDED_KEYS]);
    expect(Object.keys(properties).filter((k) => !covered.has(k)), 'forge.* keys with no Settings row').toEqual([]);
    expect([...covered].filter((k) => !(k in properties)), 'rows or exclusions naming a key that no longer exists').toEqual([]);
  });

  it('keys are unique, and each row agrees with package.json on kind, enum and range', () => {
    expect(new Set(SETTING_ROWS.map((r) => r.key)).size).toBe(SETTING_ROWS.length);
    for (const r of SETTING_ROWS) {
      const p = properties[r.key]!;
      const expectKind = p.enum ? 'enum' : p.type === 'integer' ? 'number' : p.type === 'array' ? 'list' : p.type === 'object' ? 'map' : p.type;
      expect(r.kind, r.key).toBe(expectKind);
      if (p.enum) expect(r.enum, r.key).toEqual(p.enum);
      if (p.minimum !== undefined) expect(r.min, r.key).toBe(p.minimum);
      if (p.maximum !== undefined) expect(r.max, r.key).toBe(p.maximum);
      if (p.type === 'integer') expect(r.integer, r.key).toBe(true);
    }
  });

  it('puts every row in a known section and gives it a label', () => {
    for (const r of SETTING_ROWS) {
      expect(['context', 'safety', 'notifications', 'tools', 'git', 'advanced'], r.key).toContain(r.section);
      expect(r.label.length, r.key).toBeGreaterThan(0);
    }
  });
});

describe('coerceRow', () => {
  it('accepts a number in range and rejects one outside it or sent as text', () => {
    expect(coerceRow(row('forge.compaction.threshold'), 0.8)).toEqual({ ok: true, value: 0.8 });
    expect(coerceRow(row('forge.compaction.threshold'), 2)).toMatchObject({ ok: false });
    expect(coerceRow(row('forge.compaction.threshold'), '0.8')).toMatchObject({ ok: false });
  });

  it('rejects a fraction for an integer setting', () => {
    expect(coerceRow(row('forge.goalMaxTurns'), 25)).toEqual({ ok: true, value: 25 });
    expect(coerceRow(row('forge.goalMaxTurns'), 2.5)).toMatchObject({ ok: false });
    expect(coerceRow(row('forge.goalMaxTurns'), 0)).toMatchObject({ ok: false });
  });

  it('accepts only the listed values of an enum and only booleans for a switch', () => {
    expect(coerceRow(row('forge.webSearch.provider'), 'brave')).toEqual({ ok: true, value: 'brave' });
    expect(coerceRow(row('forge.webSearch.provider'), 'bing')).toMatchObject({ ok: false });
    expect(coerceRow(row('forge.audit.enabled'), true)).toEqual({ ok: true, value: true });
    expect(coerceRow(row('forge.audit.enabled'), 'yes')).toMatchObject({ ok: false });
  });

  it('trims a text setting', () => {
    expect(coerceRow(row('forge.architect.editorModel'), '  gpt-4o  ')).toEqual({ ok: true, value: 'gpt-4o' });
  });
});

describe('loadRows / setRow messages', () => {
  function deps() {
    const store: Record<string, unknown> = { 'forge.maxCostUsd': 2 };
    const updates: Array<[string, unknown]> = [];
    const d = {
      rows: {
        get: (key: string) => store[key],
        update: async (key: string, value: unknown) => { updates.push([key, value]); store[key] = value; },
        describe: (key: string) => `about ${key}`,
        defaultOf: () => undefined,
      },
    } as unknown as SettingsDeps;
    return { d, updates };
  }

  it('loadRows returns every row with its current value and its description', async () => {
    const { d } = deps();
    const res = await handleSettingsMessage({ type: 'loadRows' }, d);
    expect(res.type).toBe('rowsLoaded');
    const rows = (res as { rows: Array<{ key: string; value: unknown; description: string }> }).rows;
    expect(rows).toHaveLength(SETTING_ROWS.length);
    expect(rows.find((r) => r.key === 'forge.compaction.enabled')?.description).toBe('about forge.compaction.enabled');
    // A row with a short help line shows that instead of the long package.json description.
    expect(rows.find((r) => r.key === 'forge.maxCostUsd')).toMatchObject({ value: 2, description: SHORT_HELP['forge.maxCostUsd'] });
  });

  it('setRow saves a valid value once and answers with it', async () => {
    const { d, updates } = deps();
    const res = await handleSettingsMessage({ type: 'setRow', key: 'forge.maxCostUsd', value: 5 }, d);
    expect(updates).toEqual([['forge.maxCostUsd', 5]]);
    expect(res).toEqual({ type: 'rowSaved', key: 'forge.maxCostUsd', value: 5 });
  });

  it('setRow refuses a bad value and an unknown key without saving anything', async () => {
    const { d, updates } = deps();
    expect(await handleSettingsMessage({ type: 'setRow', key: 'forge.maxCostUsd', value: -1 }, d)).toMatchObject({ type: 'rowError', key: 'forge.maxCostUsd' });
    expect(await handleSettingsMessage({ type: 'setRow', key: 'forge.apiKeys.openai', value: 'sk-x' }, d)).toMatchObject({ type: 'error' });
    expect(updates).toEqual([]);
  });
});

describe('rows backed by a list of suggestions (the list never validates)', () => {
  const expected: Record<string, string> = {
    'forge.router.cheapModel': 'models',
    'forge.architect.editorModel': 'models',
    'forge.completionModel': 'modelIds',
    'forge.providers.awsRegion': 'awsRegions',
    'forge.providers.vertexLocation': 'vertexLocations',
    'forge.voice.language': 'voiceLanguages',
  };

  it('names the list for exactly the six rows, and no other row has one', () => {
    const withChoices = Object.fromEntries(SETTING_ROWS.filter((r) => r.choices).map((r) => [r.key, r.choices]));
    expect(withChoices).toEqual(expected);
  });

  it('keeps every such row a free string in package.json, with no enum', () => {
    for (const r of SETTING_ROWS.filter((x) => x.choices)) {
      expect(r.kind, r.key).toBe('string');
      expect(properties[r.key]!.type, r.key).toBe('string');
      expect(properties[r.key]!.enum, r.key).toBeUndefined();
    }
  });

  it('saves a typed value that is in no list unchanged (trimmed only)', () => {
    expect(coerceRow(row('forge.providers.awsRegion'), '  eu-south-3 ')).toEqual({ ok: true, value: 'eu-south-3' });
    expect(coerceRow(row('forge.router.cheapModel'), 'my-gateway:custom-model')).toEqual({ ok: true, value: 'my-gateway:custom-model' });
    expect(coerceRow(row('forge.voice.language'), 'en-ZA')).toEqual({ ok: true, value: 'en-ZA' });
  });
});
