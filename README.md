# IKarmic AI Forge

An all-in-one AI coding assistant. A shared agent engine that drives a polished terminal CLI today, and a VS Code extension tomorrow. One source of truth for the model loop, the tools, and the prompts: different surfaces on top.

> **Status:** **v5.1.1**: CLI, VS Code extension and eval harness, open source under AGPL-3.0-only. The core engine (`@ikarmic/forge-core`) is proprietary and free to run with them.
>
> **Install:** `npm i -g ikarmic-forge` for the CLI, or the VS Code Marketplace / Open VSX listing for the extension. To build from source: `pnpm install && pnpm -r build`.

## What's in the box

**The agent loop**: manual `maxSteps: 1` iteration for full control over tool approval, abort, and error recovery. Streams events (text deltas, tool calls, tool results, cost, compaction, plan, hook dispatches).

**Sixteen built-in tools**: `read_file`, `read_image`, `write_file`, `edit_file`, `edit_notebook`, `list_files`, `search_files`, `find_symbol`, `list_symbols`, `find_references`, `run_command`, `fetch_url`, `sub_agent`, `memory_read`, `memory_write`, `memory_forget`. Plus MCP tools from any compatible server.

**Five model providers**: OpenAI, Anthropic, Google, Ollama (local), OpenRouter (100+ models behind one key).

**Two surfaces**: terminal CLI (`forge`) with one-shot / REPL / JSON modes, and a VS Code extension with inline completions + a sidebar chat.

**Codebase-aware search** (new in v2.15): `find_symbol(name, kind?)`, `list_symbols(path)`, and `find_references(name)` for TypeScript/TSX/JavaScript/JSX, backed by a tree-sitter (WASM) symbol index persisted at `.forge/index/symbols.json` and incrementally updated by file mtime. Non-TS/JS files fall back transparently to `search_files`.

**Worktree-aware `/rewind` warnings** (v2.12): `forge checkpoint restore` now compares the checkpoint's `worktreeContext` against the current cwd and warns when they differ (`main-to-wt`, `wt-to-main`, `cross-wt`, `cross-repo`, `no-context`). Pure `compareWorktreeContexts` helper in core; CLI prints `⚠  worktree mismatch (<kind>): ...` to stderr.

**JSON-schema eval grader** (new in v2.12): `jsonSchema(zodSchema)` and `jsonSchemaPartial(zodSchema)` in `@ikarmic/forge-eval`. Parses `finalText` as JSON, validates against a Zod schema, returns pass/fail with dotted-path validation errors. Pairs with the v2.8 `--schema` mode for fully deterministic CI eval (zero LLM-as-judge for tasks with a clear JSON contract).

**Worktree lifecycle polish** (new in v2.11): `forge worktree list | cleanup | prune` CLI subcommand for visibility/control outside the agent loop. `bin/forge.ts` auto-prunes worktree leftovers from prior crashed sessions on every startup. `Checkpoint.worktreeContext` (opt-in via `AgentConfig.checkpoints.captureWorktreeContext: true`) tags each checkpoint with the worktree boundary so `/rewind` can warn on cross-worktree restore.

**Orchestrator worktree isolation** (new in v2.10): `forge orchestrator run --orchestrator-worktrees <mode>` with `auto|always|never`. When `auto` (default), every step in a `parallelGroup` (>1 step) runs in its own git worktree so concurrent specialists don't race on `.git/` state. `OrchestratorStepResult` carries `worktreePath` + `worktreeBranch`; per-specialist `worktree: true|false` overrides win over the mode. Falls back gracefully when not in a git repo. Closes the race-on-index hole that parallel dispatch (v2.3) opened.

**Git worktree isolation** (new in v2.9): `sub_agent` gets a new `use_worktree: true` option. The child runs in `<repo>/.forge/worktrees/<label>/` on its own branch (`forge/<label>-<short-sha>`), with auto-cleanup on completion (success or error). Refuses to remove worktrees outside the managed root, force-removes dirty ones. `WorktreeManager` is also exported for programmatic use. Falls back gracefully with a stderr warning when not in a git repo.

**Structured output mode** (new in v2.8): `forge --schema <path> "..."` pins the agent's final response to a Zod schema (`.ts`) or JSON Schema (`.json`). The agent runs normally; on mismatch we feed the validation error back and retry up to `--schema-retries <n>` (default 3). In `--json` mode the validated payload is emitted as a single `structured` event for easy CI / batch / eval-harness integration. Exits **3** on schema-validation failure (distinct from generic exit 1).

**Multimodal input** (new in v2.7), `read_image` tool lets the agent inspect PNG / JPEG / GIF / WebP files. Tool results with `dataUrl` + `mime` auto-attach to the next turn via the AI SDK's `experimental_content` channel so vision-capable models (Claude, GPT-4o, Gemini 1.5+, Ollama llava) actually see the image. Magic-byte mime sniffing, 5 MB default cap, full sandbox parity with `read_file`. **Privacy:** the encoded bytes flow to your configured model provider, same trust model as typing a screenshot into ChatGPT. On-device Ollama vision models keep bytes local.

**Voice input** (new in v2.2): click the 🎤 button in the chat panel or hit `Ctrl+Shift+Space` / `Cmd+Shift+Space` to dictate prompts hands-free. Web Speech API with feature detection, interim transcript streaming, continuous-mode auto-restart, and full error mapping (mic permission, no-speech, network, etc.). Five new settings under `forge.voice.*`.

**Skills system**: `SKILL.md` files with YAML frontmatter are auto-discovered from `./skills/`, `.forge/skills/`, and `~/.forge/skills/`. The activator scores each skill against the user's task and injects the top 3 into the system prompt. Format follows the Agent Skills v1 convention so skills written for Claude Code / Cline / Kilo port with no changes. The v2.1 community catalog (`forge skill search|install <name>`) lets you install published skills with one command. See `forge skill list|show|install|search`.

**Lifecycle hooks**: 10 events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, `Notification`, `Stop`, `SessionEnd`). Configure via `~/.forge/settings.json` (or project-local `.forge/settings.json`). Shell hooks with per-tool matcher globs and configurable timeouts. See `forge hook list|test`.

**Quality-of-life**: project memory, plan mode, context compaction, tool sandbox (allow/deny + path/command/URL policies), sub-agent delegation, cost tracking, secret redaction, tool result cache, eval harness, sessions, GitHub Actions CI, orchestrator mode (multi-agent routing), MCP + skills marketplaces, session export (Markdown / JSON with secret redaction), diff preview (`computeUnifiedDiff` + `forge diff`).

## Unreleased

- **Permission rules, goals, slash menu** (VS Code): ordered `allow`/`ask`/`deny` rules (`permission` in `~/.forge/config.json`, last match wins, `.env` reads always ask), a todo checklist and `ask_user` questions, `/goal` to keep working on one objective, a `/` command menu, a Settings row for every `forge.*` setting, and a per-project `.forge/config.json` that can only tighten what you allowed.
- **Prompt caching**: Anthropic (and Anthropic on Bedrock) requests now carry cache breakpoints, so long agent runs re-read earlier context at a tenth of the price. Cost and the CLI footer account for cached tokens. Off with `--no-cache-prompts` / `forge.cachePrompts`.
- **Infinite output**: a reply cut off by the model's output limit is continued automatically (up to 3 times).
- **Model aliases**: `"aliases": { "fast": "anthropic:claude-haiku-4-5" }` in `~/.forge/config.json`; use them with `--model`, `--cheap-model`, `--editor-model` and the VS Code model settings. `forge config` lists them.
- **Architect mode**: `forge --architect --editor-model <model> "<task>"`: the main model explores read-only and writes a change plan, you approve it, and the editor model applies it. VS Code: `forge.architect.enabled` + `forge.architect.editorModel`.
- **Git workflow**: `forge --auto-commit "<task>"` commits your own uncommitted work first, then what the agent changed, with a message drafted from the diff (`--no-dirty-commits`, `--no-attribute`, `--git-commit-verify`). REPL: `/commit`, `/undo` (only Forge's own unpushed commits), `/diff`. VS Code: `forge.autoCommit.enabled`, `.dirtyCommits`, `.attribute`, `.runHooks`.
- **Repo map**: `--map-tokens <n>` puts a ranked outline of the codebase in the system prompt, ordered by how much other code depends on each file, with the files and names in your request ranked higher. REPL: `/map`. VS Code: `forge.repoMap.tokens`.
- **Auto-lint**: `--auto-lint` checks the syntax of every file the agent writes and sends problems back in the same step; `--auto-lint-cmd "ts: eslint"` adds a linter per language. VS Code: `forge.autoLint.enabled` + `forge.autoLint.commands`.

## What's new in v4.4

### More models
Besides OpenAI, Anthropic, Google, OpenRouter, MiniMax and Ollama, Forge now talks to **Azure OpenAI**, **Amazon Bedrock**, **Google Vertex**, **LM Studio** and **any OpenAI-compatible endpoint**.

| Provider (`--provider`) | Credentials / settings |
| --- | --- |
| `azure` | `AZURE_API_KEY` + `AZURE_RESOURCE_NAME` (or `AZURE_OPENAI_BASE_URL`); the model id is your deployment name |
| `bedrock` | `AWS_BEARER_TOKEN_BEDROCK`, or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`; `AWS_REGION` |
| `vertex` | `GOOGLE_VERTEX_PROJECT` (+ `GOOGLE_VERTEX_LOCATION`), Application Default Credentials |
| `lmstudio` | none; `LMSTUDIO_BASE_URL` if not `http://localhost:1234/v1` |
| `openai-compatible` | `OPENAI_COMPATIBLE_BASE_URL` (+ `OPENAI_COMPATIBLE_API_KEY`) |

Bedrock, Vertex and Azure are never auto-selected from ambient credentials; choose them explicitly. In VS Code use the `forge.providers.*` settings.

### Agent controls (CLI flags, VS Code settings)
- **Budget**: `--max-cost <usd>` / `forge.maxCostUsd` stops a run at a spend cap.
- **Model router**: `--cheap-model <id>` / `forge.router.cheapModel` sends read-only exploration steps to a cheaper model and keeps the main model for planning and edits.
- **Verify loop**: `--verify "pnpm test"` (repeatable) / `forge.verify.commands` runs your checks after the agent edits files and feeds failures back so it can fix them.
- **Semantic search**: `--semantic-search` / `forge.semanticSearch` adds `codebase_search`. It works offline by default; set `FORGE_EMBED_PROVIDER=openai|ollama` for embedding-based ranking. Symbol tools now cover Python, Go, Rust and Java as well as TS/JS.
- **Browser**: `--browser` / `forge.browser.enabled` lets the agent open a page (for example your dev server), take a screenshot and read console errors. Needs Chrome, Edge or Chromium (`FORGE_CHROME_PATH` overrides). Clicking and typing need approval.
- **Agent-task hooks**: a hook of `"type": "agent"` runs an agent task instead of a shell command (for example on `FileChanged`). It runs unattended with file read/write tools only.

### VS Code
- **`@` mentions**: `@file`, `@folder:src`, `@symbol:Name`, `@problems`, `@terminal`, `@git`, `@https://…` (a web page) and `@docs:<name>` (from `forge.docs`), with autocomplete. Paste or drop any file (or use the paperclip) to attach it: images and PDFs go to the model as they are, text files inline.
- **Review hunks**: accept or reject individual hunks of any file edit before it lands.
- **Terminal**: agent commands run in a visible Forge terminal; a long-running command such as a dev server is left running.
- **Context meter and Condense**: live cost and context-window use, and a button to summarize older turns.
- **Views**: MCP Servers (browse a catalog, install, enable/disable), Skills, and Parallel Agents.
- **Parallel Agents**: specialists work in separate git worktrees; each branch is committed, then you review and merge it. From the CLI: `forge orchestrator run "<task>" --orchestrator-commit`.
- **Get Started walkthrough**, **usage statistics** (`Forge: Show Usage Statistics`, computed locally), and **Resume a Session** to continue a CLI session in the editor (and `forge --resume <id>` to go back).
- Localized command titles (English, Spanish, Simplified Chinese), keyboard-accessible chat, reduced-motion and high-contrast support.

### For teams
- **Organization policy**: an admin-managed `policy.json` can restrict providers, deny tools, allowlist MCP servers, disable the browser and autonomous mode, cap spend and force auditing. See [docs/ENTERPRISE.md](docs/ENTERPRISE.md). `forge policy` shows what applies.
- **Audit log**: append-only JSON lines of runs and tool calls (arguments redacted).
- **Proxy**: `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` (and VS Code's `http.proxy`) are honored for all model and MCP traffic.
- **JetBrains and other ACP clients**: `forge acp` serves the Agent Client Protocol on stdio. See [docs/ACP.md](docs/ACP.md).

## Quick start (60 seconds)

```bash
# 1. Set one provider key
export ANTHROPIC_API_KEY=...
# (or any of: OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, OPENROUTER_API_KEY)

# 2. Run a task
npx ikarmic-forge "summarize src/"

# Or open the VS Code extension
code --install-extension ikarmic.ikarmic-forge
```

## Why this exists

Most AI coding tools are either great editors or great CLIs, never both, and almost never share their core. Forge ships one TypeScript agent engine (`@ikarmic/forge-core`) and lets you reach it from the terminal today, an editor tomorrow, or from your own scripts in between.

## Quick start

### CLI

```bash
# Install (once we publish to npm)
npm i -g ikarmic-forge

# Set at least one provider key
export ANTHROPIC_API_KEY=...
# or: export OPENAI_API_KEY=...
# or: export GOOGLE_GENERATIVE_AI_API_KEY=...

# Run a task
forge "read src/index.ts and tell me what it does"
```

By default the CLI prompts you before each shell command. Add `--auto` for autonomous execution: perfect for CI, scripted workflows, or after you trust the agent on a codebase:

```bash
forge --auto "run the test suite and fix anything that breaks"
```

### VS Code extension

The same agent engine ships as a VS Code extension with inline completions + a sidebar chat.

```bash
# From source
cd packages/vscode
pnpm build
pnpm dlx @vscode/vsce package
code --install-extension *.vsix
```

Then click the **Forge** icon in the activity bar to open the chat. Press `Ctrl+Shift+I` (or `Cmd+Shift+I` on macOS). Configure provider + API key in Settings (`@ext:ikarmic.ikarmic-forge`) or via environment variables.

**Inline completions** (Phase 3.4) work out of the box for any language. Notable knobs:

| Setting                            | Default | What it does                                                              |
| ---------------------------------- | ------- | ------------------------------------------------------------------------- |
| `forge.completionDebounceMs`       | 350     | Wait this long after the last keystroke before requesting a completion.   |
| `forge.completionMaxTokens`        | 512     | Response ceiling. Higher = more multi-line completions possible.          |
| `forge.completionTelemetry`        | off     | Opt-in: shows accept/reject rates in the status bar tooltip.              |

Completion requests are also suppressed when the cursor is inside a string
literal or a comment: the model has nothing useful to add there, so we
don't waste tokens.

Multi-line completions can be accepted one line at a time with `Tab` (VS
Code's `editor.action.inlineSuggest.acceptNextWord`).

**Voice input** (v2.2): click the 🎤 button next to the Send button or hit
`Ctrl+Shift+Space` / `Cmd+Shift+Space` to dictate your prompt. The browser's
Web Speech API transcribes what you say directly into the chat input: no
round-trip through our servers. Interim text streams in italic while the
engine finalizes each utterance; final text commits in regular weight.
Click 🎤 again (or hit the shortcut) to stop.

| Setting | Default | What it does |
| --- | --- | --- |
| `forge.voice.enabled` | `true` | Master switch. When `false`, the mic button is hidden. |
| `forge.voice.language` | `''` | BCP-47 code (e.g. `en-US`, `fr-FR`). Empty uses `navigator.language`. |
| `forge.voice.autoSubmit` | `false` | Send the transcript automatically when the engine finalizes it. Off by default: typing wins. |
| `forge.voice.continuous` | `false` | Keep listening across utterances. Off ends the session on silence. |
| `forge.voice.interimResults` | `true` | Surface interim transcripts as the user speaks. Off waits for final results only. |

**Privacy note**: Chrome's Web Speech API sends audio to a Google cloud
STT service. Voice input requires a network connection and a working
microphone. When the API is unavailable (older VS Code, headless servers,
some Linux distros), the mic button disables itself with an explanatory
tooltip.

## Usage

```
forge [options] [task...]

Arguments:
  task                              plain-English task for the agent

Options:
  -p, --provider <name>             openai | anthropic | google
  -m, --model <id>                  model id within the chosen provider
  -a, --auto                        run autonomously without approval prompts
  --allow-destructive               allow destructive tools in --auto mode
  -c, --cwd <path>                  working directory for file tools
  --max-iterations <n>              max agent iterations (default: 50)
  --max-duration <ms>               max wall-clock ms (default: 600000)
  --system <prompt>                 override the default system prompt
  --mcp-config <path>               path to a forge.mcp.json file
  --resume [id]                     resume a saved session by id (or omit the value for "latest")
  --json                            emit structured JSON events instead of a TUI
  -v, --verbose                     enable verbose logging to stderr
  --allow-tools <list>              comma-separated whitelist of tool names
  --deny-tools <list>               comma-separated blacklist of tool names
  --allow-paths <list>              comma-separated globs; file tools may only match these
  --deny-paths <list>               comma-separated globs; file tools refuse paths matching any
  --allow-commands <list>           comma-separated regexes; run_command requires a match
  --deny-commands <list>            comma-separated regexes; run_command refuses matching commands
  --allow-urls <list>               comma-separated regexes; fetch_url requires a match
  --deny-urls <list>                comma-separated regexes; fetch_url refuses matching URLs
  --no-cost                         disable cost tracking and display
  --no-redact                       disable secret redaction in tool output
  --no-memory                       disable project memory loading
  --plan                            produce a numbered plan as text and stop (no tool execution); CLI prompts to approve/edit/cancel
  --enable-compaction               enable automatic context compaction when approaching the model window
  --compact-at <fraction>           compaction threshold (fraction of model window); default 0.7
  --list-models                     print the resolved model and exit
  -V, --version                     output the version number
  -h, --help                        display help
```

### Examples

```bash
# Quick analysis
forge "summarize the architecture in src/"

# Auto-fix failing tests
forge --auto "run npm test and fix any failures you find"

# Use a specific Claude model
forge --provider anthropic --model claude-sonnet-4-5 "refactor auth.ts to use async/await"

# Script-friendly JSON streaming for piping into other tools
forge --auto --json "rename getUserById to fetchUser across the codebase" | jq 'select(.type=="tool_call")'

# Read-only mode: only expose read-only tools, restrict to src/
forge --allow-tools "read_file,list_files,search_files" --allow-paths "src/**" "audit this codebase"

# Lock down shell commands and network for a CI run
forge --auto --allow-commands "^(npm|pnpm|node)\b" --deny-tools "fetch_url" "install deps and run tests"
```

## Environment

| Variable                          | Required?              | Purpose                            |
| --------------------------------- | ---------------------- | ---------------------------------- |
| `OPENAI_API_KEY`                  | one of these is needed | OpenAI provider                    |
| `ANTHROPIC_API_KEY`               | one of these is needed | Anthropic provider                 |
| `GOOGLE_GENERATIVE_AI_API_KEY`    | one of these is needed | Google provider                    |
| `OPENROUTER_API_KEY`              | for OpenRouter         | OpenRouter provider (100+ models) |
| `FORGE_DEFAULT_PROVIDER`          | optional               | Pick provider when keys for >1 are set (`openai`, `anthropic`, `google`, `ollama`, `openrouter`) |
| `FORGE_DEFAULT_MODEL`             | optional               | Override the default model id      |
| `OLLAMA_BASE_URL`                 | optional               | Ollama server URL (default `http://localhost:11434/v1`) |
| `OPENROUTER_APP_NAME`             | optional               | Attribution header for OpenRouter traffic |

Copy `.env.example` to `.env` for local dev.

### Local models with Ollama

Forge can run entirely offline against a local [Ollama](https://ollama.com)
server: free, private, no API keys.

```bash
# 1. Install Ollama and pull a model
ollama serve               # if not already running
ollama pull llama3.1

# 2. Tell Forge to use it
export FORGE_DEFAULT_PROVIDER=ollama
export FORGE_DEFAULT_MODEL=llama3.1
forge "summarize src/"

# Or one-shot:
forge --provider ollama --model qwen2.5-coder:7b "refactor auth.ts"
```

When you run `forge` without any provider keys set and Ollama is reachable
on localhost, the error message will point you at the right exports.

Supported Ollama models (with sensible context windows): `llama3.1`,
`llama3.2`, `llama3.3`, `qwen2.5`, `qwen2.5-coder`, `mistral`, `mixtral`,
`gemma2`, `codellama`, `deepseek-coder`, `phi3`. Pull others with
`ollama pull <name>`: they'll work, just with the conservative default
window for compaction.

### 100+ models with OpenRouter

[OpenRouter](https://openrouter.ai) routes to many model providers
through one API key. Use Forge with any of their models by setting the
provider to `openrouter` and the model id to the OpenRouter-prefixed form:

```bash
export OPENROUTER_API_KEY=sk-or-...
forge --provider openrouter --model "anthropic/claude-3.5-sonnet" "summarize src/"
forge --provider openrouter --model "openai/gpt-4o-mini" "summarize src/"
forge --provider openrouter --model "meta-llama/llama-3.1-70b-instruct" "summarize src/"
```

Pricing and context windows are baked in for the popular OpenRouter models
(Claude, GPT-4o, Gemini, Llama, DeepSeek); other models work but show
`unpriced` in the cost meter until we add them to the table.

## MCP (Model Context Protocol)

Forge can connect to [MCP](https://modelcontextprotocol.io) servers: pick up any standard MCP server's tools as if they were Forge's own. Pass the path to a `forge.mcp.json` file on the command line:

```bash
forge --mcp-config ./forge.mcp.json "summarize the README"
```

Sample `forge.mcp.json`: all three transports are supported:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." }
    },
    "remote-sse": {
      "type": "sse",
      "url": "https://mcp.example.com/sse",
      "headers": { "Authorization": "Bearer …" }
    },
    "modern-http": {
      "type": "streamable-http",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer …" }
    }
  }
}
```

Tools from MCP servers appear in the agent's tool list with names like `mcp__filesystem__read_file` (so they can't collide with the built-ins). Each MCP tool is treated as `destructive` by default: you'll get an approval prompt unless you pass `--auto --allow-destructive`.

The VS Code extension also reads `forge.mcp.json` from the workspace root automatically: the same config drives both surfaces.

### Transports

| `type`            | When to use                                            | Spec fields                         |
| ----------------- | ------------------------------------------------------ | ----------------------------------- |
| (omitted / stdio) | Spawn a local process: the standard `npx …` pattern  | `command`, `args`, `env`            |
| `sse`             | Legacy Server-Sent Events transport (pre-2025 spec)    | `url`, `headers`                    |
| `streamable-http` | Modern HTTP+JSON transport (2025-03-26 spec)            | `url`, `headers`                    |

When `type` is omitted, we infer stdio vs HTTP from the presence of `command` vs `url`. When both are present, `type` wins.

## Sessions (resume across runs)

Every interactive REPL session auto-saves to `~/.forge/sessions/` after each turn: pick up where you left off with `--resume`:

```bash
forge                                          # new session, auto-saves as you go
> summarize src/
...
> /id                                          # print the session id
session id: 2026-09-24T18-04-01Z-3f9c2a
> /save refactor auth                         # name it for later

# Later (or in a new shell):
forge --resume 2026-09-24T18-04-01Z-3f9c2a     # resume that exact session
forge --resume                                 # resume the most recent
forge session list                             # browse what's saved
forge session show <id>                        # dump the full conversation
forge session delete <id>                      # remove a session
forge session search <words>                   # find sessions whose messages mention every word
```

Slash commands in the REPL (`/help` lists them; `/help <question>` answers a question about Forge):

| Command | Effect |
| --- | --- |
| `/model [id\|alias\|provider:model]`, `/weak-model`, `/models [query]` | show or switch the model, set the cheap model, list aliases and known models |
| `/reasoning-effort <level\|default>`, `/think-tokens <n\|8k\|0>` | how hard the model thinks (`/think-tokens` picks the nearest level; Forge sets a level, not an exact token count) |
| `/add <files>`, `/read-only <files>`, `/drop [files]`, `/ls` | attach files to every turn (re-read each time, secrets redacted, inside the working directory only) |
| `/run <cmd>` (or `!<cmd>`), `/test [cmd]`, `/lint [files]` | run a command and show the model its output on the next turn; `/test` and `/lint` send a failure to the model to fix (with no argument they run `--test-cmd` / `--lint-cmd`) |
| `/web <url>`, `/paste` | add a web page or the clipboard text to your next message |
| `/editor [text]` (or `/edit`) | write your message in `$VISUAL` / `$EDITOR` and send it |
| `/copy`, `/copy-context` | copy the last reply, or the whole conversation as Markdown, to the clipboard |
| `/plan <task>`, `/spec <task>`, `/editor-model <model>`, `/architect <task>` | plan before acting; with an editor model, the main model plans and the editor model applies the approved plan |
| `/commit`, `/undo`, `/diff` | commit pending changes with a drafted message, undo Forge's last unpushed commit, show uncommitted changes |
| `/map`, `/map-refresh` | show the repo map, or re-parse every file first |
| `/load <file>`, `/save-script <file>` | replay commands and messages from a file; write the model and attached files as such a file |
| `/ok`, `/reset`, `/clear`, `/compact`, `/rewind`, `/tokens`, `/settings`, `/report` | say "go ahead", detach files and clear the conversation, wipe the transcript, compact now, restore checkpoints, show context use, show settings, print a prefilled issue link (diagnostics only) |
| `/id`, `/save [label]`, `/exit`, `/quit` | print the session id, save with a label, leave |

`/voice` and `/multiline-mode` are not available: use `/editor` to write a long message.

Sessions store the full conversation (system prompt + every turn) in plain JSON under `~/.forge/sessions/<id>.json`. Override the location with `FORGE_SESSION_DIR`.

## Built-in tools

The agent has thirteen built-in tools that cover the basics of software engineering work:

| Tool           | Purpose                                          | Destructive? |
| -------------- | ------------------------------------------------ | ------------ |
| `read_file`    | Read a file (binary-safe, with line numbers)     | no           |
| `list_files`   | List directory contents (skips `node_modules`, `.git`, ...) | no |
| `search_files` | Regex search across files with context lines     | no           |
| `find_symbol`  | Find where a function/class/interface/type/enum/const/method is defined by name (TS/JS only) | no |
| `list_symbols` | Outline a file's top-level symbols in source order (TS/JS only) | no |
| `find_references` | Find every whole-word occurrence of an identifier across indexed TS/JS files | no |
| `write_file`   | Create or overwrite a file (auto-creates dirs)   | no           |
| `edit_file`    | Surgical find-and-replace (unique match by default) | no       |
| `run_command`  | Execute a shell command with timeout             | **yes**      |
| `fetch_url`    | GET a URL and return readable content (HTML stripped, JSON pretty-printed) | no |
| `memory_read`  | Read the project's memory file (`.forge/MEMORY.md`) | no           |
| `memory_write` | Write or replace a section of the project memory file | no           |
| `memory_forget`| Remove a section of the project memory file     | no           |
| `sub_agent`    | Delegate a focused task to a child agent (no recursion) | **yes**  |

Beyond the built-ins, **MCP tools** are picked up automatically when a `forge.mcp.json` is configured (see the MCP section above). MCP tools are exposed to the model with the fully-qualified name `mcp__<server>__<tool>` and are marked destructive by default.

### `sub_agent`: delegate focused work

Decompose a large task by issuing `sub_agent` calls from the parent. Each child:
- Inherits the parent's cwd, model, and tool set unless overridden
- Is capped at **10 iterations by default** (max 50): short-lived by design
- Defaults to **interactive** (`auto: false`) even when the parent is in `--auto` mode: explicit opt-in via `auto: true` prevents runaway destructive work
- **Cannot itself call `sub_agent`**: recursion is forbidden by default (no cost-explosion risk from runaway delegation)
- Returns `{ task, finalText, iterations, reason, inputTokens, outputTokens, durationMs, toolsUsed }`

Use it for parallel research ("look at three different filesystems and report what's there"), bounded subtasks ("implement this single function with tests"), or sandboxing ("run this check in a sub-agent with `--auto --allow-destructive` so it can edit files freely").

```ts
sub_agent({ task: "audit auth.ts and list every security issue", max_iterations: 15 })
```

In interactive mode (no `--auto`), destructive tools always ask for confirmation. In `--auto` mode they are denied unless you pass `--allow-destructive`.

### `fetch_url`: look up a page without an API key

`fetch_url` is the no-payment web fetch primitive. It takes a URL, GETs it, and returns readable text:

- **HTML**: strips `<script>` / `<style>` / comments / tags, decodes common entities, extracts `<title>`
- **JSON**: pretty-prints
- **Plain text / text/* passthrough**
- **Binary content** (images, PDFs): reports `binary content: <type>, <bytes> bytes` without binary noise
- **Capped**: defaults to 200 KB body, 10s timeout. Override per-call with `max_bytes` and `timeout_ms`.
- **Follows up to 5 redirects** by default; opt out with `follow_redirects: false`.

Use it to pull live docs / changelogs / READMEs the model can name a URL for. No search API, no payment, no rate limit beyond the target server. For real search-rank power, layer in a `web_search` tool backed by a real provider later.

In interactive mode (no `--auto`), destructive tools always ask for confirmation. In `--auto` mode they are denied unless you pass `--allow-destructive`.

## Sandbox (tool allowlist + per-tool policy)

The agent runs in a **sandbox** by default: any combination of an explicit tool allow/deny list and per-tool policy (path / command / URL restrictions). The CLI exposes both as flags; library users get the same via `AgentConfig.toolSandbox`.

### Two layers

1. **Tool allow/deny lists**: strip tools from the model's view entirely. `allowTools` is an explicit whitelist; `denyTools` is a blacklist applied to whatever survived.

2. **Per-tool policies**: narrow what a still-exposed tool can do:
   - `allowedPaths` / `deniedPaths` (globs): applied to all five file tools
   - `allowedCommands` / `deniedCommands` (regexes): applied to `run_command`
   - `allowedUrls` / `deniedUrls` (regexes): applied to `fetch_url`

### Path glob semantics

- Absolute patterns (`/etc/**`, `C:\secrets\**`) are **anchored**: the full path must match.
- Relative patterns (`src/**`, `**/secret.txt`) match at **any depth** as a subpath.
- `*` matches a single path segment; `**` crosses separators.
- `X/**` also matches `X` itself (so `src/**` matches both `src` and `src/foo/bar`).
- When both `allowedPaths` and `deniedPaths` are set, **deniedPaths wins**.

### CLI examples

```bash
# Read-only mode restricted to src/
forge --allow-tools "read_file,list_files,search_files" --allow-paths "src/**" "audit this code"

# Exclude secrets anywhere, and lock shell to npm/pnpm
forge --deny-paths "**/secrets/**,*.env" --allow-commands "^(npm|pnpm|node)\b" "summarize"

# Only fetch from internal docs
forge --allow-urls "^https://(docs|api)\\.internal\\.example\\.com" "what's in our changelog?"
```

### Library API

```typescript
import { Agent, resolveModelFromEnv } from '@ikarmic/forge-core';

const agent = new Agent({
  model: resolveModelFromEnv(),
  toolSandbox: {
    allowTools: ['read_file', 'list_files', 'search_files'],
    policies: {
      read_file: { allowedPaths: ['src/**', 'tests/**'], deniedPaths: ['**/fixtures/**'] },
      run_command: { allowedCommands: [/^(npm|pnpm|node)\b/], deniedCommands: [/^rm\b/] },
      fetch_url: { allowedUrls: [/^https:\/\/docs\./] },
    },
  },
});
```

Violations surface as a normal tool error (`[sandbox] Path ... is not in allowedPaths (...)`), so the model can recover by trying a different path / command / URL.

## Eval harness (Phase 3.3)

The `@ikarmic/forge-eval` package ships a deterministic eval harness: run
the agent against a curated task catalog and grade the results with free
checks. No paid LLM-as-judge required.

```bash
# From the monorepo
pnpm --filter @ikarmic/forge-eval build

# Run the full suite against the default model
pnpm --filter @ikarmic/forge-eval exec forge-eval run

# Pin a specific model
pnpm --filter @ikarmic/forge-eval exec forge-eval run --model anthropic/claude-3-5-haiku-latest

# Run a single task by id
pnpm --filter @ikarmic/forge-eval exec forge-eval run --task read-package-version

# Browse the task catalog
pnpm --filter @ikarmic/forge-eval exec forge-eval list

# JSON report for piping into scripts / CI
pnpm --filter @ikarmic/forge-eval exec forge-eval run --json > eval-report.json
```

**What's in the box:**

- **10 curated tasks** spanning three categories (`read`, `edit`,
  `multi-step`): list TypeScript files, read package.json, search for
  TODOs, write a file, edit a greeting, remove a JSON section, rename a
  symbol, run-and-report, refactor-move-function, summarize two files.
- **5 free graders** with no API spend: `regex`, `contains`, `equals`,
  `fileExists`, `commandRuns`. Add `fileMatches`, `fileMissing`,
  `directoryHas`, `toolWasCalled`, `toolNotCalled`, `finalTextNonEmpty`,
  `completed` for richer assertions.
- **Per-task isolated cwd**: every task runs in a fresh temp directory
  with its own fixture files; nothing leaks between tasks.
- **Markdown + JSON reports** so you can diff runs over time, with
  per-task pass/fail, iterations, token usage, and tool invocations.

Exit code is 0 if every task passed, 1 if any failed, 2 if the run
couldn't start (unknown task, no API key, etc.).

**Authoring your own task:**

```ts
import { defineTask, fileMatches, toolWasCalled } from '@ikarmic/forge-eval';

export default defineTask({
  id: 'my-task',
  name: 'My task',
  category: 'edit',
  description: 'Renames greet() to hello() across the codebase',
  task: 'Rename every occurrence of greet to hello.',
  setup: async (cwd) => {
    // Write fixture files into `cwd` before the agent starts.
  },
  graders: [
    toolWasCalled('edit_file'),
    fileMatches('a.ts', 'hello'),
  ],
});
```

Drop it in `packages/eval/src/tasks/<id>.ts`, register in
`packages/eval/src/tasks/index.ts`, run.

See [`packages/eval/README.md`](./packages/eval/README.md) for the full
grader reference and library API.

## Skills system

Skills are self-contained instruction bundles the agent activates when the
user's task matches the skill's description. Drop a `SKILL.md` into
`./skills/`, `./.forge/skills/`, or `~/.forge/skills/` and the next agent
run picks it up automatically.

**Format** (Agent Skills v1 standard):

```markdown
---
name: commit-message
description: Generate a conventional commit message from a staged git diff.
allowed-tools: [read_file, search_files]
version: 1.0.0
---

# Commit Message Generator

Read the staged diff with `git diff --staged`, then output a single
conventional commit message. Stay under 72 chars on the subject line.
```

The activator scores every discovered skill against the user's task using
description-token overlap (case-insensitive, stop-words removed). The top
`maxSkills` (default 3) are injected into the system prompt wrapped in
`<skills>...</skills>`.

Precedence: local (`./skills/`) > project (`./.forge/skills/`) > global
(`~/.forge/skills/`). A project can override a global skill of the same
name. `README.md` files are skipped: only skills named with a `.md`
suffix count.

Manage from the CLI:

```bash
forge skill list               # show every discovered skill
forge skill show commit-message  # print the source + body
forge skill install <url>      # scaffold a SKILL.md stub in ./skills/
forge skill browse             # print the marketplace catalog URL
```

Programmatic access (in your own scripts):

```ts
import { discoverSkills, selectSkills, composeSkillsPrompt } from '@ikarmic/forge-core';
const skills = await discoverSkills(process.cwd());
const active = selectSkills(skills, 'commit my staged changes');
const block = composeSkillsPrompt(active); // append to your system prompt
```

## Lifecycle hooks

Hooks let you run shell commands at lifecycle events without forking the
agent. They fire in declaration order; failures never block the agent.

**Configure** `~/.forge/settings.json` (or `.forge/settings.json` for a
project-local override):

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "run_command|fetch_url", "hooks": [
        { "type": "shell", "command": "logger -t forge '$FORGE_TOOL_NAME $FORGE_TOOL_ARGS'", "timeout": 5000 }
      ] }
    ],
    "PostToolUse": [
      { "matcher": "*", "hooks": [
        { "type": "shell", "command": "echo $FORGE_HOOK_EVENT $FORGE_TOOL_NAME done >> ~/.forge/hooks.log" }
      ] }
    ]
  }
}
```

**Events** (11 total):

| Event              | When it fires                                            | Useful env vars |
| ------------------ | -------------------------------------------------------- | --------------- |
| `SessionStart`     | Beginning of every agent run                             | `FORGE_HOOK_EVENT`, `FORGE_CWD` |
| `UserPromptSubmit` | Before the model is called with the user's task          | `FORGE_PROMPT`  |
| `PreToolUse`       | Right before a tool runs                                 | `FORGE_TOOL_NAME`, `FORGE_TOOL_ARGS`, `FORGE_TOOL_CALL_ID` |
| `PostToolUse`      | Right after a tool returns                               | `FORGE_TOOL_RESULT`, `FORGE_TOOL_IS_ERROR`, `FORGE_TOOL_DURATION_MS` |
| `PreCompact`       | Before context compaction replaces older turns           | `FORGE_MESSAGES_COUNT`, `FORGE_TOKENS` |
| `SubagentStart` / `SubagentStop` | When a child agent is spawned / finishes | `FORGE_SUBAGENT_TASK`, `FORGE_SUBAGENT_REASON` |
| `Notification`     | Whenever the agent surfaces a message                    | `FORGE_NOTIFICATION_MESSAGE`, `FORGE_NOTIFICATION_LEVEL` |
| `Stop`             | When the agent loop ends (any reason)                    | `FORGE_STOP_REASON` |
| `SessionEnd`       | Last event of the run                                    | `FORGE_STOP_REASON` |
| `FileChanged`      | A file is saved/created/deleted: independent of any active agent run | `FORGE_FILE_PATH`, `FORGE_FILE_CHANGE_TYPE` |

Manage from the CLI:

```bash
forge hook list                  # show every configured hook
forge hook test PreToolUse read_file  # dispatch a synthetic event
forge hook test Stop             # no-tool event
```

Matcher globs use `*` (any substring), `|` (alternation), and `?` (single
char). Empty / `*` matches everything. The matcher field is ignored for
non-tool events, with one exception: see below.

### Filesystem-triggered hooks

The other 10 events only fire from inside an active agent run.
`FileChanged` fires independent of one: on file save/create/delete,
whether or not the agent is doing anything:

```bash
# CLI: runs until Ctrl+C, dispatching FileChanged through the same
# hooks config as every other event (~/.forge/settings.json / .forge/settings.json)
forge watch
```

In the VS Code extension, `FileChanged` fires automatically once a
workspace is open: no command needed. Project-level (`.forge/settings.json`)
hooks only execute when the workspace is VS Code-trusted
(`vscode.workspace.isTrusted`); the CLI's `forge watch` never executes
project-level hooks (same conservative default as every other event).

For this one event, `matcher` means a file-path glob (e.g. `"*.ts"`)
instead of a tool-name glob: note that the matcher engine is a flat
string glob, not a path-aware one, so `*` already matches across `/`
(`"*.ts"` matches `src/foo.ts`); a pattern like `"src/**/*.ts"` would
require a literal second `/` a one-level path like `src/foo.ts` doesn't
have.

## Context compaction (Phase 2.3)

Long sessions hit the model's input window. Compaction summarizes older
turns and replaces them with a single structured block so the agent can
keep going without losing context.

Enable it per-run:

```ts
import { Agent } from '@ikarmic/forge-core';

const agent = new Agent({
  model: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  enableCompaction: true,
  compactionThreshold: 0.7,  // compact when 70% of the window is consumed
  compactionKeepRecent: 4,   // keep the 4 most recent turns verbatim
});
```

CLI:

```bash
# Enable auto-compaction at 70% of the window (default)
forge --enable-compaction "long-running migration"

# Tighter threshold (compact earlier)
forge --enable-compaction --compact-at 0.5 "..."

# REPL: force a compaction pass now
> /compact
> 🗜 compacted 6 older turns (saved ~8k tokens)
```

**What the summary captures** (structured):

```
## Goal
<1-3 sentences>

## Key decisions
- <bullet>

## Files touched
- <path> — <reason>

## Open questions
- <bullet>
```

**How it works:**

1. After each iteration completes, the agent checks `inputTokens / modelWindow`.
2. When the ratio exceeds `compactionThreshold`, the summarizer is
   called with all messages except the system prompt and the most
   recent `compactionKeepRecent` turns.
3. The summary is inserted as a new system message
   `[Compacted summary of N earlier turns]` and older messages are dropped.
4. A `compaction` event fires with `droppedCount`, `savedTokens`, and
   `summary` for the UI.

**Custom summarizer:** pass `compactionSummarizer: async (msgs) => "..."` to
override. Useful for tests (deterministic) or pluggable off-process
summarization.

**Pick a cheaper model for the summarizer:** set
`compactionModel: { provider: 'openai', model: 'gpt-4o-mini' }`: the
default is the agent's own model.

Disabled by default because it requires an extra LLM call per
compaction; opt in for long-running sessions.

## Plan mode (Phase 2.2)

Many tasks waste iterations because the user had a specific shape in mind
that the agent didn't infer. Plan mode lets the user shape the work before
any tool runs.

```bash
# One-shot: prints the plan to stdout, exits 0
forge --plan "refactor auth.ts to use async/await"

# In the REPL, the slash command opens an interactive review
/plan refactor auth.ts to use async/await
> 📋 plan:
>   1. Read auth.ts to ...
>   2. ...
# Now type: a (approve), e (edit), c (cancel)
```

When plan mode is on:

- The agent's system prompt is augmented with "produce a numbered plan,
  then stop: do not call tools".
- `maxIterations` is hard-capped to 1 for the plan turn.
- A `plan` event fires with the plan text; UI captures it.
- `AgentRunResult.reason` becomes `'plan'` (not `'completed'`).

In the REPL, the user can:

- **a (approve)**: re-run the original task with the plan injected as an
  `<approved-plan>` block in the system prompt. The agent follows the
  plan but is allowed to deviate (and explain why) if it finds an issue.
- **e (edit)**: type the modified plan, then approve.
- **c (cancel)**: discard the plan and return to the prompt.

Library users can drive plan mode directly:

```typescript
const plan = await agent.run({ task: 'refactor auth.ts' });
// plan.reason === 'plan', plan.finalText is the plan
if (userApproved) {
  // Re-run with the plan as context. planMode: false, but inject the
  // plan via systemPrompt override:
  const result = await agent.run({
    task: 'refactor auth.ts',
    systemPrompt: `<approved-plan>\n${plan.finalText}\n</approved-plan>`,
  });
}
```

Disable plan-mode prompt entirely by setting `planModePrompt: ''`.

## Spec-driven planning mode

Plan mode's single-shot plan is discarded once approved. Spec mode
produces three **persistent** documents instead: Kiro's own
differentiator: so requirements, design, and the task breakdown stay on
disk as the living source of truth for a feature's lifecycle.

```bash
# One-shot: prints the raw three-section draft, exits 0 (nothing written)
forge --spec "add a health-check endpoint"

# In the REPL, the slash command opens an interactive review and,
# on approval, writes the three files to disk
/spec add a health-check endpoint
> 📐 spec drafted:
>   ## requirements.md
>   ...
# Now type: a (approve: writes .forge/specs/<id>/{requirements,design,tasks}.md),
#           e (edit), c (cancel: nothing written)

forge spec list                  # list approved specs
forge spec show <id>             # print all three documents
forge spec cancel <id> --yes     # delete an approved spec
```

When spec mode is on:

- The agent's system prompt is augmented with instructions to explore
  the codebase (read-only tools only: no writes, no commands) and then
  emit exactly three markdown sections in one final response.
- Up to 15 iterations are allowed (vs. plan mode's hard cap of 1) so the
  model can actually ground `design.md` in what it found.
- A `spec` event fires with the raw, unsplit text; the CLI/REPL splits it
  into `requirements.md` / `design.md` / `tasks.md`.
- `AgentRunResult.reason` becomes `'spec'` (not `'completed'`).
- EARS syntax (`WHEN <trigger> THE SYSTEM SHALL <response>`) and
  requirement↔task linking (`_Requirements: 2.1, 3.2_`) are prompt-level
  conventions, not machine-validated, in this release.

## Project memory (Phase 2.1)

The agent auto-loads a project's memory file (`.forge/MEMORY.md`) into
the system prompt on every run. Use it to record conventions the agent
should remember across sessions: build commands, code style, deployment
steps, etc.

Two scopes, project overrides global:

- **Project memory**: `.forge/MEMORY.md` in the workspace root (or the
  closest ancestor that contains one).
- **Global memory**: `~/.forge/MEMORY.md`: applies to every project.

Format is free-form markdown, sectioned with `## Heading`:

```markdown
# Project Memory

## Build commands

`pnpm install` then `pnpm test`. Never `npm`.

## Code style

- Single quotes for strings.
- 2-space indentation.
- Prefer `async/await` over `.then()`.

## Deployment

Build: `pnpm build` → outputs to `dist/`. Deploy via `pnpm dlx vercel deploy --prod`.
```

Two new built-in tools let the agent update memory mid-run:

- `memory_read(scope?, section?)`: read project, global, or both. Optional
  `section` filter returns just one section.
- `memory_write(scope?, heading, body)`: write or replace a section. Same
  scope rules.

Section replacement matches the heading ignoring case and spacing, so the
agent can safely re-write a section without disturbing siblings.

### Typed entries, ranking and staleness (memory v2)

Each section can carry a metadata comment under its heading; files without
one load unchanged as plain conventions:

```markdown
## Package manager

<!-- forge: type=correction, updated=2026-10-12, refs=package.json;pnpm-workspace.yaml, pin=true -->
Use pnpm, never npm.
```

- `type` is `convention` (default), `decision`, `correction` or `reference`;
  `refs` lists paths (or `path#symbol`) the entry depends on; `pin=true`
  always injects it (pins share 2 KB).
- When memory is larger than the injection budget, the prompt gets a short
  index of every section plus the pinned ones plus the sections that best
  match your request (keyword relevance, corrections first). The block is
  fixed for the run; `memory_read` fetches anything left out.
- A section whose `refs` no longer exist is still injected but marked
  `(possibly stale: …)`, and the model is told to verify it. Age alone never
  marks a section stale.
- `memory_write` refuses bodies over 1200 characters, anything that looks
  like a secret, bodies with their own `## ` lines, and refs outside the
  project. Writes ask for approval and show a diff; `memory_forget` removes
  a section and always asks. Past 50 KB the lowest-ranked unpinned section
  is dropped and reported.
- `forge memory list|check|forget <heading> [--global]` inspects and prunes
  memory; VS Code has **Forge: Manage Memory**.
- VS Code settings: `forge.memory.enabled`, `forge.memory.injectionBudgetBytes`,
  `forge.memory.maxBodyChars`, `forge.memory.autoApproveWrites`.

### Limits

- 8 KB injected into the system prompt by default. Override with
  `memoryInjectionBudget` on `AgentConfig`.
- 50 KB hard cap on disk: older sections are trimmed first.
- Disable entirely with `--no-memory` (or `disableMemory: true` on
  `AgentConfig`).

### CLI

```bash
# Add or replace a section from the command line (after writing MEMORY.md once)
forge "use memory_write to record the build command as 'pnpm build && pnpm test'"

# Skip memory entirely (CI, one-shot scripts)
forge --no-memory "summarize src/"
```

### VS Code

**Forge: Open Project Memory** (`forge.openMemory` command palette entry)
opens `.forge/MEMORY.md` in an editor tab. If the file doesn't exist yet,
it offers to create one with a starter template.

## Cost, secrets, and caching (Phase 1)

Three always-on niceties that the agent runs by default:

### Token & cost tracking

The agent computes the USD cost of every turn from a built-in pricing table
(OpenAI, Anthropic, Google flagship models). Cost surfaces in three places:

- **One-shot mode**: the footer shows `tokens: ↑N ↓N · $X.XXX · Ns · steps: N`.
- **REPL mode**: running cost in the bottom status line (`↑N ↓N · $X · 🔒N · busy`).
- **JSON mode**: `cost` event with `costUsd`, `known`, `runningCostUsd`.
- **Session files**: `totalCostUsd` is persisted with every save.

When the model id isn't in the pricing table, the agent emits no cost event
and the UI omits the cost chip (no noisy "unpriced" chatter). To disable
entirely: `--no-cost` (or `disableCost: true` on `AgentConfig`). To override
pricing for custom / proxied models: `pricePerMillionTokens: { input, output }`.

### Secret redaction

Tool results from read-style tools (`read_file`, `search_files`,
`list_files`) flow through a redaction layer before they reach the model.
The default rule set scrubs:

- AWS access keys (`AKIA…`)
- GitHub PATs (`ghp_…`, `github_pat_…`)
- OpenAI keys (`sk-…`, `sk-proj-…`)
- Anthropic keys (`sk-ant-…`)
- Google API keys (`AIza…`)
- Stripe live + test keys (`sk_live_…`, `sk_test_…`)
- Slack tokens (`xox[abprs]-…`)
- PEM private keys (entire block)
- Bearer tokens
- JWTs
- `.env`-style `password=…`, `api_key=…`, `secret=…` etc.

The replacement is `[REDACTED:<rule-name>]`. Counts are surfaced to the UI
(`🔒 3` in the footer) so the user knows something was hidden, not silently
missing. Extend with project-specific formats via `RedactOptions.extraRules`,
or disable entirely with `--no-redact`.

### Tool result cache

Repeated calls to read-style tools within a session hit an in-memory LRU
instead of re-running. The cache:

- Default size 256 entries, TTL 5 minutes.
- **Never** caches destructive tools (`run_command`, `sub_agent`): those
  have external side effects we don't want to skip.
- Survives across turns within one `Agent` instance; fresh state per process.
- Stats (`hits`, `misses`, `size`) are emitted as `cache_stats` events and
  shown in verbose REPL / one-shot footers.

Disable with `disableCache: true` or `--cache-size 0`. Override the TTL with
`cacheTtlMs`.

## Architecture

```
packages/
├── core/          @ikarmic/forge-core: agent engine, providers, tools, MCP
│   ├── src/
│   │   ├── agent/         Agent loop, default prompt
│   │   ├── tools/         8 built-in tools + sandbox policy helpers
│   │   ├── providers.ts   OpenAI / Anthropic / Google adapters (Vercel AI SDK)
│   │   ├── mcp/           MCP config loader, stdio/SSE/HTTP client, JSON-schema → Zod
│   │   ├── sessions/      Conversation persistence (save/load/list/delete)
│   │   ├── config.ts      Env-based config helpers
│   │   └── types.ts       Public types (AgentConfig, ToolSandbox, ToolPolicy, ...)
│   └── tests/             vitest unit + integration tests (with fixture MCP server)
├── cli/           ikarmic-forge: the `forge` terminal command
│   ├── src/
│   │   ├── bin/forge.ts   Entry point (commander + Ink dispatch)
│   │   ├── app.tsx        One-shot Ink app
│   │   ├── repl.tsx       Interactive REPL (multi-turn history)
│   │   ├── runner.ts      Bridges Agent events to UI
│   │   ├── components/    Header, Stream, ToolEvent, Approval, Footer, Spinner
│   │   ├── mcp-loader.ts  Loads + tears down MCP servers per session
│   │   └── options.ts     Arg parsing
└── vscode/        ikarmic-forge: the VS Code extension
    ├── src/
    │   ├── extension.ts   activate/deactivate, command wiring
    │   ├── completion.ts  Inline completion provider (debounced + abortable)
    │   ├── chat/          Webview-based sidebar chat
    │   ├── commands.ts    All command-palette commands
    │   ├── status.ts      Status bar
    │   └── config.ts      VS Code settings -> forge-core config
    ├── resources/icon.svg
    └── esbuild.config.mjs
```

### Agent loop

1. Build conversation: `[system, user(task)]`.
2. Call the model with the registered tool set (without `execute`, so the SDK hands raw tool calls back).
3. If the model returned tool calls: approve (interactive) or auto-run, execute, append `tool` results to history, go to 2.
4. If the model returned no tool calls: emit the final text and stop.
5. Bound by `maxIterations` and `maxDurationMs` to prevent runaway loops.

### Provider abstraction

`createLanguageModel({ provider, model })` returns a Vercel AI SDK `LanguageModel`. The agent loop is provider-agnostic: adding OpenRouter, Bedrock, or a local model is one adapter file away.

## Development

```bash
pnpm install
pnpm -r build
pnpm --filter @ikarmic/forge-core test
pnpm --filter ikarmic-forge dev -- "your task"   # tsx watch mode
```

## License

AGPL-3.0-only for the VS Code extension and CLI (see [LICENSE](LICENSE) and [NOTICE](NOTICE)). `@ikarmic/forge-core` is proprietary (see [packages/core/LICENSE](packages/core/LICENSE)). Versions 4.5.0 and earlier stay MIT. Contributors: see [CLA.md](CLA.md).
