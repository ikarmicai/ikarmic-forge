/**
 * `@chat:<ref>`: which saved chat a mention means, and how its text is laid out for the model. Pure, so it is
 * unit-tested; reading the sessions from disk happens in the extension.
 */
export interface ChatEntry {
  id: string;
  label?: string;
  preview?: string;
  updatedAt: string;
}

const slug = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, '-');

/** `last` = the newest chat other than the open one; otherwise an id prefix, or a label with dashes for spaces. */
export function findChatEntry<T extends ChatEntry>(entries: readonly T[], ref: string, openId: string): T | undefined {
  const others = entries.filter((e) => e.id !== openId);
  const wanted = slug(ref);
  if (!wanted) return undefined;
  if (wanted === 'last') return [...others].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))[0];
  return others.find((e) => e.id.toLowerCase().startsWith(wanted) || e.id.toLowerCase().endsWith(wanted) || (e.label && slug(e.label) === wanted));
}

const OMITTED = '... (earlier messages left out)';

/** The conversation as plain text, newest part kept when it has to be cut to `max` characters. */
export function chatTranscriptText(items: ReadonlyArray<{ role: 'user' | 'assistant'; text: string }>, max: number): string {
  const lines = items.map((i) => `${i.role === 'user' ? 'User' : 'Assistant'}: ${i.text.trim()}`);
  const all = lines.join('\n\n');
  if (all.length <= max) return all;
  const kept: string[] = [];
  let size = OMITTED.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const add = lines[i]!.length + 2;
    if (size + add > max) break;
    kept.unshift(lines[i]!);
    size += add;
  }
  return `${OMITTED}\n\n${kept.join('\n\n')}`;
}
