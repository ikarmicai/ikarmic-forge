/**
 * Runs a session goal: one objective, many turns. Pure (no `vscode` import), so it is unit-tested with a fake
 * `runTurn`. The chat view supplies `runTurn` (one agent run with the extra `goal_report` tool, `ask_user` off)
 * and `abortTurn` (cancel the run in flight), and shows `onState` / `onMessage` to the person.
 */
import {
  applyTurnOutcome,
  createGoalReportTool,
  goalPrompt,
  pauseGoal,
  resumeGoal,
  startGoal,
  type GoalReport,
  type GoalState,
  type ToolDefinition,
} from '@ikarmic/forge-core';

export interface GoalTurnResult {
  /** Tool calls the turn made. */
  toolCalls: number;
  error?: boolean;
  stopped?: boolean;
  /** A permission request or tool call was rejected by the person. */
  rejected?: boolean;
}

export interface GoalControllerDeps {
  runTurn(prompt: string, opts: { tools: ToolDefinition[]; disableAskUser: true }): Promise<GoalTurnResult>;
  onState(goal: GoalState | undefined): void;
  onMessage(text: string): void;
  abortTurn(): void;
  maxTurns: number;
}

export class GoalController {
  private goal: GoalState | undefined;
  private loop: Promise<void> | undefined;
  private stopRequested = false;

  constructor(private readonly deps: GoalControllerDeps) {}

  get state(): GoalState | undefined {
    return this.goal;
  }

  /** Load a saved goal after a reload: nothing is running, so an active goal comes back paused. */
  restore(saved: GoalState | undefined): void {
    this.goal = saved ? (saved.status === 'active' ? { ...saved, status: 'paused' } : saved) : undefined;
    this.deps.onState(this.goal);
  }

  /** Cancel the turn in flight; the goal pauses when that turn ends. */
  stop(): void {
    if (!this.loop) return;
    this.stopRequested = true;
    this.deps.abortTurn();
  }

  /** `/goal <objective>`, `/goal pause`, `/goal resume`, `/goal clear` and `/goal` alone. */
  async command(args: string): Promise<void> {
    const text = args.trim();
    const word = text.toLowerCase();
    if (!text) {
      this.deps.onMessage(this.goal ? describe(this.goal) : 'No goal set. Type /goal followed by what you want done.');
      return;
    }
    if (word === 'pause') {
      if (!this.goal) return this.deps.onMessage('No goal to pause.');
      if (this.loop) {
        this.stop();
        await this.loop;
      } else {
        this.goal = pauseGoal(this.goal);
        this.deps.onState(this.goal);
      }
      return;
    }
    if (word === 'resume') {
      if (!this.goal) return this.deps.onMessage('No goal to resume.');
      if (this.loop) return;
      this.goal = resumeGoal(this.goal);
      this.deps.onState(this.goal);
      return this.run();
    }
    if (word === 'clear') {
      this.stop();
      await this.loop;
      this.goal = undefined;
      this.deps.onState(undefined);
      return;
    }
    let next: GoalState;
    try {
      next = startGoal(text);
    } catch (err) {
      return this.deps.onMessage((err as Error).message);
    }
    this.stop();
    await this.loop;
    this.goal = next;
    this.deps.onState(next);
    return this.run();
  }

  private run(): Promise<void> {
    this.stopRequested = false;
    const loop = this.runLoop().finally(() => {
      this.loop = undefined;
    });
    this.loop = loop;
    return loop;
  }

  private async runLoop(): Promise<void> {
    while (this.goal?.status === 'active') {
      let reported: GoalReport | undefined;
      const tool = createGoalReportTool((r) => {
        reported = r;
      });
      let result: GoalTurnResult;
      try {
        result = await this.deps.runTurn(goalPrompt(this.goal), { tools: [tool as unknown as ToolDefinition], disableAskUser: true });
      } catch (err) {
        this.deps.onMessage(`The goal turn failed: ${(err as Error).message}`);
        result = { toolCalls: 0, error: true };
      }
      const before = this.goal.status;
      this.goal = applyTurnOutcome(
        this.goal,
        {
          toolCalls: result.toolCalls,
          ...(result.error ? { error: true } : {}),
          ...(result.stopped || this.stopRequested ? { stopped: true } : {}),
          ...(result.rejected ? { rejected: true } : {}),
          ...(reported ? { report: reported } : {}),
        },
        this.deps.maxTurns
      );
      this.deps.onState(this.goal);
      if (this.goal.status !== before) this.deps.onMessage(describe(this.goal));
    }
  }
}

function describe(g: GoalState): string {
  const base = `Goal ${g.status} after ${g.turns} turn${g.turns === 1 ? '' : 's'}: ${g.objective}`;
  if (g.status === 'complete') return `${base}. Reported by the model, not verified: ${g.report ?? 'no details'}`;
  if (g.status === 'blocked') return `${base}. ${g.report ?? 'A request was rejected.'}`;
  return base;
}
