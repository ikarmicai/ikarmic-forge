import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineTask, fileMatches, fileMissing, toolWasCalled, completed } from '../graders/index.js';

/**
 * edit / remove-section: two-step task: identify a section by name, then
 * remove it. Verifies the model handles multiple edits coherently.
 */
export default defineTask({
  id: 'edit-remove-section',
  name: 'Remove a section from config.json',
  category: 'edit',
  description: 'Agent removes a named section from a JSON config file.',
  task:
    'The file `config.json` exists in the current directory. It has two top-level ' +
    'keys: `keep` and `stale`. Remove the entire `stale` key (and its value) using ' +
    'edit_file. Keep `keep` untouched. Then verify the file is still valid JSON.',
  setup: async (cwd) => {
    await mkdir(cwd, { recursive: true });
    await writeFile(
      join(cwd, 'config.json'),
      JSON.stringify(
        { keep: { value: 42 }, stale: { value: 'old', note: 'remove me' } },
        null,
        2
      )
    );
  },
  graders: [
    completed(),
    toolWasCalled('edit_file'),
    fileMatches('config.json', '"value": 42'),
    fileMatches('config.json', 'keep'),
    // The `stale` key should be gone: we check that the substring "stale"
    // (which only appears inside the key) is absent.
    fileMatches('config.json', { equals: JSON.stringify({ keep: { value: 42 } }, null, 2) }),
    fileMissing('stale-backup.json'),
  ],
});
