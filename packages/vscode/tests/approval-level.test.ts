import { describe, expect, it } from 'vitest';
import { FILE_WRITE_TOOL_NAMES, resolveAutoApprove } from '@ikarmic/forge-core';

import { approvalLevelOf, autoApproveFor } from '../src/chat/approval-level.js';
import { chatHtml } from '../src/chat/html.js';

describe('approval level: what runs without asking', () => {
  it('Ask first keeps the configured list (read-only tools by default)', () => {
    expect(autoApproveFor('ask', undefined)).toEqual(resolveAutoApprove(undefined));
    expect(autoApproveFor('ask', ['read_file'])).toEqual(['read_file']);
  });

  it('Accept edits adds every file-writing tool and keeps what the person configured', () => {
    const list = autoApproveFor('edits', ['read_file', 'write_file']);
    for (const name of FILE_WRITE_TOOL_NAMES) expect(list).toContain(name);
    expect(list).toContain('read_file');
    expect(new Set(list).size).toBe(list.length);
  });

  it('Accept edits never adds commands, the browser or sub-agents', () => {
    const list = autoApproveFor('edits', undefined);
    for (const name of ['run_command', 'browser', 'sub_agent', 'memory_forget']) expect(list).not.toContain(name);
  });

  it('Autonomous does not widen the list: the run-level auto flag does that', () => {
    expect(autoApproveFor('auto', undefined)).toEqual(resolveAutoApprove(undefined));
  });
});

describe('approval level: reading it from a page message', () => {
  it('takes a known level', () => {
    expect(approvalLevelOf('ask')).toBe('ask');
    expect(approvalLevelOf('edits')).toBe('edits');
    expect(approvalLevelOf('auto')).toBe('auto');
  });

  it('falls back to the old auto flag, then to Ask first', () => {
    expect(approvalLevelOf(undefined, true)).toBe('auto');
    expect(approvalLevelOf(undefined, false)).toBe('ask');
    expect(approvalLevelOf(undefined)).toBe('ask');
  });

  it('never turns an unknown value into a wider level', () => {
    expect(approvalLevelOf('bypass')).toBe('ask');
    expect(approvalLevelOf(1)).toBe('ask');
    expect(approvalLevelOf('bypass', true)).toBe('ask');
  });
});

describe('approval picker in the composer', () => {
  const html = chatHtml();

  it('is a select with Ask first, Accept edits and Autonomous', () => {
    const start = html.indexOf('id="approval"');
    expect(start).toBeGreaterThan(0);
    const sel = html.slice(start, html.indexOf('</select>', start));
    expect(sel).not.toBe('');
    expect(sel).toMatch(/<option value="ask"[^>]*>Ask first</);
    expect(sel).toMatch(/<option value="edits"[^>]*>Accept edits</);
    expect(sel).toMatch(/<option value="auto"[^>]*>Autonomous</);
  });

  it('replaces the old checkbox', () => {
    expect(html).not.toContain('id="auto-toggle"');
  });

  it('sends the chosen level with every message', () => {
    expect(html).not.toMatch(/auto: autoToggle\.checked/);
    expect(html.match(/level: approvalSelect\.value/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });
});
