# Changelog

All notable changes to IKarmic Forge are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [5.3.0] - 2026-10-27

### Added
- **Agent Manager.** Run one prompt as up to four sessions at once, each in its own git worktree; merge the one you want or discard it.
- **Command sandbox (Linux and macOS).** Commands can write only to the workspace and the temp folder, with the network cut unless allowed.
- **`/cmd`.** Describe what you want and Forge writes one shell command you can insert into the terminal; it never runs it for you.
- **First-run approval choice, shortcuts and prompt history.** Pick how much Forge asks before acting, cycle modes with `Ctrl+Alt+M`, toggle Accept edits with `Ctrl+Alt+A`, and recall earlier prompts with Up and Down.
- **Up-to-date model limits and prices** from models.dev, with an offline copy.
- **Commit message language** and a **step limit** setting for chat runs.

### Changed
- **Long chat runs finish cleanly.** There is no time limit on a chat run, and a run that reaches its step limit summarises what is left and offers Continue.
- **Provider errors are retried** instead of ending the run, and a reply that is empty is asked for again.
- **Autonomous means no approval cards**, while your permission rules and organisation policy still apply.

### Fixed
- Multi-line edits to files with Windows line endings.
- A slow search could freeze the editor; it is now stopped after 20 seconds.

## [5.2.0] - 2026-10-25

### Added
- **Smarter built-in agents.** Plan, Code, Debug, Ask and Review each follow an explicit method now. Plan traces every caller and test and says whether its plan is small or large; Code reads the versions your project uses and the installed library API, then runs your project's own checks; Debug reproduces the failure first; Ask answers with `path:line`; Review reads the real diff and confirms each finding.
- **Security agent.** A new built-in agent that audits your changes or the whole repository for exploitable problems and vulnerable dependencies, and changes files only for the findings you name.
- **`git_diff` and `dependency_audit` tools.** `git_diff` shows the current changes without an approval card. `dependency_audit` runs the project's own auditor and asks first, because an auditor follows the project's settings and sends the dependency list to a registry.
- **Version facts for every agent.** The runtime, language and library versions your workspace's files state, plus its test runner, linter and formatter, are given to the model.
- **Approval picker in the chat composer.** Ask first, Accept edits (file edits run without asking; commands still ask) or Autonomous.
- **A large plan can become a spec.** When Plan says a plan is large, the chat offers to draft a spec from it.

### Fixed
- **Orchestrator steps could not read, and Code could use every tool.** Each step now gets exactly its agent's tools, runs read-only tools without asking, keeps your permission rules and sandbox, and sees what earlier steps produced.
- **Symbol tools hung in VS Code.** `find_symbol`, `find_references` and `list_symbols` never answered in the extension. The extension now ships tree-sitter and its language grammars, which grows it from 2.45 MB to 3.29 MB.
- **A custom agent that reuses a built-in id was listed twice, and the built-in ran.** It is now one mode and your version runs.

### Notes
- **If you copied a built-in agent into your own agents file, check it.** An agent in `~/.forge/specialists.json` with the same id as a built-in (`plan`, `code`, `debug`, `ask`, `review`) replaces the built-in, so you keep the old prompt and do not get the new one. Delete your copy to get the new agent. The mode menu now lists such an agent once, and runs your version (before, it listed both and ran the built-in).

## [5.1.1] - 2026-10-24

### Changed
- **A rewritten agent prompt.** The instructions Forge gives the model by default are rewritten: do exactly what was asked, check the result with your project's own tests, ask before anything hard to undo, and use the dedicated tool before a shell command. The model is also told the operating system, shell, working folder and date, so it stops guessing between `cat` and `type` on Windows. The prompt is about 850 tokens longer per request.
- **Marketplace listing.** The VS Code Overview, description, keywords and Version History were corrected: working links, no stale install step, and the full command and keybinding lists.

### Fixed
- **`read_file` counted a line that is not there.** A file ending in a newline was reported with one extra, empty last line (a 37-line file read as 38), so the model could be told the file ends in a blank line. A file holding exactly the number of lines asked for is no longer reported as cut off.
- **The `forge-config` skill no longer reads "make the prompts go away" as permission to approve everything.** A general request like that now gets a one-sentence explanation and the narrow options (allow one named tool, or "Always allow" on a specific command) instead of a config that auto-approves `run_command` and file edits.

## [5.1.0] - 2026-10-22

### Added
- **Agents and sub-agents**: agents as Markdown files (`~/.forge/agents`, `.forge/agents`), background sub-agents with a strip to stop them, a separate `subagentModel`, `@name` to hand a task to an agent, and the `/goal` loop.
- **Providers and models**: twenty named provider presets plus your own `customProviders`, a Providers page in Settings, favourites and price hints in the model picker, `/variant` for reasoning effort, and extra CA certificates (`caCertificates`) for networks that re-sign TLS.
- **MCP**: OAuth sign-in (`forge mcp login`, Sign in in Settings), per-server `timeout`, server `instructions`, and `mcp_list_resources` / `mcp_read_resource`.
- **Skills and commands**: skills as slash commands, skills from a URL in `skillPaths`, a built-in `forge-config` skill, `/reload`, workflow front matter for commands, and **Import from Claude Code**.
- **Editing**: an `apply_patch` tool for multi-file edits, files with a byte-order mark keep their encoding, and a diff preview before a patch is approved.
- **Safety**: ordered permission rules (`allow`, `ask`, `deny`) for tools and shell commands, a project config that can only tighten settings, and a todo list and `ask_user` questions.
- **Chat and editor**: slash menu, Find in chat, Continue after Stop, Rename chats, Open in Tab, Add to Context / Improve / terminal Fix and Explain code actions, `@chat:` mentions, block display modes, `/review` for your changes, and `/memory add | list | forget`.
- **Autocomplete, notifications, language**: controls and a snooze for inline completion, a sound and a desktop notification when a run ends, Keep Awake, and `forge.language`.
- **Settings**: a row for every `forge.*` setting, and a JSON schema for the config files.

### Fixed
- **Security**: on Windows, commands no longer run a program the repository ships; `fetch_url` checks every redirect; file tools do not follow a link out of the workspace; sub-agents keep your permission rules and tool sandbox; restoring a checkpoint never writes outside the project.
- Saving settings can no longer wipe `~/.forge/config.json`; `search_files` can no longer freeze the editor on a runaway pattern; parallel steps no longer lose their worktree at random.
- Inline completion works again with MiniMax and on every line; proxy and extra CA roots now reach model calls in VS Code; `hono` is updated to 4.13.13.

## [5.0.0] - 2026-10-21

- **Licence change.** The VS Code extension, the CLI and the eval harness are now open source under AGPL-3.0-only. The core engine (`@ikarmic/forge-core`) is proprietary and free to run with them. See `LICENSE` and `NOTICE`.
- Versions 4.5.0 and earlier were released under the MIT License and stay under it.
- Contributions need agreement to `CLA.md`.

### Added
- **Loop guard**: `--loop-guard <n>` (CLI), `forge.loopGuardThreshold` (VS Code) or `loopGuardThreshold` (core `AgentConfig`) stops a run that repeats one identical tool call that many times in a row. The run ends with reason `loop_detected` and emits a `loop_detected` event naming the tool. Off by default (0).
- **Model per mode** (VS Code): `modeModels` in the shared config (`mode id → provider:model`, model id or alias) gives a chat mode a model when its specialist names none; a Settings row edits it. An unusable model shows a warning and the run uses the main model.
- **Run-end notifications** (VS Code): `forge.notifications.enabled` shows a notification when a run finishes, for runs longer than `forge.notifications.minSeconds` (default 20). Off by default.
- **`forge session prune --older-than <days> [--dry-run]`** deletes saved sessions not updated for that long. `sessionRetentionDays` in the shared config does the same when the VS Code extension starts; unset keeps everything.
- **Enhance prompt** (VS Code): a button in the chat composer rewrites your draft into a clearer request with the cheap model, and the change can be undone. A reply that arrives after you edited the draft is not applied.
- **Generate commit message** (VS Code): a command in the Source Control panel drafts a message for the staged changes, or the working changes when nothing is staged, and puts it in the message box. Without a usable model it falls back to a file-list message.

### Fixed
- Models that return their reasoning inline (`<think>…</think>`, as MiniMax does) no longer leak it into Enhance, commit messages, inline completion, inline edit or context compaction. A reply that is only reasoning is treated as empty and never replaces the selection or the conversation history.
