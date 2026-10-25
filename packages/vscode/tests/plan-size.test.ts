import { describe, expect, it } from 'vitest';

import { modeForChoice, offerSpecAfterPlan, planSize } from '../src/chat/plan-size.js';
import { chatHtml } from '../src/chat/html.js';

describe('planSize', () => {
  it('reads the Size line at the end of a plan', () => {
    expect(planSize('1. Goal: x\n2. Steps: y\nSize: large')).toBe('large');
    expect(planSize('1. Goal: x\nSize: small\n')).toBe('small');
  });
  it('accepts trailing spaces, CRLF and any letter case', () => {
    expect(planSize('Goal\r\nSize: LARGE  \r\n')).toBe('large');
  });
  it('accepts a short closing note after the Size line, as MiniMax writes one in live runs', () => {
    expect(planSize('Steps\nSize: large\n\nCritical path: 1 → 2 → 3.')).toBe('large');
    expect(planSize('Steps\nSize: small\nNote one.\nNote two.')).toBe('small');
  });
  it('does not count a Size line followed by more than two lines', () => {
    expect(planSize('Size: large\nmore\nmore\nmore')).toBeUndefined();
  });
  it('takes the last Size line when there are two', () => {
    expect(planSize('Size: small\nSize: large')).toBe('large');
  });
  it('ignores a Size line inside a code block', () => {
    expect(planSize('Example:\n```\nSize: large\n```')).toBeUndefined();
    expect(planSize('Plan\n```\nSize: large\n```\nDone.')).toBeUndefined();
  });
  it('accepts the Size line in bold, in italics or with a full stop', () => {
    expect(planSize('Plan\n**Size: large**')).toBe('large');
    expect(planSize('Plan\n_Size: small._')).toBe('small');
    expect(planSize('Plan\nSize: large.')).toBe('large');
    expect(planSize('Plan\n**Size:** large')).toBe('large');
  });
  it('is undefined for an empty reply', () => {
    expect(planSize('')).toBeUndefined();
  });
});

describe('the big-request card after a plan', () => {
  const html = chatHtml();
  it('reads afterPlan from the host message', () => {
    expect(html).toContain('showSuggestSpec(msg.afterPlan)');
  });
  it('leaves out "Plan first" when the plan already exists', () => {
    expect(html).toMatch(/afterPlan \? \[\['Draft a spec', 'spec', false\], \['Just do it', 'go', true\]\]/);
  });
});

describe('offerSpecAfterPlan', () => {
  const ok = { reason: 'completed', mode: 'plan', finalText: 'Steps\nSize: large', hasSpecHandler: true, trusted: true, suggestSpec: true };
  it('offers after a completed large plan', () => {
    expect(offerSpecAfterPlan(ok)).toBe(true);
  });
  it('keeps the same gates as the big-request card: the setting, Workspace Trust and a spec flow to hand to', () => {
    expect(offerSpecAfterPlan({ ...ok, suggestSpec: false })).toBe(false);
    expect(offerSpecAfterPlan({ ...ok, trusted: false })).toBe(false);
    expect(offerSpecAfterPlan({ ...ok, hasSpecHandler: false })).toBe(false);
  });
  it('does not offer for a small plan, another mode, or a run that did not finish', () => {
    expect(offerSpecAfterPlan({ ...ok, finalText: 'Steps\nSize: small' })).toBe(false);
    expect(offerSpecAfterPlan({ ...ok, mode: 'agent' })).toBe(false);
    expect(offerSpecAfterPlan({ ...ok, reason: 'cancelled' })).toBe(false);
  });
});

describe('modeForChoice', () => {
  it('runs "Just do it" after a plan in Agent mode, not in Plan mode again', () => {
    expect(modeForChoice('go', true)).toBe('agent');
    expect(modeForChoice('never', true)).toBe('agent');
  });
  it("keeps today's behaviour for the card shown before any plan", () => {
    expect(modeForChoice('go', false)).toBeUndefined();
    expect(modeForChoice('plan', false)).toBe('plan');
  });
});
