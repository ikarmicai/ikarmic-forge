import type { SpecTask } from '@ikarmic/forge-core';

/** One Run lens pair per unchecked task. */
export function codeLensTargets(tasks: readonly SpecTask[]): Array<{ line: number; taskId: string; title: string }> {
  return tasks.filter((t) => !t.done).map((t) => ({ line: t.line, taskId: t.id, title: t.title }));
}
