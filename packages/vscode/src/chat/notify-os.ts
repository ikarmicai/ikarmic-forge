/**
 * Native sound and desktop toast for a finished run. The builders are pure; `runOs` spawns the helper.
 * Message text never goes inside a script string: it travels as arguments or environment variables,
 * so a reply title or file name cannot become code.
 */
import { spawn } from 'node:child_process';

export interface OsCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

const WIN_APP_ID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe';

const WIN_TOAST = [
  '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
  '$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
  "$n = $x.GetElementsByTagName('text')",
  '$n.Item(0).AppendChild($x.CreateTextNode($env:FORGE_TOAST_TITLE)) | Out-Null',
  '$n.Item(1).AppendChild($x.CreateTextNode($env:FORGE_TOAST_BODY)) | Out-Null',
  '$t = [Windows.UI.Notifications.ToastNotification]::new($x)',
  `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${WIN_APP_ID}').Show($t)`,
].join('; ');

const PS_FLAGS = ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command'];

export function soundCommand(platform: string): OsCommand | undefined {
  switch (platform) {
    case 'win32':
      return { command: 'powershell.exe', args: [...PS_FLAGS, '[System.Media.SystemSounds]::Asterisk.Play(); Start-Sleep -Milliseconds 800'] };
    case 'darwin':
      return { command: 'afplay', args: ['/System/Library/Sounds/Glass.aiff'] };
    case 'linux':
      return { command: 'paplay', args: ['/usr/share/sounds/freedesktop/stereo/complete.oga'] };
    default:
      return undefined;
  }
}

export function toastCommand(platform: string, title: string, body: string): OsCommand | undefined {
  switch (platform) {
    case 'win32':
      return { command: 'powershell.exe', args: [...PS_FLAGS, WIN_TOAST], env: { FORGE_TOAST_TITLE: title, FORGE_TOAST_BODY: body } };
    case 'darwin':
      return {
        command: 'osascript',
        args: ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run', title, body],
      };
    case 'linux':
      return { command: 'notify-send', args: ['--', title, body] };
    default:
      return undefined;
  }
}

/** Fire and forget: a missing helper (no paplay, no notify-send) is not an error worth showing. */
export function runOs(cmd: OsCommand | undefined): void {
  if (!cmd) return;
  try {
    const child = spawn(cmd.command, cmd.args, { stdio: 'ignore', windowsHide: true, env: { ...process.env, ...cmd.env } });
    child.on('error', () => {});
    child.unref();
  } catch {
    // ignore
  }
}
