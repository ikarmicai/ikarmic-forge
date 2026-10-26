import { describe, expect, it } from 'vitest';

import { parseOptions } from '../src/options.js';

const argv = (...a: string[]) => ['node', 'forge', ...a];

describe('--sandbox', () => {
  it('is off unless given', () => {
    expect(parseOptions(argv('task')).options.commandSandbox).toBe('off');
  });

  it('confines commands without network, or with it when asked', () => {
    expect(parseOptions(argv('--sandbox', 'task')).options.commandSandbox).toBe('on');
    expect(parseOptions(argv('--sandbox=network', 'task')).options.commandSandbox).toBe('on-network');
  });
});
