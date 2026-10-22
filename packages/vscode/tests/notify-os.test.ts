import { describe, expect, it } from 'vitest';

import { soundCommand, toastCommand } from '../src/chat/notify-os.js';

describe('soundCommand', () => {
  it('has a command for each desktop platform and none for others', () => {
    expect(soundCommand('win32')?.command).toBe('powershell.exe');
    expect(soundCommand('darwin')?.command).toBe('afplay');
    expect(soundCommand('linux')?.command).toBe('paplay');
    expect(soundCommand('freebsd')).toBeUndefined();
  });
});

describe('toastCommand', () => {
  const hostile = `Done"; calc & $(touch x) \`id\` '`;

  it('never puts the text inside the script on Windows: it travels in environment variables', () => {
    const c = toastCommand('win32', 'Forge', hostile)!;
    expect(c.command).toBe('powershell.exe');
    expect(c.args.join(' ')).not.toContain('calc');
    expect(c.env).toEqual({ FORGE_TOAST_TITLE: 'Forge', FORGE_TOAST_BODY: hostile });
  });

  it('passes the text as separate arguments on macOS and Linux', () => {
    const m = toastCommand('darwin', 'Forge', hostile)!;
    expect(m.command).toBe('osascript');
    expect(m.args.slice(-2)).toEqual(['Forge', hostile]);
    expect(m.args.join(' ')).not.toContain('calc" ');
    const l = toastCommand('linux', 'Forge', hostile)!;
    expect(l.command).toBe('notify-send');
    expect(l.args).toEqual(['--', 'Forge', hostile]);
  });

  it('has none for an unknown platform', () => {
    expect(toastCommand('aix', 'a', 'b')).toBeUndefined();
  });
});
