import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineTask, fileMatches, toolWasCalled, completed } from '../graders/index.js';

/**
 * edit / rename-symbol: multi-file rename. Agent must find files containing
 * the symbol `foo` and rename it to `bar` consistently. This is a real-world
 * refactor that touches multiple files and demands care.
 */
export default defineTask({
  id: 'edit-rename-symbol',
  name: 'Rename symbol foo -> bar',
  category: 'edit',
  description: 'Agent renames a symbol across multiple files.',
  task:
    'Search the current directory for files that contain the JavaScript variable ' +
    'name `foo`. Rename every occurrence to `bar` in each file using edit_file. ' +
    'Do not change any other words. Leave any file that does not contain `foo` ' +
    'untouched.',
  setup: async (cwd) => {
    await mkdir(cwd, { recursive: true });
    await writeFile(join(cwd, 'a.ts'), 'export const foo = 1;\nexport function useFoo() { return foo; }\n');
    await writeFile(join(cwd, 'b.ts'), 'import { foo } from "./a";\nexport const doubled = foo * 2;\n');
    await writeFile(join(cwd, 'c.ts'), '// no relevant symbols here\nexport const baz = 9;\n');
  },
  graders: [
    completed(),
    toolWasCalled('search_files'),
    toolWasCalled('edit_file'),
    fileMatches('a.ts', 'bar'),
    fileMatches('b.ts', 'bar'),
    // c.ts didn't have foo, must be untouched.
    fileMatches('c.ts', 'baz'),
  ],
});
