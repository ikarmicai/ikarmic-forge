import * as vscode from 'vscode';

/** What the user has pinned in VS Code settings; `auto` and empty mean "not pinned". */
export interface ModelPin {
  provider?: string;
  model?: string;
}

type Key = 'provider' | 'model';

/** The scope that currently holds a value, so a write lands where it will actually take effect. */
function scopeOf(key: Key): vscode.ConfigurationTarget | undefined {
  const i = vscode.workspace.getConfiguration('forge').inspect<string>(key);
  const pinned = (v: string | undefined) => v !== undefined && v !== '' && v !== 'auto';
  if (!i) return undefined;
  if (pinned(i.workspaceFolderValue)) return vscode.ConfigurationTarget.WorkspaceFolder;
  if (pinned(i.workspaceValue)) return vscode.ConfigurationTarget.Workspace;
  if (pinned(i.globalValue)) return vscode.ConfigurationTarget.Global;
  return undefined;
}

export function getModelPin(): ModelPin {
  const cfg = vscode.workspace.getConfiguration('forge');
  const provider = cfg.get<string>('provider') ?? '';
  const model = cfg.get<string>('model') ?? '';
  return {
    ...(provider && provider !== 'auto' ? { provider } : {}),
    ...(model.trim() ? { model } : {}),
  };
}

/**
 * Keeps VS Code's own settings in step with a model choice. Only a value that is already pinned is
 * rewritten (in the scope that holds it), so choosing a model never pins one the user left on auto,
 * and the pinned value can no longer override what the user just picked.
 */
export async function syncModelPin(next: { provider?: string | undefined; model?: string | undefined }): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('forge');
  for (const key of ['provider', 'model'] as const) {
    if (!(key in next)) continue;
    const target = scopeOf(key);
    if (target === undefined) continue;
    const value = next[key];
    await cfg.update(key, value === undefined ? undefined : value, target);
  }
}
