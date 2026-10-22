import { describe, expect, it } from 'vitest';

import { parseSwitchLink } from '../src/switch-link.js';

describe('parseSwitchLink', () => {
  it('reads model and agent from /switch', () => {
    expect(parseSwitchLink('/switch', 'model=anthropic:claude-sonnet-5-5&agent=plan')).toEqual({ model: 'anthropic:claude-sonnet-5-5', agent: 'plan' });
  });

  it('either one alone is fine', () => {
    expect(parseSwitchLink('/switch', 'agent=ask')).toEqual({ agent: 'ask' });
    expect(parseSwitchLink('/switch', 'model=gpt-4o')).toEqual({ model: 'gpt-4o' });
  });

  it('decodes percent escapes', () => {
    expect(parseSwitchLink('/switch', 'model=groq%3Allama-3.3-70b-versatile')).toEqual({ model: 'groq:llama-3.3-70b-versatile' });
  });

  it('is undefined for another path, or when neither value is usable', () => {
    expect(parseSwitchLink('/other', 'model=x')).toBeUndefined();
    expect(parseSwitchLink('/switch', '')).toBeUndefined();
    expect(parseSwitchLink('/switch', 'foo=bar')).toBeUndefined();
  });

  it('drops values with odd characters or over 200 characters instead of passing them on', () => {
    expect(parseSwitchLink('/switch', 'model=a%20b')).toBeUndefined();
    expect(parseSwitchLink('/switch', 'model=x;rm')).toBeUndefined();
    expect(parseSwitchLink('/switch', 'model=' + 'a'.repeat(201))).toBeUndefined();
    expect(parseSwitchLink('/switch', 'model=bad%20one&agent=plan')).toEqual({ agent: 'plan' });
  });

  it('a malformed escape does not throw', () => {
    expect(parseSwitchLink('/switch', 'model=%E0%A4%A')).toBeUndefined();
  });
});
