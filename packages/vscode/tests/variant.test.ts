import { describe, expect, it } from 'vitest';

import { effortLabel, nextEffort } from '../src/chat/variant.js';

describe('nextEffort', () => {
  it('cycles provider default, low, medium, high and back', () => {
    expect(nextEffort(undefined)).toBe('low');
    expect(nextEffort('')).toBe('low');
    expect(nextEffort('low')).toBe('medium');
    expect(nextEffort('medium')).toBe('high');
    expect(nextEffort('high')).toBe('');
  });

  it('an effort outside the cycle (set in the config file) starts the cycle again from low', () => {
    expect(nextEffort('xhigh')).toBe('low');
    expect(nextEffort('minimal')).toBe('low');
  });
});

describe('effortLabel', () => {
  it('names the empty effort as the provider default', () => {
    expect(effortLabel('')).toBe('provider default');
    expect(effortLabel('high')).toBe('high');
  });
});
