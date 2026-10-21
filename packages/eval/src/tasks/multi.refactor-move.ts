import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineTask, fileMatches, fileMissing, toolWasCalled, completed, commandRuns } from '../graders/index.js';

/**
 * multi-step / refactor-move: agent must move a function from one file to
 * another and remove it from the source. Tests reading + writing + editing
 * in a coordinated way.
 */
export default defineTask({
  id: 'multi-refactor-move',
  name: 'Move function between files',
  category: 'multi-step',
  description: 'Agent moves a function from a.ts to b.ts and removes it from a.ts.',
  task:
    'The current directory has two files: `a.ts` and `b.ts`. `a.ts` exports a ' +
    'function called `greet`. Move the `greet` function (and only that function) ' +
    'into `b.ts`. Update `a.ts` so the function is no longer defined there, but ' +
    'leave any other exports in `a.ts` alone. `b.ts` should end up declaring and ' +
    'exporting `greet`.',
  setup: async (cwd) => {
    await mkdir(cwd, { recursive: true });
    await writeFile(
      join(cwd, 'a.ts'),
      "export function greet(name: string): string { return `Hello, ${name}!`; }\n" +
        "export const VERSION = '1.0';\n"
    );
    await writeFile(
      join(cwd, 'b.ts'),
      "// b.ts placeholder\nexport const PLACEHOLDER = true;\n"
    );
  },
  graders: [
    completed(),
    toolWasCalled('read_file'),
    fileMatches('b.ts', 'function greet'),
    fileMatches('a.ts', 'VERSION'),
    // `a.ts` must no longer define the function. Graded on the outcome, so write_file and edit_file both count.
    commandRuns({
      command: ['node', '-e', "process.exit(require('fs').readFileSync('a.ts', 'utf8').includes('function greet') ? 1 : 0)"],
    }),
    fileMissing('a-greet-backup.ts'),
  ],
});
