import { describe, expect, it } from 'vitest';

import { docsCandidates, mentionSuggestions as suggest, parseMentions, resolveMentions, type MentionResolvers } from '../src/chat/mentions.js';

describe('parseMentions', () => {
  it('recognizes each form', () => {
    const m = parseMentions('see @src/app.ts and @file:README.md, @folder:src/lib @symbol:parseFoo @problems @terminal @git @git:staged');
    expect(m.map((x) => x.raw)).toEqual(['@src/app.ts', '@file:README.md', '@folder:src/lib', '@symbol:parseFoo', '@problems', '@terminal', '@git', '@git:staged']);
    expect(m[0]).toMatchObject({ kind: 'file', value: 'src/app.ts' });
    expect(m[6]).toMatchObject({ kind: 'git', value: 'working' });
    expect(m[7]).toMatchObject({ kind: 'git', value: 'staged' });
  });

  it('ignores emails, plain words after @, handles and duplicates; strips sentence punctuation', () => {
    expect(parseMentions('mail me at bob@example.com')).toEqual([]);
    expect(parseMentions('thanks @bob!')).toEqual([]);
    expect(parseMentions('@src/a.ts and again @src/a.ts')).toHaveLength(1);
    expect(parseMentions('look at @src/a.ts.')[0]).toMatchObject({ value: 'src/a.ts' });
    expect(parseMentions('(@src/a.ts)')[0]).toMatchObject({ value: 'src/a.ts' });
  });

  it('a bare token needs a path separator or extension to count as a file', () => {
    expect(parseMentions('@README.md')[0]).toMatchObject({ kind: 'file' });
    const bs = String.fromCharCode(92);
    expect(parseMentions(`@src${bs}win${bs}file.ts`)[0]).toMatchObject({ kind: 'file' });
    expect(parseMentions('@random')).toEqual([]);
  });
});

const resolvers = (over: Partial<MentionResolvers> = {}): MentionResolvers => ({
  file: async (p) => (p === 'a.ts' ? 'const a = 1;' : null),
  folder: async (p) => (p === 'src' ? 'a.ts\nb.ts' : null),
  symbol: async (n) => (n === 'foo' ? 'src/a.ts:1 function foo' : null),
  problems: async () => 'a.ts:1:1 error TS1 boom',
  terminal: async () => '$ npm test\nfail',
  git: async (k) => `diff (${k})`,
  ...over,
});

describe('resolveMentions', () => {
  it('appends context blocks and reports attachments', async () => {
    const r = await resolveMentions('fix @a.ts and @problems', resolvers());
    expect(r.prompt.startsWith('fix @a.ts and @problems\n\n')).toBe(true);
    expect(r.prompt).toContain('<context type="file" path="a.ts">\nconst a = 1;\n</context>');
    expect(r.prompt).toContain('<context type="problems">');
    expect(r.attached.map((a) => a.label)).toEqual(['@a.ts', '@problems']);
    expect(r.unresolved).toEqual([]);
  });

  it('returns the text unchanged when there are no mentions', async () => {
    expect(await resolveMentions('hello', resolvers())).toEqual({ prompt: 'hello', attached: [], unresolved: [] });
  });

  it('reports missing targets instead of failing, and survives a throwing resolver', async () => {
    const r = await resolveMentions('@missing.ts @symbol:nope @git', resolvers({ git: async () => { throw new Error('no repo'); } }));
    expect(r.unresolved).toEqual(['@missing.ts', '@symbol:nope', '@git']);
    expect(r.prompt).toBe('@missing.ts @symbol:nope @git');
  });

  it('routes a bare path to the folder resolver when it is a directory', async () => {
    const r = await resolveMentions('@src/lib', resolvers({ isDirectory: async () => true, folder: async () => 'x.ts' }));
    expect(r.prompt).toContain('type="folder" path="src/lib"');
  });

  it('truncates per mention and stops at the total budget', async () => {
    const big = 'x'.repeat(500);
    const r = await resolveMentions('@a.ts @b.ts @c.ts', resolvers({ file: async () => big }), { maxEach: 100, maxTotal: 250 });
    expect(r.attached[0]).toMatchObject({ truncated: true });
    expect(r.attached.length).toBeLessThanOrEqual(3);
    expect(r.unresolved.some((u) => u.includes('budget'))).toBe(true);
  });

  it('states an empty result explicitly for keyword mentions', async () => {
    const r = await resolveMentions('@problems', resolvers({ problems: async () => '' }));
    expect(r.prompt).toContain('(empty)');
  });

  it('escapes quotes in attribute values', async () => {
    const r = await resolveMentions('@file:a"b.ts', resolvers({ file: async () => 'x' }));
    expect(r.prompt).toContain('path="a&quot;b.ts"');
  });
});

import { mentionSuggestions } from '../src/chat/mentions.js';

describe('mentionSuggestions', () => {
  const files = ['src/app.ts', 'src/lib/parser.ts', 'README.md', 'docs/parser-notes.md'];

  it('offers keywords for a matching prefix and all four for an empty query', () => {
    expect(mentionSuggestions('pro', files).map((s) => s.value)).toEqual(['problems']);
    expect(mentionSuggestions('', files).slice(0, 4).map((s) => s.value)).toEqual(['problems', 'git', 'git:staged', 'terminal']);
    expect(mentionSuggestions('git', files).map((s) => s.value)).toEqual(['git', 'git:staged']);
  });

  it('ranks file-name matches above directory matches, shorter first', () => {
    expect(mentionSuggestions('parser', files).map((s) => s.value)).toEqual(['src/lib/parser.ts', 'docs/parser-notes.md']);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 30 }, (_, i) => `f${i}.ts`);
    expect(mentionSuggestions('f', many, 5)).toHaveLength(5);
  });
});

import { stripContextBlocks } from '../src/chat/mentions.js';

describe('stripContextBlocks', () => {
  it('round-trips with resolveMentions', async () => {
    const r = await resolveMentions('fix @a.ts and @problems', resolvers());
    expect(r.prompt).not.toBe('fix @a.ts and @problems');
    expect(stripContextBlocks(r.prompt)).toBe('fix @a.ts and @problems');
  });
  it('leaves ordinary text alone', () => {
    expect(stripContextBlocks('plain <b>html</b>')).toBe('plain <b>html</b>');
  });
});

describe('web mentions', () => {
  it('parses @https://… , @url:… and @docs:<name>', () => {
    const m = parseMentions('read @https://vite.dev/guide?x=1#a, then @url:http://example.com/a and @docs:Vite.');
    expect(m).toEqual([
      { kind: 'url', value: 'https://vite.dev/guide?x=1#a', raw: '@https://vite.dev/guide?x=1#a' },
      { kind: 'url', value: 'http://example.com/a', raw: '@url:http://example.com/a' },
      { kind: 'docs', value: 'vite', raw: '@docs:Vite' },
    ]);
    expect(parseMentions('@url:ftp://x')).toEqual([]);
    expect(parseMentions('@https:nothing')).toEqual([]);
  });

  it('attaches pages and docs, and reports what could not be fetched', async () => {
    const r = await resolveMentions(
      'see @https://a.dev and @docs:vite and @docs:nope',
      resolvers({ url: async (u) => `PAGE ${u}`, docs: async (n) => (n === 'vite' ? 'VITE DOCS' : null) })
    );
    expect(r.prompt).toContain('<context type="url" url="https://a.dev">\nPAGE https://a.dev\n</context>');
    expect(r.prompt).toContain('<context type="docs" name="vite">\nVITE DOCS\n</context>');
    expect(r.unresolved).toEqual(['@docs:nope']);
    // Without web resolvers (e.g. an older host), the mentions are just unresolved.
    expect((await resolveMentions('@https://a.dev', resolvers())).unresolved).toEqual(['@https://a.dev']);
  });

  it('prefers a site llms.txt for docs', () => {
    expect(docsCandidates('https://vite.dev/guide/')).toEqual(['https://vite.dev/llms.txt', 'https://vite.dev/guide/']);
    expect(docsCandidates('https://x.dev/llms-full.txt')).toEqual(['https://x.dev/llms-full.txt']);
  });

  it('suggests configured docs sources', () => {
    expect(suggest('docs:v', [], 8, ['vite', 'react']).map((s) => s.value)).toEqual(['docs:vite']);
    expect(suggest('rea', [], 8, ['vite', 'react']).map((s) => s.value)).toEqual(['docs:react']);
    expect(suggest('', [], 8, ['vite']).some((s) => s.value.startsWith('docs:'))).toBe(false);
  });
});

describe('@chat mentions', () => {
  it('parses @chat:<ref>', () => {
    expect(parseMentions('see @chat:last and @chat:refactor-auth')).toEqual([
      { kind: 'chat', value: 'last', raw: '@chat:last' },
      { kind: 'chat', value: 'refactor-auth', raw: '@chat:refactor-auth' },
    ]);
  });

  it('attaches the chat text as a context block, or reports it unresolved', async () => {
    const resolvers = { chat: async (ref: string) => (ref === 'last' ? 'User: hi\n\nAssistant: hello' : null) } as never;
    const ok = await resolveMentions('continue from @chat:last', resolvers);
    expect(ok.prompt).toContain('<context type="chat" ref="last">');
    expect(ok.prompt).toContain('Assistant: hello');
    const bad = await resolveMentions('see @chat:nope', resolvers);
    expect(bad.unresolved).toEqual(['@chat:nope']);
  });

  it('is suggested after typing @c', () => {
    expect(mentionSuggestions('chat', []).map((s) => s.value)).toContain('chat:last');
  });
});
