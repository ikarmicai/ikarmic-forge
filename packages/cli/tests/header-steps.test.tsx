import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { Header } from '../src/components/Header.js';

// The terminal app has no step limit by default (2026-11-06): the header must not read "step 12/Infinity".
describe('the header step count', () => {
  const header = (maxIterations: number) =>
    render(<Header model={{ provider: 'openai', model: 'gpt-4o' }} iteration={12} maxIterations={maxIterations} status="running" auto />).lastFrame() ?? '';

  it('shows only the step when there is no limit', () => {
    const frame = header(Number.POSITIVE_INFINITY);
    expect(frame).toContain('step 12 ');
    expect(frame).not.toMatch(/Infinity|∞|\/\s*·/);
  });

  it('shows step and limit when there is one', () => {
    expect(header(50)).toContain('step 12/50');
  });
});
