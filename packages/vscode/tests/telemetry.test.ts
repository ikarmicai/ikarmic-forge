/**
 * Unit tests for the CompletionTelemetry class. Pure logic — no VS Code host.
 */
import { describe, expect, it } from 'vitest';

import { CompletionTelemetry } from '../src/telemetry.js';

describe('CompletionTelemetry', () => {
  it('starts with zero counts', () => {
    const t = new CompletionTelemetry();
    expect(t.snapshot()).toEqual({ shown: 0, accepted: 0, rejected: 0, partial: 0 });
  });

  it('accumulates shown / accepted / rejected / partial independently', () => {
    const t = new CompletionTelemetry();
    t.recordShown();
    t.recordShown();
    t.recordAccepted();
    t.recordPartial();
    t.recordRejected();
    expect(t.snapshot()).toEqual({ shown: 2, accepted: 1, rejected: 1, partial: 1 });
  });

  it('resets counts', () => {
    const t = new CompletionTelemetry();
    t.recordShown();
    t.recordAccepted();
    t.reset();
    expect(t.snapshot()).toEqual({ shown: 0, accepted: 0, rejected: 0, partial: 0 });
  });

  it('snapshot is a copy — mutating it does not affect internal state', () => {
    const t = new CompletionTelemetry();
    t.recordShown();
    const s = t.snapshot();
    s.shown = 999;
    expect(t.snapshot().shown).toBe(1);
  });

  it('formatForTooltip returns a placeholder when nothing shown', () => {
    const t = new CompletionTelemetry();
    expect(t.formatForTooltip()).toBe('No completions shown yet');
  });

  it('formatForTooltip includes accept rate', () => {
    const t = new CompletionTelemetry();
    for (let i = 0; i < 10; i++) t.recordShown();
    for (let i = 0; i < 7; i++) t.recordAccepted();
    const tip = t.formatForTooltip();
    expect(tip).toContain('Completions shown: 10');
    expect(tip).toContain('Accepted (full): 7');
    expect(tip).toContain('Accept rate: 70%');
  });
});
