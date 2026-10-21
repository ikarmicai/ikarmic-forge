/**
 * The "Always allow this command" list in ~/.forge/config.json (`autoApproveCommands`): pure functions over
 * its shape, so they are unit-tested without the extension host. Entries belong to one workspace path; an
 * entry for a script runner is also tied to the project's scripts fingerprint.
 */
import { needsScriptFingerprint, normalizeCommand } from '@ikarmic/forge-core';

export interface AllowEntry {
  command: string;
  fingerprint?: string;
}
export type AllowTable = Record<string, AllowEntry[]>;

/** Commands that may skip the prompt in `workspace` right now. Nothing when the workspace is untrusted. */
export function activeCommands(table: AllowTable | undefined, workspace: string, fingerprint: string, trusted: boolean): string[] {
  if (!trusted) return [];
  return (table?.[workspace] ?? [])
    .filter((e) => e.fingerprint === undefined || e.fingerprint === fingerprint)
    .map((e) => e.command);
}

export function withEntry(table: AllowTable | undefined, workspace: string, command: string, fingerprint: string): AllowTable {
  const norm = normalizeCommand(command);
  const entry: AllowEntry = needsScriptFingerprint(norm) ? { command: norm, fingerprint } : { command: norm };
  const kept = (table?.[workspace] ?? []).filter((e) => e.command !== norm);
  return { ...table, [workspace]: [...kept, entry] };
}

export function withoutEntry(table: AllowTable | undefined, workspace: string, command: string): AllowTable {
  const next: AllowTable = { ...table };
  const kept = (table?.[workspace] ?? []).filter((e) => e.command !== command);
  if (kept.length > 0) next[workspace] = kept;
  else delete next[workspace];
  return next;
}

export function listEntries(table: AllowTable | undefined): Array<{ workspace: string; command: string }> {
  return Object.entries(table ?? {})
    .flatMap(([workspace, entries]) => entries.map((e) => ({ workspace, command: e.command })))
    .sort((a, b) => a.workspace.localeCompare(b.workspace) || a.command.localeCompare(b.command));
}
