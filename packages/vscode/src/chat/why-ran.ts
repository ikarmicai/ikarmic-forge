/**
 * Why a tool call ran without an approval card, as the chat shows it: a summary on the step-group header and a
 * sentence inside each row. Page-safe (no imports): exported to the chat page through webview-lib (RB-3).
 * The page translates by exact text, so the header is returned as separate parts, numbers and words apart.
 */

export type WhyRan = 'list' | 'edits' | 'always' | 'rule' | 'memory' | 'autonomous';

const ORDER: readonly WhyRan[] = ['list', 'edits', 'always', 'rule', 'memory', 'autonomous'];

export const WHY_LABEL: Record<WhyRan, string> = {
  list: 'auto-approve list',
  edits: 'Accept edits',
  always: 'always allowed',
  rule: 'permission rule',
  memory: 'memory writes allowed',
  autonomous: 'Autonomous',
};

export const WHY_ROW: Record<WhyRan, string> = {
  list: 'Ran without asking: it is on your auto-approve list.',
  edits: 'Ran without asking: the approval level is Accept edits.',
  always: 'Ran without asking: you chose Always allow for this command.',
  rule: 'Ran without asking: a permission rule allows it.',
  memory: 'Ran without asking: you allowed memory writes without asking.',
  autonomous: 'Ran without asking: the approval level is Autonomous.',
};

/**
 * Text parts of a step group's header, or undefined for no header. Without unasked calls the header keeps today's
 * rule (only from three steps); with any, it is shown for every group size and lists the counts by reason.
 */
export function stepsHeadParts(total: number, counts: Partial<Record<WhyRan, number>>): string[] | undefined {
  const reasons = ORDER.filter((r) => (counts[r] ?? 0) > 0);
  if (reasons.length === 0 && total < 3) return undefined;
  const parts = [String(total), total === 1 ? 'step' : 'steps'];
  if (reasons.length === 0) return parts;
  parts.push('ran without asking:');
  for (const r of reasons) parts.push(String(counts[r]), WHY_LABEL[r]);
  return parts;
}
