/**
 * `/cmd` results kept beside a chat, never inside it: they are not messages, so they stay out of the model's
 * history. Saved per session in workspaceState (`forge.cmd.<id>`) with the number of transcript items before each,
 * and merged back into the transcript on resume. Pure; chat-view.ts does the storing.
 */
import type { TranscriptItem } from './history-protocol.js';

export interface CmdEntry {
  /** Number of transcript items before this entry. */
  at: number;
  request: string;
  command?: string;
  risk?: string;
  failed?: boolean;
}

export const cmdKey = (sessionId: string): string => `forge.cmd.${sessionId}`;

/** The transcript with each entry inserted at its `at` (clamped to the end); entries at one place keep their order. */
export function mergeCmdEntries(items: TranscriptItem[], entries: readonly CmdEntry[]): TranscriptItem[] {
  const out = [...items];
  let added = 0;
  const sorted = entries.map((e, i) => ({ e, i })).sort((x, y) => x.e.at - y.e.at || x.i - y.i);
  for (const { e } of sorted) {
    const item: TranscriptItem = { role: 'cmd', request: e.request };
    if (e.command !== undefined) item.command = e.command;
    if (e.risk !== undefined) item.risk = e.risk;
    if (e.failed) item.failed = true;
    out.splice(Math.min(Math.max(e.at, 0) + added, out.length), 0, item);
    added++;
  }
  return out;
}

/** The commands of a chat as a Markdown section for /export, each whole command in a fenced block. Empty when there are none. */
export function cmdEntriesMarkdown(entries: readonly CmdEntry[]): string {
  const done = entries.filter((e) => e.command);
  if (done.length === 0) return '';
  return ['## Terminal commands', '', ...done.flatMap((e) => [`Request: ${e.request}`, '', '```', e.command!, '```', ''])].join('\n');
}

/**
 * How Insert puts a command in the terminal. A newline sent to a terminal is an Enter key, so a command of
 * several lines typed with `sendText` would start running its first lines. Such a command is copied instead.
 */
export function insertPlan(command: string): 'type' | 'copy' {
  return /[\r\n]/.test(command.trim()) ? 'copy' : 'type';
}
