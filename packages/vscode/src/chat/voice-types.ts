/**
 * Shared types for the voice input feature. Lives in its own module so the
 * pure controller logic in {@link voice-input} can be unit-tested without
 * pulling in any DOM or VS Code types. The webview code (in {@link html.ts})
 * and the extension host (commands/extension) share these shapes.
 *
 * The actual `SpeechRecognition` type is declared on a local interface below
 * because:
 *   1. TypeScript's lib.dom doesn't include it (it's a Chromium extension).
 *   2. WebKit ships `webkitSpeechRecognition` instead.
 *   3. We want to construct mocks in tests that match the runtime shape.
 */

/** Configuration for the voice input feature, mirrored from VS Code settings. */
export interface VoiceConfig {
  /** Master kill-switch. When false, the mic button is hidden. */
  enabled: boolean;
  /**
   * BCP-47 language code (`en-US`, `fr-FR`, etc.). Empty string means
   * "let the runtime pick": typically `navigator.language`.
   */
  language: string;
  /**
   * If true, send the message automatically after the user stops speaking
   * and the transcript finalizes. Off by default: typing wins.
   */
  autoSubmit: boolean;
  /**
   * If true, keep listening after each final result (one long session).
   * If false, end after the first utterance (default: safer UX).
   */
  continuous: boolean;
  /**
   * If true, surface interim results as the user speaks (default). If
   * false, only the final transcript is delivered.
   */
  interimResults: boolean;
}

/** Lifecycle states the webview UI cares about. */
export type VoiceState = 'idle' | 'starting' | 'listening' | 'stopping' | 'error' | 'unsupported';

/**
 * Subset of the W3C Web Speech API `SpeechRecognitionErrorCode` enum we
 * actually handle. Anything else falls through to `'unknown'`.
 *
 *  - `not-allowed`: user denied the microphone permission prompt.
 *  - `no-speech`:  silence for too long; usually transient.
 *  - `audio-capture`: no microphone / hardware fault.
 *  - `network`: STT backend unreachable (Chrome ships audio to Google).
 *  - `aborted`: we (or the user) called `.abort()`.
 *  - `language-not-supported` / `service-not-allowed`: rare but documented.
 */
export type VoiceErrorCode =
  | 'not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'aborted'
  | 'language-not-supported'
  | 'service-not-allowed'
  | 'unknown';

/** Payload passed from the webview back to the extension host. */
export type VoiceMessage =
  | { type: 'voice_started' }
  | { type: 'voice_stopped'; reason: 'user' | 'silence' | 'error' }
  | { type: 'voice_error'; code: VoiceErrorCode; message: string }
  | { type: 'voice_unsupported' };

/**
 * Minimal shape of `SpeechRecognition` we depend on. Both the standard and
 * the webkit-prefixed constructors produce an instance with this shape.
 *
 * Kept narrow on purpose: we don't try to wrap the entire API surface,
 * just what `voice-input.ts` calls and what tests need to mock.
 */
export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((ev: Event) => void) | null;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((ev: Event) => void) | null;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    readonly length: number;
    isFinal: boolean;
    0: { transcript: string; confidence: number };
  }>;
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

/** Constructor signature: matches `new SpeechRecognition()` in browsers. */
export interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

/** Subset of the global object the controller touches. Lets us inject mocks. */
export interface VoiceRuntime {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  navigator?: { language?: string };
}