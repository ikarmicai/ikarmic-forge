import React from 'react';
import { Box, Text } from 'ink';

import { getUnifiedDiffText, summarizeResult, type DetailLevel } from '../tool-display.js';

export interface ToolEventProps {
  name: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  durationMs?: number;
  pending?: boolean;
  detail?: DetailLevel;
}

function diffLineColor(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'gray';
  if (line.startsWith('@@')) return 'cyan';
  if (line.startsWith('+')) return 'green';
  if (line.startsWith('-')) return 'red';
  return 'gray';
}

export const ToolEvent = React.memo(function ToolEvent(props: ToolEventProps): React.ReactElement {
  const { name, args, result, isError, durationMs, pending, detail = 'compact' } = props;
  const argSummary = summarizeArgs(args);
  const diffText = pending ? null : getUnifiedDiffText(name, args, result);
  const resultSummary = pending || diffText ? undefined : summarizeResult(result, isError, detail);

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={1}>
      <Box>
        <Text color={isError ? 'red' : 'blue'} bold>
          {isError ? '✗' : pending ? '◌' : '✓'} {name}
        </Text>
        <Text color="gray">{argSummary}</Text>
        {durationMs !== undefined && (
          <Text color="gray"> · {durationMs}ms</Text>
        )}
      </Box>
      {diffText && (
        <Box flexDirection="column" marginLeft={2}>
          {diffText.replace(/\n$/, '').split('\n').map((line, i) => (
            <Text key={i} color={diffLineColor(line)}>
              {line}
            </Text>
          ))}
        </Box>
      )}
      {resultSummary !== undefined && (
        <Box marginLeft={2}>
          <Text color={isError ? 'red' : 'gray'}>{resultSummary}</Text>
        </Box>
      )}
    </Box>
  );
});

function summarizeArgs(args: unknown): string {
  if (args === undefined || args === null) return '()';
  if (typeof args !== 'object') return `(${String(args)})`;
  const obj = args as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return '()';
  const parts = keys.slice(0, 3).map((k) => {
    const v = obj[k];
    const vs = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v);
    const truncated = vs.length > 80 ? vs.slice(0, 77) + '...' : vs;
    return `${k}=${truncated}`;
  });
  if (keys.length > 3) parts.push(`+${keys.length - 3} more`);
  return `(${parts.join(' ')})`;
}
