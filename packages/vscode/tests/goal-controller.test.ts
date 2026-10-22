import type { GoalState, ToolContext, ToolDefinition } from '@ikarmic/forge-core';
import { describe, expect, it } from 'vitest';

import { GoalController, type GoalTurnResult } from '../src/chat/goal-controller.js';

type TurnFn = (prompt: string, opts: { tools: ToolDefinition[]; disableAskUser: true }) => Promise<GoalTurnResult>;

function setup(runTurn: TurnFn, maxTurns = 25) {
  const states: Array<GoalState | undefined> = [];
  const messages: string[] = [];
  let aborted = 0;
  const controller = new GoalController({
    runTurn,
    onState: (g) => states.push(g),
    onMessage: (m) => messages.push(m),
    abortTurn: () => { aborted++; },
    maxTurns,
  });
  return { controller, states, messages, aborted: () => aborted };
}

const report = (tools: ToolDefinition[], kind: 'complete' | 'blocked', reason: string) =>
  tools.find((t) => t.name === 'goal_report')!.execute({ kind, reason }, { cwd: '.', auto: false } as ToolContext);

describe('GoalController', () => {
  it('runs turns until the model reports complete', async () => {
    let calls = 0;
    const t = setup(async (_p, { tools }) => {
      calls++;
      if (calls === 2) await report(tools, 'complete', 'README written');
      return { toolCalls: 1 };
    });
    await t.controller.command('write the README');
    expect(calls).toBe(2);
    expect(t.controller.state).toMatchObject({ status: 'complete', report: 'README written', turns: 2 });
  });

  it('asks each turn to continue the objective, with ask_user disabled and goal_report offered', async () => {
    const seen: Array<{ prompt: string; names: string[]; disable: boolean }> = [];
    const t = setup(async (prompt, { tools, disableAskUser }) => {
      seen.push({ prompt, names: tools.map((x) => x.name), disable: disableAskUser });
      await report(tools, 'complete', 'ok');
      return { toolCalls: 1 };
    });
    await t.controller.command('ship it');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.prompt).toContain('ship it');
    expect(seen[0]!.names).toEqual(['goal_report']);
    expect(seen[0]!.disable).toBe(true);
  });

  it('pauses after a turn with no tool call', async () => {
    let calls = 0;
    const t = setup(async () => { calls++; return { toolCalls: 0 }; });
    await t.controller.command('x');
    expect(calls).toBe(1);
    expect(t.controller.state?.status).toBe('paused');
  });

  it('never runs more turns than the budget', async () => {
    let calls = 0;
    const t = setup(async () => { calls++; return { toolCalls: 1 }; }, 3);
    await t.controller.command('x');
    expect(calls).toBe(3);
    expect(t.controller.state?.status).toBe('paused');
  });

  it('stop() aborts the running turn and pauses the goal', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const t = setup(async () => { await gate; return { toolCalls: 1 }; });
    const running = t.controller.command('x');
    await Promise.resolve();
    t.controller.stop();
    release();
    await running;
    expect(t.aborted()).toBe(1);
    expect(t.controller.state?.status).toBe('paused');
  });

  it('pause, then resume, continues the same objective', async () => {
    let calls = 0;
    const t = setup(async (_p, { tools }) => {
      calls++;
      if (calls >= 2) await report(tools, 'complete', 'done');
      return { toolCalls: 1 };
    }, 1);
    await t.controller.command('x'); // maxTurns 1 -> paused after one turn
    expect(t.controller.state).toMatchObject({ status: 'paused', turns: 1 });
    await t.controller.command('resume');
    expect(t.controller.state?.status).toBe('complete');
    expect(calls).toBe(2);
  });

  it('clear removes the goal and tells the surface', async () => {
    const t = setup(async () => ({ toolCalls: 0 }));
    await t.controller.command('x');
    await t.controller.command('clear');
    expect(t.controller.state).toBeUndefined();
    expect(t.states.at(-1)).toBeUndefined();
  });

  it('refuses an objective over 10,000 characters and keeps the current state', async () => {
    const t = setup(async () => ({ toolCalls: 0 }));
    await t.controller.command('x'.repeat(10_001));
    expect(t.controller.state).toBeUndefined();
    expect(t.messages.join(' ')).toMatch(/10,000/);
  });

  it('with no argument it reports the current goal, or that there is none', async () => {
    const t = setup(async () => ({ toolCalls: 0 }));
    await t.controller.command('');
    expect(t.messages.at(-1)).toMatch(/no goal/i);
    await t.controller.command('finish the docs');
    await t.controller.command('');
    expect(t.messages.at(-1)).toContain('finish the docs');
  });

  it('resume with no goal says so instead of throwing', async () => {
    const t = setup(async () => ({ toolCalls: 0 }));
    await t.controller.command('resume');
    expect(t.messages.at(-1)).toMatch(/no goal/i);
  });

  it('restore turns an active saved goal into a paused one and leaves a complete one alone', () => {
    const t = setup(async () => ({ toolCalls: 0 }));
    t.controller.restore({ objective: 'x', status: 'active', turns: 2 });
    expect(t.controller.state).toMatchObject({ status: 'paused', turns: 2 });
    t.controller.restore({ objective: 'x', status: 'complete', turns: 2, report: 'ok' });
    expect(t.controller.state?.status).toBe('complete');
    t.controller.restore(undefined);
    expect(t.controller.state).toBeUndefined();
  });

  it('a rejected request blocks the goal', async () => {
    const t = setup(async () => ({ toolCalls: 1, rejected: true }));
    await t.controller.command('x');
    expect(t.controller.state?.status).toBe('blocked');
  });
});
