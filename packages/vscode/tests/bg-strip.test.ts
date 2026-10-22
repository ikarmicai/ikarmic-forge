import { describe, expect, it } from 'vitest';

import { bgStripView } from '../src/chat/bg-strip.js';

const base = { id: 'bg-1', task: 'Research the build cache', startedAt: 1_000 };

describe('bgStripView', () => {
  it('is empty with nothing to show', () => {
    expect(bgStripView([], 5_000)).toEqual({ items: [], canStopAll: false });
  });

  it('a running agent can be stopped, and shows how long it has run', () => {
    const v = bgStripView([{ ...base, state: 'running' }], 13_000);
    expect(v.items[0]).toMatchObject({ id: 'bg-1', state: 'running', detail: 'running 12s', canStop: true, canDismiss: false });
    expect(v.canStopAll).toBe(true);
  });

  it('long runs show minutes', () => {
    expect(bgStripView([{ ...base, state: 'running' }], 1_000 + 185_000).items[0]!.detail).toBe('running 3m 5s');
  });

  it('finished agents can only be dismissed, and say how they ended', () => {
    const done = bgStripView([{ ...base, state: 'done', endedAt: 9_000, result: { task: 't', finalText: 'The cache is keyed by path.', iterations: 4, reason: 'completed', inputTokens: 1, outputTokens: 1, durationMs: 1, toolsUsed: [] } }], 20_000);
    expect(done.items[0]).toMatchObject({ state: 'done', detail: 'done in 8s · 4 steps', canStop: false, canDismiss: true });
    expect(done.canStopAll).toBe(false);
    const failed = bgStripView([{ ...base, state: 'failed', endedAt: 2_000, error: 'model refused' }], 20_000);
    expect(failed.items[0]).toMatchObject({ detail: 'failed: model refused', canDismiss: true });
    const stopped = bgStripView([{ ...base, state: 'stopped', endedAt: 2_000 }], 20_000);
    expect(stopped.items[0]!.detail).toBe('stopped');
  });

  it('clips a long task to one line and keeps the whole text for the tooltip', () => {
    const long = 'x'.repeat(300);
    const item = bgStripView([{ ...base, task: long, state: 'running' }], 2_000).items[0]!;
    expect(item.label.length).toBeLessThanOrEqual(80);
    expect(item.title).toBe(long);
  });

  it('Stop all appears only while something runs', () => {
    expect(bgStripView([{ ...base, state: 'done', endedAt: 2_000 }, { ...base, id: 'bg-2', state: 'running' }], 5_000).canStopAll).toBe(true);
  });
});
