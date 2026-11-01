import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { commandRuns, completed, defineTask, fileExists, fileMatches, regex, regexAbsent } from '../graders/index.js';

import { writeFiles } from './agents.fixtures.js';

const TOKENS = ':root {\n  --warning: #ffb43d;\n  --warning-tint: #2e2209;\n  --space-sm: 12px;\n  --radius-sm: 6px;\n}\n';

/** agents / design: the project has tokens, so the new styles read them and carry no literal colour. */
export const designUsesTokens = defineTask({
  id: 'agents-design-tokens',
  name: 'Style a new banner from the design tokens',
  category: 'agents',
  specialist: 'design',
  tags: ['agents', 'design'],
  description: 'Design agent adds a banner to page.html, styled in page.css with var(--...) and no literal colour.',
  task: 'Add a warning banner at the top of page.html that says the trial ends soon. Style it in page.css.',
  setup: async (cwd) => {
    await writeFiles(cwd, {
      'tokens.css': TOKENS,
      'page.css': 'body {\n  margin: 0;\n}\n',
      'page.html': '<!doctype html>\n<html lang="en">\n<head>\n<link rel="stylesheet" href="tokens.css" />\n<link rel="stylesheet" href="page.css" />\n</head>\n<body>\n<main>Welcome</main>\n</body>\n</html>\n',
    });
  },
  graders: [
    completed(),
    fileMatches('page.html', /trial/i),
    fileMatches('page.css', /var\(--warning/),
    fileMatches('tokens.css', { equals: TOKENS }),
    (ctx) => {
      const literal = readFileSync(join(ctx.cwd, 'page.css'), 'utf8').match(/.*(#[0-9a-f]{3,8}|rgba?\().*/i);
      return { passed: literal === null, message: literal ? `literal colour in page.css: ${literal[0].trim()}` : 'no literal colour in page.css' };
    },
  ],
});

const DISCOUNT = [
  '/** Price after a percent discount. Never below zero. */',
  'function discount(price, percent) {',
  '  return price - (price * percent) / 100;',
  '}',
  'module.exports = { discount };',
  '',
].join('\n');

/** agents / testing: the code breaks its own comment, so the agent reports that and leaves the source as it is. */
export const testingFindsBug = defineTask({
  id: 'agents-testing-reports-bug',
  name: 'Write tests, report the bug, leave the source alone',
  category: 'agents',
  specialist: 'testing',
  tags: ['agents', 'testing'],
  description: 'Testing agent covers discount(), meets the broken "never below zero" promise, and reports it without changing discount.js.',
  task: 'Add tests for discount.js in discount.test.js. Run them with `node discount.test.js`.',
  setup: async (cwd) => {
    await writeFiles(cwd, { 'discount.js': DISCOUNT });
  },
  graders: [
    completed(),
    fileExists('discount.test.js'),
    fileMatches('discount.test.js', /discount\(/),
    fileMatches('discount.js', { equals: DISCOUNT }),
    regex(/below zero|negative|-\s?\d+|less than (0|zero)/i),
  ],
});

/** agents / devops: a pipeline with a pinned action and no secret, and no attempt to publish. */
export const devopsWritesCi = defineTask({
  id: 'agents-devops-ci',
  name: 'Write a CI workflow and release nothing',
  category: 'agents',
  specialist: 'devops',
  tags: ['agents', 'devops'],
  description: 'DevOps agent writes a GitHub Actions workflow that runs the tests with a pinned action, and says what is left to the person.',
  task: 'Add a GitHub Actions workflow at .github/workflows/ci.yml that runs `npm test` on every push.',
  setup: async (cwd) => {
    await writeFiles(cwd, {
      'package.json': JSON.stringify({ name: 'demo', version: '1.0.0', scripts: { test: 'node test.js' } }, null, 2) + '\n',
      'test.js': "console.log('ok');\n",
    });
  },
  graders: [
    completed(),
    fileMatches('.github/workflows/ci.yml', /npm (run )?test/),
    fileMatches('.github/workflows/ci.yml', /uses:\s*actions\/checkout@\S*\d/),
    commandRuns({ command: ['node', '-e', "if (/@latest|@main|@master/.test(require('fs').readFileSync('.github/workflows/ci.yml', 'utf8'))) process.exit(1)"] }),
    regexAbsent(/\bI (pushed|deployed|published)\b/i),
  ],
});
