import { stripThinkTags } from '@ikarmic/forge-core';

/**
 * Pure helpers for the inline completion provider. Kept separate so they
 * can be unit-tested without a VS Code host.
 *
 * What lives here:
 *  - sanitize(): clean raw model output before it reaches the user.
 *  - buildPrompt(): assemble the fill-in-the-middle prompt.
 *  - isInsideStringOrComment(): language-aware trigger suppression.
 *  - shouldSuppressAt(): cheap pre-filter for positions that almost never
 *    produce useful completions.
 */

/**
 * Strip code fences and trim both ends. Defensive against models that wrap
 * their answer in markdown despite the system prompt saying not to. Leading
 * whitespace gets trimmed so a stray newline at the top doesn't add a blank
 * line or weird indentation when inserted mid-line.
 */
export function sanitize(text: string): string {
  // Reasoning models put an inline <think> block in the reply; it must never reach the editor.
  let t = stripThinkTags(text);
  // Strip code fences if the model accidentally included them.
  t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```\s*$/, '');
  // A leading newline (with optional indent) is annoying when inserted mid-line.
  if (t.startsWith('\n')) t = t.slice(1);
  return t.trim();
}

/**
 * Build the fill-in-the-middle prompt. Caps each side so very large files
 * don't blow past the model's input window. Tells the model where the cursor
 * is with a sentinel that's unlikely to collide with real code.
 */
export function buildPrompt(languageId: string, prefix: string, suffix: string): string {
  const maxSide = 3000;
  const head = prefix.length > maxSide ? '…' + prefix.slice(-maxSide) : prefix;
  const tail = suffix.length > maxSide ? suffix.slice(0, maxSide) + '…' : suffix;
  const langHint = languageId ? `\nLanguage: ${languageId}\n` : '';
  return `${langHint}Complete the code below. Output only the missing text that goes at <CURSOR>.

<CODE>
${head}<CURSOR>${tail}
</CODE>`;
}

/**
 * Cheap, language-agnostic check: is the cursor inside a string literal or
 * a line/block comment? Returns true when we'd rather skip the completion
 * (the model has nothing meaningful to add mid-string / mid-comment).
 *
 * The check is intentionally simple: we look at the prefix up to the
 * cursor, counting unescaped quotes and tracking comment state. It doesn't
 * aim for 100% accuracy (the language server's tokenizer is more precise);
 * it just catches the obvious cases where requesting a completion is wasted
 * latency and tokens.
 */
export function isInsideStringOrComment(prefix: string, languageId: string): boolean {
  // Strip block comments first; we want to count quote chars outside them.
  // We don't try to handle nested block comments: VS Code doesn't usually
  // expose them and it complicates the regex considerably.
  const cleaned = stripBlockComments(prefix);

  // An opening block-comment marker with no matching close before the
  // cursor means we're still inside it (e.g. composing a JSDoc comment:
  // `/** describe th<cursor>` has no `*/` yet). stripBlockComments only
  // removes complete `/* ... */` pairs, so any `/*` left in `cleaned` is
  // necessarily unterminated.
  if (cleaned.includes('/*')) return true;

  // Line comment syntax per language. We check the text on the same line as
  // the cursor: if a comment marker (//, #, --) appears there, outside of
  // any string, then the cursor is in a comment. We track quote balance as
  // we walk the line so a comment marker inside a string doesn't trip us up.
  const lineMarker = LINE_COMMENT_MARKERS[languageId];
  if (lineMarker) {
    const lastNewline = cleaned.lastIndexOf('\n');
    const tail = lastNewline === -1 ? cleaned : cleaned.slice(lastNewline + 1);
    if (tailContainsUnquotedCommentMarker(tail, lineMarker)) return true;
  }

  // Count quote characters that aren't escaped. We do this for each quote
  // style independently: an odd count means we're inside one of them.
  return (
    unescapedCount(cleaned, '"') % 2 === 1 ||
    unescapedCount(cleaned, "'") % 2 === 1 ||
    unescapedCount(cleaned, '`') % 2 === 1
  );
}

/**
 * Map of languageId → line-comment marker. Conservative: only languages
 * where the marker is unambiguous. Adding more is welcome.
 */
const LINE_COMMENT_MARKERS: Record<string, string> = {
  javascript: '//',
  typescript: '//',
  javascriptreact: '//',
  typescriptreact: '//',
  python: '#',
  ruby: '#',
  shellscript: '#',
  yaml: '#',
  toml: '#',
  perl: '#',
  r: '#',
  lua: '--',
  sql: '--',
  haskell: '--',
};

/**
 * Returns true when `marker` appears in `line` outside of any string literal.
 * We walk the line, tracking quote balance, and check whether we cross the
 * marker while in "not in string" state.
 */
function tailContainsUnquotedCommentMarker(line: string, marker: string): boolean {
  const quotes = ['"', "'", '`'];
  let inString: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inString !== null) {
      // Inside a string: only the matching quote (not escaped) ends it.
      if (c === inString && !isEscaped(line, i)) {
        inString = null;
      }
      continue;
    }
    if (quotes.includes(c)) {
      inString = c;
      continue;
    }
    // Check if the marker starts at position i.
    if (c === marker[0] && line.startsWith(marker, i)) return true;
  }
  return false;
}

function isEscaped(text: string, pos: number): boolean {
  let bs = 0;
  for (let j = pos - 1; j >= 0 && text[j] === '\\'; j--) bs++;
  return bs % 2 === 1;
}

/**
 * Pre-filter for positions where we know a completion will almost never
 * help. Returns true to skip. Mirrors the heuristic in the provider's old
 * trigger filter, but extracted so it can be tested in isolation.
 */
export function shouldSuppressAt(prefix: string, cursorOffset: number): boolean {
  if (cursorOffset <= 0) return true;
  if (prefix.trim().length < 2) return true;
  if (prefix.length > 8000) return true;

  const charBefore = prefix[cursorOffset - 1];
  if (charBefore === undefined) return true;

  // Mid-word completion is expensive and rarely wanted: VS Code's word-
  // based suggestion handles that case.
  const midWord = /[a-zA-Z0-9_$\]]/.test(charBefore);
  const triggerChars = new Set(['\n', ' ', '\t', '.', ':', '(', '[', '{', ',']);
  return midWord && !triggerChars.has(charBefore);
}

function unescapedCount(text: string, quote: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== quote) continue;
    // Skip escaped quotes: \" \\" \\\\\"
    if (i > 0 && text[i - 1] === '\\') {
      // Count the preceding backslashes: an even number means "not escaped".
      let bs = 0;
      for (let j = i - 1; j >= 0 && text[j] === '\\'; j--) bs++;
      if (bs % 2 === 1) continue;
    }
    count++;
  }
  return count;
}

function stripBlockComments(prefix: string): string {
  // Replace /* ... */ blocks with spaces (preserve length for offset math).
  return prefix.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
}
