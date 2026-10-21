import React from 'react';
import { Box, Text } from 'ink';

export interface StreamProps {
  text: string;
  /** True while tokens are still arriving (renders a cursor). */
  streaming: boolean;
  /** Defaults to "assistant": pass "reasoning" for the reasoning-trace block. */
  label?: string;
}

export function Stream({ text, streaming, label = 'assistant' }: StreamProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">┌─ {label}</Text>
      <Box marginLeft={2} flexDirection="row">
        <Text>
          {text}
          {streaming ? '▌' : ''}
        </Text>
      </Box>
    </Box>
  );
}
