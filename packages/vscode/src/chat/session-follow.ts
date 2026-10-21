/**
 * Keeps the open chat in step with its session file when another process (the
 * CLI, or another VS Code window) continues the same session. vscode-free so
 * it is unit-testable.
 */
import { watchSession, type Session } from '@ikarmic/forge-core';

type History = NonNullable<Session['messages']>;

export interface FollowerDeps {
  dir: string;
  /** The session the chat has open and the history it holds in memory. */
  current: () => { id: string; history: History | undefined };
  /** True while a local run is in flight; its own save will win, so external edits wait. */
  busy: () => boolean;
  /** An external process changed the open session; the host should reload it. */
  onExternal: (session: Session) => void;
  pollMs?: number;
}

export class SessionFollower {
  private stopWatch: (() => void) | undefined;
  private watchedId: string | undefined;
  private retarget: NodeJS.Timeout | undefined;

  constructor(private readonly deps: FollowerDeps) {}

  start(): void {
    if (this.retarget) return;
    this.sync();
    // The open session changes with New chat / Resume: re-point the watcher.
    this.retarget = setInterval(() => this.sync(), 1000);
  }

  stop(): void {
    if (this.retarget) clearInterval(this.retarget);
    this.retarget = undefined;
    this.stopWatch?.();
    this.stopWatch = undefined;
    this.watchedId = undefined;
  }

  private sync(): void {
    const { id, history } = this.deps.current();
    if (id === this.watchedId) return;
    this.stopWatch?.();
    this.watchedId = id;
    this.stopWatch = watchSession(
      id,
      this.deps.dir,
      ({ session }) => {
        if (this.deps.busy() || this.deps.current().id !== id) return;
        if (sameHistory(this.deps.current().history, session.messages)) return; // our own save
        this.deps.onExternal(session);
      },
      { pollMs: this.deps.pollMs ?? 1000, known: history ?? [] }
    );
  }
}

function sameHistory(local: History | undefined, disk: History): boolean {
  const a = local ?? [];
  if (a.length !== disk.length) return false;
  return a.length === 0 || JSON.stringify(a[a.length - 1]) === JSON.stringify(disk[disk.length - 1]);
}
