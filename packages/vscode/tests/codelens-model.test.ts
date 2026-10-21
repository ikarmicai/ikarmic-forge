import { describe, expect, it } from 'vitest';

import { codeLensTargets } from '../src/specs/codelens-model.js';

describe('codeLensTargets', () => {
  it('targets only unchecked tasks, at their lines', () => {
    const tasks = [
      { id: '1', title: '1. A', done: true, requirements: [], line: 0, level: 0 as const },
      { id: '2', title: '2. B', done: false, requirements: [], line: 2, level: 0 as const },
      { id: '2.1', title: '2.1 C', done: false, requirements: [], line: 3, level: 1 as const },
    ];
    expect(codeLensTargets(tasks)).toEqual([
      { line: 2, taskId: '2', title: '2. B' },
      { line: 3, taskId: '2.1', title: '2.1 C' },
    ]);
  });
});
