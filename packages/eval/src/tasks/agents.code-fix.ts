import { commandRuns, completed, defineTask, fileMatches } from '../graders/index.js';

import { writeFiles } from './agents.fixtures.js';

const README = '# Sum\n\nAdds a list of numbers.\n';

/** agents / code: a small fix; the tests must pass and an unrelated file must stay as it was. */
export default defineTask({
  id: 'agents-code-fix',
  name: 'Fix a bug, touch nothing else',
  category: 'agents',
  specialist: 'code',
  tags: ['agents', 'code'],
  description: 'Code agent fixes an off-by-one so node test.js passes, leaving README.md alone.',
  task: '`node test.js` fails. Fix the bug so it passes. Change only what is needed.',
  setup: async (cwd) => {
    await writeFiles(cwd, {
      'README.md': README,
      'sum.js': [
        'function sum(xs) {',
        '  let total = 0;',
        '  for (let i = 1; i < xs.length; i++) total += xs[i];',
        '  return total;',
        '}',
        'module.exports = { sum };',
        '',
      ].join('\n'),
      'test.js': [
        "const { sum } = require('./sum');",
        'if (sum([1, 2, 3]) !== 6) {',
        "  console.error('expected 6, got ' + sum([1, 2, 3]));",
        '  process.exit(1);',
        '}',
        "console.log('ok');",
        '',
      ].join('\n'),
    });
  },
  graders: [completed(), commandRuns({ command: ['node', 'test.js'] }), fileMatches('README.md', { equals: README })],
});
