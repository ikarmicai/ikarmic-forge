/**
 * VS Code enforces a setting's minimum and maximum only in its Settings editor; a value typed into settings.json
 * reaches the extension as written. Numbers that decide behaviour go through this before use.
 */
export function clampSetting(value: unknown, fallback: number, min: number, max = Number.POSITIVE_INFINITY): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
