import { describe, expect, it } from 'vitest';

import { cmdEntriesMarkdown, mergeCmdEntries, type CmdEntry } from '../src/chat/cmd-entries.js';
import { transcriptFromMessages, type TranscriptItem } from '../src/chat/history-protocol.js';
import { BUILTIN_SLASH, parseSlash } from '../src/chat/slash-commands.js';
import { CMD_USAGE, runSlash, type SlashDeps } from '../src/chat/slash-run.js';
import { WEBVIEW_STRINGS } from '../src/chat/webview-i18n.js';

const u = (text: string): TranscriptItem => ({ role: 'user', text });
const a = (text: string): TranscriptItem => ({ role: 'assistant', text });
const entry = (at: number, request: string, rest: Partial<CmdEntry> = {}): CmdEntry => ({ at, request, command: `echo ${request}`, ...rest });

describe('mergeCmdEntries', () => {
  const items = [u('1'), a('2'), u('3'), a('4')];
  it('inserts at the start, in the middle and past the end', () => {
    expect(mergeCmdEntries(items, [entry(0, 'x')]).map((i) => i.role)).toEqual(['cmd', 'user', 'assistant', 'user', 'assistant']);
    expect(mergeCmdEntries(items, [entry(2, 'x')]).map((i) => i.role)).toEqual(['user', 'assistant', 'cmd', 'user', 'assistant']);
    expect(mergeCmdEntries(items, [entry(99, 'x')]).map((i) => i.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'cmd']);
  });
  it('keeps the order of two entries at the same place', () => {
    const out = mergeCmdEntries(items, [entry(2, 'first'), entry(2, 'second')]);
    expect(out.filter((i) => i.role === 'cmd').map((i) => (i as { request: string }).request)).toEqual(['first', 'second']);
    expect(out.map((i) => i.role)).toEqual(['user', 'assistant', 'cmd', 'cmd', 'user', 'assistant']);
  });
  it('carries the command, risk and failure and does not change the input', () => {
    const e = [entry(1, 'x', { risk: 'deletes files' }), entry(1, 'y', { command: undefined, failed: true })];
    const out = mergeCmdEntries(items, e);
    expect(out[1]).toEqual({ role: 'cmd', request: 'x', command: 'echo x', risk: 'deletes files' });
    expect(out[2]).toEqual({ role: 'cmd', request: 'y', failed: true });
    expect(items).toHaveLength(4);
  });
  it('round-trips a saved session: the transcript of its messages plus the entries', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
      { role: 'user', content: 'again' },
    ];
    const base = transcriptFromMessages(messages);
    const merged = mergeCmdEntries(base, [entry(base.length - 1, 'list')]);
    expect(merged.map((i) => i.role)).toEqual(['user', 'assistant', 'cmd', 'user']);
  });
});

describe('cmdEntriesMarkdown', () => {
  it('writes the whole command, several lines included, as a fenced block, and skips failures', () => {
    const md = cmdEntriesMarkdown([entry(0, 'a', { command: 'one\ntwo' }), entry(0, 'b', { command: undefined, failed: true })]);
    expect(md).toContain('```\none\ntwo\n```');
    expect(md).not.toContain('echo b');
    expect(cmdEntriesMarkdown([])).toBe('');
  });
});

describe('/cmd', () => {
  const setup = () => {
    const calls: string[] = [];
    const deps = new Proxy({} as SlashDeps, {
      get: (_t, name: string) => (...args: unknown[]) => { calls.push(`${name}:${args[0] ?? ''}`); return Promise.resolve(); },
    });
    return { calls, deps };
  };
  it('is a built-in that takes the request as its arguments', () => {
    expect(parseSlash('/cmd list files', BUILTIN_SLASH)).toMatchObject({ name: 'cmd', args: 'list files' });
  });
  it('hands the request to terminalCommand', async () => {
    const { calls, deps } = setup();
    expect(await runSlash('cmd', 'x', deps, BUILTIN_SLASH)).toBe(true);
    expect(calls).toEqual(['terminalCommand:x']);
  });
  it('with no words shows the usage text and never asks the model', async () => {
    const { calls, deps } = setup();
    await runSlash('cmd', '   ', deps, BUILTIN_SLASH);
    expect(calls).toEqual([`help:${CMD_USAGE}`]);
    expect(WEBVIEW_STRINGS).toContain(CMD_USAGE);
  });
});

describe('insertPlan', () => {
  it('types a one-line command and copies a command with several lines (a newline would press Enter)', async () => {
    const { insertPlan } = await import('../src/chat/cmd-entries.js');
    expect(insertPlan('echo hi')).toBe('type');
    expect(insertPlan('echo hi\n')).toBe('type');
    expect(insertPlan('one\ntwo')).toBe('copy');
    expect(insertPlan('one\r\ntwo')).toBe('copy');
  });
});
