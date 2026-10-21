/**
 * Pure model behind "Forge: Manage Memory": turns loaded memory into the rows
 * of a quick pick. No `vscode` import, so it is unit-tested without the host.
 */
import { globalMemoryPath, staleKey, type LoadedMemory, type MemoryType } from '@ikarmic/forge-core';

export interface MemoryItem {
  heading: string;
  scope: 'project' | 'global';
  /** Absolute path of the memory file the section lives in. */
  source: string;
  /** `type · updated` (date is YYYY-MM-DD). */
  description: string;
  /** Why the section is flagged, when it is. */
  detail?: string;
}

const TYPE_ORDER: readonly MemoryType[] = ['correction', 'decision', 'convention', 'reference'];

export function buildMemoryItems(
  loaded: LoadedMemory,
  stale: Map<string, string[]>,
  globalPath: string = globalMemoryPath()
): MemoryItem[] {
  return [...loaded.sections]
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.heading.localeCompare(b.heading))
    .map((s) => {
      const reasons = stale.get(staleKey(s));
      return {
        heading: s.heading,
        scope: s.source === globalPath ? ('global' as const) : ('project' as const),
        source: s.source,
        description: `${s.type} · ${new Date(s.updatedAt).toISOString().slice(0, 10)}`,
        ...(reasons ? { detail: `possibly stale: ${reasons.join('; ')}` } : {}),
      };
    });
}
