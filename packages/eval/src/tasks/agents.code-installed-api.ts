import { commandRuns, completed, defineTask } from '../graders/index.js';

import { writeFiles } from './agents.fixtures.js';

/**
 * agents / code, version-aware: `tinyfmt` exists only in this fixture, so no model can know its API from
 * training. Version 3 takes an options object; the test passes only when Code read the installed library.
 */
export default defineTask({
  id: 'agents-code-installed-api',
  name: 'Use the installed version of a library',
  category: 'agents',
  specialist: 'code',
  tags: ['agents', 'code'],
  description: 'Code agent must read node_modules/tinyfmt to call its v3 API correctly.',
  task:
    'Create shout.js that exports a function shout(text) returning the text in upper case, using the tinyfmt ' +
    'library that is installed in node_modules. `node test.js` must pass.',
  setup: async (cwd) => {
    await writeFiles(cwd, {
      'package.json': JSON.stringify({ name: 'shouter', version: '1.0.0', dependencies: { tinyfmt: '^3.0.0' } }, null, 2),
      'node_modules/tinyfmt/package.json': JSON.stringify({ name: 'tinyfmt', version: '3.0.0', main: 'index.js', types: 'index.d.ts' }, null, 2),
      'node_modules/tinyfmt/index.d.ts': [
        "export interface FormatOptions { style: 'plain' | 'upper' | 'lower' }",
        '/** tinyfmt 3: the second argument is an options object (tinyfmt 1 and 2 took a style string). */',
        'export function format(value: unknown, options: FormatOptions): string;',
        '',
      ].join('\n'),
      'node_modules/tinyfmt/index.js': [
        'exports.format = function format(value, options) {',
        "  if (!options || typeof options !== 'object') throw new TypeError('tinyfmt 3: format(value, { style }) takes an options object');",
        '  const s = String(value);',
        "  if (options.style === 'upper') return s.toUpperCase();",
        "  if (options.style === 'lower') return s.toLowerCase();",
        '  return s;',
        '};',
        '',
      ].join('\n'),
      'test.js': [
        "const fs = require('fs');",
        "const src = fs.readFileSync(__dirname + '/shout.js', 'utf8');",
        "if (!/require\\(['\"]tinyfmt['\"]\\)/.test(src)) { console.error('shout.js must use tinyfmt'); process.exit(1); }",
        "const { shout } = require('./shout');",
        "if (shout('hi there') !== 'HI THERE') { console.error('wrong: ' + shout('hi there')); process.exit(1); }",
        "console.log('ok');",
        '',
      ].join('\n'),
    });
  },
  graders: [completed(), commandRuns({ command: ['node', 'test.js'] })],
});
