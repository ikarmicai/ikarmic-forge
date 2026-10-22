/**
 * Release 5.1.0, Phase 1 (A9, A10): the model side of "Improve with Forge" and terminal Fix / Explain, with the real
 * MiniMax-M3. Skipped without MINIMAX_API_KEY (environment or repo-root .env.local), so CI and the public mirror skip it.
 * The prompts are the ones the commands send (editor-tasks.ts); the editor and terminal plumbing is covered elsewhere.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Agent, createLanguageModel } from '@ikarmic/forge-core';
import { generateText } from 'ai';
import { describe, expect, it } from 'vitest';

import { COMPLETION_SYSTEM_PROMPT, buildPrompt, sanitize } from '../src/completion-helpers.js';
import { IMPROVE_INSTRUCTION, INLINE_EDIT_SYSTEM, extractReplacement, inlineEditPrompt, terminalExplainTask, terminalFixTask } from '../src/editor/editor-tasks.js';

const envFile = path.resolve(__dirname, '../../../.env.local');
if (!process.env.MINIMAX_API_KEY && existsSync(envFile)) {
  const m = /^MINIMAX_API_KEY=(.*)$/m.exec(readFileSync(envFile, 'utf8'));
  if (m) process.env.MINIMAX_API_KEY = m[1]!.trim();
}
const live = Boolean(process.env.MINIMAX_API_KEY);
const model = { provider: 'minimax' as const, model: 'MiniMax-M3' };

describe.skipIf(!live)('live MiniMax-M3: editor and terminal tasks', () => {
  it('A9: Improve rewrites the selection, keeps its behaviour, and leaks no reasoning or fences', async () => {
    const original = [
      'function total(xs) {',
      '  var t = 0;',
      '  for (var i = 0; i < xs.length; i = i + 1) {',
      '    if (xs[i] != null) { t = t + xs[i]; } else { t = t + 0; }',
      '  }',
      '  return t;',
      '}',
    ].join('\n');
    const { text } = await generateText({
      model: createLanguageModel(model),
      system: INLINE_EDIT_SYSTEM,
      prompt: inlineEditPrompt({ instruction: IMPROVE_INSTRUCTION, file: 'sum.js', language: 'javascript', before: '', selection: original, after: '' }),
    });
    const replacement = extractReplacement(text, original);
    expect(replacement).not.toBe(original); // it changed something
    expect(replacement).not.toMatch(/<think>|<\/think>|```/);
    expect(replacement.length).toBeGreaterThan(20);
    // Same behaviour on the inputs that matter.
    const run = (src: string, arg: unknown[]): unknown => new Function(`${src}\nreturn total;`)()(arg);
    for (const arg of [[1, 2, 3], [], [4, null, 5], [0.5, 0.25]]) expect(run(replacement, arg)).toBe(run(original, arg));
  }, 180_000);

  const terminal = ['$ node build.js', '/work/build.js:1', 'consol.log("built");', '^', '', 'ReferenceError: consol is not defined', '    at Object.<anonymous> (/work/build.js:1:1)'].join('\n');

  it('A10: Explain reads only: it names the cause and touches nothing', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'forge-live-explain-'));
    writeFileSync(path.join(dir, 'build.js'), 'consol.log("built");\n');
    const tools: string[] = [];
    // Ask mode cannot edit: no built-in tools at all here.
    const agent = new Agent({ model, cwd: dir, auto: true, maxIterations: 3, disableBuiltins: true });
    const result = await agent.run({ task: terminalExplainTask(terminal), onEvent: (e) => e.type === 'tool_call' && tools.push(e.name) });
    expect(result.finalText.toLowerCase()).toMatch(/consol|typo|misspell|console/);
    expect(tools).toEqual([]);
    expect(readFileSync(path.join(dir, 'build.js'), 'utf8')).toBe('consol.log("built");\n');
  }, 180_000);

  it('A10: Fix changes the file that caused the error', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'forge-live-fix-'));
    writeFileSync(path.join(dir, 'build.js'), 'consol.log("built");\n');
    const agent = new Agent({ model, cwd: dir, auto: true, allowDestructive: true, maxIterations: 8 });
    await agent.run({ task: terminalFixTask(terminal) });
    const fixed = readFileSync(path.join(dir, 'build.js'), 'utf8');
    expect(fixed).toContain('console.log');
    expect(fixed).not.toContain('consol.log');
  }, 240_000);

  it('A15: as the completion model, M3 returns usable text within the default 512-token cap', async () => {
    const prefix = ['// add two numbers', 'function add(a, b) {', '  return a'].join('\n');
    const { text, usage, finishReason } = await generateText({
      model: createLanguageModel(model),
      system: COMPLETION_SYSTEM_PROMPT,
      prompt: buildPrompt('javascript', prefix, ''),
      maxOutputTokens: 512,
      temperature: 0.2,
    });
    console.log('M3 completion raw:', JSON.stringify(text.slice(0, 200)), 'finish:', finishReason, 'out tokens:', usage?.outputTokens);
    const cleaned = sanitize(text);
    expect(cleaned.length).toBeGreaterThan(0);
    expect(cleaned).not.toMatch(/<think>|<\/think>/);
  }, 120_000);
});
