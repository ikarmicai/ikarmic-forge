# `forge` (IKarmic AI Forge CLI)

The terminal companion to the Forge agent engine. One-shot task runner with autonomous mode, streaming output, and a y/n approval prompt for destructive tools.

See the top-level [README.md](../../README.md) for full usage docs. Quick start:

```bash
export ANTHROPIC_API_KEY=...
forge "summarize src/index.ts"
forge --auto "run the tests and fix any failures"
```

JSON streaming mode for piping into other tools:

```bash
forge --auto --json "rename getUserById to fetchUser" | jq 'select(.type=="tool_call")'
```

## Skill and hook subcommands

The CLI auto-discovers skills from `./skills/`, `./.forge/skills/`, and
`~/.forge/skills/` on every run. The same applies to lifecycle hooks
from `~/.forge/settings.json` and `./.forge/settings.json`. Inspect them
with:

```bash
forge skill list                       # every discovered SKILL.md
forge skill show commit-message        # body + source path
forge skill install <github-url>       # scaffold a SKILL.md stub
forge skill browse                     # print the marketplace catalog

forge hook list                        # every configured hook
forge hook test PreToolUse run_command # dispatch a synthetic event
forge hook test Stop                   # a non-tool event

forge memory list                      # every memory section: scope, type, date, heading
forge memory check                     # flag sections whose refs are gone and likely duplicates (exit 1 if stale)
forge memory forget "Package manager"  # remove a section; add --global for ~/.forge/MEMORY.md
```

See the [Skills system](../../README.md#skills-system) and
[Lifecycle hooks](../../README.md#lifecycle-hooks) sections of the root
README for the full format reference.

## Sandbox flags

The CLI exposes the agent's sandbox as command-line flags for one-off use. Useful when you want a tighter constraint set than your default config, e.g. when running against an unfamiliar codebase or letting an LLM loose on a single directory:

```bash
# Only let the agent read/list/search under src/, refuse everything under secrets/
forge --allow-paths "src/**" --deny-paths "**/secrets/**,*.env" "summarize this project"

# Read-only mode: expose only read-only tools
forge --allow-tools "read_file,list_files,search_files" "audit this codebase"

# Restrict shell to npm/pnpm; deny network calls
forge --allow-commands "^(npm|pnpm|node)\b" --deny-tools "fetch_url" "install deps and run tests"

# Only allow HTTPS docs endpoints
forge --allow-urls "^https://(docs|api)\.example\.com" "fetch the latest changelog"
```

All flags accept comma-separated lists. Paths use POSIX-style globs (`*`, `**`, `?`); commands and URLs are matched as JavaScript regexes. Run `forge --help` for the full list.
