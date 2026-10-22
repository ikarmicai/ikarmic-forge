import { describe, expect, it } from 'vitest';

import { expandAgentMention } from '../src/chat/agent-mention.js';

const names = ['reviewer', 'docs'];

describe('expandAgentMention', () => {
  it('turns "@name task" into an instruction to delegate to that agent', () => {
    const out = expandAgentMention('@reviewer check the auth module', names);
    expect(out).toContain('sub_agent');
    expect(out).toContain('agent "reviewer"');
    expect(out).toContain('check the auth module');
  });

  it('leaves text alone when the name is unknown, the @ is not first, or there is no task', () => {
    expect(expandAgentMention('@nobody do it', names)).toBeUndefined();
    expect(expandAgentMention('ask @reviewer to look', names)).toBeUndefined();
    expect(expandAgentMention('@reviewer', names)).toBeUndefined();
    expect(expandAgentMention('@reviewer   ', names)).toBeUndefined();
  });

  it('does not match a longer word that starts with an agent name', () => {
    expect(expandAgentMention('@reviewers please', names)).toBeUndefined();
  });

  it('the task is passed through as data inside quotes-free text, newlines kept', () => {
    expect(expandAgentMention('@docs line one\nline two', names)).toContain('line one\nline two');
  });
});
