import * as vscode from 'vscode';

import { generateText } from 'ai';

import { assertProviderAllowed, createLanguageModel, getOrgPolicy } from '@ikarmic/forge-core';
import type { CredentialStore } from '@ikarmic/forge-core';

import { CompletionState, completionGate } from './completion-controls.js';
import {
  COMPLETION_SYSTEM_PROMPT,
  buildPrompt,
  isInsideStringOrComment,
  sanitize,
  suppressAtCursor,
} from './completion-helpers.js';
import { loadRuntimeConfig } from './runtime-config.js';
import { readConfig, resolveCompletionModel } from './config.js';
import {
  TELEMETRY_ACCEPT_COMMAND,
  TELEMETRY_REJECT_COMMAND,
  type CompletionTelemetry,
} from './telemetry.js';

/**
 * Inline completion provider. Debounces requests, aborts in-flight ones when
 * the user keeps typing, suppresses low-signal positions (mid-word, inside
 * strings/comments), and, when telemetry is enabled, records accept /
 * reject rates via InlineCompletionItem.command.
 */
export class ForgeInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private debounceTimer: NodeJS.Timeout | undefined;
  private activeController: AbortController | undefined;
  /**
   * True from the moment a completion is shown until either it's accepted
   * (see {@link markAccepted}) or a new request supersedes it: at which
   * point the superseded one is counted as dismissed. This is the only
   * "rejected" signal available: VS Code's stable `InlineCompletionItemProvider`
   * API (as pinned via @types/vscode ^1.85.0) has no explicit reject/dismiss
   * callback, so we infer it from "shown, then superseded without accept".
   */
  private awaitingResolution = false;

  constructor(
    private readonly getDocumentContext: () => { uri: vscode.Uri; languageId: string } | null,
    private readonly getTelemetry: () => CompletionTelemetry | null,
    private readonly getTelemetryEnabled: () => boolean,
    private readonly credentialStore?: CredentialStore,
    private readonly controls: CompletionState = new CompletionState(),
    private readonly onUsage: () => void = () => {},
    /** Why each request ended (Output > Forge): model answers at info, skips at debug. Every early return used to be silent. */
    private readonly log?: Pick<vscode.LogOutputChannel, 'debug' | 'info' | 'warn'>
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null | undefined> {
    if (token.isCancellationRequested) return undefined;

    // This new request supersedes whatever suggestion was last shown. If
    // that one was never accepted (markAccepted() would have cleared the
    // flag), count it as dismissed.
    if (this.awaitingResolution) {
      this.awaitingResolution = false;
      if (this.getTelemetryEnabled()) {
        void vscode.commands.executeCommand(TELEMETRY_REJECT_COMMAND);
      }
    }

    let cfg = readConfig();
    const gate = completionGate({
      enabled: cfg.completionEnabled,
      automatic: cfg.completionAutomatic,
      snoozedUntil: this.controls.snoozedUntil,
      now: Date.now(),
      manual: context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke,
    });
    if (gate !== 'run') {
      this.log?.debug(`completion: skipped (${gate})`);
      return undefined;
    }
    const debounceMs = Math.max(0, cfg.completionDebounceMs);

    if (debounceMs > 0) {
      await new Promise<void>((resolve) => {
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = undefined;
          resolve();
        }, debounceMs);
        const dispose = token.onCancellationRequested(() => {
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
          }
          dispose.dispose();
          resolve();
        });
      });
      if (token.isCancellationRequested) return undefined;
    }

    const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));

    if (suppressAtCursor(prefix)) {
      this.log?.debug('completion: skipped (cursor inside a word)');
      return undefined;
    }
    if (isInsideStringOrComment(prefix, document.languageId)) {
      this.log?.debug('completion: skipped (inside a string or comment)');
      return undefined;
    }

    let model;
    try {
      cfg = await loadRuntimeConfig(this.credentialStore);
      model = resolveCompletionModel(cfg);
      // Inline completions call the model directly (not through Agent), so enforce the org policy here too.
      assertProviderAllowed(model.provider, getOrgPolicy()?.policy);
    } catch (err) {
      this.log?.warn(`completion: no model to ask: ${(err as Error).message}`);
      return undefined;
    }
    const started = Date.now();

    this.activeController?.abort();
    const controller = new AbortController();
    this.activeController = controller;

    const languageId = document.languageId;
    const lm = createLanguageModel(model);
    const suffix = document.getText(
      new vscode.Range(position, new vscode.Position(document.lineCount, document.lineAt(document.lineCount - 1).text.length))
    );

    try {
      // think-tags: handled in sanitize() (completion-helpers.ts), which strips <think> blocks.
      const { text, usage } = await generateText({
        model: lm,
        system: COMPLETION_SYSTEM_PROMPT,
        prompt: buildPrompt(languageId, prefix, suffix),
        abortSignal: controller.signal,
        maxOutputTokens: cfg.completionMaxTokens,
        temperature: 0.2,
      });
      this.controls.usage.add({ inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens });
      this.onUsage();
      const ms = Date.now() - started;
      if (token.isCancellationRequested) {
        this.log?.info(`completion: answer from ${model.model} came after the editor moved on (${ms} ms)`);
        return undefined;
      }
      const cleaned = sanitize(text);
      if (!cleaned) {
        this.log?.info(`completion: ${model.model} answered nothing usable in ${ms} ms (${usage?.outputTokens ?? '?'} tokens)`);
        return undefined;
      }
      this.log?.info(`completion: ${model.model} suggested ${cleaned.length} characters in ${ms} ms`);

      const telemetry = this.getTelemetryEnabled() ? this.getTelemetry() : null;
      telemetry?.recordShown();
      this.awaitingResolution = !!telemetry;

      const item = new vscode.InlineCompletionItem(cleaned, new vscode.Range(position, position));

      // Wire accept via InlineCompletionItem.command. When telemetry is off,
      // omit the command entirely: VS Code's default accept path doesn't
      // fire any callback for us, and we don't want a no-op command in the
      // command palette.
      if (telemetry) {
        item.command = {
          command: TELEMETRY_ACCEPT_COMMAND,
          title: 'Forge: accept completion',
        };
      }

      return [item];
    } catch (err) {
      if ((err as Error).message?.includes('aborted')) this.log?.debug('completion: cancelled (you kept typing)');
      else this.log?.warn(`completion: request failed: ${(err as Error).message}`);
      return undefined;
    } finally {
      if (this.activeController === controller) {
        this.activeController = undefined;
      }
    }
  }

  /**
   * Called by the `TELEMETRY_ACCEPT_COMMAND` handler (extension.ts) when the
   * user accepts the currently-shown suggestion, so the next request doesn't
   * also count it as dismissed.
   */
  markAccepted(): void {
    this.awaitingResolution = false;
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.activeController?.abort();
  }
}
