/**
 * Opt-in completion telemetry. Counts accepted / rejected / shown completions
 * and surfaces them in the status bar tooltip so the user can see whether
 * the feature is paying off.
 *
 * Strictly opt-in via `forge.completionTelemetry`: off by default. We never
 * persist these counts, never network them, never include the actual
 * completion text. The only signal is "shown N times, accepted M, rejected
 * K". Useful for users tuning `forge.completionDebounceMs` / model choice.
 */

export interface CompletionCounts {
  /** Times a completion was offered to the user. */
  shown: number;
  /** Times the user accepted the entire suggestion (Tab or click). */
  accepted: number;
  /** Times a suggestion was dismissed without being accepted. */
  rejected: number;
  /** Times the user accepted part of a multi-line suggestion (per-word accept). */
  partial: number;
}

/**
 * Reset shape so tests + the constructor agree on defaults.
 */
function emptyCounts(): CompletionCounts {
  return { shown: 0, accepted: 0, rejected: 0, partial: 0 };
}

export class CompletionTelemetry {
  private counts: CompletionCounts = emptyCounts();

  recordShown(): void {
    this.counts.shown += 1;
  }

  recordAccepted(): void {
    this.counts.accepted += 1;
  }

  recordPartial(): void {
    this.counts.partial += 1;
  }

  recordRejected(): void {
    this.counts.rejected += 1;
  }

  /** Read-only snapshot for display. */
  snapshot(): CompletionCounts {
    return { ...this.counts };
  }

  reset(): void {
    this.counts = emptyCounts();
  }

  /** Compact "shown 12 · ✓ 7 · ✗ 4 · ◐ 1" label for the status bar. */
  formatForTooltip(): string {
    const c = this.counts;
    if (c.shown === 0) return 'No completions shown yet';
    const acceptRate = c.shown === 0 ? 0 : Math.round((c.accepted / c.shown) * 100);
    return [
      `Completions shown: ${c.shown}`,
      `Accepted (full): ${c.accepted}`,
      `Accepted (partial / per-word): ${c.partial}`,
      `Dismissed: ${c.rejected}`,
      `Accept rate: ${acceptRate}%`,
    ].join('\n');
  }
}

/**
 * Stable command id used by InlineCompletionItem.command so VS Code fires
 * the matching command on accept. Registered in extension.ts.
 */
export const TELEMETRY_ACCEPT_COMMAND = 'forge.completionTelemetry.accept';
export const TELEMETRY_PARTIAL_COMMAND = 'forge.completionTelemetry.partial';
export const TELEMETRY_REJECT_COMMAND = 'forge.completionTelemetry.reject';
