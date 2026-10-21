/**
 * Files pasted, dropped or picked into the chat input, waiting for the next message.
 * They go to the model natively with that message (see core's attachments.ts) and are
 * never written into the workspace. Pure; the webview plumbing lives in chat-view.
 */
import {
  attachmentKind,
  describeAttachment,
  makeAttachment,
  MAX_ATTACHMENT_BYTES,
  type Attachment,
  type AttachmentKind,
} from '@ikarmic/forge-core';

/** At most this many files on one message. */
export const MAX_PENDING_ATTACHMENTS = 10;
/** And at most this much in total, so one message stays within provider request limits. */
export const MAX_PENDING_BYTES = MAX_ATTACHMENT_BYTES * 1.5;

export interface AttachmentChip {
  id: string;
  name: string;
  kind: AttachmentKind;
  /** e.g. `shot.png (image/png, 120.4 KB)` */
  title: string;
}

export type AddOutcome = { ok: true } | { ok: false; reason: string };

/** Bytes of a `data:<type>;base64,<data>` URL plus its declared type, or null when it isn't one. */
export function decodeDataUrl(dataUrl: unknown): { mime: string; bytes: Buffer } | null {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:([^;,]*)((?:;[^;,]*)*);base64,([A-Za-z0-9+/=]*)$/.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1] ?? '', bytes: Buffer.from(m[3]!, 'base64') };
}

/** A safe display name: the base name, without control characters, never empty. */
export function cleanName(name: unknown, fallback: string): string {
  const base = typeof name === 'string' ? (name.split(/[\\/]/).pop() ?? '') : '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  return clean || fallback;
}

export class PendingAttachments {
  private items: Array<{ id: string; attachment: Attachment; bytes: number }> = [];
  private nextId = 1;

  /** Add raw bytes; refuses (with a readable reason) past the count/size caps or when unattachable. */
  add(name: string, bytes: Uint8Array, declaredType?: string): AddOutcome {
    if (this.items.length >= MAX_PENDING_ATTACHMENTS) return { ok: false, reason: `at most ${MAX_PENDING_ATTACHMENTS} files per message` };
    if (this.totalBytes() + bytes.length > MAX_PENDING_BYTES) {
      return { ok: false, reason: `attachments on one message are limited to ${MAX_PENDING_BYTES / 1024 / 1024} MB` };
    }
    try {
      this.push(makeAttachment(name, bytes, declaredType || undefined), bytes.length);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: (err as Error).message.replace(/^Cannot attach [^:]*: /, '') };
    }
  }

  /** Add an attachment that was already built (e.g. loaded from disk). */
  addAttachment(attachment: Attachment, bytes: number): AddOutcome {
    if (this.items.length >= MAX_PENDING_ATTACHMENTS) return { ok: false, reason: `at most ${MAX_PENDING_ATTACHMENTS} files per message` };
    if (this.totalBytes() + bytes > MAX_PENDING_BYTES) {
      return { ok: false, reason: `attachments on one message are limited to ${MAX_PENDING_BYTES / 1024 / 1024} MB` };
    }
    this.push(attachment, bytes);
    return { ok: true };
  }

  remove(id: string): void {
    this.items = this.items.filter((i) => i.id !== id);
  }

  /** Hand every pending attachment over (for the message being sent) and clear the list. */
  take(): Attachment[] {
    const out = this.items.map((i) => i.attachment);
    this.items = [];
    return out;
  }

  /** Put attachments back, e.g. when the message they rode on did not run. */
  restore(attachments: readonly Attachment[]): void {
    for (const a of attachments) this.push(a, Buffer.byteLength(a.data, 'base64'));
  }

  chips(): AttachmentChip[] {
    return this.items.map(({ id, attachment: a }) => ({ id, name: a.name, kind: attachmentKind(a.mediaType), title: describeAttachment(a) }));
  }

  get size(): number {
    return this.items.length;
  }

  private push(attachment: Attachment, bytes: number): void {
    this.items.push({ id: `a${this.nextId++}`, attachment, bytes });
  }

  private totalBytes(): number {
    return this.items.reduce((n, i) => n + i.bytes, 0);
  }
}
