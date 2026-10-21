/**
 * The chat message that runs one spec task.
 */
import type { SpecTask } from '@ikarmic/forge-core';

export interface TaskPromptInput {
  specId: string;
  requirements: string;
  design: string;
  tasksMd: string;
  task: SpecTask;
}

export function buildTaskPrompt(input: TaskPromptInput): string {
  const lines = [
    `You are implementing one task from the approved spec "${input.specId}".`,
    '',
    '<requirements.md>',
    input.requirements.trim(),
    '</requirements.md>',
    '',
    '<design.md>',
    input.design.trim(),
    '</design.md>',
    '',
    '<tasks.md>',
    input.tasksMd.trim(),
    '</tasks.md>',
    '',
    `Implement only this task: ${input.task.title}`,
  ];
  if (input.task.requirements.length > 0) {
    lines.push(`It satisfies requirements: ${input.task.requirements.join(', ')}`);
  }
  lines.push(
    '',
    'Rules:',
    '- Change only what this task needs. Tasks already marked [x] are done.',
    '- Do not edit tasks.md. The extension ticks the checkbox when you finish.',
    '- Run the relevant tests before you finish and say which ones you ran.'
  );
  return lines.join('\n');
}
