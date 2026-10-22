/**
 * `forge mcp …` subcommand: list, install, remove, browse MCP servers.
 *
 * Mirrors `forge session …` / `forge skill …` / `forge hook …`: soft
 * prefix, no AI provider required, exits 0 on success / 2 on user
 * error / 1 on unexpected failure.
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';

import {
  defaultCacheRoot,
  connectOne,
  defaultUserMcpPath,
  installMcpServer,
  loadMcpConfig,
  listInstalledServers,
  MARKETPLACE_CATALOG_VERSION,
  uninstallMcpServer,
} from '@ikarmic/forge-core';

import { openInBrowser } from '../open-browser.js';
import type { ParsedMcpCommand } from '../options.js';

/** Public marketplace catalog (placeholder for v1). When the marketplace
 *  repo ships in Tier 2 we'll fetch this over HTTP. For now we point at
 *  the canonical URL and let users browse by hand. */
const MARKETPLACE_CATALOG_URL = 'https://github.com/ikarmicai/forge-mcp-registry';

export async function handleMcpCommand(cmd: ParsedMcpCommand, cwd: string): Promise<number> {
  if (cmd.login) {
    return loginToServer(cmd.login.name, cwd);
  }
  if (cmd.list) {
    return listInstalled();
  }
  if (cmd.install) {
    return installFromSource(cmd.install.source, { overwrite: cmd.install.overwrite });
  }
  if (cmd.remove) {
    return removeServer(cmd.remove.name);
  }
  if (cmd.browse) {
    return browseMarketplace();
  }
  process.stderr.write(
    'forge mcp: expected one of list|install|remove|browse. Try `forge mcp --help` (not yet implemented; read the README).\n'
  );
  return 2;
}

/** `forge mcp login <name>`: sign in to an MCP server that uses OAuth; the tokens are saved for later runs. */
async function loginToServer(name: string, cwd: string): Promise<number> {
  const files = [defaultUserMcpPath(), join(cwd, '.forge', 'mcp.json')];
  let spec;
  for (const file of files) {
    try {
      spec = (await loadMcpConfig(file)).mcpServers[name] ?? spec;
    } catch {
      // a missing or unreadable file just means the server is not in it
    }
  }
  if (!spec) {
    process.stderr.write(`forge mcp login: no MCP server named "${name}" in ${files.join(' or ')}\n`);
    return 2;
  }
  if (!spec.url) {
    process.stderr.write(`forge mcp login: "${name}" is not an HTTP server, so it has nothing to sign in to\n`);
    return 2;
  }
  try {
    const server = await connectOne(name, spec, {
      oauth: {
        interactive: true,
        openUrl: (url) => {
          process.stderr.write(`Sign in to ${name} in your browser. If it does not open, visit:\n  ${url}\n`);
          openInBrowser(url);
        },
      },
    });
    await server.client.close();
    process.stdout.write(`Signed in to ${name}. ${server.tools.length} tool${server.tools.length === 1 ? '' : 's'} available.\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`forge mcp login: ${(err as Error).message}\n`);
    return 1;
  }
}

async function listInstalled(): Promise<number> {
  const installed = await listInstalledServers();
  if (installed.length === 0) {
    process.stdout.write('(no MCP servers installed: try `forge mcp browse`)\n');
    return 0;
  }
  for (const server of installed) {
    process.stdout.write(`${server.name}`);
    if (server.displayName) process.stdout.write(`  (${server.displayName})`);
    process.stdout.write('\n');
    process.stdout.write(`  source: ${server.source}\n`);
    process.stdout.write(`  path:   ${server.installPath}\n`);
    if (server.installedAt) process.stdout.write(`  since:  ${server.installedAt}\n`);
    const cfg = server.serverConfig;
    if (cfg.command) {
      process.stdout.write(
        `  spawn:  ${cfg.command}${cfg.args ? ' ' + cfg.args.join(' ') : ''}\n`
      );
    } else if (cfg.url) {
      process.stdout.write(`  url:    ${cfg.type ?? 'sse'}: ${cfg.url}\n`);
    }
  }
  return 0;
}

async function installFromSource(source: string, opts: { overwrite?: boolean }): Promise<number> {
  // Quick pre-check: is `git` on PATH? The installer shells out to git
  // for the clone step; without it we'd surface a confusing ENOENT later.
  if (!hasGit()) {
    process.stderr.write(
      'forge mcp install: this command shells out to `git` for the clone step. Install git and retry.\n'
    );
    return 1;
  }
  try {
    const installed = await installMcpServer({
      source,
      overwrite: opts.overwrite ?? false,
    });
    process.stdout.write(`installed ${installed.name} → ${installed.installPath}\n`);
    process.stdout.write(`registered in ${defaultUserMcpPath()}\n`);
    process.stdout.write('Run `forge mcp list` to verify; remove with `forge mcp remove <name>`.\n');
    return 0;
  } catch (err) {
    process.stderr.write(`forge mcp install: ${(err as Error).message}\n`);
    return 1;
  }
}

async function removeServer(name: string): Promise<number> {
  try {
    const { removed } = await uninstallMcpServer({ name });
    if (removed) {
      process.stdout.write(`removed ${name}\n`);
    } else {
      process.stdout.write(`${name} was not installed (nothing to do)\n`);
    }
    return 0;
  } catch (err) {
    process.stderr.write(`forge mcp remove: ${(err as Error).message}\n`);
    return 1;
  }
}

function browseMarketplace(): number {
  process.stdout.write(`IKarmic Forge MCP Marketplace (catalog v${MARKETPLACE_CATALOG_VERSION}):\n  ${MARKETPLACE_CATALOG_URL}\n\n`);
  process.stdout.write('Browse community MCP servers there. To install one:\n');
  process.stdout.write('  forge mcp install <github-url>           # any GitHub repo with mcp.json\n');
  process.stdout.write('  forge mcp install <owner/repo[#subdir]>  # shorthand\n');
  return 0;
}

function hasGit(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}