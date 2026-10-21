import { describe, expect, it } from 'vitest';

import { parseOptions } from '../src/options.js';

const argv = (...a: string[]) => ['node', 'forge', ...a];

describe('forge session prune parsing', () => {
  it('reads --older-than as a number of days', () => {
    expect(parseOptions(argv('session', 'prune', '--older-than', '30')).sessionCommand).toEqual({
      prune: { olderThanDays: 30, dryRun: false },
    });
  });

  it('passes --dry-run through', () => {
    expect(parseOptions(argv('session', 'prune', '--older-than', '7', '--dry-run')).sessionCommand).toEqual({
      prune: { olderThanDays: 7, dryRun: true },
    });
  });

  it('leaves olderThanDays null when the flag is missing or not a number, so the handler can print usage', () => {
    expect(parseOptions(argv('session', 'prune')).sessionCommand).toEqual({ prune: { olderThanDays: null, dryRun: false } });
    expect(parseOptions(argv('session', 'prune', '--older-than', 'soon')).sessionCommand).toEqual({ prune: { olderThanDays: null, dryRun: false } });
  });
});
