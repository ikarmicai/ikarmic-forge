/**
 * The line Output > Forge gets when a chat run ends. It says how the run ended, which mode ran, how long the answer was
 * and, for a plan, whether it stated a size and whether the spec offer went up, so a missing card or an empty answer
 * can be told apart from a model that stopped (the live Plan spec of 2026-11-02 could not say which gate held it back).
 * Words, not identifiers: the reason and the mode go through core's labels.
 */
import { humanize, runReasonLabel } from '@ikarmic/forge-core';

import { planSize } from './plan-size.js';

export function runEndLine(outcome: { reason: string; finalText: string }, mode: string, specOffered: boolean): string {
  const plan = mode === 'plan' ? `, plan size ${planSize(outcome.finalText) ?? 'not stated'}` : '';
  return `Chat run ended: ${runReasonLabel(outcome.reason)}. Mode: ${humanize(mode)}. Answer: ${outcome.finalText.length} characters${plan}. Spec offered: ${specOffered ? 'yes' : 'no'}.`;
}
