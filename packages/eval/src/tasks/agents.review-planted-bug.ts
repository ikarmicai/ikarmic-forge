import { completed, defineTask, regex, regexAbsent } from '../graders/index.js';

import { citesLine, gitWithChange } from './agents.fixtures.js';

/** The line of auth.js where the change turns a comparison into an assignment. */
const BUG_LINE = 2;

const ORIGINAL = [
  'function canDelete(user) {',
  "  if (user.role === 'admin') {",
  '    return true;',
  '  }',
  '  return false;',
  '}',
  'function displayName(person) {',
  "  return person.first + ' ' + person.last;",
  '}',
  'module.exports = { canDelete, displayName };',
  '',
].join('\n');

/** agents / review: find the real bug in the diff; a harmless rename is not a blocking problem. */
export default defineTask({
  id: 'agents-review-planted-bug',
  name: 'Review a change with one real bug',
  category: 'agents',
  specialist: 'review',
  tags: ['agents', 'review'],
  description: 'Review agent reports the assignment-in-condition at auth.js line 2 and does not block on a rename.',
  task: 'Review my uncommitted changes.',
  setup: async (cwd) => {
    const changed = ORIGINAL.replace("user.role === 'admin'", "user.role = 'admin'")
      .replace('function displayName(person)', 'function displayName(p)')
      .replace("person.first + ' ' + person.last", "p.first + ' ' + p.last");
    await gitWithChange(cwd, { 'auth.js': ORIGINAL }, { 'auth.js': changed });
  },
  graders: [
    completed(),
    regex(citesLine('auth.js', BUG_LINE)),
    regexAbsent(/BLOCKING[^\n]*\b(rename|renamed|displayName)\b/i),
  ],
});
