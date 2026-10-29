import type * as vscode from 'vscode';

import { defaultUserMcpPath, placeholdersIn, readUserMcpRegistry } from '@ikarmic/forge-core';

/** The ids of the secrets a user-defined server asks for, read from its entry in mcp.json; none when it has no entry. */
export async function userServerSecretIds(server: string): Promise<string[]> {
  const spec = (await readUserMcpRegistry(defaultUserMcpPath()).catch(() => undefined))?.mcpServers[server];
  return spec ? placeholdersIn(spec).secrets : [];
}

/**
 * Secrets the person entered on a server's card in Settings (a token, a connection string). They live in the editor's
 * secret storage, never in `mcp.json`: the file holds only the placeholder `${input:<id>}` (core `placeholders.ts`).
 */
export interface McpSecretStore {
  get(server: string, id: string): Promise<string | undefined>;
  has(server: string, id: string): Promise<boolean>;
  /** An empty value removes the secret. */
  set(server: string, id: string, value: string): Promise<void>;
}

export function createMcpSecretStore(secrets: vscode.SecretStorage): McpSecretStore {
  // Provider keys use `ikarmic-forge:<provider>` (credential-store.ts); this prefix cannot collide with them.
  const keyFor = (server: string, id: string): string => `forge.mcp:${server}:${id}`;
  return {
    async get(server, id) {
      return secrets.get(keyFor(server, id));
    },
    async has(server, id) {
      return Boolean(await secrets.get(keyFor(server, id)));
    },
    async set(server, id, value) {
      if (value) await secrets.store(keyFor(server, id), value);
      else await secrets.delete(keyFor(server, id));
    },
  };
}
