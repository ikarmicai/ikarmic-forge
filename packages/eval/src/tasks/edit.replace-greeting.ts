import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineTask, fileMatches, toolWasCalled, completed } from '../graders/index.js';

/**
 * edit / replace-greeting: agent modifies an existing file in place.
 * Verifies the model uses edit_file (precise replacement) rather than
 * rewriting the whole file with write_file.
 */
export default defineTask({
  id: 'edit-replace-greeting',
  name: 'Replace greeting in file',
  category: 'edit',
  description: 'Agent edits greeting.txt to swap the greeting word.',
  task:
    'The file `greeting.txt` exists in the current directory and contains the word ' +
    '"Hello". Change just that one word to "Bonjour" using the edit_file tool: do ' +
    'not rewrite the whole file.',
  setup: async (cwd) => {
    await mkdir(cwd, { recursive: true });
    await writeFile(join(cwd, 'greeting.txt'), 'Hello, world!\nA second line.\n');
  },
  graders: [
    completed(),
    toolWasCalled('edit_file'),
    fileMatches('greeting.txt', 'Bonjour'),
    // Make sure the model didn't nuke the rest of the file.
    fileMatches('greeting.txt', 'A second line.'),
  ],
});
