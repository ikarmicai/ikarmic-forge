/**
 * Pure helpers for the REPL's I/O commands: /copy, /copy-context, /editor, /report and /help <question>.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ModelMessage } from 'ai';

import { isCompactionSummary, toolLabel, type ModelConfig } from '@ikarmic/forge-core';

/** Text of one message's content: a string, or the text parts of a structured message. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((p): p is { type: 'text'; text: string } => typeof p === 'object' && p !== null && (p as { type?: unknown }).type === 'text' && typeof (p as { text?: unknown }).text === 'string')
    .map((p) => p.text)
    .join('');
}

/** The last assistant reply that has text (a turn that only called tools has none). */
export function lastAssistantText(history: readonly ModelMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.role !== 'assistant') continue;
    const text = textOf(m.content).trim();
    if (text) return text;
  }
  return null;
}

function toolCallNames(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((p): p is { type: 'tool-call'; toolName: string } => typeof p === 'object' && p !== null && (p as { type?: unknown }).type === 'tool-call')
    .map((p) => p.toolName);
}

/** The conversation as Markdown, to paste into a web chat. Tool results and the system prompt are left out. */
export function conversationMarkdown(history: readonly ModelMessage[]): string {
  const parts: string[] = [];
  for (const m of history) {
    if (isCompactionSummary(m)) continue;
    if (m.role === 'user') {
      const text = textOf(m.content).trim();
      if (text) parts.push(`#### User\n\n${text}`);
    } else if (m.role === 'assistant') {
      const text = textOf(m.content).trim();
      const tools = toolCallNames(m.content);
      const note = tools.length > 0 ? `*(used: ${[...new Set(tools)].map(toolLabel).join(', ')})*` : '';
      const body = [text, note].filter(Boolean).join('\n\n');
      if (body) parts.push(`#### Assistant\n\n${body}`);
    }
  }
  return parts.join('\n\n');
}

/** `$VISUAL`, then `$EDITOR`, then a platform default. */
export function resolveEditor(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  return env.VISUAL?.trim() || env.EDITOR?.trim() || (platform === 'win32' ? 'notepad' : 'vi');
}

/** Run an editor command on a file with the terminal handed over to it. Resolves with the exit code. */
export type EditorSpawner = (command: string, file: string) => Promise<number | null>;

export const spawnEditor: EditorSpawner = (command, file) =>
  new Promise((resolve) => {
    const quoted = /^[A-Za-z0-9_./\\:-]+$/.test(file) ? file : `"${file}"`;
    const child = spawn(`${command} ${quoted}`, { shell: true, stdio: 'inherit' });
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code));
  });

export type EditorResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * Let the user write a prompt in their editor: a temp file seeded with `initial`, opened in the editor,
 * read back when it closes. An empty result (or a failing editor) is reported, not sent.
 */
export async function composeInEditor(
  initial: string,
  opts: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; spawner?: EditorSpawner } = {}
): Promise<EditorResult> {
  const editor = resolveEditor(opts.env, opts.platform);
  const spawner = opts.spawner ?? spawnEditor;
  const dir = await mkdtemp(path.join(tmpdir(), 'forge-editor-'));
  const file = path.join(dir, 'prompt.md');
  try {
    await writeFile(file, initial, 'utf8');
    const code = await spawner(editor, file);
    if (code === null) return { ok: false, error: `could not start "${editor}" (set $VISUAL or $EDITOR)` };
    if (code !== 0) return { ok: false, error: `"${editor}" exited with code ${code}` };
    const text = (await readFile(file, 'utf8')).trim();
    return text ? { ok: true, text } : { ok: false, error: 'the file was empty, so nothing was sent' };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export interface ReportInfo {
  version: string;
  platform: string;
  node: string;
  model: ModelConfig;
  sessionId: string;
}

const ISSUES_URL = 'https://github.com/ikarmicai/ikarmic-forge/issues/new';

/** A prefilled "new issue" link. Diagnostics only: no keys, paths, prompts or file contents. */
export function reportUrl(info: ReportInfo): string {
  const body = [
    '**What happened**',
    '',
    '',
    '**What I expected**',
    '',
    '',
    '**Diagnostics**',
    `- Forge: ${info.version}`,
    `- Platform: ${info.platform}`,
    `- Node: ${info.node}`,
    `- Model: ${info.model.provider}:${info.model.model}`,
  ].join('\n');
  return `${ISSUES_URL}?${new URLSearchParams({ title: '', body }).toString()}`;
}

/** The task for `/help <question>`: answer from the command reference only. */
export function helpQuestionTask(question: string, reference: string): string {
  return [
    'Answer this question about how to use Forge, the coding agent this conversation is running in.',
    'Use only the reference below. If it does not cover the question, say so instead of guessing.',
    '',
    `Question: ${question}`,
    '',
    `<forge-reference>\n${reference.trim()}\n</forge-reference>`,
  ].join('\n');
}
