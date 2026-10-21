/**
 * State + view-model for the Parallel Agents board. Pure (type-only imports),
 * so the reducer and tree building are unit-tested without the extension host.
 */
import type { OrchestratorPlan, OrchestratorProgressEvent, OrchestratorStepResult } from '@ikarmic/forge-core';

export type StepState = 'pending' | 'running' | 'done' | 'failed';
export type MergeState = 'none' | 'merged' | 'discarded';

export interface BoardStep {
  index: number;
  specialist: string;
  task: string;
  group?: string;
  state: StepState;
  durationMs?: number;
  summary?: string;
  error?: string;
  /** Set when the specialist committed work onto a kept branch. */
  branch?: string;
  changedFiles?: string[];
  merge: MergeState;
}

export interface BoardRun {
  id: string;
  task: string;
  startedAt: number;
  status: 'planning' | 'running' | 'finished' | 'failed';
  rationale?: string;
  steps: BoardStep[];
  totalCostUsd?: number;
  error?: string;
}

export function newRun(id: string, task: string, now = Date.now()): BoardRun {
  return { id, task, startedAt: now, status: 'planning', steps: [] };
}

function fromPlan(plan: OrchestratorPlan): BoardStep[] {
  return plan.steps.map((s, index) => ({
    index,
    specialist: String(s.specialist),
    task: s.task,
    ...(s.parallelGroup ? { group: s.parallelGroup } : {}),
    state: 'pending' as const,
    merge: 'none' as const,
  }));
}

function finishStep(step: BoardStep, r: OrchestratorStepResult): BoardStep {
  const failed = Boolean(r.error) || r.reason === 'error' || r.reason === 'unknown_specialist';
  return {
    ...step,
    state: failed ? 'failed' : 'done',
    durationMs: r.durationMs,
    ...(r.finalText ? { summary: r.finalText.slice(0, 400) } : {}),
    ...(r.error ? { error: r.error } : {}),
    ...(r.worktreeCommit && r.worktreeBranch ? { branch: r.worktreeBranch, changedFiles: r.changedFiles ?? [] } : {}),
  };
}

/** Fold one orchestrator progress event into the run. Returns a new object. */
export function applyProgress(run: BoardRun, event: OrchestratorProgressEvent): BoardRun {
  switch (event.type) {
    case 'plan':
      return {
        ...run,
        status: 'running',
        ...(event.plan.rationale ? { rationale: event.plan.rationale } : {}),
        steps: fromPlan(event.plan),
      };
    case 'step_started':
      return { ...run, steps: run.steps.map((s) => (s.index === event.index ? { ...s, state: 'running' } : s)) };
    case 'step_finished':
      return { ...run, steps: run.steps.map((s) => (s.index === event.index ? finishStep(s, event.result) : s)) };
  }
}

export function finishRun(run: BoardRun, totalCostUsd: number | undefined, error?: string): BoardRun {
  return {
    ...run,
    status: error ? 'failed' : 'finished',
    ...(totalCostUsd !== undefined ? { totalCostUsd } : {}),
    ...(error ? { error } : {}),
  };
}

export function setMergeState(run: BoardRun, branch: string, merge: MergeState): BoardRun {
  return { ...run, steps: run.steps.map((s) => (s.branch === branch ? { ...s, merge } : s)) };
}

/** Steps whose work is committed on a branch and neither merged nor discarded yet. */
export function mergeableSteps(run: BoardRun): BoardStep[] {
  return run.steps.filter((s) => s.branch && s.merge === 'none' && s.state === 'done');
}

const secs = (ms?: number): string => (ms === undefined ? '' : `${(ms / 1000).toFixed(1)}s`);

export interface RunCardStep {
  index: number;
  state: BoardStep['state'];
  specialist: string;
  task: string;
  meta: string;
  branch?: string;
  actions: Array<'review' | 'merge' | 'discard'>;
  error?: string;
}

export interface RunCardView {
  id: string;
  task: string;
  status: BoardRun['status'];
  summary: string;
  progress: number;
  steps: RunCardStep[];
  error?: string;
  canClear: boolean;
}

/** What the chat's run card shows. Pure: the webview only renders it. */
export function runCardView(run: BoardRun): RunCardView {
  const finished = run.steps.filter((s) => s.state === 'done' || s.state === 'failed').length;
  const total = run.steps.length;
  const cost = run.totalCostUsd !== undefined ? ` · $${run.totalCostUsd.toFixed(run.totalCostUsd < 0.1 ? 4 : 2)}` : '';
  const summary = run.status === 'planning' ? 'Planning…' : `${finished} of ${total} done${cost}`;
  const mergeable = new Set(mergeableSteps(run).map((s) => s.index));
  return {
    id: run.id,
    task: run.task,
    status: run.status,
    summary,
    progress: total ? finished / total : 0,
    steps: run.steps.map((s) => {
      const parts: string[] = [];
      if (s.state === 'running') parts.push('running');
      else if (s.state === 'pending') parts.push('waiting');
      else if (s.state === 'failed') parts.push('failed');
      else if (s.durationMs !== undefined) parts.push(secs(s.durationMs));
      if (s.state === 'done' && s.changedFiles) parts.push(`${s.changedFiles.length} file${s.changedFiles.length === 1 ? '' : 's'}`);
      if (s.merge === 'merged') parts.push('merged');
      if (s.merge === 'discarded') parts.push('discarded');
      return {
        index: s.index,
        state: s.state,
        specialist: s.specialist,
        task: s.task,
        meta: parts.join(' · '),
        ...(s.branch ? { branch: s.branch } : {}),
        actions: mergeable.has(s.index) ? (['review', 'merge', 'discard'] as const).slice() : [],
        ...(s.error ? { error: s.error } : {}),
      };
    }),
    ...(run.error ? { error: run.error } : {}),
    canClear: run.status === 'finished' || run.status === 'failed',
  };
}

/** Runs whose card should come back after New chat, resume or a reload: still going, or branches left to merge. */
export function runsToRestore(runs: readonly BoardRun[]): BoardRun[] {
  return runs.filter((r) => r.status === 'running' || r.status === 'planning' || mergeableSteps(r).length > 0);
}
