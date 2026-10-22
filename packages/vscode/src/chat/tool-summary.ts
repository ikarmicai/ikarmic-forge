/**
 * Plain-language summaries of agent tool calls for the chat webview: the
 * one-line tool rows and the approval dock. Pure and vscode-free; bundled
 * into `window.ForgeUI` (see webview-lib.ts) and unit-tested directly.
 *
 * Every function tolerates malformed input (MCP tools can send anything) and
 * never throws.
 *
 */

export interface ToolSummary {
  /** "Read", "Edited", "Searching": present tense while running. */
  verb: string;
  /** Short label shown in mono: basename, command, pattern, URL host+path. */
  target: string;
  /** Full untruncated target, for the tooltip. */
  title: string;
  /** Right-hand text: "84 lines", "+3 −1", "exit 1". */
  meta?: string;
  metaTone?: 'ok' | 'err' | 'muted';
  /** Only for edit_file, and write_file when it created the file. */
  diff?: { before: string; after: string };
}

export interface ToolOutcome {
  result: unknown;
  isError: boolean;
}

const MAX = 60;

const VERBS: Record<string, [done: string, running: string]> = {
  read_file: ['Read', 'Reading'],
  write_file: ['Wrote', 'Writing'],
  edit_file: ['Edited', 'Editing'],
  edit_notebook: ['Edited', 'Editing'],
  run_command: ['Ran', 'Running'],
  list_files: ['Listed', 'Listing'],
  search_files: ['Searched', 'Searching'],
  codebase_search: ['Searched code', 'Searching code'],
  find_symbol: ['Found', 'Finding'],
  find_references: ['Found references to', 'Finding references to'],
  list_symbols: ['Listed symbols in', 'Listing symbols in'],
  fetch_url: ['Fetched', 'Fetching'],
  github_pr_read: ['Read pull request', 'Reading pull request'],
  github_pr_create: ['Opened pull request', 'Opening pull request'],
  web_search: ['Searched the web for', 'Searching the web for'],
  read_image: ['Viewed', 'Viewing'],
  memory_read: ['Read memory', 'Reading memory'],
  memory_write: ['Saved memory', 'Saving memory'],
  memory_forget: ['Forgot memory', 'Forgetting memory'],
  browser: ['Browser', 'Browsing'],
  browser_act: ['Browser', 'Browsing'],
  sub_agent: ['Delegated', 'Delegating'],
};

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : {};
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** First line, at most MAX chars; "…" marks anything cut off. */
function clip(s: string): string {
  const trimmed = s.trim();
  const line = trimmed.split('\n')[0]!.trim();
  if (line.length > MAX) return line.slice(0, MAX - 1).trimEnd() + '…';
  return trimmed.includes('\n') ? line + '…' : line;
}

function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

function count(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

function lineCount(s: string): number {
  return s === '' ? 0 : s.split('\n').length;
}

function urlLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return clip(url);
  }
}

function target(name: string, a: Rec): { target: string; title: string } {
  const path = str(a.path);
  switch (name) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
    case 'edit_notebook':
    case 'read_image':
    case 'list_symbols':
      return { target: path ? basename(path) : '', title: path ?? '' };
    case 'apply_patch': {
      // Not core's parser: this file is bundled into the webview, which cannot carry node code.
      const files = [...new Set([...(str(a.patch) ?? '').matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => m[1]!.trim()))];
      return { target: clip(files.map(basename).join(', ')), title: files.join(', ') };
    }
    case 'list_files':
      return { target: path ?? '.', title: path ?? '.' };
    case 'run_command': {
      const cmd = str(a.command) ?? '';
      return { target: clip(cmd), title: cmd };
    }
    case 'web_search': {
      const q = str(a.query);
      return { target: q ? `"${clip(q)}"` : '', title: q ?? '' };
    }
    case 'search_files': {
      const p = str(a.pattern);
      return { target: p ? `"${clip(p)}"` : '', title: p ?? '' };
    }
    case 'codebase_search': {
      const q = str(a.query);
      return { target: q ? `"${clip(q)}"` : '', title: q ?? '' };
    }
    case 'find_symbol':
    case 'find_references': {
      const n = str(a.name) ?? '';
      return { target: clip(n), title: n };
    }
    case 'fetch_url': {
      const u = str(a.url) ?? '';
      return { target: u ? urlLabel(u) : '', title: u };
    }
    case 'memory_read':
    case 'memory_write':
    case 'memory_forget': {
      const label = [str(a.scope), str(a.section) ?? str(a.heading)].filter(Boolean).join(' · ');
      return { target: label, title: label };
    }
    case 'browser':
    case 'browser_act': {
      const label = [str(a.action), str(a.url) ?? str(a.selector)].filter(Boolean).join(' ');
      return { target: clip(label), title: label };
    }
    case 'sub_agent': {
      const t = str(a.task) ?? '';
      return { target: clip(t), title: t };
    }
    default: {
      const first = Object.values(a).find((v): v is string => typeof v === 'string' && v.length > 0) ?? '';
      return { target: clip(first), title: first };
    }
  }
}

/** Meta and diff that only depend on the args (shown before and after the call). */
function argsMeta(name: string, a: Rec): Pick<ToolSummary, 'meta' | 'diff'> {
  if (name === 'edit_file' && typeof a.old_text === 'string' && typeof a.new_text === 'string') {
    return { meta: `+${lineCount(a.new_text)} −${lineCount(a.old_text)}`, diff: { before: a.old_text, after: a.new_text } };
  }
  if (name === 'write_file' && typeof a.content === 'string') {
    return { meta: `+${lineCount(a.content)}` };
  }
  return {};
}

function resultMeta(name: string, a: Rec, r: Rec): Pick<ToolSummary, 'meta' | 'metaTone' | 'diff'> {
  const len = (k: string) => (Array.isArray(r[k]) ? (r[k] as unknown[]).length : undefined);
  switch (name) {
    case 'read_file':
      return typeof r.totalLines === 'number' ? { meta: count(r.totalLines, 'line') } : {};
    case 'edit_file':
      return argsMeta(name, a);
    case 'edit_notebook':
      return typeof r.cellIndex === 'number' ? { meta: `${typeof r.mode === 'string' && r.mode !== 'replace' ? `${r.mode} ` : ''}cell ${r.cellIndex}` } : {};
    case 'write_file': {
      if (typeof a.content !== 'string') return {};
      return r.created === true
        ? { meta: `+${lineCount(a.content)}`, diff: { before: '', after: a.content } }
        : { meta: count(lineCount(a.content), 'line') };
    }
    case 'run_command':
      if (r.timedOut === true) return { meta: 'timed out', metaTone: 'err' };
      return typeof r.exitCode === 'number' && r.exitCode !== 0 ? { meta: `exit ${r.exitCode}`, metaTone: 'err' } : {};
    case 'list_files':
      return len('entries') !== undefined ? { meta: count(len('entries')!, 'entry', 'entries') } : {};
    case 'search_files':
    case 'find_symbol':
      return len('matches') !== undefined ? { meta: count(len('matches')!, 'match', 'matches') } : {};
    case 'codebase_search':
      return len('results') !== undefined ? { meta: count(len('results')!, 'result') } : {};
    case 'find_references':
      return len('references') !== undefined ? { meta: count(len('references')!, 'reference') } : {};
    case 'list_symbols':
      return len('symbols') !== undefined ? { meta: count(len('symbols')!, 'symbol') } : {};
    case 'sub_agent':
      return r.started === true ? { meta: `in background · ${String(r.id ?? '')}` } : {};
    case 'fetch_url':
      return typeof r.status === 'number' ? { meta: String(r.status), metaTone: r.status >= 400 ? 'err' : undefined } : {};
    default:
      return {};
  }
}

export function summarizeTool(name: string, args: unknown, outcome?: ToolOutcome): ToolSummary {
  const a = rec(args);
  const verbs = VERBS[name];
  const verb = verbs ? (outcome ? verbs[0] : verbs[1]) : name;
  const t = target(name, a);
  if (!outcome) return { verb, ...t, ...argsMeta(name, a) };
  const { result, isError } = outcome;
  if (isError) {
    // Errors show their first line as-is (stack traces below it are noise), capped at MAX.
    const first = typeof result === 'string' ? clip(result.trim().split('\n')[0]!) : '';
    return { verb, ...t, meta: first || 'failed', metaTone: 'err' };
  }
  if (typeof result === 'string' && result.startsWith('Denied by user')) {
    return { verb, ...t, meta: 'denied', metaTone: 'err' };
  }
  const m = resultMeta(name, a, rec(result));
  return { verb, ...t, ...m };
}

/** sub_agent streams progress as extra tool_result events: "[child] <event type>". */
export function isProgressResult(name: string, result: unknown): boolean {
  return name === 'sub_agent' && typeof result === 'string' && result.startsWith('[child] ');
}

export interface ApprovalCopy {
  question: string;
  target: string;
  title: string;
  meta?: string;
  primary: 'Approve' | 'Run' | 'Hold to run';
  destructive: boolean;
}

const QUESTION: Record<string, string> = {
  write_file: 'Write',
  edit_file: 'Edit',
  run_command: 'Run',
  fetch_url: 'Fetch',
  memory_write: 'Save memory',
  memory_forget: 'Forget memory',
  browser: 'Browser',
  browser_act: 'Browser',
  sub_agent: 'Delegate',
};

export function approvalCopy(name: string, args: unknown, destructive: boolean): ApprovalCopy {
  const s = summarizeTool(name, args);
  return {
    question: QUESTION[name] ?? name,
    target: s.target,
    title: s.title,
    ...(s.meta ? { meta: s.meta } : {}),
    primary: destructive ? 'Hold to run' : name === 'run_command' ? 'Run' : 'Approve',
    destructive,
  };
}

export type ApprovalOutcome = { kind: 'approved' | 'denied' | 'partial' | 'cancelled'; note?: string };

/** Plain text (the webview sets it with textContent) for the transcript line left behind by a settled approval. */
export function approvalLogText(copy: ApprovalCopy, outcome: ApprovalOutcome): string {
  const what = `${copy.question} ${copy.target}`.trim();
  switch (outcome.kind) {
    case 'approved':
      return `✓ Approved: ${what}`;
    case 'partial':
      return `✓ Partly approved (hunk review): ${what}`;
    case 'denied':
      return `✗ Denied: ${what}` + (outcome.note ? ` — “${outcome.note}”` : '');
    case 'cancelled':
      return `Cancelled: ${what}`;
  }
}
