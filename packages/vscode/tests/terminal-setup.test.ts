/** Which terminals get the UTF-8 encoding line before Forge's first command (RB-160). */
import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({ window: {}, env: { shell: '' } }));

import { powershellSetup } from '../src/chat/terminal-runner.js';

describe('powershellSetup', () => {
  it('sets UTF-8 output for PowerShell 7 and Windows PowerShell on Windows', () => {
    for (const shell of [String.raw`C:\Program Files\PowerShell\7\pwsh.exe`, String.raw`C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe`, 'pwsh', 'PowerShell.EXE']) {
      expect(powershellSetup('win32', shell), shell).toBe('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8');
    }
  });

  it('adds nothing for cmd, Git Bash, or any shell off Windows', () => {
    expect(powershellSetup('win32', String.raw`C:\WINDOWS\System32\cmd.exe`)).toBeUndefined();
    expect(powershellSetup('win32', String.raw`C:\Program Files\Git\bin\bash.exe`)).toBeUndefined();
    expect(powershellSetup('win32', String.raw`C:\tools\not-pwsh-really.exe`)).toBeUndefined();
    expect(powershellSetup('darwin', '/usr/local/bin/pwsh')).toBeUndefined();
    expect(powershellSetup('linux', '/bin/bash')).toBeUndefined();
  });
});
