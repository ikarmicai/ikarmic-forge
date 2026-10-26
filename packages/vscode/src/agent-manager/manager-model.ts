/**
 * Agent Manager sessions: several chats run in parallel, each optionally in its own git worktree, then merged or
 * discarded (after Kilo's Agent Manager). Pure: the panel owns the vscode side, the flow owns git.
 */

export type SessionStatus = 'starting' | 'running' | 'done' | 'stopped' | 'failed' | 'merged' | 'discarded';
export type SessionAction = 'open' | 'stop' | 'merge' | 'discard' | 'remove';

export interface AgentSession {
  id: string;
  label: string;
  prompt: string;
  useWorktree: boolean;
  auto: boolean;
  status: SessionStatus;
  startedAt: number;
  endedAt?: number;
  worktree?: { path: string; branch: string };
  changedFiles?: string[];
  error?: string;
}

export interface SessionRow {
  id: string;
  label: string;
  status: SessionStatus;
  detail: string;
  elapsed: string;
  actions: SessionAction[];
}

/** Most versions of one prompt run at once (Kilo allows four). */
export const MAX_PARALLEL = 4;
const MAX_LABEL = 64;

export function newSessions(
  input: { prompt: string; count: number; useWorktree: boolean; auto: boolean },
  now: number,
  makeId: () => string
): AgentSession[] {
  const count = Math.max(1, Math.min(MAX_PARALLEL, Math.floor(input.count) || 1));
  const oneLine = input.prompt.trim().replace(/\s+/g, ' ');
  const suffixRoom = count > 1 ? 4 : 0;
  const base = oneLine.length > MAX_LABEL - suffixRoom ? `${oneLine.slice(0, MAX_LABEL - suffixRoom - 1)}…` : oneLine;
  return Array.from({ length: count }, (_, i) => ({
    id: makeId(),
    label: count > 1 ? `${base} (${i + 1})` : base,
    prompt: input.prompt.trim(),
    useWorktree: input.useWorktree,
    auto: input.auto,
    status: 'starting' as const,
    startedAt: now,
  }));
}

/** The session after its run ended, from the run's end reason. */
export function finishSession(s: AgentSession, outcome: { reason: string; changedFiles?: string[]; error?: string }, now: number): AgentSession {
  const status: SessionStatus = outcome.reason === 'completed' ? 'done' : outcome.reason === 'error' ? 'failed' : 'stopped';
  return {
    ...s,
    status,
    endedAt: now,
    ...(outcome.changedFiles ? { changedFiles: outcome.changedFiles } : {}),
    ...(outcome.error ? { error: outcome.error } : {}),
  };
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function actionsFor(s: AgentSession): SessionAction[] {
  if (s.status === 'merged' || s.status === 'discarded') return ['remove'];
  if (s.status === 'starting' || s.status === 'running') return ['open', 'stop'];
  if (s.worktree) return (s.changedFiles?.length ?? 0) > 0 ? ['open', 'merge', 'discard'] : ['open', 'discard'];
  return ['open', 'remove'];
}

function detailFor(s: AgentSession): string {
  if (s.error) return s.error;
  const parts: string[] = [];
  if (s.changedFiles) parts.push(`${s.changedFiles.length} file${s.changedFiles.length === 1 ? '' : 's'} changed`);
  if (s.worktree) parts.push(s.worktree.branch);
  else parts.push('in the workspace');
  return parts.join(' · ');
}

export function managerRows(sessions: readonly AgentSession[], now: number): SessionRow[] {
  return sessions.map((s) => ({
    id: s.id,
    label: s.label,
    status: s.status,
    detail: detailFor(s),
    elapsed: elapsed((s.endedAt ?? now) - s.startedAt),
    actions: actionsFor(s),
  }));
}

const STATUSES: readonly SessionStatus[] = ['starting', 'running', 'done', 'stopped', 'failed', 'merged', 'discarded'];

/** Sessions saved in workspace state; a run cannot survive a reload, so a running one comes back stopped. */
export function restoreSessions(saved: unknown): AgentSession[] {
  if (!Array.isArray(saved)) return [];
  const out: AgentSession[] = [];
  for (const raw of saved) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Partial<AgentSession>;
    if (typeof s.id !== 'string' || typeof s.label !== 'string' || typeof s.prompt !== 'string' || typeof s.startedAt !== 'number') continue;
    if (!s.status || !STATUSES.includes(s.status)) continue;
    const session = { ...s, useWorktree: s.useWorktree === true, auto: s.auto === true } as AgentSession;
    out.push(
      session.status === 'running' || session.status === 'starting'
        ? { ...session, status: 'stopped', error: 'The window was reloaded while this session ran.' }
        : session
    );
  }
  return out;
}
