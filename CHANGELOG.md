# Changelog

All notable changes to IKarmic Forge are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
