import { describe, expect, it } from 'vitest';

import { renderInline, renderMarkdown } from '../src/chat/markdown.js';

describe('renderMarkdown safety', () => {
  it('escapes raw HTML everywhere', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>\n\n**<b>hi</b>**\n\n```\n<script>x</script>\n```');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;img');
  });

  it('only links http(s) and mailto URLs', () => {
    expect(renderInline('[ok](https://example.com)')).toContain('<a href="https://example.com"');
    expect(renderInline('[bad](javascript:alert(1))')).not.toContain('<a');
    expect(renderInline('[bad](data:text/html,x)')).not.toContain('<a');
  });

  it('cannot break out of an href attribute', () => {
    expect(renderInline('[x](https://a.com/"onmouseover="y)')).not.toContain('"onmouseover="');
  });
});

describe('renderMarkdown inline', () => {
  it('formats bold, italic, strike and code', () => {
    const html = renderInline('**b** *i* ~~s~~ `c`');
    expect(html).toBe('<strong>b</strong> <em>i</em> <del>s</del> <code>c</code>');
  });

  it('leaves code spans unformatted', () => {
    expect(renderInline('`**not bold**`')).toBe('<code>**not bold**</code>');
  });

  it('does not italicise snake_case or multiplication', () => {
    expect(renderInline('get_user_by_id and 2 * 3 * 4')).toBe('get_user_by_id and 2 * 3 * 4');
  });
});

describe('renderMarkdown blocks', () => {
  it('renders fenced code with a language label and copy button', () => {
    const html = renderMarkdown('```ts\nconst a = 1;\n```');
    expect(html).toContain('<span class="lang">ts</span>');
    expect(html).toContain('class="copy"');
    expect(html).toContain('<pre><code>const a = 1;</code></pre>');
    expect(html).not.toContain('code open');
  });

  it('renders an unclosed fence (mid-stream) as an open code block', () => {
    const html = renderMarkdown('Here:\n```py\nprint(1)');
    expect(html).toContain('<p>Here:</p>');
    expect(html).toContain('class="code open"');
    expect(html).toContain('print(1)');
  });

  it('renders headings, rules and quotes', () => {
    const html = renderMarkdown('## Plan\n---\n> note');
    expect(html).toContain('<h2>Plan</h2>');
    expect(html).toContain('<hr>');
    expect(html).toContain('<blockquote><p>note</p></blockquote>');
  });

  it('renders nested and ordered lists', () => {
    const html = renderMarkdown('1. one\n2. two\n   - a\n   - b\n3. three');
    expect(html).toBe('<ol><li>one</li><li>two<ul><li>a</li><li>b</li></ul></li><li>three</li></ol>');
  });

  it('renders task list items', () => {
    const html = renderMarkdown('- [x] done\n- [ ] todo');
    expect(html).toContain('class="task done"');
    expect(html).toContain('class="task"');
  });

  it('renders tables with alignment', () => {
    const html = renderMarkdown('| a | b |\n|---|--:|\n| 1 | 2 |');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td style="text-align:right">2</td>');
  });

  it('keeps single newlines inside a paragraph as line breaks', () => {
    expect(renderMarkdown('line one\nline two')).toBe('<p>line one<br>line two</p>');
  });

  it('keeps balanced parentheses in link URLs', () => {
    const html = renderMarkdown('see [wiki](https://en.wikipedia.org/wiki/Foo_(bar)) now');
    expect(html).toContain('<a href="https://en.wikipedia.org/wiki/Foo_(bar)"');
    expect(html).toContain('</a> now');
  });

  it('nests emphasis', () => {
    expect(renderMarkdown('**bold *both* bold**')).toBe('<p><strong>bold <em>both</em> bold</strong></p>');
    expect(renderMarkdown('***all***')).toBe('<p><strong><em>all</em></strong></p>');
    expect(renderMarkdown('**a** and **b**')).toBe('<p><strong>a</strong> and <strong>b</strong></p>');
  });

  it('links bare URLs and <url> autolinks, without trailing punctuation', () => {
    expect(renderMarkdown('go to https://x.dev/a?b=1&c=2.')).toContain('<a href="https://x.dev/a?b=1&amp;c=2" title="https://x.dev/a?b=1&amp;c=2">https://x.dev/a?b=1&amp;c=2</a>.');
    expect(renderMarkdown('(see https://x.dev)')).toContain('href="https://x.dev"');
    expect(renderMarkdown('<https://x.dev>')).toContain('<a href="https://x.dev"');
  });

  it('does not double-link or link unsafe schemes', () => {
    const html = renderMarkdown('[a](https://x.dev) javascript:alert(1) [b](javascript:alert(1))');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain('href="javascript');
  });

  it('does not link inside code spans', () => {
    expect(renderMarkdown('`https://x.dev`')).toBe('<p><code>https://x.dev</code></p>');
  });

  it('keeps a pipe inside a code span or written \\| in its table cell', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| `x|y` | 1\\|2 |');
    expect(html).toContain('<td><code>x|y</code></td><td>1|2</td>');
  });

  it('renders setext headings, and leaves a half-streamed list marker alone', () => {
    expect(renderMarkdown('Title\n=====\n\nSub\n---')).toBe('<h1>Title</h1><h2>Sub</h2>');
    expect(renderMarkdown('Intro:\n-')).not.toContain('<h2>');
  });

  it('treats backslash-escaped punctuation as plain text, but not inside code', () => {
    expect(renderMarkdown('a \\*not em\\* b')).toBe('<p>a *not em* b</p>');
    expect(renderMarkdown('`a\\*b`')).toBe('<p><code>a\\*b</code></p>');
  });

  it('accepts a link title and shows an image as a plain link', () => {
    expect(renderMarkdown('[a](https://x.dev "the title")')).toBe('<p><a href="https://x.dev" title="https://x.dev">a</a></p>');
    expect(renderMarkdown('![logo](https://x.dev/a.png)')).toContain('>logo</a>');
    expect(renderMarkdown('![logo](https://x.dev/a.png)')).not.toContain('<img');
  });

  it('links bare URLs inside quotes and emphasis, and stops at a closing bracket', () => {
    expect(renderMarkdown('open "https://x.dev" now')).toContain('&quot;<a href="https://x.dev"');
    expect(renderMarkdown('open "https://x.dev" now')).toContain('</a>&quot; now');
    expect(renderMarkdown('**https://x.dev**')).toContain('<strong><a href="https://x.dev"');
    expect(renderMarkdown('https://x.dev>tail')).toContain('</a>&gt;tail');
    expect(renderMarkdown('see https://en.wikipedia.org/wiki/Foo_(bar).')).toContain('href="https://en.wikipedia.org/wiki/Foo_(bar)"');
  });
});
