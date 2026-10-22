import { registerCustomProviders } from '@ikarmic/forge-core';
import { afterEach, describe, expect, it } from 'vitest';

import { namedProviderModel } from '../src/model-ref.js';

afterEach(() => registerCustomProviders(undefined));

describe('namedProviderModel', () => {
  it('turns id:model of a custom provider into an openai-compatible model with its endpoint', () => {
    registerCustomProviders({ acme: { name: 'Acme', baseUrl: 'https://llm.acme.test/v1', apiKey: 'k' } });
    const m = namedProviderModel('acme:fast', 'auto');
    expect(m).toMatchObject({ provider: 'openai-compatible', model: 'fast' });
    expect(m?.endpoint?.baseUrl).toBe('https://llm.acme.test/v1');
  });

  it('is undefined for an ordinary model id, an empty value, and an unknown prefix', () => {
    registerCustomProviders({ acme: { baseUrl: 'https://llm.acme.test/v1' } });
    expect(namedProviderModel('gpt-4o', 'openai')).toBeUndefined();
    expect(namedProviderModel('  ', 'auto')).toBeUndefined();
    expect(namedProviderModel('nope:thing', 'auto')).toBeUndefined();
  });

  it('keeps an Ollama name:tag as an Ollama model', () => {
    expect(namedProviderModel('mistral:7b', 'ollama')).toBeUndefined();
  });

  it('uses a preset when its prefix is typed and the provider is not a local one', () => {
    expect(namedProviderModel('groq:llama-3.3-70b-versatile', 'auto')?.endpoint?.id).toBe('groq');
  });
});
