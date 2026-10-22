import { describe, expect, it } from 'vitest';

import { favouriteKey, modelHint, toggleFavourite } from '../src/chat/model-menu.js';

describe('modelHint', () => {
  it('shows the context window and per-million prices for a model Forge knows', () => {
    const h = modelHint('anthropic', 'claude-sonnet-4-5');
    expect(h.text).toMatch(/^\d+(\.\d)?[KM] · \$[\d.]+\/\$[\d.]+$/);
    expect(h.title).toContain('per million');
  });

  it('shows only the window for a model with no known price, and nothing for an unknown model', () => {
    const none = modelHint('ollama', 'totally-unknown-model-xyz');
    expect(none.text).not.toContain('$');
  });

  it('a free local model shows no price', () => {
    expect(modelHint('ollama', 'llama3').text).not.toContain('$');
  });
});

describe('favourites', () => {
  it('keys a model by provider and id, so the same id on two providers is two entries', () => {
    expect(favouriteKey('openai', 'gpt-4o')).not.toBe(favouriteKey('openrouter', 'gpt-4o'));
  });

  it('toggles: adds to the front, removes when present, never duplicates', () => {
    let l: string[] = [];
    l = toggleFavourite(l, 'openai', 'gpt-4o');
    l = toggleFavourite(l, 'anthropic', 'claude-sonnet-4-5');
    expect(l).toEqual([favouriteKey('anthropic', 'claude-sonnet-4-5'), favouriteKey('openai', 'gpt-4o')]);
    l = toggleFavourite(l, 'openai', 'gpt-4o');
    expect(l).toEqual([favouriteKey('anthropic', 'claude-sonnet-4-5')]);
  });

  it('keeps at most 30', () => {
    let l: string[] = [];
    for (let i = 0; i < 40; i++) l = toggleFavourite(l, 'openai', 'm' + i);
    expect(l).toHaveLength(30);
    expect(l[0]).toBe(favouriteKey('openai', 'm39'));
  });
});
