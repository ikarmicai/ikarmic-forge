import { defineTask, fileMatches, toolWasCalled, completed } from '../graders/index.js';

/**
 * edit / write-hello: agent creates a fresh file with specific content.
 * Verifies the model uses write_file (not edit_file on a non-existent file).
 */
export default defineTask({
  id: 'edit-write-hello',
  name: 'Write hello.txt',
  category: 'edit',
  description: 'Agent creates hello.txt with a specific greeting.',
  task:
    'Create a new file called `hello.txt` in the current directory whose entire ' +
    'contents are exactly the text: `Hello, Forge!` (one line, no trailing newline needed).',
  setup: async () => {
    // No fixtures: fresh dir.
  },
  graders: [
    completed(),
    toolWasCalled('write_file'),
    fileMatches('hello.txt', { equals: 'Hello, Forge!' }),
  ],
});
