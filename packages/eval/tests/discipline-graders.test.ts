import { describe, expect, it } from 'vitest';

import type { GraderContext, ToolInvocation } from '../src/graders/index.js';
import { testRanAfterLastEdit, testRanBeforeSourceEdit } from '../src/tasks/agents.discipline.js';

const edit = (path: string): ToolInvocation => ({ name: 'edit_file', args: { path }, result: '', isError: false });
const run = (command: string): ToolInvocation => ({ name: 'run_command', args: { command }, result: '', isError: false });
const ctx = (toolInvocations: ToolInvocation[]) => ({ toolInvocations }) as unknown as GraderContext;

describe('the order graders', () => {
  it('pass test, run, source, and refuse any other order', async () => {
    const g = testRanBeforeSourceEdit('test.js', 'slug.js');
    expect((await g(ctx([edit('test.js'), run('node test.js'), edit('slug.js')]))).passed).toBe(true);
    expect((await g(ctx([edit('slug.js'), edit('test.js'), run('node test.js')]))).passed).toBe(false);
    expect((await g(ctx([edit('test.js'), edit('slug.js'), run('node test.js')]))).passed).toBe(false);
    expect((await g(ctx([run('node test.js'), edit('test.js'), edit('slug.js')]))).passed).toBe(false);
  });

  it('want a test run after the last edit', async () => {
    const g = testRanAfterLastEdit('test.js');
    expect((await g(ctx([edit('slug.js'), run('node test.js')]))).passed).toBe(true);
    expect((await g(ctx([run('node test.js'), edit('slug.js')]))).passed).toBe(false);
    expect((await g(ctx([run('node test.js')]))).passed).toBe(false);
  });
});
