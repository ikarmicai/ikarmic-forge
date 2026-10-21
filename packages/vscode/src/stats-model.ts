/**
 * Local usage statistics from saved sessions (`~/.forge/sessions`). Nothing is
 * sent anywhere: this only summarizes files that already exist on disk.
 * Pure (type-only imports).
 */
import type { ListEntry } from '@ikarmic/forge-core';

export interface ModelStats {
  model: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface UsageStats {
  days: number;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Sessions whose model has no known pricing (their cost is not counted). */
  unpricedSessions: number;
  byModel: ModelStats[];
  /** Sessions started per local calendar day, oldest first (only days with activity). */
  perDay: Array<{ day: string; sessions: number }>;
}

const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function computeStats(entries: readonly ListEntry[], days: number, now: Date = new Date()): UsageStats {
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;
  const inRange = entries.filter((e) => new Date(e.updatedAt).getTime() >= since);
  const models = new Map<string, ModelStats>();
  const perDay = new Map<string, number>();
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let unpriced = 0;

  for (const e of inRange) {
    const key = `${e.model.provider}/${e.model.model}`;
    const m = models.get(key) ?? { model: key, sessions: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    m.sessions += 1;
    m.inputTokens += e.totalInputTokens ?? 0;
    m.outputTokens += e.totalOutputTokens ?? 0;
    if (e.costKnown === false) unpriced += 1;
    else m.costUsd += e.totalCostUsd ?? 0;
    models.set(key, m);

    inputTokens += e.totalInputTokens ?? 0;
    outputTokens += e.totalOutputTokens ?? 0;
    if (e.costKnown !== false) costUsd += e.totalCostUsd ?? 0;

    const day = dayKey(new Date(e.createdAt));
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  return {
    days,
    sessions: inRange.length,
    inputTokens,
    outputTokens,
    costUsd,
    unpricedSessions: unpriced,
    byModel: [...models.values()].sort((a, b) => b.costUsd - a.costUsd || b.sessions - a.sessions),
    perDay: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, sessions]) => ({ day, sessions })),
  };
}

const fmtTokens = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const fmtUsd = (n: number): string => (n === 0 ? '$0.00' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

export function formatStatsMarkdown(s: UsageStats): string {
  if (s.sessions === 0) return `# Forge usage\n\nNo sessions in the last ${s.days} days.\n`;
  const lines = [
    `# Forge usage, last ${s.days} days`,
    '',
    `- **Sessions:** ${s.sessions}`,
    `- **Tokens:** ${fmtTokens(s.inputTokens)} in, ${fmtTokens(s.outputTokens)} out`,
    `- **Cost:** ${fmtUsd(s.costUsd)}${s.unpricedSessions > 0 ? ` (${s.unpricedSessions} session(s) on unpriced models not counted)` : ''}`,
    '',
    '## By model',
    '',
    '| Model | Sessions | Tokens in | Tokens out | Cost |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...s.byModel.map((m) => `| ${m.model} | ${m.sessions} | ${fmtTokens(m.inputTokens)} | ${fmtTokens(m.outputTokens)} | ${fmtUsd(m.costUsd)} |`),
    '',
    '## Sessions per day',
    '',
    ...s.perDay.map((d) => `- ${d.day}: ${'█'.repeat(Math.min(d.sessions, 40))} ${d.sessions}`),
    '',
    '_Computed locally from ~/.forge/sessions. Nothing is uploaded._',
    '',
  ];
  return lines.join('\n');
}
