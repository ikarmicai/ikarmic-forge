import { describe, expect, it } from 'vitest';
import { historyStep, pushPrompt, userPrompts } from '../src/chat/prompt-history.js';
import { chatHtml } from '../src/chat/html.js';
import * as lib from '../src/chat/webview-lib.js';

describe('pushPrompt', () => {
  it('trims, skips empty text and a repeat of the newest, and caps the list', () => {
    expect(pushPrompt(['a'], '  b  ')).toEqual(['a', 'b']);
    expect(pushPrompt(['a', 'b'], 'b')).toEqual(['a', 'b']);
    expect(pushPrompt(['a', 'b'], 'a')).toEqual(['a', 'b', 'a']);
    expect(pushPrompt([], '   ')).toEqual([]);
    expect(pushPrompt(Array.from({ length: 100 }, (_, i) => String(i)), 'x')).toHaveLength(100);
    expect(pushPrompt(Array.from({ length: 100 }, (_, i) => String(i)), 'x')[0]).toBe('1');
  });
  it('does not change the list it was given', () => {
    const list = ['a'];
    pushPrompt(list, 'b');
    expect(list).toEqual(['a']);
  });
});

describe('userPrompts', () => {
  it('takes the person\'s messages of a session, oldest first, without the answers', () => {
    const items = [
      { role: 'user', text: 'first' },
      { role: 'assistant', text: 'answer' },
      { role: 'user', text: ' second ' },
    ];
    expect(userPrompts(items)).toEqual(['first', 'second']);
  });
});

describe('historyStep', () => {
  const s0 = { index: -1, draft: '' };
  it('walks back and forward and keeps the draft', () => {
    expect(historyStep(s0, 'up', ['old', 'new'], 'typed')).toEqual({ index: 1, draft: 'typed', value: 'new' });
    expect(historyStep({ index: 1, draft: 'typed' }, 'up', ['old', 'new'], 'new')).toEqual({ index: 0, draft: 'typed', value: 'old' });
    expect(historyStep({ index: 0, draft: 'typed' }, 'up', ['old', 'new'], 'old')).toBeUndefined();
    expect(historyStep({ index: 0, draft: 'typed' }, 'down', ['old', 'new'], 'old')).toEqual({ index: 1, draft: 'typed', value: 'new' });
    expect(historyStep({ index: 1, draft: 'typed' }, 'down', ['old', 'new'], 'new')).toEqual({ index: -1, draft: 'typed', value: 'typed' });
    expect(historyStep(s0, 'down', ['old'], '')).toBeUndefined();
  });
  it('does nothing with no history', () => {
    expect(historyStep(s0, 'up', [], 'typed')).toBeUndefined();
  });
});

describe('webview-lib export (RB-3)', () => {
  it('puts historyStep on window.ForgeUI', () => {
    expect(typeof (lib as Record<string, unknown>).historyStep).toBe('function');
  });
});

describe('the page', () => {
  const html = chatHtml();
  it('receives the list from the host and marks Continue so the host does not remember it', () => {
    expect(html).toContain("case 'prompt_history':");
    expect(html).toMatch(/text, level: approvalSelect\.value, resume: true/);
  });
});
