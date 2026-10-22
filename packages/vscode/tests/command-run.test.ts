import { describe, expect, it } from 'vitest';

import { planCommandRun } from '../src/chat/command-run.js';

const base = { template: 'Review $ARGUMENTS' };
const ctx = { agentNames: ['reviewer'], modeIds: ['agent', 'ask', 'plan'] };

describe('planCommandRun', () => {
  it('a plain command is just its expanded text', () => {
    expect(planCommandRun(base, 'the diff', ctx)).toEqual({ text: 'Review the diff' });
  });

  it('agent naming a mode switches the run to that mode', () => {
    expect(planCommandRun({ ...base, agent: 'plan' }, 'x', ctx)).toEqual({ text: 'Review x', modeId: 'plan' });
  });

  it('subtask with an agent file delegates through sub_agent instead of switching', () => {
    const r = planCommandRun({ ...base, agent: 'reviewer', subtask: true }, 'x', ctx);
    expect(r.modeId).toBeUndefined();
    expect(r.text).toContain('sub_agent');
    expect(r.text).toContain('agent "reviewer"');
    expect(r.text).toContain('Review x');
  });

  it('an agent that is neither a mode nor an agent file is ignored, with a note', () => {
    const r = planCommandRun({ ...base, agent: 'ghost' }, 'x', ctx);
    expect(r.text).toBe('Review x');
    expect(r.modeId).toBeUndefined();
    expect(r.problem).toContain('ghost');
  });

  it('model passes through, trimmed, and a blank one is left out', () => {
    expect(planCommandRun({ ...base, model: ' fast ' }, 'x', ctx)).toEqual({ text: 'Review x', model: 'fast' });
    expect(planCommandRun({ ...base, model: '  ' }, 'x', ctx)).toEqual({ text: 'Review x' });
  });

  it('variant passes through', () => {
    expect(planCommandRun({ ...base, variant: 'high' }, 'x', ctx)).toEqual({ text: 'Review x', variant: 'high' });
  });

  it('a primary agent file works as a mode, and subtask on a mode-only name falls back to switching', () => {
    expect(planCommandRun({ ...base, agent: 'ask', subtask: true }, 'x', ctx)).toEqual({ text: 'Review x', modeId: 'ask' });
  });
});
