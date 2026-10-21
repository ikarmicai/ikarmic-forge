import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';

import type { ApprovalRequest } from '@ikarmic/forge-core';

export interface ApprovalProps {
  request: ApprovalRequest;
  /** Resolves the promise. After resolution, the parent will unmount this. */
  onResolve: (approved: boolean) => void;
}

export function Approval({ request, onResolve }: ApprovalProps): React.ReactElement {
  const [answered, setAnswered] = useState<null | 'y' | 'n'>(null);

  useInput((input, key) => {
    if (answered) return;
    const i = input.toLowerCase();
    if (i === 'y' || i === 'yes') {
      setAnswered('y');
      onResolve(true);
    } else if (i === 'n' || i === 'no' || key.escape || (key.ctrl && input === 'c')) {
      setAnswered('n');
      onResolve(false);
    }
  });

  const argPreview = JSON.stringify(request.args);
  const argSummary = argPreview.length > 200 ? argPreview.slice(0, 197) + '...' : argPreview;
  const previewLines = request.preview ? request.preview.split(/\r?\n/).slice(0, 14) : [];

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
      <Box>
        <Text color={request.destructive ? 'red' : 'yellow'} bold>
          ⚠ approval required
        </Text>
        <Text> · </Text>
        <Text bold>{request.name}</Text>
        {request.destructive && (
          <>
            <Text> · </Text>
            <Text color="red" bold>destructive</Text>
          </>
        )}
      </Box>
      <Box marginLeft={2} marginTop={1}>
        <Text color="gray">{argSummary}</Text>
      </Box>
      {previewLines.length > 0 && (
        <Box marginLeft={2} marginTop={1} flexDirection="column">
          {previewLines.map((line, i) => (
            <Text key={i} color={line.startsWith('+') ? 'green' : line.startsWith('-') ? 'red' : 'gray'}>
              {line}
            </Text>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        {answered === null ? (
          <Text>
            Allow? <Text color="green" bold>Y</Text>
            <Text>es / </Text>
            <Text color="red" bold>N</Text>
            <Text>o (esc)</Text>
          </Text>
        ) : (
          <Text color={answered === 'y' ? 'green' : 'red'}>
            {answered === 'y' ? '✓ approved' : '✗ denied'}
          </Text>
        )}
      </Box>
    </Box>
  );
}
