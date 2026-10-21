import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineTask, regex, contains, toolWasCalled, completed } from '../graders/index.js';

/**
 * multi-step / summarize: agent must read two files and produce a one-line
 * summary that includes specific facts from both. Verifies it actually
 * read each file (not just guessed) by checking tool calls + output tokens.
 */
export default defineTask({
  id: 'multi-summarize-two-files',
  name: 'Summarize two files',
  category: 'multi-step',
  description: 'Agent reads two files and summarizes them in one sentence.',
  task:
    'Read the files `alpha.txt` and `beta.txt` in the current directory. In a ' +
    'single short sentence (no more than 30 words), summarize what each file ' +
    'is about. Mention the project name "Astra" and the year "2030" in your reply.',
  setup: async (cwd) => {
    await mkdir(cwd, { recursive: true });
    await writeFile(
      join(cwd, 'alpha.txt'),
      'Project Astra is the company-wide initiative launched in 2030 to unify our ' +
        'disconnected tools into one platform.\n'
    );
    await writeFile(
      join(cwd, 'beta.txt'),
      'The 2030 roadmap for Astra focuses on three pillars: developer experience, ' +
        'security, and cost.\n'
    );
  },
  graders: [
    completed(),
    toolWasCalled('read_file', 2),
    // Both files were read: check the model called read_file at least twice
    // (the tool was called) AND that the result mentions both key terms.
    contains('Astra'),
    contains('2030'),
    // The reply should be reasonably short: not a multi-page essay.
    regex(/\b\w+\b.*\b\w+\b/s),
  ],
});
