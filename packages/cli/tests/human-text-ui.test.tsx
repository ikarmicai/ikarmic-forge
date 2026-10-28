/**
 * RB-55: the terminal app shows words, not internal names, for tools and for why a run ended.
 */
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { Approval } from '../src/components/Approval.js';
import { Footer } from '../src/components/Footer.js';
import { ToolEvent } from '../src/components/ToolEvent.js';

describe('the terminal shows words', () => {
  it('a tool line names the tool in words', () => {
    const { lastFrame } = render(<ToolEvent name="read_file" args={{ path: 'x' }} result="ok" />);
    expect(lastFrame()).toContain('Read file');
    expect(lastFrame()).not.toContain('read_file');
  });

  it('the footer says why the run ended in words', () => {
    const { lastFrame } = render(<Footer inputTokens={1} outputTokens={1} durationMs={1} iteration={50} reason="max_iterations" />);
    expect(lastFrame()).toContain('Step limit reached');
    expect(lastFrame()).not.toContain('max_iterations');
  });

  it('an approval names the tool in words', () => {
    const request = { id: 'a', name: 'run_command', args: { command: 'ls' }, destructive: true } as never;
    const { lastFrame } = render(<Approval request={request} onResolve={() => undefined} />);
    expect(lastFrame()).toContain('Run command');
    expect(lastFrame()).not.toContain('run_command');
  });
});
