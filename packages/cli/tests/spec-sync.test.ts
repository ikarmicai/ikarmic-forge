import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpecStore } from '@ikarmic/forge-core';

import { handleSpecCommand } from '../src/commands/spec.js';
import { parseOptions } from '../src/options.js';

let cwd: string;
let out: string;
beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'forge-specsync-'));
  out = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => ((out += String(s)), true));
  vi.spyOn(process.stderr, 'write').mockImplementation((s) => ((out += String(s)), true));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(cwd, { recursive: true, force: true });
});

const docs = { requirements: '# R\n1. Login', design: '# D\nold design', tasks: '- [x] 1. Login form\n- [ ] 2. Logout' };
const reply = (design: string, tasks = '- [ ] 1. Login form\n- [x] 2. Logout\n- [ ] 3. Audit') =>
  `## requirements.md\n# R\n1. Login\n\n## design.md\n${design}\n\n## tasks.md\n${tasks}`;

describe('forge spec sync', () => {
  it('parses', () => {
    expect(parseOptions(['node', 'forge', 'spec', 'sync', 'auth', '--yes']).specCommand).toEqual({ sync: { id: 'auth', yes: true } });
    // --yes is a real option (it used to be rejected as unknown, breaking spec cancel and checkpoint restore).
    expect(parseOptions(['node', 'forge', 'spec', 'cancel', 'auth', '--yes']).specCommand).toEqual({ cancel: { id: 'auth', yes: true } });
    expect(parseOptions(['node', 'forge', 'checkpoint', 'restore', 'cp1', '--yes']).checkpointCommand).toMatchObject({ restore: { id: 'cp1', yes: true } });
  });

  it('updates the documents, keeps finished tasks ticked and backs up the old version', async () => {
    const store = new SpecStore(cwd);
    await store.approve('auth', 'add login', docs);
    const runSpecAgent = vi.fn().mockResolvedValue({ reason: 'spec', finalText: reply('# D\nnew design') });
    const code = await handleSpecCommand({ sync: { id: 'auth', yes: true } }, cwd, { runSpecAgent });
    expect(code).toBe(0);
    expect(runSpecAgent.mock.calls[0]![0]).toContain('Bring the spec "auth" up to date');
    const now = await store.readDocs('auth');
    expect(now!.design).toContain('new design');
    // Ticked before, so still ticked; the model ticked 2 itself.
    expect(now!.tasks).toContain('- [x] 1. Login form');
    expect(now!.tasks).toContain('- [x] 2. Logout');
    expect(out).toContain('design.md: +1 -1 lines');
    expect(readdirSync(path.join(cwd, '.forge', 'specs', 'auth', 'history'))).toHaveLength(1);
  });

  it('asks before writing and leaves the spec alone on no', async () => {
    const store = new SpecStore(cwd);
    await store.approve('auth', 'add login', docs);
    const confirm = vi.fn().mockResolvedValue(false);
    const code = await handleSpecCommand({ sync: { id: 'auth', yes: false } }, cwd, {
      runSpecAgent: async () => ({ reason: 'spec', finalText: reply('# D\nnew design') }),
      confirm,
    });
    expect(code).toBe(1);
    expect(confirm).toHaveBeenCalled();
    expect((await store.readDocs('auth'))!.design).toBe('# D\nold design');
  });

  it('reports an unchanged spec, a failed run and an unknown id without writing', async () => {
    const store = new SpecStore(cwd);
    await store.approve('auth', 'add login', docs);
    expect(await handleSpecCommand({ sync: { id: 'auth', yes: true } }, cwd, { runSpecAgent: async () => ({ reason: 'spec', finalText: reply('# D\nold design', docs.tasks) }) })).toBe(0);
    expect(out).toContain('already matches the code');
    expect(await handleSpecCommand({ sync: { id: 'auth', yes: true } }, cwd, { runSpecAgent: async () => ({ reason: 'max_iterations', finalText: '' }) })).toBe(1);
    expect(await handleSpecCommand({ sync: { id: 'auth', yes: true } }, cwd, { runSpecAgent: async () => ({ reason: 'spec', finalText: 'no sections' }) })).toBe(1);
    expect(await handleSpecCommand({ sync: { id: 'nope', yes: true } }, cwd, { runSpecAgent: vi.fn() })).toBe(2);
    expect((await store.get('auth'))!.syncedAt).toBeUndefined();
  });
});
