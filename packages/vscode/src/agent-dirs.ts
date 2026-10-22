import { join } from 'node:path';

/** Folders read for agent files, in the order `loadAgentFiles` wants them: yours, then the workspace's (only when trusted). */
export function agentDirs(home: string, workspaceRoot: string, trusted: boolean): string[] {
  return [join(home, '.forge', 'agents'), ...(trusted ? [join(workspaceRoot, '.forge', 'agents')] : [])];
}
