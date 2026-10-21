import { describe, expect, it } from 'vitest';

import { parseSpecCommand } from '../src/specs/spec-command.js';

describe('parseSpecCommand', () => {
  it('extracts the task after /spec', () => {
    expect(parseSpecCommand('/spec add dark mode')).toEqual({ task: 'add dark mode' });
    expect(parseSpecCommand('  /spec   multi\nline  ')).toEqual({ task: 'multi\nline' });
  });
  it('ignores other input', () => {
    for (const t of ['/spec', '/spec   ', '/specify x', 'spec x', 'hello /spec x']) expect(parseSpecCommand(t)).toBeNull();
  });
});
