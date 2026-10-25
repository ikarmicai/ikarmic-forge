import { describe, expect, it } from 'vitest';

import { approvalCopy, approvalLogText, isProgressResult, summarizeTool } from '../src/chat/tool-summary.js';

const done = (result: unknown, isError = false) => ({ result, isError });

describe('summarizeTool: running (no outcome)', () => {
  it('uses the running verb and the file basename', () => {
    const s = summarizeTool('read_file', { path: 'src/auth/session.ts' });
    expect(s).toMatchObject({ verb: 'Reading', target: 'session.ts', title: 'src/auth/session.ts' });
    expect(s.meta).toBeUndefined();
  });

  it('names the files an apply_patch touches', () => {
    const patch = ['*** Begin Patch', '*** Update File: src/a.ts', '@@', '-a', '+b', '*** Add File: docs/n.md', '+x', '*** End Patch'].join('\n');
    const s = summarizeTool('apply_patch', { patch });
    expect(s.target).toBe('a.ts, n.md');
    expect(s.title).toBe('src/a.ts, docs/n.md');
  });

  it('shows the line delta and diff for edit_file before it runs', () => {
    const s = summarizeTool('edit_file', { path: 'a/b.ts', old_text: 'x', new_text: 'y\nz\nw' });
    expect(s).toMatchObject({ verb: 'Editing', target: 'b.ts', meta: '+3 −1' });
    expect(s.diff).toEqual({ before: 'x', after: 'y\nz\nw' });
  });

  it('clips long commands and keeps the full text in title', () => {
    const cmd = 'pnpm vitest run ' + 'tests/'.repeat(20);
    const s = summarizeTool('run_command', { command: cmd });
    expect(s.verb).toBe('Running');
    expect(s.target.length).toBeLessThanOrEqual(60);
    expect(s.target.endsWith('…')).toBe(true);
    expect(s.title).toBe(cmd);
  });

  it('marks a multi-line command as clipped', () => {
    expect(summarizeTool('run_command', { command: 'echo a\necho b' }).target).toBe('echo a…');
  });
});

describe('summarizeTool: done', () => {
  it.each([
    ['read_file', { path: 'a.ts' }, { path: '/x/a.ts', totalLines: 84 }, 'Read', 'a.ts', '84 lines'],
    ['list_files', {}, { entries: [1, 2, 3] }, 'Listed', '.', '3 entries'],
    ['list_files', { path: 'src' }, { entries: [1] }, 'Listed', 'src', '1 entry'],
    ['search_files', { pattern: 'mockUser' }, { matches: [1, 2] }, 'Searched', '"mockUser"', '2 matches'],
    ['codebase_search', { query: 'session cache' }, { results: [1] }, 'Searched code', '"session cache"', '1 result'],
    ['find_symbol', { name: 'getUser' }, { matches: [] }, 'Found', 'getUser', '0 matches'],
    ['find_references', { name: 'getUser' }, { references: [1, 2] }, 'Found references to', 'getUser', '2 references'],
    ['git_diff', { base: 'main' }, 'diff text', 'Read the diff', 'against main', undefined],
    ['git_diff', { staged: true }, 'diff text', 'Read the diff', 'staged', undefined],
    ['dependency_audit', {}, 'npm audit --json (package-lock.json): 0 known vulnerabilities', 'Audited dependencies', '', undefined],
    ['list_symbols', { path: 'src/a.ts' }, { symbols: [1] }, 'Listed symbols in', 'a.ts', '1 symbol'],
    ['fetch_url', { url: 'https://docs.example.com/guide/' }, { status: 200 }, 'Fetched', 'docs.example.com/guide/', '200'],
    ['read_image', { path: 'img/logo.png' }, {}, 'Viewed', 'logo.png', undefined],
    ['memory_read', { scope: 'project', section: 'Build' }, {}, 'Read memory', 'project · Build', undefined],
    ['memory_write', { scope: 'user', heading: 'Style' }, {}, 'Saved memory', 'user · Style', undefined],
    ['memory_forget', { scope: 'project', heading: 'Style' }, {}, 'Forgot memory', 'project · Style', undefined],
    ['browser', { action: 'open', url: 'http://localhost:3000' }, {}, 'Browser', 'open http://localhost:3000', undefined],
    ['sub_agent', { task: 'Write tests for the cache layer' }, {}, 'Delegated', 'Write tests for the cache layer', undefined],
  ])('%s', (name, args, result, verb, target, meta) => {
    const s = summarizeTool(name, args, done(result));
    expect(s.verb).toBe(verb);
    expect(s.target).toBe(target);
    expect(s.meta).toBe(meta);
  });

  it('shows a diff for write_file only when the file was created', () => {
    expect(summarizeTool('write_file', { path: 'n.ts', content: 'a\nb' }, done({ created: true })).diff).toEqual({ before: '', after: 'a\nb' });
    const over = summarizeTool('write_file', { path: 'n.ts', content: 'a\nb' }, done({ created: false }));
    expect(over.diff).toBeUndefined();
    expect(over.meta).toBe('2 lines');
  });

  it('flags a non-zero exit code and a timeout', () => {
    expect(summarizeTool('run_command', { command: 'pnpm test' }, done({ exitCode: 1 }))).toMatchObject({ meta: 'exit 1', metaTone: 'err' });
    expect(summarizeTool('run_command', { command: 'pnpm test' }, done({ exitCode: 0 })).meta).toBeUndefined();
    expect(summarizeTool('run_command', { command: 'sleep 99' }, done({ exitCode: null, timedOut: true }))).toMatchObject({ meta: 'timed out', metaTone: 'err' });
  });

  it('flags HTTP errors from fetch_url', () => {
    expect(summarizeTool('fetch_url', { url: 'https://a.dev/x' }, done({ status: 404 }))).toMatchObject({ meta: '404', metaTone: 'err' });
  });

  it('shows the first error line when isError', () => {
    const s = summarizeTool('read_file', { path: 'a.ts' }, done('ENOENT: no such file\n    at open', true));
    expect(s).toMatchObject({ verb: 'Read', meta: 'ENOENT: no such file', metaTone: 'err' });
    expect(summarizeTool('read_file', { path: 'a.ts' }, done({ code: 1 }, true)).meta).toBe('failed');
  });

  it('treats a user denial as a failure even though isError is false', () => {
    const s = summarizeTool('edit_file', { path: 'a.ts', old_text: 'a', new_text: 'b' }, done('Denied by user. Use a factory', false));
    expect(s).toMatchObject({ meta: 'denied', metaTone: 'err' });
    expect(s.diff).toBeUndefined();
  });
});

describe('summarizeTool: unknown and malformed', () => {
  it('falls back to the tool name and the first string arg for MCP tools', () => {
    const s = summarizeTool('github__create_issue', { owner: 7, title: 'Login test fails' });
    expect(s).toMatchObject({ verb: 'github__create_issue', target: 'Login test fails', title: 'Login test fails' });
  });

  it.each([null, undefined, 'a string', ['array'], 42])('never throws on args = %j', (args) => {
    expect(() => summarizeTool('read_file', args)).not.toThrow();
    expect(() => summarizeTool('mcp_tool', args, done(undefined))).not.toThrow();
    expect(summarizeTool('read_file', args).target).toBe('');
  });

  it('survives a bad URL', () => {
    expect(summarizeTool('fetch_url', { url: 'not a url' }).target).toBe('not a url');
  });
});

describe('isProgressResult', () => {
  it('detects sub_agent child progress only', () => {
    expect(isProgressResult('sub_agent', '[child] tool_call')).toBe(true);
    expect(isProgressResult('sub_agent', { finalText: 'done' })).toBe(false);
    expect(isProgressResult('read_file', '[child] x')).toBe(false);
  });
});

describe('approvalCopy / approvalLogText', () => {
  it('words an edit approval', () => {
    const c = approvalCopy('edit_file', { path: 'tests/auth/login.test.ts', old_text: '', new_text: 'a\nb\nc\nd' }, false);
    expect(c).toMatchObject({ question: 'Edit', target: 'login.test.ts', title: 'tests/auth/login.test.ts', meta: '+4 −0', primary: 'Approve', destructive: false });
  });

  it('uses Run for commands and Hold to run when destructive', () => {
    expect(approvalCopy('run_command', { command: 'pnpm add zod' }, false).primary).toBe('Run');
    expect(approvalCopy('run_command', { command: 'rm -rf dist' }, true)).toMatchObject({ question: 'Run', target: 'rm -rf dist', primary: 'Hold to run' });
  });

  it('falls back to the tool name for unknown tools', () => {
    expect(approvalCopy('mcp__deploy', { env: 'prod' }, false)).toMatchObject({ question: 'mcp__deploy', target: 'prod' });
  });

  it('writes log lines for every outcome', () => {
    const c = approvalCopy('run_command', { command: 'rm -rf dist' }, true);
    expect(approvalLogText(c, { kind: 'approved' })).toBe('✓ Approved: Run rm -rf dist');
    expect(approvalLogText(c, { kind: 'denied', note: 'keep dist' })).toBe('✗ Denied: Run rm -rf dist — “keep dist”');
    expect(approvalLogText(c, { kind: 'denied' })).toBe('✗ Denied: Run rm -rf dist');
    expect(approvalLogText(c, { kind: 'partial' })).toBe('✓ Partly approved (hunk review): Run rm -rf dist');
    expect(approvalLogText(c, { kind: 'cancelled' })).toBe('Cancelled: Run rm -rf dist');
  });
});
