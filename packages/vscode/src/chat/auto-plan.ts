/**
 * Cheap, model-free check for "this chat message asks for a new app or a new feature", used to switch the chat to Plan
 * mode before the run (the Plan agent then asks its questions and writes the plan). Pure and vscode-free so it is
 * unit-testable. Switching costs the person one click (Undo), so it errs narrow: a build or add verb close to a noun
 * that means a whole piece of software, and vetoes for a question, a small edit or a request that names a file.
 */
import { looksLarge } from './large-request.js';

const VERBS = 'build|create|make|develop|implement|add|design|scaffold|set up|generate|write me|integrate|introduce';
const NOUNS =
  'app|application|system|platform|crm|erp|cms|website|web ?site|api|backend|frontend|dashboard|portal|saas|marketplace|game|feature|functionality|module|service|integration|workflow|pipeline|login|sign-?in|sign-?up|authentication|auth|billing|payments?|checkout|notifications?|search|reporting|analytics|admin panel';
// A verb, up to five words (determiners, adjectives, a product name), then the noun: "add Stripe payments".
const NEW_WORK = new RegExp(`\\b(?:${VERBS})\\b(?:\\s+[\\w-]+){0,5}?\\s+(?:${NOUNS})\\b`, 'i');

/** The person has already said the scope is small, or is asking rather than asking for work. */
const SMALL = /\b(?:fix|typo|rename|bump|tweak|format|lint|revert|test|tests|comment|log|logging|docs?|readme|button|label|icon|tooltip|placeholder|colou?r|margin|padding|border|font)\b/i;
// "need a CRM", "we want a simple todo app": no build verb, but the person is asking for a whole piece of software.
const WHOLE = 'app|application|system|platform|crm|erp|cms|website|web ?site|dashboard|portal|saas|marketplace|game|backend|frontend';
const WANT = new RegExp(`\\b(?:need|want|require|would like|looking for)\\b(?:\\s+(?:a|an|my|our|some))?(?:\\s+(?!the\\b|to\\b|this\\b|that\\b|it\\b)[\\w-]+){0,4}?\\s+(?:${WHOLE})\\b(?!\\s+(?:to|is|was|has|does|should)\\b)`, 'i');
const QUESTION = /^\s*(?:how|what|why|where|when|which|who|does|is|are|explain|describe|tell|show)\b/i;

/** Cap before any regex runs, so a pathological message cannot stall the editor. */
const MAX_INPUT = 4000;
const MIN_WORDS = 3;

/** A file path or file name means a scoped change, however big the noun that follows. */
function namesAFile(text: string): boolean {
  return /[\\/]|\.[a-z0-9]{1,5}\b/i.test(text.replace(/[.!?]+(?=\s|$)/g, ''));
}

/** `typed` is what the person wrote, `sent` what goes to the model: a slash command expands into a long prompt of its own. */
export function looksLikeNewWork(typed: string, sent: string): boolean {
  const t = sent.trim().slice(0, MAX_INPUT);
  if (!t || typed.trim() !== sent.trim()) return false;
  if (/^\/\S/.test(t) || /(?:^|\s)@\S/.test(t)) return false;
  if (looksLarge(t)) return true;
  if (QUESTION.test(t) || SMALL.test(t) || namesAFile(t)) return false;
  if (t.split(/\s+/).length < MIN_WORDS) return false;
  return NEW_WORK.test(t) || WANT.test(t);
}

export interface AutoPlanGate {
  modeId: string;
  trusted: boolean;
  enabled: boolean;
  typed: string;
  sent: string;
}

/** Only from the default Agent mode: a person who chose Ask, Debug or Plan already said how they want it run. */
export function shouldAutoPlan(g: AutoPlanGate): boolean {
  return g.modeId === 'agent' && g.trusted && g.enabled && looksLikeNewWork(g.typed, g.sent);
}
