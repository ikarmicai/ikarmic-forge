/**
 * `--architect` helpers: the approve-plan prompt shown between the architect
 * and editor phases in the TUI.
 */
import { createInterface } from 'node:readline/promises';
import process from 'node:process';

/** Empty or y/yes approves; everything else rejects. */
export function parsePlanAnswer(answer: string): boolean {
  const a = answer.trim().toLowerCase();
  return a === '' || a === 'y' || a === 'yes';
}

export async function confirmPlan(
  editorLabel: string,
  io: { input: NodeJS.ReadableStream & { ref?: () => void }; output: NodeJS.WritableStream } = {
    input: process.stdin,
    output: process.stdout,
  }
): Promise<boolean> {
  // Ink unrefs stdin when the phase-1 App unmounts. Without this the event
  // loop has nothing keeping it alive and the process exits at the prompt.
  io.input.ref?.();
  const rl = createInterface({ input: io.input, output: io.output });
  try {
    return parsePlanAnswer(await rl.question(`Apply this plan with ${editorLabel}? [Y/n] `));
  } finally {
    rl.close();
  }
}
