import { describe, expect, it } from 'vitest';

import { blockOpen, reasoningMode, toolBlockKind } from '../src/chat/block-modes.js';
import { applyConfig, dirtyKeys, emptyDraft, saveMessages } from '../src/settings/settings-model.js';
import * as UI from '../src/chat/webview-lib.js';

describe('toolBlockKind', () => {
  it('sorts tools into terminal, edit, mcp and other', () => {
    expect(toolBlockKind('run_command')).toBe('terminal');
    for (const n of ['write_file', 'edit_file', 'apply_patch', 'edit_notebook']) expect(toolBlockKind(n)).toBe('edit');
    expect(toolBlockKind('mcp__github__create_issue')).toBe('mcp');
    expect(toolBlockKind('read_file')).toBe('other');
  });
});

describe('blockOpen', () => {
  it('follows blockDefault when no kind is set, but an edit with a diff stays open as before', () => {
    expect(blockOpen('read_file', { blockDefault: 'collapsed' }, false)).toBe(false);
    expect(blockOpen('read_file', { blockDefault: 'expanded' }, false)).toBe(true);
    expect(blockOpen('edit_file', { blockDefault: 'collapsed' }, true)).toBe(true);
  });

  it('a kind setting wins over blockDefault, for edits too', () => {
    expect(blockOpen('run_command', { blockDefault: 'collapsed', blocks: { terminal: 'expanded' } }, false)).toBe(true);
    expect(blockOpen('run_command', { blockDefault: 'expanded', blocks: { terminal: 'collapsed' } }, false)).toBe(false);
    expect(blockOpen('edit_file', { blockDefault: 'collapsed', blocks: { edit: 'collapsed' } }, true)).toBe(false);
    expect(blockOpen('mcp__a__b', { blockDefault: 'collapsed', blocks: { mcp: 'expanded' } }, false)).toBe(true);
  });

  it('is collapsed with no settings at all', () => {
    expect(blockOpen('run_command', {}, false)).toBe(false);
  });
});

describe('reasoningMode', () => {
  it('is collapsed by default, hidden by showReasoning false, and the blocks setting wins', () => {
    expect(reasoningMode({})).toBe('collapsed');
    expect(reasoningMode({ showReasoning: false })).toBe('hidden');
    expect(reasoningMode({ showReasoning: false, blocks: { reasoning: 'expanded' } })).toBe('expanded');
    expect(reasoningMode({ blocks: { reasoning: 'hidden' } })).toBe('hidden');
  });
});

describe('the chat page can call them (RB-3)', () => {
  it('webview-lib exports the helpers the page uses', () => {
    expect(typeof (UI as Record<string, unknown>).blockOpen).toBe('function');
    expect(typeof (UI as Record<string, unknown>).reasoningMode).toBe('function');
  });
});

describe('Settings draft for block modes', () => {
  it('reads display.blocks, blank when not set', () => {
    expect(emptyDraft().blockModes).toEqual({ reasoning: '', terminal: '', edit: '', mcp: '' });
    const d = applyConfig(emptyDraft(), { display: { blocks: { terminal: 'expanded', reasoning: 'hidden' } } });
    expect(d.blockModes).toEqual({ reasoning: 'hidden', terminal: 'expanded', edit: '', mcp: '' });
  });

  it('saves only the kinds that are set, and nothing extra when none is', () => {
    const saved = emptyDraft();
    const draft = { ...saved, blockModes: { ...saved.blockModes, edit: 'collapsed' } };
    expect(dirtyKeys(saved, draft)).toEqual(['blockModes']);
    expect(saveMessages(draft, ['blockModes'])).toEqual([
      { type: 'save', patch: { display: { blockDefault: 'collapsed', showReasoning: true, blocks: { edit: 'collapsed' } } } },
    ]);
    expect(saveMessages(saved, ['blockDefault'])).toEqual([{ type: 'save', patch: { display: { blockDefault: 'collapsed', showReasoning: true } } }]);
  });
});
