/**
 * System clipboard access for `/copy` and `/paste`, through whatever command-line tool the
 * platform has. Each candidate is tried in order; one that is not installed is skipped.
 */
import { spawn } from 'node:child_process';

export interface ClipboardCommand {
  cmd: string;
  args: string[];
}

export interface ClipboardTool {
  copy: ClipboardCommand;
  paste: ClipboardCommand;
}

export interface RunResult {
  /** Process exit code; null when the program could not be started (not installed). */
  code: number | null;
  stdout: string;
}

export type CommandRunner = (command: ClipboardCommand, input?: string) => Promise<RunResult>;

const PS_UTF8_OUT = '[Console]::OutputEncoding=[Text.Encoding]::UTF8;';
const PS_UTF8_IN = '[Console]::InputEncoding=[Text.Encoding]::UTF8;';

/** Candidate tools for `platform`, best first. */
export function clipboardTools(platform: NodeJS.Platform, env: NodeJS.ProcessEnv = process.env): ClipboardTool[] {
  if (platform === 'darwin') return [{ copy: { cmd: 'pbcopy', args: [] }, paste: { cmd: 'pbpaste', args: [] } }];
  if (platform === 'win32') {
    return [
      {
        copy: { cmd: 'powershell', args: ['-NoProfile', '-Command', `${PS_UTF8_IN} Set-Clipboard -Value ([Console]::In.ReadToEnd())`] },
        paste: { cmd: 'powershell', args: ['-NoProfile', '-Command', `${PS_UTF8_OUT} Get-Clipboard -Raw`] },
      },
    ];
  }
  const tools: ClipboardTool[] = [];
  if (env.WAYLAND_DISPLAY) tools.push({ copy: { cmd: 'wl-copy', args: [] }, paste: { cmd: 'wl-paste', args: ['--no-newline'] } });
  tools.push(
    { copy: { cmd: 'xclip', args: ['-selection', 'clipboard'] }, paste: { cmd: 'xclip', args: ['-selection', 'clipboard', '-o'] } },
    { copy: { cmd: 'xsel', args: ['--clipboard', '--input'] }, paste: { cmd: 'xsel', args: ['--clipboard', '--output'] } }
  );
  return tools;
}

/** Run a command, optionally feeding `input` to stdin. A missing program gives `code: null`. */
export const runCommand: CommandRunner = (command, input) =>
  new Promise((resolve) => {
    const child = spawn(command.cmd, command.args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    let stdout = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.on('error', () => resolve({ code: null, stdout: '' }));
    child.on('close', (code) => resolve({ code, stdout }));
    child.stdin.on('error', () => undefined); // the tool may exit before reading everything
    child.stdin.end(input ?? '');
  });

export type ClipboardResult<T> = ({ ok: true; tool: string } & T) | { ok: false; error: string };

const NONE_FOUND = (platform: NodeJS.Platform): string =>
  platform === 'linux' ? 'no clipboard tool found (install wl-clipboard, xclip or xsel)' : 'no clipboard tool found';

export async function copyToClipboard(
  text: string,
  opts: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; run?: CommandRunner } = {}
): Promise<ClipboardResult<{}>> {
  const platform = opts.platform ?? process.platform;
  const run = opts.run ?? runCommand;
  for (const tool of clipboardTools(platform, opts.env)) {
    const res = await run(tool.copy, text);
    if (res.code === null) continue; // not installed
    if (res.code === 0) return { ok: true, tool: tool.copy.cmd };
    return { ok: false, error: `${tool.copy.cmd} failed (exit ${res.code})` };
  }
  return { ok: false, error: NONE_FOUND(platform) };
}

export async function readClipboard(
  opts: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; run?: CommandRunner } = {}
): Promise<ClipboardResult<{ text: string }>> {
  const platform = opts.platform ?? process.platform;
  const run = opts.run ?? runCommand;
  for (const tool of clipboardTools(platform, opts.env)) {
    const res = await run(tool.paste);
    if (res.code === null) continue;
    if (res.code === 0) return { ok: true, tool: tool.paste.cmd, text: res.stdout };
    return { ok: false, error: `${tool.paste.cmd} failed (exit ${res.code})` };
  }
  return { ok: false, error: NONE_FOUND(platform) };
}
