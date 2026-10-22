/**
 * Open a web page in the user's browser. The address is passed as an argument, never through a shell, and only
 * http and https addresses are opened. A missing helper is not an error: the caller prints the address as well.
 */
import { spawn } from 'node:child_process';

export function browserCommand(platform: string, url: string): { command: string; args: string[] } | undefined {
  if (!/^https?:\/\//i.test(url)) return undefined;
  switch (platform) {
    case 'win32':
      return { command: 'explorer.exe', args: [url] };
    case 'darwin':
      return { command: 'open', args: [url] };
    default:
      return { command: 'xdg-open', args: [url] };
  }
}

export function openInBrowser(url: string): void {
  const cmd = browserCommand(process.platform, url);
  if (!cmd) return;
  try {
    const child = spawn(cmd.command, cmd.args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // the address was printed, so the user can open it by hand
  }
}
