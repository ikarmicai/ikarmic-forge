import { describe, expect, it } from 'vitest';

import { clampSetting } from '../src/setting-range.js';

describe('clampSetting: a hand-edited settings.json value outside the range package.json allows', () => {
  it('is pulled back inside the range', () => {
    expect(clampSetting(0, 0.7, 0.3, 0.95)).toBe(0.3);
    expect(clampSetting(5, 0.7, 0.3, 0.95)).toBe(0.95);
    expect(clampSetting(-10, 512, 32, 2048)).toBe(32);
    expect(clampSetting(-1, 0, 0)).toBe(0);
  });

  it('falls back to the default when it is not a number at all', () => {
    expect(clampSetting(undefined, 0.7, 0.3, 0.95)).toBe(0.7);
    expect(clampSetting('0.5' as unknown as number, 0.7, 0.3, 0.95)).toBe(0.7);
    expect(clampSetting(Number.NaN, 512, 32, 2048)).toBe(512);
    expect(clampSetting(Number.POSITIVE_INFINITY, 512, 32, 2048)).toBe(512);
  });

  it('keeps a value that is already allowed', () => {
    expect(clampSetting(0.5, 0.7, 0.3, 0.95)).toBe(0.5);
    expect(clampSetting(1000, 350, 0)).toBe(1000);
  });
});
