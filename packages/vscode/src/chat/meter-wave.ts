/** The context meter's wave and its tones. vscode-free so it is unit-testable; the chat page calls it through `window.ForgeUI`. */

export const WAVE_W = 132;
export const WAVE_H = 28;
export const WAVE_LEN = 44;

const clampPct = (pct: number): number => (Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0);

/**
 * SVG path of a wave filled up to `pct` percent of the capsule. It runs one wavelength past each side, so the page can
 * scroll it by exactly one wavelength in a loop without a gap. An empty meter stays a calm sliver at the bottom.
 */
export function wavePath(pct: number, phase: number, amp: number): string {
  const p = clampPct(pct);
  const base = WAVE_H * (1 - Math.max(0.05, p / 100));
  const a = p <= 2 ? Math.min(amp, 1) : amp;
  const y = (x: number) => (base + a * Math.sin((2 * Math.PI * x) / WAVE_LEN + phase)).toFixed(2);
  let d = `M-${WAVE_LEN} ${WAVE_H} L-${WAVE_LEN} ${y(-WAVE_LEN)}`;
  for (let x = -WAVE_LEN; x <= WAVE_W + WAVE_LEN; x += 2) d += ` L${x} ${y(x)}`;
  return `${d} L${WAVE_W + WAVE_LEN} ${WAVE_H} Z`;
}

/** The meter's tone for a context percentage: calm, warning from 80%, critical from 95%. */
export function meterLevel(pct: number | null): 'none' | 'ok' | 'warn' | 'crit' {
  if (pct === null || !Number.isFinite(pct)) return 'none';
  return pct >= 95 ? 'crit' : pct >= 80 ? 'warn' : 'ok';
}

/** 38000 -> "38,000". */
export function formatTokens(n: number): string {
  return Number.isFinite(n) && n > 0 ? Math.round(n).toLocaleString('en-US') : '0';
}
