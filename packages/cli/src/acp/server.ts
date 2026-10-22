/**
 * Agent Client Protocol (ACP) server: lets an ACP client (JetBrains AI Chat,
 * Zed, Neovim plugins...) drive Forge over JSON-RPC 2.0 on newline-delimited
 * stdio. Transport-agnostic: the caller feeds lines in via {@link AcpServer.handleLine}
 * and receives lines through the `write` callback.
 *
 * Implemented (protocol version 1): initialize, session/new, session/prompt,
 * session/cancel; agent -> client: session/update (message, thought, tool_call,
 * tool_call_update) and session/request_permission.
 */
import { makeAttachment, type AgentConfig, type AgentEvent, type AgentRunResult, type ApprovalRequest, type Attachment } from '@ikarmic/forge-core';

export const ACP_PROTOCOL_VERSION = 1;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type RpcId = number | string;

interface RpcMessage {
  jsonrpc?: string;
  id?: RpcId;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Everything the server needs from the outside world. */
export interface AcpDeps {
  /** Build the agent config for a session (model, tools, sandbox...). approve/abort are added by the server. */
  createAgentConfig(cwd: string, sessionId: string): Promise<AgentConfig> | AgentConfig;
  /** Run one agent turn. Defaults to core's Agent; injectable for tests. */
  runAgent(config: AgentConfig, options: { task: string; history?: AgentRunResult['messages']; abortSignal: AbortSignal; onEvent: (e: AgentEvent) => void }): Promise<AgentRunResult>;
  agentInfo?: { name: string; version: string };
  newSessionId?: () => string;
}

interface Session {
  id: string;
  cwd: string;
  history: AgentRunResult['messages'] | undefined;
  controller: AbortController | undefined;
}

const MAX_TOOL_TEXT = 4000;

export class AcpServer {
  private readonly sessions = new Map<string, Session>();
  private readonly pending = new Map<RpcId, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextRequestId = 1;
  private counter = 0;

  constructor(
    private readonly write: (line: string) => void,
    private readonly deps: AcpDeps
  ) {}

  /** Feed one line of input. Never throws. */
  async handleLine(line: string): Promise<void> {
    if (!line.trim()) return;
    let msg: RpcMessage;
    try {
      msg = JSON.parse(line) as RpcMessage;
    } catch {
      this.send({ jsonrpc: '2.0', id: null as unknown as number, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    // A reply to something we asked the client (e.g. session/request_permission).
    if (msg.id !== undefined && msg.method === undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
      return;
    }
    if (!msg.method) return;
    const isRequest = msg.id !== undefined;
    try {
      const result = await this.dispatch(msg.method, msg.params ?? {});
      if (isRequest) this.send({ jsonrpc: '2.0', id: msg.id!, result: result as Json });
    } catch (err) {
      if (!isRequest) return; // notifications get no reply
      const e = err as Error & { code?: number };
      this.send({ jsonrpc: '2.0', id: msg.id!, error: { code: e.code ?? -32603, message: e.message } });
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: ACP_PROTOCOL_VERSION,
          agentCapabilities: { loadSession: false, promptCapabilities: { image: true, audio: false, embeddedContext: true } },
          agentInfo: this.deps.agentInfo ?? { name: 'forge', version: '0.0.0' },
          authMethods: [],
        };
      case 'session/new': {
        const cwd = params.cwd;
        if (typeof cwd !== 'string' || !cwd) throw rpcError(-32602, 'session/new requires a cwd');
        const id = this.deps.newSessionId?.() ?? `forge-acp-${Date.now().toString(36)}-${++this.counter}`;
        this.sessions.set(id, { id, cwd, history: undefined, controller: undefined });
        return { sessionId: id };
      }
      case 'session/prompt':
        return this.prompt(params);
      case 'session/cancel': {
        this.sessions.get(String(params.sessionId))?.controller?.abort();
        return null;
      }
      default:
        throw rpcError(-32601, `Method not found: ${method}`);
    }
  }

  private async prompt(params: Record<string, unknown>): Promise<{ stopReason: string }> {
    const session = this.sessions.get(String(params.sessionId));
    if (!session) throw rpcError(-32602, `Unknown session ${String(params.sessionId)}`);
    if (session.controller) throw rpcError(-32602, 'A prompt is already running for this session');
    const attachments = promptAttachments(params.prompt);
    const task = promptToText(params.prompt) || (attachments.length > 0 ? 'See the attached files.' : '');
    if (!task.trim()) throw rpcError(-32602, 'Empty prompt');

    const controller = new AbortController();
    session.controller = controller;
    const config = await this.deps.createAgentConfig(session.cwd, session.id);
    const toolTitles = new Map<string, string>();
    const update = (u: Record<string, unknown>): void => this.notify('session/update', { sessionId: session.id, update: u });

    try {
      const result = await this.deps.runAgent(
        {
          ...config,
          cwd: session.cwd,
          approve: (req) => this.askPermission(session.id, req, toolTitles.get(req.id)),
        },
        {
          task,
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(session.history ? { history: session.history } : {}),
          abortSignal: controller.signal,
          onEvent: (e) => {
            switch (e.type) {
              case 'text_delta':
                update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: e.text } });
                return;
              case 'reasoning_delta':
                update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: e.text } });
                return;
              case 'tool_call': {
                const title = `${e.name}${summarize(e.args)}`;
                toolTitles.set(e.id, title);
                update({ sessionUpdate: 'tool_call', toolCallId: e.id, title, kind: toolKind(e.name), status: 'in_progress', rawInput: e.args as Json });
                return;
              }
              case 'tool_result':
                update({
                  sessionUpdate: 'tool_call_update',
                  toolCallId: e.id,
                  status: e.isError ? 'failed' : 'completed',
                  content: [{ type: 'content', content: { type: 'text', text: clip(stringify(e.result)) } }],
                });
                return;
              default:
                return;
            }
          },
        }
      );
      session.history = result.messages;
      return { stopReason: stopReasonFor(result.reason) };
    } finally {
      session.controller = undefined;
    }
  }

  private async askPermission(sessionId: string, req: ApprovalRequest, title: string | undefined): Promise<boolean> {
    try {
      const res = (await this.request('session/request_permission', {
        sessionId,
        toolCall: { toolCallId: req.id, title: title ?? req.name, kind: toolKind(req.name), status: 'pending', rawInput: req.args as Json },
        options: [
          { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
          { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
        ],
      })) as { outcome?: { outcome?: string; optionId?: string } } | undefined;
      return res?.outcome?.outcome === 'selected' && res.outcome.optionId === 'allow';
    } catch {
      return false; // no answer means no permission
    }
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: '2.0', id, method, params: params as Json });
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.send({ jsonrpc: '2.0', method, params: params as Json });
  }

  private send(msg: unknown): void {
    this.write(JSON.stringify(msg));
  }

  /** Abort every running prompt and fail outstanding client requests (call when the transport closes). */
  close(): void {
    for (const s of this.sessions.values()) s.controller?.abort();
    for (const p of this.pending.values()) p.reject(new Error('connection closed'));
    this.pending.clear();
  }
}

function rpcError(code: number, message: string): Error & { code: number } {
  return Object.assign(new Error(message), { code });
}

/** ACP content blocks -> the plain-text task Forge runs. */
export function promptToText(prompt: unknown): string {
  if (typeof prompt === 'string') return prompt;
  if (!Array.isArray(prompt)) return '';
  const parts: string[] = [];
  for (const block of prompt as Array<Record<string, unknown>>) {
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (block.type === 'resource') {
      const r = block.resource as { uri?: string; text?: string } | undefined;
      if (r?.text !== undefined) parts.push(`<context path="${String(r.uri ?? '')}">\n${r.text}\n</context>`);
    } else if (block.type === 'resource_link') {
      parts.push(`@${String(block.name ?? block.uri ?? '')} (${String(block.uri ?? '')})`);
    }
  }
  return parts.join('\n\n');
}

/** ACP image blocks and embedded binary resources -> attachments sent to the model natively. */
export function promptAttachments(prompt: unknown): Attachment[] {
  if (!Array.isArray(prompt)) return [];
  const out: Attachment[] = [];
  for (const block of prompt as Array<Record<string, unknown>>) {
    let data: unknown;
    let mime: unknown;
    let uri: unknown;
    if (block.type === 'image') {
      ({ data, mimeType: mime, uri } = block);
    } else if (block.type === 'resource') {
      const r = block.resource as { uri?: string; blob?: string; mimeType?: string } | undefined;
      ({ blob: data, mimeType: mime, uri } = r ?? {});
    }
    if (typeof data !== 'string' || data.length === 0) continue;
    const name = typeof uri === 'string' && uri ? uri.split(/[\\/]/).pop()! : `attachment-${out.length + 1}`;
    try {
      out.push(makeAttachment(name, Buffer.from(data, 'base64'), typeof mime === 'string' ? mime : undefined));
    } catch {
      // Unattachable (empty, too large): the text part of the prompt still runs.
    }
  }
  return out;
}

export function stopReasonFor(reason: string): string {
  switch (reason) {
    case 'aborted':
      return 'cancelled';
    case 'max_iterations':
    case 'max_duration':
    case 'budget_exceeded':
    case 'loop_detected':
      return 'max_turn_requests';
    default:
      return 'end_turn';
  }
}

export function toolKind(name: string): string {
  if (name === 'read_file' || name === 'read_image' || name === 'list_files' || name === 'memory_read') return 'read';
  if (name === 'write_file' || name === 'edit_file' || name === 'edit_notebook' || name === 'apply_patch' || name === 'memory_write' || name === 'memory_forget') return 'edit';
  if (name === 'run_command') return 'execute';
  if (name === 'fetch_url' || name === 'github_pr_read' || name === 'web_search' || name.startsWith('browser')) return 'fetch';
  if (name === 'search_files' || name === 'find_symbol' || name === 'list_symbols' || name === 'find_references' || name === 'codebase_search') return 'search';
  return 'other';
}

function summarize(args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  const hint = a.path ?? a.command ?? a.pattern ?? a.query ?? a.url ?? a.name;
  return typeof hint === 'string' ? `: ${hint.slice(0, 80)}` : '';
}

function stringify(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

function clip(s: string): string {
  return s.length > MAX_TOOL_TEXT ? `${s.slice(0, MAX_TOOL_TEXT)}\n... (truncated)` : s;
}
