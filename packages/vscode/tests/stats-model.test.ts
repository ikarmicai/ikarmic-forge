import { describe, expect, it } from 'vitest';

import type { ListEntry } from '@ikarmic/forge-core';

import { computeStats, formatStatsMarkdown } from '../src/stats-model.js';

const now = new Date(2026, 8, 30, 12, 0, 0);
const entry = (over: Partial<ListEntry> & { daysAgo?: number }): ListEntry => {
  const t = new Date(now.getTime() - (over.daysAgo ?? 0) * 86400000).toISOString();
  return {
    id: 'x', cwd: '/w', model: { provider: 'openai', model: 'gpt-4o' }, createdAt: t, updatedAt: t, sizeBytes: 1,
    totalInputTokens: 1000, totalOutputTokens: 200, totalCostUsd: 0.5, costKnown: true, ...over,
  } as ListEntry;
};

describe('computeStats', () => {
  it('sums sessions in range and ignores older ones', () => {
    const s = computeStats([entry({}), entry({ daysAgo: 3 }), entry({ daysAgo: 45 })], 30, now);
    expect(s).toMatchObject({ sessions: 2, inputTokens: 2000, outputTokens: 400, costUsd: 1 });
  });

  it('groups by model, biggest spend first', () => {
    const s = computeStats(
      [entry({}), entry({ model: { provider: 'anthropic', model: 'claude' }, totalCostUsd: 3 }), entry({})],
      30,
      now
    );
    expect(s.byModel.map((m) => [m.model, m.sessions, m.costUsd])).toEqual([['anthropic/claude', 1, 3], ['openai/gpt-4o', 2, 1]]);
  });

  it('does not count cost for unpriced sessions but reports how many', () => {
    const s = computeStats([entry({ costKnown: false, totalCostUsd: 0 }), entry({})], 30, now);
    expect(s.costUsd).toBe(0.5);
    expect(s.unpricedSessions).toBe(1);
  });

  it('counts sessions per day in date order', () => {
    const s = computeStats([entry({ daysAgo: 2 }), entry({ daysAgo: 2 }), entry({ daysAgo: 1 })], 30, now);
    expect(s.perDay.map((d) => d.sessions)).toEqual([2, 1]);
  });

  it('handles no data', () => {
    expect(formatStatsMarkdown(computeStats([], 30, now))).toContain('No sessions');
  });

  it('renders a readable markdown report with a local-only footer', () => {
    const md = formatStatsMarkdown(computeStats([entry({}), entry({ totalInputTokens: 2_500_000 })], 30, now));
    expect(md).toContain('**Sessions:** 2');
    expect(md).toContain('2.50M');
    expect(md).toContain('| openai/gpt-4o | 2 |');
    expect(md).toContain('Nothing is uploaded');
  });
});
