/**
 * Chat history webview protocol + pure handler: list / resume / delete
 * saved sessions and list / restore checkpoints. vscode-free (same
 * pattern as settings/settings-protocol.ts); `chat-view.ts` is the thin
 * adapter that supplies `confirm` (a modal) and the real core functions.
 *
 */
import path from 'node:path';

import type {
  CheckpointSummary,
  ListEntry,
  RestoreResult,
  Session,
  deleteSession as coreDeleteSession,
  listSessions as coreListSessions,
  loadSession as coreLoadSession,
  searchSessions as coreSearchSessions,
} from '@ikarmic/forge-core';

export type HistoryMessage =
  | { type: 'listSessions' }
  | { type: 'searchSessions'; q: string }
  | { type: 'resumeSession'; id: string }
  | { type: 'deleteSession'; id: string }
  | { type: 'listCheckpoints' }
  | { type: 'restoreCheckpoint'; id: string };

export interface TranscriptItem {
  role: 'user' | 'assistant';
  text: string;
}

export type HistoryResponse =
  | { type: 'sessionsListed'; sessions: ListEntry[]; /** Set for search results; each preview is then the matching snippet. */ query?: string }
  | { type: 'sessionResumed'; session: Session; transcript: TranscriptItem[] }
  | { type: 'sessionDeleted'; id: string; /** The deleted session was the open one: the host starts a new chat. */ active?: boolean }
  | { type: 'checkpointsListed'; checkpoints: CheckpointSummary[] }
  | { type: 'checkpointRestored'; result: RestoreResult }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

export interface CheckpointAccess {
  list(): Promise<CheckpointSummary[]>;
  restore(id: string): Promise<RestoreResult | null>;
}

export interface HistoryDeps {
  sessionDir: string;
  activeSessionId: () => string;
  listSessions: typeof coreListSessions;
  searchSessions: typeof coreSearchSessions;
  loadSession: typeof coreLoadSession;
  deleteSession: typeof coreDeleteSession;
  removeDir: (dir: string) => Promise<void>;
  checkpoints: () => CheckpointAccess;
  confirm: (message: string, action: string) => Promise<boolean>;
  /** Folder the active session started in, when known. */
  activeCwd: () => string | undefined;
  workspaceRoot: () => string;
  /** Removes injected <steering> blocks from user text (core's stripSteering). */
  stripSteering?: (text: string) => string;
}

const ID_TYPES = new Set(['resumeSession', 'deleteSession', 'restoreCheckpoint']);
const PLAIN_TYPES = new Set(['listSessions', 'listCheckpoints']);

export function isHistoryMessage(msg: unknown): msg is HistoryMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (typeof m.type !== 'string') return false;
  if (PLAIN_TYPES.has(m.type)) return true;
  if (m.type === 'searchSessions') return typeof m.q === 'string' && m.q.length <= 200;
  return ID_TYPES.has(m.type) && typeof m.id === 'string';
}

export function sameDir(a: string, b: string): boolean {
  const norm = (p: string) => {
    const r = path.resolve(p);
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  return norm(a) === norm(b);
}

/** Ids from the webview become path segments. Reject anything that could escape. */
export function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(id) && id !== '.' && id !== '..';
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((p): p is { type: 'text'; text: string } =>
      !!p && typeof p === 'object' && (p as { type?: unknown }).type === 'text' && typeof (p as { text?: unknown }).text === 'string')
    // An attached file shows as one line naming it, not as its inlined contents.
    .map((p) => (p.text.startsWith('Attached file: ') ? `\n\n📎 ${p.text.slice(15).split('\n')[0]}` : p.text))
    .join('');
}

export function transcriptFromMessages(messages: readonly unknown[], strip: (text: string) => string = (t) => t): TranscriptItem[] {
  const out: TranscriptItem[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') continue;
    const text = role === 'user' ? strip(textOf(content)) : textOf(content);
    if (text.trim()) out.push({ role, text });
  }
  return out;
}

export async function handleHistoryMessage(msg: HistoryMessage, deps: HistoryDeps): Promise<HistoryResponse> {
  if ('id' in msg && !isSafeId(msg.id)) {
    return { type: 'error', message: `invalid id: ${msg.id}` };
  }
  try {
    switch (msg.type) {
      case 'listSessions':
        return { type: 'sessionsListed', sessions: await deps.listSessions(deps.sessionDir) };

      case 'searchSessions': {
        const query = msg.q.trim();
        if (!query) return { type: 'sessionsListed', sessions: await deps.listSessions(deps.sessionDir) };
        const found = await deps.searchSessions(deps.sessionDir, query, { limit: 50 });
        return { type: 'sessionsListed', sessions: found.map((f) => ({ ...f.entry, preview: f.snippet })), query };
      }

      case 'resumeSession': {
        const session = await deps.loadSession(msg.id, deps.sessionDir);
        return { type: 'sessionResumed', session, transcript: transcriptFromMessages(session.messages, deps.stripSteering) };
      }

      case 'deleteSession': {
        const active = msg.id === deps.activeSessionId();
        const ok = await deps.confirm(
          active
            ? 'Delete the open session and its checkpoints? A new chat starts. This cannot be undone.'
            : `Delete session ${msg.id} and its checkpoints? This cannot be undone.`,
          'Delete'
        );
        if (!ok) return { type: 'cancelled' };
        await deps.deleteSession(msg.id, deps.sessionDir);
        await deps.removeDir(path.join(deps.sessionDir, msg.id));
        return { type: 'sessionDeleted', id: msg.id, ...(active ? { active: true } : {}) };
      }

      case 'listCheckpoints': {
        const list = await deps.checkpoints().list();
        const sorted = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
        return { type: 'checkpointsListed', checkpoints: sorted };
      }

      case 'restoreCheckpoint': {
        const sessionCwd = deps.activeCwd();
        if (sessionCwd && !sameDir(sessionCwd, deps.workspaceRoot())) {
          return {
            type: 'error',
            message: `This session started in ${sessionCwd}, not the open workspace ${deps.workspaceRoot()}. Open that folder to restore its checkpoints.`,
          };
        }
        const ok = await deps.confirm(
          `Restore checkpoint ${msg.id}? Files in the workspace will be overwritten with their saved versions.`,
          'Restore'
        );
        if (!ok) return { type: 'cancelled' };
        const result = await deps.checkpoints().restore(msg.id);
        if (!result) return { type: 'error', message: `checkpoint ${msg.id} not found` };
        return { type: 'checkpointRestored', result };
      }
    }
  } catch (err) {
    return { type: 'error', message: (err as Error).message };
  }
}
