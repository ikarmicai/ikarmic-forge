import { stripThinkTags } from '@ikarmic/forge-core';

/**
 * Prompts and text helpers for the editor integrations: inline edit (rewrite the
 * selection in place, shown as a diff first) and the "Fix / Explain with Forge"
 * code actions. vscode-free so it is unit-testable.
 */

export const INLINE_EDIT_SYSTEM = `You edit one selected region of a source file as the user instructs.
Reply with ONLY the new text for the selected region: no explanation, no markdown fences, nothing before or after.
Keep the file's language, style and the selection's indentation. Change only what the instruction asks for.
The code around the selection is context: do not repeat it. An empty reply deletes the selection.`;

/** At most this many lines of context on each side of the selection. */
export const CONTEXT_LINES = 60;

export interface InlineEditInput {
  instruction: string;
  file: string;
  language: string;
  before: string;
  selection: string;
  after: string;
}

export function inlineEditPrompt(input: InlineEditInput): string {
  return [
    `File: ${input.file} (${input.language})`,
    `Instruction: ${input.instruction}`,
    '',
    '<before_selection>',
    input.before,
    '</before_selection>',
    '<selection>',
    input.selection,
    '</selection>',
    '<after_selection>',
    input.after,
    '</after_selection>',
    '',
    'Reply with the replacement for <selection> only.',
  ].join('\n');
}

/** The lines just before and after [startLine, endLine] (0-based, inclusive), as text. */
export function contextAround(lines: readonly string[], startLine: number, endLine: number, n = CONTEXT_LINES): { before: string; after: string } {
  return {
    before: lines.slice(Math.max(0, startLine - n), startLine).join('\n'),
    after: lines.slice(endLine + 1, endLine + 1 + n).join('\n'),
  };
}

/**
 * The model's reply as replacement text: a reply wrapped in one code fence is unwrapped,
 * and the selection's trailing newline is kept or dropped to match the original.
 */
export function extractReplacement(reply: string, original: string): string {
  // Reasoning models put an inline <think> block in the reply. A reply that is only reasoning must not
  // turn into "delete the selection" (a truly empty reply still does, as INLINE_EDIT_SYSTEM says).
  let text = stripThinkTags(reply);
  if (text === '' && reply.trim() !== '') return original;
  const fenced = /^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?\1\s*$/.exec(text);
  if (fenced) text = fenced[2]!;
  const wantsNewline = original.endsWith('\n');
  text = text.replace(/\s+$/, (ws) => (ws.includes('\n') && wantsNewline ? '\n' : ''));
  if (wantsNewline && text.length > 0 && !text.endsWith('\n')) text += '\n';
  return text;
}

export interface DiagnosticInfo {
  message: string;
  /** 1-based. */
  line: number;
  source?: string;
  code?: string;
}

/** A chat task asking Forge to fix one problem, with the code around it. */
export function fixTask(d: DiagnosticInfo, file: string, language: string, excerpt: string): string {
  const where = `${file}:${d.line}`;
  const from = d.source ? ` (${d.source}${d.code ? ` ${d.code}` : ''})` : '';
  return `Fix this problem at ${where}${from}:\n${d.message}\n\nThe code around it:\n\`\`\`${language}\n${excerpt}\n\`\`\`\n\nMake the smallest change that fixes it, then say what was wrong.`;
}

/** A chat task asking Forge to explain a piece of code without changing anything. */
export function explainTask(file: string, language: string, code: string, startLine: number): string {
  return `Explain what this code in ${file} (from line ${startLine}) does, how it works and anything surprising about it. Do not change any files.\n\n\`\`\`${language}\n${code}\n\`\`\``;
}
