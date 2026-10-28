/**
 * The chat's side of scheduled wakeups (F6): one scheduler per saved chat, pending wakeups kept in a file beside
 * the sessions, and a due wakeup delivered as an automatic message once the chat is idle. Closing the editor stops
 * the timers; reopening the chat restores them.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { WakeupScheduler, wakeupMessage, type Wakeup, type WakeupStore } from '@ikarmic/forge-core';

/** `<sessions>/wakeups/<chat id>.json`; the folder has no `.json` suffix, so the session list never reads it. */
export function wakeupFile(sessionDir: string, chatId: string): string {
  return path.join(sessionDir, 'wakeups', `${chatId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
}

function isWakeup(v: unknown): v is Wakeup {
  const w = v as Partial<Wakeup> | null;
  return !!w && typeof w.id === 'string' && typeof w.reason === 'string' && typeof w.dueAt === 'number' && typeof w.created === 'number' && (w.prompt === undefined || typeof w.prompt === 'string');
}

export function fileWakeupStore(file: string): WakeupStore {
  return {
    async load() {
      try {
        const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
        return Array.isArray(parsed) ? parsed.filter(isWakeup) : [];
      } catch {
        return [];
      }
    },
    async save(list) {
      if (list.length === 0) {
        await rm(file, { force: true });
        return;
      }
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(list), 'utf8');
      await rename(tmp, file);
    },
  };
}

export interface ChatWakeupsDeps {
  sessionDir: string;
  /** True while a run is going or starting. */
  busy: () => boolean;
  /** Start a run with this automatic message. */
  deliver: (text: string) => void;
  /** Tell the person a wakeup fired. */
  notice: (message: string) => void;
}

export class ChatWakeups {
  private current?: { chatId: string; scheduler: WakeupScheduler };

  constructor(private readonly deps: ChatWakeupsDeps) {}

  /** The scheduler for this chat; a different chat than last time stops the old one's timers and restores this one's. */
  forChat(chatId: string): WakeupScheduler {
    if (this.current?.chatId === chatId) return this.current.scheduler;
    this.release();
    const scheduler = new WakeupScheduler({
      store: fileWakeupStore(wakeupFile(this.deps.sessionDir, chatId)),
      onDue: async (w) => {
        if (this.deps.busy()) return false;
        this.deps.notice(w.reason);
        this.deps.deliver(wakeupMessage(w));
        return true;
      },
    });
    this.current = { chatId, scheduler };
    void scheduler.restore();
    return scheduler;
  }

  /** Stop timers; what is pending stays in the file for when the chat is opened again. */
  release(): void {
    this.current?.scheduler.dispose();
    this.current = undefined;
  }

  /** Stop was pressed: the person does not want the chat to carry on by itself. */
  async cancelAll(): Promise<void> {
    await this.current?.scheduler.cancelAll();
  }
}
