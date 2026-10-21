import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { Footer } from '../src/components/Footer.js';

describe('Footer cached tokens', () => {
  it('shows cached prompt tokens when present', () => {
    const { lastFrame } = render(<Footer inputTokens={12000} outputTokens={900} cachedInputTokens={9800} durationMs={1000} iteration={2} />);
    expect(lastFrame()).toContain('(9.8k cached)');
  });

  it('omits the cached chip when there are none', () => {
    const { lastFrame } = render(<Footer inputTokens={12000} outputTokens={900} durationMs={1000} iteration={2} />);
    expect(lastFrame()).not.toContain('cached');
  });
});
