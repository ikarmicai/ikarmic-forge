import { completed, defineTask, regex } from '../graders/index.js';

import { securityFixture } from './agents.security-fixture.js';

/** agents / security: find both planted problems in the change. */
export default defineTask({
  id: 'agents-security-find',
  name: 'Find security problems in a change',
  category: 'agents',
  specialist: 'security',
  tags: ['agents', 'security'],
  description: 'Security agent reports the SQL injection in db.js and the hard-coded key in pay.js.',
  task: 'Check my uncommitted changes for security problems.',
  setup: securityFixture,
  graders: [completed(), regex(/db\.js/), regex(/pay\.js/), regex(/inject/i)],
});
