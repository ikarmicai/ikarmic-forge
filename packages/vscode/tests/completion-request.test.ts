/**
 * RB-63: about one inline completion in ten from MiniMax-M3 came back empty. The model reasons inline (`<think>`)
 * and sometimes needs more than the 512-token cap, so the reply ended inside its thinking and was rightly treated as
 * no answer (RB-1). The request now asks for no reasoning, and a reply cut off inside its thinking is asked once more
 * with a larger cap. Measured: 2 of 20 over 512 tokens without the option, 0 of 20 with it.
 */
import { describe, expect, it } from 'vitest';

import { requestCompletion } from '../src/completion-helpers.js';

type Reply = { text: string; finish: 'stop' | 'length' };
function fakeModel(replies: Reply[]) {
  const calls: Array<{ maxOutputTokens?: number; reasoning?: unknown }> = [];
  const model = {
    specificationVersion: 'v4',
    provider: 'fake',
    modelId: 'fake',
    supportedUrls: {},
    doGenerate: async (opts: { maxOutputTokens?: number; reasoning?: unknown }) => {
      calls.push({ maxOutputTokens: opts.maxOutputTokens, reasoning: opts.reasoning });
      const r = replies.shift()!;
      return {
        content: [{ type: 'text', text: r.text }],
        finishReason: { unified: r.finish, raw: r.finish },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
        warnings: [],
      };
    },
    doStream: async () => {
      throw new Error('not used');
    },
  };
  return { model: model as never, calls };
}

const ask = (model: never) => requestCompletion({ model, languageId: 'javascript', prefix: 'return a', suffix: '', maxTokens: 512 });

describe('requestCompletion', () => {
  it('asks the model not to reason', async () => {
    const { model, calls } = fakeModel([{ text: ' + b;', finish: 'stop' }]);
    const r = await ask(model);
    expect(r.text).toBe(' + b;');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.reasoning).toBe('none');
    expect(calls[0]!.maxOutputTokens).toBe(512);
  });

  it('asks once more, with a larger cap, when the reply was cut off inside its thinking', async () => {
    const { model, calls } = fakeModel([
      { text: '<think>the cursor is after a, so', finish: 'length' },
      { text: '<think>short</think> + b;', finish: 'stop' },
    ]);
    const r = await ask(model);
    expect(calls.map((c) => c.maxOutputTokens)).toEqual([512, 2048]);
    expect(r.text).toContain('+ b;');
  });

  it('does not ask again when the model simply had nothing to add', async () => {
    const { model, calls } = fakeModel([{ text: '', finish: 'stop' }]);
    await ask(model);
    expect(calls).toHaveLength(1);
  });
});
