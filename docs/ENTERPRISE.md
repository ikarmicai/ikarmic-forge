# Enterprise: policy, audit, proxy

Forge can be constrained by an administrator without any change to user settings.

## Organization policy

Drop a JSON file at the managed location. It is read by the CLI, the VS Code extension and `forge acp`, and enforced inside the agent, so every surface obeys it.

| OS | Path |
| --- | --- |
| Windows | `%ProgramData%\Forge\policy.json` |
| macOS | `/Library/Application Support/Forge/policy.json` |
| Linux | `/etc/forge/policy.json` |

`FORGE_POLICY_FILE` overrides the path (useful for testing and CI). These locations are writable only by administrators on a managed machine, which is what stops a user editing their way out of the policy.

```json
{
  "version": 1,
  "allowedProviders": ["azure", "bedrock"],
  "deniedTools": ["run_command", "fetch_url"],
  "allowedMcpServers": ["git", "filesystem"],
  "disableBrowser": true,
  "disableAutonomous": true,
  "maxCostUsdPerRun": 5,
  "audit": { "enabled": true, "file": "/var/log/forge/audit.log" },
  "proxy": { "https": "http://proxy.corp:8080", "noProxy": "localhost,.corp" }
}
```

| Field | Effect |
| --- | --- |
| `allowedProviders` | Only these providers can run. Others fail with a clear error, including inline completions. |
| `deniedTools` | Added to every sandbox; the model cannot call these tools. |
| `allowedMcpServers` | Only these MCP server names connect. `[]` blocks all. |
| `disableBrowser` | The browser tools are never registered. |
| `disableAutonomous` | Every tool call needs approval, whatever the user enables. |
| `maxCostUsdPerRun` | Hard per-run ceiling. A user's own `--max-cost` can only be lower. |
| `audit` | Turns on the audit log (below). |
| `proxy` | Proxy for all model and MCP traffic; wins over environment variables. |

Rules of the design:

- **Policy only tightens.** It never grants something a user's own settings deny.
- **It fails closed.** If the file exists but is unreadable or invalid (including an unknown key, so a typo cannot silently disable a rule), Forge refuses to run and says why. A missing file means no policy.
- Run `forge policy` to see which file is active and its contents.

## Audit log

When enabled, Forge appends one JSON object per line:

```json
{"ts":"2026-09-30T14:03:11.204Z","user":"alice","cwd":"/work/app","session":"...","event":"tool_call","tool":"write_file","args":{"path":"src/a.ts"},"approved":true,"auto":false}
```

Events: `run_start`, `tool_call` (with the approval decision), `tool_result` (error flag and duration), `run_end` (reason, iterations, cost). Arguments pass through secret redaction and are truncated; file contents and command output are never stored. A log that cannot be written never stops the agent. Individual users can turn it on without a policy: `forge --audit ...` or the `forge.audit.enabled` VS Code setting write to `~/.forge/audit.log`.

## Proxy

`HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` (either case) are honored for model calls, `fetch_url` and MCP HTTP transports. The VS Code extension also reads its `http.proxy` setting. Precedence: policy, then VS Code setting, then environment.

Note: Node's built-in `fetch` ignores these variables on its own; Forge installs a global dispatcher at startup so it does not.
