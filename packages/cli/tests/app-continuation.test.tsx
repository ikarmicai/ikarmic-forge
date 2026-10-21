import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { App } from '../src/app.js';
import { MockLanguageModelV1 } from './mock-provider.js';

describe('App with a continued reply', () => {
  it('keeps both parts of a reply that was continued after the length limit', async () => {
    const mock = new MockLanguageModelV1('m');
    mock.pushResponse({ text: 'FIRST-PART ', finishReason: 'length' });
    mock.pushResponse({ text: 'SECOND-PART', finishReason: 'stop' });
    let done!: () => void;
    const finished = new Promise<void>((r) => (done = r));
    const { lastFrame } = render(
      <App
        task="t"
        model={{ provider: 'openai', model: 'm' }}
        baseConfig={{ model: { provider: 'openai', model: 'm' }, modelFactory: (() => mock) as never, auto: true, disableMemory: true }}
        onResult={() => done()}
        onError={() => done()}
      />
    );
    await finished;
    await new Promise((r) => setTimeout(r, 50));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('SECOND-PART');
    expect(frame).toContain('FIRST-PART');
  });
});
