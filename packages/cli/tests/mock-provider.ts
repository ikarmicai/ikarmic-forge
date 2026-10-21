/**
 * Local copy of the mock LanguageModelV4 used to drive the agent without hitting real APIs.
 *
 * The mock implements a queue-driven response system: push responses with
 * {@link MockLanguageModelV1.pushResponse}, and the model will deliver them
 * in order on successive calls. Each response becomes a stream of
 * `text-start`/`text-delta`/`text-end` chunks, optional `tool-call` chunks,
 * and a final `finish` chunk with usage info.
 *
 * The shape matches the Vercel AI SDK's LanguageModelV4 protocol, so the
 * real `streamText` integration handles the mock the same way as a real
 * provider. This lets us exercise the full agent loop (multi-step, tool
 * approval, abort, error handling) without network calls.
 */
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';

export interface MockToolCallSpec {
  id?: string;
  name: string;
  args: unknown;
}

export interface MockResponse {
  /** Plain text to deliver as text-delta chunks (split into a few per call). */
  text?: string;
  /** Reasoning text to deliver as reasoning-start/delta/end chunks, before the text chunks. */
  reasoning?: string;
  /** Tool calls to emit before the finish chunk. */
  toolCalls?: MockToolCallSpec[];
  /** Finish reason. Defaults to `stop` (or `tool-calls` if toolCalls is set). */
  finishReason?: 'stop' | 'tool-calls' | 'length' | 'content-filter' | 'error' | 'other';
  promptTokens?: number;
  completionTokens?: number;
  /** Part of promptTokens served from the prompt cache. */
  cacheReadTokens?: number;
  /** Part of promptTokens written to the prompt cache. */
  cacheWriteTokens?: number;
}

interface MockCallRecord {
  prompt?: unknown;
  messages?: unknown;
  tools?: unknown;
  reasoning?: LanguageModelV4CallOptions['reasoning'];
}

/** Build the v4 provider-level usage shape from the flat prompt/completion counts we track. */
function buildUsage(promptTokens: number, completionTokens: number, cacheRead = 0, cacheWrite = 0) {
  return {
    inputTokens: {
      total: promptTokens,
      noCache: Math.max(0, promptTokens - cacheRead - cacheWrite),
      cacheRead: cacheRead > 0 ? cacheRead : undefined,
      cacheWrite: cacheWrite > 0 ? cacheWrite : undefined,
    },
    outputTokens: { total: completionTokens, text: completionTokens, reasoning: undefined },
  };
}

/** Build the v4 provider-level finish-reason shape from our plain-string MockResponse field. */
function buildFinishReason(reason: NonNullable<MockResponse['finishReason']>) {
  return { unified: reason, raw: undefined };
}

export class MockLanguageModelV1 implements LanguageModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'mock';
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  /**
   * Default response when the queue is empty (used to keep the loop going
   * if a test forgets to enqueue a response). Defaults to a polite "done".
   */
  defaultResponse: MockResponse = { text: 'mock: done', finishReason: 'stop' };

  /** Recorded calls so tests can assert on what the agent sent. */
  readonly calls: MockCallRecord[] = [];

  /** The full call options from the most recent `doStream`/`doGenerate` call. */
  lastCallOptions: LanguageModelV4CallOptions | undefined;

  private queue: MockResponse[] = [];

  constructor(modelId = 'mock-model') {
    this.modelId = modelId;
  }

  /** Queue a response that will be delivered on the next `doStream`/`doGenerate` call. */
  pushResponse(response: MockResponse): this {
    this.queue.push(response);
    return this;
  }

  /** Convenience: queue many responses at once. */
  pushResponses(responses: MockResponse[]): this {
    for (const r of responses) this.queue.push(r);
    return this;
  }

  async doGenerate(options: LanguageModelV4CallOptions): Promise<{
    content: Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: string }>;
    finishReason: ReturnType<typeof buildFinishReason>;
    usage: ReturnType<typeof buildUsage>;
    warnings: [];
  }> {
    this.record(options);
    const r = this.takeResponse();
    const content: Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: string }> = [];
    if (r.text) content.push({ type: 'text', text: r.text });
    for (const [i, tc] of (r.toolCalls ?? []).entries()) {
      content.push({
        type: 'tool-call',
        toolCallId: tc.id ?? `mock-call-${this.calls.length}-${i}`,
        toolName: tc.name,
        input: JSON.stringify(tc.args),
      });
    }
    const promptTokens = r.promptTokens ?? 0;
    const completionTokens = r.completionTokens ?? (r.text?.length ?? 0);
    return {
      content,
      finishReason: buildFinishReason(r.finishReason ?? (r.toolCalls?.length ? 'tool-calls' : 'stop')),
      usage: buildUsage(promptTokens, completionTokens, r.cacheReadTokens, r.cacheWriteTokens),
      warnings: [],
    };
  }

  async doStream(options: LanguageModelV4CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV4StreamPart>;
  }> {
    this.record(options);
    const response = this.takeResponse();

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start: (controller) => {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        if (response.reasoning) {
          const reasoningId = `reasoning-${this.calls.length}`;
          controller.enqueue({ type: 'reasoning-start', id: reasoningId });
          for (const chunk of chunkText(response.reasoning, 6)) {
            controller.enqueue({ type: 'reasoning-delta', id: reasoningId, delta: chunk });
          }
          controller.enqueue({ type: 'reasoning-end', id: reasoningId });
        }
        const text = response.text ?? '';
        if (text) {
          const textId = `text-${this.calls.length}`;
          controller.enqueue({ type: 'text-start', id: textId });
          // Split into a few chunks so the stream feels realistic. Don't go
          // too fine-grained — we just need token-delta events to fire.
          for (const chunk of chunkText(text, 6)) {
            controller.enqueue({ type: 'text-delta', id: textId, delta: chunk });
          }
          controller.enqueue({ type: 'text-end', id: textId });
        }
        for (let i = 0; i < (response.toolCalls ?? []).length; i++) {
          const tc = response.toolCalls![i]!;
          controller.enqueue({
            type: 'tool-call',
            toolCallId: tc.id ?? `mock-call-${this.calls.length}-${i}`,
            toolName: tc.name,
            input: JSON.stringify(tc.args),
          });
        }
        const promptTokens = response.promptTokens ?? 0;
        const completionTokens = response.completionTokens ?? text.length;
        controller.enqueue({
          type: 'finish',
          finishReason: buildFinishReason(response.finishReason ?? (response.toolCalls?.length ? 'tool-calls' : 'stop')),
          usage: buildUsage(promptTokens, completionTokens, response.cacheReadTokens, response.cacheWriteTokens),
        });
        controller.close();
      },
    });

    return { stream };
  }

  private record(options: LanguageModelV4CallOptions): void {
    this.lastCallOptions = options;
    this.calls.push({
      prompt: typeof options.prompt === 'string' ? truncatePrompt(options.prompt) : options.prompt,
      messages: Array.isArray(options.prompt) ? options.prompt.length : undefined,
      tools: Array.isArray(options.tools) ? options.tools.length : undefined,
      reasoning: options.reasoning,
    });
  }

  private takeResponse(): MockResponse {
    return this.queue.shift() ?? this.defaultResponse;
  }
}

/** Split a string into ~N chunks of roughly equal size. */
function chunkText(text: string, n: number): string[] {
  if (text.length === 0) return [];
  if (text.length <= n) return [text];
  const chunkSize = Math.ceil(text.length / n);
  const out: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    out.push(text.slice(i, i + chunkSize));
  }
  return out;
}

/** Trim a raw string prompt down to something safe for assertion logging. */
function truncatePrompt(prompt: string): string {
  return prompt.length > 200 ? prompt.slice(0, 200) + '…' : prompt;
}
