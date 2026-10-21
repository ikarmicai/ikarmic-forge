import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineTask, regex, toolNotCalled, completed } from '../graders/index.js';

const FILLER_SENTENCE = 'Notes about this subsystem that have nothing to do with how anything is built or run. ';

/**
 * memory / recall-relevant: the project's memory is larger than the prompt
 * budget, so only an index plus the entries relevant to the question reach the
 * model. The answer lives in one `correction` section ("use pnpm, never npm").
 * Another section names a file that no longer exists, so it is injected with
 * the "possibly stale" marker. Opts into memory (the only task that does).
 */
export default defineTask({
  id: 'memory-recall-relevant',
  name: 'Recall the right memory entry',
  category: 'read',
  description: 'Agent answers from project memory: pnpm correction wins; the stale entry is flagged, not trusted.',
  task: 'Which command runs the tests in this project? Reply with just the command, nothing else.',
  memory: true,
  setup: async (cwd) => {
    await mkdir(join(cwd, '.forge'), { recursive: true });
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'sample', version: '1.0.0' }, null, 2));
    const filler = Array.from({ length: 10 }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return `## Subsystem ${n}\n\n<!-- forge: type=convention, updated=2026-09-01 -->\n${FILLER_SENTENCE.repeat(10)}`;
    });
    const memory = [
      '# Project Memory',
      ...filler,
      '## Package manager\n\n<!-- forge: type=correction, updated=2026-10-01, refs=package.json -->\nUse pnpm, never npm. Run `pnpm test` to run the tests in this workspace.',
      '## Legacy API\n\n<!-- forge: type=decision, updated=2026-08-01, refs=src/legacy/api.ts, pin=true -->\nNever call the legacy API directly; go through the gateway.',
    ].join('\n\n');
    await writeFile(join(cwd, '.forge', 'MEMORY.md'), `${memory}\n`);
  },
  graders: [completed(), regex(/pnpm test/), toolNotCalled('run_command')],
});
