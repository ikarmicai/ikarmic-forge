import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { parseOptions, toAgentConfig } from '../../src/options.js';
import { Repl } from '../../src/repl.js';

// End-to-end observation run: "Build a CRM" in the terminal app's REPL on live MiniMax, Autonomous, then /changes and
// /revert of one file. It records every distinct screen line and copies the project and the session out before the
// temporary folders go. Runs only when asked for (never in CI):
//   FORGE_LIVE_CRM=1 [FORGE_CRM_OUT=D:/tmp/cli-crm1] npx vitest run tests/live/repl-crm-live.test.tsx
const root = path.resolve(__dirname, '../../../..');
if (process.env.FORGE_LIVE_CRM === '1' && !process.env.MINIMAX_API_KEY && existsSync(path.join(root, '.env.local'))) process.loadEnvFile(path.join(root, '.env.local'));
const live = process.env.FORGE_LIVE_CRM === '1' && !!process.env.MINIMAX_API_KEY;
const OUT = process.env.FORGE_CRM_OUT ?? 'D:/tmp/cli-minimax-crm1';
const PROMPT = process.env.FORGE_CRM_PROMPT ?? 'Build a CRM';
const CAP_MS = 45 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!live)('terminal app CRM end to end (live MiniMax)', () => {
  it('builds, lists what the run changed, and puts one file back', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'forge-cli-crm-'));
    const home = mkdtempSync(path.join(tmpdir(), 'forge-cli-crm-home-'));
    const sessionDir = path.join(home, '.forge', 'sessions');
    mkdirSync(sessionDir, { recursive: true });
    // Never the person's real ~/.forge (RB-4).
    const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, FORGE_SESSION_DIR: process.env.FORGE_SESSION_DIR };
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.FORGE_SESSION_DIR = sessionDir;
    mkdirSync(OUT, { recursive: true });
    const lines: string[] = [];
    const seen = new Set<string>();
    const started = Date.now();
    const model = { provider: 'minimax' as const, model: 'MiniMax-M3' };
    // The config `forge --auto --allow-destructive` builds, defaults included (no time limit, browser tools).
    const baseConfig = await toAgentConfig(parseOptions(['node', 'forge', '--cwd', cwd, '--auto', '--allow-destructive']).options, model, async () => false);
    const ui = render(<Repl baseConfig={baseConfig} model={model} onExit={() => undefined} sessionId="crm-live" sessionDir={sessionDir} />);
    const linesFile = path.join(OUT, 'screen-lines.txt');
    writeFileSync(linesFile, '');
    // Each new screen line goes to disk as it appears, so the run can be watched while it goes. Ink keeps every frame
    // it drew: the list is emptied each time, or a long run fills memory and spends its time on old frames.
    const record = () => {
      for (const line of (ui.lastFrame() ?? '').split('\n')) {
        const l = line.trimEnd();
        if (l && !seen.has(l)) {
          seen.add(l);
          const stamped = `[${Math.round((Date.now() - started) / 1000)}s] ${l}`;
          lines.push(stamped);
          appendFileSync(linesFile, stamped + '\n');
        }
      }
      ui.frames.length = 0;
    };
    const send = async (text: string) => {
      ui.stdin.write(text);
      await sleep(150);
      ui.stdin.write('\r');
      await sleep(300);
    };
    try {
      await sleep(500);
      await send(PROMPT);
      // The run is over when the REPL prints its "Done: <reason>" line (the header then reads DONE, not IDLE).
      while (Date.now() - started < CAP_MS) {
        record();
        if (lines.some((l) => /] {0,4}Done: /.test(l))) break;
        await sleep(1000);
      }
      await sleep(5000); // the list of changed files follows the Done line
      record();
      await send('/changes');
      await sleep(2000);
      record();
      const listing = ui.lastFrame() ?? '';
      const row = /^\s{2,}(\S+)\s.*by a command/m.exec(listing);
      if (row) {
        await send(`/revert ${row[1]}`);
        await sleep(3000);
        record();
        const note = `[revert] ${row[1]} exists after /revert: ${existsSync(path.join(cwd, row[1]!))}`;
        lines.push(note);
        appendFileSync(linesFile, note + '\n');
      }
      expect(lines.some((l) => / files? changed \+\d+/.test(l))).toBe(true);
    } finally {
      const skip = (s: string) => !s.includes(`${path.sep}node_modules`);
      cpSync(cwd, path.join(OUT, 'project'), { recursive: true, filter: skip });
      if (existsSync(sessionDir)) cpSync(sessionDir, path.join(OUT, 'sessions'), { recursive: true });
      writeFileSync(path.join(OUT, 'files.txt'), readdirSync(cwd, { recursive: true }).map(String).filter((p) => !p.includes('node_modules')).sort().join('\n'));
      ui.unmount();
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      // Copied out above; a server the run left could still hold a file on Windows, so retry and leave it rather than fail.
      for (const dir of [cwd, home]) rmSync(dir, { recursive: true, force: true, maxRetries: 30, retryDelay: 200 });
    }
  }, CAP_MS + 5 * 60_000);
});
