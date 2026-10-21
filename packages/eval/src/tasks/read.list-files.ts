import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineTask, regex, toolWasCalled, completed } from '../graders/index.js';

/**
 * read / list-files: ask the agent to enumerate TypeScript files in the
 * project root and report what it found.
 */
export default defineTask({
  id: 'read-list-typescript-files',
  name: 'List TypeScript files',
  category: 'read',
  description: 'Agent enumerates .ts files under the project root.',
  task:
    'Use the list_files tool to find all TypeScript files (extension `.ts`) in the ' +
    'current directory and report their names. Do not recurse into node_modules.',
  setup: async (cwd) => {
    await mkdir(cwd, { recursive: true });
    await writeFile(join(cwd, 'a.ts'), "export const a = 1;\n");
    await writeFile(join(cwd, 'b.ts'), "export const b = 2;\n");
    await writeFile(join(cwd, 'README.md'), '# not ts\n');
    await writeFile(join(cwd, 'package.json'), '{}\n');
  },
  graders: [
    completed(),
    toolWasCalled('list_files'),
    regex(/\.ts\b/),
  ],
});
