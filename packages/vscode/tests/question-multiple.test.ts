import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';

/**
 * A question can ask for one answer (radio buttons) or several (checkboxes). The model says which with `multiple`; the
 * host passes it on and the page draws the matching control. The answer goes back as one string, so saved chats and
 * session export do not change.
 */
const html = chatHtml();
const src = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const chatView = src('../src/chat/chat-view.ts');

describe('a question that wants several answers', () => {
  it('is passed from the tool to the page', () => {
    expect(chatView).toMatch(/question_request[^}]*multiple: q\.multiple === true/);
  });

  it('shows checkboxes with a hint and a button that waits for one tick', () => {
    expect(html).toContain("input.type = 'checkbox'");
    expect(html).toContain('Choose all that apply');
    expect(html).toMatch(/msg\.multiple/);
    expect(html).toContain('send.disabled = true');
  });

  it('joins the ticked labels into one answer, and a typed answer counts too', () => {
    expect(html).toContain("picked.join('; ')");
  });

  it('keeps one answer per click for an ordinary question', () => {
    expect(html).toContain("b.addEventListener('click', () => answer(o))");
  });
});
