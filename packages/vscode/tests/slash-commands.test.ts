import { describe, expect, it } from 'vitest';

import { BUILTIN_SLASH, expandSkillCommand, filterSlash, parseSlash, slashMenuQuery, type SlashEntry } from '../src/chat/slash-commands.js';
import * as webviewLib from '../src/chat/webview-lib.js';

const custom = (name: string): SlashEntry => ({ name, description: `custom ${name}`, source: 'custom', takesArgs: true });

describe('BUILTIN_SLASH', () => {
  it('lists the built-in commands', () => {
    expect(BUILTIN_SLASH.map((e) => e.name)).toEqual(['new', 'compact', 'export', 'model', 'mode', 'variant', 'goal', 'memory', 'settings', 'review', 'cmd', 'reload', 'help']);
    expect(BUILTIN_SLASH.every((e) => e.source === 'builtin' && e.description.length > 0)).toBe(true);
  });
});

describe('parseSlash', () => {
  const known = [...BUILTIN_SLASH, custom('deploy')];

  it('splits a known command from its arguments', () => {
    expect(parseSlash('/goal ship the README', known)).toMatchObject({ name: 'goal', args: 'ship the README' });
    expect(parseSlash('/compact', known)).toMatchObject({ name: 'compact', args: '' });
    expect(parseSlash('/deploy staging now', known)).toMatchObject({ name: 'deploy', args: 'staging now' });
  });

  it('is case-insensitive on the name', () => {
    expect(parseSlash('/NEW', known)?.name).toBe('new');
  });

  it('returns undefined for an unknown name, a path, or text that does not start with a slash', () => {
    expect(parseSlash('/nope hi', known)).toBeUndefined();
    expect(parseSlash('/usr/bin/foo', known)).toBeUndefined();
    expect(parseSlash('hello /new', known)).toBeUndefined();
    expect(parseSlash('/newer', known)).toBeUndefined();
  });

  it('a custom command with a built-in name wins, so existing .forge/commands keep working', () => {
    const entry = parseSlash('/review the diff', [...BUILTIN_SLASH, custom('review')])?.entry;
    expect(entry?.source).toBe('custom');
  });
});

describe('filterSlash', () => {
  const all = [...BUILTIN_SLASH, custom('deploy')];

  it('returns everything for an empty query', () => {
    expect(filterSlash(all, '')).toHaveLength(all.length);
  });

  it('puts prefix matches first, then substring matches, each in the original order', () => {
    expect(filterSlash(all, 'mo').map((e) => e.name)).toEqual(['model', 'mode', 'memory']);
    expect(filterSlash(all, 'e').map((e) => e.name).slice(0, 2)).toEqual(['export', 'new']);
  });

  it('matches case-insensitively and finds nothing for a stranger', () => {
    expect(filterSlash(all, 'GOAL').map((e) => e.name)).toEqual(['goal']);
    expect(filterSlash(all, 'zzz')).toEqual([]);
  });
});

describe('slashMenuQuery', () => {
  it('opens for a slash at the start, with the word typed so far', () => {
    expect(slashMenuQuery('/', 1)).toBe('');
    expect(slashMenuQuery('/mo', 3)).toBe('mo');
    expect(slashMenuQuery('/new', 4)).toBe('new');
  });

  it('stays closed for a path, mid-sentence slash, text after a space, or a caret past the word', () => {
    expect(slashMenuQuery('/usr/bin/foo', 12)).toBeUndefined();
    expect(slashMenuQuery('hello /new', 10)).toBeUndefined();
    expect(slashMenuQuery('/goal ship it', 13)).toBeUndefined();
    expect(slashMenuQuery('/goal ', 6)).toBeUndefined();
    expect(slashMenuQuery('', 0)).toBeUndefined();
  });
});

describe('webview-lib', () => {
  it('exposes filterSlash and slashMenuQuery on window.ForgeUI, which the composer calls (RB-3)', () => {
    expect(webviewLib.filterSlash).toBe(filterSlash);
    expect(webviewLib.slashMenuQuery).toBe(slashMenuQuery);
    expect(webviewLib.parseSlash).toBe(parseSlash);
  });
});

describe('skills as slash commands', () => {
  const skill = { name: 'tidy', description: 'Tidy imports', body: 'Sort and group the imports.', allowedTools: undefined } as never;

  it('parseSlash finds a skill entry, and a built-in or custom command of the same name wins', () => {
    const entries = [...BUILTIN_SLASH, { name: 'tidy', description: 'd', source: 'skill' as const, takesArgs: true }, { name: 'new', description: 'x', source: 'skill' as const, takesArgs: true }];
    expect(parseSlash('/tidy src', entries)?.entry.source).toBe('skill');
    expect(parseSlash('/new', entries)?.entry.source).toBe('builtin');
  });

  it('expandSkillCommand puts the skill text first and the task after it', () => {
    const out = expandSkillCommand(skill, 'in src/a.ts');
    expect(out).toContain('Sort and group the imports.');
    expect(out).toContain('in src/a.ts');
    expect(out.indexOf('Sort and group')).toBeLessThan(out.indexOf('in src/a.ts'));
  });

  it('with no arguments the skill is applied to the current work', () => {
    expect(expandSkillCommand(skill, '')).toContain('Sort and group the imports.');
  });
});
