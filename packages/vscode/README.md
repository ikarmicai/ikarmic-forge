# IKarmic AI Forge — an AI coding agent for VS Code

[![Marketplace](https://img.shields.io/badge/Marketplace-Install-007ACC?style=flat-square&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=ikarmic.ikarmic-forge)
[![Version](https://img.shields.io/visual-studio-marketplace/v/ikarmic.ikarmic-forge?label=Version)](https://marketplace.visualstudio.com/items?itemName=ikarmic.ikarmic-forge)
[![Installs](https://img.shields.io/vscode-marketplace/i/ikarmic.ikarmic-forge?label=Installs)](https://marketplace.visualstudio.com/items?itemName=ikarmic.ikarmic-forge)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/ikarmicai/ikarmic-forge/blob/main/LICENSE)

**IKarmic AI Forge is an AI coding agent that works inside VS Code.** It reads and edits your files, runs your build and tests, connects to MCP servers, and asks before it runs a command or changes your files, unless you switch on Autonomous mode. Bring your own model key — OpenAI, Anthropic, Google, OpenRouter, MiniMax, or a local Ollama model — or let Forge pick.

- **Any model, your key.** Forge talks straight to the provider you configure. Your prompts are not routed through an IKarmic server.
- **You stay in control.** Read-only tools run without asking; by default anything that writes a file or runs a command shows you a diff or a confirmation first.
- **Choose how much it asks.** A picker under the message box sets it per message: Ask first, Accept edits (file edits run without asking; commands still ask) or Autonomous. Shell commands and other destructive actions ask first in every mode.
- **Understands your repo.** Repo map, semantic search, steering files and a spec/plan workflow, so it works on your codebase rather than one file at a time.
- **Open source where it runs.** The VS Code extension is AGPL-3.0; the agent engine it embeds is proprietary and shipped from npm. See [License](#license).

## Install

Click **Install** on the Marketplace page, or from inside VS Code:

1. Press `Ctrl+P` (macOS: `Cmd+P`)
2. Paste `ext install ikarmic.ikarmic-forge`
3. Press Enter

Then open the Forge panel in the Activity Bar. A walkthrough takes you from zero to your first agent run.

<details>
<summary>Install from a <code>.vsix</code> or build from source</summary>

```bash
# Build the extension
cd packages/vscode
pnpm build
pnpm exec vsce package

# Install the package that was just built
code --install-extension *.vsix
```

To work on Forge itself, open the `packages/vscode` folder in VS Code and press **F5** for an Extension Development Host.

</details>

## Connect a model

Open **Forge: Open Settings** (the ⚙ on the Forge panel title), go to the **Providers** section, and enter a key. Forge stores it in your VS Code settings or reads it from the environment:

| Provider | Setting | Environment variable |
| --- | --- | --- |
| OpenAI | `forge.apiKeys.openai` | `OPENAI_API_KEY` |
| Anthropic | `forge.apiKeys.anthropic` | `ANTHROPIC_API_KEY` |
| Google | `forge.apiKeys.google` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| OpenRouter | (environment variable only) | `OPENROUTER_API_KEY` |
| Ollama (local, no key) | `forge.provider` = `ollama` | `FORGE_DEFAULT_PROVIDER`, `FORGE_DEFAULT_MODEL` |

You can also register your own OpenAI-compatible endpoint (a gateway, a proxy, a self-hosted router) from the same Providers section.

## What Forge can do

### Agentic chat and task runs

Describe a task in the sidebar chat. Forge plans it, calls tools, streams what it is doing as a step list, and asks before anything irreversible. `Forge: Run Task (Autonomous)` does the same without stopping for each safe action.

A short sentence above each group of steps says what Forge did, replies can show how fast they were written (`forge.chat.showSpeed`), and Up and Down in the message box bring back earlier prompts (`forge.chat.promptHistory`). The first time you chat, a card asks how much Forge should ask before acting and remembers it (`forge.approvalDefault`). `/cmd` (or `Forge: Generate Terminal Command`) turns a plain request into one shell command that you insert in the terminal, never run for you.

### Built-in agents

The mode menu under the message box picks an agent for the job. Each follows an explicit method and is written to work on open models as well as frontier ones.

- **Plan** reads the code, traces every caller and test, and writes a step-by-step plan that names each file and how to check each step. A large plan offers to become a spec. It never changes files.
- **Code** makes the change for the language and library versions your project uses, checks the installed API before calling it, and runs your project's own checks.
- **Debug** reproduces the failure first and names the root cause at `path:line` with evidence. It does not fix.
- **Ask** answers from the code and cites `path:line`. It never changes files.
- **Review** reads the real diff, confirms each finding and reports at most ten. It never changes files.
- **Security** audits your changes or the whole repository for exploitable problems and vulnerable dependencies, reports first, and changes files only for the findings you name.

### Inline autocomplete

Ghost-text completions as you type, from a fast model of your choosing, debounced and cancelled so fast typing never queues up requests. `Autocomplete: Suggest Now` forces one; `Autocomplete: Snooze or Turn Off` pauses it.

### Inline edit

`Ctrl+Shift+Alt+I` rewrites the selection with a model, showing the replacement as a diff you accept or reject.

### MCP servers

Add, enable, sign in to and remove Model Context Protocol servers from the Settings page or with `Forge: Add MCP Server...`. Forge reuses the MCP servers you already have configured elsewhere.

### Skills

Reusable, versioned instruction packs the agent can load on demand. `Forge: Install Skill...` installs one; the built-in `forge-config` skill reads and edits your Forge configuration in plain language.

### Parallel sub-agents

`Forge: Run Parallel Agents...` splits a job across background agents working on separate Git branches, then lets you review and merge each one.

### Specs, steering and memory

Turn a large request into a written spec with `Forge: Generate Spec`, work through it as tasks, and sync it back against the code. Steering files give Forge standing instructions for a repo. Project memory lets it remember decisions across sessions.

### Verification, checkpoints and git

After edits, Forge runs your project's own typecheck, lint and tests — it detects them, or you set `forge.verify.commands`. Checkpoints snapshot your work before risky changes, and `Forge: Generate Commit Message` writes the message from the real diff. Pick the language of that message with `forge.commitMessage.language`.

### More

Context compaction for long sessions, cost limits (`forge.maxCostUsd`), a loop guard, browser and web-search tools, semantic search, voice input, a terminal explainer, and import from Claude Code.

## Commands

Every command is available from the Command Palette (`Ctrl+Shift+P`).

**Running work**

- `Forge: Open Chat`
- `Forge: Run Task`
- `Forge: Run Task (Autonomous)`
- `Forge: Run Task on Selection`
- `Forge: Cancel Current Task`
- `Forge: Get Started`
- `Forge: Show Usage Statistics`
- `Forge: Resume a Session...`
- `Forge: Cycle Chat Mode`
- `Forge: Toggle Accept Edits`

**Editing code**

- `Forge: Edit with Forge`
- `Forge: Explain Selection`
- `Forge: Fix Problem`
- `Add to Forge Context`
- `Improve Selection with Forge`
- `Forge: Completion Telemetry - Accepted`
- `Forge: Completion Telemetry - Reset Counts`

**Autocomplete**

- `Autocomplete: Suggest Now`
- `Autocomplete: Snooze or Turn Off`

**Terminal**

- `Explain Selected Terminal Output`
- `Fix Selected Terminal Error`
- `Forge: Start Voice Input`

**Settings, providers and context**

- `Forge: Open Settings`
- `Forge: Configure Provider`
- `Forge: Open Chat in Editor Tab`
- `Forge: Delete Code Index and Forget Consent` (remove the index behind search by meaning and forget which embedding providers you allowed to receive your code)
- `Forge: Open Agent Manager` (run one prompt as up to four parallel sessions, each in its own git worktree, then merge the one you want)
- `Forge: Open Agent Manager in New Window` (the same page, in a window of its own, for a second screen)
- `Forge: Open Project Memory`
- `Forge: Manage Memory`
- `Forge: Generate Commit Message`
- `Forge: Generate Terminal Command` (puts `/cmd ` in the chat: say what you want in plain words, Forge writes one command for your shell and you insert it in the terminal)
- `Forge: Import from Claude Code`

**MCP servers**

- `Forge: Add MCP Server...`
- `Forge: Reconnect MCP Servers`
- `Forge: Open MCP Config`
- `Forge: Enable / Disable MCP Server`
- `Sign In to MCP Server`
- `Remove MCP Server`

**Skills**

- `Forge: Install Skill...`
- `Open Skill`

**Sub-agents**

- `Forge: Run Parallel Agents...`
- `Review Changes`
- `Merge Branch`
- `Discard Branch`
- `Clear Finished Runs`

**Specs**

- `Forge: Generate Spec`
- `Approve Draft`
- `Discard Draft`
- `Run Task (Fresh Session)`
- `Run Task (Current Chat)`
- `Convert Tasks to Checkboxes`
- `Forge: Sync Spec with Code`
- `Open Spec File`
- `Refresh Specs`

**Steering**

- `Forge: New Steering File`
- `Enable / Disable Steering`
- `Open Steering File`
- `Refresh Steering`

## Keybindings

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Open chat | `Ctrl+Shift+I` | `Cmd+Shift+I` |
| Run task | `Ctrl+Shift+L` | `Cmd+Shift+L` |
| Edit with Forge | `Ctrl+Shift+Alt+I` | `Cmd+Shift+Alt+I` |
| Suggest now | `Ctrl+Alt+\` | `Ctrl+Alt+\` |
| Voice input | `Ctrl+Shift+Space` | `Ctrl+Shift+Space` |
| Cycle chat mode (in the chat) | `Ctrl+Alt+M` | `Cmd+Alt+M` |
| Toggle Accept edits (in the chat) | `Ctrl+Alt+A` | `Cmd+Alt+A` |

## Settings

Forge ships **85 settings**, grouped by family in the Forge Settings page. The ones people change most:

| Setting | Purpose |
| --- | --- |
| `forge.provider` | `auto` (default), `openai`, `anthropic`, `google`, `openrouter`, `ollama` |
| `forge.model` | Default model id |
| `forge.completionModel` | Model used for inline autocomplete |
| `forge.completionDebounceMs` | Wait after typing before requesting (default 350 ms) |
| `forge.verify.auto` | Run the project's own checks after edits: `ask` (default), `on`, `off` |
| `forge.verify.commands` | Your own check commands; they replace the detected ones |
| `forge.maxCostUsd` | Stop a run at a spend limit |
| `forge.suggestSpec` | Offer a spec when a message asks for a whole system |

That table is deliberately short. For the [full list of all 85 settings](https://github.com/ikarmicai/ikarmic-forge/blob/main/packages/vscode/package.json), search `forge.` in VS Code Settings, or open **Forge: Open Settings** — every row has its range and its default, and shows a Reset button when it differs from that default.

## Security and privacy

- API keys stay in your VS Code settings or your environment. Forge does not proxy model traffic through an IKarmic service.
- Read-only tools (list, read, search) run without a prompt. By default anything that writes a file or runs a command asks first, and `apply_patch` shows a diff before you approve it.
- Accept edits removes the prompt for file edits as well as reads; Autonomous also removes it for most other tools. Shell commands, sub-agents, the browser and other destructive tools still ask for your approval each time, in every mode.
- `git_diff` runs without a prompt, with git's hook-running settings turned off. `dependency_audit` asks first, because a package manager follows the project's own settings and sends the dependency list to a registry.
- Project files can never point Forge at a provider URL, key or header — those settings are yours alone.
- `forge.caCertificates` and the proxy settings apply to model calls as well as other traffic.

## FAQ

**Does Forge send my code anywhere without asking?**
Only to the model provider you configured, using your key. Forge itself does not proxy your requests.

**Can I use a local model?**
Yes. Set `forge.provider` to `ollama` and point `forge.model` at your local model. There is no cloud dependency for autocomplete or chat.

**Which models work?**
Any provider Forge has a client for — OpenAI, Anthropic, Google, OpenRouter, MiniMax — plus Ollama for local models and any OpenAI-compatible endpoint you register yourself.

**Does it work with MCP servers?**
Yes. Add them from the Forge Settings page or `Forge: Add MCP Server...`.

**Is it free?**
The extension is free and AGPL-3.0. You pay your model provider directly, or run a local model for no cost at all.

**Is the whole product open source?**
No, and it is worth being precise: the VS Code extension, CLI and evaluation harness are AGPL-3.0. The agent engine (`@ikarmic/forge-core`) that they embed is proprietary and distributed from npm.

**Does it need a Git repo?**
No. Checkpoints and auto-commit use Git when you have it and stand down when you do not.

**How do I stop a run?**
`Forge: Cancel Current Task`, or the stop control in the chat panel.

## Troubleshooting

**Autocomplete does nothing.** Run `Autocomplete: Suggest Now`. If it still fails, open the Output panel and choose **Forge** — the log says which step gave up and why, including a model id your provider has retired.

**The agent cannot read a file in my repo.** Check that the path is inside your workspace. Forge refuses to follow a symlink out of the workspace on purpose.

**A model id stopped working.** Providers retire ids without warning. Pick a current one in the Providers section; Forge logs the rejection rather than failing silently.

## License

| Component | License |
| --- | --- |
| VS Code extension (`packages/vscode`) | AGPL-3.0-only |
| CLI (`packages/cli`) | AGPL-3.0-only |
| Evaluation harness (`packages/eval`) | AGPL-3.0-only |
| Agent engine (`packages/core`) | Proprietary |

Versions 4.5.0 and earlier of every package were MIT and remain MIT.

- [LICENSE](https://github.com/ikarmicai/ikarmic-forge/blob/main/LICENSE)
- [NOTICE](https://github.com/ikarmicai/ikarmic-forge/blob/main/NOTICE)

## Links

- [Source and issues](https://github.com/ikarmicai/ikarmic-forge)
- [Report a bug or request a feature](https://github.com/ikarmicai/ikarmic-forge/issues)
- [Changelog](https://github.com/ikarmicai/ikarmic-forge/blob/main/CHANGELOG.md)