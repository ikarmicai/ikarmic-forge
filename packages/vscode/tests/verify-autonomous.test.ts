/**
 * RB-96: with Autonomous on, the verify step still asked "Run $ npm test?" before running the project's checks. In
 * an Agent Manager session the card sat in a chat tab nobody was looking at, so a 7-line change showed "Running"
 * for 28 minutes. RB-42 made Autonomous mean no approval cards for tools; this question was a second kind of card.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { verifyNeedsAsking } from '../src/chat/run-extras.js';

describe('Autonomous runs the project checks without asking (RB-96)', () => {
  it('asks only when the checks need consent and the run is not Autonomous', () => {
    expect(verifyNeedsAsking(true, false)).toBe(true);
    expect(verifyNeedsAsking(true, true)).toBe(false);
    expect(verifyNeedsAsking(false, false)).toBe(false);
  });

  it('the chat decides the checks question through it', () => {
    const src = readFileSync(join(__dirname, '../src/chat/chat-view.ts'), 'utf8');
    expect(src).toMatch(/verifyNeedsAsking\(plan\.needsConsent, auto\)/);
  });
});
