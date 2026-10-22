/**
 * `@` mentions in chat messages: `@src/app.ts`, `@file:path`, `@folder:src`,
 * `@symbol:Name`, `@problems`, `@terminal`, `@git`, `@git:staged`, a web page
 * (`@https://…` or `@url:https://…`) and documentation (`@docs:<name>` from `forge.docs`).
 * Parsing and prompt assembly are pure; reading files, diagnostics, git and the
 * terminal are injected as {@link MentionResolvers} by the extension.
 */

export type Mention =
  | { kind: 'file'; value: string; raw: string }
  | { kind: 'folder'; value: string; raw: string }
  | { kind: 'symbol'; value: string; raw: string }
  | { kind: 'problems'; raw: string }
  | { kind: 'terminal'; raw: string }
  | { kind: 'git'; value: 'working' | 'staged'; raw: string }
  | { kind: 'url'; value: string; raw: string }
  | { kind: 'docs'; value: string; raw: string }
  | { kind: 'chat'; value: string; raw: string };

export interface MentionResolvers {
  /** File text, or null when missing / outside the workspace. */
  file(path: string): Promise<string | null>;
  /** Folder listing, or null when missing / not a directory. */
  folder(path: string): Promise<string | null>;
  symbol(name: string): Promise<string | null>;
  problems(): Promise<string>;
  terminal(): Promise<string>;
  git(kind: 'working' | 'staged'): Promise<string>;
  /** Route a bare `@path`: is it a directory? Defaults to "file". */
  isDirectory?(path: string): Promise<boolean>;
  /** A web page's text, or null when it can't be fetched. */
  url?(url: string): Promise<string | null>;
  /** A named documentation source's text, or null when the name is unknown or unreachable. */
  docs?(name: string): Promise<string | null>;
  /** The text of a saved chat (`last`, an id prefix or a dashed label), or null when none matches. */
  chat?(ref: string): Promise<string | null>;
}

export interface ResolvedMentions {
  /** The user's message with `<context>` blocks appended. */
  prompt: string;
  attached: Array<{ label: string; chars: number; truncated: boolean }>;
  /** Mentions that could not be resolved (shown to the user, ignored for the model). */
  unresolved: string[];
}

const KEYWORDS = new Set(['problems', 'terminal', 'git']);
// `@` not preceded by a word char / another `@` / `.` (so emails and `a@b` are left alone).
const TOKEN = /(?<![\w@.])@([A-Za-z0-9_.\/\\~-]+(?::[^\s,;)]+)?)/g;

/** Find mentions, in order, without duplicates. Sentence punctuation after a token is not part of it. */
export function parseMentions(text: string): Mention[] {
  const out: Mention[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(TOKEN)) {
    let token = m[1]!.replace(/[.,;:!?]+$/, '');
    if (!token) continue;
    const raw = `@${token}`;
    if (seen.has(raw)) continue;

    let mention: Mention | null = null;
    const colon = token.indexOf(':');
    const head = colon === -1 ? token : token.slice(0, colon);
    const rest = colon === -1 ? '' : token.slice(colon + 1);

    if (colon !== -1 && rest && (head === 'http' || head === 'https') && rest.startsWith('//')) {
      mention = { kind: 'url', value: `${head}:${rest}`, raw };
    } else if (colon !== -1 && rest) {
      if (head === 'url' && /^https?:\/\//.test(rest)) mention = { kind: 'url', value: rest, raw };
      else if (head === 'docs') mention = { kind: 'docs', value: rest.toLowerCase(), raw };
      else if (head === 'chat') mention = { kind: 'chat', value: rest, raw };
      else if (head === 'file') mention = { kind: 'file', value: rest, raw };
      else if (head === 'folder') mention = { kind: 'folder', value: rest, raw };
      else if (head === 'symbol') mention = { kind: 'symbol', value: rest, raw };
      else if (head === 'git') mention = { kind: 'git', value: rest === 'staged' ? 'staged' : 'working', raw };
    } else if (colon === -1 && KEYWORDS.has(head)) {
      mention = head === 'problems' ? { kind: 'problems', raw } : head === 'terminal' ? { kind: 'terminal', raw } : { kind: 'git', value: 'working', raw };
    } else if (colon === -1 && /[\/\\.]/.test(head)) {
      // A bare path: `@src/app.ts` or `@README.md`. Must look like a path, not a word.
      mention = { kind: 'file', value: head, raw };
    }
    if (mention) {
      seen.add(raw);
      out.push(mention);
    }
  }
  return out;
}

const MAX_EACH = 20_000;
const MAX_TOTAL = 60_000;
/** Below this many characters left, a block is not worth attaching. */
const MIN_USEFUL = 80;

const TRUNCATED = '\n... (truncated)';

/** Clip to `limit` chars in total, marker included. */
function clip(text: string, limit: number): { text: string; truncated: boolean } {
  return text.length <= limit
    ? { text, truncated: false }
    : { text: text.slice(0, Math.max(0, limit - TRUNCATED.length)) + TRUNCATED, truncated: true };
}

const esc = (s: string): string => s.replace(/"/g, '&quot;');

export async function resolveMentions(
  text: string,
  resolvers: MentionResolvers,
  limits: { maxEach?: number; maxTotal?: number } = {}
): Promise<ResolvedMentions> {
  const mentions = parseMentions(text);
  if (mentions.length === 0) return { prompt: text, attached: [], unresolved: [] };
  const maxEach = limits.maxEach ?? MAX_EACH;
  let remaining = limits.maxTotal ?? MAX_TOTAL;
  const blocks: string[] = [];
  const attached: ResolvedMentions['attached'] = [];
  const unresolved: string[] = [];

  for (const mention of mentions) {
    let body: string | null = null;
    let attrs = '';
    try {
      switch (mention.kind) {
        case 'file': {
          // `@file:src/a.ts#L12-30` (or `#L12`) attaches only those lines.
          const range = /^(.*?)#L(\d+)(?:-L?(\d+))?$/.exec(mention.value);
          const target = range ? range[1]! : mention.value;
          if (!range && resolvers.isDirectory && (await resolvers.isDirectory(target))) {
            body = await resolvers.folder(target);
            attrs = `type="folder" path="${esc(target)}"`;
          } else {
            body = await resolvers.file(target);
            attrs = `type="file" path="${esc(target)}"`;
            if (range && body !== null) {
              const from = Number(range[2]);
              const to = range[3] ? Number(range[3]) : from;
              const lines = body.split(/\r?\n/);
              body = from >= 1 && from <= lines.length && to >= from ? lines.slice(from - 1, to).join('\n') : null;
              attrs += ` lines="${from}-${to}"`;
            }
          }
          break;
        }
        case 'folder':
          body = await resolvers.folder(mention.value);
          attrs = `type="folder" path="${esc(mention.value)}"`;
          break;
        case 'symbol':
          body = await resolvers.symbol(mention.value);
          attrs = `type="symbol" name="${esc(mention.value)}"`;
          break;
        case 'problems':
          body = await resolvers.problems();
          attrs = 'type="problems"';
          break;
        case 'terminal':
          body = await resolvers.terminal();
          attrs = 'type="terminal"';
          break;
        case 'git':
          body = await resolvers.git(mention.value);
          attrs = `type="git" diff="${mention.value}"`;
          break;
        case 'url':
          body = resolvers.url ? await resolvers.url(mention.value) : null;
          attrs = `type="url" url="${esc(mention.value)}"`;
          break;
        case 'docs':
          body = resolvers.docs ? await resolvers.docs(mention.value) : null;
          attrs = `type="docs" name="${esc(mention.value)}"`;
          break;
        case 'chat':
          body = resolvers.chat ? await resolvers.chat(mention.value) : null;
          attrs = `type="chat" ref="${esc(mention.value)}"`;
          break;
      }
    } catch {
      body = null;
    }
    if (body === null || (mention.kind !== 'file' && mention.kind !== 'folder' && mention.kind !== 'symbol' && body.trim() === '')) {
      // Keywords with nothing to say (no problems, clean tree) are still useful to state explicitly.
      if (body === null) {
        unresolved.push(mention.raw);
        continue;
      }
    }
    if (remaining < MIN_USEFUL) {
      unresolved.push(`${mention.raw} (context budget used up)`);
      continue;
    }
    const { text: clipped, truncated } = clip(body === '' ? '(empty)' : body, Math.min(maxEach, remaining));
    remaining -= clipped.length;
    blocks.push(`<context ${attrs}>\n${clipped}\n</context>`);
    attached.push({ label: mention.raw, chars: clipped.length, truncated });
  }

  const prompt = blocks.length > 0 ? `${text}\n\n${blocks.join('\n\n')}` : text;
  return { prompt, attached, unresolved };
}

/** Where to read a docs source: its llms.txt (written for models) first, then the page itself. */
export function docsCandidates(url: string): string[] {
  if (/\.txt$/i.test(new URL(url).pathname)) return [url];
  return [new URL('/llms.txt', url).toString(), url];
}

export interface MentionSuggestion {
  /** Text inserted after the `@`. */
  value: string;
  label: string;
  hint?: string;
}

const KEYWORD_SUGGESTIONS: MentionSuggestion[] = [
  { value: 'problems', label: '@problems', hint: 'errors and warnings from the Problems panel' },
  { value: 'git', label: '@git', hint: 'uncommitted changes' },
  { value: 'git:staged', label: '@git:staged', hint: 'staged changes' },
  { value: 'terminal', label: '@terminal', hint: 'recent Forge terminal output' },
  { value: 'chat:last', label: '@chat:last', hint: 'your previous chat' },
];

/**
 * Autocomplete for what follows `@`: matching keywords and `docs:` sources first, then files
 * (`files` are workspace-relative paths; `docs` are the names in `forge.docs`).
 */
export function mentionSuggestions(query: string, files: readonly string[], limit = 8, docs: readonly string[] = []): MentionSuggestion[] {
  const q = query.toLowerCase();
  const docSuggestions = docs
    .map((name) => ({ value: `docs:${name}`, label: `@docs:${name}`, hint: 'documentation' }))
    .filter((d) => q.length > 0 && (d.value.startsWith(q) || (!q.includes(':') && d.value.slice(5).startsWith(q))));
  const keywords = [...KEYWORD_SUGGESTIONS.filter((k) => k.value.startsWith(q)), ...docSuggestions];
  const matching = files
    .filter((f) => f.toLowerCase().includes(q))
    // Prefer matches in the file name, then shorter paths.
    .sort((a, b) => {
      const an = a.toLowerCase().split('/').pop()!.includes(q) ? 0 : 1;
      const bn = b.toLowerCase().split('/').pop()!.includes(q) ? 0 : 1;
      return an - bn || a.length - b.length;
    })
    .map((f) => ({ value: f, label: `@${f}` }));
  return [...keywords, ...matching].slice(0, limit);
}

/**
 * Remove the `<context ...>` blocks {@link resolveMentions} appended, so a
 * resumed transcript shows what the user typed, not the attached file dumps.
 */
export function stripContextBlocks(text: string): string {
  return text.replace(/\n\n<context [^>]*>[\s\S]*?<\/context>/g, '').trimEnd();
}
