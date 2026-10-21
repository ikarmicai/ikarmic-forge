import { describe, expect, it } from 'vitest';

import { createTerminalRunner, stripAnsi, type ShellExecutionLike, type TerminalLike, type TerminalRunDeps } from '../src/chat/terminal-core.js';

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

describe('stripAnsi', () => {
  it('removes colors, cursor moves and OSC 633 marks', () => {
    expect(stripAnsi(`${ESC}[31mred${ESC}[0m ${ESC}]633;C${BEL}ok${ESC}]633;D;0${BEL}`)).toBe('red ok');
    expect(stripAnsi(`${ESC}[2K${ESC}[1Gline`)).toBe('line');
  });
  it('drops bare carriage returns (progress redraws) but keeps CRLF', () => {
    expect(stripAnsi('a\rb\r\nc')).toBe('ab\r\nc');
  });
});

interface FakeRun {
  chunks: string[];
  endsWith?: number | undefined | 'never';
  delayMs?: number;
}

function harness(runs: FakeRun[], opts: { integration?: boolean | 'late' } = {}) {
  const created: Array<{ cwd: string; fresh: boolean }> = [];
  const commands: string[] = [];
  const sent: string[] = [];
  const endListeners = new Map<ShellExecutionLike, (code: number | undefined) => void>();
  let next = 0;

  const makeTerminal = (): TerminalLike => {
    const t: TerminalLike = { sendText: (text) => void sent.push(text) };
    if (opts.integration !== false && opts.integration !== 'late') attach(t);
    lateTerminal = t;
    return t;
  };
  let lateTerminal: TerminalLike | undefined;
  const attach = (t: TerminalLike): void => {
    t.shellIntegration = {
      executeCommand(cmd: string): ShellExecutionLike {
        commands.push(cmd);
        const run = runs[next++]!;
        const exec: ShellExecutionLike = {
          async *read() {
            for (const c of run.chunks) yield c;
          },
        };
        if (run.endsWith !== 'never') {
          setTimeout(() => endListeners.get(exec)?.(run.endsWith), run.delayMs ?? 5);
        }
        return exec;
      },
    };
  };

  const deps: TerminalRunDeps = {
    ensureTerminal: (cwd, o) => {
      created.push({ cwd, fresh: o.fresh });
      return makeTerminal();
    },
    waitForIntegration: async (t) => {
      if (opts.integration === 'late') {
        attach(t);
        return true;
      }
      return false;
    },
    onExecutionEnd: (exec, listener) => {
      endListeners.set(exec, listener);
      return { dispose: () => endListeners.delete(exec) };
    },
  };
  return { deps, created, commands, sent };
}

describe('createTerminalRunner', () => {
  it('captures output and the exit code', async () => {
    const h = harness([{ chunks: [`${ESC}[32mhello${ESC}[0m\r\n`, 'world\r\n'], endsWith: 0 }]);
    const res = await createTerminalRunner(h.deps)({ command: 'echo hi', cwd: '/w', timeoutMs: 5000 });
    expect(res).toEqual({ exitCode: 0, stdout: 'hello\r\nworld\r\n', stderr: '', timedOut: false });
    expect(h.commands).toEqual(['echo hi']);
    expect(h.created).toEqual([{ cwd: '/w', fresh: false }]);
  });

  it('reports a failing exit code', async () => {
    const h = harness([{ chunks: ['boom'], endsWith: 2 }]);
    expect((await createTerminalRunner(h.deps)({ command: 'x', cwd: '/w', timeoutMs: 5000 }))!.exitCode).toBe(2);
  });

  it('an unknown exit code becomes null', async () => {
    const h = harness([{ chunks: [], endsWith: undefined }]);
    expect((await createTerminalRunner(h.deps)({ command: 'x', cwd: '/w', timeoutMs: 5000 }))!.exitCode).toBeNull();
  });

  it('interrupts the command with Ctrl+C and returns when the run is aborted', async () => {
    const h = harness([{ chunks: ['working\r\n'], endsWith: 'never' }]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    const res = await createTerminalRunner(h.deps)({ command: 'npm test', cwd: '/w', timeoutMs: 60_000, signal: controller.signal });
    expect(h.sent).toEqual(['\u0003']);
    expect(res!.exitCode).toBeNull();
    expect(res!.timedOut).toBe(false);
    expect(res!.stdout).toContain('working');
  });

  it('interrupts a command that outlives its timeout when the caller asks for it (verification checks)', async () => {
    const h = harness([{ chunks: ['still going\r\n'], endsWith: 'never' }]);
    const res = await createTerminalRunner(h.deps)({ command: 'npm test', cwd: '/w', timeoutMs: 30, interruptOnTimeout: true });
    expect(h.sent).toEqual(['\u0003']);
    expect(res!.timedOut).toBe(true);
    expect(res!.stdout).toContain('stopped after');
    expect(res!.stdout).not.toContain('was not stopped');
  });

  it('returns null (caller falls back) when shell integration never appears', async () => {
    const h = harness([], { integration: false });
    expect(await createTerminalRunner(h.deps)({ command: 'x', cwd: '/w', timeoutMs: 5000 })).toBeNull();
  });

  it('waits for shell integration that shows up late', async () => {
    const h = harness([{ chunks: ['ok'], endsWith: 0 }], { integration: 'late' });
    expect((await createTerminalRunner(h.deps)({ command: 'x', cwd: '/w', timeoutMs: 5000 }))!.stdout).toBe('ok');
  });

  it('does not kill a command that outlives its timeout, says so, and uses a fresh terminal next time', async () => {
    const h = harness([
      { chunks: ['server listening on 3000\r\n'], endsWith: 'never' },
      { chunks: ['second'], endsWith: 0 },
    ]);
    const run = createTerminalRunner(h.deps);
    const first = await run({ command: 'npm run dev', cwd: '/w', timeoutMs: 30 });
    expect(first).toMatchObject({ exitCode: null, timedOut: true });
    expect(first!.stdout).toContain('server listening on 3000');
    expect(first!.stdout).toContain('still running in the Forge terminal');
    const second = await run({ command: 'npm test', cwd: '/w', timeoutMs: 5000 });
    expect(second!.stdout).toBe('second');
    expect(h.created.map((c) => c.fresh)).toEqual([false, true]);
  });

  it('a timeout of 0 means wait indefinitely for the end event', async () => {
    const h = harness([{ chunks: ['x'], endsWith: 0, delayMs: 40 }]);
    expect((await createTerminalRunner(h.deps)({ command: 'x', cwd: '/w', timeoutMs: 0 }))!.exitCode).toBe(0);
  });
});
