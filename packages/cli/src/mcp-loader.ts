import process from 'node:process';

import {
  closeAll,
  connectAll,
  createMcpResourceTools,
  UnresolvedPlaceholderError,
  defaultUserMcpPath,
  expandSpec,
  hideDuplicateTools,
  loadForgeConfigFile,
  loadPluginMcpServers,
  loadMcpConfig,
  mcpInstructionsBlock,
  type ConnectedMcpServer,
  type McpConfigFile,
  type McpServerSpec,
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
): Promise<{ tools: ToolDefinition[]; cleanup: () => Promise<void>; servers: ConnectedMcpServer[]; instructions?: string }> {
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
    // Saved sign-in tokens are used; a server without them is skipped with a hint (never a browser pop-up mid-run).
    connected = await connectAll(expandServers(merged, process.cwd(), process.env), { oauth: { interactive: false, openUrl: () => undefined } });
  } catch (err) {
    process.stderr.write(`forge: MCP connect failed: ${(err as Error).message}\n`);
    return { tools: [], cleanup: async () => {}, servers: [] };
  }

  // Resource tools only when there is a server to ask; the servers' own instructions go to the system prompt.
  // Tools that repeat a Forge tool (read a file, run a command...) are not offered, as in the editor: Forge's own tool has the
  // approval and path rules. A server named in `mcpShowDuplicates` of ~/.forge/config.json keeps them.
  const shown = new Set((await loadForgeConfigFile().catch(() => undefined))?.config.mcpShowDuplicates ?? []);
  const offered = hideDuplicateTools(connected, shown);
  for (const [server, n] of Object.entries(offered.hidden)) {
    process.stderr.write(`forge: MCP server "${server}": ${n} tool${n === 1 ? '' : 's'} hidden because Forge already has ${n === 1 ? 'one' : 'them'}. To keep ${n === 1 ? 'it' : 'them'}, add "${server}" to mcpShowDuplicates in ~/.forge/config.json.
`);
  }
  const tools = [...offered.tools, ...(connected.length > 0 ? createMcpResourceTools(() => connected) : [])];
  const instructions = mcpInstructionsBlock(connected);
  const cleanup = async () => {
    await closeAll(connected);
  };
  // Brief startup announcement so the user knows MCP is active.
  if (connected.length > 0 && process.env.FORGE_VERBOSE_MCP === '1') {
    process.stderr.write(
      `forge: connected to ${connected.length} MCP server${connected.length === 1 ? '' : 's'} from ${sourcesLoaded.length} source${sourcesLoaded.length === 1 ? '' : 's'}; ${tools.length} tool${tools.length === 1 ? '' : 's'} available\n`
    );
  }
  return { tools, cleanup, servers: connected, ...(instructions ? { instructions } : {}) };
}

/**
 * Fill the placeholders of every server (`${VAR}`, `${VAR:-default}`, `${workspaceFolder}`) before it is started. A server
 * with a placeholder that cannot be filled is left out and says why: it must never start with `${...}` as plain text, which
 * is what a token written that way would have become. Every server here was named by the person (their own registry or
 * a file they passed), so none is treated as a project server; stored secrets (`${input:...}`) live in the editor only.
 */
export function expandServers(config: McpConfigFile, cwd: string, env: NodeJS.ProcessEnv): McpConfigFile {
  const mcpServers: Record<string, McpServerSpec> = {};
  for (const [name, spec] of Object.entries(config.mcpServers)) {
    try {
      mcpServers[name] = expandSpec(spec, cwd, { server: name, scope: 'user', env, secrets: {} });
    } catch (err) {
      const why =
        err instanceof UnresolvedPlaceholderError && err.kind === 'secret'
          ? `it uses a secret stored in the editor ("${err.placeholder}"), which only the VS Code extension can fill. Write the value as a variable instead, for example $` + `{NAME}.`
          : (err as Error).message;
      process.stderr.write(`forge: MCP server "${name}" not started: ${why}
`);
    }
  }
  return { mcpServers };
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
