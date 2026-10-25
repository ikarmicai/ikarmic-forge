import { completed, defineTask, fileMatches, regex } from '../graders/index.js';

import { citesLine, writeFiles } from './agents.fixtures.js';

/** The line of range.js that holds the planted `<=`. */
const BUG_LINE = 4;

/** agents / debug: name the root cause at file:line, and do not fix it. */
export default defineTask({
  id: 'agents-debug-off-by-one',
  name: 'Find the root cause of a failing test',
  category: 'agents',
  specialist: 'debug',
  tags: ['agents', 'debug'],
  description: 'Debug agent names range.js line 4 as the root cause and leaves the file unchanged.',
  task: '`node test.js` fails. Find the root cause.',
  setup: async (cwd) => {
    await writeFiles(cwd, {
      'range.js': [
        '// Returns [0, 1, ..., n - 1].',
        'function range(n) {',
        '  const out = [];',
        '  for (let i = 0; i <= n; i++) {',
        '    out.push(i);',
        '  }',
        '  return out;',
        '}',
        'module.exports = { range };',
        '',
      ].join('\n'),
      'test.js': [
        "const { range } = require('./range');",
        'const r = range(3);',
        "if (r.length !== 3) { console.error('expected 3 items, got ' + r.length + ': ' + JSON.stringify(r)); process.exit(1); }",
        "console.log('ok');",
        '',
      ].join('\n'),
    });
  },
  graders: [
    completed(),
    regex(citesLine('range.js', BUG_LINE)),
    fileMatches('range.js', 'i <= n'),
  ],
});
