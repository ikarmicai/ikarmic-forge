/**
 * RB-85: the terminal app could not use a provider from `customProviders` (or a preset such as DeepSeek), though the
 * config docs say `id:model` works. The CLI never registered them, split `--model` with a parser that knows only the
 * built-in providers, and `--provider deepseek` crashed with a raw JavaScript error.
 */
import { registerCustomProviders } from '@ikarmic/forge-core';
import { afterEach, describe, expect, it } from 'vitest';

import { applyModelAliases, parseOptions } from '../src/options.js';

const argv = (...args: string[]) => ['node', 'forge', ...args];

afterEach(() => registerCustomProviders(undefined));

describe('named providers in the terminal app (RB-85)', () => {
  it('resolves --model id:model for a preset to its endpoint', () => {
    registerCustomProviders({ deepseek: {} });
    const { options, resolveModel } = parseOptions(argv('--model', 'deepseek:deepseek-v4-pro', 'task'));
    applyModelAliases(options, undefined);
    const model = resolveModel();
    expect(model.model).toBe('deepseek-v4-pro');
    expect(model.endpoint?.baseUrl).toBe('https://api.deepseek.com/v1');
  });

  it('resolves --provider id --model name the same way', () => {
    registerCustomProviders({ deepseek: {} });
    const { options, resolveModel } = parseOptions(argv('--provider', 'deepseek', '--model', 'deepseek-v4-pro', 'task'));
    applyModelAliases(options, undefined);
    const model = resolveModel();
    expect(model.model).toBe('deepseek-v4-pro');
    expect(model.endpoint?.baseUrl).toBe('https://api.deepseek.com/v1');
  });

  it('resolves a custom id with its own URL', () => {
    registerCustomProviders({ mine: { baseUrl: 'https://llm.example.test/v1', apiKeyEnv: 'MINE_KEY' } });
    const { options, resolveModel } = parseOptions(argv('--model', 'mine:big-1', 'task'));
    applyModelAliases(options, undefined);
    expect(resolveModel().endpoint?.baseUrl).toBe('https://llm.example.test/v1');
  });

  it('refuses an unknown provider with a sentence, not a JavaScript error', () => {
    const { options } = parseOptions(argv('--provider', 'nosuch', '--model', 'x', 'task'));
    expect(() => applyModelAliases(options, undefined)).toThrow(/does not know the provider "nosuch"/);
  });

  it('keeps built-in providers and ollama name:tag models as they were', () => {
    const a = parseOptions(argv('--model', 'anthropic:claude-haiku-4-5', 'task'));
    applyModelAliases(a.options, undefined);
    expect(a.resolveModel()).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5' });
    const o = parseOptions(argv('--provider', 'ollama', '--model', 'mistral:7b', 'task'));
    applyModelAliases(o.options, undefined);
    expect(o.resolveModel()).toEqual({ provider: 'ollama', model: 'mistral:7b' });
  });
});
