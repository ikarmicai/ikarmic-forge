import { describe, expect, it } from 'vitest';

import { runEndLine } from '../src/chat/run-end-log.js';

// The Output > Forge line for a finished chat run: it is what tells a missing spec card from a model that stopped.
describe('runEndLine', () => {
  it('says how a plan ended, its size and whether the spec was offered', () => {
    const line = runEndLine({ reason: 'completed', finalText: 'The plan.\n\nSize: large' }, 'plan', true);
    expect(line).toBe('Chat run ended: Completed. Mode: Plan. Answer: 22 characters, plan size large. Spec offered: yes.');
  });

  it('says when a plan did not state a size', () => {
    expect(runEndLine({ reason: 'completed', finalText: 'A plan with no size line.' }, 'plan', false)).toContain('plan size not stated. Spec offered: no.');
  });

  it('leaves the plan size out of other modes', () => {
    const line = runEndLine({ reason: 'completed', finalText: 'Done.' }, 'agent', false);
    expect(line).not.toContain('plan size');
    expect(line).toContain('Mode: Agent.');
  });

  it('shows a limit as words, never the reason code', () => {
    const line = runEndLine({ reason: 'max_iterations', finalText: '' }, 'agent', false);
    expect(line).toContain('Chat run ended: Step limit reached.');
    expect(line).not.toMatch(/max_iterations|[a-z]+_[a-z]+/);
  });
});
