import { computeUnifiedDiff } from '@ikarmic/forge-core';

export type DetailLevel = 'compact' | 'full';

/**
 * Summarize a tool result for display. `detail: 'compact'` (default)
 * caps at 10 lines, matching today's behavior; `'full'` shows everything.
 */
export function summarizeResult(result: unknown, isError: boolean | undefined, detail: DetailLevel = 'compact'): string {
  if (result === undefined) return '';
  let text: string;
  if (typeof result === 'string') {
    text = result;
  } else {
    try {
      text = JSON.stringify(result, null, 2);
    } catch {
      text = String(result);
    }
  }
  const allLines = text.split('\n');
  const cap = detail === 'full' ? allLines.length : 10;
  const lines = allLines.slice(0, cap);
  const truncated = allLines.length > cap;
  const header = isError ? '↳ error:' : '↳';
  return [header, ...lines.map((l) => '  ' + l)].join('\n') + (truncated ? '\n  ... (truncated)' : '');
}

/**
 * Return a unified-diff string for `edit_file`/`write_file` calls, or null
 * for any other tool (or when the needed data isn't available yet).
 *
 * `edit_file`'s call args always carry old_text/new_text, so its diff is
 * available immediately. `write_file`'s args only carry the NEW content: 
 * there is no "before" text to diff against for an overwrite: so a diff
 * is only produced when the tool's result confirms `created: true` (a
 * brand-new file, diffed against an empty string); an overwrite of an
 * existing file falls back to the generic renderer.
 */
export function getUnifiedDiffText(name: string, args: unknown, result: unknown): string | null {
  if (name === 'edit_file') {
    const a = args as { old_text?: unknown; new_text?: unknown } | null;
    if (a && typeof a.old_text === 'string' && typeof a.new_text === 'string') {
      return computeUnifiedDiff(a.old_text, a.new_text).text;
    }
    return null;
  }
  if (name === 'write_file') {
    const a = args as { content?: unknown } | null;
    const r = result as { created?: unknown } | null;
    if (a && typeof a.content === 'string' && r && r.created === true) {
      return computeUnifiedDiff('', a.content).text;
    }
    return null;
  }
  return null;
}
