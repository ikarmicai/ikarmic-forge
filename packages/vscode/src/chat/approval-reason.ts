/**
 * Why an approval card is asking, in words. A permission rule's ask holds in Autonomous too, so a card that just
 * says "Destructive" with approvals off looks like a bug; the live CRM run showed four of them (RB-159).
 */
import type { ApprovalRequest } from '@ikarmic/forge-core';

import { t } from '../l10n.js';

/** The sentence for the card, or undefined when the ask is the ordinary one for the approval level. */
export function approvalReason(because: ApprovalRequest['askedBecause']): string | undefined {
  if (!because) return undefined;
  switch (because.kind) {
    case 'outside_path':
      return t('Asks because it names a path outside the project: {0}', because.target);
    case 'secret_file':
      return t('Asks because {0} may hold secrets.', because.target);
    case 'rule':
      return t('Asks because a permission rule says to ask before: {0}', because.target);
  }
}
