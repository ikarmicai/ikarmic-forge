/**
 * The step-group header says which tool calls ran without an approval card, and why (Release 1 design, feature 1).
 * The page swaps translations by exact text, so the header is built from parts: numbers and labels apart.
 */
import { describe, expect, it } from 'vitest';

import { whyRan } from '../src/chat/approval-level.js';
import * as webviewLib from '../src/chat/webview-lib.js';
import { WEBVIEW_STRINGS } from '../src/chat/webview-i18n.js';
import { stepsHeadParts, WHY_LABEL, WHY_ROW } from '../src/chat/why-ran.js';

describe('whyRan', () => {
  it('tells Accept edits apart from the auto-approve list', () => {
    expect(whyRan('list', 'edit_file', 'edits', undefined)).toBe('edits');
    expect(whyRan('list', 'read_file', 'edits', undefined)).toBe('list');
    // The person listed the tool themselves: their list let it run, not the level.
    expect(whyRan('list', 'edit_file', 'edits', ['edit_file'])).toBe('list');
    expect(whyRan('list', 'edit_file', 'ask', undefined)).toBe('list');
  });

  it('passes the other reasons through and drops calls the person approved', () => {
    expect(whyRan('always', 'run_command', 'ask', undefined)).toBe('always');
    expect(whyRan('autonomous', 'run_command', 'auto', undefined)).toBe('autonomous');
    expect(whyRan('rule', 'write_file', 'ask', undefined)).toBe('rule');
    expect(whyRan('memory', 'memory_write', 'ask', undefined)).toBe('memory');
    expect(whyRan('person', 'write_file', 'ask', undefined)).toBeUndefined();
    expect(whyRan(undefined, 'todo_write', 'ask', undefined)).toBeUndefined();
  });
});

describe('stepsHeadParts', () => {
  it('keeps today\'s header when nothing ran unasked: none below three steps, the count from three', () => {
    expect(stepsHeadParts(2, {})).toBeUndefined();
    expect(stepsHeadParts(4, {})).toEqual(['4', 'steps']);
  });

  it('counts the unasked calls by reason, in a fixed order, even for a group of one', () => {
    expect(stepsHeadParts(3, { always: 1, list: 1, edits: 1 })).toEqual(['3', 'steps', 'ran without asking:', '1', 'auto-approve list', '1', 'Accept edits', '1', 'always allowed']);
    expect(stepsHeadParts(1, { autonomous: 1 })).toEqual(['1', 'step', 'ran without asking:', '1', 'Autonomous']);
  });

  it('counts only the unasked calls when the person approved others in the same group', () => {
    expect(stepsHeadParts(3, { list: 1 })).toEqual(['3', 'steps', 'ran without asking:', '1', 'auto-approve list']);
  });
});

describe('the page can use and translate it', () => {
  it('is on window.ForgeUI (RB-3)', () => {
    expect(typeof (webviewLib as Record<string, unknown>).stepsHeadParts).toBe('function');
    expect((webviewLib as Record<string, unknown>).WHY_ROW).toEqual(WHY_ROW);
  });

  it('lists every label and row sentence for translation', () => {
    for (const s of [...Object.values(WHY_LABEL), ...Object.values(WHY_ROW), 'ran without asking:', 'step', 'steps']) expect(WEBVIEW_STRINGS, s).toContain(s);
  });
});
