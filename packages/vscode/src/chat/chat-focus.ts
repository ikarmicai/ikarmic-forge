/**
 * Which chat the person last used. The sidebar chat and every editor-tab chat is its own provider, so a
 * command such as "Cycle Chat Mode" has to reach the one that has focus, not always the sidebar.
 */
export class ChatFocus<T> {
  private readonly order: T[] = [];

  /** Make `p` the most recently focused provider. */
  mark(p: T): void {
    this.forget(p);
    this.order.push(p);
  }

  /** Drop `p` (its chat was closed). */
  forget(p: T): void {
    const i = this.order.indexOf(p);
    if (i >= 0) this.order.splice(i, 1);
  }

  /** The most recently marked provider that is still registered. */
  last(): T | undefined {
    return this.order[this.order.length - 1];
  }
}

/** What the shortcut commands ask of a chat. */
export interface ChatShortcuts {
  cycleMode(): void;
  toggleAcceptEdits(): void;
  startTerminalCommand(): Promise<void>;
}

/** The chats of this window; a chat marks itself when its page gains focus and forgets itself when it is disposed. */
export const chatFocus = new ChatFocus<ChatShortcuts>();
