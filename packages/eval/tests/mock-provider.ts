/**
 * Local copy of the core mock provider. Lives in the eval package's tests so
 * we can drive the agent with scripted tool calls + text responses without
 * touching the real AI SDK network path.
 *
 * Mirrors core's mock provider (kept in sync: small, easy).
 */
import type {
  LanguageModelV4,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';

export interface MockToolCallSpec {
  id?: string;
  name: string;
  args: unknown;
}

export interface MockResponse {
  text?: string;
  toolCalls?: MockToolCallSpec[];
  finishReason?: 'stop' | 'tool-calls' | 'length' | 'content-filter' | 'error' | 'other';
  promptTokens?: number;
  completionTokens?: number;
}

function buildUsage(promptTokens: number, completionTokens: number) {
  return {
    inputTokens: { total: promptTokens, noCache: promptTokens, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: completionTokens, text: completionTokens, reasoning: undefined },
  };
}

function buildFinishReason(reason: NonNullable<MockResponse['finishReason']>) {
  return { unified: reason, raw: undefined };
}

export class MockLanguageModelV1 implements LanguageModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'mock';
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};
  defaultResponse: MockResponse = { text: 'mock: done', finishReason: 'stop' };
  readonly calls: unknown[] = [];
  private queue: MockResponse[] = [];

  constructor(modelId = 'mock-model') {
    this.modelId = modelId;
  }

  pushResponse(response: MockResponse): this {
    this.queue.push(response);
    return this;
  }

  pushResponses(responses: MockResponse[]): this {
    for (const r of responses) this.queue.push(r);
    return this;
  }

  async doGenerate(): Promise<{
    content: Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: string }>;
    finishReason: ReturnType<typeof buildFinishReason>;
    usage: ReturnType<typeof buildUsage>;
    warnings: [];
  }> {
    const r = this.queue.shift() ?? this.defaultResponse;
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
      usage: buildUsage(promptTokens, completionTokens),
      warnings: [],
    };
  }

  async doStream(): Promise<{
    stream: ReadableStream<LanguageModelV4StreamPart>;
  }> {
    const response = this.queue.shift() ?? this.defaultResponse;
    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start: (controller) => {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        const text = response.text ?? '';
        if (text) {
          const textId = `text-${this.calls.length}`;
          controller.enqueue({ type: 'text-start', id: textId });
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
          usage: buildUsage(promptTokens, completionTokens),
        });
        controller.close();
      },
    });
    return { stream };
  }
}

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
