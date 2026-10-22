/**
 * When a finished chat run should raise a notification. vscode-free so it is unit-testable;
 * chat-view.ts reads the window focus and shows the message.
 */
import type { AgentRunReason } from '@ikarmic/forge-core';

export type NotifyKind = 'finished' | 'stopped';

/** What a run's end means to the user; undefined where they are already looking (an abort, a missing key). */
export function notifyKind(reason: AgentRunReason): NotifyKind | undefined {
  switch (reason) {
    case 'completed':
    case 'plan':
    case 'spec':
      return 'finished';
    case 'max_iterations':
    case 'max_duration':
    case 'budget_exceeded':
    case 'loop_detected':
    case 'error':
      return 'stopped';
    default:
      return undefined;
  }
}

export interface NotifyInput {
  enabled: boolean;
  minSeconds: number;
  durationMs: number;
  windowFocused: boolean;
  reason: AgentRunReason;
}

export interface ChannelInput extends NotifyInput {
  sound: boolean;
  osToast: boolean;
}

/** Which channels fire for a run end; `enabled` is the in-editor message, the others are switched on separately. */
export function notifyChannels(input: ChannelInput): { message: boolean; sound: boolean; toast: boolean } | undefined {
  const any = input.enabled || input.sound || input.osToast;
  if (!shouldNotify({ ...input, enabled: any })) return undefined;
  return { message: input.enabled, sound: input.sound, toast: input.osToast };
}

export function shouldNotify(input: NotifyInput): boolean {
  return input.enabled && !input.windowFocused && input.durationMs >= input.minSeconds * 1000 && notifyKind(input.reason) !== undefined;
}
