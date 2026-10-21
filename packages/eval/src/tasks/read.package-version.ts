import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineTask, regex, toolWasCalled, completed } from '../graders/index.js';

/**
 * read / package-version: the agent must read package.json and surface the
 * version field. Verifies the model actually reads the file (not just guesses).
 */
export default defineTask({
  id: 'read-package-version',
  name: 'Read package.json version',
  category: 'read',
  description: 'Agent reads package.json and reports the version string.',
  task:
    'Read the file `package.json` in the current directory and tell me the value of ' +
    'the "version" field. Reply with just the version string, nothing else.',
  setup: async (cwd) => {
    await mkdir(cwd, { recursive: true });
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ name: 'sample', version: '4.2.1', description: 'x' }, null, 2)
    );
  },
  graders: [
    completed(),
    toolWasCalled('read_file'),
    regex(/4\.2\.1/),
  ],
});
