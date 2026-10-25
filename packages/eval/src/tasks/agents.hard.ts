/**
 * Harder agent tasks, added because the first baseline passed the easy ones 5 of 5 with the old prompts.
 * Each aims at one thing the new method adds: Plan finding every caller, Code reading the installed API of
 * a library a model thinks it knows, Debug looking past the line that throws, Ask following a value across
 * files. Tagged `agents-hard`.
 */
import { commandRuns, completed, contains, defineTask, fileMatches, regex } from '../graders/index.js';

import { citesLine, writeFiles } from './agents.fixtures.js';

export const planCallers = defineTask({
  id: 'agents-plan-callers',
  name: 'Plan a change that every caller feels',
  category: 'agents',
  specialist: 'plan',
  tags: ['agents-hard', 'plan'],
  description: 'Plan must name all three callers of formatDate (one in a nested folder) and its test.',
  task: "Plan changing formatDate so it returns a full ISO 8601 timestamp instead of 'YYYY-MM-DD'. Do not write any code.",
  setup: async (cwd) => {
    await writeFiles(cwd, {
      'src/util/date.js': "function formatDate(d) {\n  return d.toISOString().slice(0, 10);\n}\nmodule.exports = { formatDate };\n",
      'src/api/users.js': "const { formatDate } = require('../util/date');\nexports.row = (u) => u.name + ' joined ' + formatDate(u.joined);\n",
      'src/api/orders.js': "const { formatDate } = require('../util/date');\nexports.key = (o) => o.id + '-' + formatDate(o.placed);\n",
      'src/jobs/nightly/report.js': "const { formatDate } = require('../../util/date');\nexports.fileName = (day) => 'report-' + formatDate(day) + '.csv';\n",
      'test/date.test.js': "const assert = require('assert');\nconst { formatDate } = require('../src/util/date');\nassert.strictEqual(formatDate(new Date('2026-01-02T03:04:05Z')), '2026-01-02');\n",
    });
  },
  graders: [completed(), contains('users.js'), contains('orders.js'), contains('report.js'), contains('date.test.js')],
});

export const codeRememberedApi = defineTask({
  id: 'agents-code-remembered-api',
  name: 'Use the installed API of a library the model thinks it knows',
  category: 'agents',
  specialist: 'code',
  tags: ['agents-hard', 'code'],
  description: 'The installed "chalk" here only has paint(text, color); writing chalk.red() from memory fails.',
  task: 'Create warn.js that exports a function warn(message) returning the message coloured red, using the chalk package installed in node_modules. `node test.js` must pass.',
  setup: async (cwd) => {
    await writeFiles(cwd, {
      'package.json': JSON.stringify({ name: 'warner', version: '1.0.0', dependencies: { chalk: '^9.0.0' } }, null, 2),
      'node_modules/chalk/package.json': JSON.stringify({ name: 'chalk', version: '9.0.0', main: 'index.js', types: 'index.d.ts' }, null, 2),
      'node_modules/chalk/index.d.ts':
        "export type Color = 'red' | 'green' | 'yellow';\n/** chalk 9 (this fixture): one function. The chained style API (chalk.red(...)) is gone. */\nexport function paint(text: string, color: Color): string;\n",
      'node_modules/chalk/index.js':
        "const CODES = { red: 31, green: 32, yellow: 33 };\nexports.paint = function paint(text, color) {\n  if (!(color in CODES)) throw new TypeError('unknown color ' + color);\n  return '\\u001b[' + CODES[color] + 'm' + text + '\\u001b[39m';\n};\n",
      'test.js': [
        "const fs = require('fs');",
        "if (!/require\\(['\"]chalk['\"]\\)/.test(fs.readFileSync(__dirname + '/warn.js', 'utf8'))) { console.error('warn.js must use chalk'); process.exit(1); }",
        "const { warn } = require('./warn');",
        "if (warn('disk low') !== '\\u001b[31mdisk low\\u001b[39m') { console.error('wrong: ' + JSON.stringify(warn('disk low'))); process.exit(1); }",
        "console.log('ok');",
        '',
      ].join('\n'),
    });
  },
  graders: [completed(), commandRuns({ command: ['node', 'test.js'] })],
});

export const debugIndirect = defineTask({
  id: 'agents-debug-indirect',
  name: 'Find a root cause away from where it throws',
  category: 'agents',
  specialist: 'debug',
  tags: ['agents-hard', 'debug'],
  description: 'The error is thrown in render.js; the cause is the wrong key at config.js line 4.',
  task: '`node test.js` fails. Find the root cause.',
  setup: async (cwd) => {
    await writeFiles(cwd, {
      'config.js': "// Display settings.\nmodule.exports = {\n  width: 40,\n  titleKey: 'heading',\n};\n",
      'data.js': "module.exports = [{ title: 'one' }, { title: 'two' }];\n",
      'render.js': "const config = require('./config');\nfunction render(items) {\n  return items.map((item) => item[config.titleKey].toUpperCase()).join('\\n');\n}\nmodule.exports = { render };\n",
      'test.js': "const { render } = require('./render');\nconst out = render(require('./data'));\nif (out !== 'ONE\\nTWO') { console.error('wrong: ' + out); process.exit(1); }\nconsole.log('ok');\n",
    });
  },
  graders: [completed(), regex(citesLine('config.js', 4)), fileMatches('config.js', "titleKey: 'heading'")],
});

export const askTraced = defineTask({
  id: 'agents-ask-traced',
  name: 'Answer by following a value across files',
  category: 'agents',
  specialist: 'ask',
  tags: ['agents-hard', 'ask'],
  description: 'The default port is basePort() (8400, ports.js) plus OFFSET (17, offset.js): 8417.',
  task: 'What port does the server listen on when the PORT environment variable is not set?',
  setup: async (cwd) => {
    await writeFiles(cwd, {
      'src/server.js': "const { basePort } = require('./net/ports');\nconst { OFFSET } = require('./net/offset');\nconst port = Number(process.env.PORT) || basePort() + OFFSET;\nmodule.exports = { port };\n",
      'src/net/ports.js': "// The block of ports this service family uses.\nexports.basePort = () => 8400;\n",
      'src/net/offset.js': '// Each service adds its own offset to the base port.\nexports.OFFSET = 17;\n',
    });
  },
  graders: [completed(), contains('8417')],
});

const USERS = ['profile', 'header', 'emails', 'audit', 'search'];

export const codeManyFiles = defineTask({
  id: 'agents-code-many-files',
  name: 'Make a change that spans five files',
  category: 'agents',
  specialist: 'code',
  tags: ['agents-hard', 'code'],
  description: 'Rename getUserName to getDisplayName in its module and all five callers; node test.js must pass.',
  task: 'Rename the function getUserName to getDisplayName everywhere in this project, including every caller. `node test.js` must pass.',
  setup: async (cwd) => {
    const files: Record<string, string> = {
      'lib/names.js': "function getUserName(u) {\n  return (u.first + ' ' + u.last).trim();\n}\nmodule.exports = { getUserName };\n",
    };
    for (const name of USERS) {
      files[`lib/${name}.js`] = `const { getUserName } = require('./names');\nexports.${name} = (u) => '${name}:' + getUserName(u);\n`;
    }
    files['test.js'] = [
      "const fs = require('fs');",
      "const path = require('path');",
      "for (const f of fs.readdirSync(path.join(__dirname, 'lib'))) {",
      "  if (/getUserName/.test(fs.readFileSync(path.join(__dirname, 'lib', f), 'utf8'))) { console.error('getUserName still in lib/' + f); process.exit(1); }",
      '}',
      "const { getDisplayName } = require('./lib/names');",
      "if (getDisplayName({ first: 'Ada', last: 'L' }) !== 'Ada L') process.exit(1);",
      ...USERS.map((n) => `if (require('./lib/${n}').${n}({ first: 'Ada', last: 'L' }) !== '${n}:Ada L') { console.error('${n} broken'); process.exit(1); }`),
      "console.log('ok');",
      '',
    ].join('\n');
    await writeFiles(cwd, files);
  },
  graders: [completed(), commandRuns({ command: ['node', 'test.js'] })],
});

/** Seven files, each naming only the next, so the answer cannot be read in one parallel batch. */
const CHAIN = ['a7', 'q2', 'm9', 'x4', 'k1', 'z8', 'p5'];

export const askDeepChain = defineTask({
  id: 'agents-ask-deep-chain',
  name: 'Answer by following a value through seven files',
  category: 'agents',
  specialist: 'ask',
  tags: ['agents-hard', 'ask'],
  description: 'The retry timeout is set at the end of a chain of seven modules: 2750 ms.',
  task: 'How many milliseconds does the client wait before it retries a request?',
  setup: async (cwd) => {
    const files: Record<string, string> = {
      'src/client.js': `const { retryDelay } = require('./cfg/${CHAIN[0]}');\nexports.retry = (fn) => setTimeout(fn, retryDelay());\n`,
    };
    CHAIN.forEach((id, i) => {
      const next = CHAIN[i + 1];
      files[`src/cfg/${id}.js`] = next
        ? `// Delegates to the next settings layer.\nexports.retryDelay = () => require('./${next}').retryDelay();\n`
        : '// The final settings layer.\nexports.retryDelay = () => 2750;\n';
    });
    await writeFiles(cwd, files);
  },
  graders: [completed(), contains('2750')],
});
