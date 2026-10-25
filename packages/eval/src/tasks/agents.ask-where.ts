import { completed, contains, defineTask, regex } from '../graders/index.js';

import { citesLine, writeFiles } from './agents.fixtures.js';

/** agents / ask: answer from the code, with file:line. */
export default defineTask({
  id: 'agents-ask-where',
  name: 'Answer where something is set',
  category: 'agents',
  specialist: 'ask',
  tags: ['agents', 'ask'],
  description: 'Ask agent finds the default port (8417) at src/config.js line 7.',
  task: 'Where is the default port set, and what is it?',
  setup: async (cwd) => {
    await writeFiles(cwd, {
      'src/config.js': [
        '// Runtime settings.',
        '',
        "const HOST = process.env.HOST || 'localhost';",
        '',
        '// Port the HTTP server listens on when PORT is not set.',
        '',
        'const DEFAULT_PORT = 8417;',
        '',
        'module.exports = { HOST, DEFAULT_PORT };',
        '',
      ].join('\n'),
      'src/server.js': [
        "const { HOST, DEFAULT_PORT } = require('./config');",
        'const port = Number(process.env.PORT) || DEFAULT_PORT;',
        "console.log('listening on ' + HOST + ':' + port);",
        '',
      ].join('\n'),
    });
  },
  graders: [completed(), contains('8417'), regex(citesLine('config.js', 7))],
});
