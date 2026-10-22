import { describe, expect, it } from 'vitest';

import { KeepAwake, awakeCommand } from '../src/chat/keep-awake.js';

function fakeSpawn() {
  const started: Array<{ command: string; killed: boolean }> = [];
  const spawnFn = ((command: string) => {
    const child = { command, killed: false, kill() { child.killed = true; }, on() {}, unref() {} };
    started.push(child);
    return child;
  }) as never;
  return { started, spawnFn };
}

describe('awakeCommand', () => {
  it('writes the Windows flags as an unsigned decimal: PowerShell reads 0x80000001 as a negative Int32', () => {
    const script = awakeCommand('win32')!.args.join(' ');
    expect(script).toContain('[uint32]2147483649');
    expect(script).not.toContain('0x8');
  });

  it('has a holder for each desktop platform', () => {
    expect(awakeCommand('win32')?.command).toBe('powershell.exe');
    expect(awakeCommand('darwin', 42)?.args).toEqual(['-i', '-w', '42']);
    expect(awakeCommand('linux')?.command).toBe('systemd-inhibit');
    expect(awakeCommand('aix')).toBeUndefined();
  });
});

describe('KeepAwake', () => {
  it('holds one process for any number of overlapping runs and drops it with the last one', () => {
    const { started, spawnFn } = fakeSpawn();
    const k = new KeepAwake('linux', spawnFn, 1);
    const a = k.acquire();
    const b = k.acquire();
    expect(started).toHaveLength(1);
    a();
    expect(started[0]!.killed).toBe(false);
    b();
    expect(started[0]!.killed).toBe(true);
  });

  it('a release called twice counts once', () => {
    const { started, spawnFn } = fakeSpawn();
    const k = new KeepAwake('linux', spawnFn, 1);
    const a = k.acquire();
    const b = k.acquire();
    a();
    a();
    expect(started[0]!.killed).toBe(false);
    b();
    expect(started[0]!.killed).toBe(true);
  });

  it('does nothing on a platform without a holder', () => {
    const { started, spawnFn } = fakeSpawn();
    const k = new KeepAwake('aix', spawnFn, 1);
    k.acquire()();
    expect(started).toHaveLength(0);
  });

  it('dispose drops the hold', () => {
    const { started, spawnFn } = fakeSpawn();
    const k = new KeepAwake('linux', spawnFn, 1);
    k.acquire();
    k.dispose();
    expect(started[0]!.killed).toBe(true);
  });
});
