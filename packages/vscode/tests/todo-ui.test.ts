import { describe, expect, it } from 'vitest';

import { renderTodoSummary } from '../src/chat/todo-summary.js';
import * as webviewLib from '../src/chat/webview-lib.js';

const t = (content: string, status: 'pending' | 'in_progress' | 'completed') => ({ content, status });

describe('renderTodoSummary', () => {
  it('shows done over total and the item in progress', () => {
    expect(renderTodoSummary([t('a', 'completed'), t('b', 'completed'), t('Write the README', 'in_progress'), t('d', 'pending'), t('e', 'pending')])).toBe('2/5 done · Write the README');
  });

  it('leaves out the current item when nothing is in progress', () => {
    expect(renderTodoSummary([t('a', 'completed'), t('b', 'pending')])).toBe('1/2 done');
    expect(renderTodoSummary([t('a', 'completed')])).toBe('1/1 done');
  });

  it('is empty for an empty list, so the chip hides', () => {
    expect(renderTodoSummary([])).toBe('');
  });

  it('shortens a long current item', () => {
    const out = renderTodoSummary([t('x'.repeat(200), 'in_progress')]);
    expect(out.length).toBeLessThan(90);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('webview-lib', () => {
  it('exposes renderTodoSummary on window.ForgeUI, which the chat page calls when the todo list changes (RB-3)', () => {
    expect(webviewLib.renderTodoSummary).toBe(renderTodoSummary);
  });
});
