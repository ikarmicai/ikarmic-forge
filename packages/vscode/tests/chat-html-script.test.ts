import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';

describe('chat webview page script', () => {
  const scripts = [...chatHtml({ strings: { Send: 'Enviar' } }).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);

  it('has inline scripts', () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  // The page is a template literal: a stray escape (a `\n` that should be `\\n`) turns into a real
  // newline inside a JS string and the whole webview dies silently, so parse every script.
  it.each(scripts.map((s, i) => [i, s] as const))('inline script %i is valid JavaScript', (_i, source) => {
    expect(() => new Function(source)).not.toThrow();
  });
});
