import { describe, expect, it } from 'vitest';

import type { OrchestratorPlan, OrchestratorStepResult } from '@ikarmic/forge-core';

import {
  applyProgress,
  finishRun,
  mergeableSteps,
  newRun,
  runCardView,
  runsToRestore,
  setMergeState,
} from '../src/agents/agents-model.js';

const plan: OrchestratorPlan = {
  rationale: 'split by area',
  steps: [
    { specialist: 'code', task: 'fix auth', parallelGroup: 'a' },
    { specialist: 'code', task: 'fix css', parallelGroup: 'a' },
    { specialist: 'review', task: 'review all' },
  ],
};

const result = (i: number, over: Partial<OrchestratorStepResult> = {}): OrchestratorStepResult => ({
  step: plan.steps[i]!,
  finalText: 'ok',
  reason: 'completed',
  durationMs: 1500,
  inputTokens: 1,
  outputTokens: 1,
  costUsd: 0,
  ...over,
});

describe('board reducer', () => {
  it('plan creates pending steps in order; started marks running', () => {
    let run = newRun('r1', 'do things', 1000);
    expect(run.status).toBe('planning');
    run = applyProgress(run, { type: 'plan', plan });
    expect(run.status).toBe('running');
    expect(run.rationale).toBe('split by area');
    expect(run.steps.map((s) => [s.index, s.state, s.group])).toEqual([[0, 'pending', 'a'], [1, 'pending', 'a'], [2, 'pending', undefined]]);
    run = applyProgress(run, { type: 'step_started', index: 1, step: plan.steps[1]! });
    expect(run.steps[1]!.state).toBe('running');
    expect(run.steps[0]!.state).toBe('pending');
  });

  it('finished records outcome, and a committed branch makes the step mergeable', () => {
    let run = applyProgress(newRun('r', 't'), { type: 'plan', plan });
    run = applyProgress(run, { type: 'step_finished', index: 0, step: plan.steps[0]!, result: result(0, { worktreeBranch: 'forge/x', worktreeCommit: 'abc', changedFiles: ['a.ts', 'b.ts'] }) });
    run = applyProgress(run, { type: 'step_finished', index: 1, step: plan.steps[1]!, result: result(1, { error: 'boom', reason: 'error' }) });
    expect(run.steps[0]).toMatchObject({ state: 'done', branch: 'forge/x', changedFiles: ['a.ts', 'b.ts'] });
    expect(run.steps[1]).toMatchObject({ state: 'failed', error: 'boom' });
    expect(mergeableSteps(run).map((s) => s.index)).toEqual([0]);
  });

  it('a worktree step with no commit (nothing changed) is not mergeable', () => {
    let run = applyProgress(newRun('r', 't'), { type: 'plan', plan });
    run = applyProgress(run, { type: 'step_finished', index: 0, step: plan.steps[0]!, result: result(0, { worktreeBranch: 'forge/x' }) });
    expect(mergeableSteps(run)).toEqual([]);
  });

  it('merge / discard remove a step from the mergeable list', () => {
    let run = applyProgress(newRun('r', 't'), { type: 'plan', plan });
    run = applyProgress(run, { type: 'step_finished', index: 0, step: plan.steps[0]!, result: result(0, { worktreeBranch: 'forge/x', worktreeCommit: 'abc', changedFiles: ['a'] }) });
    expect(mergeableSteps(setMergeState(run, 'forge/x', 'merged'))).toEqual([]);
    expect(setMergeState(run, 'forge/x', 'discarded').steps[0]!.merge).toBe('discarded');
  });

  it('reducer is pure', () => {
    const run = newRun('r', 't');
    const next = applyProgress(run, { type: 'plan', plan });
    expect(run.steps).toEqual([]);
    expect(next).not.toBe(run);
  });

  it('finishRun sets status, cost and error', () => {
    expect(finishRun(newRun('r', 't'), 0.5)).toMatchObject({ status: 'finished', totalCostUsd: 0.5 });
    expect(finishRun(newRun('r', 't'), undefined, 'router failed')).toMatchObject({ status: 'failed', error: 'router failed' });
  });
});

describe('runCardView', () => {
  const step = (o: Record<string, unknown>) => ({ index: 0, specialist: 'code', task: 't', state: 'pending', merge: 'none', ...o });

  it('summarises a planning run', () => {
    const v = runCardView({ id: 'r', task: 'Split the refactor', startedAt: 0, status: 'planning', steps: [] } as never);
    expect(v).toMatchObject({ id: 'r', task: 'Split the refactor', summary: 'Planning…', progress: 0, steps: [], canClear: false });
  });

  it('counts finished steps, shows meta and offers review/merge/discard only on mergeable steps', () => {
    const v = runCardView({
      id: 'r', task: 'x', startedAt: 0, status: 'running', totalCostUsd: 0.042,
      steps: [
        step({ index: 0, specialist: 'plan', state: 'done', durationMs: 12000 }),
        step({ index: 1, state: 'done', durationMs: 48000, branch: 'forge/code-1', changedFiles: ['a.ts'] }),
        step({ index: 2, state: 'running' }),
        step({ index: 3, specialist: 'review', state: 'failed', error: 'boom' }),
      ],
    } as never);
    expect(v.summary).toBe('3 of 4 done · $0.0420');
    expect(v.progress).toBeCloseTo(0.75);
    expect(v.steps.map((s) => s.meta)).toEqual(['12.0s', '48.0s · 1 file', 'running', 'failed']);
    expect(v.steps[1]).toMatchObject({ branch: 'forge/code-1', actions: ['review', 'merge', 'discard'] });
    expect(v.steps[0]!.actions).toEqual([]);
    expect(v.steps[3]).toMatchObject({ error: 'boom', actions: [] });
  });

  it('marks merged and discarded steps and allows clearing a finished run', () => {
    const v = runCardView({ id: 'r', task: 'x', startedAt: 0, status: 'finished', steps: [step({ state: 'done', branch: 'b', merge: 'merged', durationMs: 1000 })] } as never);
    expect(v.steps[0]).toMatchObject({ meta: '1.0s · merged', actions: [] });
    expect(v.canClear).toBe(true);
  });
});

describe('runsToRestore', () => {
  it('brings back runs that are still going or still have branches to merge', () => {
    const step = (o: Record<string, unknown>) => ({ index: 0, specialist: 'code', task: 't', state: 'done', merge: 'none', ...o });
    const runs = [
      { id: 'live', task: 'x', startedAt: 1, status: 'running', steps: [] },
      { id: 'merge-me', task: 'x', startedAt: 2, status: 'finished', steps: [step({ branch: 'forge/a' })] },
      { id: 'done', task: 'x', startedAt: 3, status: 'finished', steps: [step({ branch: 'forge/b', merge: 'merged' })] },
    ];
    expect(runsToRestore(runs as never).map((r) => r.id)).toEqual(['live', 'merge-me']);
  });
});
