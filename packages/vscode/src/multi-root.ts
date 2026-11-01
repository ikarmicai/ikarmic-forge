import { t } from './l10n.js';

/** The notice for a workspace of several folders; Forge reads, runs and saves in the first one only. */
export function firstFolderNotice(folders: readonly string[]): string | undefined {
  if (folders.length < 2) return undefined;
  return t('Forge works in the first folder of this workspace, {0}. It cannot reach the other {1} from chat.', folders[0]!, String(folders.length - 1));
}
