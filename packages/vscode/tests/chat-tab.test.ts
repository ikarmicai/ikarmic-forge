import { describe, expect, it } from 'vitest';

import { chatTabTitle } from '../src/chat/chat-tab-title.js';

describe('chatTabTitle', () => {
  it('numbers the second and later tabs so they can be told apart', () => {
    expect(chatTabTitle(1)).toBe('Forge');
    expect(chatTabTitle(2)).toBe('Forge 2');
    expect(chatTabTitle(10)).toBe('Forge 10');
  });
});
