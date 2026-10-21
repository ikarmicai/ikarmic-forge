/**
 * Decides which post-edit checks a chat run may use: the commands the user listed, the ones
 * detected from the project (with consent), or none. Pure and vscode-free so it is unit-tested.
 */
import { createHash } from 'node:crypto';

export type VerifyAutoMode = 'ask' | 'on' | 'off';

export interface VerifyPlan {
  commands: string[];
  source: 'explicit' | 'detected' | 'none';
  /** True when the detected commands may only run after the user approves this exact list. */
  needsConsent: boolean;
  /** Identifies `commands`; stored as the approval and compared against it. */
  hash: string;
}

export function commandsHash(commands: string[]): string {
  return createHash('sha256').update(JSON.stringify(commands)).digest('hex').slice(0, 16);
}

export function planVerify(input: {
  explicit: string[];
  mode: VerifyAutoMode;
  trusted: boolean;
  detected: string[];
  /** Repo text behind `detected` (script bodies); an edit to it invalidates an earlier approval. */
  fingerprint?: string[];
  approvedHash?: string;
  declinedHash?: string;
}): VerifyPlan {
  const none = (hash: string): VerifyPlan => ({ commands: [], source: 'none', needsConsent: false, hash });
  if (input.explicit.length > 0) {
    return { commands: input.explicit, source: 'explicit', needsConsent: false, hash: commandsHash(input.explicit) };
  }
  const hash = commandsHash(input.fingerprint ? [...input.detected, ...input.fingerprint] : input.detected);
  if (input.mode === 'off' || !input.trusted || input.detected.length === 0) return none(hash);
  if (input.declinedHash === hash) return none(hash);
  const approved = input.mode === 'on' || input.approvedHash === hash;
  return { commands: input.detected, source: 'detected', needsConsent: !approved, hash };
}
