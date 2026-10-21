# Forge over the Agent Client Protocol (ACP)

`forge acp` makes Forge an ACP agent: an ACP-capable editor starts it as a subprocess and talks JSON-RPC 2.0 over stdin/stdout (one JSON message per line). This is how Forge reaches **JetBrains AI Chat**, **Zed** and other ACP clients without a native plugin.

```bash
forge acp
```

stdout carries protocol messages only; diagnostics go to stderr.

## Configure your editor

The exact file and keys are defined by each editor, so check its ACP documentation. The shape is the same everywhere: a command and arguments.

- **Zed**: add an entry under `agent_servers` in `settings.json` with `"command": "forge"` and `"args": ["acp"]`.
- **JetBrains (AI Assistant)**: add a custom agent whose command is `forge` and whose arguments are `acp` (an `acp.json` file with an `agent_servers` map, or through the agent registry UI, depending on your IDE version).

Set your provider through the usual environment variables (`ANTHROPIC_API_KEY`, ...) or `forge config` before starting the editor; the process inherits them. Requires Node 22+.

## What is implemented (protocol version 1)

| Direction | Message |
| --- | --- |
| client to agent | `initialize`, `session/new`, `session/prompt`, `session/cancel` |
| agent to client | `session/update` with `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update` |
| agent to client | `session/request_permission` (options `allow` / `reject`) |

Behavior:

- A session keeps its conversation history for the life of the process.
- Prompts accept text, embedded resources and resource links. Images and audio are not advertised.
- Every tool call that needs approval asks the client. No answer, a rejection, a cancelled dialog or a dropped connection all count as "no".
- `session/cancel` aborts the running turn, which then answers `stopReason: "cancelled"`.
- Not implemented yet: `session/load` (resuming a saved session), client-side file and terminal delegation, slash-command advertisement.

The implementation follows the public ACP specification as we understand it. If a client reports a mismatch, please open an issue with the message trace.

## Try it by hand

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}' \
  '{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"/path/to/project"}}' \
  | forge acp
```
