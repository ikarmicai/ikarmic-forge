import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChatFiles, splitArgs, stripAttachedFiles, stripChatFiles } from '../src/chat-files.js';

let cwd: string;
let outside: string;
const put = (rel: string, text: string, root = cwd) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
};
beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'forge-chatfiles-'));
  outside = mkdtempSync(path.join(tmpdir(), 'forge-outside-'));
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('splitArgs', () => {
  it('splits on whitespace and honours quotes', () => {
    expect(splitArgs('a.ts  b.ts')).toEqual(['a.ts', 'b.ts']);
    expect(splitArgs('"my file.ts" \'other file.ts\' c.ts')).toEqual(['my file.ts', 'other file.ts', 'c.ts']);
    expect(splitArgs('   ')).toEqual([]);
  });
});

describe('ChatFiles', () => {
  it('adds files with a mode, lists them sorted, and reports problems per file', async () => {
    put('src/b.ts', 'b');
    put('src/a.ts', 'a');
    mkdirSync(path.join(cwd, 'dir'));
    const files = new ChatFiles(cwd);
    const res = await files.add('src/b.ts src/a.ts missing.ts dir', 'editable');
    expect(res.added).toEqual(['src/b.ts', 'src/a.ts']);
    expect(res.errors).toEqual(['missing.ts: no such file', 'dir: not a file (add files one by one)']);
    await files.add('src/b.ts', 'read-only'); // switching mode
    expect(files.list()).toEqual({ editable: ['src/a.ts'], readOnly: ['src/b.ts'] });
    expect(files.focusFiles().sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(files.size).toBe(2);
    expect((await new ChatFiles(cwd).add('', 'editable')).errors).toHaveLength(1);
  });

  it('refuses files outside the working directory, including through a symlink', async () => {
    put('secret.txt', 'top secret', outside);
    symlinkSync(path.join(outside, 'secret.txt'), path.join(cwd, 'link.txt'));
    const files = new ChatFiles(cwd);
    const res = await files.add(`${path.join(outside, 'secret.txt')} ../${path.basename(outside)}/secret.txt link.txt`, 'editable');
    expect(res.added).toEqual([]);
    expect(res.errors.every((e) => e.endsWith('outside the working directory'))).toBe(true);
    expect(res.errors).toHaveLength(3);
    expect(files.size).toBe(0);
  });

  it('drops named files or everything', async () => {
    put('a.ts', 'a');
    put('b.ts', 'b');
    const files = new ChatFiles(cwd);
    await files.add('a.ts b.ts', 'editable');
    expect(files.drop('a.ts nope.ts')).toEqual({ dropped: ['a.ts'], notFound: ['nope.ts'] });
    expect(files.drop('')).toEqual({ dropped: ['b.ts'], notFound: [] });
    expect(files.size).toBe(0);
  });

  it('renders current contents with modes, and re-reads on every call', async () => {
    put('a.ts', 'one');
    const files = new ChatFiles(cwd);
    await files.add('a.ts', 'editable');
    const first = await files.render();
    expect(first.block).toContain('<file path="a.ts" mode="editable">\none\n</file>');
    put('a.ts', 'two');
    expect((await files.render()).block).toContain('two');
    expect((await new ChatFiles(cwd).render()).block).toBe('');
  });

  it('redacts secrets in attached files and says so', async () => {
    const key = `AKIA${'A1B2C3D4E5F6G7H8'}`;
    put('.env', `AWS_ACCESS_KEY_ID=${key}\n`);
    const files = new ChatFiles(cwd);
    await files.add('.env', 'read-only');
    const { block, notes } = await files.render();
    expect(block).not.toContain(key);
    expect(notes.join(' ')).toMatch(/redacted in \.env/);
  });

  it('detaches files that disappear and truncates huge ones', async () => {
    put('gone.ts', 'x');
    put('big.ts', 'y'.repeat(150 * 1024));
    const files = new ChatFiles(cwd);
    await files.add('gone.ts big.ts', 'editable');
    rmSync(path.join(cwd, 'gone.ts'));
    const { block, notes } = await files.render();
    expect(notes).toContain('gone.ts no longer exists and was detached');
    expect(notes.some((n) => n.startsWith('big.ts truncated'))).toBe(true);
    expect(block.length).toBeLessThan(110 * 1024);
    expect(files.list().editable).toEqual(['big.ts']);
  });

  it('stripChatFiles removes the block and leaves the task', async () => {
    put('a.ts', 'one');
    const files = new ChatFiles(cwd);
    await files.add('a.ts', 'editable');
    const { block } = await files.render();
    expect(stripChatFiles(`${block}\n\nfix the bug`)).toBe('fix the bug');
    expect(stripChatFiles('no block here')).toBe('no block here');
  });

  it('sends images and PDFs as attachments, not text', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
    writeFileSync(path.join(cwd, 'shot.png'), png);
    writeFileSync(path.join(cwd, 'spec.pdf'), Buffer.from('%PDF-1.7\n\0body'));
    put('a.ts', 'code');
    const files = new ChatFiles(cwd);
    await files.add('shot.png spec.pdf a.ts', 'read-only');
    const { block, attachments } = await files.render();
    expect(attachments.map((a) => [a.name, a.mediaType])).toEqual([
      ['shot.png', 'image/png'],
      ['spec.pdf', 'application/pdf'],
    ]);
    expect(block).toContain('<file path="a.ts"');
    expect(block).not.toContain('shot.png');
  });

  it('stripAttachedFiles drops the block and attachment parts from stored history', () => {
    const msg = {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: '<chat-files>\nx\n</chat-files>\n\nfix it' },
        { type: 'text' as const, text: 'Attached file: shot.png (image/png, 12 B)' },
        { type: 'file' as const, mediaType: 'image/png', data: 'AAAA' },
      ],
    };
    expect(stripAttachedFiles(msg)).toEqual({ role: 'user', content: 'fix it' });
    expect(stripAttachedFiles({ role: 'user', content: '<chat-files>\nx\n</chat-files>\nhi' })).toEqual({ role: 'user', content: 'hi' });
    const assistant = { role: 'assistant' as const, content: 'ok' };
    expect(stripAttachedFiles(assistant)).toBe(assistant);
  });
});
