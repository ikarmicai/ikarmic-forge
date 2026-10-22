import { describe, expect, it } from 'vitest';

import { notifyChannels, notifyKind, shouldNotify } from '../src/chat/notify.js';

const base = { enabled: true, minSeconds: 20, durationMs: 30_000, windowFocused: false, reason: 'completed' as const };

describe('shouldNotify', () => {
  it('notifies when enabled, unfocused, long enough and finished', () => {
    expect(shouldNotify(base)).toBe(true);
  });

  it('stays quiet when disabled', () => {
    expect(shouldNotify({ ...base, enabled: false })).toBe(false);
  });

  it('stays quiet while the window is focused', () => {
    expect(shouldNotify({ ...base, windowFocused: true })).toBe(false);
  });

  it('stays quiet for runs shorter than minSeconds, and notifies at exactly minSeconds', () => {
    expect(shouldNotify({ ...base, durationMs: 19_999 })).toBe(false);
    expect(shouldNotify({ ...base, durationMs: 20_000 })).toBe(true);
  });

  it('stays quiet when the user aborted the run', () => {
    expect(shouldNotify({ ...base, reason: 'aborted' })).toBe(false);
  });
});

describe('notifyKind', () => {
  it('calls completed, plan and spec runs finished', () => {
    expect(['completed', 'plan', 'spec'].map((r) => notifyKind(r as never))).toEqual(['finished', 'finished', 'finished']);
  });

  it('calls limit, loop and error stops stopped', () => {
    const stops = ['max_iterations', 'max_duration', 'budget_exceeded', 'loop_detected', 'error'];
    expect(stops.map((r) => notifyKind(r as never))).toEqual(stops.map(() => 'stopped'));
  });

  it('has no kind for an abort or a missing key, where the user is already looking', () => {
    expect(notifyKind('aborted')).toBeUndefined();
    expect(notifyKind('no_provider_key')).toBeUndefined();
  });
});

describe('notifyChannels', () => {
  const full = { ...base, sound: false, osToast: false };

  it('uses only the channels that are switched on', () => {
    expect(notifyChannels({ ...full, sound: true })).toEqual({ message: true, sound: true, toast: false });
    expect(notifyChannels({ ...full, enabled: false, sound: true })).toEqual({ message: false, sound: true, toast: false });
    expect(notifyChannels({ ...full, enabled: false, osToast: true })).toEqual({ message: false, sound: false, toast: true });
  });

  it('is silent on every channel while the window is focused or the run was short', () => {
    expect(notifyChannels({ ...full, sound: true, osToast: true, windowFocused: true })).toBeUndefined();
    expect(notifyChannels({ ...full, sound: true, osToast: true, durationMs: 1 })).toBeUndefined();
  });

  it('is silent when every channel is off', () => {
    expect(notifyChannels({ ...full, enabled: false })).toBeUndefined();
  });
});
