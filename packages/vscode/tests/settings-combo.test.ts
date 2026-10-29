import { describe, expect, it } from 'vitest';

import * as lib from '../src/settings/settings-lib.js';
import {
  AWS_REGIONS,
  VERTEX_LOCATIONS,
  VOICE_LANGUAGES,
  filterGroups,
  isKnownValue,
  modelGroups,
  type ComboGroup,
} from '../src/settings/settings-combo.js';

const labelOf = (p: string) => ({ anthropic: 'Anthropic', minimax: 'MiniMax', openai: 'OpenAI' })[p] ?? p;

describe('filterGroups', () => {
  it('matches on the readable label and on the stored value', () => {
    const byLabel = filterGroups(AWS_REGIONS, 'frank');
    expect(byLabel.flatMap((g) => g.options.map((o) => o.value))).toEqual(['eu-central-1']);
    const byValue = filterGroups(AWS_REGIONS, 'EU-CENTRAL');
    expect(byValue.flatMap((g) => g.options.map((o) => o.value))).toEqual(['eu-central-1']);
  });

  it('drops groups with no match and returns everything for an empty query', () => {
    expect(filterGroups(AWS_REGIONS, 'frank')).toHaveLength(1);
    expect(filterGroups(AWS_REGIONS, '')).toEqual(AWS_REGIONS);
    expect(filterGroups(AWS_REGIONS, '   ')).toEqual(AWS_REGIONS);
  });
});

describe('isKnownValue', () => {
  it('is an exact match on the stored value', () => {
    expect(isKnownValue(AWS_REGIONS, 'eu-west-1')).toBe(true);
    expect(isKnownValue(AWS_REGIONS, 'eu-south-3')).toBe(false);
    expect(isKnownValue(AWS_REGIONS, 'EU-WEST-1')).toBe(false);
  });
});

describe('modelGroups', () => {
  const input = {
    aliases: { fast: 'anthropic:claude-haiku-4-5' },
    mainProvider: 'minimax',
    lists: { minimax: { models: [{ id: 'MiniMax-M3', label: 'MiniMax M3' }] } } as Record<string, { models: { id: string; label: string }[] } | undefined>,
    catalog: { anthropic: [{ id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' }], openai: [] } as Record<string, { id: string; label: string }[]>,
    providers: ['minimax', 'anthropic', 'openai'],
    labelOf,
  };

  it('lists aliases first, then the main provider as bare ids, then other providers as provider:model', () => {
    const groups = modelGroups(input);
    expect(groups.map((g) => g.label)).toEqual(['Your aliases', 'MiniMax', 'Anthropic']);
    expect(groups[0]!.options).toEqual([{ label: 'anthropic:claude-haiku-4-5', value: 'fast' }]);
    expect(groups[1]!.options).toEqual([{ label: 'MiniMax M3', value: 'MiniMax-M3' }]);
    expect(groups[2]!.options).toEqual([{ label: 'Claude Haiku 4.5', value: 'anthropic:claude-haiku-4-5' }]);
  });

  it('leaves out the alias group with no aliases and a provider with no models', () => {
    const groups = modelGroups({ ...input, aliases: {} });
    expect(groups.map((g) => g.label)).toEqual(['MiniMax', 'Anthropic']);
  });

  it('with bareOnly lists only the main provider ids: no aliases, no other providers (inline completion reads a plain id)', () => {
    const groups = modelGroups({ ...input, bareOnly: true });
    expect(groups.map((g) => g.label)).toEqual(['MiniMax']);
    expect(groups[0]!.options).toEqual([{ label: 'MiniMax M3', value: 'MiniMax-M3' }]);
  });

  it('uses the built-in catalog while a provider has no loaded list', () => {
    const groups = modelGroups({ ...input, lists: {} });
    expect(groups.map((g) => g.label)).toEqual(['Your aliases', 'Anthropic']);
  });
});

describe('fixed lists', () => {
  const all: Array<[string, ComboGroup[]]> = [['AWS regions', AWS_REGIONS], ['Vertex locations', VERTEX_LOCATIONS], ['voice languages', VOICE_LANGUAGES]];

  it.each(all)('%s carry sentence labels that are not their stored value (words, not identifiers)', (_name, groups) => {
    const options = groups.flatMap((g) => g.options);
    expect(options.length).toBeGreaterThan(5);
    for (const o of options) {
      expect(o.label.length, o.value).toBeGreaterThan(0);
      expect(o.label, o.value).not.toBe(o.value);
      expect(o.label, o.value).toMatch(/^[A-Z]/);
    }
    expect(new Set(options.map((o) => o.value)).size).toBe(options.length);
  });

  it('holds the regions and codes the spec names', () => {
    expect(isKnownValue(AWS_REGIONS, 'us-east-1')).toBe(true);
    expect(isKnownValue(VERTEX_LOCATIONS, 'us-central1')).toBe(true);
    expect(isKnownValue(VOICE_LANGUAGES, 'hi-IN')).toBe(true);
  });
});

describe('the page can reach it (window.ForgeSettings)', () => {
  it('exports every helper the page script calls', () => {
    for (const name of ['filterGroups', 'isKnownValue', 'modelGroups', 'AWS_REGIONS', 'VERTEX_LOCATIONS', 'VOICE_LANGUAGES']) {
      expect((lib as Record<string, unknown>)[name], name).toBeDefined();
    }
  });
});
