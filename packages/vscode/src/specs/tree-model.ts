/**
 * Pure model for the Specs tree view.
 */
import type { SpecDraft, SpecRunRecord, SpecSummary, SpecTask } from '@ikarmic/forge-core';

export type SpecFile = 'requirements.md' | 'design.md' | 'tasks.md';
export const SPEC_FILES: readonly SpecFile[] = ['requirements.md', 'design.md', 'tasks.md'];
export type TaskStatus = 'done' | 'running' | 'failed' | 'pending';

export interface RunningRef {
  specId: string;
  taskId: string;
  title: string;
}

export type TreeNode =
  | { kind: 'group'; id: 'drafts' | 'specs'; label: string; children: TreeNode[] }
  | { kind: 'draft'; draftId: string; label: string; children: TreeNode[] }
  | { kind: 'draftFile'; draftId: string; file: SpecFile }
  | { kind: 'spec'; specId: string; label: string; progress: { done: number; total: number }; children: TreeNode[] }
  | { kind: 'task'; specId: string; task: SpecTask; status: TaskStatus; description: string; children: TreeNode[] }
  | { kind: 'file'; specId: string; path: string }
  | { kind: 'convert'; specId: string }
  | { kind: 'message'; label: string };

export interface TreeInput {
  drafts: readonly SpecDraft[];
  specs: ReadonlyArray<{ summary: SpecSummary; tasks: ReadonlyArray<{ task: SpecTask; lastRun?: SpecRunRecord }> }>;
  running?: RunningRef;
}

export function taskStatus(task: SpecTask, lastRun: SpecRunRecord | undefined, running: boolean): TaskStatus {
  if (running) return 'running';
  if (task.done) return 'done';
  if (lastRun && lastRun.reason !== 'completed') return 'failed';
  return 'pending';
}

export function buildTreeModel(input: TreeInput): TreeNode[] {
  const out: TreeNode[] = [];
  if (input.drafts.length > 0) {
    out.push({
      kind: 'group',
      id: 'drafts',
      label: 'Drafts',
      children: input.drafts.map((d) => ({
        kind: 'draft',
        draftId: d.id,
        label: d.task,
        children: SPEC_FILES.map((file) => ({ kind: 'draftFile', draftId: d.id, file })),
      })),
    });
  }
  const specs: TreeNode[] = input.specs.map(({ summary, tasks }) => ({
    kind: 'spec',
    specId: summary.id,
    label: summary.task,
    progress: { done: tasks.filter(({ task }) => task.done).length, total: tasks.length },
    children:
      tasks.length === 0
        ? [{ kind: 'convert', specId: summary.id }]
        : tasks.map(({ task, lastRun }) => {
            const running =
              input.running?.specId === summary.id && input.running.taskId === task.id && input.running.title === task.title;
            return {
              kind: 'task',
              specId: summary.id,
              task,
              status: taskStatus(task, lastRun, running),
              description: task.requirements.length > 0 ? `Req ${task.requirements.join(', ')}` : '',
              children: (lastRun?.files ?? []).map((p) => ({ kind: 'file', specId: summary.id, path: p })),
            };
          }),
  }));
  // An empty tree lets VS Code show the view's welcome content (Generate a Spec).
  if (specs.length > 0) out.push({ kind: 'group', id: 'specs', label: 'Specs', children: specs });
  return out;
}
