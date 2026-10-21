/**
 * `forge policy`: show which organization policy (if any) applies on this machine.
 */
import process from 'node:process';

import { PolicyError, getOrgPolicy, managedPolicyPath } from '@ikarmic/forge-core';

export function handlePolicyCommand(): number {
  try {
    const loaded = getOrgPolicy();
    if (!loaded) {
      process.stdout.write(`No organization policy is active.\n(Looked for ${process.env.FORGE_POLICY_FILE ?? managedPolicyPath()})\n`);
      return 0;
    }
    process.stdout.write(`Organization policy: ${loaded.source}\n\n${JSON.stringify(loaded.policy, null, 2)}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`forge: ${(err as Error).message}\n`);
    return err instanceof PolicyError ? 2 : 1;
  }
}
