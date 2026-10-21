/**
 * Desktop notification when Forge finishes and waits on you (`--notifications`).
 * `--notifications-command <cmd>` replaces the OS default; the message is passed
 * in the FORGE_NOTIFY_MESSAGE environment variable (and FORGE_NOTIFY_TITLE).
 */
import { spawn } from 'node:child_process';

export interface NotifyOptions {
  command?: string | null;
}

export type Notifier = (message: string) => void;

const TITLE = 'IKarmic AI Forge';

/** The OS-specific command line, or null when there is no known backend. */
export function defaultNotifyCommand(platform: NodeJS.Platform = process.platform): { cmd: string; args: string[] } | null {
  if (platform === 'darwin') {
    return { cmd: 'osascript', args: ['-e', 'display notification (system attribute "FORGE_NOTIFY_MESSAGE") with title (system attribute "FORGE_NOTIFY_TITLE")'] };
  }
  if (platform === 'linux') {
    return { cmd: 'notify-send', args: [TITLE, '--', ''] };
  }
  if (platform === 'win32') {
    return {
      cmd: 'powershell',
      args: ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($env:FORGE_NOTIFY_MESSAGE, $env:FORGE_NOTIFY_TITLE) | Out-Null'],
    };
  }
  return null;
}

/** Fire-and-forget; a missing backend or a failing command never affects the run. */
export function createNotifier(opts: NotifyOptions): Notifier {
  return (message: string): void => {
    const env = { ...process.env, FORGE_NOTIFY_MESSAGE: message, FORGE_NOTIFY_TITLE: TITLE };
    try {
      const child = opts.command
        ? spawn(opts.command, { shell: true, env, stdio: 'ignore' })
        : (() => {
            const d = defaultNotifyCommand();
            if (!d) return null;
            // notify-send takes the body as an argument rather than from the environment.
            const args = d.cmd === 'notify-send' ? [TITLE, message] : d.args;
            return spawn(d.cmd, args, { env, stdio: 'ignore' });
          })();
      child?.on('error', () => {});
      child?.unref();
    } catch {
      // Notifications are best effort.
    }
  };
}
