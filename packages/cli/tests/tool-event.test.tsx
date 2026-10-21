import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { ToolEvent } from '../src/components/ToolEvent.js';

describe('ToolEvent', () => {
  it('renders a colored diff for edit_file instead of the generic result dump', () => {
    const { lastFrame } = render(
      <ToolEvent name="edit_file" args={{ old_text: 'foo', new_text: 'bar' }} result={{ path: 'x', replacements: 1, bytes: 3 }} />
    );
    const frame = lastFrame();
    expect(frame).toContain('-foo');
    expect(frame).toContain('+bar');
  });

  it('falls back to the generic summary for a non-diff tool', () => {
    const { lastFrame } = render(<ToolEvent name="read_file" args={{ path: 'x' }} result="file contents" />);
    expect(lastFrame()).toContain('file contents');
  });

  it('respects detail="full" by not truncating long output', () => {
    const longResult = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const { lastFrame } = render(<ToolEvent name="read_file" args={{}} result={longResult} detail="full" />);
    expect(lastFrame()).not.toContain('truncated');
    expect(lastFrame()).toContain('line 19');
  });
});
