/** Non-empty lines after the Size line that still count: MiniMax adds a short closing note despite the prompt. */
const MAX_LINES_AFTER_SIZE = 2;

/**
 * The Plan agent ends its reply with "Size: small" or "Size: large" (core `specialists.ts`). A large plan
 * offers to become a spec. The Size line counts when it is among the last few non-empty lines and outside a
 * code block, so a Size line quoted earlier in the plan or in an example does not. Markdown emphasis and a
 * full stop are allowed, because models add them.
 */
export function planSize(text: string): 'small' | 'large' | undefined {
  const lines: { text: string; fenced: boolean }[] = [];
  let inFence = false;
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (t.startsWith('```')) {
      inFence = !inFence;
      lines.push({ text: t, fenced: true });
    } else if (t.length > 0) lines.push({ text: t, fenced: inFence });
  }
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 1 - MAX_LINES_AFTER_SIZE); i--) {
    const line = lines[i]!;
    if (line.fenced) continue;
    const m = line.text.replace(/[*_]/g, '').replace(/\.$/, '').trim().match(/^Size:\s*(small|large)$/i);
    if (m) return m[1]!.toLowerCase() as 'small' | 'large';
  }
  return undefined;
}

/** Whether a finished run should offer the big-request card: the same gates as before a run, plus a large plan. */
export function offerSpecAfterPlan(o: {
  reason: string;
  mode: string;
  finalText: string;
  hasSpecHandler: boolean;
  trusted: boolean;
  suggestSpec: boolean;
}): boolean {
  return o.reason === 'completed' && o.mode === 'plan' && o.hasSpecHandler && o.trusted && o.suggestSpec && planSize(o.finalText) === 'large';
}

/**
 * The mode a choice on the big-request card runs in. After a plan, "Just do it" must leave Plan mode (Agent),
 * or it would plan again and offer the card again. Before any plan, "Plan first" plans and the rest keep the
 * current mode.
 */
export function modeForChoice(choice: 'spec' | 'plan' | 'go' | 'never', afterPlan: boolean): string | undefined {
  if (choice === 'plan') return 'plan';
  return afterPlan ? 'agent' : undefined;
}

/** How a request held by Forge's own big-request card runs once the person answered: the question is settled, so the model may not ask it again (RB-88). */
export function runAfterCard(choice: 'plan' | 'go' | 'never', afterPlan: boolean): { modeId?: string; planDeclined: true } {
  const modeId = modeForChoice(choice, afterPlan);
  return { ...(modeId ? { modeId } : {}), planDeclined: true };
}
