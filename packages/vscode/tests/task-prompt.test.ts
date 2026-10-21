import { describe, expect, it } from 'vitest';

import { buildTaskPrompt } from '../src/specs/task-prompt.js';

const task = { id: '2', title: '2. Persist choice', done: false, requirements: ['1.1', '3'], line: 4, level: 0 as const };
const input = { specId: 'dark-1', requirements: 'REQ BODY', design: 'DESIGN BODY', tasksMd: '- [x] 1. A\n- [ ] 2. Persist choice', task };

describe('buildTaskPrompt', () => {
  it('includes the three documents, the target task and its requirements', () => {
    const p = buildTaskPrompt(input);
    expect(p).toContain('"dark-1"');
    expect(p).toContain('<requirements.md>\nREQ BODY\n</requirements.md>');
    expect(p).toContain('<design.md>\nDESIGN BODY\n</design.md>');
    expect(p).toContain('<tasks.md>\n- [x] 1. A\n- [ ] 2. Persist choice\n</tasks.md>');
    expect(p).toContain('Implement only this task: 2. Persist choice');
    expect(p).toContain('It satisfies requirements: 1.1, 3');
    expect(p).toContain('Do not edit tasks.md');
  });
  it('omits the requirements line when the task has none', () => {
    expect(buildTaskPrompt({ ...input, task: { ...task, requirements: [] } })).not.toContain('It satisfies requirements');
  });
});
