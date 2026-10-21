/**
 * `forge plugin …` subcommand: list, show, install, remove plugin bundles.
 * No AI provider required. Exit codes: 0 ok, 2 user error, 1 unexpected.
 */
import { discoverPlugins, installPlugin, removePlugin, type Plugin } from '@ikarmic/forge-core';

import type { ParsedPluginCommand } from '../options.js';

function counts(p: Plugin): string {
  const hookCount = Object.values(p.hooks).reduce((n, entries) => n + (entries?.length ?? 0), 0);
  const mcpCount = Object.keys(p.mcpServers).length;
  return `skills: ${p.skillsDir ? 'yes' : 'no'}, hook entries: ${hookCount}, mcp servers: ${mcpCount}`;
}

export async function handlePluginCommand(cmd: ParsedPluginCommand, cwd: string): Promise<number> {
  const out = (s: string) => process.stdout.write(`${s}\n`);
  const err = (s: string) => process.stderr.write(`${s}\n`);
  try {
    if (cmd.list) {
      const plugins = await discoverPlugins(cwd);
      if (plugins.length === 0) out('(no plugins installed)');
      for (const p of plugins) out(`${p.name}${p.version ? `@${p.version}` : ''}  [${p.scope}]  ${counts(p)}${p.description ? `\n    ${p.description}` : ''}`);
      return 0;
    }
    if (cmd.show) {
      const plugin = (await discoverPlugins(cwd)).find((p) => p.name === cmd.show!.name);
      if (!plugin) {
        err(`forge plugin: "${cmd.show.name}" is not installed`);
        return 2;
      }
      out(`${plugin.name}${plugin.version ? `@${plugin.version}` : ''}  [${plugin.scope}]\n${plugin.root}\n${counts(plugin)}`);
      for (const w of plugin.warnings) out(`warning: ${w}`);
      if (plugin.scope === 'project') out('note: project plugins run hooks only after the project is trusted; their MCP servers are not started.');
      return 0;
    }
    if (cmd.install) {
      const plugin = await installPlugin(cmd.install.source, {
        scope: cmd.install.project ? 'project' : 'global',
        cwd,
        overwrite: cmd.install.overwrite,
      });
      out(`installed ${plugin.name}${plugin.version ? `@${plugin.version}` : ''} → ${plugin.root}\n${counts(plugin)}`);
      return 0;
    }
    if (cmd.remove) {
      const removed = await removePlugin(cmd.remove.name, { scope: cmd.remove.project ? 'project' : 'global', cwd });
      if (!removed) {
        err(`forge plugin: "${cmd.remove.name}" is not installed in that scope`);
        return 2;
      }
      out(`removed ${cmd.remove.name}`);
      return 0;
    }
  } catch (e) {
    err(`forge plugin: ${(e as Error).message}`);
    return 2;
  }
  err('forge plugin: expected one of list|show <name>|install <source>|remove <name>');
  return 2;
}
