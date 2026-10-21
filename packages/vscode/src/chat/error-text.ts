import { t } from '../l10n.js';

const MISSING_KEY = /^(.+?) API key is missing\..*?\b([A-Z][A-Z0-9_]*_API_KEY)\b/;

/**
 * The AI SDK words a missing key for library users ("Pass it using the 'apiKey' parameter").
 * In VS Code the fix is Settings or an environment variable, so say that.
 */
export function friendlyError(message: string): string {
  const m = MISSING_KEY.exec(message);
  return m ? t('No {0} API key. Add one in Settings → API keys, or set {1}.', m[1]!, m[2]!) : message;
}
