import * as vscode from 'vscode';

import { generateText } from 'ai';

import { assertProviderAllowed, createLanguageModel, getOrgPolicy } from '@ikarmic/forge-core';
import type { CredentialStore } from '@ikarmic/forge-core';

import {
  buildPrompt,
  isInsideStringOrComment,
  sanitize,
  shouldSuppressAt,
} from './completion-helpers.js';
import { loadRuntimeConfig } from './runtime-config.js';
import { readConfig, resolveCompletionModel } from './config.js';
import {
  TELEMETRY_ACCEPT_COMMAND,
  TELEMETRY_REJECT_COMMAND,
  type CompletionTelemetry,
} from './telemetry.js';

const COMPLETION_SYSTEM_PROMPT = `You are an inline code completion engine. Continue the user's code exactly where they stopped.

Rules:
- Output ONLY the completion text. No prose, no markdown, no code fences, no commentary.
- Match the surrounding code's indentation, style, and language.
- Keep completions concise: prefer a single line when a one-line answer is unambiguous; produce multi-line output only when the cursor is clearly inside a block (function body, multi-statement list, nested structure, etc.).
- Stop at a natural boundary: end of statement, end of line, closing brace, or blank line. Do not over-generate.
- Never repeat the prefix. Never include the suffix.
- If the surrounding code is unclear, output nothing.`;

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
    private readonly credentialStore?: CredentialStore
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
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

    if (shouldSuppressAt(prefix, position.character)) return undefined;
    if (isInsideStringOrComment(prefix, document.languageId)) return undefined;

    let model;
    try {
      cfg = await loadRuntimeConfig(this.credentialStore);
      model = resolveCompletionModel(cfg);
      // Inline completions call the model directly (not through Agent), so enforce the org policy here too.
      assertProviderAllowed(model.provider, getOrgPolicy()?.policy);
    } catch {
      return undefined;
    }

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
      const { text } = await generateText({
        model: lm,
        system: COMPLETION_SYSTEM_PROMPT,
        prompt: buildPrompt(languageId, prefix, suffix),
        abortSignal: controller.signal,
        maxOutputTokens: cfg.completionMaxTokens,
        temperature: 0.2,
      });
      if (token.isCancellationRequested) return undefined;
      const cleaned = sanitize(text);
      if (!cleaned) return undefined;

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
      if (!(err as Error).message?.includes('aborted')) {
        console.debug('forge completion error:', err);
      }
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
