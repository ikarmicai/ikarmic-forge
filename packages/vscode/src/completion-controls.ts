/** Rules for when inline completion may call the model. vscode-free so it is unit-testable. */

export type Gate = 'run' | 'off' | 'snoozed' | 'manual-only';

export interface GateInput {
  enabled: boolean;
  /** False: completions come only from the trigger key. */
  automatic: boolean;
  /** Epoch ms the snooze ends; 0 or past means not snoozed. */
  snoozedUntil: number;
  now: number;
  /** True when the user pressed the trigger key (an explicit request). */
  manual: boolean;
}

export function completionGate(input: GateInput): Gate {
  if (!input.enabled) return 'off';
  if (input.manual) return 'run';
  if (input.snoozedUntil > input.now) return 'snoozed';
  if (!input.automatic) return 'manual-only';
  return 'run';
}

export function snoozeEnd(now: number, minutes: number): number {
  return now + minutes * 60_000;
}

/** Tokens the completion model has used this session, for the status bar tooltip. */
export class CompletionUsage {
  private requests = 0;
  private input = 0;
  private output = 0;

  add(usage: { inputTokens?: number | undefined; outputTokens?: number | undefined }): void {
    this.requests += 1;
    this.input += usage.inputTokens ?? 0;
    this.output += usage.outputTokens ?? 0;
  }

  snapshot(): { requests: number; input: number; output: number } {
    return { requests: this.requests, input: this.input, output: this.output };
  }

  reset(): void {
    this.requests = 0;
    this.input = 0;
    this.output = 0;
  }
}

function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function statusText(s: { enabled: boolean; snoozedUntil: number; now: number }): string {
  if (!s.enabled) return '$(circle-slash) Autocomplete off';
  if (s.snoozedUntil > s.now) return `$(bell-slash) Autocomplete until ${clock(s.snoozedUntil)}`;
  return '$(sparkle) Autocomplete';
}

/** Snooze state shared by the provider and the status bar item. */
export class CompletionState {
  snoozedUntil = 0;
  readonly usage = new CompletionUsage();
}
