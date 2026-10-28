/**
 * Agent Manager sessions: several chats run in parallel, each optionally in its own git worktree, then merged or
 * discarded (after Kilo's Agent Manager). Pure: the panel owns the vscode side, the flow owns git.
 */

export type SessionStatus = 'starting' | 'running' | 'done' | 'stopped' | 'failed' | 'merged' | 'discarded';
import type { PullRequestSummary } from '@ikarmic/forge-core';

import { prLine } from './manager-pr.js';

export type SessionAction = 'open' | 'terminal' | 'pr' | 'open-pr' | 'stop' | 'merge' | 'discard' | 'remove';

export interface AgentSession {
  id: string;
  /** The versions started from one prompt share a task; a session saved before tasks existed is its own. */
  taskId?: string;
  /** 1-based number of this version, and how many were started together. */
  version?: number;
  versions?: number;
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
  /** Read from git every 30 seconds while the panel is visible (F9). */
  stats?: { ahead: number; behind: number; changed: number; added?: number; removed?: number };
  /** The pull request opened from this session, refreshed every minute while the panel is visible (F8). */
  pr?: PullRequestSummary;
}

export interface SessionRow {
  id: string;
  label: string;
  status: SessionStatus;
  /** The facts as one sentence. The page builds from the fields below; this stays for anything that wants a line of text. */
  detail: string;
  elapsed: string;
  actions: SessionAction[];
  taskId: string;
  version: number;
  versions: number;
  /** Files changed (the final list once finished, git's live count while it works). */
  files: number;
  /** Lines added and removed against your branch. Absent until git has counted them. */
  added?: number;
  removed?: number;
  branch?: string;
  ahead: number;
  behind: number;
  /** The pull request line in words, when one was opened. */
  pr?: string;
  error?: string;
  /** Finished with changes in a worktree, so it can be chosen for merging or a pull request. */
  canPick: boolean;
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
  const taskId = makeId();
  const oneLine = input.prompt.trim().replace(/\s+/g, ' ');
  const suffixRoom = count > 1 ? 4 : 0;
  const base = oneLine.length > MAX_LABEL - suffixRoom ? `${oneLine.slice(0, MAX_LABEL - suffixRoom - 1)}…` : oneLine;
  return Array.from({ length: count }, (_, i) => ({
    id: makeId(),
    taskId,
    version: i + 1,
    versions: count,
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
  if (s.status === 'starting' || s.status === 'running') return s.worktree ? ['open', 'terminal', 'stop'] : ['open', 'stop'];
  if (s.worktree) {
    const changed = (s.changedFiles?.length ?? 0) > 0;
    const prAction: SessionAction[] = s.pr ? ['open-pr'] : changed ? ['pr'] : [];
    return changed ? ['open', 'terminal', ...prAction, 'merge', 'discard'] : ['open', 'terminal', ...prAction, 'discard'];
  }
  return ['open', 'remove'];
}

function detailFor(s: AgentSession): string {
  if (s.error) return s.error;
  const parts: string[] = [];
  const files = (n: number) => `${n} file${n === 1 ? '' : 's'}`;
  if (s.changedFiles) parts.push(`${files(s.changedFiles.length)} changed`);
  else if (s.stats && s.stats.changed > 0) parts.push(`${files(s.stats.changed)} changed so far`);
  if (s.worktree) parts.push(s.worktree.branch);
  else parts.push('in the workspace');
  if (s.pr) parts.push(prLine(s.pr));
  if (s.worktree && s.stats) {
    if (s.stats.ahead > 0) parts.push(`${s.stats.ahead} commit${s.stats.ahead === 1 ? '' : 's'} ahead`);
    if (s.stats.behind > 0) parts.push(`${s.stats.behind} behind`);
  }
  return parts.join(' · ');
}

/** The name of a session's terminal tab: after the session, one short line. */
export function terminalName(s: Pick<AgentSession, 'label'>): string {
  const line = (s.label.split('\n')[0] ?? '').replace(/\s+/g, ' ').trim();
  const name = `Forge: ${line}`;
  return name.length > 48 ? `${name.slice(0, 47)}…` : name;
}

/** Sessions whose worktree still exists, so git has numbers to give. */
export function pollableSessions(sessions: readonly AgentSession[]): AgentSession[] {
  return sessions.filter((s) => s.worktree && s.status !== 'merged' && s.status !== 'discarded');
}

function rowFor(s: AgentSession, now: number): SessionRow {
  const actions = actionsFor(s);
  return {
    id: s.id,
    label: s.label,
    status: s.status,
    detail: detailFor(s),
    elapsed: elapsed((s.endedAt ?? now) - s.startedAt),
    actions,
    taskId: s.taskId ?? s.id,
    version: s.version ?? 1,
    versions: s.versions ?? 1,
    files: s.changedFiles ? s.changedFiles.length : (s.stats?.changed ?? 0),
    ...(s.stats?.added !== undefined ? { added: s.stats.added } : {}),
    ...(s.stats?.removed !== undefined ? { removed: s.stats.removed } : {}),
    ...(s.worktree ? { branch: s.worktree.branch } : {}),
    ahead: s.stats?.ahead ?? 0,
    behind: s.stats?.behind ?? 0,
    ...(s.pr ? { pr: prLine(s.pr) } : {}),
    ...(s.error ? { error: s.error } : {}),
    canPick: s.status === 'done' && actions.includes('merge'),
  };
}

export function managerRows(sessions: readonly AgentSession[], now: number): SessionRow[] {
  return sessions.map((s) => rowFor(s, now));
}

/** One prompt and its versions. */
export interface TaskView {
  id: string;
  title: string;
  auto: boolean;
  /** "Started 6 minutes ago". */
  started: string;
  /** decide: a finished version can be merged; working: something still runs; quiet: nothing to merge. */
  state: 'decide' | 'working' | 'quiet';
  versions: SessionRow[];
}

export interface ManagerView {
  summary: { running: number; done: number; failed: number };
  tasks: TaskView[];
  /** Sessions of tasks whose every version is merged or discarded. */
  finished: SessionRow[];
}

const MAX_TITLE = 120;
const STATE_ORDER: Record<TaskView['state'], number> = { decide: 0, working: 1, quiet: 2 };

function titleOf(prompt: string): string {
  const oneLine = prompt.trim().replace(/\s+/g, ' ');
  if (!oneLine) return 'Untitled task';
  return oneLine.length > MAX_TITLE ? `${oneLine.slice(0, MAX_TITLE - 1)}…` : oneLine;
}

function startedAgo(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (ms < 45_000) return 'Started just now';
  const unit = (n: number, word: string): string => `Started ${n} ${word}${n === 1 ? '' : 's'} ago`;
  if (minutes < 60) return unit(Math.max(1, minutes), 'minute');
  if (minutes < 60 * 24) return unit(Math.floor(minutes / 60), 'hour');
  return unit(Math.floor(minutes / (60 * 24)), 'day');
}

const isSettled = (s: AgentSession): boolean => s.status === 'merged' || s.status === 'discarded';

/** What the page shows: tasks (needs you first), a count of versions, and the finished list. */
export function managerView(sessions: readonly AgentSession[], now: number): ManagerView {
  const byTask = new Map<string, AgentSession[]>();
  for (const s of sessions) {
    const key = s.taskId ?? s.id;
    byTask.set(key, [...(byTask.get(key) ?? []), s]);
  }
  const tasks: TaskView[] = [];
  const finished: SessionRow[] = [];
  const summary = { running: 0, done: 0, failed: 0 };
  for (const [id, members] of byTask) {
    if (members.every(isSettled)) {
      finished.push(...members.map((s) => rowFor(s, now)));
      continue;
    }
    for (const s of members) {
      if (s.status === 'starting' || s.status === 'running') summary.running++;
      else if (s.status === 'done') summary.done++;
      else if (s.status === 'failed') summary.failed++;
    }
    const versions = members.map((s) => rowFor(s, now)).sort((a, b) => a.version - b.version);
    const working = members.some((s) => s.status === 'starting' || s.status === 'running');
    const state: TaskView['state'] = working ? 'working' : versions.some((v) => v.canPick) ? 'decide' : 'quiet';
    tasks.push({
      id,
      title: titleOf(members[0]!.prompt),
      auto: members.some((s) => s.auto),
      started: startedAgo(now - Math.min(...members.map((s) => s.startedAt))),
      state,
      versions,
    });
  }
  // Array.sort is stable: tasks keep the order they were started within a state.
  tasks.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
  return { summary, tasks, finished };
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
