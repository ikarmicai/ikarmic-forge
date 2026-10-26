/**
 * Earlier prompts for the chat box (up and down arrows). `pushPrompt` and `userPrompts` run in the host;
 * `historyStep` runs in the page and reaches it through window.ForgeUI (RB-3). Keep this file free of Node imports.
 */

export const PROMPT_HISTORY_MAX = 100;

/** Add a sent prompt to the list: trimmed, never empty, never a repeat of the newest, oldest dropped beyond `max`. */
export function pushPrompt(list: readonly string[], text: string, max = PROMPT_HISTORY_MAX): string[] {
  const t = text.trim();
  if (!t || list[list.length - 1] === t) return [...list];
  const next = [...list, t];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** The person's own messages of one chat, oldest first, from `transcriptFromMessages`. */
export function userPrompts(items: readonly { role: string; text: string }[]): string[] {
  return items.filter((i) => i.role === 'user').map((i) => i.text.trim()).filter(Boolean);
}

export interface HistoryState {
  /** -1 means the draft the person is typing; otherwise a position in the list (newest last). */
  index: number;
  draft: string;
}

/**
 * One arrow-key step through earlier prompts. `undefined` means do nothing and let the key move the caret.
 * The first step back remembers what was typed (`draft`); stepping forward past the newest gives it back.
 */
export function historyStep(
  state: HistoryState,
  key: 'up' | 'down',
  items: readonly string[],
  value: string
): { index: number; draft: string; value: string } | undefined {
  const draft = state.index === -1 ? value : state.draft;
  if (key === 'up') {
    const next = state.index === -1 ? items.length - 1 : state.index - 1;
    if (next < 0) return undefined;
    return { index: next, draft, value: items[next] ?? '' };
  }
  if (state.index === -1) return undefined;
  const next = state.index + 1;
  if (next >= items.length) return { index: -1, draft, value: draft };
  return { index: next, draft, value: items[next] ?? '' };
}
