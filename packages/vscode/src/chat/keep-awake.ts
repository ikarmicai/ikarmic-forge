/**
 * Keep the computer from sleeping while a chat run is working. A small helper process holds the wake lock
 * and is killed when the last run ends, so a crash of the extension host cannot leave a lock behind
 * (macOS and Linux holders also exit with their parent).
 */
import { spawn } from 'node:child_process';

import type { OsCommand } from './notify-os.js';

// ES_CONTINUOUS | ES_SYSTEM_REQUIRED = 0x80000001, renewed every 30 seconds by the loop. PowerShell reads the hex
// literal as a negative Int32 and the call fails, so the value is written in decimal with an explicit [uint32].
const WIN_HOLD = [
  "Add-Type -Namespace W -Name K -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'",
  'while ($true) { [W.K]::SetThreadExecutionState([uint32]2147483649) | Out-Null; Start-Sleep -Seconds 30 }',
].join('; ');

export function awakeCommand(platform: string, parentPid: number = process.pid): OsCommand | undefined {
  switch (platform) {
    case 'win32':
      return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', WIN_HOLD] };
    case 'darwin':
      return { command: 'caffeinate', args: ['-i', '-w', String(parentPid)] };
    case 'linux':
      return { command: 'systemd-inhibit', args: ['--what=idle:sleep', '--who=Ikarmic Forge', '--why=A chat run is working', 'sleep', 'infinity'] };
    default:
      return undefined;
  }
}

interface Holder {
  kill(): unknown;
  on(event: string, cb: () => void): unknown;
  unref(): unknown;
}

export class KeepAwake {
  private holders = 0;
  private child: Holder | undefined;

  constructor(
    private readonly platform: string = process.platform,
    private readonly spawnFn: typeof spawn = spawn,
    private readonly parentPid: number = process.pid
  ) {}

  /** Start holding; the returned function lets go (safe to call more than once). */
  acquire(): () => void {
    this.holders += 1;
    if (this.holders === 1) this.start();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holders -= 1;
      if (this.holders === 0) this.stop();
    };
  }

  dispose(): void {
    this.holders = 0;
    this.stop();
  }

  private start(): void {
    const cmd = awakeCommand(this.platform, this.parentPid);
    if (!cmd) return;
    try {
      const child = this.spawnFn(cmd.command, cmd.args, { stdio: 'ignore', windowsHide: true }) as unknown as Holder;
      child.on('error', () => {});
      child.unref();
      this.child = child;
    } catch {
      // no holder available (for example no systemd): the run still works, the machine may sleep
    }
  }

  private stop(): void {
    this.child?.kill();
    this.child = undefined;
  }
}
