import * as vscode from 'vscode';

import type { CommandRunner } from '@ikarmic/forge-core';

import { createTerminalRunner, type ShellExecutionLike, type TerminalLike, type TerminalRunDeps } from './terminal-core.js';

/**
 * Shell integration landed in VS Code 1.93, after our 1.85 engine floor and the
 * `@types/vscode` we build against, so it is reached through these structural
 * types and feature-detected. Without it the runner declines and core falls
 * back to a hidden child process.
 */
interface IntegrationWindow {
  onDidChangeTerminalShellIntegration?: (
    listener: (e: { terminal: vscode.Terminal }) => void
  ) => vscode.Disposable;
  onDidEndTerminalShellExecution?: (
    listener: (e: { execution: ShellExecutionLike; exitCode: number | undefined }) => void
  ) => vscode.Disposable;
}

const TERMINAL_NAME = 'Forge';

/** The encoding line for a Windows terminal whose shell is PowerShell; nothing for any other shell or platform. */
export function powershellSetup(platform: NodeJS.Platform, shell: string): string | undefined {
  if (platform !== 'win32') return undefined;
  return /(?:^|[\\/])(?:pwsh|powershell)(?:\.exe)?$/i.test(shell.trim()) ? '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8' : undefined;
}

export function createVsCodeCommandRunner(): { runner: CommandRunner; dispose(): void } {
  let terminal: vscode.Terminal | undefined;
  const win = vscode.window as unknown as IntegrationWindow;

  const deps: TerminalRunDeps = {
    ensureTerminal(cwd, { fresh }) {
      if (fresh || !terminal || terminal.exitStatus !== undefined) {
        // Windows with cmd as the terminal: never run a same-named program the repository ships in its root (core shell-env.ts).
        terminal = vscode.window.createTerminal({ name: TERMINAL_NAME, cwd, ...(process.platform === 'win32' ? { env: { NoDefaultCurrentDirectoryInExePath: '1' } } : {}) });
      }
      terminal.show(true); // reveal without stealing focus from the chat
      return terminal as unknown as TerminalLike;
    },

    waitForIntegration(t, ms) {
      const target = t as unknown as vscode.Terminal;
      if (!win.onDidChangeTerminalShellIntegration) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          sub.dispose();
          resolve(false);
        }, ms);
        const sub = win.onDidChangeTerminalShellIntegration!((e) => {
          if (e.terminal !== target) return;
          clearTimeout(timer);
          sub.dispose();
          resolve(true);
        });
      });
    },

    // PowerShell in a Windows terminal decodes piped program output with the OEM code page (RB-160).
    setupCommand: () => powershellSetup(process.platform, vscode.env.shell),

    onExecutionEnd(exec, listener) {
      if (!win.onDidEndTerminalShellExecution) return { dispose: () => undefined };
      return win.onDidEndTerminalShellExecution((e) => {
        if (e.execution === exec) listener(e.exitCode);
      });
    },
  };

  return {
    runner: createTerminalRunner(deps),
    dispose: () => terminal?.dispose(),
  };
}
