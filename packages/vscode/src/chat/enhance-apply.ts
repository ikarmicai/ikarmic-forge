/**
 * Whether an Enhance-prompt reply may replace the composer text. The box stays editable while the
 * request runs, so the reply is applied only when the box still holds the draft that was sent.
 * Pure and bundled into the chat page through webview-lib.ts.
 */
export function shouldApplyEnhanced(sentDraft: string, currentText: string, reply: unknown): boolean {
  return typeof reply === 'string' && reply.trim() !== '' && reply !== sentDraft && currentText === sentDraft;
}
