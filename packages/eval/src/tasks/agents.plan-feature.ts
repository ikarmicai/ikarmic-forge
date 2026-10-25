import { completed, contains, defineTask, regex } from '../graders/index.js';

import { writeFiles } from './agents.fixtures.js';

/** agents / plan: a feature that touches three files; the plan must name them and say how to test. */
export default defineTask({
  id: 'agents-plan-feature',
  name: 'Plan a feature across files',
  category: 'agents',
  specialist: 'plan',
  tags: ['agents', 'plan'],
  description: 'Plan agent plans a --json flag that touches cli.js, format.js and the test.',
  task: 'Plan how to add a --json flag to this command-line tool, so it prints the report as JSON instead of text. Do not write any code.',
  setup: async (cwd) => {
    await writeFiles(cwd, {
      'package.json': JSON.stringify({ name: 'report-cli', version: '1.0.0', scripts: { test: 'node cli.test.js' } }, null, 2),
      'cli.js': [
        "const { formatReport } = require('./format');",
        '',
        'function main(argv) {',
        "  const items = [{ name: 'a', count: 2 }, { name: 'b', count: 5 }];",
        '  process.stdout.write(formatReport(items));',
        '}',
        '',
        'if (require.main === module) main(process.argv.slice(2));',
        'module.exports = { main };',
        '',
      ].join('\n'),
      'format.js': [
        'function formatReport(items) {',
        "  return items.map((i) => i.name + ': ' + i.count).join('\\n') + '\\n';",
        '}',
        'module.exports = { formatReport };',
        '',
      ].join('\n'),
      'cli.test.js': [
        "const assert = require('assert');",
        "const { formatReport } = require('./format');",
        "assert.strictEqual(formatReport([{ name: 'a', count: 1 }]), 'a: 1\\n');",
        "console.log('ok');",
        '',
      ].join('\n'),
    });
  },
  graders: [completed(), contains('cli.js'), contains('format.js'), regex(/test/i)],
});
