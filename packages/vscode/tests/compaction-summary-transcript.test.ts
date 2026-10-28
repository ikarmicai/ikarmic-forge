/**
 * RB-56: compaction's summary is a user message now (Gemini and Bedrock refuse a system message mid-conversation).
 * It must not appear in a reopened chat, or in prompt history, as if the person had typed it.
 */
import { describe, expect, it } from 'vitest';

import { COMPACTION_SUMMARY_PREFIX } from '@ikarmic/forge-core';

import { transcriptFromMessages } from '../src/chat/history-protocol.js';

describe('a reopened chat after compaction', () => {
  it('does not show the summary as something the person typed', () => {
    const items = transcriptFromMessages([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'fix the login bug' },
      { role: 'user', content: `${COMPACTION_SUMMARY_PREFIX} (8 messages), written by Forge to save context. It is not a new request.]\n\n## Goal\n...` },
      { role: 'assistant', content: 'Done.' },
    ]);
    expect(items).toEqual([
      { role: 'user', text: 'fix the login bug' },
      { role: 'assistant', text: 'Done.' },
    ]);
  });
});
