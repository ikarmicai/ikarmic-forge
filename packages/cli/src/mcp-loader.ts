import process from 'node:process';

import {
  closeAll,
  connectAll,
  defaultUserMcpPath,
  loadPluginMcpServers,
  loadMcpConfig,
  type ConnectedMcpServer,
  type McpConfigFile,
  type ToolDefinition,
} from '@ikarmic/forge-core';

/**
 * Load MCP servers from one or more config files and return their
 * tools plus a cleanup handle the caller MUST invoke (e.g. on shutdown
 * / task finish).
 *
 * Sources are merged in priority order:
 *
 *   1. `configPath`: explicit `--mcp-config <path>` from the CLI. Takes
 *      precedence when the same server name appears in multiple sources.
 *   2. `~/.forge/mcp.json`: the user's marketplace registry. Servers
 *      installed via `forge mcp install` live here and are loaded
 *      automatically on every run.
 *
 * If both paths are the same file (or one is missing), they're handled
 * without double-loading. If a path doesn't exist or MCP loading fails
 * for any reason, the loader returns empty tools + a no-op cleanup and
 * logs the error: MCP is an optional enhancement, not a hard dependency.
 */
export async function loadMcpTools(
  configPath: string
): Promise<{ tools: ToolDefinition[]; cleanup: () => Promise<void>; servers: ConnectedMcpServer[] }> {
  const userMcpPath = defaultUserMcpPath();

  // Merge the two sources. Explicit config wins on name conflicts.
  let merged: McpConfigFile = { mcpServers: {} };
  const sourcesLoaded: string[] = [];

  // 0. Servers shipped by global plugins (lowest priority).
  const pluginServers = await loadPluginMcpServers(process.cwd()).catch(() => ({}));
  if (Object.keys(pluginServers).length > 0) {
    merged = mergeMcpConfigs(merged, { mcpServers: pluginServers });
    sourcesLoaded.push('plugins');
  }

  // 1. User-level registry (overrides plugins).
  if (userMcpPath !== configPath) {
    try {
      const userConfig = await loadMcpConfig(userMcpPath);
      merged = mergeMcpConfigs(merged, userConfig);
      sourcesLoaded.push(userMcpPath);
    } catch (err) {
      if (!isMissingFile(err)) {
        process.stderr.write(`forge: MCP loader (user registry) failed: ${(err as Error).message}\n`);
      }
    }
  }

  // 2. Explicit config wins on conflicts.
  try {
    const config = await loadMcpConfig(configPath);
    merged = mergeMcpConfigs(merged, config);
    sourcesLoaded.push(configPath);
  } catch (err) {
    if (isMissingFile(err)) {
      // When the only source is the missing explicit config AND the user
      // registry was also missing, fall through to the "no MCP" branch.
      if (sourcesLoaded.length === 0) {
        return { tools: [], cleanup: async () => {}, servers: [] };
      }
    } else {
      process.stderr.write(`forge: MCP loader failed: ${(err as Error).message}\n`);
      return { tools: [], cleanup: async () => {}, servers: [] };
    }
  }

  let connected: ConnectedMcpServer[] = [];
  try {
    connected = await connectAll(merged);
  } catch (err) {
    process.stderr.write(`forge: MCP connect failed: ${(err as Error).message}\n`);
    return { tools: [], cleanup: async () => {}, servers: [] };
  }

  const tools = connected.flatMap((s) => s.tools);
  const cleanup = async () => {
    await closeAll(connected);
  };
  // Brief startup announcement so the user knows MCP is active.
  if (connected.length > 0 && process.env.FORGE_VERBOSE_MCP === '1') {
    process.stderr.write(
      `forge: connected to ${connected.length} MCP server${connected.length === 1 ? '' : 's'} from ${sourcesLoaded.length} source${sourcesLoaded.length === 1 ? '' : 's'}; ${tools.length} tool${tools.length === 1 ? '' : 's'} available\n`
    );
  }
  return { tools, cleanup, servers: connected };
}

/**
 * Merge two MCP configs. Entries from `override` win on name conflicts;
 * entries from `base` are kept otherwise. The function is pure: both
 * inputs are read-only.
 */
function mergeMcpConfigs(base: McpConfigFile, override: McpConfigFile): McpConfigFile {
  return {
    mcpServers: {
      ...base.mcpServers,
      ...override.mcpServers,
    },
  };
}

function isMissingFile(err: unknown): boolean {
  return Boolean(
    err && typeof err === 'object' && 'code' in (err as Record<string, unknown>) &&
      (err as { code?: string }).code === 'ENOENT'
  );
}
