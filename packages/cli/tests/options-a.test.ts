import { describe, expect, it } from 'vitest';

import { applyModelAliases, parseOptions } from '../src/options.js';

const argv = (...args: string[]) => ['node', 'forge', ...args];

describe('CLI flags (set A)', () => {
  it('--no-cache-prompts sets noCachePrompts', () => {
    expect(parseOptions(argv('task')).options.noCachePrompts).toBe(false);
    expect(parseOptions(argv('--no-cache-prompts', 'task')).options.noCachePrompts).toBe(true);
  });

  it('--architect needs --editor-model', () => {
    expect(() => parseOptions(argv('--architect', 'task'))).toThrow('--architect requires --editor-model <id|alias>');
    const ok = parseOptions(argv('--architect', '--editor-model', 'fast', 'task')).options;
    expect(ok.architect).toBe(true);
    expect(ok.editorModel).toBe('fast');
  });

  it('--architect conflicts with --plan and --spec', () => {
    expect(() => parseOptions(argv('--architect', '--editor-model', 'x', '--plan', 'task'))).toThrow('--architect cannot be combined with --plan or --spec');
    expect(() => parseOptions(argv('--architect', '--editor-model', 'x', '--spec', 'task'))).toThrow('--architect cannot be combined with --plan or --spec');
  });

  it('--editor-reasoning needs --architect and a valid level', () => {
    expect(() => parseOptions(argv('--editor-reasoning', 'low', 'task'))).toThrow('--editor-reasoning requires --architect');
    expect(() => parseOptions(argv('--architect', '--editor-model', 'x', '--editor-reasoning', 'loud', 'task'))).toThrow('--editor-reasoning must be one of');
    expect(parseOptions(argv('--architect', '--editor-model', 'x', '--editor-reasoning', 'low', 'task')).options.editorReasoning).toBe('low');
    expect(parseOptions(argv('task')).options.editorReasoning).toBeNull();
  });

  it('--architect needs a task and cannot be combined with --resume or --schema', () => {
    expect(() => parseOptions(argv('--architect', '--editor-model', 'x'))).toThrow('--architect needs a task');
    expect(() => parseOptions(argv('--architect', '--editor-model', 'x', '--resume', 'task'))).toThrow('--architect cannot be combined with --resume or --schema');
    expect(() => parseOptions(argv('--architect', '--editor-model', 'x', '--schema', 's.json', 'task'))).toThrow('--architect cannot be combined with --resume or --schema');
  });
});

describe('applyModelAliases', () => {
  const aliases = { fast: 'anthropic:claude-haiku-4-5', local: 'qwen2.5-coder' };

  it('rewrites --model and sets the provider from the alias', () => {
    const { options } = parseOptions(argv('--provider', 'openai', '--model', 'fast', 'task'));
    applyModelAliases(options, aliases);
    expect(options.provider).toBe('anthropic');
    expect(options.model).toBe('claude-haiku-4-5');
  });

  it('keeps the provider for a bare alias value', () => {
    const { options } = parseOptions(argv('--provider', 'ollama', '--model', 'local', 'task'));
    applyModelAliases(options, aliases);
    expect(options.provider).toBe('ollama');
    expect(options.model).toBe('qwen2.5-coder');
  });

  it('splits provider:model even when there is no aliases table', () => {
    const { options } = parseOptions(argv('--model', 'anthropic:claude-haiku-4-5', 'task'));
    applyModelAliases(options, undefined);
    expect(options.provider).toBe('anthropic');
    expect(options.model).toBe('claude-haiku-4-5');
  });

  it('leaves non-alias models and missing aliases alone', () => {
    const { options } = parseOptions(argv('--model', 'gpt-4o', 'task'));
    applyModelAliases(options, aliases);
    expect(options.model).toBe('gpt-4o');
    applyModelAliases(options, undefined);
    expect(options.model).toBe('gpt-4o');
  });
});
