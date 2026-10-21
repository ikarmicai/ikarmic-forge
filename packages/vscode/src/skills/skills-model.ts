/**
 * Pure view helpers for the skills catalog picker. No `vscode` import.
 */
import type { SkillCatalogEntry } from '@ikarmic/forge-core';

export interface SkillPickItem {
  label: string;
  description: string;
  detail: string;
  entry: SkillCatalogEntry;
  installed: boolean;
}

export function skillPickItems(entries: readonly SkillCatalogEntry[], installed: ReadonlySet<string>): SkillPickItem[] {
  return entries.map((entry) => {
    const isInstalled = installed.has(entry.name);
    return {
      label: `${isInstalled ? '$(check) ' : ''}${entry.displayName}`,
      description: [entry.name, ...(entry.tags ?? [])].join(' · '),
      detail: entry.description,
      entry,
      installed: isInstalled,
    };
  });
}
