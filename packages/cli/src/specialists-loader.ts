/**
 * Bootstrap loader for `~/.forge/specialists.json`: runs once at CLI
 * startup so custom specialists are available to every orchestrator
 * command without each command having to know about the file.
 *
 * Designed to be silent on the happy path (file missing → no-op),
 * verbose on failure: malformed JSON or unreadable file → stderr
 * warning so the user knows why their custom profile isn't picked
 * up. We never exit non-zero just because the user has a bad
 * config: the built-ins still work.
 */

import process from 'node:process';

import { loadSpecialistsFromConfig } from '@ikarmic/forge-core';

/**
 * Load custom specialists from the user's config file. Logs warnings
 * to stderr but never throws: returns the load result so callers
 * can introspect or display counts.
 */
export function loadCustomSpecialists(): {
  registered: number;
  warnings: number;
  errors: number;
} {
  const result = loadSpecialistsFromConfig();
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      process.stderr.write(`forge specialists: ${err}\n`);
    }
  }
  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      const prefix = w.id ? `specialist[${w.id}]` : 'specialist';
      process.stderr.write(`forge specialists: ${prefix}: ${w.message}\n`);
    }
  }
  return {
    registered: result.registered.length,
    warnings: result.warnings.length,
    errors: result.errors.length,
  };
}