/**
 * One chat conversation in the sidebar: its id, the agent history that is
 * fed back as `history` on the next turn, and running usage totals.
 * Persisted after every turn via core's `saveSession` into the same
 * `~/.forge/sessions/` directory the CLI uses. vscode-free and
 * dependency-injected so it is unit-testable.
 *
 */
import path from 'node:path';

import type { AgentRunResult, ModelConfig, Session, saveSession as coreSaveSession } from '@ikarmic/forge-core';

export type ChatHistory = AgentRunResult['messages'];
export type TurnResult = Pick<AgentRunResult, 'messages' | 'inputTokens' | 'outputTokens' | 'costUsd' | 'costKnown'>;
export type SaveOutcome = { ok: true; filePath: string } | { ok: false; error: string };

export interface ChatSessionDeps {
  sessionDir: string;
  saveSession: typeof coreSaveSession;
  generateSessionId: () => string;
  now?: () => Date;
}

interface Totals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costKnown: boolean;
}

const EMPTY_TOTALS: Totals = { inputTokens: 0, outputTokens: 0, costUsd: 0, costKnown: true };

export class ChatSession {
  private _id!: string;
  private createdAt!: string;
  private label: string | undefined;
  private _cwd: string | undefined;
  private _history: ChatHistory | undefined;
  private totals: Totals = { ...EMPTY_TOTALS };

  constructor(private readonly deps: ChatSessionDeps, from?: Session) {
    if (from) {
      this._id = from.id;
      this.createdAt = from.createdAt;
      this.label = from.label;
      this._cwd = from.cwd;
      this._history = from.messages.length > 0 ? from.messages : undefined;
      this.totals = {
        inputTokens: from.totalInputTokens ?? 0,
        outputTokens: from.totalOutputTokens ?? 0,
        costUsd: from.totalCostUsd ?? 0,
        costKnown: from.costKnown ?? false,
      };
    } else {
      this.reset();
    }
  }

  static fromSession(deps: ChatSessionDeps, session: Session): ChatSession {
    return new ChatSession(deps, session);
  }

  get id(): string {
    return this._id;
  }

  /** Folder the session started in. Kept when resumed elsewhere; checkpoints are relative to it. */
  get cwd(): string | undefined {
    return this._cwd;
  }

  /** USD spent in this conversation so far (0 when pricing was unknown). */
  get totalCostUsd(): number {
    return this.totals.costUsd;
  }

  get history(): ChatHistory | undefined {
    return this._history;
  }

  get hasHistory(): boolean {
    return this._history !== undefined && this._history.length > 0;
  }

  /** Per-session dir: checkpoints live at `<sessionPath>/checkpoints/`. */
  get sessionPath(): string {
    return path.join(this.deps.sessionDir, this._id);
  }

  /**
   * Put the conversation back to an earlier history (retry / edit the last message). Usage
   * totals keep what was spent; the file on disk is rewritten with the next turn.
   */
  rewindTo(history: ChatHistory | undefined): void {
    this._history = history && history.length > 0 ? history : undefined;
  }

  reset(): void {
    this._id = this.deps.generateSessionId();
    this.createdAt = this.now().toISOString();
    this.label = undefined;
    this._cwd = undefined;
    this._history = undefined;
    this.totals = { ...EMPTY_TOTALS };
  }

  /** Name (or, with undefined, un-name) this chat; the next save carries it. */
  setLabel(label: string | undefined): void {
    this.label = label;
  }

  async recordTurn(result: TurnResult, model: ModelConfig, cwd: string): Promise<SaveOutcome> {
    this._cwd ??= cwd;
    this._history = result.messages.length > 0 ? result.messages : undefined;
    this.totals = {
      inputTokens: this.totals.inputTokens + result.inputTokens,
      outputTokens: this.totals.outputTokens + result.outputTokens,
      costUsd: this.totals.costUsd + result.costUsd,
      costKnown: this.totals.costKnown && result.costKnown,
    };
    const session: Session = {
      id: this._id,
      createdAt: this.createdAt,
      updatedAt: this.now().toISOString(),
      ...(this.label ? { label: this.label } : {}),
      cwd: this._cwd,
      model,
      messages: result.messages,
      totalInputTokens: this.totals.inputTokens,
      totalOutputTokens: this.totals.outputTokens,
      totalCostUsd: this.totals.costUsd,
      costKnown: this.totals.costKnown,
    };
    try {
      const filePath = await this.deps.saveSession(session, this.deps.sessionDir);
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}
