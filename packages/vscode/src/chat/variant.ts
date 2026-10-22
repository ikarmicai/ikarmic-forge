/**
 * Reasoning effort for this chat, cycled with /variant or Shift+Tab. The empty effort means "what the provider
 * does by default"; the others are the levels most models share. Pure.
 */
export type Effort = '' | 'low' | 'medium' | 'high';

const CYCLE: readonly Effort[] = ['', 'low', 'medium', 'high'];

export function nextEffort(current: string | undefined): Effort {
  const i = CYCLE.indexOf((current ?? '') as Effort);
  return i < 0 ? 'low' : CYCLE[(i + 1) % CYCLE.length]!;
}

export function effortLabel(effort: string): string {
  return effort === '' ? 'provider default' : effort;
}
