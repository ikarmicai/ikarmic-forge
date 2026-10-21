import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineTask, regex, toolWasCalled, completed } from '../graders/index.js';

/**
 * read / search-todos: agent searches the workspace for TODO comments.
 * We seed three TODO markers in three files (plus a decoy without one)
 * so a model that only checks one file fails.
 */
export default defineTask({
  id: 'read-search-todos',
  name: 'Search for TODO comments',
  category: 'read',
  description: 'Agent searches for TODO comments across files.',
  task:
    'Search the current directory for files containing the text "TODO" and list ' +
    'the file paths you find. Use the search_files tool: do not read files manually.',
  setup: async (cwd) => {
    await mkdir(cwd, { recursive: true });
    await writeFile(join(cwd, 'alpha.ts'), '// TODO: implement alpha\nconst a = 1;\n');
    await writeFile(join(cwd, 'beta.ts'), 'export function beta() { /* TODO later */ }\n');
    await writeFile(join(cwd, 'gamma.ts'), '// no todos here\nconst g = 3;\n');
    await writeFile(join(cwd, 'README.md'), '# Project\n');
  },
  graders: [
    completed(),
    toolWasCalled('search_files'),
    regex(/alpha\.ts/),
    regex(/beta\.ts/),
  ],
});
