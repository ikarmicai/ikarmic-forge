import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from 'ink';

import { formatSteeringLine } from '@ikarmic/forge-core';
import type { AgentEvent, ApprovalRequest, ForgeConfigFile, ModelConfig } from '@ikarmic/forge-core';

import { Approval } from './components/Approval.js';
import { Footer } from './components/Footer.js';
import { Header } from './components/Header.js';
import { Stream } from './components/Stream.js';
import { ToolEvent } from './components/ToolEvent.js';
import { startAgent } from './runner.js';
import type { AgentConfig } from '@ikarmic/forge-core';

export interface AppProps {
  task: string;
  baseConfig: AgentConfig;
  model: ModelConfig;
  display?: ForgeConfigFile['display'];
  onResult: (result: {
    reason: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    iterations: number;
    finalText: string;
    costUsd?: number;
    costKnown?: boolean;
  }) => void;
  onError: (err: Error) => void;
}

interface ToolRecord {
  name: string;
  id: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  durationMs?: number;
  startedAt: number;
}

interface PendingApproval {
  request: ApprovalRequest;
  resolve: (approved: boolean) => void;
}

export function App({ task, baseConfig, model, display = {}, onResult, onError }: AppProps): React.ReactElement {
  const [stream, setStream] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [reasoningText, setReasoningText] = useState('');
  const [reasoningStreaming, setReasoningStreaming] = useState(false);
  const [tools, setTools] = useState<ToolRecord[]>([]);
  const [iteration, setIteration] = useState(0);
  const [maxIterations, setMaxIterations] = useState(baseConfig.maxIterations ?? 50);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [cachedInputTokens, setCachedInputTokens] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [steeringLine, setSteeringLine] = useState<string | undefined>(undefined);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [costUsd, setCostUsd] = useState<number | undefined>(undefined);
  const [redactedCount, setRedactedCount] = useState(0);
  const [cacheHits, setCacheHits] = useState(0);
  const [cacheMisses, setCacheMisses] = useState(0);

  const startedAtRef = useRef<number>(0);
  // Set by a `continuation` event: the next text_done carries only the
  // continued step's text, so keep the streamed whole instead of replacing it.
  const continuedRef = useRef(false);

  const hooks = useMemo(
    () => ({
      onEvent: (event: AgentEvent): void => {
        switch (event.type) {
          case 'iteration':
            setIteration(event.iteration);
            setMaxIterations(event.maxIterations);
            setStatus('running');
            break;
          case 'text_delta':
            setStreaming(true);
            setStream((prev) => prev + event.text);
            break;
          case 'text_done':
            setStreaming(false);
            if (continuedRef.current) {
              continuedRef.current = false;
            } else {
              setStream(event.text);
            }
            break;
          case 'continuation':
            continuedRef.current = true;
            break;
          case 'retry':
            // The step is asked again: what it streamed is not part of the answer.
            setStreaming(false);
            setStream('');
            setReasoningText('');
            break;
          case 'reasoning_delta':
            setReasoningStreaming(true);
            setReasoningText((prev) => prev + event.text);
            break;
          case 'reasoning_done':
            setReasoningStreaming(false);
            setReasoningText(event.text);
            break;
          case 'tool_call':
            setTools((prev) => [
              ...prev,
              { name: event.name, id: event.id, args: event.args, startedAt: Date.now() },
            ]);
            break;
          case 'tool_result':
            setTools((prev) =>
              prev.map((t) =>
                t.id === event.id
                  ? { ...t, result: event.result, isError: event.isError, durationMs: Date.now() - t.startedAt }
                  : t
              )
            );
            if (event.redacted !== undefined && event.redacted > 0) {
              setRedactedCount((c) => c + event.redacted!);
            }
            break;
          case 'usage':
            setInputTokens(event.inputTokens);
            setOutputTokens(event.outputTokens);
            setCachedInputTokens(event.cachedInputTokens ?? 0);
            break;
          case 'cost':
            setCostUsd(event.runningCostUsd);
            break;
          case 'cache_stats':
            setCacheHits(event.hits);
            setCacheMisses(event.misses);
            break;
          case 'steering':
            setSteeringLine(formatSteeringLine(event));
            break;
          case 'error':
            // Set status, but keep going: done event will fire
            setStatus('error');
            break;
          case 'done':
            setStatus(event.reason === 'error' ? 'error' : 'done');
            setReason(event.reason);
            setDurationMs(Date.now() - startedAtRef.current);
            break;
          case 'approval_requested':
            // not used: handled via approve callback below
            break;
        }
      },
      requestApproval: (request: ApprovalRequest): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
          setPendingApproval({ request, resolve });
        });
      },
    }),
    []
  );

  const handleApproval = useCallback(
    (approved: boolean): void => {
      if (pendingApproval) {
        pendingApproval.resolve(approved);
        setPendingApproval(null);
      }
    },
    [pendingApproval]
  );

  useEffect(() => {
    startedAtRef.current = Date.now();
    setStatus('running');
    const handle = startAgent({ baseConfig, task, hooks });

    handle.promise
      .then((res) => {
        onResult({
          reason: res.reason,
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          durationMs: res.durationMs,
          iterations: res.iterations,
          finalText: res.finalText,
          costUsd: res.costUsd,
          costKnown: res.costKnown,
        });
      })
      .catch((err: Error) => {
        setStatus('error');
        onError(err);
      });

    return () => handle.abort();
  }, [task, baseConfig, hooks, onResult, onError]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header
        model={model}
        iteration={iteration}
        maxIterations={maxIterations}
        status={status}
        auto={baseConfig.auto ?? false}
      />
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color="gray">┌─ task</Text>
        </Box>
        <Box marginLeft={2}>
          <Text>{task}</Text>
        </Box>
      </Box>
      {steeringLine && (
        <Box marginLeft={2}>
          <Text dimColor>{steeringLine}</Text>
        </Box>
      )}
      {reasoningText && display.showReasoning !== false && (
        <Stream text={reasoningText} streaming={reasoningStreaming} label="reasoning" />
      )}
      {stream && <Stream text={stream} streaming={streaming} />}
      {tools.map((t) => (
        <ToolEvent
          key={t.id}
          name={t.name}
          args={t.args}
          {...(t.result !== undefined ? { result: t.result } : {})}
          {...(t.isError !== undefined ? { isError: t.isError } : {})}
          {...(t.durationMs !== undefined ? { durationMs: t.durationMs } : {})}
          pending={t.result === undefined}
          detail={display.detail ?? 'compact'}
        />
      ))}
      {pendingApproval && (
        <Approval request={pendingApproval.request} onResolve={handleApproval} />
      )}
      {status === 'done' || status === 'error' ? (
        <Footer
          inputTokens={inputTokens}
          outputTokens={outputTokens}
          {...(cachedInputTokens > 0 ? { cachedInputTokens } : {})}
          durationMs={durationMs}
          iteration={iteration}
          {...(costUsd !== undefined ? { costUsd } : {})}
          {...(redactedCount > 0 ? { redacted: redactedCount } : {})}
          {...(baseConfig.cacheSize !== 0 ? { cacheHits, cacheMisses } : {})}
          {...(reason ? { reason } : {})}
        />
      ) : null}
    </Box>
  );
}
