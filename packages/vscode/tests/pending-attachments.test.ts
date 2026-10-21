import { describe, expect, it } from 'vitest';

import {
  cleanName,
  decodeDataUrl,
  MAX_PENDING_ATTACHMENTS,
  MAX_PENDING_BYTES,
  PendingAttachments,
} from '../src/chat/pending-attachments.js';
import { transcriptFromMessages } from '../src/chat/history-protocol.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

describe('decodeDataUrl', () => {
  it('reads any base64 data URL with its declared type', () => {
    const r = decodeDataUrl('data:application/pdf;base64,' + Buffer.from('%PDF-1.4').toString('base64'));
    expect(r?.mime).toBe('application/pdf');
    expect(r?.bytes.toString()).toBe('%PDF-1.4');
    expect(decodeDataUrl('data:;base64,QQ==')).toMatchObject({ mime: '' });
    expect(decodeDataUrl('data:text/plain;charset=utf-8;base64,QQ==')).toMatchObject({ mime: 'text/plain' });
  });

  it('rejects anything else', () => {
    expect(decodeDataUrl('http://x/y.png')).toBeNull();
    expect(decodeDataUrl('data:text/plain,hello')).toBeNull();
    expect(decodeDataUrl(42)).toBeNull();
  });
});

describe('cleanName', () => {
  it('keeps the base name without control characters', () => {
    expect(cleanName('C:\\Users\\me\\shot.png', 'x')).toBe('shot.png');
    expect(cleanName('a\u0000b\n.txt', 'x')).toBe('ab.txt');
    expect(cleanName('', 'pasted file')).toBe('pasted file');
    expect(cleanName(undefined, 'pasted file')).toBe('pasted file');
  });
});

describe('PendingAttachments', () => {
  it('adds, lists, removes and hands over files', () => {
    const p = new PendingAttachments();
    expect(p.add('shot.png', PNG, 'image/png')).toEqual({ ok: true });
    expect(p.add('notes.txt', Buffer.from('hello'), 'text/plain')).toEqual({ ok: true });
    const chips = p.chips();
    expect(chips.map((c) => [c.name, c.kind])).toEqual([
      ['shot.png', 'image'],
      ['notes.txt', 'text'],
    ]);
    expect(chips[0]!.title).toMatch(/shot\.png \(image\/png, 12 B\)/);
    p.remove(chips[0]!.id);
    expect(p.size).toBe(1);
    const taken = p.take();
    expect(taken.map((a) => a.name)).toEqual(['notes.txt']);
    expect(p.size).toBe(0);
    p.restore(taken);
    expect(p.chips().map((c) => c.name)).toEqual(['notes.txt']);
  });

  it('refuses empty files with a reason', () => {
    expect(new PendingAttachments().add('e.txt', Buffer.alloc(0))).toEqual({ ok: false, reason: 'the file is empty' });
  });

  it('caps the count and the total size', () => {
    const p = new PendingAttachments();
    for (let i = 0; i < MAX_PENDING_ATTACHMENTS; i++) expect(p.add(`f${i}.txt`, Buffer.from('x')).ok).toBe(true);
    expect(p.add('one-more.txt', Buffer.from('x'))).toMatchObject({ ok: false, reason: expect.stringMatching(/at most/) });
    const q = new PendingAttachments();
    const half = Buffer.alloc(Math.ceil(MAX_PENDING_BYTES / 2) + 1, 1);
    half[0] = 0; // binary, so it isn't held to the text path
    expect(q.addAttachment({ name: 'a.bin', mediaType: 'application/octet-stream', data: '' }, half.length).ok).toBe(true);
    expect(q.addAttachment({ name: 'b.bin', mediaType: 'application/octet-stream', data: '' }, half.length)).toMatchObject({ ok: false });
  });
});

describe('transcript of a message with attachments', () => {
  it('names each attached file on its own line instead of its contents', () => {
    const items = transcriptFromMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is in these?' },
          { type: 'text', text: 'Attached file: shot.png (image/png, 12 B)' },
          { type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'AAAA' } },
          { type: 'text', text: 'Attached file: a.log\n```\nsecret contents\n```' },
        ],
      },
    ]);
    expect(items).toEqual([{ role: 'user', text: 'what is in these?\n\n📎 shot.png (image/png, 12 B)\n\n📎 a.log' }]);
  });
});
