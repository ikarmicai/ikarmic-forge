/**
 * Small, dependency-free Markdown renderer for the chat webview. Bundled as
 * an IIFE (`window.ForgeMarkdown`) and loaded by the chat page next to
 * `voice-input.js`.
 *
 * Safety model: every piece of source text goes through `escapeHtml` before
 * any tag is emitted, and links are only created for http(s)/mailto URLs, so
 * model output can never inject markup or script into the webview.
 *
 * Streaming-friendly: an unclosed code fence renders as an (open) code block
 * instead of swallowing the rest of the reply as raw text, so partially
 * streamed replies look right on every frame.
 */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** Bold, italic and strike on already-escaped text (tags we emit may border the markers). */
function emphasis(s: string): string {
  return s
    .replace(/\*\*\*(?=\S)([^*]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/(^|[\s(>])\*(\S(?:[^*]*?\S)?)\*(?=[\s).,;:!?<]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(>])_(\S(?:[^_]*?\S)?)_(?=[\s).,;:!?<]|$)/g, '$1<em>$2</em>');
}

const anchor = (url: string, text: string): string => `<a href="${url}" title="${url}">${text}</a>`;

/** Bold, italic, strike and links on already-escaped text. */
function formatEscaped(s: string): string {
  // Links become placeholders first so emphasis and autolinking never touch their URLs.
  const links: string[] = [];
  const hold = (html: string): string => `\u0000${links.push(html) - 1}\u0000`;
  const text = s
    .replace(/\u0000/g, '')
    // Link URLs may contain one level of balanced parentheses (Wikipedia-style).
    // An optional "title" is accepted and dropped; an image becomes a plain link (nothing is ever loaded).
    .replace(/!?\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+&quot;[^\n]*?&quot;)?\)/g, (m, label: string, url: string) =>
      SAFE_URL.test(url) ? hold(anchor(url, emphasis(label.trim() ? label : url))) : m,
    )
    .replace(/&lt;(https?:\/\/[^\s&]+(?:&amp;[^\s&]+)*)&gt;/gi, (_m, url: string) => hold(anchor(url, url)))
    .replace(/(^|[\s(“‘*_~]|&quot;|&#39;)(https?:\/\/[^\s<>]+)/gi, (whole, pre: string, found: string) => {
      // The link ends at a quote or bracket that closes around it; trailing punctuation and an
      // unmatched closing paren belong to the sentence.
      const stop = found.search(/&(?:gt|lt|quot);|[“”]/);
      let url = stop >= 0 ? found.slice(0, stop) : found;
      for (;;) {
        const opens = url.split('(').length - 1;
        const closes = url.split(')').length - 1;
        const trimmed = url.replace(/(?:[.,;:!?'*_~]|&#39;|\)(?=[^(]*$))$/, (t) => (t === ')' && closes <= opens ? t : ''));
        if (trimmed === url) break;
        url = trimmed;
      }
      return /^https?:\/\/[^\s/?#&;]/i.test(url) ? `${pre}${hold(anchor(url, url))}${found.slice(url.length)}` : whole;
    });
  return emphasis(text).replace(/\u0000(\d+)\u0000/g, (_m, i: string) => links[Number(i)]!);
}

/** `\*` and friends: the escaped character stands for itself (private-use markers hide it from the other rules). */
const ESCAPABLE = /\\([\\`*_~[\]()#+\-.!|])/g;
const MARK = /([0-9a-f]+)/g;
const unmark = (s: string, keepBackslash: boolean): string =>
  s.replace(MARK, (_m, hex: string) => (keepBackslash ? '\\' : '') + escapeHtml(String.fromCharCode(parseInt(hex, 16))));

/** Inline markdown: code spans are protected from all other formatting. */
export function renderInline(raw: string): string {
  const src = raw.replace(/[]/g, '').replace(ESCAPABLE, (_m, c: string) => `${c.charCodeAt(0).toString(16)}`);
  let out = '';
  let last = 0;
  const re = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out += unmark(formatEscaped(escapeHtml(src.slice(last, m.index))), false);
    // Inside code a backslash is just a backslash.
    out += '<code>' + unmark(escapeHtml(m[2]!.trim() || m[2]!), true) + '</code>';
    last = m.index + m[0].length;
  }
  return out + unmark(formatEscaped(escapeHtml(src.slice(last))), false);
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const SETEXT = /^ {0,3}(=+|-{3,})\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function isBlockStart(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || LIST.test(line);
}

/** Cells of a table row. A pipe inside a code span, or written `\|`, belongs to the cell. */
function splitRow(line: string): string[] {
  const hidden = line
    .trim()
    .replace(/\\\|/g, '')
    .replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (m) => m.replace(/\|/g, ''));
  return hidden
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim().replace(//g, '|'));
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function renderCode(lines: string[], lang: string, open: boolean): string {
  const label = lang ? escapeHtml(lang) : 'text';
  return (
    `<div class="code${open ? ' open' : ''}"><div class="code-head"><span class="lang">${label}</span>` +
    `<button type="button" class="copy" aria-label="Copy code">Copy</button></div>` +
    `<pre><code>${escapeHtml(lines.join('\n'))}</code></pre></div>`
  );
}

function renderList(lines: string[], start: number): { html: string; next: number } {
  const first = LIST.exec(lines[start]!)!;
  const base = first[1]!.length;
  const ordered = /\d/.test(first[2]!);
  const items: string[][] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    const m = LIST.exec(line);
    if (m && m[1]!.length === base && /\d/.test(m[2]!) === ordered) {
      items.push([m[3]!]);
      i++;
      continue;
    }
    if (line.trim() === '') {
      // A blank line continues the list only if more indented content or another item follows.
      const nxt = lines[i + 1];
      if (nxt !== undefined && (indentOf(nxt) > base || (LIST.test(nxt) && LIST.exec(nxt)![1]!.length === base))) {
        i++;
        continue;
      }
      break;
    }
    if (indentOf(line) > base && items.length) {
      items[items.length - 1]!.push(line.slice(Math.min(indentOf(line), base + 2)));
      i++;
      continue;
    }
    break;
  }
  const startAttr = ordered && first[2]!.replace(/\D/g, '') !== '1' ? ` start="${parseInt(first[2]!, 10)}"` : '';
  const tag = ordered ? 'ol' : 'ul';
  const body = items
    .map(([head, ...rest]) => {
      const task = /^\[([ xX])\]\s+/.exec(head!);
      const text = task ? head!.slice(task[0].length) : head!;
      const box = task ? `<span class="task${task[1] === ' ' ? '' : ' done'}" aria-hidden="true"></span>` : '';
      const nested = rest.length ? renderBlocks(rest) : '';
      return `<li>${box}${renderInline(text)}${nested}</li>`;
    })
    .join('');
  return { html: `<${tag}${startAttr}>${body}</${tag}>`, next: i };
}

function renderBlocks(lines: string[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const body: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        const l = lines[i]!;
        const t = l.trim();
        if (t.startsWith(marker[0]!.repeat(marker.length)) && /^([`~])\1*$/.test(t)) {
          closed = true;
          i++;
          break;
        }
        body.push(l);
        i++;
      }
      out.push(renderCode(body, fence[2]!, !closed));
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      out.push(`<h${level}>${renderInline(heading[2]!)}</h${level}>`);
      i++;
      continue;
    }

    if (HR.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) body.push(lines[i++]!.replace(QUOTE, ''));
      out.push(`<blockquote>${renderBlocks(body)}</blockquote>`);
      continue;
    }

    if (LIST.test(line)) {
      const { html, next } = renderList(lines, i);
      out.push(html);
      i = next;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!) && lines[i + 1]!.includes('-')) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]!).map((c) =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : '',
      );
      const cell = (tag: string, text: string, k: number) =>
        `<${tag}${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${renderInline(text)}</${tag}>`;
      i += 2;
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
        rows.push('<tr>' + splitRow(lines[i]!).map((c, k) => cell('td', c, k)).join('') + '</tr>');
        i++;
      }
      out.push(
        '<div class="table"><table><thead><tr>' +
          head.map((c, k) => cell('th', c, k)).join('') +
          '</tr></thead><tbody>' +
          rows.join('') +
          '</tbody></table></div>',
      );
      continue;
    }

    const para: string[] = [];
    let setext = 0;
    while (i < lines.length && lines[i]!.trim() !== '' && (para.length === 0 || !isBlockStart(lines[i]!))) {
      para.push(lines[i++]!.trim());
      // A line of === or --- right under the text turns it into a heading.
      if (i < lines.length && SETEXT.test(lines[i]!)) {
        setext = lines[i]!.trim().startsWith('=') ? 1 : 2;
        i++;
        break;
      }
    }
    if (setext) out.push(`<h${setext}>${para.map(renderInline).join(' ')}</h${setext}>`);
    else out.push(`<p>${para.map(renderInline).join('<br>')}</p>`);
  }
  return out.join('');
}

/** Render a full (or partially streamed) Markdown document to safe HTML. */
export function renderMarkdown(src: string): string {
  return renderBlocks(src.replace(/\r\n?/g, '\n').split('\n'));
}
