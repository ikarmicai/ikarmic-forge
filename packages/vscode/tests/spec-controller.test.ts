import { describe, expect, it, vi } from 'vitest';

import { convertToCheckboxes, parseTasks, setTaskDone } from '@ikarmic/forge-core';
import { BUSY, CHECKS_FAILING, SpecController, TICK_MANUALLY, UNTRUSTED } from '../src/specs/spec-controller.js';

const outcome = (over = {}) => ({ reason: 'completed', sessionId: 'sess-9', finalText: '## requirements.md\nr\n## design.md\nd\n## tasks.md\nt', files: ['src/a.ts'], ...over });

function setup(over: Record<string, unknown> = {}) {
  const files: Record<string, string> = {
    'spec-1/requirements.md': 'REQ',
    'spec-1/design.md': 'DES',
    'spec-1/tasks.md': '- [ ] 1. First\n- [ ] 2. Second',
  };
  const store = {
    createDraft: vi.fn(async (id: string, task: string) => ({ id, task, createdAt: 'c', dir: `/drafts/${id}` })),
    approveDraft: vi.fn(async (id: string) => ({ id, task: 't', approvedAt: 'a', dir: `/specs/${id}` })),
    discardDraft: vi.fn(async () => true),
    get: vi.fn(async (id: string) => (id === 'spec-1' ? { id, task: 't', approvedAt: 'a', dir: '/specs/spec-1' } : null)),
    recordRun: vi.fn(async () => undefined),
  };
  const deps = {
    store,
    isTrusted: () => true,
    isSafeSpecId: (id: string) => /^[a-z0-9][a-z0-9._-]*$/i.test(id),
    newSpecId: () => 'new-id',
    splitSpecSections: (raw: string) => {
      if (!raw.includes('## tasks.md')) throw new Error('missing sections');
      return { requirements: 'r', design: 'd', tasks: 't' };
    },
    parseTasks,
    setTaskDone,
    convertToCheckboxes,
    readSpecFile: vi.fn(async (id: string, file: string) => files[`${id}/${file}`] ?? ''),
    writeTasks: vi.fn(async (id: string, md: string) => {
      files[`${id}/tasks.md`] = md;
    }),
    generateInChat: vi.fn(async () => outcome({ reason: 'spec' })),
    runInChat: vi.fn(async () => outcome()),
    confirm: vi.fn(async () => true),
    now: () => new Date('2026-09-29T12:00:00.000Z'),
    onDidChange: vi.fn(),
    ...over,
  };
  return { controller: new SpecController(deps as never), deps, store, files };
}

describe('SpecController.generateDraft', () => {
  it('creates a draft from a spec-mode generation (core ends spec runs with reason spec)', async () => {
    const { controller, store } = setup();
    expect(await controller.generateDraft('add x')).toEqual({ status: 'ok', draftId: 'new-id' });
    expect(store.createDraft).toHaveBeenCalledWith('new-id', 'add x', { requirements: 'r', design: 'd', tasks: 't' });
  });

  it('writes nothing when generation did not start, did not complete, or missed a section', async () => {
    for (const [gen, error] of [
      [async () => null, 'Spec generation did not start.'],
      [async () => outcome({ reason: 'aborted' }), 'Spec generation ended (aborted); no draft was created.'],
      [async () => outcome({ reason: 'spec', finalText: 'no sections' }), 'missing sections'],
    ] as const) {
      const { controller, store } = setup({ generateInChat: vi.fn(gen) });
      expect(await controller.generateDraft('add x')).toEqual({ status: 'error', error });
      expect(store.createDraft).not.toHaveBeenCalled();
    }
  });
});

describe('SpecController guards', () => {
  it('refuses generate, approve, convert and run in an untrusted workspace', async () => {
    const { controller, deps } = setup({ isTrusted: () => false });
    const err = { status: 'error', error: UNTRUSTED };
    expect(await controller.generateDraft('x')).toEqual(err);
    expect(await controller.approve('d')).toEqual(err);
    expect(await controller.convertTasks('spec-1')).toEqual(err);
    expect(await controller.runTask('spec-1', { id: '1', title: '1. First' }, 'fresh')).toEqual(err);
    expect(deps.generateInChat).not.toHaveBeenCalled();
    expect(deps.runInChat).not.toHaveBeenCalled();
  });

  it('refuses a second operation while one is running, and exposes the running task', async () => {
    let finish!: (v: unknown) => void;
    const { controller } = setup({ runInChat: vi.fn(() => new Promise((r) => (finish = r))) });
    const first = controller.runTask('spec-1', { id: '1', title: '1. First' }, 'fresh');
    await vi.waitFor(() => expect(controller.running).toEqual({ specId: 'spec-1', taskId: '1', title: '1. First' }));
    expect(await controller.generateDraft('y')).toEqual({ status: 'error', error: BUSY });
    finish(outcome());
    await first;
    expect(controller.running).toBeUndefined();
  });
});

describe('SpecController draft actions', () => {
  it('approve delegates and surfaces store errors', async () => {
    const { controller, store } = setup();
    expect(await controller.approve('d-1')).toEqual({ status: 'ok' });
    expect(store.approveDraft).toHaveBeenCalledWith('d-1');
    store.approveDraft.mockRejectedValueOnce(new Error('spec d-1 already exists'));
    expect(await controller.approve('d-1')).toEqual({ status: 'error', error: 'spec d-1 already exists' });
  });

  it('discard asks first', async () => {
    const declined = setup({ confirm: vi.fn(async () => false) });
    expect(await declined.controller.discard('d-1')).toEqual({ status: 'cancelled' });
    expect(declined.store.discardDraft).not.toHaveBeenCalled();
    const accepted = setup();
    expect(await accepted.controller.discard('d-1')).toEqual({ status: 'ok' });
    expect(accepted.deps.confirm).toHaveBeenCalledWith('Discard draft d-1? Its files will be deleted.', 'Discard');
  });

  it('convertTasks errors when nothing converts, else confirms and writes', async () => {
    const nothing = setup();
    expect(await nothing.controller.convertTasks('spec-1')).toEqual({ status: 'error', error: 'No numbered tasks found to convert.' });
    const free = setup();
    free.files['spec-1/tasks.md'] = '1. Only';
    expect(await free.controller.convertTasks('spec-1')).toEqual({ status: 'ok' });
    expect(free.files['spec-1/tasks.md']).toBe('- [ ] 1. Only');
    const declined = setup({ confirm: vi.fn(async () => false) });
    declined.files['spec-1/tasks.md'] = '1. Only';
    expect(await declined.controller.convertTasks('spec-1')).toEqual({ status: 'cancelled' });
    expect(declined.deps.writeTasks).not.toHaveBeenCalled();
  });
});

describe('SpecController.runTask', () => {
  it('runs a fresh task, ticks it on completion and records the run', async () => {
    const { controller, deps, store, files } = setup();
    expect(await controller.runTask('spec-1', { id: '1', title: '1. First' }, 'fresh')).toEqual({ status: 'ok' });
    const [prompt, label, mode] = deps.runInChat.mock.calls[0] as unknown as [string, string, string];
    expect(prompt).toContain('Implement only this task: 1. First');
    expect(prompt).toContain('REQ');
    expect(label).toBe('▶ Spec spec-1: 1. First');
    expect(mode).toBe('fresh');
    expect(files['spec-1/tasks.md']).toBe('- [x] 1. First\n- [ ] 2. Second');
    expect(store.recordRun).toHaveBeenCalledWith('spec-1', {
      taskId: '1', title: '1. First', sessionId: 'sess-9', mode: 'fresh',
      startedAt: '2026-09-29T12:00:00.000Z', finishedAt: '2026-09-29T12:00:00.000Z',
      reason: 'completed', files: ['src/a.ts'],
    });
    expect(deps.onDidChange).toHaveBeenCalled();
  });

  it('passes current mode through', async () => {
    const { controller, deps } = setup();
    await controller.runTask('spec-1', { id: '2', title: '2. Second' }, 'current');
    expect((deps.runInChat.mock.calls[0] as unknown[])[2]).toBe('current');
  });

  it('does not tick an unfinished run but still records it', async () => {
    const { controller, deps, store } = setup({ runInChat: vi.fn(async () => outcome({ reason: 'aborted' })) });
    expect(await controller.runTask('spec-1', { id: '1', title: '1. First' }, 'fresh')).toEqual({ status: 'ok' });
    expect(deps.writeTasks).not.toHaveBeenCalled();
    expect(store.recordRun.mock.calls[0]![1]).toMatchObject({ reason: 'aborted' });
  });

  it('does not tick a completed run whose checks still fail, warns, and still records it', async () => {
    const { controller, deps, store } = setup({ runInChat: vi.fn(async () => outcome({ verified: false })) });
    expect(await controller.runTask('spec-1', { id: '1', title: '1. First' }, 'fresh')).toEqual({ status: 'ok', warning: CHECKS_FAILING });
    expect(deps.writeTasks).not.toHaveBeenCalled();
    expect(store.recordRun.mock.calls[0]![1]).toMatchObject({ reason: 'completed', files: ['src/a.ts'] });
  });

  it('ticks a completed run whose checks passed, or that had none', async () => {
    for (const over of [{ verified: true }, {}]) {
      const { controller, deps } = setup({ runInChat: vi.fn(async () => outcome(over)) });
      expect(await controller.runTask('spec-1', { id: '1', title: '1. First' }, 'fresh')).toEqual({ status: 'ok' });
      expect(deps.writeTasks).toHaveBeenCalledTimes(1);
    }
  });

  it('does not tick when the task line changed during the run', async () => {
    const ctx = setup();
    ctx.deps.runInChat.mockImplementationOnce(async () => {
      ctx.files['spec-1/tasks.md'] = '- [ ] 1. First (renamed)\n- [ ] 2. Second';
      return outcome();
    });
    expect(await ctx.controller.runTask('spec-1', { id: '1', title: '1. First' }, 'fresh')).toEqual({ status: 'ok', warning: TICK_MANUALLY });
    expect(ctx.deps.writeTasks).not.toHaveBeenCalled();
    expect(ctx.store.recordRun).toHaveBeenCalled();
  });

  it('turns a recordRun failure into a warning', async () => {
    const { controller, store } = setup();
    store.recordRun.mockRejectedValueOnce(new Error('no spec spec-1'));
    expect(await controller.runTask('spec-1', { id: '1', title: '1. First' }, 'fresh')).toEqual({ status: 'ok', warning: 'Run not recorded: no spec spec-1' });
  });

  it('refuses missing specs, missing or done tasks, and records nothing when the run did not start', async () => {
    const a = setup();
    expect(await a.controller.runTask('nope', { id: '1', title: '1. First' }, 'fresh')).toEqual({ status: 'error', error: 'Spec nope not found.' });
    expect(await a.controller.runTask('spec-1', { id: '9', title: '9. Gone' }, 'fresh')).toEqual({ status: 'error', error: 'That task is no longer in tasks.md. Refresh the Specs view.' });
    a.files['spec-1/tasks.md'] = '- [x] 1. First';
    expect(await a.controller.runTask('spec-1', { id: '1', title: '1. First' }, 'fresh')).toEqual({ status: 'error', error: 'That task is already done.' });
    const b = setup({ runInChat: vi.fn(async () => null) });
    expect(await b.controller.runTask('spec-1', { id: '1', title: '1. First' }, 'fresh')).toEqual({ status: 'error', error: 'The task did not start.' });
    expect(b.store.recordRun).not.toHaveBeenCalled();
    expect(b.controller.running).toBeUndefined();
  });
});

describe("SpecController id safety", () => {
  it("rejects unsafe spec and draft ids before touching any dependency", async () => {
    for (const bad of ["../x", "../..", "a/b", ".drafts", ""]) {
      const { controller, deps, store } = setup();
      const err = { status: "error", error: `invalid spec id: ${bad}` };
      expect(await controller.approve(bad)).toEqual(err);
      expect(await controller.discard(bad)).toEqual(err);
      expect(await controller.convertTasks(bad)).toEqual(err);
      expect(await controller.runTask(bad, { id: "1", title: "1. First" }, "fresh")).toEqual(err);
      expect(store.approveDraft).not.toHaveBeenCalled();
      expect(store.discardDraft).not.toHaveBeenCalled();
      expect(deps.readSpecFile).not.toHaveBeenCalled();
      expect(deps.writeTasks).not.toHaveBeenCalled();
      expect(deps.confirm).not.toHaveBeenCalled();
      expect(deps.runInChat).not.toHaveBeenCalled();
    }
  });

  it("convertTasks refuses a spec that does not exist", async () => {
    const { controller, deps } = setup();
    expect(await controller.convertTasks("nope")).toEqual({ status: "error", error: "Spec nope not found." });
    expect(deps.readSpecFile).not.toHaveBeenCalled();
    expect(deps.writeTasks).not.toHaveBeenCalled();
  });
});

describe('SpecController.sync', () => {
  const before = { requirements: 'R', design: 'D', tasks: '- [x] 1. A\n- [ ] 2. B' };
  const syncDeps = (over: Record<string, unknown> = {}) => ({
    docs: vi.fn(async (id: string) => (id === 'auth' ? before : null)),
    task: vi.fn(async () => 'SYNC TASK'),
    runInChat: vi.fn(async () => ({ reason: 'spec', sessionId: 's', finalText: 'NEW', files: [] })),
    review: vi.fn(async () => true),
    write: vi.fn(async () => undefined),
    ...over,
  });
  const make = (sync: ReturnType<typeof syncDeps>, after = { requirements: 'R', design: 'D2', tasks: '- [ ] 1. A\n- [x] 2. B\n- [ ] 3. C' }) =>
    setup({ sync, splitSpecSections: () => after }).controller;

  it('runs the sync task, keeps finished tasks ticked and writes after review', async () => {
    const sync = syncDeps();
    const res = await make(sync).sync('auth');
    expect(res).toEqual({ status: 'ok' });
    expect(sync.runInChat).toHaveBeenCalledWith('SYNC TASK', 'Sync spec auth with the code');
    const written = sync.write.mock.calls[0]![1] as { tasks: string; design: string };
    expect(written.design).toBe('D2');
    expect(written.tasks).toBe('- [x] 1. A\n- [x] 2. B\n- [ ] 3. C');
  });

  it('writes nothing when the review is declined, the spec already matches, or the run fails', async () => {
    const declined = syncDeps({ review: vi.fn(async () => false) });
    expect(await make(declined).sync('auth')).toEqual({ status: 'cancelled' });
    expect(declined.write).not.toHaveBeenCalled();

    const same = syncDeps();
    expect(await make(same, before).sync('auth')).toEqual({ status: 'ok', warning: 'Spec auth already matches the code.' });
    expect(same.review).not.toHaveBeenCalled();

    const failed = syncDeps({ runInChat: vi.fn(async () => ({ reason: 'aborted', sessionId: 's', finalText: '', files: [] })) });
    expect(await make(failed).sync('auth')).toMatchObject({ status: 'error', error: expect.stringMatching(/aborted/) });
    expect(failed.write).not.toHaveBeenCalled();

    expect(await make(syncDeps()).sync('nope')).toMatchObject({ status: 'error', error: 'Spec nope not found.' });
    expect(await make(syncDeps()).sync('../x')).toMatchObject({ status: 'error' });
  });
});
