import { describe, expect, it } from 'vitest';

import { formatTokens, meterLevel, wavePath } from '../src/chat/meter-wave.js';
import * as webviewLib from '../src/chat/webview-lib.js';

const ys = (d: string) => [...d.matchAll(/L(-?\d+) (-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));
const meanY = (d: string) => {
  const v = ys(d).slice(1, -1);
  return v.reduce((a, b) => a + b, 0) / v.length;
};

describe('webview-lib exposes the meter helpers the chat page calls (RB-3)', () => {
  it('exports wavePath, meterLevel and formatTokens', () => {
    expect(webviewLib.wavePath).toBe(wavePath);
    expect(webviewLib.meterLevel).toBe(meterLevel);
    expect(webviewLib.formatTokens).toBe(formatTokens);
  });
});

describe('wavePath', () => {
  it('is a closed shape that runs one wavelength past each side so it can scroll without a gap', () => {
    const d = wavePath(38, 0, 2.2);
    expect(d.startsWith('M-44 28 L-44 ')).toBe(true);
    expect(d.endsWith('L176 28 Z')).toBe(true);
  });

  it('sits lower for less context and higher for more', () => {
    expect(meanY(wavePath(10, 0, 2))).toBeGreaterThan(meanY(wavePath(50, 0, 2)));
    expect(meanY(wavePath(50, 0, 2))).toBeGreaterThan(meanY(wavePath(90, 0, 2)));
  });

  it('keeps an empty meter calm: almost flat, and still a thin sliver at the bottom', () => {
    const v = ys(wavePath(0, 0, 3.2)).slice(1, -1);
    expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(2);
    expect(Math.min(...v)).toBeGreaterThan(24);
  });

  it('is deterministic and survives bad input', () => {
    expect(wavePath(38, 2.1, 2.2)).toBe(wavePath(38, 2.1, 2.2));
    expect(wavePath(Number.NaN, 0, 2)).toBe(wavePath(0, 0, 2));
    expect(() => wavePath(-5, 0, 2)).not.toThrow();
    expect(() => wavePath(250, 0, 2)).not.toThrow();
  });
});

describe('meterLevel', () => {
  it('maps the context percentage to a tone', () => {
    expect(meterLevel(null)).toBe('none');
    expect(meterLevel(0)).toBe('ok');
    expect(meterLevel(79)).toBe('ok');
    expect(meterLevel(80)).toBe('warn');
    expect(meterLevel(94)).toBe('warn');
    expect(meterLevel(95)).toBe('crit');
    expect(meterLevel(100)).toBe('crit');
  });
});

describe('formatTokens', () => {
  it('groups thousands and never shows NaN', () => {
    expect(formatTokens(38000)).toBe('38,000');
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(Number.NaN)).toBe('0');
    expect(formatTokens(-4)).toBe('0');
  });
});
