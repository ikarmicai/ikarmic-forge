/**
 * Cheap, model-free check for "this chat message asks for a whole system" ("build a CRM"), used to
 * offer a spec before the agent starts. Pure and vscode-free so it is unit-testable. A wrong guess
 * costs the user one click, so it errs narrow: a build verb close to a whole-system noun, or a long
 * message that lists many requirements.
 */

const BUILD_VERBS = 'build|create|make|develop|implement|design|scaffold|set up|generate|write me';
const SYSTEM_NOUNS =
  'app|application|system|platform|crm|erp|cms|website|web ?site|api|backend|frontend|dashboard|portal|saas|marketplace|game';
// A verb, up to four words (determiners, adjectives), then the noun: "build a simple task app".
const BUILD_SYSTEM = new RegExp(`\\b(?:${BUILD_VERBS})\\b(?:\\s+[\\w-]+){0,4}?\\s+(?:${SYSTEM_NOUNS})\\b`, 'i');

const LONG_MESSAGE_WORDS = 40;
const MIN_LIST_SEPARATORS = 5;
const REQUIREMENT_INTENT = /\b(?:need|want|should|must|would like|let (?:people|users|them|me))\b/i;

function listSeparators(text: string): number {
  const commasAndAnds = (text.match(/,|\band\b/gi) ?? []).length;
  const bullets = (text.match(/^\s*(?:[-*•]|\d+[.)])\s/gm) ?? []).length;
  return commasAndAnds + bullets;
}

/** A file path or file name means a scoped change, however big the noun that follows. */
function namesAFile(text: string): boolean {
  return /[\\/]|\.[a-z0-9]{1,5}\b/i.test(text.replace(/[.!?]+(?=\s|$)/g, ''));
}

export function looksLarge(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\/spec\b/i.test(t)) return false;
  if (/(?:^|\s)@\S/.test(t)) return false;

  if (BUILD_SYSTEM.test(t) && !namesAFile(t)) return true;

  const words = t.split(/\s+/).length;
  return words >= LONG_MESSAGE_WORDS && REQUIREMENT_INTENT.test(t) && listSeparators(t) >= MIN_LIST_SEPARATORS;
}
