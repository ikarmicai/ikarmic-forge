/**
 * macOS side of the chat's mic button. VS Code refuses the microphone to webviews, so the button asks the
 * system's own dictation to write into the focused chat box. On Windows that is Win+H (chat-view.ts); on
 * macOS it is the Dictation item of the Edit menu, which VS Code gets from the system like any other app.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Clicks "Start Dictation" in the frontmost app's Edit menu, or "Stop Dictation" while it is running, so
 * one press starts and the next stops. A fixed text with nothing put into it: nothing the chat holds
 * (a prompt, a file name) can reach the script. Needs Accessibility access for VS Code.
 */
export const MAC_DICTATION_SCRIPT = [
  'tell application "System Events"',
  '  tell (first application process whose frontmost is true)',
  '    set editMenu to menu 1 of menu bar item "Edit" of menu bar 1',
  '    repeat with mi in menu items of editMenu',
  '      set nm to name of mi',
  '      if nm is not missing value and (nm starts with "Start Dictation" or nm starts with "Stop Dictation") then',
  '        click mi',
  '        return "ok"',
  '      end if',
  '    end repeat',
  '  end tell',
  'end tell',
  'error "Dictation menu item not found" number 1728',
].join('\n');

export interface SystemCommand {
  file: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}

/** The system osascript by absolute path, in a neutral folder and ended after 10 seconds, never one found through the workspace (RB-24). */
export function macDictationCommand(): SystemCommand {
  return { file: '/usr/bin/osascript', args: ['-e', MAC_DICTATION_SCRIPT], cwd: '/', timeoutMs: 10_000 };
}

type Run = (file: string, args: string[], options: { cwd: string; timeout: number }) => Promise<unknown>;

/** Start or stop macOS dictation. A failure is thrown as words for the person (see {@link macDictationFailure}). */
export async function pressMacDictation(run: Run = promisify(execFile)): Promise<void> {
  const c = macDictationCommand();
  try {
    await run(c.file, c.args, { cwd: c.cwd, timeout: c.timeoutMs });
  } catch (e) {
    const err = e as { stderr?: unknown; message?: unknown };
    throw new Error(macDictationFailure(String(err.stderr || err.message || '')));
  }
}

const MANUAL ='Or press Fn twice while the chat box has focus.';

/** What to tell the person when the click failed: the cause in words, the next step, no error code. */
export function macDictationFailure(stderr: string): string {
  if (/assistive access|not allowed|-25211|-1719/i.test(stderr)) {
    return `Allow VS Code to control this computer: System Settings, Privacy & Security, Accessibility, turn on VS Code, then try again. ${MANUAL}`;
  }
  if (/menu item not found|1728|Can.t get menu/i.test(stderr)) {
    // The script finds the menu and the item by their English names, so a Mac set to another language lands here too.
    return `Could not find Start Dictation in the Edit menu. Turn Dictation on in System Settings, Keyboard, then try again. Forge looks for the item by its English name, so it cannot find it when macOS is set to another language. ${MANUAL}`;
  }
  const detail = stderr.replace(/\s*\(-?\d+\)\s*$/m, '').trim();
  return `Could not start dictation: ${detail || 'unknown reason'}. ${MANUAL}`;
}
