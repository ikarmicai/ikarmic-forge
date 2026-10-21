/**
 * Runs an agent shell command in a visible VS Code terminal and captures its
 * output through shell integration. The VS Code terminal API is abstracted
 * ({@link TerminalLike}) so this logic is unit-tested with fakes.
 *
 * A command that outlives its timeout is NOT killed: dev servers and watchers
 * are meant to keep running. The agent is told it is still running, and the next
 * command gets a fresh terminal so it does not queue behind it.
 */

export interface ShellExecutionLike {
  read(): AsyncIterable<string>;
}

export interface TerminalLike {
  shellIntegration?: { executeCommand(commandLine: string): ShellExecutionLike };
  /** Type into the terminal; used to send Ctrl+C when a run is stopped. */
  sendText?(text: string, addNewLine?: boolean): void;
}

export interface TerminalRunDeps {
  /** Get a visible terminal rooted at `cwd`; `fresh` forces a new one. */
  ensureTerminal(cwd: string, opts: { fresh: boolean }): TerminalLike;
  /** Resolve true once `t.shellIntegration` exists (false after `ms`). */
  waitForIntegration(t: TerminalLike, ms: number): Promise<boolean>;
  /** Subscribe to the end of one execution; the listener gets the exit code (undefined = unknown). */
  onExecutionEnd(exec: ShellExecutionLike, listener: (exitCode: number | undefined) => void): { dispose(): void };
}

export interface TerminalRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

// CSI (colors, cursor), OSC (title, VS Code shell-integration marks, ended by BEL or ST), lone ESC sequences.
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '').replace(/\r(?!\n)/g, '');
}

const INTEGRATION_WAIT_MS = 4000;
const READ_GRACE_MS = 1500;

export function createTerminalRunner(deps: TerminalRunDeps): (req: {
  command: string;
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  interruptOnTimeout?: boolean;
}) => Promise<TerminalRunResult | null> {
  let previousStillRunning = false;

  return async ({ command, cwd, timeoutMs, signal, interruptOnTimeout }) => {
    const terminal = deps.ensureTerminal(cwd, { fresh: previousStillRunning });
    previousStillRunning = false;
    if (!terminal.shellIntegration && !(await deps.waitForIntegration(terminal, INTEGRATION_WAIT_MS))) return null;
    const integration = terminal.shellIntegration;
    if (!integration) return null;

    const exec = integration.executeCommand(command);
    let output = '';
    const reader = (async () => {
      try {
        for await (const chunk of exec.read()) output += chunk;
      } catch {
        // stream ended abnormally: keep what we have
      }
    })();

    let sub: { dispose(): void } | undefined;
    const ended = new Promise<number | undefined>((resolve) => {
      sub = deps.onExecutionEnd(exec, resolve);
    });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      if (timeoutMs > 0) timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });

    let onAbort: (() => void) | undefined;
    const aborted = new Promise<'aborted'>((resolve) => {
      if (!signal) return;
      onAbort = () => resolve('aborted');
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });

    const outcome = await Promise.race([ended, timeout, aborted]);
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    sub?.dispose();

    if (outcome === 'aborted') {
      terminal.sendText?.('\u0003', false);
      previousStillRunning = true;
      return { exitCode: null, stdout: stripAnsi(output), stderr: '', timedOut: false };
    }

    if (outcome === 'timeout' && interruptOnTimeout) {
      terminal.sendText?.('\u0003', false);
      previousStillRunning = true;
      const seconds = Math.round(timeoutMs / 1000);
      return { exitCode: null, stdout: `${stripAnsi(output)}\n[forge: stopped after ${seconds}s]`, stderr: '', timedOut: true };
    }
    if (outcome === 'timeout') {
      previousStillRunning = true;
      const seconds = Math.round(timeoutMs / 1000);
      return {
        exitCode: null,
        stdout: `${stripAnsi(output)}\n[forge: still running in the Forge terminal after ${seconds}s; it was not stopped]`,
        stderr: '',
        timedOut: true,
      };
    }
    // The output stream can lag the end event slightly; give it a moment to drain.
    await Promise.race([reader, new Promise((r) => setTimeout(r, READ_GRACE_MS))]);
    return { exitCode: outcome ?? null, stdout: stripAnsi(output), stderr: '', timedOut: false };
  };
}
