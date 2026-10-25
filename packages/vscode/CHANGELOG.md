# Changelog

Notable changes to the IKarmic AI Forge extension for VS Code.
The engine behind it, the CLI and the evaluation harness share the same releases;
see the [full project changelog](https://github.com/ikarmicai/ikarmic-forge/blob/main/CHANGELOG.md)
for every change, including the ones that only affect the CLI.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [5.2.0] - 2026-10-25

### Added

- **Smarter built-in agents.** Plan, Code, Debug, Ask and Review each work by an explicit method now, written to work on open models as well as frontier ones. Plan traces every caller and test before it plans, names each file and how to check each step, and ends by saying whether the plan is small or large. Code reads the versions the project uses and the installed library API before calling it, writes to current practice for those versions, and runs the project's own checks. Debug reproduces first and tests one hypothesis at a time. Ask answers from the code with `path:line`. Review reads the real diff and confirms each finding before it reports it.
- **Security agent.** A new built-in agent (and chat mode) that audits your changes or the whole repository for exploitable problems and vulnerable dependencies, reports each with how it can be exploited, and changes files only for the findings you name.
- **`git_diff` and `dependency_audit` tools.** `git_diff` shows the current diff without an approval card and refuses option-shaped refs. `dependency_audit` runs the project's own dependency auditor, picked from its lockfile (npm, pnpm, yarn, pip-audit, cargo audit, govulncheck); it asks first, because an auditor follows the project's settings and can run code the project ships, and it sends the dependency list to the registry's advisory service.
- **Version facts for every agent.** A `<stack>` block in the system prompt lists the runtime, language and library versions the workspace's own files state, and its test runner, linter and formatter.
- **A large plan can become a spec.** When the Plan agent says a plan is large, the chat offers to draft a spec from it.
- **Approval picker in the chat composer.** The Autonomous checkbox is now a picker with three levels: **Ask first** (as before), **Accept edits** (file edits run without asking; commands, the browser and sub-agents still ask, and permission rules still apply) and **Autonomous**. The level is chosen per message in the chat and cannot be set by a project file.
- **Tree-sitter ships with the extension.** The extension grows from 2.45 MB to 3.29 MB because it now carries tree-sitter and its language grammars.

### Fixed

- **Orchestrator steps could not read, and Code could use every tool.** In a parallel or orchestrator run, Plan, Debug, Ask and Review had every tool call refused, so they answered without reading the code; Code was offered every built-in tool, including ones its list forbids. Each step now gets exactly its agent's tools, runs read-only tools without asking, and keeps your permission rules and sandbox (RB-39).
- **Orchestrator steps now hand their work on.** A later step gets what the earlier steps produced, so in a "plan, then code" run Code works from Plan's plan instead of the router's one-line task.
- **Symbol tools hung in VS Code.** `find_symbol`, `find_references` and `list_symbols` never answered in the extension: tree-sitter looked for its wasm file next to the bundle and stopped when it was not there. The extension now ships tree-sitter and its grammars, and a build without them fails at once with a clear message instead of hanging (RB-40).
- **A custom agent that reuses a built-in id was listed twice, and the built-in ran.** The mode menu showed Plan, Code, Debug, Ask and Review twice when your agents file held entries with those ids, and picking one ran the built-in, not yours. It is now one mode and your version runs (RB-38).

### Notes

- **If you copied a built-in agent into your own agents file, check it.** An agent in `~/.forge/specialists.json` with the same id as a built-in (`plan`, `code`, `debug`, `ask`, `review`) replaces the built-in, so you keep the old prompt and do not get the new one. Delete your copy to get the new agent. The mode menu now lists such an agent once, and runs your version (before, it listed both and ran the built-in).

## [5.1.1] - 2026-10-24

### Changed

- **A rewritten agent prompt.** The instructions Forge gives the model by default are rewritten: do exactly what was asked, check the result with your project's own tests, ask before anything hard to undo, and use the dedicated tool before a shell command. The model is also told the operating system, shell, working folder and date, so it stops guessing between `cat` and `type` on Windows. The prompt is about 850 tokens longer per request.
- **Marketplace listing.** The Overview, description, keywords and Version History were corrected: working links, no stale install step, and the full command and keybinding lists.

### Fixed

- **`read_file` counted a line that is not there.** A file ending in a newline was reported with one extra, empty last line (a 37-line file read as 38), so the model could be told the file ends in a blank line. A file holding exactly the number of lines asked for is no longer reported as cut off.
- **The `forge-config` skill no longer reads "make the prompts go away" as permission to approve everything.** A general request like that now gets a one-sentence explanation and the narrow options (allow one named tool, or "Always allow" on a specific command) instead of a config that auto-approves `run_command` and file edits.

## [5.1.0] - 2026-10-22

### Added

- **Background sub-agents.** The model can start a sub-agent and keep working; results are collected later. A strip above the message box lists each agent with how long it has run, with **Stop**, **Stop all** and **Dismiss**. At most four run at once, a child never starts another, and a new chat stops and clears them.
- **MCP OAuth sign-in.** An HTTP MCP server that needs OAuth is listed as **Sign-in needed** instead of failing. Sign in from Settings > MCP or **Sign In to MCP Server**. Your browser opens only after you agree; tokens are kept in `~/.forge/mcp-auth` and refreshed automatically.
- **Skills from a URL.** A `skillPaths` entry can be an http(s) URL. Fetched skills are cached for a day and work offline; a host that fails is skipped with one warning.
- **Block display modes.** `display.blocks` sets how reasoning, terminal output, file edits and MCP results each show in the chat: hidden, collapsed or expanded.
- **Model picker favourites and price hints.** Every model row shows its context window and, where known, cost per million tokens. Star a model to pin it to a **Favourites** group.
- **Code actions.** **Add to Forge context** and **Improve with Forge** in the editor; **Explain Selected Terminal Output** and **Fix Selected Terminal Error** in the terminal. The clipboard is put back afterwards.
- **Open in Tab.** Open a second, independent chat in an editor tab, sharing the model, MCP servers and saved chats with the sidebar.
- **Built-in `forge-config` skill.** Ask Forge to change its own settings in plain language and it knows where each file lives, which keys only your user file may set, and to read before writing.
- **Import from Claude Code.** **Forge: Import from Claude Code** lists your Claude Code MCP servers, skills, sub-agents and slash commands and brings them into Forge. Nothing already in Forge is replaced, and an agent never gains a tool it had no equivalent for.
- **Extra CA certificates.** `forge.caCertificates` trusts extra PEM roots for company networks that re-sign TLS, for model calls as well as other traffic.
- **Language override.** `forge.language` sets the language of Forge's own text regardless of the VS Code display language.
- **Keep Awake.** `forge.keepAwake` stops the machine sleeping while a run is working.
- **Sound and desktop notification when a run ends.** `forge.notifications.sound` and `forge.notifications.osToast`.
- **Autocomplete controls.** `forge.completionEnabled` and `forge.completionAutomatic` turn autocomplete off or make it trigger-only, with a status bar item that snoozes and reports cost.
- **Code search controls.** A custom OpenAI-compatible embeddings endpoint, plus batch size, result limit, score threshold and file types.
- **Chat summaries in project memory.** `forge.memory.sessionDigest` saves a short summary of each finished chat as a dated section of the project memory.
- **`@chat:` mentions.** `@chat:last` adds your previous chat to the message; `@chat:<id start>` picks another.
- **Continue after Stop.** Stopping a run offers **Continue** next to Retry and Edit, and keeps what the model had already written.
- **Rename chats.** In History, a chat can be renamed and the name is searched.
- **Find in chat.** `Ctrl+F` / `Cmd+F` searches the conversation and opens a folded block to show a match.
- **JSON schema for the config files.** `~/.forge/config.json` and `.forge/config.json` get completion, hover help and warnings for unknown keys.
- **`/review` reviews your changes.** `/review`, `/review staged`, `/review unstaged`, `/review last` or `/review branch <base>`.
- **Your own prompts** for commit messages (`forge.commitMessage.prompt`) and the Enhance button (`forge.enhancePrompt.instruction`).
- **`apply_patch` tool.** Changes several files in one call, all or nothing, checked against your `edit` permission rules like any other edit.
- **Permission rules.** Ordered `allow`, `ask` or `deny` patterns in `~/.forge/config.json` and Settings > Permissions, checked command part by part.
- **Named providers.** Twenty presets plus your own `customProviders`, editable on a new **Providers** page in Settings. A project config cannot set a provider.
- **Settings for every `forge.*` setting.** Five new pages (Context and memory, Safety and cost, Tools and web, Git and quality, Advanced), each saving as you change a value.
- **Agents as Markdown files**, **Goals** (`/goal`), **Slash menu**, **Todo list**, **`/memory`** and the mode switcher on `Ctrl+.`.

### Fixed

- **Inline completion works again with MiniMax and on every line.** It asked for a model id MiniMax has since retired, and hid the error; it now uses a current model and says in Output > Forge why a suggestion did not appear. A cursor check that read a character from the top of the file instead of the one before the cursor is fixed.
- **Proxy and extra CA roots now reach model calls in VS Code.** The extension host's `fetch` ignored Forge's connection setup, so `forge.caCertificates` and your proxy had no effect on model calls there.
- **Security: `fetch_url` checks every redirect**, not just the first URL, and stops after five. `0.0.0.0`, `100.64.0.0/10`, IPv6 unique-local and hex-written mapped addresses are refused.
- **Security: file tools no longer follow a symlink or junction out of the workspace.** The workspace check now resolves links; a file named `..notes.md` is accepted.
- **Security: sub-agents keep your permission rules and tool sandbox**, and can now read — a child starts from what the parent may do without asking, while destructive tools are still refused.
- **Security (Windows): commands no longer run a program the repository ships.** `cmd.exe` searches the current folder before PATH; commands, hooks, `/run`, the terminal and language servers now skip the project folder.
- **Security: `search_files` can no longer freeze the editor.** A pattern with nested repeated groups is refused instead of backtracking.
- **Restoring a checkpoint never writes outside the project**, even from a damaged manifest.
- **`write_file` keeps a file's encoding.** A BOM is no longer dropped and a UTF-16 file is no longer garbled.
- **Saving settings can no longer wipe your config** when it could not be read; Forge refuses, says why and writes atomically.
- **You can see a patch before approving it.** Clicking a file on an `apply_patch` approval opens the proposed diff.
- **Files changed by `apply_patch` are handled like any other edit** by auto-lint, steering rules and the changed-file count.
- **Skills and slash commands no longer trigger the "big request" card.** Only what you actually typed is judged.
- **A sub-agent can read.** A child no longer has every read-only tool refused.
- **`hono` updated to 4.13.13** (GHSA-5r4p-p66f-jhc7).
- **Inline completion:** "N files changed" now counts every file in a patch.

## [5.0.0] - 2026-10-21

- **Licence change.** The VS Code extension moves from MIT to **AGPL-3.0-only**. The embedded engine `@ikarmic/forge-core` becomes proprietary and is free to run. Versions 4.5.0 and earlier stay MIT. See [NOTICE](https://github.com/ikarmicai/ikarmic-forge/blob/main/NOTICE).
- **Redesigned chat and Settings.** A shared visual language across both pages, grouped settings with a Reset button, Ask/Allow/Block permission buttons, a context meter, and accessible focus and contrast in dark, light and high-contrast themes.

## [4.5.0] - 2026-10-20

- **Live-mode UI work:** the chat transcript, approval cards, run cards and Settings were rebuilt for keyboard and screen-reader use, and checked against real VS Code themes.
- **Sub-agents**, **hooks** and **the spec/plan workflow** were finished and made available from the palette.
- **Checkpoint restore** was made safe and easier to read in the chat.

## [4.4.0] - 2026-09-30

- **Context compaction** and a cost meter in the chat.
- **Memory**, **steering files** and per-project instructions.
- **Verification**: Forge runs your project's own typecheck, lint and tests after edits, with Ask/On/Off.

[Unreleased]: https://github.com/ikarmicai/ikarmic-forge/compare/v5.1.1...HEAD
[5.1.1]: https://github.com/ikarmicai/ikarmic-forge/compare/v5.1.0...v5.1.1
[5.1.0]: https://github.com/ikarmicai/ikarmic-forge/compare/v5.0.0...v5.1.0
[5.0.0]: https://github.com/ikarmicai/ikarmic-forge/compare/v4.5.0...v5.0.0
[4.5.0]: https://github.com/ikarmicai/ikarmic-forge/compare/v4.4.0...v4.5.0
[4.4.0]: https://github.com/ikarmicai/ikarmic-forge/releases/tag/v4.4.0