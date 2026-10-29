/**
 * When old chats were last deleted, and how many, so the Settings page can say it happened. Pure (no `vscode`): the
 * place it is kept is any object with get and update, which VS Code's `globalState` is.
 */
export interface CleanupRecord {
  /** ISO time of the run. */
  at: string;
  deleted: number;
}

export interface CleanupStore {
  get(key: string): unknown;
  update(key: string, value: unknown): PromiseLike<void> | Promise<void>;
}

const KEY = 'forge.chatCleanup';
const DAY = 86_400_000;

export function readCleanup(store: Pick<CleanupStore, 'get'>): CleanupRecord | undefined {
  const v = store.get(KEY) as Partial<CleanupRecord> | undefined;
  return v && typeof v.at === 'string' && typeof v.deleted === 'number' ? { at: v.at, deleted: v.deleted } : undefined;
}

export async function recordCleanup(store: CleanupStore, deleted: number, now: Date = new Date()): Promise<void> {
  await store.update(KEY, { at: now.toISOString(), deleted });
}

/** "Last cleanup: yesterday. 1 chat deleted." in the words a person would use. */
export function cleanupLine(record: CleanupRecord | undefined, now: Date = new Date()): string {
  const at = record ? Date.parse(record.at) : NaN;
  if (!record || !Number.isFinite(at)) return 'No cleanup has run yet.';
  const days = Math.max(0, Math.floor((now.getTime() - at) / DAY));
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  const what = record.deleted === 0 ? 'No chats were old enough.' : `${record.deleted} chat${record.deleted === 1 ? '' : 's'} deleted.`;
  return `Last cleanup: ${when}. ${what}`;
}
