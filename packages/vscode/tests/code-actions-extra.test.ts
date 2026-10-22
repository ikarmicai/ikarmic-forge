import { describe, expect, it } from 'vitest';

import { resolveMentions } from '../src/chat/mentions.js';
import { IMPROVE_INSTRUCTION, contextMention, terminalExplainTask, terminalFixTask } from '../src/editor/editor-tasks.js';

describe('contextMention', () => {
  it('is the file alone with no selection, and carries the line range with one', () => {
    expect(contextMention('src/a.ts')).toBe('@file:src/a.ts');
    expect(contextMention('src/a.ts', { startLine: 12, endLine: 30 })).toBe('@file:src/a.ts#L12-30');
    expect(contextMention('src/a.ts', { startLine: 7, endLine: 7 })).toBe('@file:src/a.ts#L7');
  });
});

describe('@file with a line range', () => {
  const text = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n');
  const resolvers = {
    file: async (p: string) => (p === 'src/a.ts' ? text : null),
    folder: async () => null,
    symbol: async () => null,
    problems: async () => '',
    terminal: async () => '',
    git: async () => '',
  };

  it('attaches only the lines asked for, and says which', async () => {
    const r = await resolveMentions('look at @file:src/a.ts#L3-5 please', resolvers);
    expect(r.unresolved).toEqual([]);
    expect(r.prompt).toContain('line 3\nline 4\nline 5');
    expect(r.prompt).not.toContain('line 6');
    expect(r.prompt).not.toContain('line 2\n');
    expect(r.prompt).toContain('lines="3-5"');
  });

  it('a single line, and a range past the end of the file', async () => {
    expect((await resolveMentions('@file:src/a.ts#L2', resolvers)).prompt).toContain('line 2');
    const past = await resolveMentions('@file:src/a.ts#L39-99', resolvers);
    expect(past.prompt).toContain('line 40');
  });

  it('a file that does not exist is still unresolved', async () => {
    expect((await resolveMentions('@file:nope.ts#L1-2', resolvers)).unresolved).toEqual(['@file:nope.ts#L1-2']);
  });
});

describe('editor and terminal tasks', () => {
  it('Improve keeps behaviour and asks for a smaller, clearer version', () => {
    expect(IMPROVE_INSTRUCTION).toMatch(/behaviou?r/i);
  });

  it('explain only reads; fix asks for the cause and a change', () => {
    const e = terminalExplainTask('npm ERR! missing script: build');
    expect(e).toContain('npm ERR! missing script: build');
    expect(e).toMatch(/do not (change|run)/i);
    const f = terminalFixTask('npm ERR! missing script: build');
    expect(f).toContain('npm ERR! missing script: build');
    expect(f).toMatch(/cause/i);
  });

  it('long terminal text keeps the end, where the error usually is', () => {
    const long = 'x'.repeat(30_000) + 'THE-ERROR';
    expect(terminalFixTask(long)).toContain('THE-ERROR');
    expect(terminalFixTask(long).length).toBeLessThan(15_000);
  });
});
