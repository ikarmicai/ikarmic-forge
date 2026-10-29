/**
 * RB-88: "Build a CRM" showed the big-request card twice. Forge's own card (looksLargeMessage) held the request;
 * "Just do it" ran it without planDeclined, so the model called suggest_plan and the same card came back 7 seconds
 * later. Seen with MiniMax and DeepSeek in real VS Code. The branch for the model's own suggestion already passed it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runAfterCard } from '../src/chat/plan-size.js';

describe('the big-request question is asked once (RB-88)', () => {
  it('every answer to Forge own card runs with the question marked answered', () => {
    for (const choice of ['go', 'plan', 'never'] as const) {
      expect(runAfterCard(choice, false).planDeclined).toBe(true);
      expect(runAfterCard(choice, true).planDeclined).toBe(true);
    }
  });

  it('keeps the mode each choice runs in', () => {
    expect(runAfterCard('plan', false).modeId).toBe('plan');
    expect(runAfterCard('go', false).modeId).toBeUndefined();
    expect(runAfterCard('go', true).modeId).toBe('agent');
  });

  it('every run started from the card handler passes planDeclined', () => {
    const src = readFileSync(join(__dirname, '../src/chat/chat-view.ts'), 'utf8');
    const start = src.indexOf("case 'suggest_choice'");
    const end = src.indexOf("case '", start + 10);
    const handler = src.slice(start, end);
    const calls = handler.match(/this\.runChat\([^;]*\);/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) expect(call).toMatch(/planDeclined|, true\)/);
  });

  it('Retry and Edit run a message the person already answered for with the question still answered', () => {
    const src = readFileSync(join(__dirname, '../src/chat/chat-view.ts'), 'utf8');
    // The turn remembers the answer...
    expect(src).toMatch(/private lastTurn: \{[^}]*planDeclined: boolean/);
    expect(src).toMatch(/this\.lastTurn = \{[^}]*planDeclined \}/);
    // ...and Retry hands it back.
    const start = src.indexOf("case 'retry_last'");
    const handler = src.slice(start, src.indexOf("case '", start + 10));
    const calls = handler.match(/this\.runChat\([^;]*\);/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('last.planDeclined');
  });
});
