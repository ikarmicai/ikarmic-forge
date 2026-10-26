/**
 * Runs a built-in slash command through the pieces the chat view already has. Pure (no `vscode`), so each
 * command is unit-tested against fakes. Custom commands are not run here: they expand into a prompt.
 */
import type { SlashEntry } from './slash-commands.js';

export interface SlashDeps {
  newChat(): void;
  compact(): Promise<void>;
  exportChat(): Promise<void>;
  openModelMenu(): void;
  openModeSelect(): void;
  cycleVariant(): void;
  goal(args: string): Promise<void>;
  /** `/memory` with whatever followed it: nothing opens the file, `add`, `list` and `forget` work on it. */
  memory(args: string): Promise<void>;
  openSettings(): Promise<void>;
  /** `/review` with its scope words (staged, unstaged, last, branch [base]); none reviews all uncommitted changes. */
  review(args: string): Promise<void>;
  reload(): Promise<void>;
  /** `/cmd` with the request in plain words: writes one shell command and shows it as a card. */
  terminalCommand(args: string): Promise<void>;
  help(text: string): void;
}

/** Shown by `/cmd` with no words. The page translates it (it is in WEBVIEW_STRINGS). */
export const CMD_USAGE = 'Say what you want after /cmd, for example: /cmd list files larger than 10 MB';

/** True when `name` was a built-in and has been run. */
export async function runSlash(name: string, args: string, deps: SlashDeps, known: readonly SlashEntry[]): Promise<boolean> {
  const entry = known.find((e) => e.source === 'builtin' && e.name === name);
  if (!entry) return false;
  switch (entry.name) {
    case 'new':
      deps.newChat();
      return true;
    case 'compact':
      await deps.compact();
      return true;
    case 'export':
      await deps.exportChat();
      return true;
    case 'model':
      deps.openModelMenu();
      return true;
    case 'mode':
      deps.openModeSelect();
      return true;
    case 'variant':
      deps.cycleVariant();
      return true;
    case 'goal':
      await deps.goal(args);
      return true;
    case 'memory':
      await deps.memory(args);
      return true;
    case 'settings':
      await deps.openSettings();
      return true;
    case 'review':
      await deps.review(args);
      return true;
    case 'reload':
      await deps.reload();
      return true;
    case 'cmd':
      if (args.trim()) await deps.terminalCommand(args.trim());
      else deps.help(CMD_USAGE);
      return true;
    case 'help':
      deps.help(known.map((e) => `/${e.name} - ${e.description}`).join('\n'));
      return true;
    default:
      return false;
  }
}
