import React from 'react';
import { Box, Text } from 'ink';

export interface FooterProps {
  inputTokens: number;
  outputTokens: number;
  /** Prompt tokens served from the provider cache; shown when > 0. */
  cachedInputTokens?: number;
  durationMs: number;
  iteration: number;
  reason?: string;
  /**
   * Running USD cost. When undefined the footer omits the cost chip; the
   * UI only passes this when pricing was resolved.
   */
  costUsd?: number;
  /** When cost is shown, total redactions so far in this session. */
  redacted?: number;
  /** Cache stats: only shown when verbose. */
  cacheHits?: number;
  cacheMisses?: number;
}

function formatNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'k';
  return (n / 1_000_000).toFixed(2) + 'M';
}

export function Footer(props: FooterProps): React.ReactElement {
  const { inputTokens, outputTokens, cachedInputTokens, durationMs, iteration, reason, costUsd, redacted, cacheHits, cacheMisses } = props;
  const seconds = (durationMs / 1000).toFixed(1);
  const costLabel =
    costUsd === undefined
      ? null
      : costUsd === 0
      ? '$0.00'
      : costUsd < 0.01
      ? '$' + costUsd.toFixed(4)
      : costUsd < 1
      ? '$' + costUsd.toFixed(3)
      : '$' + costUsd.toFixed(2);
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="row" justifyContent="space-between">
      <Box>
        <Text color="gray">tokens: </Text>
        <Text>
          ↑{formatNumber(inputTokens)} ↓{formatNumber(outputTokens)}
          {cachedInputTokens !== undefined && cachedInputTokens > 0 ? ` (${formatNumber(cachedInputTokens)} cached)` : ''}
        </Text>
        {costLabel !== null && (
          <>
            <Text color="gray"> · </Text>
            <Text color="green">{costLabel}</Text>
          </>
        )}
        {redacted !== undefined && redacted > 0 && (
          <>
            <Text color="gray"> · </Text>
            <Text color="red">🔒 {redacted}</Text>
          </>
        )}
        {cacheHits !== undefined && (cacheHits > 0 || (cacheMisses !== undefined && cacheMisses > 0)) && (
          <>
            <Text color="gray"> · </Text>
            <Text color="cyan">
              cache: {cacheHits}H/{cacheMisses ?? 0}M
            </Text>
          </>
        )}
        <Text color="gray"> · </Text>
        <Text>
          {seconds}s
        </Text>
        <Text color="gray"> · </Text>
        <Text>
          steps: {iteration}
        </Text>
      </Box>
      {reason && (
        <Box>
          <Text color="gray">finished: </Text>
          <Text color={reason === 'completed' ? 'green' : 'yellow'}>{reason}</Text>
        </Box>
      )}
    </Box>
  );
}
