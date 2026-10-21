import { describe, expect, it } from 'vitest';

import {
  OK_TASK,
  contextOutput,
  describeModel,
  effortForThinkTokens,
  estimateContextTokens,
  fixTask,
  formatScript,
  formatModels,
  formatTokens,
  parseReasoningEffort,
  parseSlashCommand,
  parseThinkTokens,
  parseTokenCount,
  runContextNote,
  runShell,
  scriptLines,
  switchModel,
} from '../src/repl-commands.js';

const base = { provider: 'openai', model: 'gpt-4o', baseUrl: 'http://localhost:1234/v1', apiKey: 'k' } as never;
const node = (code: string) => `node -e "${code}"`;

describe('parseSlashCommand', () => {
  it('parses commands, lowercases the name, keeps the argument text', () => {
    expect(parseSlashCommand('/model fast')).toEqual({ name: 'model', args: 'fast' });
    expect(parseSlashCommand('  /Add  a.ts   b.ts ')).toEqual({ name: 'add', args: 'a.ts   b.ts' });
    expect(parseSlashCommand('/map-refresh')).toEqual({ name: 'map-refresh', args: '' });
    expect(parseSlashCommand('/run npm test\n--silent')).toEqual({ name: 'run', args: 'npm test\n--silent' });
  });

  it('treats !cmd as /run and ignores ordinary text and paths', () => {
    expect(parseSlashCommand('!ls -la')).toEqual({ name: 'run', args: 'ls -la' });
    expect(parseSlashCommand('!')).toBeNull();
    expect(parseSlashCommand('fix the bug')).toBeNull();
    expect(parseSlashCommand('/usr/bin/env is where?')).toBeNull();
    expect(parseSlashCommand('/ nope')).toBeNull();
  });
});

describe('switchModel', () => {
  const aliases = { fast: 'anthropic:claude-haiku-4-5', mini: 'gpt-4o-mini' };
  const ok = () => ({}) as never;

  it('resolves aliases, provider prefixes and bare ids against the current provider', () => {
    expect(switchModel('mini', base, aliases, ok)).toMatchObject({ ok: true, model: { provider: 'openai', model: 'gpt-4o-mini' } });
    expect(switchModel('anthropic:claude-opus-4-5', base, aliases, ok)).toMatchObject({ ok: true, model: { provider: 'anthropic', model: 'claude-opus-4-5' } });
    expect(describeModel((switchModel('fast', base, aliases, ok) as { model: never }).model)).toBe('anthropic:claude-haiku-4-5');
  });

  it('keeps the base URL and key only when the provider stays the same', () => {
    const same = switchModel('gpt-4o-mini', base, undefined, ok) as { model: { baseUrl?: string; apiKey?: string } };
    expect([same.model.baseUrl, same.model.apiKey]).toEqual(['http://localhost:1234/v1', 'k']);
    const other = switchModel('anthropic:claude-opus-4-5', base, undefined, ok) as { model: { baseUrl?: string; apiKey?: string } };
    expect([other.model.baseUrl, other.model.apiKey]).toEqual([undefined, undefined]);
  });

  it('reports a model that cannot be built (e.g. missing key) and an empty argument, without switching', () => {
    const bad = switchModel('anthropic:x', base, undefined, () => {
      throw new Error('ANTHROPIC_API_KEY is not set');
    });
    expect(bad).toEqual({ ok: false, error: 'cannot use anthropic:x: ANTHROPIC_API_KEY is not set' });
    expect(switchModel('  ', base, undefined, ok)).toMatchObject({ ok: false });
    expect(switchModel('openai:', base, undefined, ok)).toMatchObject({ ok: false, error: expect.stringContaining('does not name a model') });
  });
});

describe('formatModels', () => {
  it('lists aliases and the catalog, and filters by substring', () => {
    const all = formatModels({ fast: 'anthropic:claude-haiku-4-5' });
    expect(all).toContain('fast');
    expect(all).toContain('anthropic: ');
    expect(all).toContain('openai: ');
    const filtered = formatModels({ fast: 'anthropic:claude-haiku-4-5', other: 'gpt-4o' }, 'haiku');
    expect(filtered).toContain('fast');
    expect(filtered).not.toContain('other');
    expect(filtered).not.toContain('openai: ');
    expect(formatModels(undefined, 'zzz-nothing')).toBe('no models match "zzz-nothing"');
  });
});

describe('runShell', () => {
  it('captures stdout and stderr and the exit code', async () => {
    const ok = await runShell(node("console.log('out');console.error('err')"), process.cwd());
    expect(ok.exitCode).toBe(0);
    expect(ok.output).toContain('out');
    expect(ok.output).toContain('err');
    const bad = await runShell(node('process.exit(3)'), process.cwd());
    expect(bad).toMatchObject({ exitCode: 3, timedOut: false });
  });

  it('runs in the given directory', async () => {
    const r = await runShell(node('console.log(process.cwd())'), process.cwd());
    expect(r.output.trim()).toBe(process.cwd());
  });

  it('kills a command that outlives the timeout', async () => {
    const r = await runShell(node('setTimeout(()=>{},60000)'), process.cwd(), 300);
    expect(r).toMatchObject({ timedOut: true, exitCode: null });
  }, 15_000);
});

describe('what the model is told', () => {
  it('runContextNote and fixTask include the command, status and output; secrets are redacted; long output keeps its tail', () => {
    const r = { exitCode: 1, output: 'boom', timedOut: false };
    expect(runContextNote('npm test', r)).toContain('I ran `npm test` (exit 1)');
    expect(runContextNote('npm test', r)).toContain('boom');
    expect(runContextNote('x', { exitCode: 0, output: '', timedOut: false })).toContain('(no output)');
    expect(runContextNote('x', { exitCode: null, output: '', timedOut: true })).toContain('(timed out)');
    expect(fixTask('test', 'npm test', r)).toMatch(/^The test command `npm test` failed \(exit 1\)\. Fix the code/);
    expect(fixTask('lint', 'eslint .', r)).toContain('The lint command `eslint .`');
    const key = `AKIA${'A1B2C3D4E5F6G7H8'}`;
    expect(contextOutput(`token ${key}`)).not.toContain(key);
    const long = `${'head\n'.repeat(5000)}THE-END`;
    expect(contextOutput(long)).toContain('THE-END');
    expect(contextOutput(long).length).toBeLessThan(8200);
    expect(OK_TASK).toMatch(/go ahead/);
  });
});

describe('formatTokens', () => {
  it('shows context use, session totals, cost and attached files', () => {
    const text = formatTokens({
      inputTokens: 12000,
      outputTokens: 3400,
      costUsd: 0.1234,
      model: { provider: 'anthropic', model: 'claude-sonnet-4-5' } as never,
      contextTokens: 20000,
      attachedFiles: 2,
    });
    expect(text).toMatch(/context: ~20,000 of [\d,]+ tokens \(\d+%\): anthropic:claude-sonnet-4-5/);
    expect(text).toContain('12,000 in / 3,400 out, $0.1234');
    expect(text).toContain('2 attached files are re-sent every turn');
    expect(formatTokens({ inputTokens: 0, outputTokens: 0, costUsd: undefined, model: { provider: 'openai', model: 'gpt-4o' } as never, contextTokens: 0, attachedFiles: 0 })).not.toContain('$');
  });

  it('estimateContextTokens counts text and structured content at 4 characters per token', () => {
    expect(estimateContextTokens([{ content: 'a'.repeat(400) }])).toBe(100);
    expect(estimateContextTokens([{ content: [{ type: 'text', text: 'hi' }] }])).toBeGreaterThan(0);
    expect(estimateContextTokens([])).toBe(0);
  });
});

describe('reasoning effort and thinking budget', () => {
  it('parseReasoningEffort accepts the levels, default clears, anything else is an error naming the levels', () => {
    for (const level of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']) expect(parseReasoningEffort(` ${level.toUpperCase()} `)).toEqual({ ok: true, effort: level });
    expect(parseReasoningEffort('default')).toEqual({ ok: true, effort: undefined });
    expect(parseReasoningEffort('auto')).toEqual({ ok: true, effort: undefined });
    expect(parseReasoningEffort('max')).toMatchObject({ ok: false, error: expect.stringContaining('none, minimal, low, medium, high, xhigh') });
    expect(parseReasoningEffort('')).toMatchObject({ ok: false });
  });

  it('parseTokenCount reads plain numbers and k / m suffixes', () => {
    expect(parseTokenCount('8000')).toBe(8000);
    expect(parseTokenCount('8k')).toBe(8000);
    expect(parseTokenCount(' 1.5K ')).toBe(1500);
    expect(parseTokenCount('2m')).toBe(2_000_000);
    expect(parseTokenCount('0')).toBe(0);
    for (const bad of ['', 'lots', '-5', '8kb', '1,000']) expect(parseTokenCount(bad)).toBeNull();
  });

  it('effortForThinkTokens picks the nearest level at each boundary', () => {
    const cases: Array<[number, string]> = [[0, 'none'], [1, 'minimal'], [1024, 'minimal'], [1025, 'low'], [4096, 'low'], [4097, 'medium'], [16384, 'medium'], [16385, 'high'], [32768, 'high'], [32769, 'xhigh']];
    for (const [tokens, effort] of cases) expect(effortForThinkTokens(tokens), String(tokens)).toBe(effort);
  });

  it('parseThinkTokens explains that a level, not an exact budget, is set', () => {
    const ok = parseThinkTokens('8k');
    expect(ok).toMatchObject({ ok: true, effort: 'medium' });
    expect((ok as { note: string }).note).toContain('8,000 tokens');
    expect((ok as { note: string }).note).toContain('a level, not an exact token count');
    expect(parseThinkTokens('0')).toMatchObject({ ok: true, effort: 'none', note: expect.stringContaining('off') });
    expect(parseThinkTokens('default')).toMatchObject({ ok: true, effort: undefined });
    expect(parseThinkTokens('plenty')).toMatchObject({ ok: false });
  });
});

describe('scripts', () => {
  it('scriptLines drops blank lines and # comments and trims', () => {
    expect(scriptLines('# header\n\n  /add a.ts  \r\nfix the bug\n   # indented comment\n')).toEqual(['/add a.ts', 'fix the bug']);
    expect(scriptLines('')).toEqual([]);
  });

  it('formatScript writes the commands that recreate the session, quoting paths with spaces', () => {
    const text = formatScript({
      model: { provider: 'openai', model: 'gpt-4o', reasoningEffort: 'high' } as never,
      weakModel: { provider: 'openai', model: 'gpt-4o-mini' } as never,
      editorModel: { provider: 'anthropic', model: 'claude-sonnet-4-5' } as never,
      files: { editable: ['src/a.ts', 'my notes.md'], readOnly: ['docs/spec.md'] },
    });
    expect(text.split('\n')).toEqual([
      '# Forge session script. Replay it with: /load <this file>',
      '/model openai:gpt-4o',
      '/reasoning-effort high',
      '/weak-model openai:gpt-4o-mini',
      '/editor-model anthropic:claude-sonnet-4-5',
      '/add src/a.ts',
      '/add "my notes.md"',
      '/read-only docs/spec.md',
      '',
    ]);
    // What it writes is what it reads back: every non-comment line is a command.
    expect(scriptLines(text)).toHaveLength(7);
  });

  it('formatScript with nothing optional is just the model line', () => {
    expect(scriptLines(formatScript({ model: { provider: 'openai', model: 'm' } as never, files: { editable: [], readOnly: [] } }))).toEqual(['/model openai:m']);
  });
});
