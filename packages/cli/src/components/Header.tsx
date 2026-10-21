import React from 'react';
import { Box, Text } from 'ink';

import { formatModelId } from '@ikarmic/forge-core';
import type { ModelConfig } from '@ikarmic/forge-core';

export interface HeaderProps {
  model: ModelConfig;
  iteration: number;
  maxIterations: number;
  status: 'idle' | 'running' | 'done' | 'error';
  auto: boolean;
}

export function Header(props: HeaderProps): React.ReactElement {
  const { model, iteration, maxIterations, status, auto } = props;
  const statusColor =
    status === 'running' ? 'yellow' : status === 'done' ? 'green' : status === 'error' ? 'red' : 'gray';
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="row" justifyContent="space-between">
      <Box>
        <Text color="cyan" bold>
          ⚒ forge
        </Text>
        <Text> · </Text>
        <Text color="magenta">{formatModelId(model)}</Text>
      </Box>
      <Box>
        <Text color={auto ? 'red' : 'green'} bold>
          {auto ? 'AUTO' : 'INTERACTIVE'}
        </Text>
        <Text> · </Text>
        <Text>
          step {iteration}/{maxIterations}
        </Text>
        <Text> · </Text>
        <Text color={statusColor}>{status.toUpperCase()}</Text>
      </Box>
    </Box>
  );
}
