import { describe, expect, it } from 'vitest';

import { shouldApplyEnhanced } from '../src/chat/enhance-apply.js';
import * as webviewLib from '../src/chat/webview-lib.js';

describe('webview-lib', () => {
  it('exposes shouldApplyEnhanced on window.ForgeUI, which the chat page calls after an enhance reply', () => {
    expect(webviewLib.shouldApplyEnhanced).toBe(shouldApplyEnhanced);
  });
});

describe('shouldApplyEnhanced', () => {
  it('applies a different, non-blank reply while the box still holds the draft that was sent', () => {
    expect(shouldApplyEnhanced('fix bug', 'fix bug', 'Fix the null check in parseConfig.')).toBe(true);
  });

  it('does not overwrite what the user typed or cleared while the request was running', () => {
    expect(shouldApplyEnhanced('fix bug', 'fix bug and also add tests', 'Fix the null check.')).toBe(false);
    expect(shouldApplyEnhanced('fix bug', '', 'Fix the null check.')).toBe(false);
  });

  it('ignores a blank, missing or non-string reply', () => {
    expect(shouldApplyEnhanced('fix bug', 'fix bug', '   ')).toBe(false);
    expect(shouldApplyEnhanced('fix bug', 'fix bug', undefined)).toBe(false);
    expect(shouldApplyEnhanced('fix bug', 'fix bug', 42)).toBe(false);
  });

  it('ignores a reply identical to the draft, so the undo stack is not touched for nothing', () => {
    expect(shouldApplyEnhanced('fix bug', 'fix bug', 'fix bug')).toBe(false);
  });
});
