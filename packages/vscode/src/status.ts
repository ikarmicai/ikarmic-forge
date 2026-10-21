import * as vscode from 'vscode';

import { formatModelId } from '@ikarmic/forge-core';
import type { ModelConfig } from '@ikarmic/forge-core';

export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private model: ModelConfig | null = null;
  private state: 'idle' | 'running' | 'error' = 'idle';
  /** Optional extra tooltip line (e.g. completion telemetry summary). */
  private completionNote: string | null = null;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'forge.openChat';
    this.item.text = '$(tools) Forge';
    this.item.tooltip = 'IKarmic AI Forge: click to open chat';
    this.item.show();
  }

  setModel(model: ModelConfig | null): void {
    this.model = model;
    this.refresh();
  }

  setState(state: 'idle' | 'running' | 'error'): void {
    this.state = state;
    this.refresh();
  }

  /** Append a second line to the tooltip (used for telemetry summary). */
  setCompletionTooltip(note: string): void {
    this.completionNote = note;
    this.refresh();
  }

  /** Drop any appended telemetry line. */
  clearCompletionTooltip(): void {
    this.completionNote = null;
    this.refresh();
  }

  dispose(): void {
    this.item.dispose();
  }

  private refresh(): void {
    const modelText = this.model ? formatModelId(this.model) : 'no provider';
    const icon = this.state === 'running' ? '$(loading~spin)' : this.state === 'error' ? '$(error)' : '$(tools)';
    this.item.text = `${icon} Forge: ${modelText}`;
    const base =
      this.state === 'running'
        ? 'Forge is running a task: click to open chat'
        : `Forge (${modelText}): click to open chat`;
    this.item.tooltip = this.completionNote ? `${base}\n\n${this.completionNote}` : base;
  }
}
