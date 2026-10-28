/**
 * Spec workflow orchestration: generate / approve / discard / convert / run.
 * vscode-free and dependency-injected; spec-commands.ts wires the adapters.
 *
 */
import { keepDoneTasks, runReasonLabel } from '@ikarmic/forge-core';
import type {
  SpecDraft,
  SpecRunRecord,
  SpecSections,
  SpecSummary,
  SpecTask,
  setTaskDone as coreSetTaskDone,
} from '@ikarmic/forge-core';

import { buildTaskPrompt } from './task-prompt.js';
import type { RunningRef, SpecFile } from './tree-model.js';

export type RunMode = 'fresh' | 'current';

export interface RunOutcome {
  reason: string;
  sessionId: string;
  finalText: string;
  files: string[];
  /** Set when the run's post-edit checks ran: whether they ended passing. */
  verified?: boolean;
  /** Tool calls the run made (goal turns use this to spot a turn with no progress). */
  toolCalls?: number;
  /** The person denied a tool call or approval during the run. */
  denied?: boolean;
}

export type SpecResult =
  | { status: 'ok'; warning?: string; draftId?: string }
  | { status: 'cancelled' }
  | { status: 'error'; error: string };

export interface SpecStoreLike {
  createDraft(id: string, task: string, sections: SpecSections): Promise<SpecDraft>;
  approveDraft(id: string): Promise<SpecSummary>;
  discardDraft(id: string): Promise<boolean>;
  get(id: string): Promise<SpecSummary | null>;
  recordRun(id: string, run: SpecRunRecord): Promise<void>;
}

/** What "Sync with code" needs from the host. */
export interface SpecSyncDeps {
  /** The approved spec's three documents, or null when it doesn't exist. */
  docs: (specId: string) => Promise<SpecSections | null>;
  /** The sync task for a read-only spec-mode run (drift measured by the host). */
  task: (specId: string, docs: SpecSections) => Promise<string>;
  runInChat: (task: string, label: string) => Promise<RunOutcome | null>;
  /** Show the proposed documents next to the current ones; true to write them. */
  review: (specId: string, before: SpecSections, after: SpecSections) => Promise<boolean>;
  write: (specId: string, sections: SpecSections) => Promise<void>;
}

export interface SpecControllerDeps {
  store: SpecStoreLike;
  isTrusted: () => boolean;
  /** Spec and draft ids become path segments: reject unsafe ones before any read or write. */
  isSafeSpecId: (id: string) => boolean;
  newSpecId: (task: string) => string;
  splitSpecSections: (raw: string) => SpecSections;
  parseTasks: (md: string) => SpecTask[];
  setTaskDone: typeof coreSetTaskDone;
  convertToCheckboxes: (md: string) => string;
  /** Live text: the open editor's buffer when the file is open, else disk. */
  readSpecFile: (specId: string, file: SpecFile) => Promise<string>;
  writeTasks: (specId: string, md: string) => Promise<void>;
  generateInChat: (task: string) => Promise<RunOutcome | null>;
  runInChat: (prompt: string, label: string, mode: RunMode) => Promise<RunOutcome | null>;
  confirm: (message: string, action: string) => Promise<boolean>;
  now?: () => Date;
  onDidChange?: () => void;
  sync?: SpecSyncDeps;
}

export const UNTRUSTED = 'Trust this workspace to use Forge specs.';
export const BUSY = 'A spec operation is already running.';
export const CHECKS_FAILING = 'The project checks are still failing, so the task was not ticked. Fix them, then tick it manually or run the task again.';
export const TICK_MANUALLY = 'tasks.md changed during the run, so the task was not ticked. Tick it manually if it is done.';

const err = (error: string): SpecResult => ({ status: 'error', error });
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class SpecController {
  private busy = false;
  private runningTask: RunningRef | undefined;

  constructor(private readonly deps: SpecControllerDeps) {}

  get running(): RunningRef | undefined {
    return this.runningTask;
  }

  async generateDraft(task: string): Promise<SpecResult> {
    const blocked = this.gate();
    if (blocked) return blocked;
    this.busy = true;
    try {
      const outcome = await this.deps.generateInChat(task);
      if (!outcome) return err('Spec generation did not start.');
      // Core ends a spec-mode run with reason 'spec' (agent.ts), including the iteration-cap
      // fallback; splitSpecSections then rejects output that lacks the three sections.
      if (outcome.reason !== 'spec' && outcome.reason !== 'completed') {
        return err(`Spec generation ended (${runReasonLabel(outcome.reason)}); no draft was created.`);
      }
      let sections: SpecSections;
      try {
        sections = this.deps.splitSpecSections(outcome.finalText);
      } catch (e) {
        return err(message(e));
      }
      const draft = await this.deps.store.createDraft(this.deps.newSpecId(task), task, sections);
      return { status: 'ok', draftId: draft.id };
    } catch (e) {
      return err(message(e));
    } finally {
      this.busy = false;
      this.changed();
    }
  }

  async approve(id: string): Promise<SpecResult> {
    if (!this.deps.isTrusted()) return err(UNTRUSTED);
    if (!this.deps.isSafeSpecId(id)) return err(`invalid spec id: ${id}`);
    try {
      await this.deps.store.approveDraft(id);
      return { status: 'ok' };
    } catch (e) {
      return err(message(e));
    } finally {
      this.changed();
    }
  }

  async discard(id: string): Promise<SpecResult> {
    if (!this.deps.isSafeSpecId(id)) return err(`invalid spec id: ${id}`);
    if (!(await this.deps.confirm(`Discard draft ${id}? Its files will be deleted.`, 'Discard'))) return { status: 'cancelled' };
    try {
      await this.deps.store.discardDraft(id);
      return { status: 'ok' };
    } catch (e) {
      return err(message(e));
    } finally {
      this.changed();
    }
  }

  async convertTasks(specId: string): Promise<SpecResult> {
    if (!this.deps.isTrusted()) return err(UNTRUSTED);
    if (!this.deps.isSafeSpecId(specId)) return err(`invalid spec id: ${specId}`);
    try {
      if (!(await this.deps.store.get(specId))) return err(`Spec ${specId} not found.`);
      const md = await this.deps.readSpecFile(specId, 'tasks.md');
      const converted = this.deps.convertToCheckboxes(md);
      if (converted === md) return err('No numbered tasks found to convert.');
      const ok = await this.deps.confirm(
        'Convert the numbered items in tasks.md to checkboxes? Other lines stay unchanged.',
        'Convert'
      );
      if (!ok) return { status: 'cancelled' };
      await this.deps.writeTasks(specId, converted);
      return { status: 'ok' };
    } catch (e) {
      return err(message(e));
    } finally {
      this.changed();
    }
  }

  /**
   * Re-read the code and bring an approved spec's documents up to date. Read-only run in
   * the chat; nothing is written until the user reviews the change. Finished tasks stay ticked.
   */
  async sync(specId: string): Promise<SpecResult> {
    const blocked = this.gate();
    if (blocked) return blocked;
    if (!this.deps.isSafeSpecId(specId)) return err(`invalid spec id: ${specId}`);
    const sync = this.deps.sync;
    if (!sync) return err('Spec sync is not available.');
    this.busy = true;
    try {
      const before = await sync.docs(specId);
      if (!before) return err(`Spec ${specId} not found.`);
      const outcome = await sync.runInChat(await sync.task(specId, before), `Sync spec ${specId} with the code`);
      if (!outcome) return err('Spec sync did not start.');
      if (outcome.reason !== 'spec' && outcome.reason !== 'completed') {
        return err(`Spec sync ended (${runReasonLabel(outcome.reason)}); the spec was not changed.`);
      }
      let after: SpecSections;
      try {
        after = this.deps.splitSpecSections(outcome.finalText);
      } catch (e) {
        return err(message(e));
      }
      after = { ...after, tasks: keepDoneTasks(before.tasks, this.deps.convertToCheckboxes(after.tasks)) };
      if (after.requirements === before.requirements && after.design === before.design && after.tasks === before.tasks) {
        return { status: 'ok', warning: `Spec ${specId} already matches the code.` };
      }
      if (!(await sync.review(specId, before, after))) return { status: 'cancelled' };
      await sync.write(specId, after);
      return { status: 'ok' };
    } catch (e) {
      return err(message(e));
    } finally {
      this.busy = false;
      this.changed();
    }
  }

  async runTask(specId: string, ref: { id: string; title: string }, mode: RunMode): Promise<SpecResult> {
    const blocked = this.gate();
    if (blocked) return blocked;
    if (!this.deps.isSafeSpecId(specId)) return err(`invalid spec id: ${specId}`);
    this.busy = true;
    try {
      if (!(await this.deps.store.get(specId))) return err(`Spec ${specId} not found.`);
      const [requirements, design, tasksMd] = await Promise.all([
        this.deps.readSpecFile(specId, 'requirements.md'),
        this.deps.readSpecFile(specId, 'design.md'),
        this.deps.readSpecFile(specId, 'tasks.md'),
      ]);
      const task = this.find(tasksMd, ref);
      if (!task) return err('That task is no longer in tasks.md. Refresh the Specs view.');
      if (task.done) return err('That task is already done.');

      this.runningTask = { specId, taskId: task.id, title: task.title };
      this.changed();
      const startedAt = this.now().toISOString();
      const outcome = await this.deps.runInChat(
        buildTaskPrompt({ specId, requirements, design, tasksMd, task }),
        `▶ Spec ${specId}: ${task.title}`,
        mode
      );
      if (!outcome) return err('The task did not start.');

      const warnings: string[] = [];
      if (outcome.reason === 'completed' && outcome.verified === false) {
        warnings.push(CHECKS_FAILING);
      } else if (outcome.reason === 'completed') {
        const latest = await this.deps.readSpecFile(specId, 'tasks.md');
        const current = this.find(latest, task);
        const ticked = current ? this.deps.setTaskDone(latest, current, true) : null;
        if (ticked?.ok) await this.deps.writeTasks(specId, ticked.md);
        else warnings.push(TICK_MANUALLY);
      }
      try {
        await this.deps.store.recordRun(specId, {
          taskId: task.id,
          title: task.title,
          sessionId: outcome.sessionId,
          mode,
          startedAt,
          finishedAt: this.now().toISOString(),
          reason: outcome.reason,
          files: outcome.files,
        });
      } catch (e) {
        warnings.push(`Run not recorded: ${message(e)}`);
      }
      return warnings.length > 0 ? { status: 'ok', warning: warnings.join(' ') } : { status: 'ok' };
    } catch (e) {
      return err(message(e));
    } finally {
      this.busy = false;
      this.runningTask = undefined;
      this.changed();
    }
  }

  private find(md: string, ref: { id: string; title: string }): SpecTask | undefined {
    return this.deps.parseTasks(md).find((t) => t.id === ref.id && t.title === ref.title);
  }

  private gate(): SpecResult | null {
    if (!this.deps.isTrusted()) return err(UNTRUSTED);
    if (this.busy) return err(BUSY);
    return null;
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private changed(): void {
    this.deps.onDidChange?.();
  }
}
