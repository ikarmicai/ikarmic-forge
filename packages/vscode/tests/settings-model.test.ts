import { READ_ONLY_TOOLS } from '@ikarmic/forge-core';
import { describe, expect, it } from 'vitest';

import {
  CONFIG_KEYS, DEFAULT_AUTO_APPROVE, sortedTools, SETTINGS_INDEX, agentsToDraft, applyConfig, dirtyKeys, draftToSandbox, emptyDraft, filterSettings, markSaved, sandboxToDraft, saveMessages,
} from '../src/settings/settings-model.js';

describe('settings draft', () => {
  it('reads config fields, defaulting the display options', () => {
    const d = applyConfig(emptyDraft(), { provider: 'minimax', model: 'MiniMax-M2', disabledProviders: ['ollama'] });
    expect(d).toMatchObject({ provider: 'minimax', model: 'MiniMax-M2', reasoningEffort: '', disabledProviders: ['ollama'], blockDefault: 'collapsed', showReasoning: true });
    expect(applyConfig(emptyDraft(), { display: { blockDefault: 'expanded', showReasoning: false } })).toMatchObject({ blockDefault: 'expanded', showReasoning: false });
  });

  it('round-trips the sandbox through flat rules, dropping empty patterns', () => {
    const s = { denyTools: ['fetch_url'], policies: { run_command: { deniedCommands: ['git push*', 'rm -rf *'] } } };
    const d = sandboxToDraft(s);
    expect(d.rules).toEqual([
      { tool: 'run_command', dimension: 'deniedCommands', pattern: 'git push*' },
      { tool: 'run_command', dimension: 'deniedCommands', pattern: 'rm -rf *' },
    ]);
    expect(draftToSandbox({ ...d, rules: [...d.rules, { tool: 'write_file', dimension: 'deniedPaths', pattern: '  ' }] })).toEqual(s);
    expect(draftToSandbox(sandboxToDraft({}))).toEqual({});
  });

  it('reports only the keys that changed', () => {
    const saved = emptyDraft();
    const draft = { ...saved, model: 'x', sandbox: { ...saved.sandbox, denyTools: ['fetch_url'] } };
    expect(dirtyKeys(saved, draft)).toEqual(['model', 'sandbox']);
    expect(dirtyKeys(saved, emptyDraft())).toEqual([]);
  });

  it('builds one config patch for config keys plus separate sandbox / agents saves', () => {
    const d = { ...emptyDraft(), provider: 'minimax', reasoningEffort: '', blockDefault: 'expanded' as const, agents: [{ id: 'migrator', description: 'd', systemPrompt: 'p', allowedTools: [], extra: {} }] };
    expect(saveMessages(d, ['provider', 'reasoningEffort', 'blockDefault', 'agents'])).toEqual([
      { type: 'save', patch: { provider: 'minimax', reasoningEffort: null, display: { blockDefault: 'expanded', showReasoning: true } } },
      { type: 'saveAgents', agents: [{ id: 'migrator', description: 'd', systemPrompt: 'p', allowedTools: [] }] },
    ]);
    expect(saveMessages(d, ['sandbox'])).toEqual([{ type: 'saveSandbox', sandbox: {} }]);
    expect(saveMessages(d, [])).toEqual([]);
  });

  it('reads modeModels from config and saves it as one patch key, null when empty', () => {
    const d = applyConfig(emptyDraft(), { modeModels: { debug: 'anthropic:claude-opus-5-5' } });
    expect(d.modeModels).toEqual({ debug: 'anthropic:claude-opus-5-5' });
    expect(applyConfig(emptyDraft(), {}).modeModels).toEqual({});
    expect(saveMessages({ ...emptyDraft(), modeModels: { debug: ' x ', ask: '' } }, ['modeModels'])).toEqual([{ type: 'save', patch: { modeModels: { debug: 'x' } } }]);
    expect(saveMessages({ ...emptyDraft(), modeModels: { ask: '' } }, ['modeModels'])).toEqual([{ type: 'save', patch: { modeModels: null } }]);
  });

  it('marks modeModels dirty only when it changed, and lists it as a config key', () => {
    const saved = emptyDraft();
    expect(dirtyKeys(saved, { ...saved, modeModels: { ask: 'x' } })).toEqual(['modeModels']);
    expect(CONFIG_KEYS).toContain('modeModels');
  });

  it('indexes the Model per mode row for search', () => {
    expect(filterSettings(SETTINGS_INDEX, 'per mode').map((h) => h.rowId)).toContain('row-mode-models');
  });

  it('markSaved copies only the saved keys, so a failed part stays dirty', () => {
    const saved = emptyDraft();
    const draft = { ...saved, model: 'x', sandbox: { ...saved.sandbox, denyTools: ['fetch_url'] } };
    const after = markSaved(saved, draft, CONFIG_KEYS);
    expect(dirtyKeys(after, draft)).toEqual(['sandbox']);
  });
});

describe('filterSettings', () => {
  it('matches labels and descriptions case-insensitively', () => {
    const hits = filterSettings(SETTINGS_INDEX, 'REASONING');
    expect(hits.map((h) => h.rowId)).toEqual(expect.arrayContaining(['row-effort', 'row-show-reasoning']));
  });

  it('returns nothing for empty or whitespace queries', () => {
    expect(filterSettings(SETTINGS_INDEX, '')).toEqual([]);
    expect(filterSettings(SETTINGS_INDEX, '   ')).toEqual([]);
  });

  it('indexes every section once at least', () => {
    expect(new Set(SETTINGS_INDEX.map((e) => e.section))).toEqual(new Set(['model', 'keys', 'agents', 'mcp', 'skills', 'perm', 'display', 'backup']));
  });
});

describe('review fixes', () => {
  it('keeps fields the page does not edit (model, limits) through a load-edit-save cycle', () => {
    const loaded = [{ id: 'migrator', description: 'd', systemPrompt: 'p', allowedTools: ['read_file'], forbiddenTools: ['run_command'], maxIterations: 20, model: 'MiniMax-M2', provider: 'minimax', builtin: false }];
    const draft = { ...emptyDraft(), agents: agentsToDraft(loaded) };
    draft.agents[0]!.description = 'edited';
    const [msg] = saveMessages(draft, ['agents']);
    expect(msg).toEqual({ type: 'saveAgents', agents: [{ id: 'migrator', description: 'edited', systemPrompt: 'p', allowedTools: ['read_file'], forbiddenTools: ['run_command'], maxIterations: 20, model: 'MiniMax-M2', provider: 'minimax' }] });
  });

  it('sends null to clear reasoning effort (undefined would vanish in postMessage)', () => {
    const [msg] = saveMessages({ ...emptyDraft(), reasoningEffort: '' }, ['reasoningEffort']);
    expect(msg).toEqual({ type: 'save', patch: { reasoningEffort: null } });
  });

  it('never throws on a non-string rule pattern', () => {
    const d = { allowTools: [], denyTools: [], rules: [{ tool: 'run_command', dimension: 'deniedCommands', pattern: {} as unknown as string }] };
    expect(() => draftToSandbox(d)).not.toThrow();
  });
});

describe('autoApprove', () => {
  it('defaults to the read-only tools and saves only a changed list', () => {
    expect(emptyDraft().autoApprove).toEqual([...DEFAULT_AUTO_APPROVE].sort());
    expect(applyConfig(emptyDraft(), {}).autoApprove).toEqual([...DEFAULT_AUTO_APPROVE].sort());
    expect(applyConfig(emptyDraft(), { autoApproveTools: ['edit_file'] }).autoApprove).toEqual(['edit_file']);
    const more = { ...emptyDraft(), autoApprove: sortedTools([...DEFAULT_AUTO_APPROVE, 'edit_file']) };
    expect(saveMessages(more, ['autoApprove'])).toEqual([{ type: 'save', patch: { autoApproveTools: sortedTools([...DEFAULT_AUTO_APPROVE, 'edit_file']) } }]);
    // an empty list is a real choice (ask about everything), not "unset"
    expect(saveMessages({ ...emptyDraft(), autoApprove: [] }, ['autoApprove'])).toEqual([{ type: 'save', patch: { autoApproveTools: [] } }]);
    // back to the default: the key is cleared
    expect(saveMessages(emptyDraft(), ['autoApprove'])).toEqual([{ type: 'save', patch: { autoApproveTools: null } }]);
    expect(dirtyKeys(applyConfig(emptyDraft(), {}), more)).toEqual(['autoApprove']);
  });

  it('keeps the page default in step with core', () => {
    expect([...DEFAULT_AUTO_APPROVE].sort()).toEqual([...READ_ONLY_TOOLS].sort());
  });
});

describe('filterSettings ranking and keywords', () => {
  const rows = (q: string) => filterSettings(SETTINGS_INDEX, q).map((e) => e.rowId);

  it('requires every word to match, in any order', () => {
    expect(rows('key api')).toContain('row-keys');
    expect(rows('key zzzz')).toEqual([]);
  });

  it('finds a setting by a word that is not in its label (provider and tool names, synonyms)', () => {
    expect(rows('anthropic')).toEqual(expect.arrayContaining(['row-provider', 'row-keys']));
    expect(rows('write_file')).toContain('row-tools');
    expect(rows('whitelist')).toContain('row-allow');
  });

  it('puts a label match ahead of a description match', () => {
    const hits = rows('model');
    expect(hits[0]).toBe('row-model');
  });

  it('returns nothing for an empty query', () => {
    expect(rows('   ')).toEqual([]);
  });
});
