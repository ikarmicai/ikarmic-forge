/**
 * RB-55: text a person reads never shows an internal identifier (snake_case, camelCase, kebab-case).
 * Every internal name that reaches a page goes through a label from `human-text.ts`.
 */
import { readFileSync } from 'node:fs';

import { BUILTIN_TOOLS } from '@ikarmic/forge-core';
import { describe, expect, it } from 'vitest';

import { approvalCopy, summarizeTool } from '../src/chat/tool-summary.js';
import * as chatLib from '../src/chat/webview-lib.js';
import { enumLabel, humanize, runReasonLabel, toolLabel } from '../src/human-text.js';
import * as settingsLib from '../src/settings/settings-lib.js';

const IDENTIFIER = /[_]|[a-z][A-Z]|[a-z]-[a-z]/;
const AGENT_RUN_REASONS = ['completed', 'max_iterations', 'max_duration', 'budget_exceeded', 'loop_detected', 'aborted', 'error', 'no_provider_key', 'plan', 'spec'];

describe('humanize', () => {
  it('turns an identifier into a sentence', () => {
    expect(humanize('max_iterations')).toBe('Max iterations');
    expect(humanize('perChat')).toBe('Per chat');
    expect(humanize('on-network')).toBe('On network');
    expect(humanize('read_file')).toBe('Read file');
  });

  it('leaves a plain word alone and keeps acronyms', () => {
    expect(humanize('ask')).toBe('Ask');
    expect(humanize('mcp_server')).toBe('MCP server');
  });
});

describe('labels carry no identifier', () => {
  it('every built-in tool', () => {
    for (const t of BUILTIN_TOOLS) expect(toolLabel(t.name), t.name).not.toMatch(IDENTIFIER);
  });

  it('every way a run can end', () => {
    for (const r of AGENT_RUN_REASONS) expect(runReasonLabel(r), r).not.toMatch(IDENTIFIER);
    expect(runReasonLabel('max_iterations')).toBe('Step limit reached');
    expect(runReasonLabel('loop_detected')).toMatch(/repeat/i);
  });

  it('a reason the table does not know is still made readable', () => {
    expect(runReasonLabel('some_new_reason')).toBe('Some new reason');
  });

  it('every value of every enum setting that is written as an identifier', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const props = pkg.contributes.configuration.properties ?? Object.assign({}, ...pkg.contributes.configuration.map((c: { properties: object }) => c.properties));
    let checked = 0;
    for (const [key, def] of Object.entries<{ enum?: unknown[] }>(props)) {
      for (const v of def.enum ?? []) {
        if (typeof v !== 'string' || !IDENTIFIER.test(v)) continue;
        checked++;
        const label = enumLabel(key, v);
        expect(label, `${key}=${v}`).not.toBe(v);
        expect(label, `${key}=${v}`).not.toMatch(/_|(?<![A-Za-z])[a-z]+[A-Z]/);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('the chat names an unknown tool in words', () => {
  it('in a tool row and in an approval', () => {
    expect(summarizeTool('acme_lookup_user', {}).verb).toBe('Acme lookup user');
    expect(approvalCopy('acme_delete_user', {}, false).question).toBe('Acme delete user');
  });

  it('for every built-in tool', () => {
    for (const t of BUILTIN_TOOLS) {
      expect(summarizeTool(t.name, {}).verb, t.name).not.toMatch(/_/);
      expect(approvalCopy(t.name, {}, false).question, t.name).not.toMatch(/_/);
    }
  });
});

describe('the pages can call the labels (RB-3)', () => {
  it('chat page', () => {
    expect(chatLib.runReasonLabel).toBe(runReasonLabel);
  });

  it('settings page', () => {
    expect(settingsLib.toolLabel).toBe(toolLabel);
    expect(settingsLib.enumLabel).toBe(enumLabel);
  });
});

describe('the pages use the labels', () => {
  const chat = readFileSync(new URL('../src/chat/html.ts', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/settings/settings-html.ts', import.meta.url), 'utf8');

  it('the usage line shows a label, not the reason code', () => {
    expect(chat).toContain('UI.runReasonLabel(reason)');
    expect(chat).not.toContain("escapeHtml(reason)");
  });

  it('Settings shows tool names and setting values as labels', () => {
    expect(settings).toContain('FS.toolLabel(t)');
    expect(settings).toContain('FS.enumLabel(r.key, v)');
    expect(settings).not.toContain('o.textContent = v;');
  });
});

describe('an agent id is shown as a name', () => {
  it('in the mode picker', async () => {
    const { listModes } = await import('../src/chat/modes.js');
    const modes = listModes([{ id: 'docs-writer', description: 'Writes docs', systemPrompt: 'x', allowedTools: ['read_file'] }] as never);
    expect(modes.find((m) => m.id === 'docs-writer')?.label).toBe('Docs writer');
  });
});

describe('the webview twin equals the one in core (the terminal app uses core\'s)', () => {
  it('gives the same words for the same names', async () => {
    const core = await import('@ikarmic/forge-core');
    const names = ['read_file', 'max_iterations', 'perChat', 'on-network', 'mcp__deploy', 'github__create_issue', 'ask', 'some_new_reason'];
    for (const n of names) {
      expect(humanize(n), n).toBe(core.humanize(n));
      expect(toolLabel(n), n).toBe(core.toolLabel(n));
      expect(runReasonLabel(n), n).toBe(core.runReasonLabel(n));
    }
    for (const r of AGENT_RUN_REASONS) expect(runReasonLabel(r), r).toBe(core.runReasonLabel(r));
  });
});
