import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { confirmPlan, parsePlanAnswer } from '../src/commands/architect.js';

describe('confirmPlan', () => {
  it('re-refs stdin (Ink unrefs it on unmount, which would let the process exit at the prompt)', async () => {
    // A TTY ReadStream has ref()/unref(); PassThrough does not, so add one to observe.
    const input = Object.assign(new PassThrough(), { ref: vi.fn() });
    const output = new PassThrough();
    const ref = input.ref;
    const answer = confirmPlan('minimax/MiniMax-M2', { input, output });
    input.write('n\n');
    await expect(answer).resolves.toBe(false);
    expect(ref).toHaveBeenCalled();
  });
});

describe('parsePlanAnswer', () => {
  it('defaults to yes', () => {
    expect(parsePlanAnswer('')).toBe(true);
    expect(parsePlanAnswer('y')).toBe(true);
    expect(parsePlanAnswer(' YES ')).toBe(true);
  });
  it('accepts n / no as a rejection', () => {
    expect(parsePlanAnswer('n')).toBe(false);
    expect(parsePlanAnswer('No')).toBe(false);
  });
  it('treats anything else as a rejection', () => {
    expect(parsePlanAnswer('maybe')).toBe(false);
  });
});
