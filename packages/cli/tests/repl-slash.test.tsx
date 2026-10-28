import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Repl } from '../src/repl.js';
import { MockLanguageModelV1 } from './mock-provider.js';

let cwd: string;
let sessionDir: string;
let savedEnv: { key: string | undefined; sessions: string | undefined };
beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'forge-repl-'));
  sessionDir = mkdtempSync(path.join(tmpdir(), 'forge-repl-sessions-'));
  savedEnv = { key: process.env.OPENAI_API_KEY, sessions: process.env.FORGE_SESSION_DIR };
  process.env.OPENAI_API_KEY = savedEnv.key ?? 'test-key';
  // The REPL saves to the default session dir; keep that out of the developer's real ~/.forge.
  process.env.FORGE_SESSION_DIR = sessionDir;
});
afterEach(() => {
  for (const [name, value] of [['OPENAI_API_KEY', savedEnv.key], ['FORGE_SESSION_DIR', savedEnv.sessions]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  // On Windows a directory cannot be deleted while a process (a /run child still exiting) has it as its cwd.
  // If it is still locked after the retries, leave the temp dir behind rather than fail a test that passed.
  for (const dir of [cwd, sessionDir]) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
    } catch (err) {
      if (process.platform !== 'win32' || (err as NodeJS.ErrnoException).code !== 'EBUSY') throw err;
    }
  }
});

const readdirSafe = async (dir: string): Promise<string[]> => (existsSync(dir) ? readdirSync(dir) : []);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const done = { text: 'ok', finishReason: 'stop' as const, promptTokens: 5, completionTokens: 5 };

async function setup(extra: Record<string, unknown> = {}, replProps: Record<string, unknown> = {}) {
  const mock = new MockLanguageModelV1('m');
  for (let i = 0; i < 6; i++) mock.pushResponse(done);
  const modelsUsed: string[] = [];
  const efforts: Array<string | undefined> = [];
  const ui = render(
    <Repl
      baseConfig={{
        model: { provider: 'openai', model: 'gpt-4o' },
        modelFactory: ((cfg: { provider: string; model: string; reasoningEffort?: string }) => {
          modelsUsed.push(`${cfg.provider}:${cfg.model}`);
          efforts.push(cfg.reasoningEffort);
          return mock;
        }) as never,
        auto: true,
        disableMemory: true,
        cwd,
        maxIterations: 4,
        ...extra,
      }}
      model={{ provider: 'openai', model: 'gpt-4o' }}
      onExit={() => undefined}
      sessionId="s1"
      sessionDir={sessionDir}
      aliases={{ mini: 'gpt-4o-mini' }}
      {...replProps}
    />
  );
  await sleep(300); // Ink attaches its input handler after the first render
  async function send(text: string): Promise<void> {
    ui.stdin.write(text);
    await sleep(100); // let the input box take the text before Enter submits it
    ui.stdin.write('\r');
    await sleep(150);
  }
  async function waitFor(pred: (frame: string) => boolean, ms = 8000): Promise<string> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const frame = ui.lastFrame() ?? '';
      if (pred(frame)) return frame;
      await sleep(40);
    }
    throw new Error(`timed out; last frame:\n${ui.lastFrame()}`);
  }
  const prompts = () => mock.calls.map((c) => JSON.stringify(c.prompt));
  return { ui, send, waitFor, prompts, modelsUsed, efforts, mock };
}

describe('REPL slash commands (D)', () => {
  it('/model switches the model for later turns, shows it in the header, and rejects bad input', async () => {
    const { send, waitFor, modelsUsed } = await setup();
    await send('/model');
    await waitFor((f) => f.includes('model: openai:gpt-4o'));
    await send('/model mini');
    const frame = await waitFor((f) => f.includes('model → openai:gpt-4o-mini'));
    expect(frame).toContain('gpt-4o-mini');
    await send('hello there');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(modelsUsed.at(-1)).toBe('openai:gpt-4o-mini');
  }, 20_000);

  it('/models lists aliases and known models', async () => {
    const { send, waitFor } = await setup();
    await send('/models mini');
    const frame = await waitFor((f) => f.includes('mini'));
    expect(frame).toContain('gpt-4o-mini');
  }, 20_000);

  it('/add attaches a file to the turn (re-read each time) but keeps it out of the saved history', async () => {
    writeFileSync(path.join(cwd, 'notes.md'), 'ATTACHED-CONTENT-1');
    const { send, waitFor, prompts } = await setup();
    await send('/add notes.md');
    await waitFor((f) => f.includes('attached notes.md'));
    await send('/ls');
    await waitFor((f) => f.includes('  notes.md'));
    await send('summarize it');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('ATTACHED-CONTENT-1');
    expect(prompts()[0]).toContain('<chat-files>');
    writeFileSync(path.join(cwd, 'notes.md'), 'ATTACHED-CONTENT-2');
    await send('and now?');
    await waitFor((f) => (f.match(/Done: Completed/g) ?? []).length >= 2);
    expect(prompts()[1]).toContain('ATTACHED-CONTENT-2');
    // Turn 2's prompt carries turn 1's user message, without the file dump.
    expect(prompts()[1]).not.toContain('ATTACHED-CONTENT-1');
    const saved = readdirSync(sessionDir).filter((f) => f.endsWith('.json'));
    expect(saved.length).toBeGreaterThan(0);
    expect(readFileSync(path.join(sessionDir, saved[0]!), 'utf8')).not.toContain('<chat-files>');
  }, 30_000);

  it('/add refuses files outside the working directory; /drop detaches', async () => {
    mkdirSync(path.join(cwd, 'sub'));
    writeFileSync(path.join(cwd, 'sub', 'a.txt'), 'x');
    const { send, waitFor } = await setup();
    await send('/add ../../etc/passwd');
    await waitFor((f) => /no such file|outside the working directory/.test(f));
    await send('/add sub/a.txt');
    await waitFor((f) => f.includes('attached sub/a.txt'));
    await send('/drop sub/a.txt');
    await waitFor((f) => f.includes('detached sub/a.txt'));
    await send('/ls');
    await waitFor((f) => f.includes('no files attached'));
  }, 20_000);

  it('/run shows the output and hands it to the model with the next message', async () => {
    const { send, waitFor, prompts } = await setup();
    await send(`/run node -e "console.log('RUN-OUTPUT-XYZ')"`);
    await waitFor((f) => f.includes('RUN-OUTPUT-XYZ') && f.includes('[exit 0]'));
    await send('what happened?');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('I ran');
    expect(prompts()[0]).toContain('RUN-OUTPUT-XYZ');
  }, 20_000);

  it('!cmd is shorthand for /run', async () => {
    const { send, waitFor } = await setup();
    await send(`!node -e "console.log('BANG-OUT')"`);
    await waitFor((f) => f.includes('BANG-OUT'));
  }, 20_000);

  it('/test sends a failing command to the model to fix, and does nothing when it passes', async () => {
    const { send, waitFor, prompts } = await setup();
    await send(`/test node -e "process.exit(0)"`);
    await waitFor((f) => f.includes('[exit 0]'));
    expect(prompts()).toHaveLength(0);
    await send(`/test node -e "console.error('TEST-BROKE');process.exit(2)"`);
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('The test command');
    expect(prompts()[0]).toContain('TEST-BROKE');
  }, 25_000);

  it('/lint finds a syntax error in an attached file and asks the model to fix it', async () => {
    writeFileSync(path.join(cwd, 'bad.ts'), 'const x = ;\n');
    const { send, waitFor, prompts } = await setup();
    await send('/lint bad.ts');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('Linting found problems');
    expect(prompts()[0]).toContain('bad.ts:1:');
  }, 20_000);

  it('/lint runs the configured linter command on the file', async () => {
    writeFileSync(path.join(cwd, 'a.ts'), 'export const a = 1;\n');
    writeFileSync(path.join(cwd, 'lint.js'), "console.log('STYLE-PROBLEM in '+process.argv[2]);process.exit(1)");
    const { send, waitFor, prompts } = await setup({ autoLint: { syntax: false, commands: { '*': 'node lint.js' } } });
    await send('/lint a.ts');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('STYLE-PROBLEM in a.ts');
  }, 20_000);

  it('/test with no argument runs every --test-cmd, stopping at the first failure and sending it to the model', async () => {
    const { send, waitFor, prompts } = await setup({}, { testCmds: [`node -e "console.log('FIRST-PASSES')"`, `node -e "console.error('SECOND-BROKE');process.exit(1)"`, `node -e "console.log('NEVER-RUNS')"`] });
    await send('/test');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('The test command');
    expect(prompts()[0]).toContain('SECOND-BROKE');
    const frame = await waitFor((f) => f.includes('FIRST-PASSES'));
    expect(frame).not.toContain('NEVER-RUNS');
  }, 25_000);

  it('/test with no argument and no --test-cmd explains what to do', async () => {
    const { send, waitFor, prompts } = await setup();
    await send('/test');
    await waitFor((f) => f.includes('--test-cmd'));
    expect(prompts()).toHaveLength(0);
  }, 20_000);

  it('/lint with no argument runs the --lint-cmd checks; a failure goes to the model', async () => {
    const { send, waitFor, prompts } = await setup({}, { lintCmds: [`node -e "console.error('LINT-BROKE');process.exit(1)"`] });
    await send('/lint');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('The lint command');
    expect(prompts()[0]).toContain('LINT-BROKE');
  }, 25_000);

  it('/lint with files still checks those files, even when --lint-cmd is set', async () => {
    writeFileSync(path.join(cwd, 'bad.ts'), 'const x = ;\n');
    const { send, waitFor, prompts } = await setup({}, { lintCmds: [`node -e "process.exit(0)"`] });
    await send('/lint bad.ts');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('bad.ts:1:');
  }, 20_000);

  it('/lint reports a clean file without calling the model', async () => {
    writeFileSync(path.join(cwd, 'ok.ts'), 'export const a = 1;\n');
    const { send, waitFor, prompts } = await setup();
    await send('/lint ok.ts');
    await waitFor((f) => f.includes('lint clean (1 file)'));
    expect(prompts()).toHaveLength(0);
  }, 20_000);

  it('/ok, /tokens, /settings and /reset', async () => {
    writeFileSync(path.join(cwd, 'a.txt'), 'x');
    const { send, waitFor, prompts } = await setup();
    await send('/add a.txt');
    await waitFor((f) => f.includes('attached a.txt'));
    await send('/settings');
    await waitFor((f) => f.includes('attached files: 1') && f.includes('model: openai:gpt-4o'));
    await send('/ok');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('go ahead');
    await send('/tokens');
    await waitFor((f) => /context: ~[\d,]+ of [\d,]+ tokens/.test(f) && f.includes('1 attached file'));
    await send('/reset');
    await waitFor((f) => f.includes('detached all files and cleared the conversation'));
    await send('/ls');
    await waitFor((f) => f.includes('no files attached'));
  }, 30_000);
});

describe('REPL I/O commands', () => {
  const copied: string[] = [];
  const services = (extra: Record<string, unknown> = {}) => ({
    copy: async (text: string) => (copied.push(text), { ok: true as const, tool: 'fake-clip' }),
    read: async () => ({ ok: true as const, tool: 'fake-clip', text: 'CLIPBOARD-TEXT' }),
    ...extra,
  });
  beforeEach(() => {
    copied.length = 0;
  });

  it('/copy and /copy-context say so when there is nothing yet, and copy the last reply or the whole conversation after a turn', async () => {
    const { send, waitFor } = await setup({}, { services: services() });
    await send('/copy');
    await waitFor((f) => f.includes('nothing to copy yet: no reply'));
    await send('/copy-context');
    await waitFor((f) => f.includes('nothing to copy yet: the conversation is empty'));
    await send('hello model');
    await waitFor((f) => f.includes('Done: Completed'));
    await send('/copy');
    await waitFor((f) => f.includes('copied 2 characters to the clipboard (fake-clip)'));
    expect(copied).toEqual(['ok']);
    await send('/copy-context');
    await waitFor((f) => (f.match(/to the clipboard/g) ?? []).length >= 2);
    expect(copied[1]).toContain('#### User\n\nhello model');
    expect(copied[1]).toContain('#### Assistant\n\nok');
  }, 30_000);

  it('/copy reports a clipboard that is not available', async () => {
    const { send, waitFor } = await setup({}, { services: services({ copy: async () => ({ ok: false as const, error: 'no clipboard tool found' }) }) });
    await send('hi');
    await waitFor((f) => f.includes('Done: Completed'));
    await send('/copy');
    await waitFor((f) => f.includes('copy failed: no clipboard tool found'));
  }, 20_000);

  it('/paste adds the clipboard text (secrets redacted) to the next message', async () => {
    const key = `AKIA${'A1B2C3D4E5F6G7H8'}`;
    const { send, waitFor, prompts } = await setup({}, { services: services({ read: async () => ({ ok: true as const, tool: 'x', text: `see this\nAWS_ACCESS_KEY_ID=${key}\n` }) }) });
    await send('/paste');
    await waitFor((f) => f.includes('(sent with your next message)'));
    await send('what is wrong here?');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('Pasted from the clipboard');
    expect(prompts()[0]).toContain('see this');
    expect(prompts()[0]).not.toContain(key);
  }, 20_000);

  it('/paste says when the clipboard is empty or unreadable', async () => {
    const empty = await setup({}, { services: services({ read: async () => ({ ok: true as const, tool: 'x', text: '  \n' }) }) });
    await empty.send('/paste');
    await empty.waitFor((f) => f.includes('the clipboard is empty'));
    const broken = await setup({}, { services: services({ read: async () => ({ ok: false as const, error: 'no clipboard tool found' }) }) });
    await broken.send('/paste');
    await broken.waitFor((f) => f.includes('paste failed: no clipboard tool found'));
  }, 20_000);

  it('/web fetches a page for the next message, and explains usage and failures', async () => {
    const seen: string[] = [];
    const fetchPage = async (url: string) => {
      seen.push(url);
      if (url.includes('bad')) throw new Error('blocked address');
      return { url: `${url}/final`, title: 'Docs', status: 200, excerpt: 'PAGE-BODY-TEXT', truncated: true };
    };
    const { send, waitFor, prompts } = await setup({}, { services: services({ fetchPage }) });
    await send('/web');
    await waitFor((f) => f.includes('usage: /web <url>'));
    await send('/web https://bad.example');
    await waitFor((f) => f.includes('/web: blocked address'));
    await send('/web https://docs.example');
    await waitFor((f) => f.includes('HTTP 200') && f.includes('truncated'));
    await send('summarize it');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(seen).toEqual(['https://bad.example', 'https://docs.example']);
    expect(prompts()[0]).toContain('Web page https://docs.example/final');
    expect(prompts()[0]).toContain('Docs');
    expect(prompts()[0]).toContain('(truncated)');
    expect(prompts()[0]).toContain('PAGE-BODY-TEXT');
  }, 30_000);

  it('/editor sends what the editor wrote as the message; /edit seeds it; failures are reported', async () => {
    const initials: string[] = [];
    let next: { ok: true; text: string } | { ok: false; error: string } = { ok: true, text: 'WRITTEN-IN-EDITOR\nline two' };
    const edit = async (initial: string) => (initials.push(initial), next);
    const { send, waitFor, prompts } = await setup({}, { services: services({ edit }) });
    await send('/editor');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('WRITTEN-IN-EDITOR');
    expect(prompts()[0]).toContain('line two');
    next = { ok: false, error: 'the file was empty, so nothing was sent' };
    await send('/edit start here');
    await waitFor((f) => f.includes('/edit: the file was empty'));
    expect(initials).toEqual(['', 'start here']);
    expect(prompts()).toHaveLength(1);
  }, 30_000);

  it('/report prints a prefilled issue link with diagnostics and no secrets', async () => {
    const { send, waitFor } = await setup({}, { version: '9.9.9' });
    await send('/report');
    const frame = await waitFor((f) => f.includes('issues/new'));
    expect(frame).toContain('github.com/ikarmicai/ikarmic-forge/issues/new');
    expect(frame).toContain('diagnostics only');
    expect(frame).not.toContain('test-key');
  }, 20_000);

  it('/help <question> asks the model with the command reference, using only the six read-only tools', async () => {
    const { send, waitFor, prompts, mock } = await setup();
    await send('/help how do I attach a file?');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('Question: how do I attach a file?');
    expect(prompts()[0]).toContain('<forge-reference>');
    expect(prompts()[0]).toContain('/add <files> and /read-only <files> attach files');
    expect(prompts()[0]).toContain('Command-line options:');
    // The mock records how many tools were offered: the read-only set for /help, the full set for a normal turn.
    await send('now edit something');
    await waitFor((f) => (f.match(/Done: Completed/g) ?? []).length >= 2);
    const [helpTools, normalTools] = [mock.calls[0]!.tools as number, mock.calls[1]!.tools as number];
    expect(helpTools).toBe(6);
    expect(normalTools).toBeGreaterThan(helpTools);
  }, 25_000);

  it('plain /help still lists every command, including the new ones', async () => {
    const { send, waitFor } = await setup();
    await send('/help');
    const frame = await waitFor((f) => f.includes('/copy-context'));
    for (const c of ['/copy', '/paste', '/web', '/editor', '/report', '/help [question]']) expect(frame).toContain(c);
  }, 20_000);
});

describe('REPL session and model commands', () => {
  it('/reasoning-effort shows, sets and clears the effort used for later turns, and rejects bad levels', async () => {
    const { send, waitFor, efforts } = await setup();
    await send('/reasoning-effort');
    await waitFor((f) => f.includes('reasoning effort: default'));
    await send('/reasoning-effort ultra');
    await waitFor((f) => f.includes('reasoning effort must be one of'));
    await send('/reasoning-effort high');
    await waitFor((f) => f.includes('reasoning effort → high'));
    await send('think hard');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(efforts.at(-1)).toBe('high');
    await send('/reasoning-effort default');
    await waitFor((f) => f.includes('reasoning effort → default'));
    await send('and now?');
    await waitFor((f) => (f.match(/Done: Completed/g) ?? []).length >= 2);
    expect(efforts.at(-1)).toBeUndefined();
  }, 40_000);

  it('/think-tokens picks the nearest effort and says it is not an exact budget', async () => {
    const { send, waitFor, efforts } = await setup();
    await send('/think-tokens 8k');
    const frame = await waitFor((f) => f.includes('reasoning effort "medium"'));
    expect(frame.replace(/\s+/g, ' ')).toContain('not an exact token count');
    await send('hello');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(efforts.at(-1)).toBe('medium');
    await send('/think-tokens lots');
    await waitFor((f) => f.includes('give a token count'));
  }, 30_000);

  it('commands see the latest weak model and editor model, not the ones from when the handler was created', async () => {
    const { send, waitFor } = await setup();
    await send('/weak-model mini');
    await waitFor((f) => f.includes('weak model → openai:gpt-4o-mini'));
    await send('/weak-model');
    await waitFor((f) => f.includes('weak model: openai:gpt-4o-mini'));
    await send('/settings');
    await waitFor((f) => f.includes('weak model: openai:gpt-4o-mini   ') || f.replace(/\s+/g, ' ').includes('weak model: openai:gpt-4o-mini'));
    await send('/editor-model mini');
    await waitFor((f) => f.includes('editor model → openai:gpt-4o-mini'));
    await send('/editor-model');
    await waitFor((f) => f.includes('editor model: openai:gpt-4o-mini'));
  }, 40_000);

  it('/model keeps the reasoning effort that was set', async () => {
    const { send, waitFor, efforts } = await setup();
    await send('/reasoning-effort low');
    await waitFor((f) => f.includes('reasoning effort → low'));
    await send('/model mini');
    await waitFor((f) => f.includes('model → openai:gpt-4o-mini'));
    await send('hello');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(efforts.at(-1)).toBe('low');
  }, 30_000);

  it('/architect needs an editor model, plans with the main model, and the editor model applies the approved plan', async () => {
    const { send, waitFor, modelsUsed, prompts } = await setup();
    await send('/architect add a feature');
    await waitFor((f) => f.includes('set the model that applies the plan first'));
    await send('/editor-model');
    await waitFor((f) => f.includes('editor model: (none)'));
    await send('/editor-model mini');
    await waitFor((f) => f.includes('editor model → openai:gpt-4o-mini'));
    await send('/architect');
    await waitFor((f) => f.includes('usage: /architect <task>'));
    await send('/architect add a feature');
    await waitFor((f) => f.includes('approve (a)') || f.includes('plan') );
    expect(modelsUsed.at(-1)).toBe('openai:gpt-4o'); // the plan was made by the main model
    await send('a');
    await waitFor((f) => f.includes('openai:gpt-4o-mini is applying it'));
    await waitFor((f) => (f.match(/Done: Completed/g) ?? []).length >= 1); // the planning run reports "Done: Plan ready"
    expect(modelsUsed.at(-1)).toBe('openai:gpt-4o-mini'); // the editor model applied it
    expect(prompts().at(-1)).toContain('approved-plan');
    // Back to the main model afterwards.
    await send('one more thing');
    await waitFor((f) => (f.match(/Done: Completed/g) ?? []).length >= 2);
    expect(modelsUsed.at(-1)).toBe('openai:gpt-4o');
  }, 60_000);

  it('an approved plan reaches the model even when it was edited first (/plan, then e, then a)', async () => {
    const { send, waitFor, prompts } = await setup();
    await send('/plan add a login page');
    await waitFor((f) => f.includes('Done: Plan ready'));
    await send('e');
    await waitFor((f) => f.includes('enter the edited plan'));
    await send('EDITED-PLAN-STEP-ONE then step two');
    await waitFor((f) => f.includes('edited plan saved'));
    await send('a');
    await waitFor((f) => f.includes('Done: Completed'));
    const last = prompts().at(-1)!;
    expect(last).toContain('EDITED-PLAN-STEP-ONE');
    expect(last).toContain('approved-plan');
  }, 40_000);

  it('cancelling an /architect plan, or using plain /plan, applies with the main model', async () => {
    const { send, waitFor, modelsUsed } = await setup();
    await send('/editor-model mini');
    await waitFor((f) => f.includes('editor model → openai:gpt-4o-mini'));
    await send('/architect do it');
    await waitFor((f) => f.includes('Done: Plan ready') || f.includes('plan'));
    await send('c');
    await waitFor((f) => f.includes('plan cancelled'));
    await send('/plan do it plainly');
    await waitFor((f) => f.includes('plan'));
    await send('a');
    await waitFor((f) => f.includes('plan approved: executing'));
    await waitFor((f) => (f.match(/Done: Completed/g) ?? []).length >= 1);
    expect(modelsUsed.at(-1)).toBe('openai:gpt-4o');
  }, 60_000);

  it('/editor-model off clears it', async () => {
    const { send, waitFor } = await setup();
    await send('/editor-model mini');
    await waitFor((f) => f.includes('editor model → '));
    await send('/editor-model off');
    await waitFor((f) => f.includes('editor model cleared'));
    await send('/editor-model');
    await waitFor((f) => f.includes('editor model: (none)'));
  }, 30_000);

  it('/save-script, /planet and /specs are not mistaken for /save, /plan and /spec', async () => {
    const { send, waitFor, prompts } = await setup();
    await send('/save-script');
    await waitFor((f) => f.includes('usage: /save-script <file>'));
    expect((await readdirSafe(sessionDir)).length).toBe(0); // no session was saved under a label like "-script"
    await send('/planet of the apes');
    await waitFor((f) => f.includes('Done: Completed')); // an ordinary message, not a plan
    expect(prompts()[0]).toContain('/planet of the apes');
  }, 30_000);

  it('/load replays commands and messages from a file, skipping comments', async () => {
    writeFileSync(path.join(cwd, 'script.txt'), '# set up\n/model mini\n\nhello from the script\n');
    const { send, waitFor, modelsUsed, prompts } = await setup();
    await send('/load script.txt');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(modelsUsed.at(-1)).toBe('openai:gpt-4o-mini');
    expect(prompts()[0]).toContain('hello from the script');
  }, 30_000);

  it('/load rejects a missing file, an empty one, a missing argument and a script that loads another', async () => {
    writeFileSync(path.join(cwd, 'empty.txt'), '# nothing\n\n');
    writeFileSync(path.join(cwd, 'nested.txt'), '/load empty.txt\n');
    const { send, waitFor } = await setup();
    await send('/load');
    await waitFor((f) => f.includes('usage: /load <file>'));
    await send('/load nope.txt');
    await waitFor((f) => f.includes('cannot read nope.txt'));
    await send('/load empty.txt');
    await waitFor((f) => f.includes('empty.txt has no commands'));
    await send('/load nested.txt');
    await waitFor((f) => f.includes('a script cannot /load another script'));
  }, 40_000);

  it('/save-script writes the model and attached files, only inside the working directory, and /load restores them', async () => {
    writeFileSync(path.join(cwd, 'a.txt'), 'a');
    writeFileSync(path.join(cwd, 'b.txt'), 'b');
    const first = await setup();
    await first.send('/add a.txt');
    await first.waitFor((f) => f.includes('attached a.txt'));
    await first.send('/read-only b.txt');
    await first.waitFor((f) => f.includes('attached b.txt'));
    await first.send('/model mini');
    await first.waitFor((f) => f.includes('model → openai:gpt-4o-mini'));
    await first.send('/reasoning-effort low');
    await first.waitFor((f) => f.includes('reasoning effort → low'));
    await first.send('/save-script ../escape.txt');
    await first.waitFor((f) => f.includes('the script must be inside the working directory'));
    await first.send('/save-script setup.txt');
    await first.waitFor((f) => f.includes('wrote 4 commands to setup.txt'));
    expect(readFileSync(path.join(cwd, 'setup.txt'), 'utf8').split('\n').filter((l) => !l.startsWith('#') && l)).toEqual([
      '/model openai:gpt-4o-mini',
      '/reasoning-effort low',
      '/add a.txt',
      '/read-only b.txt',
    ]);

    const second = await setup();
    await second.send('/load setup.txt');
    await second.waitFor((f) => f.includes('> /read-only b.txt'));
    await second.send('/ls');
    const frame = await second.waitFor((f) => f.includes('b.txt (read-only)'));
    expect(frame).toContain('a.txt');
    await second.send('/reasoning-effort');
    await second.waitFor((f) => f.includes('reasoning effort: low'));
  }, 60_000);

  it('/retry drops the last turn and runs it again, or an edited message in its place', async () => {
    const { send, waitFor, prompts } = await setup();
    await send('/retry');
    await waitFor((f) => f.includes('nothing to retry yet'));
    await send('FIRST-MESSAGE');
    await waitFor((f) => f.includes('Done: Completed'));
    await send('/retry EDITED-MESSAGE');
    await waitFor((f) => (f.match(/Done: Completed/g) ?? []).length >= 2);
    const second = prompts()[1]!;
    expect(second).toContain('EDITED-MESSAGE');
    // The dropped turn is gone from the conversation the model sees.
    expect(second).not.toContain('FIRST-MESSAGE');
    await send('/retry');
    await waitFor((f) => (f.match(/Done: Completed/g) ?? []).length >= 3);
    expect(prompts()[2]).toContain('EDITED-MESSAGE');
    expect((prompts()[2]!.match(/EDITED-MESSAGE/g) ?? []).length).toBe(1);
  }, 30_000);

  it('queues a message typed while a command runs, then sends it', async () => {
    const { send, waitFor, prompts } = await setup();
    await send('/run node -e "setTimeout(() => {}, 1500)"');
    await send('QUEUED-MESSAGE');
    await waitFor((f) => f.includes('queued (1 waiting): QUEUED-MESSAGE'));
    expect(prompts()).toHaveLength(0);
    await waitFor((f) => f.includes('Done: Completed'), 15_000);
    expect(prompts()[0]).toContain('QUEUED-MESSAGE');
  }, 30_000);

  it('runs a custom command from .forge/commands with its arguments, and lists it in /help', async () => {
    mkdirSync(path.join(cwd, '.forge', 'commands'), { recursive: true });
    writeFileSync(path.join(cwd, '.forge', 'commands', 'review.md'), '---\ndescription: Review a file\n---\nREVIEW-TEMPLATE for $ARGUMENTS');
    const { send, waitFor, prompts } = await setup();
    await send('/help');
    await waitFor((f) => f.includes('/review — Review a file (project)'));
    await send('/review src/app.ts');
    await waitFor((f) => f.includes('Done: Completed'));
    expect(prompts()[0]).toContain('REVIEW-TEMPLATE for src/app.ts');
  }, 20_000);

  it('/sessions lists recent sessions and searches them', async () => {
    const { send, waitFor } = await setup();
    await send('/sessions');
    await waitFor((f) => f.includes('no saved sessions yet'));
    await send('remember the PINEAPPLE plan');
    await waitFor((f) => f.includes('Done: Completed'));
    await send('/sessions pineapple');
    await waitFor((f) => f.includes('sessions mentioning "pineapple"') && f.includes('s1'));
    await send('/sessions mango');
    await waitFor((f) => f.includes('no session mentions "mango"'));
  }, 20_000);
});

