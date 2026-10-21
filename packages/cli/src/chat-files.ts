/**
 * Files attached to the conversation with /add and /read-only. Their current
 * contents ride along with every turn (re-read each time, so edits show up),
 * but are stripped from the stored history so they are not repeated forever.
 * Images and PDFs go to the model natively as attachments; other binaries are
 * named but not shown.
 */
import { readFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';

import type { ModelMessage } from 'ai';
import { attachmentKind, makeAttachment, redact, type Attachment } from '@ikarmic/forge-core';

const MAX_FILE_BYTES = 100 * 1024;
const MAX_TOTAL_BYTES = 400 * 1024;

export type ChatFileMode = 'editable' | 'read-only';

export interface AddResult {
  added: string[];
  errors: string[];
}

/** Split a command argument string on whitespace, honouring "double" and 'single' quotes. */
export function splitArgs(args: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const m of args.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3]!);
  return out;
}

/** `rel` when `abs` is inside `cwd` (after resolving symlinks), else null. */
function insideCwd(cwd: string, abs: string): string | null {
  let real: string;
  let root: string;
  try {
    real = realpathSync.native(abs);
    root = realpathSync.native(cwd);
  } catch {
    return null;
  }
  const rel = path.relative(root, real);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

export class ChatFiles {
  private readonly modes = new Map<string, ChatFileMode>();

  constructor(private readonly cwd: string) {}

  /** Add files (space-separated, quotes allowed). Existing entries switch to `mode`. */
  async add(args: string, mode: ChatFileMode): Promise<AddResult> {
    const result: AddResult = { added: [], errors: [] };
    const names = splitArgs(args);
    if (names.length === 0) result.errors.push('usage: give at least one file path');
    for (const name of names) {
      const abs = path.resolve(this.cwd, name);
      let info;
      try {
        info = await stat(abs);
      } catch {
        result.errors.push(`${name}: no such file`);
        continue;
      }
      if (!info.isFile()) {
        result.errors.push(`${name}: not a file (add files one by one)`);
        continue;
      }
      const rel = insideCwd(this.cwd, abs);
      if (!rel) {
        result.errors.push(`${name}: outside the working directory`);
        continue;
      }
      this.modes.set(rel, mode);
      result.added.push(rel);
    }
    return result;
  }

  /** Drop the named files, or everything when `args` is empty. */
  drop(args: string): { dropped: string[]; notFound: string[] } {
    const names = splitArgs(args);
    if (names.length === 0) {
      const dropped = [...this.modes.keys()];
      this.modes.clear();
      return { dropped, notFound: [] };
    }
    const dropped: string[] = [];
    const notFound: string[] = [];
    for (const name of names) {
      const rel = path.relative(this.cwd, path.resolve(this.cwd, name)).split(path.sep).join('/');
      if (this.modes.delete(rel)) dropped.push(rel);
      else notFound.push(name);
    }
    return { dropped, notFound };
  }

  list(): { editable: string[]; readOnly: string[] } {
    const entries = [...this.modes.entries()].sort(([a], [b]) => a.localeCompare(b));
    return {
      editable: entries.filter(([, m]) => m === 'editable').map(([f]) => f),
      readOnly: entries.filter(([, m]) => m === 'read-only').map(([f]) => f),
    };
  }

  /** Every attached file, for ranking the repo map. */
  focusFiles(): string[] {
    return [...this.modes.keys()];
  }

  get size(): number {
    return this.modes.size;
  }

  /**
   * The `<chat-files>` block for the next turn, with secrets redacted, or '' when nothing is
   * attached. Files that vanished are detached and named in `notes`.
   */
  async render(): Promise<{ block: string; notes: string[]; attachments: Attachment[] }> {
    const notes: string[] = [];
    const parts: string[] = [];
    const attachments: Attachment[] = [];
    let total = 0;
    for (const [rel, mode] of [...this.modes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      let raw: Buffer;
      try {
        raw = await readFile(path.join(this.cwd, rel));
      } catch {
        this.modes.delete(rel);
        notes.push(`${rel} no longer exists and was detached`);
        continue;
      }
      // An empty file is still text: it shows as an empty <file> block.
      if (raw.length > 0) {
        let attachment: Attachment;
        try {
          attachment = makeAttachment(rel, raw);
        } catch (err) {
          notes.push(`${rel} left out: ${(err as Error).message.replace(/^Cannot attach [^:]*: /, '')}`);
          continue;
        }
        if (attachmentKind(attachment.mediaType) !== 'text') {
          attachments.push(attachment);
          continue;
        }
      }
      let text = raw.toString('utf8');
      let truncated = false;
      if (Buffer.byteLength(text) > MAX_FILE_BYTES) {
        text = text.slice(0, MAX_FILE_BYTES);
        truncated = true;
      }
      if (total + Buffer.byteLength(text) > MAX_TOTAL_BYTES) {
        notes.push(`${rel} left out: attached files exceed ${MAX_TOTAL_BYTES / 1024} KB`);
        continue;
      }
      total += Buffer.byteLength(text);
      const scrubbed = redact(text);
      if (scrubbed.total > 0) notes.push(`${scrubbed.total} secret${scrubbed.total === 1 ? '' : 's'} redacted in ${rel}`);
      if (truncated) notes.push(`${rel} truncated to ${MAX_FILE_BYTES / 1024} KB`);
      parts.push(`<file path="${rel}" mode="${mode}">\n${scrubbed.text}\n</file>`);
    }
    if (parts.length === 0) return { block: '', notes, attachments };
    return {
      block: `<chat-files>\nThe user attached these files. Their current contents are below. Files marked read-only are reference; do not edit them.\n\n${parts.join('\n\n')}\n</chat-files>`,
      notes,
      attachments,
    };
  }
}

/** Remove the `<chat-files>` block from a stored user message. */
export function stripChatFiles(text: string): string {
  return text.replace(/<chat-files>[\s\S]*?<\/chat-files>\n*/g, '');
}

/**
 * A stored user message without its attached files: the `<chat-files>` block and the
 * attachment parts (they are re-sent while attached, so history needn't repeat them).
 */
export function stripAttachedFiles(message: ModelMessage): ModelMessage {
  if (message.role !== 'user') return message;
  if (typeof message.content === 'string') return { ...message, content: stripChatFiles(message.content) };
  const kept = message.content
    .filter((p) => p.type !== 'file' && p.type !== 'image' && !(p.type === 'text' && p.text.startsWith('Attached file: ')))
    .map((p) => (p.type === 'text' ? { ...p, text: stripChatFiles(p.text) } : p));
  // A message left with one text part goes back to the plain string form.
  if (kept.length === 1 && kept[0]!.type === 'text') return { ...message, content: kept[0]!.text };
  return { ...message, content: kept };
}
