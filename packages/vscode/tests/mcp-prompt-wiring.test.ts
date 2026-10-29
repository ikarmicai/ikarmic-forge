import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * RB-111: the pure helpers are unit-tested; this pins that the host really uses them, which a unit test cannot see.
 */
const src = (file: string): string => readFileSync(join(__dirname, '..', 'src', file), 'utf8');
const section = (text: string, from: string): string => text.slice(text.indexOf(from), text.indexOf("case '", text.indexOf(from) + 10));

describe('MCP prompts in the chat view', () => {
  const chat = src('chat/chat-view.ts');

  it('offers the prompts in the slash menu and expands a chosen one', () => {
    expect(chat).toContain('mcpSlashEntries(');
    expect(chat).toContain('planMcpPrompt(');
  });

  it('does not run a message whose prompt cannot be given: it shows why instead', () => {
    expect(section(chat, "case 'user_input'")).toContain('plan.blocked');
    expect(section(chat, "case 'retry_last'")).toContain('edited?.blocked');
  });

  it('connects the servers the first time the slash menu is opened, then shows what they offer', () => {
    expect(section(chat, "case 'slash_list'")).toMatch(/ensureConnected\(\)[\s\S]*postSlashCommands\(\)/);
  });

  it('shows a changed prompt list: the manager tells the extension, which tells every chat view', () => {
    expect(src('extension.ts')).toMatch(/new McpManager\(\{[\s\S]*onChange:/);
    expect(chat).toMatch(/onMcpChanged\(\(\) => /);
  });

  it('lets go of that subscription when the chat view is disposed (one view per tab and per Agent Manager session)', () => {
    expect(chat).toMatch(/this\.mcpChangedSubscription = onMcpChanged\(/);
    expect(section(chat, '  dispose(): void {').slice(0, 600)).toContain('this.mcpChangedSubscription?.dispose()');
  });
});
