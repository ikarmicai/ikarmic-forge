import { describe, expect, it } from 'vitest';

import { parseOptions } from '../src/options.js';

const argv = (...a: string[]) => ['node', 'forge', ...a];

describe('--loop-guard', () => {
  it('is off unless given', () => {
    expect(parseOptions(argv('task')).options.loopGuardThreshold).toBeNull();
  });

  it('reads the number of identical tool calls that stops a run', () => {
    expect(parseOptions(argv('--loop-guard', '4', 'task')).options.loopGuardThreshold).toBe(4);
  });

  it('ignores zero, negatives and text instead of passing them to the agent', () => {
    for (const bad of ['0', '-2', 'abc']) {
      expect(parseOptions(argv('--loop-guard', bad, 'task')).options.loopGuardThreshold).toBeNull();
    }
  });
});
