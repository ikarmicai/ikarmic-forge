/** Message lookup for the language override, free of the vscode module so it can be unit-tested. */

export type Language = 'auto' | 'en' | 'es' | 'zh-cn';

export const LANGUAGES: readonly Language[] = ['auto', 'en', 'es', 'zh-cn'];

export function parseLanguage(value: unknown): Language {
  return LANGUAGES.includes(value as Language) ? (value as Language) : 'auto';
}

export function formatMessage(message: string, args: ReadonlyArray<string | number | boolean>): string {
  return message.replace(/\{(\d+)\}/g, (whole, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : whole));
}

export type Translate = (message: string, ...args: Array<string | number | boolean>) => string;

/**
 * `auto` follows the VS Code display language (via `host`). Any other value is the user's own choice: it uses that
 * language's bundle and falls back to English, never to the display language, so the page is not half and half.
 */
export function makeTranslator(language: Language, bundle: Record<string, string> | undefined, host: Translate): Translate {
  if (language === 'auto') return host;
  return (message, ...args) => formatMessage(language === 'en' ? message : (bundle?.[message] ?? message), args);
}
