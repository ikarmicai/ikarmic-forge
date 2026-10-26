/**
 * The speed badge on a reply (Release 1, feature 2): tokens per second of one step, never a guess.
 * A provider that reports no usage, or a step with no span, shows nothing (no NaN, no Infinity).
 */
import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';
import { replySpeed } from '../src/chat/reply-speed.js';
import { WEBVIEW_STRINGS } from '../src/chat/webview-i18n.js';

describe('replySpeed', () => {
  it('is tokens per second, rounded', () => {
    expect(replySpeed({ outputTokens: 300, firstTokenAt: 1_000, endAt: 8_500 })).toBe(40);
  });

  it('shows nothing without usage, without a first token, or over a span too short to mean anything', () => {
    expect(replySpeed({ outputTokens: undefined, firstTokenAt: 1_000, endAt: 2_000 })).toBeUndefined();
    expect(replySpeed({ outputTokens: 0, firstTokenAt: 1_000, endAt: 2_000 })).toBeUndefined();
    expect(replySpeed({ outputTokens: -5, firstTokenAt: 1_000, endAt: 2_000 })).toBeUndefined();
    expect(replySpeed({ outputTokens: Number.NaN, firstTokenAt: 1_000, endAt: 2_000 })).toBeUndefined();
    expect(replySpeed({ outputTokens: 50, firstTokenAt: undefined, endAt: 2_000 })).toBeUndefined();
    expect(replySpeed({ outputTokens: 50, firstTokenAt: 1_000, endAt: 1_010 })).toBeUndefined();
    expect(replySpeed({ outputTokens: 50, firstTokenAt: 2_000, endAt: 1_000 })).toBeUndefined();
  });

  it('gives the page a translatable unit', () => {
    expect(WEBVIEW_STRINGS).toContain('tok/s');
  });
});

describe('the chat page', () => {
  it('handles reply_speed and puts the badge on the label', () => {
    const html = chatHtml();
    expect(html).toContain("case 'reply_speed':");
    expect(html).toContain("sp.className = 'speed'");
  });
});
