import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { formatRunChanges } from '../src/run-changes.js';
import { Repl } from '../src/repl.js';
import { MockLanguageModelV1 } from './mock-provider.js';

// The terminal app had no list of what a run changed: the VS Code bar's list and Undo, through the same core code.
let cwd: string;
let sessionDir: string;
let saved: { key: string | undefined; sessions: string | undefined };
beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'forge-runchg-repl-'));
  sessionDir = mkdtempSync(path.join(tmpdir(), 'forge-runchg-sessions-'));
  saved = { key: process.env.OPENAI_API_KEY, sessions: process.env.FORGE_SESSION_DIR };
  process.env.OPENAI_API_KEY = saved.key ?? 'test-key';
  process.env.FORGE_SESSION_DIR = sessionDir; // never the person's real ~/.forge
});
afterEach(() => {
  for (const [name, value] of [['OPENAI_API_KEY', saved.key], ['FORGE_SESSION_DIR', saved.sessions]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  for (const dir of [cwd, sessionDir]) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
    } catch (err) {
      if (process.platform !== 'win32' || (err as NodeJS.ErrnoException).code !== 'EBUSY') throw err;
    }
  }
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAKE = `node -e "const fs=require('fs');const nl=String.fromCharCode(10);fs.writeFileSync('made.txt','a'+nl+'b'+nl);fs.appendFileSync('notes.md','more'+nl)"`;

async function setup() {
  writeFileSync(path.join(cwd, 'notes.md'), 'first\n');
  const mock = new MockLanguageModelV1('m');
  mock.pushResponse({ toolCalls: [{ name: 'run_command', args: { command: MAKE } }], promptTokens: 5, completionTokens: 5 });
  mock.pushResponse({ text: 'RUN-DONE', finishReason: 'stop', promptTokens: 5, completionTokens: 5 });
  const ui = render(
    <Repl
      baseConfig={{ model: { provider: 'openai', model: 'gpt-4o' }, modelFactory: (() => mock) as never, auto: true, allowDestructive: true, disableMemory: true, cwd, maxIterations: 4 }}
      model={{ provider: 'openai', model: 'gpt-4o' }}
      onExit={() => undefined}
      sessionId="s1"
      sessionDir={sessionDir}
    />
  );
  await sleep(300);
  const send = async (text: string) => {
    ui.stdin.write(text);
    await sleep(100);
    ui.stdin.write('\r');
    await sleep(150);
  };
  // Sends, then waits for text that was not on the screen before sending (RB-153): counted before the send.
  const sendFor = async (input: string, text: string, ms = 20_000) => {
    const count = (f: string) => f.split(text).length - 1;
    const start = count(ui.lastFrame() ?? "");
    await send(input);
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (count(ui.lastFrame() ?? "") > start) return ui.lastFrame() ?? "";
      await sleep(40);
    }
    throw new Error(`timed out waiting for "${text}"; last frame:
${ui.lastFrame()}`);
  };
  return { ui, sendFor };
}

describe('the terminal app lists what a run changed, and puts files back', () => {
  it('lists a file a command made and one it changed after the run, and /revert all puts both back', async () => {
    const { sendFor } = await setup();
    const frame = await sendFor('make the files', '2 files changed');
    expect(frame).toContain('made.txt');
    expect(frame).toContain('new, by a command');
    expect(frame).toContain('notes.md');
    expect(frame).toContain('/revert <file> or /revert all');

    await sendFor('/revert made.txt', 'Put back made.txt as the run found it.');
    expect(existsSync(path.join(cwd, 'made.txt'))).toBe(false);

    await sendFor('/revert nope.txt','nope.txt is not in the list');

    await sendFor('/revert all', 'Put back notes.md as the run found it.');
    expect(existsSync(path.join(cwd, 'made.txt'))).toBe(false);
    expect(readFileSync(path.join(cwd, 'notes.md'), 'utf8')).toBe('first\n');

    await sendFor('/changes', 'nothing else from the last run is left to review');
  }, 60_000);

  it('/changes before any run, and /revert with nothing to put back, say so in words', async () => {
    const { sendFor } = await setup();
    await sendFor('/changes', 'The last run changed no files.');
    await sendFor('/revert', 'Usage: /revert <file> or /revert all');
  }, 30_000);
});

describe('formatRunChanges', () => {
  it('says Binary, Large file, and when a file cannot be put back, in words', () => {
    const text = formatRunChanges({
      startedAtIso: '',
      cwd: '',
      store: undefined as never,
      earlier: new Map(),
      undone: 0,
      files: [
        { path: 'shot.png', status: 'created', added: 0, removed: 0, byCommand: true, binary: true },
        { path: 'big.log', status: 'modified', added: 0, removed: 0, byCommand: true, undoable: false, large: true },
        { path: 'src/a.ts', status: 'modified', added: 3, removed: 1 },
      ],
    });
    expect(text).toBe(
      [
        '3 files changed +3 −1',
        '  shot.png  Binary  new, by a command',
        '  big.log  Large file  by a command, no earlier copy, so it cannot be put back',
        '  src/a.ts  +3 −1',
        '/revert <file> or /revert all puts them back as the run found them; /changes shows this list again.',
      ].join('\n')
    );
  });
});
