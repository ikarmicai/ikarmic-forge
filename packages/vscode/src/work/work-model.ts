/**
 * What the chat panel shows for Specs and Steering, and the actions it may send back.
 * The tree models in specs/ and steering/ stay the source of truth; this flattens them into plain
 * data a webview can render, and validates the messages it sends (they name files and commands).
 */
import type { TaskStatus, TreeNode } from '../specs/tree-model.js';
import { SPEC_FILES } from '../specs/tree-model.js';
import { toggleAction, type SteeringNode } from '../steering/steering-model.js';

export interface SpecsView {
  drafts: Array<{ id: string; task: string }>;
  specs: Array<{
    id: string;
    task: string;
    done: number;
    total: number;
    /** The spec has no checkbox tasks yet, so there is nothing to run. */
    needsConvert: boolean;
    tasks: Array<{ id: string; title: string; status: TaskStatus; requirements: string; line: number }>;
  }>;
}

export interface SteeringRow {
  name: string;
  source: 'project' | 'global';
  enabled: boolean;
  description: string;
  /** Its own frontmatter disables it: the switch cannot change that, the file has to be edited. */
  editInFile: boolean;
}

export interface SteeringView {
  rows: SteeringRow[];
  /** Warnings and "disabled in untrusted workspaces"; the plain "nothing yet" case is left to the page. */
  notes: string[];
}

export function specsView(nodes: readonly TreeNode[]): SpecsView {
  const view: SpecsView = { drafts: [], specs: [] };
  for (const group of nodes) {
    if (group.kind !== 'group') continue;
    for (const node of group.children) {
      if (node.kind === 'draft') view.drafts.push({ id: node.draftId, task: node.label });
      if (node.kind !== 'spec') continue;
      const tasks = node.children.flatMap((c) =>
        c.kind === 'task'
          ? [{ id: c.task.id, title: c.task.title, status: c.status, requirements: c.description, line: c.task.line }]
          : []
      );
      view.specs.push({
        id: node.specId,
        task: node.label,
        done: node.progress.done,
        total: node.progress.total,
        needsConvert: node.children.some((c) => c.kind === 'convert'),
        tasks,
      });
    }
  }
  return view;
}

export function steeringView(nodes: readonly SteeringNode[]): SteeringView {
  const view: SteeringView = { rows: [], notes: [] };
  const note = (label: string) => {
    if (!label.startsWith('No project steering yet')) view.notes.push(label);
  };
  for (const node of nodes) {
    if (node.kind === 'message') note(node.label);
    if (node.kind !== 'group') continue;
    for (const child of node.children) {
      if (child.kind === 'message') note(child.label);
      if (child.kind !== 'doc') continue;
      view.rows.push({
        name: child.doc.name,
        source: node.id,
        enabled: child.doc.enabled,
        description: child.description,
        editInFile: toggleAction(child.doc) === 'editFile',
      });
    }
  }
  return view;
}

export type SpecAction =
  | { action: 'generate' }
  | { action: 'approve'; draftId: string }
  | { action: 'discard'; draftId: string }
  | { action: 'convert'; specId: string }
  | { action: 'sync'; specId: string }
  | { action: 'run'; specId: string; taskId: string; title: string; current: boolean }
  | { action: 'open'; specId: string; line?: number }
  | { action: 'openDraft'; draftId: string; file: string };

export type SteeringAction = { action: 'new' } | { action: 'toggle' | 'open'; name: string; source: 'project' | 'global' };

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 300;

/** Only well-formed actions get through; ids are checked again against the store before any path is built. */
export function parseSpecAction(raw: unknown): SpecAction | null {
  const a = (raw ?? {}) as Record<string, unknown>;
  switch (a.action) {
    case 'generate':
      return { action: 'generate' };
    case 'approve':
    case 'discard':
      return str(a.draftId) ? { action: a.action, draftId: a.draftId } : null;
    case 'convert':
    case 'sync':
      return str(a.specId) ? { action: a.action, specId: a.specId } : null;
    case 'run':
      return str(a.specId) && str(a.taskId) && str(a.title)
        ? { action: 'run', specId: a.specId, taskId: a.taskId, title: a.title, current: a.current === true }
        : null;
    case 'open':
      return str(a.specId)
        ? { action: 'open', specId: a.specId, ...(typeof a.line === 'number' && a.line >= 0 ? { line: Math.floor(a.line) } : {}) }
        : null;
    case 'openDraft':
      return str(a.draftId) && (SPEC_FILES as readonly string[]).includes(String(a.file))
        ? { action: 'openDraft', draftId: a.draftId, file: String(a.file) }
        : null;
    default:
      return null;
  }
}

export function parseSteeringAction(raw: unknown): SteeringAction | null {
  const a = (raw ?? {}) as Record<string, unknown>;
  if (a.action === 'new') return { action: 'new' };
  if ((a.action === 'toggle' || a.action === 'open') && str(a.name) && (a.source === 'project' || a.source === 'global')) {
    return { action: a.action, name: a.name, source: a.source };
  }
  return null;
}
