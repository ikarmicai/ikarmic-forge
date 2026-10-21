import { describe, expect, it } from 'vitest';

import type { AgentConfig, AgentEvent, AgentRunResult } from '@ikarmic/forge-core';

import { AcpServer, promptAttachments, promptToText, stopReasonFor, toolKind, type AcpDeps } from '../src/acp/server.js';

type Out = Record<string, any>;

function harness(run?: AcpDeps['runAgent']) {
  const out: Out[] = [];
  const configs: AgentConfig[] = [];
  const server = new AcpServer((l) => out.push(JSON.parse(l)), {
    createAgentConfig: (cwd) => ({ model: { provider: 'openai', model: 'm' }, cwd }) as AgentConfig,
    runAgent:
      run ??
      (async (config, opts) => {
        configs.push(config);
        opts.onEvent({ type: 'text_delta', text: 'hello ' } as AgentEvent);
        opts.onEvent({ type: 'text_delta', text: 'world' } as AgentEvent);
        return { reason: 'completed', messages: [{ role: 'user', content: opts.task }], finalText: 'hello world' } as unknown as AgentRunResult;
      }),
    agentInfo: { name: 'forge', version: '9.9.9' },
    newSessionId: (() => {
      let n = 0;
      return () => `s${++n}`;
    })(),
  });
  const send = (o: unknown) => server.handleLine(JSON.stringify(o));
  return { server, out, send, configs };
}

const req = (id: number, method: string, params: unknown = {}) => ({ jsonrpc: '2.0', id, method, params });

describe('ACP lifecycle', () => {
  it('initialize advertises protocol v1 and capabilities', async () => {
    const h = harness();
    await h.send(req(1, 'initialize', { protocolVersion: 1, clientCapabilities: {} }));
    expect(h.out[0]).toMatchObject({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1, agentInfo: { version: '9.9.9' } } });
    expect(h.out[0]!.result.agentCapabilities.promptCapabilities.embeddedContext).toBe(true);
  });

  it('session/new validates cwd and returns a session id', async () => {
    const h = harness();
    await h.send(req(1, 'session/new', {}));
    expect(h.out[0]!.error.code).toBe(-32602);
    await h.send(req(2, 'session/new', { cwd: '/w', mcpServers: [] }));
    expect(h.out[1]!.result).toEqual({ sessionId: 's1' });
  });

  it('streams text as agent_message_chunk updates, then answers end_turn', async () => {
    const h = harness();
    await h.send(req(1, 'session/new', { cwd: '/proj' }));
    await h.send(req(2, 'session/prompt', { sessionId: 's1', prompt: [{ type: 'text', text: 'hi' }] }));
    const updates = h.out.filter((m) => m.method === 'session/update');
    expect(updates.map((u) => u.params.update.content.text)).toEqual(['hello ', 'world']);
    expect(updates[0]!.params).toMatchObject({ sessionId: 's1', update: { sessionUpdate: 'agent_message_chunk' } });
    expect(h.out.at(-1)).toMatchObject({ id: 2, result: { stopReason: 'end_turn' } });
    expect(h.configs[0]!.cwd).toBe('/proj');
  });

  it('keeps conversation history across prompts in a session', async () => {
    const histories: unknown[] = [];
    const h = harness(async (_c, o) => {
      histories.push(o.history);
      return { reason: 'completed', messages: [{ role: 'user', content: o.task }], finalText: '' } as unknown as AgentRunResult;
    });
    await h.send(req(1, 'session/new', { cwd: '/w' }));
    await h.send(req(2, 'session/prompt', { sessionId: 's1', prompt: 'first' }));
    await h.send(req(3, 'session/prompt', { sessionId: 's1', prompt: 'second' }));
    expect(histories[0]).toBeUndefined();
    expect(histories[1]).toEqual([{ role: 'user', content: 'first' }]);
  });

  it('rejects prompts for unknown sessions, empty prompts, and unknown methods', async () => {
    const h = harness();
    await h.send(req(1, 'session/prompt', { sessionId: 'nope', prompt: 'x' }));
    expect(h.out[0]!.error.message).toMatch(/Unknown session/);
    await h.send(req(2, 'session/new', { cwd: '/w' }));
    await h.send(req(3, 'session/prompt', { sessionId: 's1', prompt: [] }));
    expect(h.out[2]!.error.message).toMatch(/Empty prompt/);
    await h.send(req(4, 'no/such'));
    expect(h.out[3]!.error.code).toBe(-32601);
  });

  it('survives malformed input and never replies to notifications', async () => {
    const h = harness();
    await h.server.handleLine('{not json');
    expect(h.out[0]!.error.code).toBe(-32700);
    await h.send({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: 'nope' } });
    await h.send({ jsonrpc: '2.0', method: 'no/such' });
    expect(h.out).toHaveLength(1);
  });
});

describe('ACP tools and permissions', () => {
  it('reports tool calls and results as tool_call / tool_call_update', async () => {
    const h = harness(async (_c, o) => {
      o.onEvent({ type: 'tool_call', id: 't1', name: 'read_file', args: { path: 'a.ts' } } as AgentEvent);
      o.onEvent({ type: 'tool_result', id: 't1', name: 'read_file', result: 'contents', isError: false } as AgentEvent);
      o.onEvent({ type: 'tool_result', id: 't2', name: 'run_command', result: 'boom', isError: true } as AgentEvent);
      return { reason: 'completed', messages: [], finalText: '' } as unknown as AgentRunResult;
    });
    await h.send(req(1, 'session/new', { cwd: '/w' }));
    await h.send(req(2, 'session/prompt', { sessionId: 's1', prompt: 'go' }));
    const u = h.out.filter((m) => m.method === 'session/update').map((m) => m.params.update);
    expect(u[0]).toMatchObject({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'read_file: a.ts', kind: 'read', status: 'in_progress' });
    expect(u[1]).toMatchObject({ sessionUpdate: 'tool_call_update', status: 'completed' });
    expect(u[1].content[0].content.text).toBe('contents');
    expect(u[2]).toMatchObject({ status: 'failed' });
  });

  it('asks the client for permission and honours the answer', async () => {
    let allowed: boolean | undefined;
    const h = harness(async (config, o) => {
      o.onEvent({ type: 'tool_call', id: 'w1', name: 'write_file', args: { path: 'x' } } as AgentEvent);
      allowed = await config.approve!({ id: 'w1', name: 'write_file', args: { path: 'x' }, destructive: true, description: '' } as never) as boolean;
      return { reason: 'completed', messages: [], finalText: '' } as unknown as AgentRunResult;
    });
    await h.send(req(1, 'session/new', { cwd: '/w' }));
    const done = h.send(req(2, 'session/prompt', { sessionId: 's1', prompt: 'go' }));
    await new Promise((r) => setTimeout(r, 20));
    const ask = h.out.find((m) => m.method === 'session/request_permission')!;
    expect(ask.params).toMatchObject({ sessionId: 's1', toolCall: { toolCallId: 'w1', kind: 'edit' } });
    expect(ask.params.options.map((o: { optionId: string }) => o.optionId)).toEqual(['allow', 'reject']);
    await h.send({ jsonrpc: '2.0', id: ask.id, result: { outcome: { outcome: 'selected', optionId: 'allow' } } });
    await done;
    expect(allowed).toBe(true);
  });

  it('reject, cancelled outcome, client error and closed transport all mean "no"', async () => {
    const answers: boolean[] = [];
    const h = harness(async (config) => {
      for (let i = 0; i < 3; i++) answers.push((await config.approve!({ id: `t${i}`, name: 'run_command', args: {}, destructive: true, description: '' } as never)) as boolean);
      return { reason: 'completed', messages: [], finalText: '' } as unknown as AgentRunResult;
    });
    await h.send(req(1, 'session/new', { cwd: '/w' }));
    const done = h.send(req(2, 'session/prompt', { sessionId: 's1', prompt: 'go' }));
    const reply = async (i: number, payload: Record<string, unknown>) => {
      await new Promise((r) => setTimeout(r, 15));
      const asks = h.out.filter((m) => m.method === 'session/request_permission');
      await h.send({ jsonrpc: '2.0', id: asks[i]!.id, ...payload });
    };
    await reply(0, { result: { outcome: { outcome: 'selected', optionId: 'reject' } } });
    await reply(1, { result: { outcome: { outcome: 'cancelled' } } });
    await reply(2, { error: { code: -1, message: 'nope' } });
    await done;
    expect(answers).toEqual([false, false, false]);
  });
});

describe('ACP cancellation', () => {
  it('session/cancel aborts the running prompt, which answers cancelled', async () => {
    const h = harness(
      (_c, o) =>
        new Promise((resolve) => {
          o.abortSignal.addEventListener('abort', () => resolve({ reason: 'aborted', messages: [], finalText: '' } as unknown as AgentRunResult));
        })
    );
    await h.send(req(1, 'session/new', { cwd: '/w' }));
    const done = h.send(req(2, 'session/prompt', { sessionId: 's1', prompt: 'long' }));
    await new Promise((r) => setTimeout(r, 10));
    await h.send({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: 's1' } });
    await done;
    expect(h.out.find((m) => m.id === 2)).toMatchObject({ result: { stopReason: 'cancelled' } });
  });

  it('refuses a second concurrent prompt in the same session', async () => {
    const h = harness((_c, o) => new Promise((resolve) => o.abortSignal.addEventListener('abort', () => resolve({ reason: 'aborted', messages: [], finalText: '' } as unknown as AgentRunResult))));
    await h.send(req(1, 'session/new', { cwd: '/w' }));
    const first = h.send(req(2, 'session/prompt', { sessionId: 's1', prompt: 'a' }));
    await new Promise((r) => setTimeout(r, 10));
    await h.send(req(3, 'session/prompt', { sessionId: 's1', prompt: 'b' }));
    expect(h.out.find((m) => m.id === 3)!.error.message).toMatch(/already running/);
    h.server.close();
    await first;
  });
});

describe('ACP helpers', () => {
  it('flattens content blocks', () => {
    expect(
      promptToText([
        { type: 'text', text: 'explain this' },
        { type: 'resource', resource: { uri: 'file:///a.ts', text: 'const a = 1' } },
        { type: 'resource_link', name: 'b.ts', uri: 'file:///b.ts' },
        { type: 'image', data: 'x' },
      ])
    ).toBe('explain this\n\n<context path="file:///a.ts">\nconst a = 1\n</context>\n\n@b.ts (file:///b.ts)');
    expect(promptToText('plain')).toBe('plain');
    expect(promptToText(undefined)).toBe('');
  });

  it('turns image blocks and binary resources into attachments', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]).toString('base64');
    const pdf = Buffer.from('%PDF-1.4\n\0').toString('base64');
    const atts = promptAttachments([
      { type: 'text', text: 'what is this' },
      { type: 'image', mimeType: 'image/png', data: png },
      { type: 'resource', resource: { uri: 'file:///docs/spec.pdf', mimeType: 'application/pdf', blob: pdf } },
      { type: 'image', mimeType: 'image/png', data: '' },
    ]);
    expect(atts.map((a) => [a.name, a.mediaType])).toEqual([
      ['attachment-1', 'image/png'],
      ['spec.pdf', 'application/pdf'],
    ]);
    expect(promptAttachments('plain')).toEqual([]);
  });

  it('maps stop reasons and tool kinds', () => {
    expect(stopReasonFor('aborted')).toBe('cancelled');
    expect(stopReasonFor('max_iterations')).toBe('max_turn_requests');
    expect(stopReasonFor('completed')).toBe('end_turn');
    expect(toolKind('edit_file')).toBe('edit');
    expect(toolKind('run_command')).toBe('execute');
    expect(toolKind('some_mcp_tool')).toBe('other');
  });
});
