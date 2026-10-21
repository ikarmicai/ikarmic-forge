import { describe, expect, it } from 'vitest';

import { applySharedModel } from '../src/shared-model.js';

const cfg = (provider: string, model = '') => ({ provider, model });

describe('applySharedModel', () => {
  it('uses the shared provider and model when VS Code leaves them on auto / empty', () => {
    const c = cfg('auto');
    applySharedModel(c, { provider: 'minimax', model: 'MiniMax-M3' });
    expect(c).toEqual({ provider: 'minimax', model: 'MiniMax-M3' });
  });

  it('lets an explicit VS Code provider win, and ignores a shared model chosen for another provider', () => {
    const c = cfg('anthropic');
    applySharedModel(c, { provider: 'minimax', model: 'MiniMax-M3' });
    expect(c).toEqual({ provider: 'anthropic', model: '' });
  });

  it('lets an explicit VS Code model win', () => {
    const c = cfg('auto', 'my-model');
    applySharedModel(c, { provider: 'openai', model: 'gpt-x' });
    expect(c).toEqual({ provider: 'openai', model: 'my-model' });
  });

  it('applies a shared model when no shared provider is set', () => {
    const c = cfg('openai');
    applySharedModel(c, { model: 'gpt-x' });
    expect(c.model).toBe('gpt-x');
  });

  it('leaves auto-detection alone when nothing is shared', () => {
    const c = cfg('auto');
    applySharedModel(c, {});
    expect(c).toEqual({ provider: 'auto', model: '' });
  });
});
