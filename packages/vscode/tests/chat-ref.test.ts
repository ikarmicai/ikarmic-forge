import { describe, expect, it } from 'vitest';

import { chatTranscriptText, findChatEntry } from '../src/chat/chat-ref.js';

const entries = [
  { id: '2026-10-20T10-00-00Z-aaaaaa', label: 'Refactor auth', updatedAt: '2026-10-20T10:00:00Z' },
  { id: '2026-10-21T10-00-00Z-bbbbbb', updatedAt: '2026-10-21T10:00:00Z', preview: 'fix the login bug' },
  { id: '2026-10-22T10-00-00Z-cccccc', label: 'Current one', updatedAt: '2026-10-22T10:00:00Z' },
];
const current = '2026-10-22T10-00-00Z-cccccc';

describe('findChatEntry', () => {
  it('last is the most recently updated chat that is not the open one', () => {
    expect(findChatEntry(entries, 'last', current)?.id).toBe('2026-10-21T10-00-00Z-bbbbbb');
  });

  it('matches an id prefix', () => {
    expect(findChatEntry(entries, '2026-10-20', current)?.id).toBe('2026-10-20T10-00-00Z-aaaaaa');
    expect(findChatEntry(entries, 'bbbbbb', current)?.id).toBe('2026-10-21T10-00-00Z-bbbbbb');
  });

  it('matches a label written with dashes for spaces, case ignored', () => {
    expect(findChatEntry(entries, 'refactor-auth', current)?.id).toBe('2026-10-20T10-00-00Z-aaaaaa');
    expect(findChatEntry(entries, 'REFACTOR-AUTH', current)?.id).toBe('2026-10-20T10-00-00Z-aaaaaa');
  });

  it('never returns the open chat, and is undefined when nothing matches', () => {
    expect(findChatEntry(entries, 'current-one', current)).toBeUndefined();
    expect(findChatEntry(entries, 'nope', current)).toBeUndefined();
    expect(findChatEntry([], 'last', current)).toBeUndefined();
  });
});

describe('chatTranscriptText', () => {
  it('writes each turn with its speaker', () => {
    expect(chatTranscriptText([{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }], 1000)).toBe('User: hi\n\nAssistant: hello');
  });

  it('keeps the end of a long chat, where the latest decisions are, and says it dropped the start', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ role: 'user' as const, text: 'message number ' + i }));
    const out = chatTranscriptText(items, 300);
    expect(out.length).toBeLessThanOrEqual(330);
    expect(out).toContain('message number 49');
    expect(out).not.toContain('message number 0\n');
    expect(out.startsWith('... (earlier messages left out)')).toBe(true);
  });
});
