/**
 * A permission rule's ask holds with approvals off, so the card says why. In the live CRM run four cards read only
 * "Destructive · Hold to confirm" with Autonomous on, for read-only smoke tests (RB-159).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  l10n: { t: (m: string, ...a: unknown[]) => m.replace(/\{(\d+)\}/g,(_, i) => String(a[Number(i)])) },
}));

import { approvalReason } from '../src/chat/approval-reason.js';
import { chatHtml } from '../src/chat/html.js';

describe('approvalReason', () => {
  it('names the path outside the project', () => {
    expect(approvalReason({ kind: 'outside_path', target: 'C:/Windows/win.ini' })).toBe('Asks because it names a path outside the project: C:/Windows/win.ini');
  });

  it('says a file may hold secrets, and names a permission rule in words', () => {
    expect(approvalReason({ kind: 'secret_file', target: '.env' })).toBe('Asks because .env may hold secrets.');
    expect(approvalReason({ kind: 'rule', target: 'npm publish' })).toBe('Asks because a permission rule says to ask before: npm publish');
  });

  it('says nothing for an ordinary ask', () => {
    expect(approvalReason(undefined)).toBeUndefined();
  });

  it('says in English exactly what the terminal app says (one wording, two places that need it)', async () => {
    const { askedBecauseText } = await import('@ikarmic/forge-core');
    for (const kind of ['outside_path', 'secret_file', 'rule'] as const) {
      const because = { kind, target: 'x/y' };
      expect(approvalReason(because), kind).toBe(askedBecauseText(because));
    }
  });
});

describe('approval card', () => {
  const html = chatHtml();

  it('draws the reason as text, escaped, between the command and the buttons', () => {
    const fn = html.slice(html.indexOf('function appendApproval('), html.indexOf('function appendApproval(') + 6000);
    expect(fn).toContain("function appendApproval(id, name, args, destructive, previewable, allowable, preview, reviewable, askWhy)");
    expect(fn).toContain(`(askWhy ? '<div class="why">' + escapeHtml(askWhy) + '</div>' : '')`);
    expect(fn.indexOf('class="why"')).toBeLessThan(fn.indexOf('class="bar"'));
    expect(html).toContain('msg.reviewable, msg.askWhy)');
  });
});
