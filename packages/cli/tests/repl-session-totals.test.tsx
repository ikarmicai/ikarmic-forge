import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Repl } from '../src/repl.js';
import { MockLanguageModelV1 } from './mock-provider.js';

// The terminal app's saved session and token counts, found in the live "Build a CRM" run of 2026-11-06.
let cwd: string;
let sessionDir: string;
let saved: { key: string | undefined; sessions: string | undefined };
beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'forge-totals-repl-'));
  sessionDir = mkdtempSync(path.join(tmpdir(), 'forge-totals-sessions-'));
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


// Found in the same live run: every save wrote "now" as the session's createdAt, so its start date was lost.
describe('the saved session', () => {
  // CI on macOS, 2026-11-06: /sessions listed the REPL's sessionDir while saves went to whatever FORGE_SESSION_DIR said
  // when the run ended, so a run that ended after the next test had moved it saved into that test's folder.
  it('is saved where the REPL lists sessions, whatever FORGE_SESSION_DIR says by the time the run ends', async () => {
    const { sendFor } = await setup();
    const elsewhere = mkdtempSync(path.join(tmpdir(), 'forge-totals-elsewhere-'));
    process.env.FORGE_SESSION_DIR = elsewhere;
    try {
      await sendFor('make the files', 'Done:');
      await sleep(500);
      expect(existsSync(path.join(sessionDir, 's1.json'))).toBe(true);
      expect(existsSync(path.join(elsewhere, 's1.json'))).toBe(false);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps the date of its first save', async () => {
    const { sendFor } = await setup();
    await sendFor('make the files', 'Done:');
    await sleep(500); // the save follows the run
    const file = path.join(sessionDir, 's1.json');
    const first = JSON.parse(readFileSync(file, 'utf8')).createdAt as string;
    await sleep(20);
    await sendFor('again', 'Done:');
    await sleep(500); // the save follows the run
    const later = JSON.parse(readFileSync(file, 'utf8'));
    expect(later.createdAt).toBe(first);
    expect(later.updatedAt > first).toBe(true);
  }, 60_000);
});

// Same live run: the Done line read "↑0 ↓0" (it read React state from when the run started), and each run's usage
// replaced the session's totals instead of adding to them, in the footer and in the saved session.
describe('token counts', () => {
  it('shows this run on the Done line and adds every run to the session totals', async () => {
    const { sendFor } = await setup(); // the first turn makes two model calls of 5 in and 5 out
    const frame = await sendFor('make the files', 'Done:');
    expect(frame).toMatch(/Done: [^\n]*↑10 ↓10/);
    await sleep(500);
    const file = path.join(sessionDir, 's1.json');
    expect(JSON.parse(readFileSync(file, 'utf8')).totalInputTokens).toBe(10);
    await sendFor('again', 'Done:'); // the mock's default reply reports no usage
    await sleep(500);
    expect(JSON.parse(readFileSync(file, 'utf8')).totalInputTokens).toBe(10);
  }, 60_000);
});
