/**
 * RB-91: with forge.approvalDefault "auto", a message sent in the first seconds after VS Code opened ran at "Ask
 * first" and showed an approval card. The page started at "ask" and learned the saved level only from a message the
 * host sends at the end of its ready handler, after loading the model list and agent files. Seen in 1 of 4 real
 * VS Code runs (the cold start).
 */
import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';

const selected = (html: string) => /<option value="(\w+)"[^>]*\bselected\b/.exec(html.slice(html.indexOf('id="approval"')))?.[1];

describe('the chat starts at the saved approval level (RB-91)', () => {
  it('renders the select at the level it is given', () => {
    expect(selected(chatHtml({ approvalLevel: 'auto' }))).toBe('auto');
    expect(selected(chatHtml({ approvalLevel: 'edits' }))).toBe('edits');
  });

  it('starts the page script at that level, so a new chat uses it too', () => {
    expect(chatHtml({ approvalLevel: 'auto' })).toContain("let approvalDefault = 'auto';");
  });

  it('defaults to asking, and never writes anything but a known level into the page', () => {
    expect(selected(chatHtml())).toBe('ask');
    expect(selected(chatHtml({ approvalLevel: "auto';alert(1)//" as never }))).toBe('ask');
  });
});
