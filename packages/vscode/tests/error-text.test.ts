import { describe, expect, it, vi } from 'vitest';

import { friendlyError } from '../src/chat/error-text.js';

// l10n.t only needs to substitute {n}; the real VS Code API is not available under vitest.
vi.mock('vscode', () => ({
  l10n: { t: (m: string, ...a: unknown[]) => m.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)])) },
}));

describe('friendlyError', () => {
  it('rewrites the SDK missing-key message into a Settings instruction', () => {
    expect(
      friendlyError("OpenAI API key is missing. Pass it using the 'apiKey' parameter or the OPENAI_API_KEY environment variable.")
    ).toBe('No OpenAI API key. Add one in Settings → API keys, or set OPENAI_API_KEY.');
    expect(
      friendlyError("Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable.")
    ).toBe('No Google Generative AI API key. Add one in Settings → API keys, or set GOOGLE_GENERATIVE_AI_API_KEY.');
  });

  it('leaves every other message alone', () => {
    expect(friendlyError('Incorrect API key provided.')).toBe('Incorrect API key provided.');
    expect(friendlyError('rate limited')).toBe('rate limited');
  });
});
