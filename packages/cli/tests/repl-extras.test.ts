import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  composeInEditor,
  conversationMarkdown,
  helpQuestionTask,
  lastAssistantText,
  reportUrl,
  resolveEditor,
  type EditorSpawner,
} from '../src/repl-extras.js';

const history: ModelMessage[] = [
  { role: 'system', content: 'SYSTEM PROMPT' },
  { role: 'user', content: 'fix the bug' },
  {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Looking.' },
      { type: 'tool-call', toolCallId: '1', toolName: 'read_file', input: {} },
      { type: 'tool-call', toolCallId: '2', toolName: 'read_file', input: {} },
    ],
  } as never,
  { role: 'tool', content: [{ type: 'tool-result', toolCallId: '1', toolName: 'read_file', output: { type: 'text', value: 'SECRET FILE BODY' } }] } as never,
  { role: 'assistant', content: [{ type: 'tool-call', toolCallId: '3', toolName: 'write_file', input: {} }] } as never,
  { role: 'assistant', content: 'Done: fixed it.' },
];

describe('lastAssistantText', () => {
  it('returns the last reply that has text, skipping tool-only turns', () => {
    expect(lastAssistantText(history)).toBe('Done: fixed it.');
    expect(lastAssistantText(history.slice(0, 5))).toBe('Looking.');
    expect(lastAssistantText([{ role: 'user', content: 'hi' }])).toBeNull();
    expect(lastAssistantText([])).toBeNull();
  });
});

describe('conversationMarkdown', () => {
  it('lists user and assistant turns with the tools used, and leaves out the system prompt and tool results', () => {
    const md = conversationMarkdown(history);
    expect(md).toBe(
      ['#### User\n\nfix the bug', '#### Assistant\n\nLooking.\n\n*(used: read_file)*', '#### Assistant\n\n*(used: write_file)*', '#### Assistant\n\nDone: fixed it.'].join('\n\n')
    );
    expect(md).not.toContain('SYSTEM PROMPT');
    expect(md).not.toContain('SECRET FILE BODY');
    expect(conversationMarkdown([])).toBe('');
  });
});

describe('resolveEditor', () => {
  it('prefers $VISUAL, then $EDITOR, then a platform default', () => {
    expect(resolveEditor({ VISUAL: 'code -w', EDITOR: 'vim' }, 'linux')).toBe('code -w');
    expect(resolveEditor({ EDITOR: ' nano ' }, 'linux')).toBe('nano');
    expect(resolveEditor({}, 'linux')).toBe('vi');
    expect(resolveEditor({ VISUAL: '  ' }, 'win32')).toBe('notepad');
  });
});

describe('composeInEditor', () => {
  it('seeds a temp file, returns what the editor saved, and removes the file', async () => {
    let seen = { editor: '', file: '', initial: '' };
    const spawner: EditorSpawner = async (editor, file) => {
      seen = { editor, file, initial: readFileSync(file, 'utf8') };
      writeFileSync(file, '  my long\nprompt  \n');
      return 0;
    };
    const res = await composeInEditor('seed text', { env: { EDITOR: 'myeditor' }, spawner });
    expect(res).toEqual({ ok: true, text: 'my long\nprompt' });
    expect(seen.editor).toBe('myeditor');
    expect(seen.initial).toBe('seed text');
    expect(existsSync(seen.file)).toBe(false);
  });

  it('reports an editor that cannot start, one that fails, and an empty result', async () => {
    expect(await composeInEditor('', { env: { EDITOR: 'nope' }, spawner: async () => null })).toEqual({
      ok: false,
      error: 'could not start "nope" (set $VISUAL or $EDITOR)',
    });
    expect(await composeInEditor('', { env: { EDITOR: 'ed' }, spawner: async () => 2 })).toEqual({ ok: false, error: '"ed" exited with code 2' });
    expect(await composeInEditor('', { env: { EDITOR: 'ed' }, spawner: async (_e, file) => (writeFileSync(file, '  \n'), 0) })).toMatchObject({ ok: false, error: expect.stringContaining('empty') });
  });

  it('removes the temp file even when the editor fails', async () => {
    let file = '';
    await composeInEditor('x', { spawner: async (_e, f) => ((file = f), 1) });
    expect(existsSync(file)).toBe(false);
  });
});

describe('reportUrl', () => {
  it('prefills diagnostics and contains no key, path or prompt', () => {
    const url = reportUrl({
      version: '4.4.0',
      platform: 'linux x64',
      node: 'v22.1.0',
      model: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-SECRET', baseUrl: 'http://internal.example' } as never,
      sessionId: 'sess-secret-id',
    });
    expect(url.startsWith('https://github.com/ikarmicai/ikarmic-forge/issues/new?')).toBe(true);
    const body = new URL(url).searchParams.get('body')!;
    expect(body).toContain('Forge: 4.4.0');
    expect(body).toContain('Model: openai:gpt-4o');
    expect(url).not.toContain('SECRET');
    expect(decodeURIComponent(url)).not.toContain('internal.example');
    expect(decodeURIComponent(url)).not.toContain('sess-secret-id');
  });
});

describe('helpQuestionTask', () => {
  it('asks for an answer from the reference only', () => {
    const task = helpQuestionTask('how do I attach a file?', '/add <files> attaches');
    expect(task).toContain('Question: how do I attach a file?');
    expect(task).toContain('<forge-reference>\n/add <files> attaches\n</forge-reference>');
    expect(task).toMatch(/only the reference/i);
  });
});
