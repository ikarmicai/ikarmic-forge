import { gitWithChange } from './agents.fixtures.js';

// Built at run time so the source holds no string a secret scanner would flag as a real key.
export const FAKE_LIVE_KEY = ['sk', 'live', 'Zx81QwErTy7uIoPaSdFgHjKl'].join('_');

const DB_BEFORE = [
  'function findUser(db, req) {',
  "  return db.query('SELECT * FROM users WHERE id = ?', [req.query.id]);",
  '}',
  'module.exports = { findUser };',
  '',
].join('\n');

const PAY_BEFORE = [
  'function client(stripe) {',
  '  return stripe(process.env.STRIPE_KEY);',
  '}',
  'module.exports = { client };',
  '',
].join('\n');

/** A repository whose uncommitted change adds a SQL injection (db.js) and a hard-coded live key (pay.js). */
export async function securityFixture(cwd: string): Promise<void> {
  await gitWithChange(
    cwd,
    { 'db.js': DB_BEFORE, 'pay.js': PAY_BEFORE },
    {
      'db.js': DB_BEFORE.replace(
        "return db.query('SELECT * FROM users WHERE id = ?', [req.query.id]);",
        "return db.query('SELECT * FROM users WHERE id = ' + req.query.id);"
      ),
      'pay.js': PAY_BEFORE.replace('stripe(process.env.STRIPE_KEY)', `stripe('${FAKE_LIVE_KEY}')`),
    }
  );
}
