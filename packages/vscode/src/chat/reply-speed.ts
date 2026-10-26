/** Output speed of one model step, for the badge on a reply. Pure so the odd cases are tested. */

/** Under this span a rate is noise (and the division would explode). */
const MIN_SPAN_MS = 50;

/**
 * Tokens per second between the step's first streamed token and its end, as an integer.
 * `undefined` when the provider reported no output tokens, nothing streamed, or the span is too short.
 */
export function replySpeed(input: { outputTokens: number | undefined; firstTokenAt: number | undefined; endAt: number }): number | undefined {
  const { outputTokens, firstTokenAt, endAt } = input;
  if (outputTokens === undefined || !Number.isFinite(outputTokens) || outputTokens <= 0) return undefined;
  if (firstTokenAt === undefined || !Number.isFinite(firstTokenAt) || !Number.isFinite(endAt)) return undefined;
  const span = endAt - firstTokenAt;
  if (span < MIN_SPAN_MS) return undefined;
  const tps = Math.round(outputTokens / (span / 1000));
  return tps > 0 ? tps : undefined;
}
