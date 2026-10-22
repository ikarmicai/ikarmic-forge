import { describe, expect, it } from 'vitest';

import { CompletionUsage, completionGate, snoozeEnd, statusText } from '../src/completion-controls.js';

const base = { enabled: true, automatic: true, snoozedUntil: 0, now: 1_000, manual: false };

describe('completionGate', () => {
  it('runs when on, automatic and not snoozed', () => {
    expect(completionGate(base)).toBe('run');
  });
  it('is off when the switch is off, even for a manual trigger', () => {
    expect(completionGate({ ...base, enabled: false, manual: true })).toBe('off');
  });
  it('is snoozed until the end time, then runs again', () => {
    expect(completionGate({ ...base, snoozedUntil: 2_000 })).toBe('snoozed');
    expect(completionGate({ ...base, snoozedUntil: 1_000 })).toBe('run');
  });
  it('a manual trigger overrides a snooze', () => {
    expect(completionGate({ ...base, snoozedUntil: 2_000, manual: true })).toBe('run');
  });
  it('waits for the key when automatic is off', () => {
    expect(completionGate({ ...base, automatic: false })).toBe('manual-only');
    expect(completionGate({ ...base, automatic: false, manual: true })).toBe('run');
  });
});

describe('snoozeEnd', () => {
  it('adds minutes to now', () => {
    expect(snoozeEnd(1_000, 5)).toBe(1_000 + 5 * 60_000);
  });
});

describe('CompletionUsage', () => {
  it('sums requests and tokens, and ignores missing usage', () => {
    const u = new CompletionUsage();
    u.add({ inputTokens: 100, outputTokens: 20 });
    u.add({});
    expect(u.snapshot()).toEqual({ requests: 2, input: 100, output: 20 });
    u.reset();
    expect(u.snapshot()).toEqual({ requests: 0, input: 0, output: 0 });
  });
});

describe('statusText', () => {
  const t = new Date(2026, 9, 22, 14, 5).getTime();
  it('shows each state', () => {
    expect(statusText({ enabled: true, snoozedUntil: 0, now: 0 })).toContain('Autocomplete');
    expect(statusText({ enabled: false, snoozedUntil: 0, now: 0 })).toContain('off');
    expect(statusText({ enabled: true, snoozedUntil: t, now: t - 60_000 })).toContain('14:05');
  });
});
