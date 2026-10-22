/** What the background-agents strip shows, as plain data. vscode-free so it is unit-testable. */
import type { BackgroundAgent } from '@ikarmic/forge-core';

export interface BgItemView {
  id: string;
  label: string;
  title: string;
  state: BackgroundAgent['state'];
  detail: string;
  canStop: boolean;
  canDismiss: boolean;
}

export interface BgStripView {
  items: BgItemView[];
  canStopAll: boolean;
}

const LABEL_MAX = 80;

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function detailFor(a: BackgroundAgent, now: number): string {
  switch (a.state) {
    case 'running':
      return `running ${clock(now - a.startedAt)}`;
    case 'done': {
      const steps = a.result?.iterations;
      return `done in ${clock((a.endedAt ?? now) - a.startedAt)}${steps ? ` · ${steps} step${steps === 1 ? '' : 's'}` : ''}`;
    }
    case 'failed':
      return `failed: ${a.error ?? 'unknown error'}`;
    case 'stopped':
      return 'stopped';
  }
}

export function bgStripView(agents: readonly BackgroundAgent[], now: number): BgStripView {
  return {
    items: agents.map((a) => {
      const oneLine = a.task.replace(/\s+/g, ' ').trim();
      return {
        id: a.id,
        label: oneLine.length > LABEL_MAX ? `${oneLine.slice(0, LABEL_MAX - 1)}…` : oneLine,
        title: a.task,
        state: a.state,
        detail: detailFor(a, now),
        canStop: a.state === 'running',
        canDismiss: a.state !== 'running',
      };
    }),
    canStopAll: agents.some((a) => a.state === 'running'),
  };
}
