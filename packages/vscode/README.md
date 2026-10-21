# IKarmic AI Forge: VS Code extension

The editor half of [IKarmic AI Forge](https://github.com/ikarmic/forge). Same agent engine as the CLI, surfaced through:

- **Inline completions**: ghost-text suggestions as you type, debounced + abortable
- **Sidebar chat**: talk to the agent, watch it run tools, approve destructive actions
- **Command palette**: `Forge: Run Task`, `Forge: Run Task (Autonomous)`, `Forge: Run Task on Selection`

## Install

### From a `.vsix` (dev/local)

```bash
# Build the package
cd packages/vscode
pnpm build
pnpm dlx @vscode/vsce package

# Install
code --install-extension ikarmic-forge-1.0.0.vsix
```

### From source (development)

Open the `packages/vscode` folder in VS Code and press **F5** to launch an Extension Development Host with the extension loaded.

## Configure

Open Settings (`Ctrl+,`) and search for "Forge", or click **Forge: Configure Provider** from the command palette. You'll set:

| Setting                       | Purpose                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `forge.provider`              | `auto` (default), `openai`, `anthropic`, `google`, `openrouter`, `ollama` |
| `forge.model`                 | Default model id                                                     |
| `forge.completionModel`       | Model used for inline completions (fast model by default)            |
| `forge.completionDebounceMs`  | Wait this long after typing before requesting (default 350ms)        |
| `forge.completionMaxTokens`   | Response ceiling for completions (default 512)                       |
| `forge.completionTelemetry`   | Opt-in: count accept/reject rates in the status bar tooltip          |
| `forge.verify.auto`           | After edits, run the project's own typecheck/lint/test: `ask` (default), `on`, `off` |
| `forge.verify.commands`       | Your own check commands; they always run and replace the detected ones |
| `forge.suggestSpec`           | Offer a spec (or a plan) when a chat message asks for a whole system |
| `forge.apiKeys.*`             | API keys (falls back to env vars); `openai`, `anthropic`, `google`, `openrouter` |

Or set them via environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`, plus `FORGE_DEFAULT_PROVIDER=ollama` + `FORGE_DEFAULT_MODEL` for local models).

## Keybindings

| Action               | Windows/Linux | macOS        |
| -------------------- | ------------- | ------------ |
| Open chat            | `Ctrl+Shift+I`| `Cmd+Shift+I`|
| Run task             | `Ctrl+Shift+L`| `Cmd+Shift+L`|

## Commands

- `Forge: Open Chat`: focus the sidebar chat
- `Forge: Run Task`: input box → run with approval prompts
- `Forge: Run Task (Autonomous)`: run without approval prompts (skips confirmations for safe tools; destructive tools still denied)
- `Forge: Run Task on Selection`: run against the selected code with language context
- `Forge: Cancel Current Task`: abort the in-flight agent
- `Forge: Configure Provider`: quick links to settings + .env template

## How it works

The extension embeds the same `@ikarmic/forge-core` package that powers the CLI. The chat webview is a self-contained HTML+JS page that talks to the extension host via `postMessage`; the host runs the agent loop, streams events back, and renders tool calls / approval requests.

Inline completions use a separate fast/cheap model (configurable) with a fill-in-the-middle prompt and a debounced + abortable `generateText` call so rapid typing doesn't pile up requests.

## License

AGPL-3.0-only: see [LICENSE](LICENSE). The embedded `@ikarmic/forge-core` is proprietary; see [NOTICE](../../NOTICE).
