/**
 * One chat conversation in the sidebar: its id, the agent history that is
 * fed back as `history` on the next turn (compacted), the full transcript that
 * is shown (never compacted, RB-58), and running usage totals.
 * Persisted after every turn via core's `saveSession` into the same
 * `~/.forge/sessions/` directory the CLI uses. vscode-free and
 * dependency-injected so it is unit-testable.
 *
 */
import path from 'node:path';

import type { AgentRunResult, MessageFeedback, ModelConfig, Session, saveSession as coreSaveSession } from '@ikarmic/forge-core';

export type ChatHistory = AgentRunResult['messages'];
export type TurnResult = Pick<AgentRunResult, 'messages' | 'inputTokens' | 'outputTokens' | 'costUsd' | 'costKnown'> &
  Partial<Pick<AgentRunResult, 'turnMessages'>>;
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
  /** Everything shown in the chat; undefined until a turn adds to it (then `_history` stands in). */
  private _transcript: ChatHistory | undefined;
  private totals: Totals = { ...EMPTY_TOTALS };
  /** Ratings by turn number (F3), kept in the session file. */
  private _feedback: Record<string, MessageFeedback> = {};
  /** What was last written, so a rating can be saved without a new turn. */
  private lastSaved: Session | undefined;

  constructor(private readonly deps: ChatSessionDeps, from?: Session) {
    if (from) {
      this._id = from.id;
      this.createdAt = from.createdAt;
      this.label = from.label;
      this._cwd = from.cwd;
      this._history = from.messages.length > 0 ? from.messages : undefined;
      this._transcript = from.transcript;
      this._feedback = { ...(from.feedback ?? {}) };
      this.lastSaved = from;
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

  /** The whole conversation for display: never compacted (RB-58). Older session files fall back to the history. */
  get transcript(): ChatHistory {
    return this._transcript ?? this._history ?? [];
  }

  /** The ratings given so far, by turn number. */
  get feedback(): Readonly<Record<string, MessageFeedback>> {
    return this._feedback;
  }

  /**
   * Rate the reply of turn `turn` (1 = the first message), or take the rating back with null. A note is kept only on a down.
   * Saved at once: there may be no further turn to carry it.
   */
  async setFeedback(turn: number, rating: 'up' | 'down' | null, note?: string): Promise<SaveOutcome> {
    const key = String(turn);
    if (rating === null) delete this._feedback[key];
    else {
      const trimmed = rating === 'down' ? note?.trim().slice(0, 1000) : undefined;
      this._feedback[key] = { rating, ...(trimmed ? { note: trimmed } : {}), at: this.now().toISOString() };
    }
    // Rated in the instant between the reply and its save: the next save carries it.
    if (!this.lastSaved) return { ok: true, filePath: '' };
    return this.write({ ...this.lastSaved, updatedAt: this.now().toISOString() });
  }

  /** The chat was rewound to `turns` turns: ratings of the turns thrown away go with them. */
  pruneFeedback(turns: number): void {
    for (const key of Object.keys(this._feedback)) if (Number(key) > turns) delete this._feedback[key];
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
  rewindTo(history: ChatHistory | undefined, transcript?: ChatHistory): void {
    this._history = history && history.length > 0 ? history : undefined;
    this._transcript = transcript;
  }

  reset(): void {
    this._id = this.deps.generateSessionId();
    this.createdAt = this.now().toISOString();
    this.label = undefined;
    this._cwd = undefined;
    this._history = undefined;
    this._transcript = undefined;
    this.totals = { ...EMPTY_TOTALS };
    this._feedback = {};
    this.lastSaved = undefined;
  }

  /** Name (or, with undefined, un-name) this chat; the next save carries it. */
  setLabel(label: string | undefined): void {
    this.label = label;
  }

  async recordTurn(result: TurnResult, model: ModelConfig, cwd: string): Promise<SaveOutcome> {
    this._cwd ??= cwd;
    // A turn appends what it said to the transcript; a Condense (no turn messages) leaves it as it was.
    if (result.turnMessages) this._transcript = [...this.transcript, ...result.turnMessages];
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
      ...(this._transcript ? { transcript: this._transcript } : {}),
      ...(Object.keys(this._feedback).length > 0 ? { feedback: { ...this._feedback } } : {}),
      totalInputTokens: this.totals.inputTokens,
      totalOutputTokens: this.totals.outputTokens,
      totalCostUsd: this.totals.costUsd,
      costKnown: this.totals.costKnown,
    };
    return this.write(session);
  }

  private async write(session: Session): Promise<SaveOutcome> {
    // The ratings in force now, whatever the snapshot held (a rating can be taken back).
    const { feedback: _old, ...rest } = session;
    const current: Session = { ...rest, ...(Object.keys(this._feedback).length > 0 ? { feedback: { ...this._feedback } } : {}) };
    try {
      const filePath = await this.deps.saveSession(current, this.deps.sessionDir);
      this.lastSaved = current;
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}
