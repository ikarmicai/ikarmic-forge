/**
 * Pure model for the Steering tree and the New Steering File template.
 */
import type { SteeringDoc, SteeringInclusion } from '@ikarmic/forge-core';

export type SteeringNode =
  | { kind: 'group'; id: 'project' | 'global'; label: string; children: SteeringNode[] }
  | { kind: 'doc'; doc: SteeringDoc; description: string }
  | { kind: 'message'; label: string };

function describe(doc: SteeringDoc): string {
  const base =
    doc.inclusion === 'fileMatch'
      ? `fileMatch: ${doc.fileMatchPattern}`
      : doc.inclusion === 'manual'
        ? `manual (#${doc.name})`
        : 'always';
  if (doc.enabled) return base;
  return doc.disabledBy === 'file' ? `${base} · disabled in file` : `${base} · disabled`;
}

/**
 * The sidebar toggle writes the local override, which cannot re-enable a doc
 * whose own frontmatter says `enabled: false`; that one has to be edited.
 */
export function toggleAction(doc: SteeringDoc): 'override' | 'editFile' {
  return !doc.enabled && doc.disabledBy === 'file' ? 'editFile' : 'override';
}

export function buildSteeringTree(input: {
  docs: readonly SteeringDoc[];
  warnings: readonly string[];
  projectSkipped: boolean;
}): SteeringNode[] {
  const project = input.docs.filter((d) => d.source.kind === 'project');
  const global = input.docs.filter((d) => d.source.kind === 'global');
  const projectChildren: SteeringNode[] = input.projectSkipped
    ? [{ kind: 'message', label: 'Project steering is disabled in untrusted workspaces' }]
    : project.length > 0
      ? project.map((doc) => ({ kind: 'doc', doc, description: describe(doc) }))
      : [{ kind: 'message', label: 'No project steering yet: use "New Steering File"' }];
  const out: SteeringNode[] = [{ kind: 'group', id: 'project', label: 'Project', children: projectChildren }];
  if (global.length > 0) {
    out.push({
      kind: 'group',
      id: 'global',
      label: 'Global',
      children: global.map((doc) => ({ kind: 'doc', doc, description: describe(doc) })),
    });
  }
  for (const w of input.warnings) out.push({ kind: 'message', label: `⚠ ${w}` });
  return out;
}

export function scaffoldSteering(name: string, inclusion: SteeringInclusion, pattern?: string): string {
  const front = ['---', `inclusion: ${inclusion}`];
  if (inclusion === 'fileMatch' && pattern) front.push(`fileMatchPattern: "${pattern}"`);
  front.push('---');
  const hint =
    inclusion === 'manual'
      ? `Include it with #${name} in a chat message.`
      : 'Describe how the agent should work here. Keep it short and specific.';
  return `${front.join('\n')}\n\n# ${name}\n\n${hint}\n`;
}
