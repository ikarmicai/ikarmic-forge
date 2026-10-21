import { describe, expect, it } from 'vitest';

import { clipboardTools, copyToClipboard, readClipboard, runCommand, type ClipboardCommand, type RunResult } from '../src/clipboard.js';

const names = (platform: NodeJS.Platform, env: NodeJS.ProcessEnv = {}) => clipboardTools(platform, env).map((t) => t.copy.cmd);

describe('clipboardTools', () => {
  it('picks the native tool per platform, and Wayland before X11 on Linux', () => {
    expect(names('darwin')).toEqual(['pbcopy']);
    expect(names('win32')).toEqual(['powershell']);
    expect(names('linux')).toEqual(['xclip', 'xsel']);
    expect(names('linux', { WAYLAND_DISPLAY: 'wayland-0' })).toEqual(['wl-copy', 'xclip', 'xsel']);
  });

  it('copy and paste use the same tool, and PowerShell is told to use UTF-8', () => {
    const [win] = clipboardTools('win32');
    expect(win!.copy.args.join(' ')).toContain('InputEncoding');
    expect(win!.paste.args.join(' ')).toContain('OutputEncoding');
    const [x] = clipboardTools('linux');
    expect(x!.paste.cmd).toBe(x!.copy.cmd);
  });
});

/** A runner that knows which programs are "installed". */
function fakeRunner(installed: Record<string, RunResult>) {
  const calls: Array<{ command: ClipboardCommand; input?: string }> = [];
  const run = async (command: ClipboardCommand, input?: string): Promise<RunResult> => {
    calls.push({ command, input });
    return installed[command.cmd] ?? { code: null, stdout: '' };
  };
  return { run, calls };
}

describe('copyToClipboard / readClipboard', () => {
  it('skips a tool that is not installed and uses the next one', async () => {
    const { run, calls } = fakeRunner({ xsel: { code: 0, stdout: '' } });
    const res = await copyToClipboard('héllo', { platform: 'linux', env: {}, run });
    expect(res).toEqual({ ok: true, tool: 'xsel' });
    expect(calls.map((c) => c.command.cmd)).toEqual(['xclip', 'xsel']);
    expect(calls[1]!.input).toBe('héllo');
  });

  it('reports a tool that fails, without trying the others', async () => {
    const { run, calls } = fakeRunner({ xclip: { code: 1, stdout: '' }, xsel: { code: 0, stdout: '' } });
    expect(await copyToClipboard('x', { platform: 'linux', env: {}, run })).toEqual({ ok: false, error: 'xclip failed (exit 1)' });
    expect(calls).toHaveLength(1);
  });

  it('says what to install on Linux, and just that nothing was found elsewhere', async () => {
    const { run } = fakeRunner({});
    expect(await copyToClipboard('x', { platform: 'linux', env: {}, run })).toMatchObject({ ok: false, error: expect.stringContaining('wl-clipboard, xclip or xsel') });
    expect(await copyToClipboard('x', { platform: 'darwin', env: {}, run })).toEqual({ ok: false, error: 'no clipboard tool found' });
  });

  it('reads the clipboard text', async () => {
    const { run } = fakeRunner({ pbpaste: { code: 0, stdout: 'from clipboard' } });
    expect(await readClipboard({ platform: 'darwin', run })).toEqual({ ok: true, tool: 'pbpaste', text: 'from clipboard' });
    expect(await readClipboard({ platform: 'linux', env: {}, run: fakeRunner({}).run })).toMatchObject({ ok: false });
  });
});

describe('runCommand (real processes)', () => {
  it('feeds stdin to the program and returns its stdout and exit code', async () => {
    const echo: ClipboardCommand = { cmd: process.execPath, args: ['-e', 'process.stdin.pipe(process.stdout)'] };
    expect(await runCommand(echo, 'round trip ✓')).toEqual({ code: 0, stdout: 'round trip ✓' });
    expect(await runCommand({ cmd: process.execPath, args: ['-e', 'process.exit(4)'] })).toMatchObject({ code: 4 });
  });

  it('gives code null for a program that is not installed', async () => {
    expect(await runCommand({ cmd: 'forge-no-such-program-xyz', args: [] }, 'x')).toEqual({ code: null, stdout: '' });
  });
});
