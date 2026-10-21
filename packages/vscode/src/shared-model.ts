/**
 * Layer the shared config's provider and model (`~/.forge/config.json`, written by the Settings panel
 * and read by the CLI) under the VS Code settings: `forge.provider` and `forge.model` win when set, the
 * shared file fills the gaps, and with neither the provider is auto-detected from API keys. A shared
 * model is only used with the provider it was chosen for. vscode-free so it can be unit-tested.
 */
export function applySharedModel(
  cfg: { provider: string; model: string },
  shared: { provider?: string; model?: string }
): void {
  if (cfg.provider === 'auto' && shared.provider) cfg.provider = shared.provider;
  if (!cfg.model.trim() && shared.model && (!shared.provider || shared.provider === cfg.provider)) cfg.model = shared.model;
}
